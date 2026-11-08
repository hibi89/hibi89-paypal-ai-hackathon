"""Offline media helper tests. Synthetic fixture is NOT proof of actual Kokoro speech."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
import wave
from pathlib import Path
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
def load(name):
    p=ROOT/'scripts'/f'{name}.py'
    spec=importlib.util.spec_from_file_location(name,p)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

class LocatorTests(unittest.TestCase):
    def setUp(self):self.mod=load('worknova_voice_locator')
    def test_hash_pinned_read_only_discovery_and_symlink_refusal(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);good=root/'voice';good.mkdir()
            (good/self.mod.MODEL_FILE).write_bytes(b'fictional model')
            (good/self.mod.VOICE_FILE).write_bytes(b'fictional voice')
            fake=root/'symlink'
            try:fake.symlink_to(good,target_is_directory=True)
            except (OSError,NotImplementedError):pass
            with mock.patch.object(self.mod,'MODEL_MIN_SIZE',1), mock.patch.object(self.mod,'VOICE_MIN_SIZE',1),\
                mock.patch.object(self.mod,'MODEL_SHA',hashlib.sha256(b'fictional model').hexdigest()),\
                mock.patch.object(self.mod,'VOICE_SHA',hashlib.sha256(b'fictional voice').hexdigest()):
                found=self.mod.discover([root],max_depth=2,max_dirs=20)
                self.assertEqual(found['status'],'PINNED_KOKORO_FOUND')
                self.assertEqual(len(found['verified_model_dirs']),1)
                self.assertEqual(found['network_requests'],0)
                self.assertEqual(found['files_copied'],0)
                (good/self.mod.VOICE_FILE).write_bytes(b'changed')
                self.assertFalse(self.mod.discover([root],2,20)['verified_model_dirs'])
    def test_limits_and_missing_files(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);(root/'x').mkdir()
            self.assertFalse(self.mod.discover([root],1,10)['verified_model_dirs'])
            self.assertTrue(self.mod.discover([root],1,1)['limit_reached'])
            with self.assertRaises(ValueError):self.mod.discover([root],13,10)

class EditorTests(unittest.TestCase):
    def setUp(self):self.mod=load('worknova_part2_v4d_private_editor')
    def test_hash_pinned_full_film_timeline_and_private_only(self):
        plan=self.mod.check_plan()
        self.assertEqual(plan['target_preview_frames'],1250)
        self.assertEqual(plan['preview_film_start'],104)
        self.assertEqual(plan['preview_film_end'],154)
        self.assertFalse(plan['published'])
        with tempfile.TemporaryDirectory() as td:
            inp=Path(td)/'wrong.mp4'; inp.write_bytes(b'not the validated 170s movie')
            with self.assertRaisesRegex(ValueError,'V4C_HASH_MISMATCH'):
                self.mod.do_render_part2(inp,Path(td)/'new.mp4',Path(td)/'scratch')
            self.assertFalse((Path(td)/'new.mp4').exists())

class SubtitleTests(unittest.TestCase):
    def setUp(self):self.mod=load('worknova_subtitles_from_voice')
    def fixture(self,root):
        wav=root/'part2.wav'
        with wave.open(str(wav),'wb') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000)
            for _ in range(170):w.writeframes(b'\0'*(24000*2))
        report={'status':'PRIVATE_WORKNOVA_PART2_KOKORO_READY__NOT_MIXED',
          'voice':'af_heart','engine':'local Kokoro ONNX FP16','audio_seconds':170.0,
          'sample_rate':24000,'cue_count':5,'cue_plan_id':self.mod.PLAN_ID,
          'reference_cut_sha256':self.mod.REFERENCE_SHA,
          'source_model_sha256':self.mod.MODEL_SHA,'source_voicepack_sha256':self.mod.VOICE_SHA,
          'provider_calls':0,'payments':0,'uploaded':False,'owner_approved_for_release':False,
          'sha256':hashlib.sha256(wav.read_bytes()).hexdigest(),
          'cues':[{'scene':n,'at_seconds':a,'allocated_until_seconds':end,
                   'spoken_seconds':5.0,'text':en} for n,a,end,en,_ in self.mod.SCENES]}
        rp=root/'part2.json';rp.write_text(json.dumps(report),encoding='utf8')
        return wav,rp,report
    def test_five_bilingual_scenes_manifest_timing(self):
        with tempfile.TemporaryDirectory() as td:
            wav,rp,_=self.fixture(Path(td))
            srt,res=self.mod.verify(wav,rp)
            self.assertEqual(res['validated_cues'],5)
            self.assertIn('00:01:44,400 --> 00:01:49,480',srt)
            self.assertIn('00:02:24,450 --> 00:02:29,530',srt)
            self.assertIn('결제 권한은 부여되지 않습니다.',srt)
            self.assertFalse(res['full_auditory_review'])
    def test_tamper_cue_and_hash_and_voice_refused(self):
        with tempfile.TemporaryDirectory() as td:
            wav,rp,data=self.fixture(Path(td))
            cases=[('voice','unapproved'),('cue_plan_id','other'),('sha256','0'*64)]
            for key,bad in cases:
                altered=dict(data);altered[key]=bad
                rp.write_text(json.dumps(altered),encoding='utf8')
                with self.assertRaises(ValueError):self.mod.verify(wav,rp)
            altered=dict(data);altered['cues']=[dict(x) for x in data['cues']]
            altered['cues'][1]['spoken_seconds']=11.0
            rp.write_text(json.dumps(altered),encoding='utf8')
            with self.assertRaises(ValueError):self.mod.verify(wav,rp)
            altered['cues'][1]['spoken_seconds']=5.0
            altered['cues'][1]['text']='A fake payment took place.'
            rp.write_text(json.dumps(altered),encoding='utf8')
            with self.assertRaises(ValueError):self.mod.verify(wav,rp)

if __name__=='__main__':unittest.main()
