#!/usr/bin/env python3
"""Run the Phase 18 Python bridge tests and emit a source-bound coverage report."""

from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import trace
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = PROJECT_ROOT / "modules/garmin-connect/android/src/main/python/garmin_bridge.py"
TEST_PATH = PROJECT_ROOT / "modules/garmin-connect/android/src/test/python/test_garmin_bridge.py"
DEFAULT_OUTPUT = PROJECT_ROOT / "coverage/phase18/python-coverage.json"
TEST_MODULE_NAME = "phase18_test_garmin_bridge"
REQUIRED_CASES = (
    "test_account_namespace_is_locally_generated_and_survives_profile_rename",
    "test_login_mfa_and_reads_use_only_the_fixed_operations",
    "test_unknown_operations_and_malformed_inputs_never_reach_the_client",
    "test_restore_rotation_and_logout_keep_tokens_out_of_dispatch_results",
    "test_force_refresh_rotates_the_persistable_record_without_exposing_tokens",
    "test_authentication_and_restore_failures_are_context_specific",
    "test_read_failures_are_distinct_bounded_and_single_attempt",
    "test_malformed_or_forbidden_provider_json_is_rejected_without_echo",
    "test_bounded_helpers_and_default_factory_cover_rejection_edges",
    "test_session_state_and_auth_validation_fail_closed",
    "test_activity_refresh_and_adversarial_branches_are_bounded",
    "test_module_entrypoints_and_retry_headers_fail_closed",
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _executable_lines(path: Path) -> set[int]:
    source = path.read_text(encoding="utf-8")
    lines = {
        line for line in trace._find_executable_linenos(str(path))
        if isinstance(line, int) and line > 0
    }
    tree = ast.parse(source, filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.body:
            lines.difference_update(range(node.lineno + 1, node.body[0].lineno))
    return lines


class _RecordingResult(unittest.TextTestResult):
    executed: list[str]

    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, **kwargs)
        self.executed = []

    def startTest(self, test: unittest.case.TestCase) -> None:  # noqa: N802 - unittest API
        self.executed.append(test.id().rsplit(".", 1)[-1])
        super().startTest(test)


def _run_tests() -> _RecordingResult:
    sys.path.insert(0, str(SOURCE_PATH.parent))
    specification = importlib.util.spec_from_file_location(TEST_MODULE_NAME, TEST_PATH)
    if specification is None or specification.loader is None:
        raise RuntimeError("phase18_python_coverage_test_load_failed")
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    suite = unittest.defaultTestLoader.loadTestsFromModule(module)
    runner = unittest.TextTestRunner(stream=sys.stderr, verbosity=1, resultclass=_RecordingResult)
    result = runner.run(suite)
    if not isinstance(result, _RecordingResult):
        raise RuntimeError("phase18_python_coverage_result_invalid")
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])
    result = tracer.runfunc(_run_tests)
    counts = tracer.results().counts
    source = SOURCE_PATH.resolve()
    executable_lines = _executable_lines(source)
    covered_lines = {
        line for (filename, line), count in counts.items()
        if Path(filename).resolve() == source and count > 0
    } & executable_lines
    missing_lines = sorted(executable_lines - covered_lines)
    executed_cases = sorted(result.executed)
    missing_cases = sorted(set(REQUIRED_CASES) - set(executed_cases))
    passed = result.wasSuccessful() and not missing_cases and not missing_lines
    report = {
        "schema_version": 1,
        "suite": "phase18-garmin-python",
        "status": "passed" if passed else "failed",
        "runtime": {
            "name": "python",
            "version": f"{sys.version_info.major}.{sys.version_info.minor}",
        },
        "sources": [{
            "path": SOURCE_PATH.relative_to(PROJECT_ROOT).as_posix(),
            "sha256": _sha256(SOURCE_PATH),
        }],
        "test": {
            "path": TEST_PATH.relative_to(PROJECT_ROOT).as_posix(),
            "sha256": _sha256(TEST_PATH),
        },
        "tests_run": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "skipped": len(result.skipped),
        "required_cases": list(REQUIRED_CASES),
        "executed_cases": executed_cases,
        "missing_cases": missing_cases,
        "coverage": {
            "lines": {
                "covered": len(covered_lines),
                "missed": len(missing_lines),
                "total": len(executable_lines),
                "percent": round(100 * len(covered_lines) / len(executable_lines), 2),
            },
            # The stdlib `trace` module has no branch oracle, so we do not
            # fabricate a `branches` counter. The defensible secondary metric
            # is the count of required regression case contracts that executed.
            "cases": {
                "covered": len(REQUIRED_CASES) - len(missing_cases),
                "missed": len(missing_cases),
                "total": len(REQUIRED_CASES),
                "percent": round(
                    100 * (len(REQUIRED_CASES) - len(missing_cases)) / len(REQUIRED_CASES),
                    2,
                ),
            },
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
