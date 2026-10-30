"""DEVTEST inert selected-client readiness. Never requests, restores or logs auth.

Native owns authorization. This module does not use the persistent bridge client.
The pinned constructor uses only client.requests.Session: track that local binding
so even a partial constructor failure closes allocations, without replacing the
process-wide requests module or touching existing sessions/fallback policy.
"""
import importlib
import threading
from garmin_bridge import _default_client_factory

_PROBE_LOCK = threading.Lock()


class _RequestsProxy:
    def __init__(self, original, session_factory):
        self._original = original
        self.Session = session_factory

    def __getattr__(self, name):
        return getattr(self._original, name)

_EXCEPTION_TYPES = (ImportError, ModuleNotFoundError, OSError, RuntimeError,
                    TypeError, ValueError, AttributeError)


def _exception_code(error):
    return type(error).__name__ if type(error) in _EXCEPTION_TYPES else "Exception"


def probe():
    with _PROBE_LOCK:
        return _probe()


def _probe():
    sessions = []
    stage = "client_import"
    result = {"status": "passed", "stage": "complete", "code": "actual_transport_ready"}
    try:
        importlib.import_module("garminconnect")
        selected = importlib.import_module("garminconnect.client")
        stage = "cffi_backend"
        importlib.import_module("_cffi_backend")
        stage = "curl_import"
        importlib.import_module("curl_cffi")
        curl_requests = importlib.import_module("curl_cffi.requests")
        if selected.HAS_CFFI is not True or selected.cffi_requests is not curl_requests:
            raise ImportError()
        stage = "curl_session"
        curl_session = curl_requests.Session()
        sessions.append(curl_session)
        curl_session.curl  # Force lazy curl_easy_init; NO perform/request.
        stage = "requests_import"
        requests = importlib.import_module("requests")
        stage = "ua_import"
        importlib.import_module("ua_generator")
        if selected.HAS_UA_GEN is not True:
            raise ImportError()
        stage = "certifi_import"
        certifi = importlib.import_module("certifi")
        stage = "ssl_context"
        ssl = importlib.import_module("ssl")
        ssl.create_default_context(cafile=certifi.where())  # Bundled trust; NO handshake.
        stage = "client_factory"
        if selected.requests is not requests:
            raise ImportError()

        diagnostic_thread = threading.get_ident()

        def tracked_session(*args, **kwargs):
            session = requests.Session(*args, **kwargs)
            if threading.get_ident() == diagnostic_thread:
                sessions.append(session)
            return session

        # Preserve other threads' requests API/allocations; never close their sessions.
        selected.requests = _RequestsProxy(requests, tracked_session)
        try:
            client = _default_client_factory(email=None, password=None, is_cn=False, return_on_mfa=True)
            if client.client.cs not in sessions or client.client._api_session not in sessions:
                raise TypeError()
        finally:
            selected.requests = requests
    except Exception as error:
        result = {"status": "failed", "stage": stage, "code": _exception_code(error)}
    finally:
        for session in sessions:
            try:
                session.close()
            except Exception as error:
                result = {"status": "failed", "stage": "session_close", "code": _exception_code(error)}
    return result
