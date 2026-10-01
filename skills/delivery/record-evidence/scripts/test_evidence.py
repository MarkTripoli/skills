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


def dimensions(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                         "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True).stdout.strip()
    return tuple(map(int, out.split(",")))


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

    def test_default_cards_are_concise_and_keep_title_summary(self):
        session = self.record_synthetic("concise", seconds=1.7)
        stopped = run("stop", session)
        self.assertTrue(stopped["verified"])
        manifest = json.loads((session / "manifest.json").read_text())
        self.assertLess(manifest["timing"]["card_seconds"] * 2, 8 * 0.75)
        self.assertEqual(manifest["title"], "Synthetic concise")
        report = (session / "report.md").read_text()
        self.assertIn("Synthetic concise", report)
        self.assertIn("The thing happened", report)
        self.assertAlmostEqual(duration(session / "evidence.mp4"),
                               manifest["raw"]["effective_duration"] + 2 * manifest["timing"]["card_seconds"], delta=0.6)
        self.assertGreater(duration(session / "evidence.mp4"), 0)

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

    def test_default_cards_are_concise_and_keep_title_summary(self):
        session = self.record_synthetic("concise", seconds=1.7)
        stopped = run("stop", session)
        self.assertTrue(stopped["verified"])
        manifest = json.loads((session / "manifest.json").read_text())
        self.assertEqual(manifest["timing"]["card_seconds"], 2.5 if self.overlay else 0)
        self.assertEqual(manifest["title"], "Synthetic concise")
        self.assertIn("Synthetic concise", (session / "report.md").read_text())
        self.assertGreater(duration(session / "evidence.mp4"), 0)

    def test_caveats_written_by_stop_survive_render(self):
        session = self.record_synthetic("caveats", seconds=1.5)
        run("stop", session, "--card-seconds", CARD, "--caveats", "Nothing to add.")
        self.assertIn("Nothing to add.", (session / "report.md").read_text())
        run("render", session, "--card-seconds", CARD, "--no-cards")
        self.assertIn("Nothing to add.", (session / "report.md").read_text())

    def test_out_of_range_external_assertion_stays_in_report_but_not_overlay(self):
        clip = self.root / "short-external.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                        "testsrc2=size=360x640:rate=30", "-t", "1.9", "-pix_fmt", "yuv420p", str(clip)], check=True)
        session = self.root / "out-of-range"
        run("start", "--output", session, "--source", "external", "--title", "Out of range")
        run("annotate", session, "--type", "test_start", "--message", "Watched flow", "--at", 0.2)
        run("annotate", session, "--type", "assertion", "--result", "passed", "--message", "Late assertion", "--at", 3.5)
        stopped = run("stop", session, "--video", clip, "--video-started-at", 0.8, "--card-seconds", CARD)
        manifest = json.loads((session / "manifest.json").read_text())
        event = next(item for item in manifest["events"] if item["message"] == "Late assertion")
        self.assertEqual(stopped["tests"]["passed"], 1)
        self.assertFalse(event["overlay"])
        self.assertEqual(event["timing_status"], "outside_approximate_media_mapping")
        self.assertEqual(manifest["assertion_tally"]["passed"], 0)
        report = (session / "report.md").read_text()
        self.assertIn("Late assertion", report)
        self.assertIn("source 00:03.5", report)
        self.assertIn("actual first encoded frame time is unknown", report)

    def test_rejects_non_finite_external_start_marker(self):
        clip = self.root / "finite-marker.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                        "testsrc2=size=360x640:rate=30", "-t", "1", "-pix_fmt", "yuv420p", str(clip)], check=True)
        for value in ("nan", "inf", "not-a-number"):
            with self.subTest(value=value):
                session = self.root / ("invalid-marker-" + value)
                run("start", "--output", session, "--source", "external", "--title", "Invalid marker")
                result = run("stop", session, "--video", clip, "--video-started-at", value, expect=2)
                self.assertIn("finite epoch timestamp", result.stderr)
                self.assertFalse((session / "manifest.json").exists())


    def test_default_render_and_stills_are_bounded_and_composite_labels_are_retained(self):
        clip = self.root / "large.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                        "testsrc2=size=2560x1440:rate=5", "-t", "1.2", "-pix_fmt", "yuv420p", str(clip)], check=True)
        sessions = []
        for name in ("before", "after"):
            session = self.root / name
            run("start", "--output", session, "--source", "external", "--title", "Wide behavior", "--label", name.upper())
            run("annotate", session, "--type", "assertion", "--result", "passed", "--message", "Behavior is visible", "--at", 0.4)
            run("stop", session, "--video", clip, "--no-cards")
            sessions.append(session)
        self.assertEqual(dimensions(sessions[0] / "evidence.mp4"), (1280, 720))

        run("render", sessions[0], "--max-height", 360, "--no-cards")
        self.assertEqual(dimensions(sessions[0] / "evidence.mp4"), (640, 360))
        run("render", sessions[0], "--max-height", 0, "--no-cards")
        self.assertEqual(dimensions(sessions[0] / "evidence.mp4"), (2560, 1440))
        frame = run("frames", sessions[0])["frames"][0]["file"]
        self.assertLessEqual(dimensions(frame)[0], 1920)
        self.assertLessEqual(dimensions(frame)[1], 720)
        self.assertAlmostEqual(dimensions(frame)[0] / dimensions(frame)[1], 16 / 9, places=2)

        output = self.root / "before-after"
        run("compose", "--output", output, *sessions, "--no-align", "--no-cards",
            "--label", "BEFORE", "--label", "AFTER")
        composite = json.loads((output / "manifest.json").read_text())
        composite_size = dimensions(output / "composite.mp4")
        self.assertLessEqual(composite_size[0], 1920)
        self.assertLessEqual(composite_size[1], 720)
        self.assertAlmostEqual(composite_size[0] / composite_size[1],
                               composite["render"]["canvas"][0] / composite["render"]["canvas"][1], places=2)
        self.assertEqual([pane["label"] for pane in composite["panes"]], ["BEFORE", "AFTER"])
        sized_output = self.root / "sized-composite"
        run("compose", "--output", sized_output, *sessions, "--no-align", "--no-cards", "--size", 900)
        sized_manifest = json.loads((sized_output / "manifest.json").read_text())
        self.assertEqual(sized_manifest["panes"][0]["rect"][3], 900)
        self.assertGreater(dimensions(sized_output / "composite.mp4")[0], 1920)
        self.assertGreater(dimensions(sized_output / "composite.mp4")[1], 720)
        capped_output = self.root / "capped-sized-composite"
        run("compose", "--output", capped_output, *sessions, "--no-align", "--no-cards",
            "--size", 900, "--max-height", 720)
        self.assertLessEqual(dimensions(capped_output / "composite.mp4")[1], 720)
        native_output = self.root / "native-composite"
        run("compose", "--output", native_output, *sessions, "--max-height", 0, "--no-cards")
        self.assertEqual(dimensions(native_output / "composite.mp4")[0], 5120)


        before_png = self.root / "before.png"
        after_png = self.root / "after.png"
        for path, color in ((before_png, "red"), (after_png, "blue")):
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                            "color=c=%s:s=2560x1440" % color, "-frames:v", "1", str(path)], check=True)
        pair = self.root / "pair.png"
        result = run("pair", "--before-file", before_png, "--after-file", after_png, "--out", pair)
        self.assertEqual(result["labels"], ["BEFORE", "AFTER"])
        self.assertLessEqual(dimensions(pair)[0], 1920)
        self.assertAlmostEqual(dimensions(pair)[0] / dimensions(pair)[1],
                               result["size"][0] / result["size"][1], delta=0.02)
        self.assertLessEqual(dimensions(pair)[1], 720)

    def test_before_after_comparison_ignores_development_gap(self):
        sessions = []
        for index, (label, color, result) in enumerate((("BEFORE", "red", "failed"), ("AFTER", "blue", "passed"))):
            clip = self.root / ("comparison-%s.mp4" % label)
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                            "color=c=%s:s=160x120:r=10" % color, "-t", "1", "-pix_fmt", "yuv420p", str(clip)], check=True)
            session = self.root / ("comparison-%s" % label)
            run("start", "--output", session, "--source", "external", "--title", "Before and after", "--label", label)
            run("annotate", session, "--type", "assertion", "--result", result, "--message", label, "--at", 0.4)
            run("stop", session, "--video", clip, "--no-cards")
            # Fixture clocks model sessions captured a day apart without waiting a day.
            manifest_path = session / "manifest.json"
            manifest = json.loads(manifest_path.read_text())
            manifest["video_started_at"] = 1700000000 + index * 86400
            manifest_path.write_text(json.dumps(manifest))
            sessions.append(session)

        output = self.root / "comparison-gap"
        run("compose", "--output", output, *sessions, "--no-align", "--no-cards",
            "--size", 120, "--max-height", 0, "--label", "BEFORE", "--label", "AFTER")
        self.assertAlmostEqual(duration(output / "composite.mp4"), 1, delta=0.3)
        composite = json.loads((output / "manifest.json").read_text())
        self.assertEqual(composite["test_tally"], {"passed": 1, "failed": 1, "untested": 0})
        for pane, dominant, absent in zip(composite["panes"], (0, 2), (2, 0)):
            x, y, width, height = pane["rect"]
            pixel = subprocess.run(
                ["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", "0.2", "-i", str(output / "composite.mp4"),
                 "-vf", "crop=2:2:%d:%d,scale=1:1" % (x + width // 2, y + height // 2),
                 "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
                capture_output=True, check=True).stdout
            self.assertGreater(pixel[dominant], 200, "both source panes must be visible from the start")
            self.assertLess(pixel[absent], 30, "comparison must show the actual source rather than a hold")

    def test_external_video_marker_preserves_source_times_and_omits_endpoint_toast(self):
        clip = self.root / "timing-clip.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30", "-t", "3", "-pix_fmt", "yuv420p", str(clip)], check=True)
        session = self.root / "timing-external"
        run("start", "--output", session, "--source", "external", "--title", "Timing")
        run("annotate", session, "--type", "test_start", "--message", "In range", "--at", 0.2)
        run("annotate", session, "--type", "assertion", "--result", "passed", "--message", "Later assertion", "--at", 5.0)
        run("annotate", session, "--type", "assertion", "--result", "failed", "--message", "Later distinct event", "--at", 6.0)
        marker = 0.0
        run("stop", session, "--video", clip, "--video-started-at", marker, "--card-seconds", CARD)
        manifest = json.loads((session / "manifest.json").read_text())
        by_message = {event["message"]: event for event in manifest["events"]}
        self.assertEqual(by_message["Later assertion"]["t"], 5.0)
        self.assertEqual(by_message["Later distinct event"]["t"], 6.0)
        self.assertNotIn("timing_status", by_message["In range"])
        self.assertAlmostEqual(by_message["In range"]["adjusted_t"], 0.0, delta=0.3)
        for name in ("Later assertion", "Later distinct event"):
            self.assertEqual(by_message[name]["timing_status"], "outside_approximate_media_mapping")
            self.assertFalse(by_message[name]["overlay"])
        self.assertIn("actual first encoded frame time is unknown", (session / "report.md").read_text())
        self.assertIn("Later assertion", (session / "report.md").read_text())
        self.assertIn("approximate", json.dumps(manifest).lower())

    def test_positive_external_video_marker_aligns_in_range_event(self):
        clip = self.root / "positive-marker.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30", "-t", "3", "-pix_fmt", "yuv420p", str(clip)], check=True)
        session = self.root / "positive-marker"
        run("start", "--output", session, "--source", "external", "--title", "Positive marker")
        started = json.loads((session / "session.json").read_text())["started_at"]
        marker_delay = 0.810
        source_t = marker_delay + 0.650
        run("annotate", session, "--type", "assertion", "--result", "passed", "--message", "Aligned assertion", "--at", source_t)
        run("stop", session, "--video", clip, "--video-started-at", started + marker_delay, "--card-seconds", CARD)
        manifest = json.loads((session / "manifest.json").read_text())
        event = next(e for e in manifest["events"] if e["message"] == "Aligned assertion")
        self.assertEqual(event["t"], source_t)
        self.assertAlmostEqual(event["adjusted_t"], 0.650, places=2)
        self.assertAlmostEqual(event["video_t"], 0.650 + CARD, places=2)
        self.assertNotIn("timing_status", event)
        self.assertEqual(manifest["timing"]["offset_source"], "video-started-at")
        self.assertAlmostEqual(manifest["timing"]["offset_applied"], marker_delay, places=2)
        self.assertAlmostEqual(manifest["video_started_at"], started + marker_delay, places=2)

    def test_short_and_long_post_raw_assertions_remain_unmapped_and_not_green(self):
        clip = self.root / "post-raw.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30", "-t", "1.9", "-pix_fmt", "yuv420p", str(clip)], check=True)
        for name, at in (("short-gap", 2.786), ("long-gap", 3.5)):
            with self.subTest(name=name):
                session = self.root / ("post-" + name)
                run("start", "--output", session, "--source", "external", "--title", name)
                started = json.loads((session / "session.json").read_text())["started_at"]
                run("annotate", session, "--type", "assertion", "--result", "passed", "--message", "Later", "--at", at)
                run("stop", session, "--video", clip, "--video-started-at", started + 0.810, "--card-seconds", CARD)
                manifest = json.loads((session / "manifest.json").read_text())
                event = next(e for e in manifest["events"] if e["type"] == "assertion")
                self.assertEqual(event["timing_status"], "outside_approximate_media_mapping")
                self.assertFalse(event["overlay"])
                self.assertEqual(manifest["assertion_tally"]["passed"], 0)
                self.assertEqual(manifest["test_tally"]["passed"], 1)  # source outcome remains in summary; media assertion tally stays unmapped
                self.assertEqual(manifest["assertion_tally"]["passed"], 0)
                self.assertIn("Later", (session / "report.md").read_text())
                self.assertEqual(manifest["raw"]["effective_duration"], manifest["raw"]["duration"])

    def test_external_long_post_raw_assertion_remains_unmapped(self):
        clip = self.root / "long-gap.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30", "-t", "1.9", "-pix_fmt", "yuv420p", str(clip)], check=True)
        session = self.root / "long-gap"
        run("start", "--output", session, "--source", "external", "--title", "Long gap")
        started = json.loads((session / "session.json").read_text())["started_at"]
        run("annotate", session, "--type", "assertion", "--result", "passed", "--message", "Later", "--at", 3.5)
        run("stop", session, "--video", clip, "--video-started-at", started + 0.810, "--card-seconds", CARD)
        manifest = json.loads((session / "manifest.json").read_text())
        event = next(e for e in manifest["events"] if e["type"] == "assertion")
        self.assertEqual(event["timing_status"], "outside_approximate_media_mapping")
        self.assertFalse(event["overlay"])
        self.assertEqual(manifest["raw"]["effective_duration"], manifest["raw"]["duration"])

    def test_unmapped_events_do_not_appear_in_timeline_counters_or_captions(self):
        clip = self.root / "unmapped.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30", "-t", "3", "-pix_fmt", "yuv420p", str(clip)], check=True)
        session = self.root / "unmapped"
        run("start", "--output", session, "--source", "external", "--title", "Unmapped")
        run("annotate", session, "--type", "assertion", "--result", "failed", "--message", "Out of range failure", "--at", 8)
        run("narrate", session, "--message", "Out of range narration", "--at", 9)
        run("stop", session, "--video", clip, "--layout", "overlay", "--card-seconds", CARD)
        manifest = json.loads((session / "manifest.json").read_text())
        event = next(e for e in manifest["events"] if e["type"] == "assertion")
        self.assertFalse(event["overlay"])
        self.assertEqual(manifest["assertion_tally"]["failed"], 0)
        self.assertEqual(manifest["test_tally"]["failed"], 1)  # Retain failed outcomes in truthful test summary despite no visible assertion.
        report = (session / "report.md").read_text()
        self.assertIn("Out of range failure", report)
        self.assertIn("source 00:08.0", report)
        self.assertIn("- Result: 1 tests, 0 passed, 1 failed", report)
        self.assertIn("source 00:09.0", report)
        self.assertNotIn("| 00:01.0 | Out of range narration |", report)
        renderer = __import__("importlib.util").util.spec_from_file_location("evidence", EVIDENCE)
        module = __import__("importlib.util").util.module_from_spec(renderer)
        renderer.loader.exec_module(module)
        self.assertEqual(module.tally([event], 100)["failed"], 0)

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

    def test_rejects_invalid_video_started_at_before_finalization(self):
        clip = self.root / "invalid-epoch.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30", "-t", "1", "-pix_fmt", "yuv420p", str(clip)], check=True)
        for value in ("nan", "inf", "not-a-number"):
            with self.subTest(value=value):
                session = self.root / ("invalid-" + value)
                run("start", "--output", session, "--source", "external", "--title", "Invalid epoch")
                result = run("stop", session, "--video", clip, "--video-started-at", value, expect=2)
                self.assertIn("finite epoch timestamp", result.stderr)
                self.assertFalse((session / "manifest.json").exists())

    def test_rejects_oversized_and_incomplete_annotations(self):
        session = self.root / "limits"
        run("start", "--output", session, "--source", "external", "--title", "Limits")
        run("annotate", session, "--type", "assertion", "--message", "x" * 81, "--result", "passed", expect=2)
        run("annotate", session, "--type", "assertion", "--message", "missing result", expect=2)
        run("narrate", session, "--message", "y" * 281, expect=2)
        run("stop", session, expect=2)  # external sessions need --video


if __name__ == "__main__":
    unittest.main(verbosity=2)
