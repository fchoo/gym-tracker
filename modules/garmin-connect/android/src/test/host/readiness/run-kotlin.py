"""NON_NATIVE_HOST_ONLY compiler/JUnit/JaCoCo. Reuses existing jars; no Gradle/APK."""
from pathlib import Path
import os
import subprocess
import zipfile
from host_tool_bindings import resolve_tool_bindings

HOST = Path(__file__).resolve().parent
ROOT = next(parent for parent in HOST.parents if (parent / 'modules/garmin-connect/src/index.ts').is_file())
OUT = Path(os.environ.get('GARMIN_READINESS_OUTPUT', ROOT / 'artifacts/garmin-readiness-host/final')).expanduser().resolve()
tools = resolve_tool_bindings()
JAVA = tools.java
jar = tools.jar

libs = [jar('org.json', 'json', '20180813'), jar('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.20'),
        jar('org.jetbrains', 'annotations', '13.0'), jar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.9.0'),
        jar('junit', 'junit', '4.13.2'), jar('org.hamcrest', 'hamcrest-core', '1.3'),
        jar('com.chaquo.python.runtime', 'chaquopy_java', '17.0.0'),
        tools.android_jar]
compiler = [jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20'), *libs,
            jar('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.1.20'),
            jar('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'),
            jar('org.jetbrains.intellij.deps', 'trove4j', '1.0.20200330')]
with zipfile.ZipFile(jar('org.jacoco', 'org.jacoco.agent', '0.8.13')) as archive:
    agent = archive.read('jacocoagent.jar')

OUT.mkdir(parents=True, exist_ok=True)
classes = OUT / 'classes-final'
classes.mkdir(exist_ok=True)
sources = list((ROOT / 'modules/garmin-connect/android/src/main/java').rglob('*.kt')) + list((ROOT / 'modules/garmin-connect/android/src/test/java').rglob('*.kt')) + list((HOST / 'stubs').glob('*.kt'))
subprocess.run([str(JAVA), '-cp', os.pathsep.join(map(str, compiler)), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
                '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', os.pathsep.join(map(str, libs)),
                '-d', str(classes), *map(str, sources)], check=True, cwd=ROOT)
(OUT / 'jacocoagent.jar').write_bytes(agent)
fakes = OUT / 'fake-classes'
fakes.mkdir(exist_ok=True)
subprocess.run([str(tools.javac), '-cp', str(libs[-1]), '-d', str(fakes), *map(str, (HOST / 'fake-api').rglob('*.java'))], check=True)
boundaries = OUT / 'boundary-classes'
boundaries.mkdir(exist_ok=True)
subprocess.run([str(JAVA), '-cp', os.pathsep.join(map(str, compiler)), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
                '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-Xfriend-paths=' + str(classes),
                '-classpath', os.pathsep.join(map(str, [fakes, classes, *libs])), '-d', str(boundaries),
                str(HOST / 'HostDiagnosticBoundaryTest.kt')], check=True)
tests = ['expo.modules.garminconnect.GarminConnectModuleTest', 'expo.modules.garminconnect.GarminTransportReadinessTest', 'expo.modules.garminconnect.HostDiagnosticBoundaryTest']
result = subprocess.run([str(JAVA), f'-javaagent:{OUT}/jacocoagent.jar=destfile={OUT}/host.exec,append=false',
                        '-cp', os.pathsep.join(map(str, [fakes, boundaries, classes, *libs])), 'org.junit.runner.JUnitCore', *tests], cwd=ROOT)
raise SystemExit(result.returncode)
