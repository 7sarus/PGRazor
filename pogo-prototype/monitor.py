"""Minimal ADB adapter used only by the explicitly requested preview probe."""
import os
from pathlib import Path
import shutil
import subprocess

def find_adb():
    candidates=[os.environ.get('ADB'),shutil.which('adb')]
    sdk=os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
    if sdk:candidates.append(str(Path(sdk)/'platform-tools'/('adb.exe' if os.name=='nt' else 'adb')))
    for candidate in candidates:
        if candidate and Path(candidate).is_file():return str(candidate)
    raise RuntimeError('ADB unavailable; add platform-tools to PATH or set ADB')

class Android:
    def __init__(self,adb,serial=None):self.adb,self.serial=str(adb),serial
    def command(self,*args):return [self.adb]+(['-s',self.serial] if self.serial else [])+list(args)
    def call(self,*args,**kwargs):
        return subprocess.run(self.command(*args),check=True,text=True,encoding='utf8',errors='replace',capture_output=True,**kwargs).stdout
    def shell(self,*args,**kwargs):return self.call('shell',*args,**kwargs)

def select_device(adb,explicit=None):
    base=Android(adb)
    devices=[row.split()[0] for row in base.call('devices').splitlines()[1:] if len(row.split())>=2 and row.split()[1]=='device']
    if explicit:
        if explicit not in devices:raise RuntimeError('Requested device is not online')
        return Android(adb,explicit)
    if len(devices)!=1:raise RuntimeError('Connect one device or specify --serial')
    return Android(adb,devices[0])
