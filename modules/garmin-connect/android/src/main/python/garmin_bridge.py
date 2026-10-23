"""Fixed, bounded Python entrypoint for the embedded Garmin client."""

from __future__ import annotations

import json
import hashlib
import logging
import math
import re
import secrets
import threading
from typing import Any, Callable

_RUNTIME_INFO_OPERATION = "runtimeInfo"
_BENCHMARK_NORMALIZE_OPERATION = "benchmarkDeterministicJson"
_RUNTIME_INFO = {
    "schemaVersion": 1,
    "pythonVersion": "3.13",
    "clientVersion": "0.3.17",
    "clientCommit": "218e72ca5459e014435fc2d94fd18bd601fa0c14",
    "abi": "arm64-v8a",
    "capabilities": [_RUNTIME_INFO_OPERATION],
}
_OPERATIONS = frozenset(
    {
        "connectionState",
        "login",
        "resumeMfa",
        "restoreSession",
        "logout",
        "getActivities",
        "getActivity",
        "getActivitySplits",
        "getActivityDetails",
        "forceRefreshForTest",
        "runAdversarialSuite",
    }
)
_ACTIVITY_ID = re.compile(r"^[1-9][0-9]{0,18}$")
_SAFE_NAMESPACE = re.compile(r"^garmin:[a-f0-9]{32}$")
_FORBIDDEN_KEY = re.compile(
    r"authorization|ciphertext|cookie|credential|email|password|refresh|token|traceback|url",
    re.IGNORECASE,
)
_URL_VALUE = re.compile(r"^(?:https?|ftp)://", re.IGNORECASE)
_MAX_JSON_DEPTH = 16
_MAX_JSON_NODES = 25_000
_MAX_JSON_STRING_LENGTH = 16_384
_MAX_PAGE_START = 10_000
_MAX_PAGE_SIZE = 50
_ADVERSARIAL_CONFIRMATION = "VERIFY-PHASE18-GARMIN-ADVERSARIAL"
_ADVERSARIAL_ACCOUNT_NAMESPACE = "garmin:abcdefabcdefabcdefabcdefabcdefab"
_ADVERSARIAL_CASE_IDS = frozenset(
    {
        "PH18-ADV-RESTORE",
        "PH18-ADV-REFRESH",
        "PH18-ADV-READ",
        "PH18-ADV-LOGOUT",
        "PH18-ADV-RESTART",
        "PH18-ADV-LATE-GENERATION",
        "PH18-ADV-EXPIRED",
        "PH18-ADV-401",
        "PH18-ADV-403",
        "PH18-ADV-429",
        "PH18-ADV-OFFLINE",
        "PH18-ADV-TIMEOUT",
        "PH18-ADV-5XX",
        "PH18-ADV-MALFORMED",
        "PH18-ADV-TRUNCATED",
        "PH18-ADV-OVERSIZED",
        "PH18-ADV-UNSUPPORTED-JSON",
        "PH18-ADV-MISSING-COMPONENT",
        "PH18-ADV-PARTIAL-PAGE",
        "PH18-ADV-ROTATION",
    }
)
_ADVERSARIAL_SOURCE_COMPONENTS = {
    "activity": {
        "activityId": 424242,
        "activityTypeDTO": {"typeKey": "running"},
        "summaryDTO": {
            "startTimeGMT": "2026-10-05T23:30:00.000Z",
            "distance": 5_000,
            "duration": 1_500,
            "elapsedDuration": 1_560,
            "movingDuration": 1_475,
        },
    },
    "splits": {"lapDTOs": []},
    "details": {"metricDescriptors": [], "activityDetailMetrics": []},
}


def _silence_provider_logging() -> None:
    provider_logger = logging.getLogger("garminconnect")
    provider_logger.handlers.clear()
    provider_logger.addHandler(logging.NullHandler())
    provider_logger.propagate = False
    provider_logger.disabled = True


_silence_provider_logging()


class _BridgeInputError(Exception):
    pass


def _default_client_factory(**kwargs: Any) -> Any:
    from garminconnect import Garmin

    return Garmin(**kwargs)


def _exact_arguments(arguments: Any, keys: set[str]) -> dict[str, Any]:
    if not isinstance(arguments, dict) or set(arguments) != keys:
        raise _BridgeInputError("arguments_rejected")
    return arguments


def _activity_id(arguments: Any, *, details: bool = False) -> str:
    keys = {"externalActivityId", "maxchart", "maxpoly"} if details else {"externalActivityId"}
    values = _exact_arguments(arguments, keys)
    identifier = values.get("externalActivityId")
    if not isinstance(identifier, str) or _ACTIVITY_ID.fullmatch(identifier) is None:
        raise _BridgeInputError("arguments_rejected")
    if details and (values.get("maxchart") != 2000 or values.get("maxpoly") != 4000):
        raise _BridgeInputError("arguments_rejected")
    return identifier


def _running_discovery_item(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        print('GYM_TRACKER_GARMIN_DISCOVERY_SHAPE:{"item_is_dict":false}')
        raise _BridgeInputError("malformed_response")
    activity_id = value.get("activityId")
    activity_type = value.get("activityType")
    if isinstance(activity_id, int) and activity_id > 0:
        activity_id = str(activity_id)
    # Temporary native diagnosis: fixed booleans only; never provider fields or values.
    print("GYM_TRACKER_GARMIN_DISCOVERY_SHAPE:" + json.dumps({
        "item_is_dict": True,
        "identifier_valid": isinstance(activity_id, str) and _ACTIVITY_ID.fullmatch(activity_id) is not None,
        "type_is_dict": isinstance(activity_type, dict),
        "type_is_running": isinstance(activity_type, dict) and activity_type.get("typeKey") == "running",
        "type_is_treadmill": isinstance(activity_type, dict) and activity_type.get("typeKey") == "treadmill_running",
    }, separators=(",", ":")))
    if (
        not isinstance(activity_id, str)
        or _ACTIVITY_ID.fullmatch(activity_id) is None
        or not isinstance(activity_type, dict)
        or activity_type.get("typeKey") != "running"
    ):
        raise _BridgeInputError("malformed_response")
    return {
        "activityId": int(activity_id),
        "activityType": {"typeKey": "running"},
    }


def _bounded_json(value: Any, *, depth: int = 0, budget: list[int] | None = None) -> Any:
    if budget is None:
        budget = [0]
    budget[0] += 1
    if depth > _MAX_JSON_DEPTH or budget[0] > _MAX_JSON_NODES:
        raise _BridgeInputError("malformed_response")
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int):
        if abs(value) > 9_007_199_254_740_991:
            raise _BridgeInputError("malformed_response")
        return value
    if isinstance(value, float):
        if not math.isfinite(value) or abs(value) > 9_007_199_254_740_991:
            raise _BridgeInputError("malformed_response")
        return value
    if isinstance(value, str):
        if len(value) > _MAX_JSON_STRING_LENGTH or _URL_VALUE.match(value):
            raise _BridgeInputError("malformed_response")
        return value
    if isinstance(value, (list, tuple)):
        return [_bounded_json(item, depth=depth + 1, budget=budget) for item in value]
    if isinstance(value, dict):
        result: dict[str, Any] = {}
        for key, child in value.items():
            if not isinstance(key, str) or not key or len(key) > 128 or _FORBIDDEN_KEY.search(key):
                raise _BridgeInputError("malformed_response")
            result[key] = _bounded_json(child, depth=depth + 1, budget=budget)
        return result
    raise _BridgeInputError("malformed_response")


def _safe_namespace(value: Any) -> str:
    if not isinstance(value, str) or _SAFE_NAMESPACE.fullmatch(value) is None:
        raise _BridgeInputError("malformed_response")
    return value


def _adversarial_provider_error(name: str, status: int, retry_after: str | None = None) -> Exception:
    error = type(name, (Exception,), {})("injected_failure")
    response = type("AdversarialResponse", (), {})()
    response.status_code = status
    response.headers = {} if retry_after is None else {"Retry-After": retry_after}
    error.response = response
    return error


class _AdversarialController:
    def __init__(self) -> None:
        self.mode = "PH18-ADV-RESTORE"
        self.token_generation = 1
        self.operation_counts: dict[str, int] = {}
        self.late_started = threading.Event()
        self.late_release = threading.Event()

    def configure(self, case_id: str) -> None:
        if case_id not in _ADVERSARIAL_CASE_IDS:
            raise _BridgeInputError("arguments_rejected")
        self.mode = case_id
        self.operation_counts = {}
        self.late_started = threading.Event()
        self.late_release = threading.Event()

    def record(self, operation: str) -> None:
        self.operation_counts[operation] = self.operation_counts.get(operation, 0) + 1

    def token_payload(self) -> bytes:
        return json.dumps(
            {
                "account_namespace": _ADVERSARIAL_ACCOUNT_NAMESPACE,
                "di_client_id": "native-adversarial-client",
                "di_refresh_token": "native-adversarial-refresh",
                "di_token": f"native-adversarial-{self.token_generation}",
            },
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")

    def observation(self) -> dict[str, Any]:
        return {
            "operation_counts": dict(self.operation_counts),
            "automatic_retry_count": 0,
            "source_components": _bounded_json(_ADVERSARIAL_SOURCE_COMPONENTS),
        }

    def rotate(self) -> None:
        self.token_generation += 1

    def client(self) -> _AdversarialClient:
        return _AdversarialClient(self)


class _AdversarialClient:
    def __init__(self, controller: _AdversarialController) -> None:
        self.controller = controller
        self.client = self

    def login(self, tokenstore: str | None = None) -> tuple[None, None]:
        json.loads(tokenstore or "{}")
        return None, None

    def dumps(self) -> str:
        return self.controller.token_payload().decode("utf-8")

    def _refresh_di_token(self) -> None:
        self.controller.rotate()

    def get_activities(
        self,
        _start: int,
        _limit: int,
        _activity_type: str,
    ) -> Any:
        mode = self.controller.mode
        if mode in {"PH18-ADV-EXPIRED", "PH18-ADV-401"}:
            raise _adversarial_provider_error("GarminConnectAuthenticationError", 401)
        if mode == "PH18-ADV-403":
            raise _adversarial_provider_error("GarminConnectConnectionError", 403)
        if mode == "PH18-ADV-429":
            raise _adversarial_provider_error("GarminConnectTooManyRequestsError", 429, "999999")
        if mode == "PH18-ADV-OFFLINE":
            raise ConnectionError("injected_failure")
        if mode == "PH18-ADV-TIMEOUT":
            raise TimeoutError("injected_failure")
        if mode == "PH18-ADV-5XX":
            raise _adversarial_provider_error("GarminConnectConnectionError", 503)
        if mode == "PH18-ADV-MALFORMED":
            return object()
        if mode == "PH18-ADV-OVERSIZED":
            return [self._discovery(424242), self._discovery(424243)]
        if mode == "PH18-ADV-PARTIAL-PAGE":
            return [self._discovery(424242), self._discovery(424243)]
        if mode == "PH18-ADV-LATE-GENERATION":
            self.controller.late_started.set()
            self.controller.late_release.wait(2)
        return [self._discovery(424242)]

    def get_activity(self, activity_id: str) -> dict[str, Any]:
        if self.controller.mode == "PH18-ADV-PARTIAL-PAGE" and activity_id == "424243":
            raise _adversarial_provider_error("GarminConnectConnectionError", 503)
        return {
            "activityId": int(activity_id),
            "activityTypeDTO": {"typeKey": "running"},
            "summaryDTO": {
                "startTimeGMT": "2026-10-05T23:30:00.000Z",
                "distance": 5_000,
                "duration": 1_500,
                "elapsedDuration": 1_560,
                "movingDuration": 1_475,
            },
        }

    def get_activity_splits(self, _activity_id: str) -> dict[str, Any] | None:
        if self.controller.mode == "PH18-ADV-TRUNCATED":
            return object()  # type: ignore[return-value]
        if self.controller.mode == "PH18-ADV-MISSING-COMPONENT":
            return None
        if self.controller.mode == "PH18-ADV-ROTATION":
            self.controller.rotate()
        return {"lapDTOs": []}

    def get_activity_details(
        self,
        _activity_id: str,
        maxchart: int,
        maxpoly: int,
    ) -> dict[str, Any]:
        if self.controller.mode == "PH18-ADV-UNSUPPORTED-JSON":
            return {"metricDescriptors": {"unsupported"}}  # type: ignore[dict-item]
        return {
            "metricDescriptors": [],
            "activityDetailMetrics": [],
            "bounds": {"maxchart": maxchart, "maxpoly": maxpoly},
        }

    @staticmethod
    def _discovery(activity_id: int) -> dict[str, Any]:
        return {"activityId": activity_id, "activityType": {"typeKey": "running"}}


class GarminBridge:
    def __init__(
        self,
        *,
        client_factory: Callable[..., Any] | None = None,
        handle_factory: Callable[[], str] | None = None,
        namespace_factory: Callable[..., str] | None = None,
    ) -> None:
        self._client_factory = client_factory or _default_client_factory
        self._handle_factory = handle_factory or (lambda: secrets.token_urlsafe(24))
        self._namespace_factory = namespace_factory
        self._client: Any = None
        self._pending_client: Any = None
        self._pending_handle: str | None = None
        self._pending_token_payload: bytes | None = None
        self._account_namespace: str | None = None
        self._generation = 0
        self._adversarial: _AdversarialController | None = None

    def dispatch(self, operation: str, arguments: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(operation, str) or operation not in _OPERATIONS:
            return self._error("operation_rejected")
        try:
            if self._adversarial is not None and operation != "runAdversarialSuite":
                self._adversarial.record(operation)
            if operation == "connectionState":
                _exact_arguments(arguments, set())
                return self._success(self._connection_state())
            if operation == "login":
                return self._login(arguments)
            if operation == "resumeMfa":
                return self._resume_mfa(arguments)
            if operation == "restoreSession":
                return self._restore(arguments)
            if operation == "logout":
                _exact_arguments(arguments, set())
                return self._logout()
            if operation == "getActivities":
                return self._activities(arguments)
            if operation == "getActivity":
                return self._activity(arguments)
            if operation == "getActivitySplits":
                return self._activity_splits(arguments)
            if operation == "getActivityDetails":
                return self._details(arguments)
            if operation == "forceRefreshForTest":
                _exact_arguments(arguments, set())
                return self._force_refresh()
            if operation == "runAdversarialSuite":
                return self._adversarial_suite(arguments)
        except _BridgeInputError as error:
            return self._error(str(error))
        except Exception as error:  # Boundary intentionally discards exception text and traceback.
            code, retry_after_ms = self._classify_error(error, operation)
            return self._error(code, retry_after_ms)
        return self._error("operation_rejected")

    def take_persistable_tokens(self) -> bytes | None:
        payload = self._pending_token_payload
        self._pending_token_payload = None
        return payload

    def _success(self, data: Any, *, generation: int | None = None) -> dict[str, Any]:
        observed_generation = self._generation if generation is None else generation
        return {"status": "ok", "generation": observed_generation, "data": _bounded_json(data)}

    @staticmethod
    def _error(code: str, retry_after_ms: int | None = None) -> dict[str, Any]:
        error: dict[str, Any] = {"code": code}
        if code == "rate_limited" and retry_after_ms is not None:
            error["retryAfterMs"] = retry_after_ms
        return {"status": "error", "error": error}

    def _connection_state(self) -> dict[str, Any]:
        if self._pending_handle is not None:
            return {"kind": "mfa_required", "challenge_handle": self._pending_handle}
        if self._client is not None and self._account_namespace is not None:
            return {"kind": "connected", "account_namespace": self._account_namespace}
        return {"kind": "disconnected"}

    def _derive_account_namespace(self, client_id: str) -> str:
        if self._namespace_factory is not None:
            try:
                candidate = self._namespace_factory(client_id)
            except TypeError:
                candidate = self._namespace_factory()
            return _safe_namespace(candidate)
        digest = hashlib.sha256(f"garmin-di-client:{client_id}".encode("utf-8")).hexdigest()
        return _safe_namespace(f"garmin:{digest[:32]}")

    def _read_token_data(self) -> dict[str, str]:
        if self._client is None:
            raise _BridgeInputError("sign_in_required")
        payload = self._client.client.dumps()
        if not isinstance(payload, str) or not payload:
            raise _BridgeInputError("sign_in_required")
        try:
            token_data = json.loads(payload)
        except (TypeError, json.JSONDecodeError) as error:
            raise _BridgeInputError("sign_in_required") from error
        if not isinstance(token_data, dict) or any(
            not isinstance(token_data.get(key), str) or not token_data[key]
            for key in ("di_token", "di_refresh_token", "di_client_id")
        ):
            raise _BridgeInputError("sign_in_required")
        return {
            "di_client_id": token_data["di_client_id"],
            "di_refresh_token": token_data["di_refresh_token"],
            "di_token": token_data["di_token"],
        }

    def _capture_tokens(self, token_data: dict[str, str] | None = None) -> None:
        if self._client is None or self._account_namespace is None:
            return
        if token_data is None:
            token_data = self._read_token_data()
        self._pending_token_payload = json.dumps(
            {
                "di_client_id": token_data["di_client_id"],
                "di_refresh_token": token_data["di_refresh_token"],
                "di_token": token_data["di_token"],
                "account_namespace": self._account_namespace,
            },
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")

    def _login(self, arguments: Any) -> dict[str, Any]:
        values = _exact_arguments(arguments, {"email", "password"})
        email = values.get("email")
        password = values.get("password")
        if not isinstance(email, str) or not email or len(email) > 254:
            raise _BridgeInputError("arguments_rejected")
        if not isinstance(password, str) or not password or len(password) > 1024:
            raise _BridgeInputError("arguments_rejected")
        self._generation += 1
        self._clear_client()
        try:
            client = self._create_client(
                email=email,
                password=password,
                return_on_mfa=True,
                retry_attempts=0,
            )
            status, _ = client.login()
            if status == "needs_mfa":
                handle = self._handle_factory()
                if not isinstance(handle, str) or re.fullmatch(r"[A-Za-z0-9_-]{16,128}", handle) is None:
                    raise _BridgeInputError("malformed_response")
                self._pending_client = client
                self._pending_handle = handle
                return self._success({"kind": "mfa_required", "challenge_handle": handle})
            self._client = client
            token_data = self._read_token_data()
            self._account_namespace = self._derive_account_namespace(token_data["di_client_id"])
            self._capture_tokens(token_data)
            return self._success(self._connection_state())
        finally:
            values.pop("email", None)
            values.pop("password", None)
            email = None
            password = None

    def _resume_mfa(self, arguments: Any) -> dict[str, Any]:
        values = _exact_arguments(arguments, {"challengeHandle", "code"})
        handle = values.get("challengeHandle")
        code = values.get("code")
        if not isinstance(handle, str) or handle != self._pending_handle or self._pending_client is None:
            raise _BridgeInputError("mfa_expired")
        if not isinstance(code, str) or re.fullmatch(r"[0-9]{4,10}", code) is None:
            raise _BridgeInputError("arguments_rejected")
        try:
            self._pending_client.resume_login({}, code)
            self._client = self._pending_client
            self._pending_client = None
            self._pending_handle = None
            token_data = self._read_token_data()
            self._account_namespace = self._derive_account_namespace(token_data["di_client_id"])
            self._capture_tokens(token_data)
            return self._success(self._connection_state())
        finally:
            values.pop("challengeHandle", None)
            values.pop("code", None)
            handle = None
            code = None

    def _restore(self, arguments: Any) -> dict[str, Any]:
        values = _exact_arguments(arguments, {"tokenPayload"})
        payload = values.get("tokenPayload")
        if not isinstance(payload, (bytes, bytearray)) or not payload or len(payload) > 65_536:
            raise _BridgeInputError("sign_in_required")
        self._generation += 1
        self._clear_client()
        try:
            tokenstore = bytes(payload).decode("utf-8")
            token_data = json.loads(tokenstore)
            if not isinstance(token_data, dict) or any(
                not isinstance(token_data.get(key), str) or not token_data[key]
                for key in ("di_token", "di_refresh_token", "di_client_id", "account_namespace")
            ):
                raise _BridgeInputError("sign_in_required")
            try:
                account_namespace = _safe_namespace(token_data["account_namespace"])
            except _BridgeInputError as error:
                raise _BridgeInputError("sign_in_required") from error
            tokenstore = json.dumps(
                {
                    "di_client_id": token_data["di_client_id"],
                    "di_refresh_token": token_data["di_refresh_token"],
                    "di_token": token_data["di_token"],
                },
                separators=(",", ":"),
                sort_keys=True,
            )
            client = self._create_client(
                email=None,
                password=None,
                return_on_mfa=True,
                retry_attempts=0,
            )
            client.login(tokenstore=tokenstore)
            self._client = client
            self._account_namespace = account_namespace
            self._capture_tokens()
            return self._success(self._connection_state())
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._clear_client()
            return self._error("sign_in_required")
        finally:
            values.pop("tokenPayload", None)
            payload = None
            account_namespace = None

    def _logout(self) -> dict[str, Any]:
        self._generation += 1
        self._clear_client()
        return self._success({"kind": "disconnected"})

    def _require_client(self) -> Any:
        if self._client is None:
            raise _BridgeInputError("sign_in_required")
        return self._client

    def _activities(self, arguments: Any) -> dict[str, Any]:
        values = _exact_arguments(arguments, {"start", "limit", "activityType"})
        start = values.get("start")
        limit = values.get("limit")
        if (
            isinstance(start, bool)
            or not isinstance(start, int)
            or start < 0
            or start > _MAX_PAGE_START
            or isinstance(limit, bool)
            or not isinstance(limit, int)
            or limit < 1
            or limit > _MAX_PAGE_SIZE
            or values.get("activityType") != "running"
        ):
            raise _BridgeInputError("arguments_rejected")
        started_generation = self._generation
        items = self._require_client().get_activities(start, limit, "running")
        print("GYM_TRACKER_GARMIN_DISCOVERY_SHAPE:" + json.dumps({
            "page_is_list": isinstance(items, list),
            "page_within_limit": isinstance(items, list) and len(items) <= limit,
        }, separators=(",", ":")))
        if not isinstance(items, list) or len(items) > limit:
            raise _BridgeInputError("malformed_response")
        self._capture_tokens()
        data: dict[str, Any] = {"items": [_running_discovery_item(item) for item in items]}
        if len(items) == limit:
            data["nextStart"] = start + len(items)
        return self._success(data, generation=started_generation)

    def _activity(self, arguments: Any) -> dict[str, Any]:
        identifier = _activity_id(arguments)
        started_generation = self._generation
        value = self._require_client().get_activity(identifier)
        self._capture_tokens()
        return self._success(value, generation=started_generation)

    def _activity_splits(self, arguments: Any) -> dict[str, Any]:
        identifier = _activity_id(arguments)
        started_generation = self._generation
        value = self._require_client().get_activity_splits(identifier)
        self._capture_tokens()
        return self._success(value, generation=started_generation)

    def _details(self, arguments: Any) -> dict[str, Any]:
        identifier = _activity_id(arguments, details=True)
        started_generation = self._generation
        value = self._require_client().get_activity_details(identifier, maxchart=2000, maxpoly=4000)
        self._capture_tokens()
        return self._success(value, generation=started_generation)

    def _force_refresh(self) -> dict[str, Any]:
        client = self._require_client()
        refresh = getattr(client.client, "_refresh_di_token", None)
        if not callable(refresh):
            raise _BridgeInputError("operation_rejected")
        refresh()
        self._capture_tokens()
        return self._success(self._connection_state())

    def _adversarial_suite(self, arguments: Any) -> dict[str, Any]:
        if not isinstance(arguments, dict) or arguments.get("confirmation") != _ADVERSARIAL_CONFIRMATION:
            raise _BridgeInputError("arguments_rejected")
        action = arguments.get("action")
        expected_keys = {"confirmation", "action", "caseId"} if action == "configure" else {"confirmation", "action"}
        values = _exact_arguments(arguments, expected_keys)
        if action == "start":
            self._clear_client()
            self._generation = 0
            self._adversarial = _AdversarialController()
            self._pending_token_payload = self._adversarial.token_payload()
            return self._success({"kind": "prepared", **self._adversarial.observation()})
        controller = self._adversarial
        if controller is None:
            raise _BridgeInputError("arguments_rejected")
        if action == "reset":
            self._clear_client()
            self._generation = 0
            return self._success({"kind": "reset"})
        if action == "configure":
            case_id = values.get("caseId")
            if not isinstance(case_id, str):
                raise _BridgeInputError("arguments_rejected")
            controller.configure(case_id)
            return self._success({"kind": "configured"})
        if action == "observe":
            return self._success(controller.observation())
        if action == "awaitLateStart":
            return self._success({"started": controller.late_started.wait(2)})
        if action == "releaseLate":
            controller.late_release.set()
            return self._success({"released": True})
        if action == "finish":
            controller.late_release.set()
            self._clear_client()
            self._adversarial = None
            self._generation = 0
            return self._success({"kind": "finished"})
        raise _BridgeInputError("arguments_rejected")

    def _create_client(self, **kwargs: Any) -> Any:
        if self._adversarial is not None:
            return self._adversarial.client()
        return self._client_factory(**kwargs)

    def _clear_client(self) -> None:
        self._client = None
        self._pending_client = None
        self._pending_handle = None
        self._pending_token_payload = None
        self._account_namespace = None

    @staticmethod
    def _classify_error(error: Exception, operation: str) -> tuple[str, int | None]:
        current: BaseException | None = error
        response = None
        names: set[str] = set()
        for _ in range(4):
            if current is None:
                break
            names.add(type(current).__name__)
            response = response or getattr(current, "response", None)
            current = current.__cause__ or current.__context__
        status = getattr(response, "status_code", None)
        if status == 429 or "GarminConnectTooManyRequestsError" in names:
            return "rate_limited", GarminBridge._retry_after_ms(response)
        if status == 403 and operation.startswith("get"):
            return "data_access_denied", None
        if status == 401 or "GarminConnectAuthenticationError" in names:
            if operation == "resumeMfa":
                return "mfa_expired", None
            if operation == "restoreSession" or operation.startswith("get"):
                return "sign_in_required", None
            return "invalid_credentials", None
        if any("Timeout" in name for name in names):
            return "timeout", None
        if names.intersection({"ConnectionError", "ConnectionResetError", "ConnectionAbortedError"}):
            return "offline", None
        return "temporary_failure", None

    @staticmethod
    def _retry_after_ms(response: Any) -> int | None:
        headers = getattr(response, "headers", None)
        if not isinstance(headers, dict):
            return None
        value = headers.get("Retry-After") or headers.get("retry-after")
        if not isinstance(value, str) or re.fullmatch(r"[0-9]{1,10}", value) is None:
            return None
        seconds = int(value)
        return min(900_000, max(1_000, seconds * 1_000))


def create_bridge(
    *,
    client_factory: Callable[..., Any] | None = None,
    handle_factory: Callable[[], str] | None = None,
    namespace_factory: Callable[[], str] | None = None,
) -> GarminBridge:
    return GarminBridge(
        client_factory=client_factory,
        handle_factory=handle_factory,
        namespace_factory=namespace_factory,
    )


_BRIDGE = create_bridge()


def dispatch(operation: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Run one fixed operation; validation failures expose only bounded codes."""
    if operation == _RUNTIME_INFO_OPERATION:
        if not isinstance(arguments, dict) or arguments:
            raise ValueError("garmin_bridge_arguments_rejected")
        return dict(_RUNTIME_INFO)
    if operation == _BENCHMARK_NORMALIZE_OPERATION:
        try:
            values = _exact_arguments(arguments, {"payloadJson"})
            payload_json = values.get("payloadJson")
            if not isinstance(payload_json, str) or not payload_json or len(payload_json) > 1_000_000:
                raise _BridgeInputError("arguments_rejected")
            normalized = _bounded_json(json.loads(payload_json))
        except (TypeError, json.JSONDecodeError, _BridgeInputError) as error:
            raise ValueError("garmin_bridge_arguments_rejected") from error
        normalized_json = json.dumps(normalized, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        return {
            "schemaVersion": 1,
            "transport": "chaquopy-python-garminconnect-0.3.17",
            "payloadSha256": hashlib.sha256(payload_json.encode("utf-8")).hexdigest(),
            "normalizedJson": normalized_json,
            "outputSha256": hashlib.sha256(normalized_json.encode("utf-8")).hexdigest(),
        }
    result = _BRIDGE.dispatch(operation, arguments)
    if result.get("status") == "error" and result.get("error", {}).get("code") in {
        "operation_rejected",
        "arguments_rejected",
    }:
        raise ValueError("garmin_bridge_request_rejected")
    return result


def take_persistable_tokens() -> bytes | None:
    """Internal Kotlin-only token handoff; never registered as an Expo method."""
    return _BRIDGE.take_persistable_tokens()


def evidence_rejections() -> dict[str, str]:
    """Exercise the fixed dispatcher allowlist without exposing rejected input."""
    operation = _BRIDGE.dispatch("unsupportedEvidenceOperation", {})
    arguments = _BRIDGE.dispatch("getActivities", {})
    return {
        "operation_rejection": operation.get("error", {}).get("code", "temporary_failure"),
        "arguments_rejection": arguments.get("error", {}).get("code", "temporary_failure"),
    }


def evidence_recovery_extensions() -> list[dict[str, Any]]:
    """Exercise Phase 20 conditions absent from the frozen Phase 18 ledger."""
    rows: list[dict[str, Any]] = []
    expected = (
        ("PH18-ADV-EXPIRED", "sign_in_required"),
        ("PH18-ADV-401", "sign_in_required"),
        ("PH18-ADV-TRUNCATED", "malformed_response"),
        ("PH18-ADV-UNSUPPORTED-JSON", "malformed_response"),
    )
    for case_id, expected_code in expected:
        controller = _AdversarialController()
        controller.mode = case_id
        bridge = GarminBridge()
        bridge._adversarial = controller
        restore = bridge.dispatch("restoreSession", {"tokenPayload": controller.token_payload()})
        code = restore.get("error", {}).get("code")
        if restore.get("status") == "ok":
            page = bridge.dispatch("getActivities", {"start": 0, "limit": 1, "activityType": "running"})
            code = page.get("error", {}).get("code")
            if page.get("status") == "ok":
                identifier = str(page["data"]["items"][0]["activityId"])
                for operation, arguments in (
                    ("getActivity", {"externalActivityId": identifier}),
                    ("getActivitySplits", {"externalActivityId": identifier}),
                    ("getActivityDetails", {"externalActivityId": identifier, "maxchart": 2000, "maxpoly": 4000}),
                ):
                    result = bridge.dispatch(operation, arguments)
                    code = result.get("error", {}).get("code")
                    if result.get("status") != "ok":
                        break
        rows.append({
            "id": case_id,
            "code": code if code == expected_code else "temporary_failure",
            "call_count": sum(controller.operation_counts.values()),
            "automatic_retry_count": 0,
            "retry_after_ms": 0,
        })
        bridge._clear_client()
    return rows
