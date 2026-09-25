#!/usr/bin/env python3
"""Smoke test for the focused evidence recorder."""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
EVIDENCE = HERE / "evidence.py"


def run(*args):
    result = subprocess.run([sys.executable, str(EVIDENCE), *map(str, args)], capture_output=True, text=True)
    if result.returncode:
        raise AssertionError("%s failed: %s" % (args, result.stderr))
    return json.loads(result.stdout)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "ffmpeg and ffprobe are required")
class EvidenceTest(unittest.TestCase):
    def test_external_video_becomes_reviewable_evidence(self):
        with tempfile.TemporaryDirectory(prefix="video-evidence-") as temporary:
            root = Path(temporary)
            clip = root / "input.mp4"
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
                "-i", "testsrc2=size=320x180:rate=30", "-t", "2", "-pix_fmt", "yuv420p", str(clip),
            ], check=True)
            session = root / "session"
            run("start", "--output", session, "--source", "external")
            finalized = run("stop", session, "--video", clip)
            self.assertTrue(finalized["verified"])
            self.assertTrue((session / "evidence.mp4").exists())
            frames = run("frames", "--video", session / "evidence.mp4", "--output", session / "frames", "--at", "0.2,1.0")
            self.assertEqual(len(frames["frames"]), 2)
            self.assertTrue(all(Path(frame).exists() for frame in frames["frames"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
