"""Synthetic tests; no real transactions or private media are checked in."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'scripts' / 'worknova_v4o_kit_preflight.py'
spec = importlib.util.spec_from_file_location('worknova_v4o_kit_preflight', SOURCE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def probe_ok():
    return {'format':{'duration':'170.000'},'streams':[
        {'codec_type':'video','codec_name':'h264','width':1920,
         'height':1080,'nb_frames':'4250'},
        {'codec_type':'audio','codec_name':'aac'}]}

def fixture(path, *, report_overrides=None, manifest_overrides=None, extras=None):
    film = b'FICTIONAL UNIT TEST BYTES, NOT A VIDEO'
    digest = hashlib.sha256(film).hexdigest()
    report = {'status':'V4O_PRIVATE_VISUAL_REVIEW_NOT_APPROVED',
      'film_sha256':digest,'bytes':len(film),'duration_seconds':170,'frames':4250,
      'audio_md5':'MD5=2959cc9c1f5ee996edaefb3b06a147ea',
      'full_av_decode':'PASS','release_hold':True,'provider_calls':0,
      'preserved_frames':3825,'new_voice':False,'new_srt':False}
    report.update(report_overrides or {})
    data = {name:(film if name == mod.FILM else
            json.dumps(report).encode() if name == mod.REPORT else b'synthetic')
            for name in mod.NAMES-{'MANIFEST.json'}}
    manifest = {'status':'PRIVATE_DESIGN_REVIEW_NOT_APPROVED',
      'release_hold':True,'no_external_calls':True,'no_voice_generated':True,
      'no_srt_generated':True,'film_sha256':digest,'frames':4250,'film_seconds':170,
      'entries':{name:{'size':len(data[name]),
       'sha256':hashlib.sha256(data[name]).hexdigest()} for name in data}}
    manifest.update(manifest_overrides or {})
    data['MANIFEST.json'] = json.dumps(manifest).encode()
    data.update(extras or {})
    with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name,content in data.items():
            z.writestr(name,content)
    return digest,len(film)

class V4oZipTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.kit = Path(self.tmp.name)/'kit.zip'
    def tearDown(self):
        self.tmp.cleanup()
    def check(self,digest,size,probe=probe_ok):
        return mod.inspect(self.kit,expected_sha=digest,expected_size=size,
                           probe=lambda _:probe())
    def test_success_is_never_publishing_approval(self):
        d,n=fixture(self.kit)
        r=self.check(d,n)
        self.assertEqual(r['status'],'LOCAL_PRIVATE_V4O_ZIP_VERIFIED_NOT_APPROVED')
        self.assertFalse(r['ownerVisualApproval'])
        self.assertFalse(r['publiclyUploaded'])
        self.assertFalse(r['newVoice'])
        self.assertTrue(r['releaseHold'])
    def test_reject_report_release_claim(self):
        d,n=fixture(self.kit,report_overrides={'release_hold':False})
        with self.assertRaisesRegex(ValueError,'V4O_REPORT_NOT_PRIVATE'):
            self.check(d,n)
    def test_reject_manifest_external_claim(self):
        d,n=fixture(self.kit,manifest_overrides={'no_external_calls':False})
        with self.assertRaisesRegex(ValueError,'V4O_MANIFEST_APPROVAL'):
            self.check(d,n)
    def test_reject_traversal_or_unexpected_member(self):
        d,n=fixture(self.kit,extras={'../../token.env':b'FAKE'})
        with self.assertRaisesRegex(ValueError,'V4O_KIT_MEMBER_SET_INVALID'):
            self.check(d,n)
    def test_reject_film_hash_mismatch(self):
        d,n=fixture(self.kit)
        with self.assertRaisesRegex(ValueError,'V4O_PINNED_FILM_HASH'):
            self.check('f'*64,n)
    def test_reject_duration_at_contest_limit(self):
        d,n=fixture(self.kit)
        def long_media():
            m=probe_ok()
            m['format']['duration']='180.0'
            return m
        with self.assertRaisesRegex(ValueError,'V4O_MEDIA_FORMAT_UNVERIFIED'):
            self.check(d,n,long_media)
    def test_reject_malformed_zip(self):
        self.kit.write_bytes(b'NOT_A_ZIP')
        with self.assertRaisesRegex(ValueError,'V4O_KIT_INVALID_OR_CORRUPTED'):
            self.check('f'*64,10)
    def test_reject_symlink(self):
        d,n=fixture(self.kit)
        link=self.kit.with_suffix('.link')
        try:
            link.symlink_to(self.kit)
        except OSError:
            self.skipTest('Symlinks unavailable')
        with self.assertRaisesRegex(ValueError,'V4O_KIT_NOT_REGULAR_FILE'):
            mod.inspect(link,expected_sha=d,expected_size=n,probe=lambda _:probe_ok())

if __name__=='__main__':
    unittest.main()
