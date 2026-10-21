import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import struct
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import axml
import release_apk
from test_axml import fixture,chunk,node

class ReleaseTests(unittest.TestCase):
    def test_manifest_removes_split_requirements_and_changes_label(self):
        data=fixture();_,chunks,pool,_,_=axml._parse(data);ns=pool.add(axml.ANDROID_NS)
        def attr(key,value,typ=3):
            val=pool.add(value) if typ==3 else value
            return struct.pack('<IIIHBBI',ns,pool.add(key),val if typ==3 else 0xffffffff,8,0,typ,val)
        nodes=[]
        for kind,raw in chunks[1:]:
            if kind==0x102:
                name=pool.string(axml._u32(raw,20));extra=attr('requiredSplitTypes','base__abi') if name=='manifest' else attr('label','Old game label')
                raw=bytearray(raw);struct.pack_into('<I',raw,4,len(raw)+len(extra));struct.pack_into('<H',raw,28,axml._u16(raw,28)+1);raw+=extra
            nodes.append(bytes(raw))
        rewritten=release_apk.standalone_manifest(chunk(3,pool.build()+b''.join(nodes)))
        _,c,p,_,_=axml._parse(rewritten)
        starts={name:attrs for _,event,name,attrs,_ in axml._walk(c,p) if event=='start'}
        self.assertNotIn((axml.ANDROID_NS,'requiredSplitTypes'),starts['manifest'])
        self.assertEqual(starts['application'][(axml.ANDROID_NS,'label')],'Pok\u00e9mon GO')
        self.assertEqual(starts['manifest'][(None,'package')],'dev.example.test')

    def test_library_merge_and_resource_split_rejection(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);base=root/'base.apk';split=root/'split.apk';out=root/'out.apk'
            with zipfile.ZipFile(base,'w') as z:z.writestr('AndroidManifest.xml',fixture());z.writestr('classes.dex',b'dex');z.writestr('resources.arsc',b'resources')
            def write_split(extra=False):
                with zipfile.ZipFile(split,'w') as z:
                    z.writestr('lib/arm64-v8a/libil2cpp.so',b'native');z.writestr('AndroidManifest.xml',b'split')
                    if extra:z.writestr('resources.arsc',b'unsupported')
            rows=[(base,{'split':None}),(split,{'split':'config.arm64_v8a'})]
            with patch.object(release_apk.nonroot,'inspect_set',return_value=('com.nianticlabs.pokemongo',base,rows,{'arm64-v8a'})):
                write_split();release_apk.merge([base,split],out)
                with zipfile.ZipFile(out) as z:self.assertEqual(z.read('lib/arm64-v8a/libil2cpp.so'),b'native');self.assertEqual(z.read('resources.arsc'),b'resources')
                write_split(True)
                with self.assertRaisesRegex(ValueError,'resource/code'):release_apk.merge([base,split],out)
if __name__=='__main__':unittest.main()
