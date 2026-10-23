"""Exercise the real ordered settings writer without Android or a device."""
from pathlib import Path
import subprocess
import tempfile
import unittest
from test_control_java import java_tools

ROOT = Path(__file__).resolve().parents[1]


class SettingsWriterTests(unittest.TestCase):
    def test_ordered_snapshots(self):
        compiler, runtime = java_tools()
        with tempfile.TemporaryDirectory(prefix='pgrazor-settings-test-') as directory:
            result = subprocess.run([str(compiler), '-encoding', 'UTF-8', '-d', directory,
                                     str(ROOT/'src/dev/pgrazor/SettingsWriter.java'),
                                     str(ROOT/'test/SettingsWriterTest.java')], capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            result = subprocess.run([str(runtime), '-cp', directory, 'dev.pgrazor.SettingsWriterTest'],
                                    capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
