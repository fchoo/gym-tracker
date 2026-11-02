"""Synthetic imports only: host results are NOT Android transport observations."""
import contextlib
import importlib
import io
import logging
import socket
import sys
import types
import unittest
from unittest.mock import patch

import garmin_bridge
import garmin_transport_readiness as readiness


class ReadinessTest(unittest.TestCase):
    def setUp(self):
        self.created = []
        self.closed = []
        self.imports = []
        self.fail_import = None
        self.close_failure = None
        self.factory_failure = False
        self.kwargs = None
        owner = self

        class Session:
            @property
            def curl(self):
                return self
            def __init__(self):
                owner.created.append(self)
            def close(self):
                owner.closed.append(self)
                if owner.close_failure is not None:
                    raise owner.close_failure
            def request(self, *args, **kwargs):
                raise AssertionError("network forbidden")
            send = request
            perform = request

        requests = types.ModuleType("requests")
        requests.Session = Session
        curl_requests = types.ModuleType("curl_cffi.requests")
        curl_requests.Session = Session
        self.client = types.ModuleType("garminconnect.client")
        self.client.HAS_CFFI = True
        self.client.HAS_UA_GEN = True
        self.client.cffi_requests = curl_requests
        self.client.requests = requests

        def Garmin(**kwargs):
            owner.kwargs = kwargs
            a = self.client.requests.Session()
            b = self.client.requests.Session()
            if owner.factory_failure:
                raise ValueError("private constructor message")
            return types.SimpleNamespace(client=types.SimpleNamespace(cs=a, _api_session=b))

        garmin = types.ModuleType("garminconnect")
        garmin.Garmin = Garmin
        garmin.client = self.client
        certifi = types.ModuleType("certifi")
        certifi.where = lambda: "synthetic-bundled-ca"
        ssl = types.ModuleType("ssl")
        ssl.create_default_context = lambda **kw: self.assertEqual(kw, {"cafile": "synthetic-bundled-ca"})
        self.modules = {"garminconnect": garmin, "garminconnect.client": self.client,
                        "_cffi_backend": types.ModuleType("_cffi_backend"),
                        "curl_cffi": types.ModuleType("curl_cffi"), "curl_cffi.requests": curl_requests,
                        "requests": requests, "ua_generator": types.ModuleType("ua_generator"),
                        "certifi": certifi, "ssl": ssl}
        self.original_session = requests.Session

    def importer(self, name):
        self.imports.append(name)
        if name == self.fail_import:
            raise ModuleNotFoundError("private path/URL/token")
        return self.modules[name]

    def run_probe(self):
        # Includes DNS, TCP and TLS-capable socket APIs. The real default factory
        # imports the injected selected module, not a stubbed replacement factory.
        with patch.dict(sys.modules, self.modules), patch.object(socket, "socket", side_effect=AssertionError("network")), \
             patch.object(socket, "create_connection", side_effect=AssertionError("network")), \
             patch.object(socket, "getaddrinfo", side_effect=AssertionError("network")), \
             patch.object(importlib, "import_module", side_effect=self.importer), \
             patch.object(garmin_bridge._BRIDGE, "dispatch", side_effect=AssertionError("auth/store forbidden")), \
             contextlib.redirect_stdout(io.StringIO()) as stdout, contextlib.redirect_stderr(io.StringIO()) as stderr:
            result = readiness.probe()
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(stderr.getvalue(), "")
        self.assertIs(self.modules["requests"].Session, self.original_session)
        self.assertEqual(set(self.created), set(self.closed))
        self.assertEqual(len(self.closed), len(self.created))
        self.assertEqual(set(result), {"status", "stage", "code"})
        return result

    def test_selected_client_and_inert_sessions_are_required(self):
        self.assertEqual(self.run_probe(), {"status": "passed", "stage": "complete", "code": "actual_transport_ready"})
        self.assertEqual(len(self.created), 3)
        self.assertEqual(self.kwargs, {"email": None, "password": None, "is_cn": False, "return_on_mfa": True})
        self.assertIn("garminconnect", self.imports)
        self.assertIn("_cffi_backend", self.imports)
        self.assertIn("curl_cffi", self.imports)
        self.assertIn("ua_generator", self.imports)

    def test_each_import_failure_is_fixed_and_staged(self):
        for name, stage in [("garminconnect", "client_import"), ("garminconnect.client", "client_import"),
                            ("_cffi_backend", "cffi_backend"), ("curl_cffi", "curl_import"),
                            ("curl_cffi.requests", "curl_import"), ("requests", "requests_import"),
                            ("ua_generator", "ua_import"), ("certifi", "certifi_import"), ("ssl", "ssl_context")]:
            with self.subTest(name=name):
                self.setUp()
                self.fail_import = name
                self.assertEqual(self.run_probe(), {"status": "failed", "stage": stage, "code": "ModuleNotFoundError"})

    def test_upstream_silent_optional_fallback_never_passes(self):
        for field, value, stage in [("HAS_CFFI", False, "curl_import"), ("cffi_requests", object(), "curl_import"),
                                    ("HAS_UA_GEN", False, "ua_import")]:
            with self.subTest(field=field):
                self.setUp()
                setattr(self.client, field, value)
                self.assertEqual(self.run_probe(), {"status": "failed", "stage": stage, "code": "ImportError"})

    def test_factory_partial_failure_still_closes_all_sessions(self):
        self.factory_failure = True
        self.assertEqual(self.run_probe(), {"status": "failed", "stage": "client_factory", "code": "ValueError"})

    def test_close_failure_closes_remaining_sessions_and_never_passes(self):
        for error in [OSError("private"), type("PrivateProviderFailure", (Exception,), {})("secret")]:
            with self.subTest(error=type(error).__name__):
                self.setUp()
                self.close_failure = error
                self.assertEqual(self.run_probe(), {"status": "failed", "stage": "session_close", "code": "OSError" if type(error) is OSError else "Exception"})

    def test_inert_construction_and_ca_failures_are_sanitized(self):
        for name, attribute, stage in [("curl_cffi.requests", "Session", "curl_session"),
                                        ("certifi", "where", "ssl_context"), ("ssl", "create_default_context", "ssl_context")]:
            self.setUp()
            def fail(*args, **kwargs):
                raise RuntimeError("private URL path credential")
            setattr(self.modules[name], attribute, fail)
            self.assertEqual(self.run_probe(), {"status": "failed", "stage": stage, "code": "RuntimeError"})

    def test_lazy_native_curl_initialization_failure_is_not_ready(self):
        class LazyCurlFailure(self.modules["curl_cffi.requests"].Session):
            @property
            def curl(self):
                raise OSError("private shared library path")
        self.modules["curl_cffi.requests"].Session = LazyCurlFailure
        self.assertEqual(self.run_probe(), {"status": "failed", "stage": "curl_session", "code": "OSError"})
        self.assertEqual(len(self.closed), 1)

    def test_changed_selected_requests_binding_and_missing_session_shape_fail_closed(self):
        self.client.requests = object()
        self.assertEqual(self.run_probe(), {"status": "failed", "stage": "client_factory", "code": "ImportError"})
        for attribute in ["cs", "_api_session"]:
            self.setUp()
            def invalid_factory(**kwargs):
                self.client.requests.Session()
                return types.SimpleNamespace(client=types.SimpleNamespace(cs=None if attribute == "cs" else self.created[-1], _api_session=None))
            self.modules["garminconnect"].Garmin = invalid_factory
            self.assertEqual(self.run_probe(), {"status": "failed", "stage": "client_factory", "code": "TypeError"})

    def test_other_threads_keep_requests_api_and_sessions_untouched(self):
        import threading
        original_factory = self.modules["garminconnect"].Garmin
        self.modules["requests"].marker = "unchanged"
        foreign = []
        def factory(**kwargs):
            proxy = self.client.requests
            self.assertEqual(proxy.marker, "unchanged")
            thread = threading.Thread(target=lambda: foreign.append(proxy.Session()))
            thread.start()
            thread.join()
            return original_factory(**kwargs)
        self.modules["garminconnect"].Garmin = factory
        # This synthetic foreign session is NOT part of the diagnostic allocation
        # list; it must remain open. Avoid the all-created diagnostic-only assertion.
        original_importer = self.importer
        with patch.dict(sys.modules, self.modules), patch.object(importlib, "import_module", side_effect=original_importer), \
             patch.object(socket, "socket", side_effect=AssertionError("network")), \
             patch.object(socket, "getaddrinfo", side_effect=AssertionError("network")), \
             patch.object(socket, "create_connection", side_effect=AssertionError("network")):
            self.assertEqual(readiness.probe(), {"status": "passed", "stage": "complete", "code": "actual_transport_ready"})
        self.assertEqual(len(self.closed), 3)
        self.assertNotIn(foreign[0], self.closed)
        self.assertIs(self.client.requests, self.modules["requests"])

    def test_exception_codes_are_exact_allowlist_not_names_or_messages(self):
        for cls in [ImportError, ModuleNotFoundError, OSError, RuntimeError, TypeError, ValueError, AttributeError]:
            self.assertEqual(readiness._exception_code(cls("private")), cls.__name__)
        self.assertEqual(readiness._exception_code(type("ImportError", (Exception,), {})("private")), "Exception")


if __name__ == "__main__":
    unittest.main()
