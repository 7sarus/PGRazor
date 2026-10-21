"""Run the maintained, device-free PGRazor checks from any working directory."""
from pathlib import Path
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]
def run(*args): subprocess.run([str(x) for x in args],cwd=ROOT,check=True)
run(sys.executable,'-B','pgrazor/build.py','--test-only')
for name in ['test_axml.py','test_packaging.py','test_release_apk.py','test_private_input.py']:
    run(sys.executable,'-B','-m','unittest','discover','-s','pgrazor/test','-p',name)
for name in ['vgp-test.cjs','item-transfer-test.cjs','berry-test.cjs','buddy-test.cjs','ar-throw-test.cjs']:
    run('node','pgrazor/test/'+name)
for path in [ROOT/'pgrazor/embedded-agent.js',*sorted((ROOT/'pgrazor/diagnostics').glob('*.js'))]:
    run('node','--check',path)
