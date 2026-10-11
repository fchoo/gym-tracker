"""The fixed, intentionally narrow Python entrypoint for the Garmin module."""

from __future__ import annotations

from typing import Any

_RUNTIME_INFO_OPERATION = "runtimeInfo"
_RUNTIME_INFO = {
    "schemaVersion": 1,
    "pythonVersion": "3.13",
    "clientVersion": "0.3.17",
    "clientCommit": "218e72ca5459e014435fc2d94fd18bd601fa0c14",
    "abi": "arm64-v8a",
    "capabilities": [_RUNTIME_INFO_OPERATION],
}


def dispatch(operation: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Return the only approved probe DTO and reject every other authority."""
    if not isinstance(operation, str) or operation != _RUNTIME_INFO_OPERATION:
        raise ValueError("garmin_bridge_operation_rejected")
    if not isinstance(arguments, dict) or arguments:
        raise ValueError("garmin_bridge_arguments_rejected")
    return dict(_RUNTIME_INFO)
