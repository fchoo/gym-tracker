#!/usr/bin/env python3
"""Signal one token-owned Linux process set through validated pidfds only."""

import errno
import os
import re
import signal
import sys
import time


MAX_CANDIDATES = 4096
MAX_ENVIRONMENT_BYTES = 16 * 1024 * 1024
MAX_FDINFO_BYTES = 4096
TOKEN_PATTERN = re.compile(rb"^[a-f0-9]{64}$")
OWNERSHIP_KEY = b"V12_POSIX_PROCESS_OWNERSHIP="


def _read_bounded(path, maximum, deadline):
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    descriptor = os.open(path, flags)
    try:
        chunks = []
        total = 0
        while True:
            if time.monotonic() >= deadline:
                raise TimeoutError
            chunk = os.read(descriptor, min(65536, maximum + 1 - total))
            if not chunk:
                return b"".join(chunks)
            chunks.append(chunk)
            total += len(chunk)
            if total > maximum:
                raise ValueError
    finally:
        os.close(descriptor)


def _pidfd_pid(pidfd, deadline):
    content = _read_bounded(f"/proc/self/fdinfo/{pidfd}", MAX_FDINFO_BYTES, deadline)
    for row in content.splitlines():
        if row.startswith(b"Pid:"):
            value = row[4:].strip()
            return int(value) if value.isdigit() else -1
    return -1


def _has_exact_token(pid, pidfd, token, deadline):
    if _pidfd_pid(pidfd, deadline) != pid:
        return False
    environment = _read_bounded(f"/proc/{pid}/environ", MAX_ENVIRONMENT_BYTES, deadline)
    owned = OWNERSHIP_KEY + token in environment.split(b"\0")
    return owned and _pidfd_pid(pidfd, deadline) == pid


def _parse(arguments):
    if len(arguments) < 4 or arguments[1] not in ("SIGTERM", "SIGKILL"):
        raise ValueError
    timeout_ms = int(arguments[2])
    if timeout_ms < 1:
        raise ValueError
    raw_pids = arguments[3:]
    if not raw_pids or len(raw_pids) > MAX_CANDIDATES:
        raise ValueError
    pids = [int(value) for value in raw_pids]
    if any(pid < 1 or pid > 2147483647 for pid in pids) or len(set(pids)) != len(pids):
        raise ValueError
    token_input = sys.stdin.buffer.read(66)
    if not token_input.endswith(b"\n") or token_input.count(b"\n") != 1:
        raise ValueError
    token = token_input[:-1]
    if TOKEN_PATTERN.fullmatch(token) is None:
        raise ValueError
    return getattr(signal, arguments[1]), timeout_ms, pids, token


def main(arguments):
    pidfds = []
    try:
        selected_signal, timeout_ms, pids, token = _parse(arguments)
        if not hasattr(os, "pidfd_open") or not hasattr(signal, "pidfd_send_signal"):
            return 1
        deadline = time.monotonic() + (timeout_ms / 1000)

        # Phase one: acquire every stable handle. No signal is possible here.
        for pid in pids:
            if time.monotonic() >= deadline:
                return 1
            pidfds.append((pid, os.pidfd_open(pid, 0)))

        # Phase two: validate exact token ownership for every pinned instance.
        for pid, pidfd in pidfds:
            if not _has_exact_token(pid, pidfd, token, deadline):
                return 1

        # Phase three starts only after the complete candidate set validated.
        signal_failed = False
        for _pid, pidfd in pidfds:
            try:
                signal.pidfd_send_signal(pidfd, selected_signal, None, 0)
            except ProcessLookupError:
                pass
            except OSError as error:
                if error.errno != errno.ESRCH:
                    signal_failed = True
        if signal_failed:
            return 1
        sys.stdout.write("ok\n")
        return 0
    except Exception:
        return 1
    finally:
        for _pid, pidfd in pidfds:
            try:
                os.close(pidfd)
            except OSError:
                pass


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
