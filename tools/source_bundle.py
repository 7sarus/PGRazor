"""Package only Git-visible source/tools; never include build inputs or credentials."""
from pathlib import Path
import subprocess
import zipfile
ROOT=Path(__file__).resolve().parents[1]
names=subprocess.check_output(['git','ls-files','-z','--cached'],cwd=ROOT).decode().split('\0')
blocked={'.apk','.apkm','.apks','.jks','.keystore','.p12','.key','.pem','.log','.pyc'}
files=[]
for name in sorted(set(filter(None,names))):
    path=Path(name)
    if path.suffix.lower() in blocked or any(part in {'build','input','.artifacts','hermes-swarm','frida-monitor','__pycache__'} for part in path.parts):
        raise SystemExit('Private/generated file is Git-visible: '+name)
    if name=='pogo-prototype/build-retention.json' or path.name.startswith('.env'):
        raise SystemExit('Local configuration is Git-visible: '+name)
    full=ROOT/path
    if full.is_symlink() or not full.is_file(): raise SystemExit('Source file missing or symlinked: '+name)
    files.append((full,name))
output=ROOT/'dist/PGRazor-source-tools.zip';output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
    for full,name in files: archive.write(full,name)
print('Source/tools archive:',output)
