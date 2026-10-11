"""Fixed, bounded Python entrypoint for the embedded Garmin client."""

from __future__ import annotations

import json
import logging
import math
import re
import secrets
from typing import Any, Callable

_RUNTIME_INFO_OPERATION = "runtimeInfo"
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


class GarminBridge:
    def __init__(
        self,
        *,
        client_factory: Callable[..., Any] | None = None,
        handle_factory: Callable[[], str] | None = None,
        namespace_factory: Callable[[], str] | None = None,
    ) -> None:
        self._client_factory = client_factory or _default_client_factory
        self._handle_factory = handle_factory or (lambda: secrets.token_urlsafe(24))
        self._namespace_factory = namespace_factory or (lambda: f"garmin:{secrets.token_hex(16)}")
        self._client: Any = None
        self._pending_client: Any = None
        self._pending_handle: str | None = None
        self._pending_token_payload: bytes | None = None
        self._account_namespace: str | None = None
        self._generation = 0

    def dispatch(self, operation: str, arguments: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(operation, str) or operation not in _OPERATIONS:
            return self._error("operation_rejected")
        try:
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

    def _success(self, data: Any) -> dict[str, Any]:
        return {"status": "ok", "generation": self._generation, "data": _bounded_json(data)}

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

    def _capture_tokens(self) -> None:
        if self._client is None or self._account_namespace is None:
            return
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
            client = self._client_factory(
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
            self._account_namespace = _safe_namespace(self._namespace_factory())
            self._capture_tokens()
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
            self._account_namespace = _safe_namespace(self._namespace_factory())
            self._capture_tokens()
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
            client = self._client_factory(
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
        items = self._require_client().get_activities(start, limit, "running")
        if not isinstance(items, list) or len(items) > limit:
            raise _BridgeInputError("malformed_response")
        self._capture_tokens()
        data: dict[str, Any] = {"items": items}
        if len(items) == limit:
            data["nextStart"] = start + len(items)
        return self._success(data)

    def _activity(self, arguments: Any) -> dict[str, Any]:
        identifier = _activity_id(arguments)
        value = self._require_client().get_activity(identifier)
        self._capture_tokens()
        return self._success(value)

    def _activity_splits(self, arguments: Any) -> dict[str, Any]:
        identifier = _activity_id(arguments)
        value = self._require_client().get_activity_splits(identifier)
        self._capture_tokens()
        return self._success(value)

    def _details(self, arguments: Any) -> dict[str, Any]:
        identifier = _activity_id(arguments, details=True)
        value = self._require_client().get_activity_details(identifier, maxchart=2000, maxpoly=4000)
        self._capture_tokens()
        return self._success(value)

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
