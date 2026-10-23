"""Seal focused JaCoCo counters; retain full, unfiltered compiled-class XML."""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import xml.etree.ElementTree as ET
HOST = Path(__file__).resolve().parent
ROOT = next(parent for parent in HOST.parents if (parent / 'modules/garmin-connect/src/index.ts').is_file())
OUT = Path(os.environ.get('GARMIN_READINESS_OUTPUT', ROOT / 'artifacts/garmin-readiness-host/final'))
CACHE = Path.home()/'.gradle/caches/modules-2/files-2.1'
JAVA = Path.home()/'Library/Java/JavaVirtualMachines/temurin-17.0.20+8.jdk/Contents/Home/bin/java'
def jar(group, name, version):
    return next((CACHE/group/name/version).glob('*/*.jar'))
jars = [jar('org.jacoco', name, '0.8.13') for name in ('org.jacoco.core', 'org.jacoco.report')] + list((CACHE/'org.ow2.asm').glob('*/9.8/*/*.jar'))
cp = os.pathsep.join(map(str, [OUT, *jars]))
subprocess.run([str(JAVA.with_name('javac')), '-cp', cp, '-d', str(OUT), str(HOST/'Report.java')], check=True)
subprocess.run([str(JAVA), '-cp', cp, 'Report', str(OUT/'host.exec'), str(OUT/'classes-final'), str(ROOT/'modules/garmin-connect/android/src/main/java'), str(OUT/'kotlin-all.xml')], check=True)
classes = {x.attrib['name']: x for x in ET.parse(OUT/'kotlin-all.xml').getroot().iter('class')}
# Every production class in the new source file, plus affected registered
# Module/Platform classes and the actual new scalar-typed Coroutine callback.
names = [name for name, node in classes.items() if node.attrib.get('sourcefilename') == 'GarminTransportReadiness.kt']
names += ['expo/modules/garminconnect/GarminConnectModule', 'expo/modules/garminconnect/GarminConnectPlatformBindings',
          'expo/modules/garminconnect/GarminConnectModule$definition$1$3']
total = {metric: {'covered': 0, 'missed': 0} for metric in ['statements', 'branches', 'functions', 'lines']}
by_class = {}
for name in sorted(set(names)):
    counters = {node.attrib['type']: node.attrib for node in classes[name].findall('counter')}
    metrics = {}
    for metric, kind in [('statements', 'INSTRUCTION'), ('branches', 'BRANCH'), ('functions', 'METHOD'), ('lines', 'LINE')]:
        counter = counters.get(kind, {'missed': 0, 'covered': 0})
        missed, covered = int(counter['missed']), int(counter['covered'])
        metrics[metric] = {'missed': missed, 'covered': covered, 'total': missed+covered, 'percent': 100 if missed == 0 else covered*100/(missed+covered)}
        total[metric]['covered'] += covered
        total[metric]['missed'] += missed
    by_class[name] = metrics
for counter in total.values():
    counter.update(total=counter['covered']+counter['missed'], percent=100 if counter['missed']==0 else counter['covered']*100/(counter['covered']+counter['missed']))
log = (OUT/'kotlin-final.log').read_text()
tests = int(re.search(r'OK \((\d+) tests\)', log).group(1))
test_root = ROOT/'modules/garmin-connect/android/src/test/java/expo/modules/garminconnect'
test_files = [test_root/'GarminConnectModuleTest.kt', test_root/'GarminTransportReadinessTest.kt', HOST/'HostDiagnosticBoundaryTest.kt']
assert tests == sum(path.read_text().count('@Test') for path in test_files)
assert not any('@Ignore' in path.read_text() for path in test_files)
source_root = ROOT/'modules/garmin-connect/android/src/main/java/expo/modules/garminconnect'
source_files = [source_root/name for name in ['GarminConnectModule.kt', 'GarminConnectPlatformBindings.kt', 'GarminTransportReadiness.kt']]
inputs = [*source_files, *test_files, *HOST.rglob('*.java'), *HOST.rglob('*.py'), *HOST.glob('stubs/*.kt')]
report = {'status': 'passed' if all(v['percent']==100 for v in total.values()) else 'failed',
          'runtime_proof': 'NON_NATIVE_HOST_ONLY; real Android/Chaquopy compile signatures; explicit fake APIs at runtime',
          'tests_run': tests, 'skipped': 0, 'failures': 0, 'errors': 0, 'coverage_engine': 'JaCoCo 0.8.13', 'coverage': total, 'classes': by_class,
          'inputs': [{'path': str(path.relative_to(ROOT)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in inputs]}
(OUT/'kotlin-four-metrics.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
raise SystemExit(0 if report['status']=='passed' else 1)
