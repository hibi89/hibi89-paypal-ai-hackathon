"""No-network WorkNova v4k 43–75s design and fail-closed regression contract."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent

def locate(name):
    for path in (HERE.parent/'scripts'/name, HERE.parent/'SOURCE'/name,
                 HERE/name, HERE.parent/'v4k'/name):
        if path.is_file():return path
    raise FileNotFoundError(name)

def load(name):
    path=locate(name)
    spec=importlib.util.spec_from_file_location(path.stem,path)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

v4k=load('worknova_v4k_part1.py')
corrected=load('worknova_v4k_corrected.py')

class WorkNovaV4KVisualTests(unittest.TestCase):
    def test_original_whole_video_and_historical_chapter_are_hash_pinned(self):
        self.assertEqual(len(v4k.EXPECTED_V4J),64)
        self.assertEqual(v4k.EXPECTED_V4J,corrected.PARENT_SHA)
        self.assertEqual(len(corrected.THIRTY_SHA),64)
        self.assertNotEqual(corrected.PARENT_SHA,corrected.THIRTY_SHA)

    def test_visual_timeline_exactly_170_seconds_and_two_second_intro(self):
        self.assertEqual(v4k.WINDOW,(45,75))
        self.assertEqual(sum(v4k.QUOTES)-2*v4k.FADE_FRAMES,425)
        self.assertEqual(sum(v4k.EVIDENCE)-2*v4k.FADE_FRAMES,325)
        self.assertEqual((corrected.FIRST,corrected.LAST), (43,75))
        self.assertEqual(corrected.INTRO_FRAMES,50)
        self.assertEqual(corrected.CHAPTER_FRAMES,800)
        self.assertEqual(1075+800+2375,4250)

    def test_six_editorial_coverage_order(self):
        self.assertEqual([x[2] for x in v4k.CARDS],
                         ['QUOTE WORKSPACE','DEFINE THE WORK','APPROVAL GATE',
                          'GEMINI AI','PAYPAL SANDBOX','PROVENANCE FIRST'])
        self.assertTrue(all(len(x)==8 for x in v4k.CARDS))

    def test_mock_quote_and_historical_sandbox_are_distinct(self):
        self.assertIn('$15.00',' '.join(v4k.CARDS[0][4]))
        self.assertIn('$80.00',' '.join(v4k.CARDS[0][4]))
        self.assertIn('$1.50',' '.join(v4k.CARDS[4][4]))
        self.assertIn('Distinct from the $15',v4k.CARDS[4][5])
        self.assertIn('Checkbox shown unchecked',v4k.CARDS[2][4][1])

    def test_historical_receipts_do_not_claim_fresh_provider(self):
        self.assertIn('No new provider request',v4k.CARDS[3][4][2])
        self.assertIn('Later provider GET; not repeated',v4k.CARDS[4][4][2])
        self.assertIn('No fresh PayPal or Gemini',v4k.CARDS[5][4][1])
        self.assertIn('not human',v4k.CARDS[5][5])

    def test_bad_original_video_refuses_before_output(self):
        with tempfile.TemporaryDirectory() as temp:
            d=Path(temp);src=d/'wrong.mp4';src.write_bytes(b'fake')
            with self.assertRaisesRegex(ValueError,'UNVERIFIED_V4J_SOURCE__STOP'):
                v4k.check_inputs(src,d/'new.mp4')
            self.assertFalse((d/'new.mp4').exists())

    def test_existing_video_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            d=Path(temp);src=d/'fake.mp4';src.write_bytes(b'fake')
            old=d/'keep.mp4';old.write_bytes(b'keep me')
            with self.assertRaisesRegex(FileExistsError,'OUTPUT_EXISTS'):
                corrected.check(src,src,old)
            self.assertEqual(old.read_bytes(),b'keep me')

    def test_corrected_rejects_untrusted_chapter(self):
        with tempfile.TemporaryDirectory() as temp:
            d=Path(temp);a=d/'parent.mp4';b=d/'chapter.mp4'
            a.write_bytes(b'fake old');b.write_bytes(b'fake clip')
            with self.assertRaisesRegex(ValueError,'UNVERIFIED_OR_SYMLINK_SOURCE__STOP'):
                corrected.check(a,b,d/'fresh.mp4')
            self.assertFalse((d/'fresh.mp4').exists())

    def test_symlink_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            d=Path(temp);actual=d/'raw.mp4';actual.write_bytes(b'fake')
            alias=d/'linked.mp4'
            try:alias.symlink_to(actual)
            except (OSError,NotImplementedError):self.skipTest('symlinks unavailable')
            with self.assertRaisesRegex(ValueError,'UNVERIFIED_OR_SYMLINK'):
                corrected.check(alias,actual,d/'new.mp4')

    def test_readonly_plan_no_voice_no_publication(self):
        s=locate('worknova_v4k_part1.py')
        r=subprocess.run([sys.executable,str(s),'--check-plan'],capture_output=True,text=True,timeout=10)
        self.assertEqual(r.returncode,0,r.stderr)
        info=json.loads(r.stdout)
        self.assertEqual(info['replace_window'],[45,75])
        self.assertIs(info['no_new_voice'],True)
        self.assertIs(info['no_new_subtitles'],True)
        self.assertIs(info['public_release'],False)

    def test_offline_only_source_does_not_contact_provider(self):
        for name in ('worknova_v4k_part1.py','worknova_v4k_corrected.py'):
            s=locate(name).read_text('utf8')
            for forbidden in ['requests.get(', 'urllib.request.urlopen(', 'https://api.paypal',
                              'paypal.com/v2/checkout', 'npm publish', 'openai.api',
                              'git push', '--upload', 'devpost.com']:
                self.assertNotIn(forbidden,s,name+': '+forbidden)
            self.assertIn('No',s)

if __name__=='__main__':unittest.main()
