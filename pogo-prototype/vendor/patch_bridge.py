"""Reproduce only upstream 302a588 on the exact installed, minified bridge.

This is a diagnostic derivative, not a claim of full Android 17 compatibility.
Source identity and every replacement must match before any output is written.
"""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import shutil
import frida_tools

ROOT = Path(__file__).resolve().parent
SOURCE_SHA256 = '02cb922b7fea29a566bd9ae4a190fad24c503076f2497af5706d117033de6a0e'
COMMIT = '302a588881b40cba300bcf3acfd35deeb3888ee5'
URL = 'https://github.com/frida/frida-java-bridge/commit/' + COMMIT
PATCHES = [
    ('ArtMethod access flags: additionally mask kAccNterpEntryPointFastPathFlag (0x00100000)',
     '281==(2950692863&t.readU32())',
     '281==(2949644287&t.readU32())'),
    ('ARM64 callback first, flush its literal pool after ret, record relocated-body entry',
     'const h=new Arm64Writer(e,{pc:t});h.putBLabel("performTransition");const p=t.add(h.offset);h.putPushAllXRegisters(),h.putCallAddressWithArguments(a,["x0"]),h.putPopAllXRegisters(),h.putRet(),h.putLabel("performTransition");let f=!1,_=null,m=null;',
     'const h=new Arm64Writer(e,{pc:t});const p=t.add(h.offset);h.putPushAllXRegisters(),h.putCallAddressWithArguments(a,["x0"]),h.putPopAllXRegisters(),h.putRet(),h.flush();const fieldpadPerformEntry=t.add(h.offset);let f=!1,_=null,m=null;'),
    ('ARM64 transition NativeFunction enters relocated body rather than callback',
     '),h.dispose(),f||Gt();return new NativeFunction(t,"void",["pointer"],Ee)}};function Jt',
     '),h.dispose(),f||Gt();return new NativeFunction(fieldpadPerformEntry,"void",["pointer"],Ee)}};function Jt')
]


def transform(original):
    if hashlib.sha256(original).hexdigest() != SOURCE_SHA256:
        raise ValueError('Source bridge checksum differs; do not apply inferred minified replacements')
    source = original.decode('utf-8')
    for description, before, after in PATCHES:
        if source.count(before) != 1 or after in source:
            raise ValueError('Nonunique/already applied upstream transformation: '+description)
    if 2950692863 != (~(0x40000000 | 0x10000000 | 0x00200000) & 0xffffffff):
        raise AssertionError('Old mask does not match upstream source constants')
    if 2949644287 != (~(0x40000000 | 0x10000000 | 0x00200000 | 0x00100000) & 0xffffffff):
        raise AssertionError('New mask does not match upstream source constants')
    result = source
    for _, before, after in PATCHES:
        result = result.replace(before, after, 1)
    reversed_result = result
    for _, before, after in reversed(PATCHES):
        reversed_result = reversed_result.replace(after, before, 1)
    if reversed_result != source: raise AssertionError('Changes outside recorded transformations')
    return result.encode('utf-8')


def main():
    version = importlib.metadata.version('frida-tools')
    if version != '14.10.4': raise ValueError('This reproduction requires frida-tools 14.10.4')
    source = Path(frida_tools.__file__).parent/'bridges/java.js'
    original = source.read_bytes()
    patched = transform(original)
    destination = ROOT/'frida-java-bridge-302a588.js'
    destination.write_bytes(patched)
    (ROOT/'frida-java-bridge-original.js').write_bytes(original)
    license_path = source.parents[2]/'frida_tools-14.10.4.dist-info/licenses/COPYING'
    shutil.copyfile(license_path, ROOT/'COPYING.frida-tools')
    metadata = {
        'purpose': 'Pinned upstream Android 17 ARM64 bridge correction; see vendor/NOTICE.txt',
        'source_distribution': 'frida-tools', 'source_distribution_version': version,
        'source_path': 'frida_tools/bridges/java.js', 'source_sha256': SOURCE_SHA256,
        'upstream_commit': COMMIT, 'upstream_commit_url': URL,
        'upstream_source_url': 'https://raw.githubusercontent.com/frida/frida-java-bridge/'+COMMIT+'/lib/android.js',
        'upstream_license_declaration': 'LGPL-2.0 WITH WxWindows-exception-3.1',
        'upstream_license_declaration_url': 'https://raw.githubusercontent.com/frida/frida-java-bridge/'+COMMIT+'/package.json',
        'copied_distribution_license_path': 'frida_tools-14.10.4.dist-info/licenses/COPYING',
        'copied_distribution_license_sha256': hashlib.sha256(license_path.read_bytes()).hexdigest(),
        'output': destination.name, 'output_sha256': hashlib.sha256(patched).hexdigest(),
        'changes': [{'description': description, 'before': before, 'after': after,
                    'verified_original_occurrences': 1} for description,before,after in PATCHES],
        'checks': ['Exact original SHA-256', 'Every original fragment unique',
                   'Integer masks derived from upstream constants',
                   'Reverse transformations reproduce original bytes exactly'],
        'limits': 'Only commit 302a588 is applied; no newer bridge changes, CheckJNI changes, or deoptimization. Not an upstream-built release.'
    }
    (ROOT/'bridge-provenance.json').write_text(json.dumps(metadata, indent=2)+'\n', encoding='utf-8')
    print(destination)
    print(metadata['output_sha256'])


if __name__ == '__main__': main()
