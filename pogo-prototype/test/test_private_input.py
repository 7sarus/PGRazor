import importlib.util
from pathlib import Path
import unittest
import urllib.request
spec=importlib.util.spec_from_file_location('private_input',Path(__file__).resolve().parents[2]/'tools/private_input.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class RedirectTests(unittest.TestCase):
    def test_cross_host_drops_authorization(self):
        req=urllib.request.Request('https://api.github.com/example',headers={'Authorization':'Bearer test-only'})
        redirected=module.HttpsRedirect().redirect_request(req,None,302,'Found',{},'https://release-assets.githubusercontent.com/file')
        self.assertFalse(redirected.has_header('Authorization'))
    def test_same_host_keeps_authorization(self):
        req=urllib.request.Request('https://api.github.com/example',headers={'Authorization':'Bearer test-only'})
        redirected=module.HttpsRedirect().redirect_request(req,None,302,'Found',{},'https://api.github.com/other')
        self.assertTrue(redirected.has_header('Authorization'))
    def test_insecure_redirect_is_rejected(self):
        req=urllib.request.Request('https://api.github.com/example')
        with self.assertRaises(ValueError):module.HttpsRedirect().redirect_request(req,None,302,'Found',{},'http://example.com/file')
if __name__=='__main__':unittest.main()
