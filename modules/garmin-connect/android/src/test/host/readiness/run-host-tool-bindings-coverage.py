"""Reusable source-bound host-binding coverage; controlled fixtures, no native proof."""
from pathlib import Path
import os
import ast
import hashlib
import json
import platform
import sys
import unittest
try:
    import coverage
except ImportError:
    raise SystemExit("phase18_host_tools_coverage_dependency_missing")
if coverage.__version__ != "7.16.2":
    raise SystemExit("phase18_host_tools_coverage_version_invalid")
if sys.prefix == sys.base_prefix:
    raise SystemExit("phase18_host_tools_coverage_venv_required")

host = Path(__file__).resolve().parent
root = next(parent for parent in host.parents if (parent / 'modules/garmin-connect/src/index.ts').is_file())
source = host / 'host_tool_bindings.py'
test = host / 'test_host_tool_bindings.py'
support = [host / 'run-kotlin.py', host / 'seal-kotlin.py', Path(__file__).resolve(), host / 'test_host_coverage_producer.py']
out = Path(os.environ.get('GARMIN_READINESS_OUTPUT', root / 'coverage/phase18/readiness-host')).resolve()
out.mkdir(parents=True, exist_ok=True)
inputs_before = {path: path.read_bytes() for path in [source, test, *support]}
sys.path.insert(0, str(host))
expected = {(node.name, node.lineno) for node in ast.walk(ast.parse(inputs_before[source]))
            if isinstance(node, ast.FunctionDef)}
seen = set()


def profile(frame, event, argument):
    if event == 'call' and frame.f_code.co_filename == str(source):
        seen.add((frame.f_code.co_name, frame.f_code.co_firstlineno))


class RecordedResult(unittest.TextTestResult):
    def startTest(self, case):
        executed.append(case.id())
        super().startTest(case)


def case_names(suite):
    for case in suite:
        if isinstance(case, unittest.TestSuite):
            yield from case_names(case)
        else:
            yield case.id()


executed = []
cov = coverage.Coverage(branch=True, data_file=None, config_file=False, include=[str(source)])
cov.start()
sys.setprofile(profile)
try:
    suite = unittest.defaultTestLoader.discover(str(host), pattern=test.name)
    required = sorted(case_names(suite))
    result = unittest.TextTestRunner(verbosity=2, resultclass=RecordedResult).run(suite)
finally:
    sys.setprofile(None)
    cov.stop()
cov.json_report(outfile=str(out / 'coverage.json'))
raw_coverage = json.loads((out / 'coverage.json').read_text())
totals = raw_coverage['totals']
exclusions = [line for entry in raw_coverage['files'].values() for line in entry['excluded_lines']]
if 'pragma: no branch' in inputs_before[source].decode():
    exclusions.append('pragma: no branch')


def counter(covered, total):
    return {'covered': covered, 'missed': total - covered, 'total': total,
            'percent': covered * 100 / total if total else 100}


def binding(paths):
    return [{'path': str(path.relative_to(root)), 'sha256': hashlib.sha256(inputs_before[path]).hexdigest()}
            for path in paths]


metrics = {'statements': counter(totals['covered_lines'], totals['num_statements']),
           'lines': counter(totals['covered_lines'], totals['num_statements']),
           'branches': counter(totals['covered_branches'], totals['num_branches']),
           'functions': counter(len(expected & seen), len(expected))}
source_unchanged = all(path.read_bytes() == contents for path, contents in inputs_before.items())
passed = (result.wasSuccessful() and not result.skipped and source_unchanged
          and len(required) == 16 and len(executed) == 16 and required == sorted(executed)
          and len(set(required)) == 16 and not exclusions
          and all(value['percent'] == 100 for value in metrics.values()))
report = {'schema_version': 1, 'suite': 'phase18-garmin-host-tool-bindings',
          'status': 'passed' if passed else 'failed',
          'runtime_proof': 'NON_NATIVE_CONTROLLED_TOOL_PATH_FIXTURES; no compiler/APK/provider proof',
          'runtime': {'name': 'python', 'version': platform.python_version(), 'venv': True},
          'coverage_engine': coverage.__version__, 'coverage': metrics,
          'tests_run': result.testsRun, 'skipped': len(result.skipped),
          'failures': len(result.failures), 'errors': len(result.errors),
          'required_cases': required, 'executed_cases': sorted(executed),
          'sources': binding([source]), 'tests': binding([test]), 'support': binding(support),
          'source_unchanged': source_unchanged, 'exclusions': exclusions, 'missing_functions': sorted(expected - seen),
          'producer_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
(out / 'host-tool-bindings-coverage.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
raise SystemExit(0 if passed else 1)
