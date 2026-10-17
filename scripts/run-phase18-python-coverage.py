#!/usr/bin/env python3
"""Run the Phase 18 Python bridge tests and emit a source-bound coverage report."""

from __future__ import annotations

import argparse
import hashlib
import importlib
import importlib.util
import json
from pathlib import Path
import sys
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = PROJECT_ROOT / "modules/garmin-connect/android/src/main/python/garmin_bridge.py"
TEST_PATH = PROJECT_ROOT / "modules/garmin-connect/android/src/test/python/test_garmin_bridge.py"
DEFAULT_OUTPUT = PROJECT_ROOT / "coverage/phase18/python-coverage.json"
TEST_MODULE_NAME = "phase18_test_garmin_bridge"
REQUIRED_COVERAGE_VERSION = "7.16.2"
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
    "test_phase20_recovery_extension_control_flow_covers_restore_rejection_and_complete_reads",
)
def _load_coverage_module():
    original_path = list(sys.path)
    blocked = {
        str(PROJECT_ROOT),
        str(PROJECT_ROOT / "scripts"),
        "",
    }
    sys.path[:] = [entry for entry in sys.path if entry not in blocked]
    try:
        return importlib.import_module("coverage")
    except ImportError:
        return None
    finally:
        sys.path[:] = original_path


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


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


def _run_with_coverage_py(coverage_lib):
    coverage = coverage_lib.Coverage(
        branch=True,
        source=[str(SOURCE_PATH.parent)],
        data_file=None,
    )
    coverage.start()
    try:
        result = _run_tests()
    finally:
        coverage.stop()
    _, statements, _excluded, missing_lines, _missing_formatted = coverage.analysis2(
        str(SOURCE_PATH)
    )
    branch_stats = coverage.branch_stats(str(SOURCE_PATH))
    total_branches = sum(total for total, _taken in branch_stats.values())
    covered_branches = sum(taken for _total, taken in branch_stats.values())
    missing_branches = sorted(
        (line, total - taken)
        for line, (total, taken) in branch_stats.items()
        if taken != total
    )
    return (
        result,
        statements,
        missing_lines,
        covered_branches,
        total_branches,
        missing_branches,
        "coverage.py",
    )


def _counter(covered: int, total: int) -> dict[str, int | float]:
    missed = total - covered
    percent = 100 if total == 0 else round(100 * covered / total, 2)
    return {
        "covered": covered,
        "missed": missed,
        "total": total,
        "percent": percent,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    coverage_lib = _load_coverage_module()
    if coverage_lib is None:
        print("phase18_python_coverage_dependency_missing", file=sys.stderr)
        return 1
    if getattr(coverage_lib, "__version__", None) != REQUIRED_COVERAGE_VERSION:
        print("phase18_python_coverage_version_mismatch", file=sys.stderr)
        return 1
    (
        result,
        statements,
        missing_lines,
        covered_branches,
        total_branches,
        missing_branches,
        coverage_engine,
    ) = _run_with_coverage_py(coverage_lib)
    covered_lines = len(set(statements) - set(missing_lines))
    total_lines = len(statements)
    missing_lines = sorted(missing_lines)
    executed_cases = sorted(result.executed)
    missing_cases = sorted(set(REQUIRED_CASES) - set(executed_cases))
    passed = (
        result.wasSuccessful()
        and not missing_cases
        and not missing_lines
        and not missing_branches
    )
    report = {
        "schema_version": 1,
        "suite": "phase18-garmin-python",
        "status": "passed" if passed else "failed",
        "runtime": {
            "name": "python",
            "version": f"{sys.version_info.major}.{sys.version_info.minor}",
        },
        "coverage_engine": coverage_engine,
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
            "lines": _counter(covered_lines, total_lines),
            "branches": _counter(covered_branches, total_branches),
        },
        "missing_lines": missing_lines,
        "missing_branches": [list(arc) for arc in missing_branches],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
