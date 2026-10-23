"""Full focused synthetic tests with four source-bound metrics; NOT native proof."""
from pathlib import Path
import ast
import hashlib
import json
import os
import sys
import types
import unittest
import coverage

HOST = Path(__file__).resolve().parent
ROOT = next(parent for parent in HOST.parents if (parent / 'modules/garmin-connect/src/index.ts').is_file())
OUT = Path(os.environ.get('GARMIN_READINESS_OUTPUT', ROOT / 'artifacts/garmin-readiness-host/final'))
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT / 'modules/garmin-connect/android/src/main/python/garmin_transport_readiness.py'
TEST = ROOT / 'modules/garmin-connect/android/src/test/python/test_garmin_transport_readiness.py'
sys.path.insert(0, str(SOURCE.parent))
source = SOURCE.read_bytes()
function_sites = {(node.name, node.lineno) for node in ast.walk(ast.parse(source)) if isinstance(node, ast.FunctionDef)}
expected = set()
def code_id(code):
    return (code.co_qualname, code.co_firstlineno, hashlib.sha256(code.co_code).hexdigest())
def visit(code):
    for value in code.co_consts:
        if isinstance(value, types.CodeType):
            if (value.co_name, value.co_firstlineno) in function_sites:
                expected.add(code_id(value))
            visit(value)
visit(compile(source, str(SOURCE), 'exec'))
assert len(expected) == len(function_sites)
seen = set()
def profile(frame, event, arg):
    if event == 'call' and frame.f_code.co_filename == str(SOURCE):
        seen.add(code_id(frame.f_code))

cov = coverage.Coverage(branch=True, data_file=str(OUT / '.coverage'), include=[str(SOURCE)])
cov.start()
sys.setprofile(profile)
try:
    suite = unittest.defaultTestLoader.discover(str(TEST.parent), pattern=TEST.name)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
finally:
    sys.setprofile(None)
    cov.stop()
cov.save()
cov.json_report(outfile=str(OUT / 'python-coverage-raw.json'))
raw = json.loads((OUT / 'python-coverage-raw.json').read_text())
summary = raw['totals']
def counter(covered, total):
    return {'covered': covered, 'missed': total-covered, 'total': total, 'percent': 100 if total == 0 else covered * 100 / total}
metrics = {'statements': counter(summary['covered_lines'], summary['num_statements']),
           'lines': counter(summary['covered_lines'], summary['num_statements']),
           'branches': counter(summary['covered_branches'], summary['num_branches']),
           'functions': counter(len(expected & seen), len(expected))}
report = {'status': 'passed' if result.wasSuccessful() and not result.skipped and all(m['percent']==100 for m in metrics.values()) else 'failed',
          'runtime_proof': 'NON_NATIVE_HOST_ONLY_SYNTHETIC_MODULES_WITH_NETWORK_DENIAL',
          'coverage_engine': coverage.__version__, 'host_python': sys.version.split()[0],
          'tests_run': result.testsRun, 'skipped': len(result.skipped), 'failures': len(result.failures), 'errors': len(result.errors),
          'source': {'path': str(SOURCE.relative_to(ROOT)), 'sha256': hashlib.sha256(source).hexdigest()},
          'test': {'path': str(TEST.relative_to(ROOT)), 'sha256': hashlib.sha256(TEST.read_bytes()).hexdigest()},
          'coverage': metrics, 'missing_functions': sorted(expected-seen)}
(OUT / 'python-four-metrics.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
raise SystemExit(0 if report['status']=='passed' else 1)
