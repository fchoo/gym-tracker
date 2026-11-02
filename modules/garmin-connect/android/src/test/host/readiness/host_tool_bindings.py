"""Pinned, credential-free host compiler bindings. No installation or native execution."""
from dataclasses import dataclass
from pathlib import Path
import os
import re
import subprocess
import zipfile


class ToolBindingError(RuntimeError):
    pass


def _directory(value, label):
    if not value:
        raise ToolBindingError(f'host_tool_binding_invalid:{label}_missing')
    directory = Path(value).expanduser()
    if not directory.is_absolute() or not directory.is_dir():
        raise ToolBindingError(f'host_tool_binding_invalid:{label}_directory')
    return directory.resolve()


def _file(path, label, executable=False):
    if not path.is_file() or (executable and not os.access(path, os.X_OK)):
        raise ToolBindingError(f'host_tool_binding_invalid:{label}_file')
    return path.resolve()


def _archive(path, label):
    path = _file(path, label)
    if not zipfile.is_zipfile(path):
        raise ToolBindingError(f'host_tool_binding_invalid:{label}_archive')
    return path


def _version(executable, environment):
    try:
        result = subprocess.run([str(executable), '-version'], check=True, capture_output=True,
                                text=True, timeout=10, env=environment)
    except (OSError, subprocess.SubprocessError) as error:
        raise ToolBindingError('host_tool_binding_invalid:version_probe_failed') from error
    return result.stdout + result.stderr


@dataclass(frozen=True)
class HostToolBindings:
    java: Path
    javac: Path
    cache: Path
    android_jar: Path

    def jar(self, group, name, version):
        # Select the binary artifact, never a sources/javadoc jar or an arbitrary cache hit.
        candidates = list((self.cache / group / name / version).glob(f'*/{name}-{version}.jar'))
        if len(candidates) != 1:
            raise ToolBindingError('host_tool_binding_invalid:jar_binding')
        return _archive(candidates[0], 'dependency')


def resolve_tool_bindings(environment=None):
    environment = os.environ if environment is None else environment
    java_home = _directory(environment.get('JAVA_HOME'), 'java_home')
    java = _file(java_home / 'bin/java', 'java', executable=True)
    javac = _file(java_home / 'bin/javac', 'javac', executable=True)
    sdk = _directory(environment.get('ANDROID_HOME') if 'ANDROID_HOME' in environment
                     else environment.get('ANDROID_SDK_ROOT'), 'android_home')
    if 'ANDROID_HOME' in environment and 'ANDROID_SDK_ROOT' in environment:
        if sdk != _directory(environment['ANDROID_SDK_ROOT'], 'android_sdk_root'):
            raise ToolBindingError('host_tool_binding_invalid:android_roots_mismatch')
    properties = _file(sdk / 'platforms/android-36/source.properties', 'android_platform')
    if not re.search(r'^AndroidVersion\.ApiLevel\s*=\s*36\s*$', properties.read_text(), re.MULTILINE):
        raise ToolBindingError('host_tool_binding_invalid:android_api_pin')
    android_jar = _archive(sdk / 'platforms/android-36/android.jar', 'android_platform')
    gradle_home = _directory(environment.get('GRADLE_USER_HOME') if 'GRADLE_USER_HOME' in environment
                             else Path(environment.get('HOME', str(Path.home()))) / '.gradle', 'gradle_home')
    cache = _directory(gradle_home / 'caches/modules-2/files-2.1', 'gradle_cache')
    java_version = _version(java, environment)
    if not re.search(r'^openjdk version "17\.0\.20"(?:\s|$)', java_version, re.MULTILINE) or not re.search(
            r'\bTemurin-17\.0\.20\+8(?:[- )\r\n]|$)', java_version):
        raise ToolBindingError('host_tool_binding_invalid:java_pin')
    if not re.fullmatch(r'javac 17\.0\.20\s*', _version(javac, environment)):
        raise ToolBindingError('host_tool_binding_invalid:javac_pin')
    return HostToolBindings(java, javac, cache, android_jar)
