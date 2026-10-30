"""Controlled host tool fixtures; no actual compiler, APK, native or provider proof."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from host_tool_bindings import ToolBindingError, resolve_tool_bindings

HOST = Path(__file__).resolve().parent
ARTIFACTS = [
    ('org.json', 'json', '20180813'),
    ('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.20'),
    ('org.jetbrains', 'annotations', '13.0'),
    ('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.9.0'),
    ('junit', 'junit', '4.13.2'),
    ('org.hamcrest', 'hamcrest-core', '1.3'),
    ('com.chaquo.python.runtime', 'chaquopy_java', '17.0.0'),
    ('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20'),
    ('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.1.20'),
    ('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'),
    ('org.jetbrains.intellij.deps', 'trove4j', '1.0.20200330'),
    ('org.jacoco', 'org.jacoco.agent', '0.8.13'),
    ('org.jacoco', 'org.jacoco.core', '0.8.13'),
    ('org.jacoco', 'org.jacoco.report', '0.8.13'),
    ('org.ow2.asm', 'asm', '9.8'),
    ('org.ow2.asm', 'asm-commons', '9.8'),
    ('org.ow2.asm', 'asm-tree', '9.8'),
]
JAVA_VERSION = 'openjdk version "17.0.20" 2026-07-21\nOpenJDK Runtime Environment Temurin-17.0.20+8\n'


class ToolFixture:
    def __init__(self, root, layout='linux', custom_cache=True):
        root = root.resolve()
        self.root = root
        self.home = root / 'empty-user-home'
        self.java_home = root / ('linux-tools/jdk17' if layout == 'linux' else 'Alternate Mac Tools/Temurin 17/Contents/Home')
        self.sdk = root / ('linux-tools/android-sdk' if layout == 'linux' else 'Alternate Mac Tools/Android SDK')
        self.gradle = root / 'custom-gradle-cache' if custom_cache else self.home / '.gradle'
        self.cache = self.gradle / 'caches/modules-2/files-2.1'
        self.output = root / 'controlled-output'
        self.audit = root / 'invocations.jsonl'
        self.environment = {**os.environ, 'HOME': str(self.home), 'JAVA_HOME': str(self.java_home),
                            'ANDROID_HOME': str(self.sdk), 'ANDROID_SDK_ROOT': str(self.sdk),
                            'GARMIN_READINESS_OUTPUT': str(self.output), 'TOOL_FIXTURE_AUDIT': str(self.audit)}
        self.environment.pop('GRADLE_USER_HOME', None)
        if custom_cache:
            self.environment['GRADLE_USER_HOME'] = str(self.gradle)
        self.home.mkdir(parents=True)
        self.java_home.joinpath('bin').mkdir(parents=True)
        for name in ('java', 'javac'):
            executable = self.java_home / 'bin' / name
            executable.write_text(f'#!{sys.executable}\n' +
                'import json, os, pathlib, sys\n' +
                'name = pathlib.Path(sys.argv[0]).name\n' +
                'if sys.argv[1:] == ["-version"]:\n' +
                f'    print({JAVA_VERSION!r} if name == "java" else "javac 17.0.20", end="")\n' +
                '    raise SystemExit(0)\n' +
                'with open(os.environ["TOOL_FIXTURE_AUDIT"], "a") as target:\n' +
                '    target.write(json.dumps({"executable": sys.argv[0], "args": sys.argv[1:]}) + "\\n")\n' +
                'raise SystemExit(73)\n')
            executable.chmod(0o755)
        platform = self.sdk / 'platforms/android-36'
        platform.mkdir(parents=True)
        platform.joinpath('source.properties').write_text('Pkg.Revision=2\nAndroidVersion.ApiLevel=36\n')
        self.archive(platform / 'android.jar')
        for group, name, version in ARTIFACTS:
            self.archive(self.artifact(group, name, version))

    @staticmethod
    def archive(path):
        path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(path, 'w') as archive:
            archive.writestr('META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\n')
            if path.name == 'org.jacoco.agent-0.8.13.jar':
                archive.writestr('jacocoagent.jar', b'controlled-agent')

    def artifact(self, group, name, version):
        return self.cache / group / name / version / 'controlled-hash' / f'{name}-{version}.jar'

    def script(self, name):
        return subprocess.run([sys.executable, str(HOST / name)], env=self.environment,
                              capture_output=True, text=True, timeout=10)

    def calls(self):
        return [json.loads(line) for line in self.audit.read_text().splitlines()] if self.audit.exists() else []


class ConfiguredToolchainRegression(unittest.TestCase):
    def test_runner_and_sealer_use_configured_linux_and_alternate_mac_tools(self):
        for script in ('run-kotlin.py', 'seal-kotlin.py'):
            for layout, custom_cache in (('linux', True), ('mac', False)):
                with self.subTest(script=script, layout=layout), tempfile.TemporaryDirectory() as directory:
                    fixture = ToolFixture(Path(directory), layout, custom_cache)
                    result = fixture.script(script)
                    # The selected controlled executable deliberately rejects compilation.
                    # check=True reports the controlled compiler's exit 73 as a script failure.
                    self.assertEqual(result.returncode, 1)
                    calls = fixture.calls()
                    self.assertEqual(len(calls), 1)
                    self.assertIn('non-zero exit status 73', result.stderr)
                    expected = fixture.java_home / 'bin' / ('java' if script == 'run-kotlin.py' else 'javac')
                    self.assertEqual(calls[0]['executable'], str(expected))
                    classpath = calls[0]['args'][calls[0]['args'].index('-cp') + 1]
                    self.assertIn(str(fixture.cache), classpath)
                    if script == 'run-kotlin.py':
                        self.assertIn(str(fixture.sdk / 'platforms/android-36/android.jar'), classpath)
                    else:
                        for artifact in ('asm', 'asm-commons', 'asm-tree'):
                            self.assertIn(str(fixture.artifact('org.ow2.asm', artifact, '9.8')), classpath)

    def test_every_missing_pinned_dependency_rejects_before_compilation(self):
        for index, coordinate in enumerate(ARTIFACTS):
            script = 'run-kotlin.py' if index < 12 else 'seal-kotlin.py'
            with self.subTest(coordinate=coordinate), tempfile.TemporaryDirectory() as directory:
                fixture = ToolFixture(Path(directory))
                fixture.artifact(*coordinate).unlink()
                result = fixture.script(script)
                self.assertEqual(result.returncode, 1)
                self.assertIn('host_tool_binding_invalid:jar_binding', result.stderr)
                self.assertEqual(fixture.calls(), [])
                self.assertFalse(fixture.output.exists())

    def test_invalid_toolchain_rejects_both_scripts_before_compilation(self):
        for script in ('run-kotlin.py', 'seal-kotlin.py'):
            for variable, value in (('JAVA_HOME', 'relative/jdk'), ('ANDROID_HOME', 'relative/sdk'),
                                    ('GRADLE_USER_HOME', 'relative/cache')):
                with self.subTest(script=script, variable=variable), tempfile.TemporaryDirectory() as directory:
                    fixture = ToolFixture(Path(directory))
                    fixture.environment[variable] = value
                    result = fixture.script(script)
                    self.assertEqual(result.returncode, 1)
                    self.assertIn('host_tool_binding_invalid:', result.stderr)
                    self.assertEqual(fixture.calls(), [])
                    self.assertFalse(fixture.output.exists())

    def test_agent_member_is_checked_before_the_compiler_runs(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = ToolFixture(Path(directory))
            agent = fixture.artifact('org.jacoco', 'org.jacoco.agent', '0.8.13')
            with zipfile.ZipFile(agent, 'w') as archive:
                archive.writestr('META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\n')
            result = fixture.script('run-kotlin.py')
            self.assertEqual(result.returncode, 1)
            self.assertIn('jacocoagent.jar', result.stderr)
            self.assertEqual(fixture.calls(), [])
            self.assertFalse(fixture.output.exists())


class BindingValidation(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.fixture = ToolFixture(Path(self.temporary.name))

    def binding(self):
        return resolve_tool_bindings(self.fixture.environment)

    def reject(self, reason):
        with self.assertRaisesRegex(ToolBindingError, f'host_tool_binding_invalid:{reason}'):
            self.binding()
        self.assertEqual(self.fixture.calls(), [])

    def executable(self, name, body):
        target = self.fixture.java_home / 'bin' / name
        target.write_text(f'#!{sys.executable}\n' + body)

    def test_resolves_exact_artifacts_and_preserves_frozen_binding(self):
        tools = self.binding()
        self.assertEqual(tools.java, self.fixture.java_home / 'bin/java')
        self.assertEqual(tools.javac, self.fixture.java_home / 'bin/javac')
        self.assertEqual(tools.cache, self.fixture.cache)
        self.assertEqual(tools.android_jar, self.fixture.sdk / 'platforms/android-36/android.jar')
        for coordinate in ARTIFACTS:
            self.assertEqual(tools.jar(*coordinate), self.fixture.artifact(*coordinate))
        with self.assertRaises(AttributeError):
            tools.java = Path('/replacement')
        self.assertEqual(self.fixture.calls(), [])

    def test_environment_defaults_sdk_aliases_and_home_expansion(self):
        fixture = self.fixture
        fixture.environment.pop('ANDROID_HOME')
        self.assertEqual(self.binding().android_jar, fixture.sdk / 'platforms/android-36/android.jar')
        fixture.environment['ANDROID_HOME'] = str(fixture.sdk)
        fixture.environment.pop('ANDROID_SDK_ROOT')
        self.assertEqual(self.binding().android_jar, fixture.sdk / 'platforms/android-36/android.jar')
        alias = fixture.root / 'sdk-alias'
        alias.symlink_to(fixture.sdk, target_is_directory=True)
        fixture.environment['ANDROID_SDK_ROOT'] = str(alias)
        with patch.dict(os.environ, fixture.environment, clear=True):
            self.assertEqual(resolve_tool_bindings().cache, fixture.cache)
        self.assertEqual(self.binding().android_jar, fixture.sdk / 'platforms/android-36/android.jar')
        fixture.home.joinpath('jdk-alias').symlink_to(fixture.java_home, target_is_directory=True)
        fixture.environment['JAVA_HOME'] = '~/jdk-alias'
        with patch.dict(os.environ, fixture.environment, clear=True):
            self.assertEqual(resolve_tool_bindings().java, fixture.java_home / 'bin/java')

    def test_default_gradle_home_uses_the_callers_home(self):
        fixture = ToolFixture(self.fixture.root / 'defaults', custom_cache=False)
        self.assertEqual(resolve_tool_bindings(fixture.environment).cache, fixture.cache)

    def test_missing_relative_and_non_directory_homes_fail_closed(self):
        for value, reason in ((None, 'java_home_missing'), ('', 'java_home_missing'),
                              ('relative', 'java_home_directory'), (str(self.fixture.audit), 'java_home_directory')):
            with self.subTest(value=value):
                if value is None:
                    self.fixture.environment.pop('JAVA_HOME', None)
                else:
                    self.fixture.environment['JAVA_HOME'] = value
                self.reject(reason)

    def test_java_and_javac_must_be_executable_files(self):
        for name in ('java', 'javac'):
            target = self.fixture.java_home / 'bin' / name
            original = target.read_bytes()
            for action in ('missing', 'not_executable'):
                with self.subTest(name=name, action=action):
                    if action == 'missing':
                        target.unlink()
                    else:
                        target.chmod(0o644)
                    self.reject(f'{name}_file')
                    target.write_bytes(original)
                    target.chmod(0o755)

    def test_sdk_home_presence_and_consistency(self):
        fixture = self.fixture
        fixture.environment.pop('ANDROID_HOME')
        fixture.environment.pop('ANDROID_SDK_ROOT')
        self.reject('android_home_missing')
        fixture.environment['ANDROID_HOME'] = str(fixture.sdk)
        fixture.environment['ANDROID_SDK_ROOT'] = str(fixture.home)
        self.reject('android_roots_mismatch')
        fixture.environment['ANDROID_SDK_ROOT'] = ''
        self.reject('android_sdk_root_missing')

    def test_android_platform_metadata_and_archive_are_required(self):
        platform = self.fixture.sdk / 'platforms/android-36'
        properties = platform / 'source.properties'
        properties.unlink()
        self.reject('android_platform_file')
        properties.write_text('AndroidVersion.ApiLevel=35\n')
        self.reject('android_api_pin')
        properties.write_text('AndroidVersion.ApiLevel = 36\n')
        android = platform / 'android.jar'
        android.unlink()
        self.reject('android_platform_file')
        android.write_bytes(b'not an Android archive')
        self.reject('android_platform_archive')

    def test_gradle_home_and_cache_are_required_without_fallback(self):
        fixture = self.fixture
        fixture.environment['GRADLE_USER_HOME'] = ''
        self.reject('gradle_home_missing')
        fixture.environment['GRADLE_USER_HOME'] = str(fixture.home)
        self.reject('gradle_cache_directory')

    def test_exact_java_vendor_version_and_build_are_required(self):
        for version in (JAVA_VERSION.replace('17.0.20"', '17.0.19"'),
                        JAVA_VERSION.replace('Temurin', 'OtherVendor'),
                        JAVA_VERSION.replace('+8', '+80'), JAVA_VERSION.replace('+8', '+8.1')):
            with self.subTest(version=version):
                self.executable('java', f'print({version!r})\n')
                self.reject('java_pin')

    def test_exact_javac_version_is_required(self):
        self.executable('javac', 'print("javac 17.0.19")\n')
        self.reject('javac_pin')

    def test_version_probe_errors_are_sanitized(self):
        self.executable('java', 'raise SystemExit(7)\n')
        self.reject('version_probe_failed')
        target = self.fixture.java_home / 'bin/java'
        target.write_text('this is not an executable format\n')
        self.reject('version_probe_failed')

    def test_dependency_missing_ambiguous_or_corrupt_never_falls_back(self):
        tools = self.binding()
        coordinate = ARTIFACTS[0]
        artifact = self.fixture.artifact(*coordinate)
        source = artifact.with_name('json-20180813-sources.jar')
        self.fixture.archive(source)
        self.assertEqual(tools.jar(*coordinate), artifact)
        duplicate = artifact.parent.parent / 'another-hash' / artifact.name
        self.fixture.archive(duplicate)
        with self.assertRaisesRegex(ToolBindingError, 'jar_binding'):
            tools.jar(*coordinate)
        duplicate.unlink()
        artifact.unlink()
        with self.assertRaisesRegex(ToolBindingError, 'jar_binding'):
            tools.jar(*coordinate)
        artifact.write_bytes(b'corrupt jar')
        with self.assertRaisesRegex(ToolBindingError, 'dependency_archive'):
            tools.jar(*coordinate)


if __name__ == '__main__':
    unittest.main()
