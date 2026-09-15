#!/usr/bin/env python3
"""Pipeline tests for evidence.py using the synthetic `test` source and an imported video.

Run: python3 skills/record-evidence/scripts/test_evidence.py
Needs ffmpeg/ffprobe; text-overlay assertions need Pillow or ImageMagick.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
EVIDENCE = HERE / "evidence.py"
CARD = 1.0


def run(*args, expect=0):
    res = subprocess.run([sys.executable, str(EVIDENCE), *map(str, args)], capture_output=True, text=True)
    if expect is not None and res.returncode != expect:
        raise AssertionError("exit %d for %s\nstdout: %s\nstderr: %s" % (res.returncode, args, res.stdout, res.stderr))
    return json.loads(res.stdout) if res.stdout.strip() and res.returncode == 0 else res


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True).stdout.strip()
    return float(out)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "ffmpeg and ffprobe are required")
class EvidencePipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(tempfile.mkdtemp(prefix="evidence-test-"))
        cls.doctor = run("doctor")
        cls.overlay = cls.doctor["overlay_ready"]

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.root, ignore_errors=True)

    def record_synthetic(self, name, seconds=3.0):
        session = self.root / name
        run("start", "--output", session, "--source", "test", "--geometry", "640x360", "--title", "Synthetic %s" % name,
            "--commit", "0123456789ab", "--branch", "tests", "--environment", "unit test", "--label", name)
        run("narrate", session, "--message", "Narration for %s." % name, "--at", 0.5)
        run("annotate", session, "--type", "test_start", "--message", "It should do the thing", "--at", 1.0)
        run("annotate", session, "--type", "assertion", "--result", "passed", "--message", "The thing happened", "--at", 2.0)
        time.sleep(seconds)
        return session

    def test_session_records_annotates_and_reports(self):
        session = self.record_synthetic("alpha")
        stopped = run("stop", session, "--card-seconds", CARD)
        self.assertTrue(stopped["verified"])
        self.assertEqual(stopped["tests"], {"passed": 1, "failed": 0, "untested": 0})
        manifest = json.loads((session / "manifest.json").read_text())
        raw = manifest["raw"]["effective_duration"]
        cards = 2 * CARD if self.overlay else 0
        self.assertAlmostEqual(duration(session / "evidence.mp4"), raw + cards, delta=0.6)
        # Annotations shift by the start latency correction and the title card.
        assertion = [e for e in manifest["events"] if e["type"] == "assertion"][0]
        self.assertAlmostEqual(assertion["video_t"], 2.0 - manifest["timing"]["offset_applied"] + (CARD if self.overlay else 0), places=2)
        report = (session / "report.md").read_text()
        self.assertIn("| It should do the thing | The thing happened | passed |", report)
        self.assertIn("Narration for alpha.", report)
        self.assertIn("REPLACE THIS", report, "caveats placeholder must stay visible until filled")
        self.assertIn("never present it as evidence", report)
        frames = run("frames", session)["frames"]
        self.assertEqual([f["type"] for f in frames], ["test_start", "assertion"])
        self.assertTrue(all(Path(f["file"]).exists() for f in frames))
        # A second stop is refused; render re-renders with another layout.
        run("stop", session, expect=2)
        if self.overlay:
            rendered = run("render", session, "--layout", "panel", "--card-seconds", CARD)
            self.assertEqual(rendered["layout"], "panel")
            manifest = json.loads((session / "manifest.json").read_text())
            self.assertGreater(manifest["render"]["canvas"][0], 640)

    def test_caveats_written_by_stop_survive_render(self):
        session = self.record_synthetic("caveats", seconds=1.5)
        run("stop", session, "--card-seconds", CARD, "--caveats", "Nothing to add.")
        self.assertIn("Nothing to add.", (session / "report.md").read_text())
        run("render", session, "--card-seconds", CARD, "--no-cards")
        self.assertIn("Nothing to add.", (session / "report.md").read_text())

    def test_external_video_import_and_compose(self):
        clip = self.root / "clip.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30",
                        "-t", "3", "-pix_fmt", "yuv420p", str(clip)], check=True)
        session = self.root / "external"
        run("start", "--output", session, "--source", "external", "--title", "Imported browser video", "--label", "Browser")
        run("annotate", session, "--type", "test_start", "--message", "It should render the page", "--at", 0.5)
        run("annotate", session, "--type", "assertion", "--result", "failed", "--message", "Page showed an error", "--at", 1.5)
        stopped = run("stop", session, "--video", clip, "--card-seconds", CARD, "--layout", "overlay")
        self.assertTrue(stopped["verified"])
        self.assertEqual(stopped["tests"]["failed"], 1)
        manifest = json.loads((session / "manifest.json").read_text())
        self.assertEqual(manifest["timing"]["offset_applied"], 0.0)
        self.assertTrue((session / "capture" / "raw.mp4").exists())

        other = self.record_synthetic("beta", seconds=1.5)
        run("stop", other, "--card-seconds", CARD)
        out = self.root / "composite"
        composed = run("compose", "--output", out, session, other, "--size", 360, "--card-seconds", CARD, "--no-align",
                       "--label", "Browser", "--label", "Desktop")
        self.assertTrue(composed["verified"])
        composite = json.loads((out / "manifest.json").read_text())
        widths = [p["rect"][2] for p in composite["panes"]]
        self.assertEqual(composite["render"]["canvas"][0], sum(widths))
        self.assertEqual(composite["test_tally"], {"passed": 1, "failed": 1, "untested": 0})
        longest = max(p["duration"] for p in composite["panes"])
        cards = 2 * CARD if self.overlay else 0
        self.assertAlmostEqual(duration(out / "composite.mp4"), longest + cards, delta=0.6)
        report = (out / "report.md").read_text()
        self.assertIn("| Browser |", report)
        self.assertIn("| Desktop |", report)

    def test_rejects_oversized_and_incomplete_annotations(self):
        session = self.root / "limits"
        run("start", "--output", session, "--source", "external", "--title", "Limits")
        run("annotate", session, "--type", "assertion", "--message", "x" * 81, "--result", "passed", expect=2)
        run("annotate", session, "--type", "assertion", "--message", "missing result", expect=2)
        run("narrate", session, "--message", "y" * 281, expect=2)
        run("stop", session, expect=2)  # external sessions need --video


if __name__ == "__main__":
    unittest.main(verbosity=2)
