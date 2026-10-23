"""Runtime composition must preserve order, bytes and source boundaries."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from script_bundle import bundle


class ScriptBundleTest(unittest.TestCase):
    def test_order_and_missing_source(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'runtime').mkdir()
            (root / 'runtime/bundles.json').write_text(json.dumps({'agent': ['b.js', 'a.js']}))
            (root / 'a.js').write_bytes(b'// entry\n')
            (root / 'b.js').write_bytes(b'// module\n')
            self.assertEqual(bundle(root, 'agent'), b'// module\n\n;\n// entry\n')
            (root / 'b.js').unlink()
            with self.assertRaises(FileNotFoundError):
                bundle(root, 'agent')

    def test_rejects_source_outside_project(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'runtime').mkdir()
            (root / 'runtime/bundles.json').write_text(json.dumps({'agent': ['../outside.js']}))
            with self.assertRaises(ValueError):
                bundle(root, 'agent')
