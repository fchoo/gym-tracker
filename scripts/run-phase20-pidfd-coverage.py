#!/usr/bin/env python3
"""Run exact, source-bound coverage for the Linux pidfd integrity helper."""

from __future__ import annotations

import argparse
import ast
import hashlib
import importlib
import importlib.util
import json
from pathlib import Path
import sys
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = PROJECT_ROOT / "scripts/v12-linux-pidfd-signal.py"
TEST_PATH = PROJECT_ROOT / "scripts/test_v12_linux_pidfd_signal.py"
DEFAULT_OUTPUT = PROJECT_ROOT / "coverage/phase20/pidfd-coverage.json"
TEST_MODULE_NAME = "phase20_test_v12_linux_pidfd_signal"
REQUIRED_COVERAGE_VERSION = "7.16.2"
METRICS = ("statements", "branches", "functions", "lines")


def _load_coverage_module():
    original_path = list(sys.path)
    blocked = {str(PROJECT_ROOT), str(PROJECT_ROOT / "scripts"), ""}
    sys.path[:] = [entry for entry in sys.path if entry not in blocked]
    try:
        return importlib.import_module("coverage")
    except ImportError:
        return None
    finally:
        sys.path[:] = original_path


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _counter(covered: int, total: int) -> dict[str, int | float]:
    missed = total - covered
    return {
        "covered": covered,
        "missed": missed,
        "total": total,
        "percent": 100 if total == 0 else round(100 * covered / total, 2),
    }


def _defined_functions() -> set[str]:
    module = ast.parse(SOURCE_PATH.read_text(encoding="utf-8"), filename=str(SOURCE_PATH))
    return {node.name for node in module.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}


def _run_tests(coverage):
    specification = importlib.util.spec_from_file_location(TEST_MODULE_NAME, TEST_PATH)
    if specification is None or specification.loader is None:
        raise RuntimeError("phase20_pidfd_coverage_test_load_failed")
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    executed_functions: set[str] = set()
    previous_trace = sys.getprofile()

    def record_call(frame, event, argument):
        if event == "call" and Path(frame.f_code.co_filename) == SOURCE_PATH:
            executed_functions.add(frame.f_code.co_name)
        return record_call

    suite = unittest.defaultTestLoader.loadTestsFromModule(module)
    runner = unittest.TextTestRunner(stream=sys.stderr, verbosity=1)
    sys.setprofile(record_call)
    coverage.start()
    try:
        result = runner.run(suite)
    finally:
        coverage.stop()
        sys.setprofile(previous_trace)
    return result, executed_functions


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    coverage_lib = _load_coverage_module()
    if coverage_lib is None:
        print("phase20_pidfd_coverage_dependency_missing", file=sys.stderr)
        return 1
    if getattr(coverage_lib, "__version__", None) != REQUIRED_COVERAGE_VERSION:
        print("phase20_pidfd_coverage_version_mismatch", file=sys.stderr)
        return 1
    coverage = coverage_lib.Coverage(branch=True, source=[str(SOURCE_PATH.parent)], data_file=None)
    result, executed_functions = _run_tests(coverage)
    _, statements, _excluded, missing_lines, _missing_formatted = coverage.analysis2(str(SOURCE_PATH))
    branch_stats = coverage.branch_stats(str(SOURCE_PATH))
    total_branches = sum(total for total, _taken in branch_stats.values())
    covered_branches = sum(taken for _total, taken in branch_stats.values())
    defined_functions = _defined_functions()
    coverage_metrics = {
        "statements": _counter(len(set(statements) - set(missing_lines)), len(statements)),
        "branches": _counter(covered_branches, total_branches),
        "functions": _counter(len(executed_functions & defined_functions), len(defined_functions)),
        "lines": _counter(len(set(statements) - set(missing_lines)), len(statements)),
    }
    missing_functions = sorted(defined_functions - executed_functions)
    passed = result.wasSuccessful() and all(metric["percent"] == 100 for metric in coverage_metrics.values())
    report = {
        "schema_version": 1,
        "suite": "phase20-linux-pidfd-signal",
        "status": "passed" if passed else "failed",
        "runtime": {"name": "python", "version": f"{sys.version_info.major}.{sys.version_info.minor}"},
        "coverage_engine": "coverage.py",
        "sources": [{"path": SOURCE_PATH.relative_to(PROJECT_ROOT).as_posix(), "sha256": _sha256(SOURCE_PATH)}],
        "tests": [{"path": TEST_PATH.relative_to(PROJECT_ROOT).as_posix(), "sha256": _sha256(TEST_PATH)}],
        "tests_run": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "skipped": len(result.skipped),
        "metrics": list(METRICS),
        "coverage": coverage_metrics,
        "missing_lines": sorted(missing_lines),
        "missing_branches": sorted([line, total - taken] for line, (total, taken) in branch_stats.items() if total != taken),
        "defined_functions": sorted(defined_functions),
        "executed_functions": sorted(executed_functions & defined_functions),
        "missing_functions": missing_functions,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
