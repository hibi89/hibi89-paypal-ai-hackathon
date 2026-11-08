"""Offline, no-model, no-provider safety tests for WorkNova v4j private bridge."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
# Standalone local edit, GitHub checkout, and private review ZIP layouts.
CANDIDATES = (HERE.parent / 'scripts' / 'worknova_v4j_bridge.py',
              HERE.parent / 'SOURCE' / 'worknova_v4j_bridge.py',
              HERE / 'worknova_v4j_bridge.py')
SCRIPT = next((p for p in CANDIDATES if p.is_file()), CANDIDATES[0])
spec = importlib.util.spec_from_file_location('worknova_v4j_bridge', SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class WorkNovaBridgeTests(unittest.TestCase):
    def test_five_features_match_mandatory_agent_scope(self):
        self.assertEqual([s[1] for s in m.STEPS],
                         ['DELEGATE', 'NEGOTIATE', 'DISCOVER', 'RETAIN', 'RESOLVE'])
        self.assertTrue(all(len(x)==5 for x in m.STEPS))
        self.assertIn('No payment authority', m.STEPS[0][4])
        self.assertIn('No subscription changes', m.STEPS[3][4])
        self.assertIn('No external submission', m.STEPS[4][4])

    def test_exact_10_seconds_without_retiming(self):
        self.assertEqual(m.BRIDGE_START, 94)
        self.assertEqual(m.BRIDGE_END, 104)
        self.assertEqual(m.BRIDGE_SECONDS * m.FPS, 250)
        self.assertEqual(m.STILL_FRAMES+(len(m.STEPS)-1)*(m.STILL_FRAMES-m.FADE_FRAMES),250)

    def test_sha_pins_are_full_and_distinct(self):
        self.assertEqual(len(m.EXPECTED_V4I),64)
        self.assertEqual(len(m.EXPECTED_BRIDGE_IMAGE),64)
        self.assertNotEqual(m.EXPECTED_V4I,m.EXPECTED_BRIDGE_IMAGE)

    def test_source_sha_mismatch_stops_before_any_write(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)
            img=p/'brand.png';mov=p/'old.mp4';out=p/'output.mp4'
            img.write_bytes(b'not approved');mov.write_bytes(b'not approved movie')
            with self.assertRaisesRegex(ValueError,'SOURCE_NOT_VERIFIED'):
                m.check_inputs(img,mov,out)
            self.assertFalse(out.exists())

    def test_original_output_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)
            original=p/'existing.mp4';original.write_bytes(b'keep-private-original')
            with self.assertRaisesRegex(FileExistsError,'OUTPUT_EXISTS__NO_OVERWRITE'):
                m.assemble(p/'fake.mp4',p/'fake-bridge.mp4',original)
            self.assertEqual(original.read_bytes(),b'keep-private-original')

    def test_symlink_source_is_not_accepted(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'real').write_bytes(b'x')
            target=p/'link.mp4'
            try:target.symlink_to(p/'real')
            except (OSError,NotImplementedError):self.skipTest('symlink unavailable')
            with self.assertRaisesRegex(ValueError,'SOURCE_NOT_VERIFIED_OR_SYMLINK'):
                m.check_inputs(target,p/'real',p/'new.mp4')

    def test_readonly_plan_cli_reports_no_tts_or_publication(self):
        r=subprocess.run([sys.executable,str(SCRIPT),'--check-plan'],
                         capture_output=True,text=True,timeout=8)
        self.assertEqual(r.returncode,0,r.stderr)
        obj=json.loads(r.stdout)
        self.assertEqual(obj['replace_seconds'],[94,104])
        self.assertEqual(obj['total_frames'],250)
        self.assertIs(obj['voice_render'],False)
        self.assertIs(obj['subtitles_render'],False)
        self.assertIs(obj['release_hold'],True)

    def test_no_external_integrations_in_editor(self):
        src=SCRIPT.read_text('utf8')
        for bad in ('requests.get(', 'urllib.request.urlopen(',
                    'http.client.', 'subprocess.run(["curl"',
                    '--upload', '--publish', 'paypal.com/v2/checkout'):
            self.assertNotIn(bad,src)

if __name__=='__main__':unittest.main()
