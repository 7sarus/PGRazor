"""Acquire the pinned official Frida Gadget asset for the user's local build."""
import hashlib
import json
import lzma
from pathlib import Path
import shutil
import urllib.request

ROOT=Path(__file__).resolve().parent
VERSION='17.24.2'
ARCHES={'arm64-v8a':'arm64','x86_64':'x86_64'}
BRIDGE_COMMIT='302a588881b40cba300bcf3acfd35deeb3888ee5'
BRIDGE_SHA256='3e18ac06fe11fdf4cfcb9bf45e7a422fd59d1dc99eba46da59941087e54b09fe'

def sha256(path):
    with open(path,'rb') as stream: return hashlib.file_digest(stream,'sha256').hexdigest()

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'FieldPadLocalBuild/0.1','Accept':'application/vnd.github+json'}),timeout=45)

def gadget(abi,download=False):
    if abi not in ARCHES: raise ValueError('Unsupported ABI: '+abi)
    folder=ROOT/'build/runtime'/VERSION/abi; folder.mkdir(parents=True,exist_ok=True)
    binary=folder/'libfrida-gadget.so'; receipt=folder/'receipt.json'
    name=f'frida-gadget-{VERSION}-android-{ARCHES[abi]}.so.xz'
    expected_url=f'https://github.com/frida/frida/releases/download/{VERSION}/{name}'
    if binary.is_file() and receipt.is_file():
        metadata=json.loads(receipt.read_text(encoding='utf-8'))
        if metadata.get('sha256')==sha256(binary) and metadata.get('version')==VERSION and metadata.get('abi')==abi and metadata.get('source')==expected_url:
            verify_elf(binary,abi); return binary,metadata
        raise RuntimeError('Cached Gadget checksum mismatch: '+str(binary))
    if not download:
        raise RuntimeError('Missing official Gadget runtime. Run nonroot.cmd with --download-runtime from normal PowerShell, or supply the verified cache. No download attempted.')
    with get(f'https://api.github.com/repos/frida/frida/releases/tags/{VERSION}') as response:
        release=json.load(response)
    asset=next((a for a in release['assets'] if a['name']==name),None)
    if asset is None: raise RuntimeError('Pinned Frida release has no '+name)
    url=asset['browser_download_url']
    if url!=expected_url: raise RuntimeError('Unexpected runtime download URL')
    digest=asset.get('digest')
    if not isinstance(digest,str) or not digest.startswith('sha256:'):
        raise RuntimeError('GitHub supplied no SHA-256 asset digest; automatic download cannot be verified.')
    archive=folder/'download.xz.partial'
    print('Downloading official Frida Gadget:',name,flush=True)
    with get(url) as source,archive.open('wb') as destination: shutil.copyfileobj(source,destination)
    if sha256(archive)!=digest.split(':',1)[1]: raise RuntimeError('Runtime download digest mismatch')
    temporary=folder/'gadget.partial'
    with lzma.open(archive) as source,temporary.open('wb') as destination: shutil.copyfileobj(source,destination)
    verify_elf(temporary,abi); temporary.replace(binary); archive.unlink()
    metadata={'version':VERSION,'abi':abi,'source':url,'archive_digest':digest,'sha256':sha256(binary)}
    receipt.write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    return binary,metadata

def verify_elf(path,abi):
    import struct
    with open(path,'rb') as source: header=source.read(64)
    if len(header)<64 or header[:6]!=b'\x7fELF\x02\x01' or struct.unpack_from('<H',header,16)[0]!=3 or struct.unpack_from('<H',header,18)[0] != {'arm64-v8a':183,'x86_64':62}[abi]:
        raise RuntimeError('Gadget architecture/header mismatch: '+str(path))

def java_bridge():
    # Pin the reviewed upstream ARM64/Android 17 correction rather than silently
    # selecting whichever bridge a global frida-tools installation provides.
    path=ROOT/'vendor/frida-java-bridge-302a588.js'
    if not path.is_file(): raise RuntimeError('Pinned Java bridge is missing: '+str(path))
    if sha256(path)!=BRIDGE_SHA256: raise RuntimeError('Pinned Java bridge checksum mismatch: '+str(path))
    return path
