"""Safe source contract tests; no media, NumPy/Pillow, network, or private data needed."""
import ast
import hashlib
from pathlib import Path
import unittest

SCRIPT=Path(__file__).resolve().parents[1]/'scripts'/'worknova_v4q_premium_editor.py'

class PremiumSourceContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text=SCRIPT.read_text(encoding='utf8')
        cls.tree=ast.parse(cls.text,filename=str(SCRIPT))
    def test_declared_original_source_hash(self):
        self.assertIn('a8cb8b4c811672972d68f362dd45e74a471577f62a1945cd4b499c103dcb897d',self.text)
        self.assertIn('EXACT_V4P6_PRIVATE_SOURCE_HASH_REQUIRED',self.text)
    def test_preserve_original_middle_video(self):
        self.assertIn("'-segment_times','10,161'",self.text)
        self.assertIn("'-map','0:v:0','-an','-c:v','copy'",self.text)
        self.assertIn("'-c:v','copy'",self.text)
    def test_no_automatic_payment_or_publication(self):
        for forbidden in ('requests.post(', 'requests.get(', 'urllib.request.urlopen(', 'devpost.com/api', 'paypal.com/v2/checkout', 'upload_video('):
            self.assertNotIn(forbidden,self.text)
        self.assertIn("'public_release':False",self.text)
        self.assertIn("'payment_or_provider_calls':0",self.text)
    def test_no_fake_performance_metrics_or_partnership(self):
        self.assertIn('Hypothesis, not measured uplift',self.text)
        self.assertIn('NOT DEPLOYED  /  NO PARTNERSHIP CLAIM',self.text)
        self.assertIn('Historical owner test',self.text)
        self.assertIn('Scoped consent',self.text)
    def test_rejects_overwrite_and_requires_new_work_dir(self):
        self.assertIn('WORK_DIR_MUST_BE_EMPTY__NO_ORIGINAL_OVERWRITE',self.text)
        self.assertIn('SOURCE_OUTPUT_COLLISION',self.text)
        self.assertIn('DO_NOT_OVERWRITE_REVIEW_FILM',self.text)
    def test_no_external_music_audio_sources(self):
        self.assertIn('procedural synthesis',self.text)
        self.assertIn('wave.open(',self.text)
        self.assertNotIn('https://',self.text)
        self.assertNotIn('download(',self.text)
    def test_duration_25fps_170secs(self):
        self.assertIn('W,H,FPS,SECONDS=1920,1080,25,170',self.text)
        self.assertIn("'-frames:v','250'",self.text)
        self.assertIn("'-frames:v','225'",self.text)
        self.assertIn('original_video_packet_count',self.text)
    def test_music_limiter_compensates_latency(self):
        self.assertIn('alimiter=limit=0.92:latency=1[out]',self.text)

if __name__=='__main__':unittest.main()
