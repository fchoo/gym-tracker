"""Real producer subprocesses over controlled source fixtures; no compiler or native proof."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import unittest

HOST = Path(__file__).resolve().parent
PRODUCER = HOST / 'run-host-tool-bindings-coverage.py'


class ProducerFixture:
    def __init__(self, root, count=16):
        self.root = root.resolve()
        self.host = self.root / 'modules/garmin-connect/android/src/test/host/readiness'
        self.host.mkdir(parents=True)
        marker = self.root / 'modules/garmin-connect/src/index.ts'
        marker.parent.mkdir(parents=True)
        marker.write_text('// controlled repository marker\n')
        self.producer = self.host / PRODUCER.name
        self.producer.write_bytes(PRODUCER.read_bytes())
        self.source = self.host / 'host_tool_bindings.py'
        self.source.write_text('def choose(value):\n    if value:\n        return 1\n    return 0\n')
        self.test = self.host / 'test_host_tool_bindings.py'
        self.test.write_text('import unittest\nimport host_tool_bindings as helper\nclass Complete(unittest.TestCase):\n' + ''.join(
            f'    def test_case_{index:02d}(self):\n        self.assertEqual(helper.choose(True), 1)\n        self.assertEqual(helper.choose(False), 0)\n'
            for index in range(count)))
        for name in ('run-kotlin.py', 'seal-kotlin.py', 'test_host_coverage_producer.py'):
            self.host.joinpath(name).write_text('# controlled support source\n')
        self.output = self.root / 'output'
        self.environment = {**os.environ, 'GARMIN_READINESS_OUTPUT': str(self.output),
                            'PYTHONDONTWRITEBYTECODE': '1', 'COVERAGE_FILE': str(self.root / '.coverage')}
        self.root.joinpath('.coverage').write_bytes(b'preserve existing root coverage')

    def run(self, executable=None, flags=()):
        return subprocess.run([executable or sys.executable, *flags, str(self.producer)],
                              env=self.environment, capture_output=True, text=True, timeout=10)

    def report(self):
        return json.loads((self.output / 'host-tool-bindings-coverage.json').read_text())


class HostCoverageProducer(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.fixture = ProducerFixture(Path(self.temporary.name))

    def test_complete_source_measurement_binds_producer_and_preserves_root_coverage(self):
        result = self.fixture.run()
        self.assertEqual(result.returncode, 0, result.stderr)
        report = self.fixture.report()
        self.assertEqual(report['tests_run'], 16)
        self.assertEqual(report['required_cases'], report['executed_cases'])
        self.assertEqual(len(set(report['executed_cases'])), 16)
        self.assertTrue(report['source_unchanged'])
        self.assertEqual(report['missing_functions'], [])
        self.assertEqual(report['exclusions'], [])
        self.assertEqual(len(report['support']), 4)
        self.assertEqual(report['producer_sha256'], report['support'][2]['sha256'])
        for metric in report['coverage'].values():
            self.assertEqual(metric['percent'], 100)
        self.assertEqual(self.fixture.root.joinpath('.coverage').read_bytes(), b'preserve existing root coverage')
        self.assertFalse(self.fixture.output.joinpath('.coverage').exists())

    def test_partial_and_extra_cases_fail_closed(self):
        for count in (15, 17):
            with self.subTest(count=count), tempfile.TemporaryDirectory() as directory:
                fixture = ProducerFixture(Path(directory), count)
                self.assertEqual(fixture.run().returncode, 1)
                self.assertEqual(fixture.report()['status'], 'failed')

    def test_skips_failures_and_errors_cannot_be_passed_evidence(self):
        for replacement, counter in (
                ('    @unittest.skip("controlled")\n    def test_case_00(self):', 'skipped'),
                ('    def test_case_00(self):\n        self.fail("controlled")', 'failures'),
                ('    def test_case_00(self):\n        raise RuntimeError("controlled")', 'errors')):
            with self.subTest(counter=counter), tempfile.TemporaryDirectory() as directory:
                fixture = ProducerFixture(Path(directory))
                fixture.test.write_text(fixture.test.read_text().replace('    def test_case_00(self):', replacement))
                self.assertEqual(fixture.run().returncode, 1)
                self.assertEqual(fixture.report()[counter], 1)

    def test_source_drift_and_missing_functions_fail_closed(self):
        for mode in ('drift', 'missing'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                fixture = ProducerFixture(Path(directory))
                if mode == 'drift':
                    fixture.test.write_text(fixture.test.read_text().replace('    def test_case_00(self):',
                        '    def test_case_00(self):\n        with open(helper.__file__, "a") as target:\n            target.write("# controlled source drift\\n")'))
                else:
                    fixture.source.write_text(fixture.source.read_text() + '\ndef uncalled():\n    return 2\n')
                self.assertEqual(fixture.run().returncode, 1)
                report = fixture.report()
                self.assertFalse(report['source_unchanged']) if mode == 'drift' else self.assertTrue(report['missing_functions'])

    def test_exclusions_cannot_reduce_the_measured_source(self):
        for pragma in ('no cover', 'no branch'):
            with self.subTest(pragma=pragma), tempfile.TemporaryDirectory() as directory:
                fixture = ProducerFixture(Path(directory))
                fixture.source.write_text(fixture.source.read_text().replace('if value:', f'if value:  # pragma: {pragma}'))
                self.assertEqual(fixture.run().returncode, 1)
                self.assertTrue(fixture.report()['exclusions'])

    def test_missing_or_wrong_coverage_and_non_venv_interpreters_fail_before_measurement(self):
        self.assertIn('phase18_host_tools_coverage_dependency_missing', self.fixture.run(flags=('-S',)).stderr)
        self.fixture.root.joinpath('coverage.py').write_text('__version__ = "0.0.0"\n')
        self.fixture.environment['PYTHONPATH'] = str(self.fixture.root)
        self.assertIn('phase18_host_tools_coverage_version_invalid', self.fixture.run().stderr)
        self.fixture.root.joinpath('coverage.py').write_text('__version__ = "7.16.2"\n')
        self.assertIn('phase18_host_tools_coverage_venv_required', self.fixture.run(executable=sys._base_executable).stderr)
        self.assertFalse(self.fixture.output.exists())


if __name__ == '__main__':
    unittest.main()
