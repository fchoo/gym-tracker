#!/usr/bin/env python3
"""Deterministic unit tests for the Linux pidfd ownership transaction.

These host mocks prove helper ordering and fail-closed behavior. They are not
native application acceptance evidence and never signal a live process.
"""

from __future__ import annotations

import contextlib
import errno
import importlib.util
import io
import os
from pathlib import Path
import runpy
import sys
import time
import unittest


HELPER_PATH = Path(__file__).with_name("v12-linux-pidfd-signal.py")
TOKEN = b"a" * 64


def load_helper():
    specification = importlib.util.spec_from_file_location("v12_pidfd_helper", HELPER_PATH)
    if specification is None or specification.loader is None:
        raise RuntimeError("pidfd_helper_load_failed")
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


class _FakeOS:
    O_RDONLY = 0
    O_CLOEXEC = 0

    def __init__(self, events, identities, open_error=None, close_error=None):
        self.events = events
        self.identities = identities
        self.open_error = open_error
        self.close_error = close_error

    def pidfd_open(self, pid, flags):
        self.events.append(("open", pid, flags))
        if self.open_error == pid:
            raise OSError(errno.ESRCH, "gone")
        fd = pid + 1_000
        self.identities[fd] = f"pinned-{pid}"
        return fd

    def close(self, fd):
        self.events.append(("close", fd))
        if self.close_error == fd:
            raise OSError(errno.EBADF, "closed")


class _FakeSignal:
    SIGTERM = 15
    SIGKILL = 9

    def __init__(self, events, identities, failures=None):
        self.events = events
        self.identities = identities
        self.failures = failures or {}

    def pidfd_send_signal(self, fd, selected_signal, info, flags):
        self.events.append(("signal", self.identities[fd], selected_signal, info, flags))
        failure = self.failures.get(fd)
        if failure is not None:
            raise failure


class _Stdin:
    def __init__(self, content):
        self.buffer = io.BytesIO(content)


class PidfdSignalTests(unittest.TestCase):
    def setUp(self):
        self.helper = load_helper()

    def _run_main(self, pids=(701, 702), validation=None, *, open_error=None,
                  signal_failures=None, close_error=None):
        events = []
        identities = {}
        fake_os = _FakeOS(events, identities, open_error=open_error, close_error=close_error)
        fake_signal = _FakeSignal(events, identities, failures=signal_failures)
        self.helper.os = fake_os
        self.helper.signal = fake_signal
        self.helper._parse = lambda _arguments: (fake_signal.SIGTERM, 1_000, list(pids), TOKEN)
        self.helper._has_exact_token = validation or (lambda *_arguments: True)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = self.helper.main(["helper"])
        return status, events, identities, output.getvalue()

    def test_bounded_read_returns_content_rejects_overflow_timeout_and_closes(self):
        opened = []
        closed = []
        reads = iter([b"abc", b""])
        self.helper.os.open = lambda path, flags: opened.append((path, flags)) or 17
        self.helper.os.read = lambda descriptor, size: next(reads)
        self.helper.os.close = lambda descriptor: closed.append(descriptor)
        deadline = time.monotonic() + 1
        self.assertEqual(self.helper._read_bounded("/safe", 3, deadline), b"abc")
        self.assertEqual(closed, [17])

        self.helper.os.read = lambda descriptor, size: b"abcd"
        with self.assertRaises(ValueError):
            self.helper._read_bounded("/too-large", 3, deadline)

        with self.assertRaises(TimeoutError):
            self.helper._read_bounded("/expired", 3, time.monotonic() - 1)
        self.assertEqual(len(closed), 3)

    def test_pidfd_info_and_token_validation_require_stable_handle_before_and_after_read(self):
        self.helper._read_bounded = lambda path, maximum, deadline: b"flags:\t1\nPid:\t701\n"
        self.assertEqual(self.helper._pidfd_pid(17, time.monotonic() + 1), 701)
        self.helper._read_bounded = lambda path, maximum, deadline: b"Pid:\tnope\n"
        self.assertEqual(self.helper._pidfd_pid(17, time.monotonic() + 1), -1)
        self.helper._read_bounded = lambda path, maximum, deadline: b"flags:\t1\n"
        self.assertEqual(self.helper._pidfd_pid(17, time.monotonic() + 1), -1)

        calls = []
        self.helper._pidfd_pid = lambda fd, deadline: calls.append(fd) or (701 if len(calls) != 2 else 999)
        self.helper._read_bounded = lambda path, maximum, deadline: b"V12_POSIX_PROCESS_OWNERSHIP=" + TOKEN + b"\0"
        self.assertFalse(self.helper._has_exact_token(701, 17, TOKEN, time.monotonic() + 1))
        self.assertEqual(calls, [17, 17])
        self.helper._pidfd_pid = lambda fd, deadline: 999
        self.assertFalse(self.helper._has_exact_token(701, 17, TOKEN, time.monotonic() + 1))

    def test_parser_rejects_malformed_arguments_and_accepts_only_one_exact_token_line(self):
        original_stdin = self.helper.sys.stdin

        class NoPidsAfterShapeCheck(list):
            def __len__(self):
                return 4

            def __getitem__(self, index):
                if isinstance(index, slice):
                    return []
                return super().__getitem__(index)

        try:
            self.helper.sys.stdin = _Stdin(TOKEN + b"\n")
            self.assertEqual(self.helper._parse(["helper", "SIGKILL", "1", "7"])[2:], ([7], TOKEN))
            for arguments, input_bytes in [
                (NoPidsAfterShapeCheck(["helper", "SIGTERM", "1", "7"]), TOKEN + b"\n"),
                (["helper", "SIGUSR1", "1", "7"], TOKEN + b"\n"),
                (["helper", "SIGTERM", "0", "7"], TOKEN + b"\n"),
                (["helper", "SIGTERM", "1", "7", "7"], TOKEN + b"\n"),
                (["helper", "SIGTERM", "1", "0"], TOKEN + b"\n"),
                (["helper", "SIGTERM", "1", "7"], TOKEN + b"\nextra\n"),
                (["helper", "SIGTERM", "1", "7"], b"z" * 64 + b"\n"),
            ]:
                self.helper.sys.stdin = _Stdin(input_bytes)
                with self.assertRaises(ValueError):
                    self.helper._parse(arguments)
        finally:
            self.helper.sys.stdin = original_stdin

    def test_acquires_every_handle_before_validation_and_never_signals_after_validation_or_open_failure(self):
        validation_events = []

        def reject_later(pid, fd, token, deadline):
            validation_events.append(("validate", pid, fd))
            return pid == 701

        status, events, _identities, output = self._run_main(validation=reject_later)
        self.assertEqual(status, 1)
        self.assertEqual(output, "")
        self.assertEqual(events[:2], [("open", 701, 0), ("open", 702, 0)])
        self.assertEqual(validation_events, [("validate", 701, 1701), ("validate", 702, 1702)])
        self.assertFalse(any(event[0] == "signal" for event in events))
        self.assertEqual(events[-2:], [("close", 1701), ("close", 1702)])

        status, events, _identities, output = self._run_main(open_error=702)
        self.assertEqual((status, output), (1, ""))
        self.assertFalse(any(event[0] == "signal" for event in events))
        self.assertEqual(events, [("open", 701, 0), ("open", 702, 0), ("close", 1701)])

    def test_signals_pinned_original_after_numeric_pid_is_replaced_and_handles_esrch(self):
        numeric_processes = {701: "original-701", 702: "original-702"}

        def validate_then_replace(pid, fd, token, deadline):
            if pid == 702:
                numeric_processes[701] = "replacement-for-numeric-701"
            return True

        events = []
        identities = {}
        fake_os = _FakeOS(events, identities)
        fake_signal = _FakeSignal(events, identities, {1702: ProcessLookupError()})
        self.helper.os = fake_os
        self.helper.signal = fake_signal
        self.helper._parse = lambda _arguments: (fake_signal.SIGTERM, 1_000, [701, 702], TOKEN)
        self.helper._has_exact_token = validate_then_replace
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(self.helper.main(["helper"]), 0)
        self.assertEqual(output.getvalue(), "ok\n")
        self.assertEqual(
            [event[1] for event in events if event[0] == "signal"],
            ["pinned-701", "pinned-702"],
        )
        self.assertEqual(numeric_processes[701], "replacement-for-numeric-701")
        self.assertEqual(events[-2:], [("close", 1701), ("close", 1702)])

    def test_non_esrch_signal_error_fails_closed_and_cleanup_errors_are_ignored(self):
        status, events, _identities, output = self._run_main(
            signal_failures={1701: OSError(errno.EPERM, "denied")}, close_error=1702,
        )
        self.assertEqual((status, output), (1, ""))
        self.assertEqual(len([event for event in events if event[0] == "signal"]), 2)
        self.assertEqual(events[-2:], [("close", 1701), ("close", 1702)])

    def test_esrch_os_error_is_treated_as_already_gone(self):
        esrch = OSError("gone")
        esrch.errno = errno.ESRCH
        status, events, _identities, output = self._run_main(
            pids=(701,), signal_failures={1701: esrch},
        )
        self.assertEqual((status, output), (0, "ok\n"))
        self.assertEqual(events[-1], ("close", 1701))

    def test_missing_pidfd_support_parse_failure_and_deadline_failure_send_zero_signals(self):
        self.helper._parse = lambda _arguments: (_ for _ in ()).throw(ValueError())
        self.assertEqual(self.helper.main(["helper"]), 1)

        self.helper.os = object()
        self.helper.signal = object()
        self.helper._parse = lambda _arguments: (15, 1_000, [701], TOKEN)
        self.assertEqual(self.helper.main(["helper"]), 1)

        events = []
        identities = {}
        self.helper.os = _FakeOS(events, identities)
        self.helper.signal = _FakeSignal(events, identities)
        self.helper._parse = lambda _arguments: (15, 1_000, [701], TOKEN)
        original_monotonic = self.helper.time.monotonic
        ticks = iter([10, 11])
        self.helper.time.monotonic = lambda: next(ticks)
        try:
            self.assertEqual(self.helper.main(["helper"]), 1)
        finally:
            self.helper.time.monotonic = original_monotonic
        self.assertFalse(any(event[0] == "signal" for event in events))
        self.assertEqual(events, [])

    def test_script_entrypoint_fails_closed_when_pidfds_are_unavailable(self):
        original_argv = sys.argv
        original_stdin = sys.stdin
        original_pidfd_open = getattr(os, "pidfd_open", None)
        try:
            if original_pidfd_open is not None:
                delattr(os, "pidfd_open")
            sys.argv = [str(HELPER_PATH), "SIGTERM", "1", "701"]
            sys.stdin = _Stdin(TOKEN + b"\n")
            with self.assertRaises(SystemExit) as exited:
                runpy.run_path(str(HELPER_PATH), run_name="__main__")
            self.assertEqual(exited.exception.code, 1)
        finally:
            if original_pidfd_open is not None:
                os.pidfd_open = original_pidfd_open
            sys.argv = original_argv
            sys.stdin = original_stdin


if __name__ == "__main__":
    unittest.main()
