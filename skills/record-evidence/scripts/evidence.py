#!/usr/bin/env python3
"""Evidence recorder: capture a screen, Android emulator, iOS simulator, or imported
browser video while the agent tests live; timestamp narration and assertions; burn them
into the video as an overlay; compose several devices side by side; write a report.

Needs Python 3.8+, ffmpeg and ffprobe. Text overlays need Pillow (preferred) or
ImageMagick; without either the video is still finalized and the report lists the
annotations. Nothing here depends on ffmpeg text filters (libass, drawtext).

Commands: doctor, devices, boot, start, annotate, narrate, stop, render, frames, compose.
Every command prints one JSON object on stdout; diagnostics go to stderr.
"""

import argparse
import datetime as _dt
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

VERSION = "1.0"
IS_WIN = os.name == "nt"
IS_MAC = sys.platform == "darwin"
IS_LINUX = sys.platform.startswith("linux")

MAX_ANNOTATION = 80
MAX_NARRATION = 280
DEFAULT_CARD_SECONDS = 4.0
DEFAULT_TOAST_SECONDS = 5.0
FPS = 30
PAD_COLOR = "0x101014"
# adb screenrecord refuses more than 180 s per invocation; EVIDENCE_SEGMENT_SECONDS lowers it for tests.
SEGMENT_LIMIT = min(180, max(3, int(os.environ.get("EVIDENCE_SEGMENT_SECONDS", "180"))))

STATUS_RECORDING = "recording"
STATUS_FINALIZED = "finalized"
STATUS_FAILED = "finalization_failed"
STATUS_LOST = "recorder_lost"

# Colors as RGBA.
C_BG = (12, 12, 18, 205)
C_BG_SOFT = (12, 12, 18, 165)
C_TEXT = (255, 255, 255, 255)
C_MUTED = (203, 213, 225, 255)
C_DARK = (17, 17, 24, 255)
C_PASS = (34, 197, 94, 255)
C_FAIL = (239, 68, 68, 255)
C_UNTESTED = (245, 158, 11, 255)
C_SETUP = (148, 163, 184, 255)
C_TEST = (96, 165, 250, 255)
C_NARR = (167, 139, 250, 255)
C_DIVIDER = (60, 60, 72, 255)
C_DIM = (0, 0, 0, 120)

RESULT_COLORS = {"passed": C_PASS, "failed": C_FAIL, "untested": C_UNTESTED, "setup": C_SETUP}
RESULT_LABELS = {"passed": "PASS", "failed": "FAIL", "untested": "UNTESTED", "setup": "SETUP"}


# --------------------------------------------------------------------------- utilities


def now():
    return time.time()


def iso(ts):
    return _dt.datetime.fromtimestamp(ts, _dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def mmss(t):
    t = max(0.0, float(t))
    return "%02d:%02d.%d" % (int(t // 60), int(t % 60), int((t * 10) % 10))


def even(n):
    n = int(round(n))
    return max(2, n - (n % 2))


def slug(text, limit=40):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:limit].strip("-") or "item"


def emit(obj):
    print(json.dumps(obj, indent=2, sort_keys=True))


def warn(msg):
    sys.stderr.write("evidence: %s\n" % msg)


def die(msg, code=2, **extra):
    payload = {"error": msg}
    payload.update(extra)
    sys.stderr.write(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    sys.exit(code)


def run(cmd, timeout=None, input_text=None, cwd=None):
    try:
        return subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, input=input_text, cwd=cwd, errors="replace"
        )
    except FileNotFoundError as exc:
        return subprocess.CompletedProcess(cmd, 127, "", str(exc))
    except subprocess.TimeoutExpired as exc:
        return subprocess.CompletedProcess(cmd, 124, exc.stdout or "", "timeout after %ss" % timeout)


def which(name):
    return shutil.which(name)


def read_json(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def write_json(path, obj):
    tmp = Path(str(path) + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2, sort_keys=True), encoding="utf-8")
    os.replace(tmp, path)


def tail(path, lines=20):
    try:
        content = Path(path).read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []
    return content[-lines:]


def process_alive(pid, marker=None):
    """Return (alive, marker_matches). marker is a substring expected in the command line."""
    if not pid:
        return False, False
    if IS_WIN:
        res = run(
            ["powershell", "-NoProfile", "-Command",
             "(Get-CimInstance Win32_Process -Filter \"ProcessId=%d\").CommandLine" % pid],
            timeout=15,
        )
        cmdline = res.stdout.strip()
        alive = res.returncode == 0 and bool(cmdline)
    else:
        res = run(["ps", "-p", str(pid), "-o", "command="], timeout=10)
        cmdline = res.stdout.strip()
        alive = res.returncode == 0 and bool(cmdline)
    return alive, (alive and (marker is None or marker in cmdline))


def sdk_root():
    for var in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        val = os.environ.get(var)
        if val and Path(val).is_dir():
            return Path(val)
    for candidate in (Path.home() / "Library/Android/sdk", Path.home() / "Android/Sdk", Path("/opt/android-sdk")):
        if candidate.is_dir():
            return candidate
    return None


def adb_path():
    found = which("adb")
    if found:
        return found
    root = sdk_root()
    if root:
        cand = root / "platform-tools" / ("adb.exe" if IS_WIN else "adb")
        if cand.exists():
            return str(cand)
    return None


def emulator_path():
    found = which("emulator")
    if found:
        return found
    root = sdk_root()
    if root:
        cand = root / "emulator" / ("emulator.exe" if IS_WIN else "emulator")
        if cand.exists():
            return str(cand)
    return None


# --------------------------------------------------------------------------- ffmpeg


class Toolchain:
    def __init__(self):
        self.ffmpeg = which("ffmpeg")
        self.ffprobe = which("ffprobe")
        self.version = None
        self.encoders = set()
        self.filters = set()
        self.demuxers = set()
        if self.ffmpeg:
            res = run([self.ffmpeg, "-hide_banner", "-version"], timeout=20)
            self.version = (res.stdout.splitlines() or [""])[0].replace("ffmpeg version ", "").split(" ")[0]
            res = run([self.ffmpeg, "-hide_banner", "-encoders"], timeout=20)
            for line in res.stdout.splitlines():
                parts = line.split()
                if len(parts) >= 2 and parts[0].startswith("V"):
                    self.encoders.add(parts[1])
            res = run([self.ffmpeg, "-hide_banner", "-filters"], timeout=20)
            for line in res.stdout.splitlines():
                parts = line.split()
                if len(parts) >= 2 and re.match(r"^[.TSC]{3}$", parts[0]):
                    self.filters.add(parts[1])
            res = run([self.ffmpeg, "-hide_banner", "-demuxers"], timeout=20)
            for line in res.stdout.splitlines():
                parts = line.split()
                if len(parts) >= 2 and parts[0].startswith("D"):
                    self.demuxers.add(parts[1])

    @property
    def ready(self):
        return bool(self.ffmpeg and self.ffprobe and self.encoder)

    @property
    def encoder(self):
        if "libx264" in self.encoders:
            return "libx264"
        if "h264_videotoolbox" in self.encoders:
            return "h264_videotoolbox"
        if "libopenh264" in self.encoders:
            return "libopenh264"
        return None

    def encode_args(self, quality="render", preset="veryfast", crf=20):
        enc = self.encoder
        if enc == "libx264":
            if quality == "capture":
                return ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p"]
            return ["-c:v", "libx264", "-preset", preset, "-crf", str(crf), "-pix_fmt", "yuv420p"]
        if enc == "h264_videotoolbox":
            return ["-c:v", "h264_videotoolbox", "-b:v", "12M" if quality == "capture" else "8M", "-pix_fmt", "yuv420p"]
        if enc == "libopenh264":
            return ["-c:v", "libopenh264", "-b:v", "8M", "-pix_fmt", "yuv420p"]
        die("no H.264 encoder in this ffmpeg build (need libx264 or h264_videotoolbox)")

    def capture_encoder_args(self):
        # Capture prefers the hardware encoder when present: full-resolution desktops are heavy.
        if "h264_videotoolbox" in self.encoders:
            return ["-c:v", "h264_videotoolbox", "-b:v", "12M", "-pix_fmt", "yuv420p"]
        return self.encode_args(quality="capture")


def ffprobe_video(tc, path):
    """Return {width, height, duration, size, codec}. duration is None when unknown."""
    res = run(
        [tc.ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,codec_name,duration:format=duration,size", "-of", "json", str(path)],
        timeout=120,
    )
    if res.returncode != 0:
        return None
    data = json.loads(res.stdout or "{}")
    streams = data.get("streams") or []
    if not streams:
        return None
    st = streams[0]
    fmt = data.get("format") or {}
    duration = None
    for cand in (fmt.get("duration"), st.get("duration")):
        try:
            duration = float(cand)
            break
        except (TypeError, ValueError):
            continue
    if duration is None or duration <= 0:
        # Containers written without a duration (some WebM writers): read the last packet timestamp.
        res2 = run(
            [tc.ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time",
             "-of", "csv=p=0", str(path)],
            timeout=600,
        )
        values = [line.strip() for line in res2.stdout.splitlines() if line.strip() and line.strip() != "N/A"]
        if values:
            try:
                duration = float(values[-1]) + 1.0 / FPS
            except ValueError:
                duration = None
    return {
        "width": int(st.get("width") or 0),
        "height": int(st.get("height") or 0),
        "codec": st.get("codec_name"),
        "duration": duration,
        "size": int(fmt.get("size") or Path(path).stat().st_size),
    }


def probe_inputs(tc, files):
    """Probe a list of raw files (segments) and return merged info with summed duration."""
    total = 0.0
    first = None
    for f in files:
        info = ffprobe_video(tc, f)
        if not info:
            return None
        if first is None:
            first = info
        total += info["duration"] or 0.0
    if first is None:
        return None
    first = dict(first)
    first["duration"] = total
    first["files"] = [str(f) for f in files]
    return first


def concat_list_file(files, path):
    lines = ["ffconcat version 1.0"]
    for f in files:
        p = str(Path(f).resolve()).replace("'", "'\\''")
        lines.append("file '%s'" % p)
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def input_args_for(files, list_path):
    files = [str(f) for f in files]
    if len(files) == 1:
        return ["-i", files[0]]
    concat_list_file(files, list_path)
    return ["-f", "concat", "-safe", "0", "-i", str(list_path)]


# --------------------------------------------------------------------------- fonts and rasterizers


FONT_CANDIDATES = {
    "regular": [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ],
    "bold": [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ],
}


def find_fonts(preferred=None):
    preferred = preferred or os.environ.get("EVIDENCE_FONT")
    if preferred:
        if not Path(preferred).exists():
            die("font not found: %s" % preferred)
        return preferred, preferred
    regular = next((p for p in FONT_CANDIDATES["regular"] if Path(p).exists()), None)
    bold = next((p for p in FONT_CANDIDATES["bold"] if Path(p).exists()), None) or regular
    return regular, bold


class PillowRaster:
    name = "pillow"

    def __init__(self, font_path, bold_path):
        from PIL import Image, ImageDraw, ImageFont  # noqa: F401

        self.Image, self.ImageDraw, self.ImageFont = Image, ImageDraw, ImageFont
        self.font_path, self.bold_path = font_path, bold_path
        self._fonts = {}

    def font(self, size, bold=False):
        key = (int(size), bold)
        if key not in self._fonts:
            path = self.bold_path if bold else self.font_path
            if path:
                f = self.ImageFont.truetype(path, int(size))
            else:
                try:
                    f = self.ImageFont.load_default(size=int(size))
                except TypeError:
                    f = self.ImageFont.load_default()
            self._fonts[key] = f
        return self._fonts[key]

    def measure(self, text, size, bold=False):
        f = self.font(size, bold)
        try:
            return float(f.getlength(text))
        except AttributeError:
            return float(f.getbbox(text)[2])

    def frame(self, w, h):
        return PillowFrame(self, w, h)


class PillowFrame:
    def __init__(self, r, w, h):
        self.r = r
        self.img = r.Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.draw = r.ImageDraw.Draw(self.img)

    def rect(self, x, y, w, h, color, radius=0):
        if w <= 0 or h <= 0:
            return
        box = [int(x), int(y), int(x + w - 1), int(y + h - 1)]
        if radius > 0:
            self.draw.rounded_rectangle(box, radius=int(radius), fill=color)
        else:
            self.draw.rectangle(box, fill=color)

    def text(self, x, y, text, size, color, bold=False):
        # Faux bold when no separate bold face exists.
        stroke = max(1, int(size / 28)) if bold and self.r.bold_path == self.r.font_path else 0
        self.draw.text((int(x), int(y)), text, font=self.r.font(size, bold), fill=color,
                       stroke_width=stroke, stroke_fill=color if stroke else None)

    def save(self, path):
        self.img.save(str(path), "PNG", compress_level=1)


def _im_escape(text):
    text = text.replace("\\", "\\\\").replace("%", "%%")
    if text.startswith("@"):
        text = "\\" + text
    return text


def _css_rgba(color):
    r, g, b, a = color
    return "rgba(%d,%d,%d,%.3f)" % (r, g, b, a / 255.0)


class MagickRaster:
    name = "imagemagick"

    def __init__(self, exe, font_path, bold_path):
        self.exe = exe
        self.font_path, self.bold_path = font_path, bold_path
        self._measure_cache = {}

    def font_args(self, bold):
        path = self.bold_path if bold else self.font_path
        return ["-font", path] if path else []

    def measure(self, text, size, bold=False):
        key = (text, int(size), bold)
        if key not in self._measure_cache:
            res = run([self.exe, "-background", "none", *self.font_args(bold), "-pointsize", str(int(size)),
                       "label:" + _im_escape(text), "-format", "%w", "info:"], timeout=60)
            try:
                self._measure_cache[key] = float(res.stdout.strip().split()[0])
            except (ValueError, IndexError):
                self._measure_cache[key] = len(text) * size * 0.55
        return self._measure_cache[key]

    def frame(self, w, h):
        return MagickFrame(self, w, h)


class MagickFrame:
    def __init__(self, r, w, h):
        self.r = r
        self.w, self.h = w, h
        self.ops = []

    def rect(self, x, y, w, h, color, radius=0):
        if w <= 0 or h <= 0:
            return
        x0, y0, x1, y1 = int(x), int(y), int(x + w - 1), int(y + h - 1)
        if radius > 0:
            draw = "roundrectangle %d,%d %d,%d %d,%d" % (x0, y0, x1, y1, int(radius), int(radius))
        else:
            draw = "rectangle %d,%d %d,%d" % (x0, y0, x1, y1)
        self.ops += ["-fill", _css_rgba(color), "-draw", draw]

    def text(self, x, y, text, size, color, bold=False):
        self.ops += ["-gravity", "NorthWest", "-fill", _css_rgba(color), *self.r.font_args(bold),
                     "-pointsize", str(int(size)), "-annotate", "+%d+%d" % (int(x), int(y)), _im_escape(text)]

    def save(self, path):
        res = run([self.r.exe, "-size", "%dx%d" % (self.w, self.h), "xc:none", *self.ops, "PNG32:" + str(path)],
                  timeout=300)
        if res.returncode != 0:
            die("ImageMagick failed to render an overlay frame", detail=res.stderr.strip()[-800:])


def overlay_backend(font=None):
    """Return (raster or None, description dict). EVIDENCE_OVERLAY_BACKEND=pillow|imagemagick|none forces one."""
    regular, bold = find_fonts(font)
    info = {"font": regular, "bold_font": bold}
    forced = os.environ.get("EVIDENCE_OVERLAY_BACKEND")
    if forced in (None, "pillow"):
        try:
            raster = PillowRaster(regular, bold)
            info["backend"] = "pillow"
            return raster, info
        except ImportError:
            if forced:
                die("EVIDENCE_OVERLAY_BACKEND=pillow but Pillow is not importable")
    if forced in (None, "imagemagick"):
        exe = which("magick") or which("convert")
        if exe:
            info["backend"] = "imagemagick"
            return MagickRaster(exe, regular, bold), info
        if forced:
            die("EVIDENCE_OVERLAY_BACKEND=imagemagick but neither magick nor convert is on PATH")
    info["backend"] = None
    info["hint"] = "install Pillow (python3 -m pip install pillow) or ImageMagick for text overlays"
    return None, info


# --------------------------------------------------------------------------- overlay painting


class Painter:
    """Draws text blocks on frames. Sizes are pixels; blocks wrap to a max width."""

    def __init__(self, raster):
        self.r = raster

    def wrap(self, text, size, max_w, bold=False):
        words = text.split()
        lines, current = [], ""
        for word in words:
            trial = (current + " " + word).strip()
            if self.r.measure(trial, size, bold) <= max_w or not current:
                current = trial
                # Break words longer than the line.
                while self.r.measure(current, size, bold) > max_w and len(current) > 1:
                    cut = len(current)
                    while cut > 1 and self.r.measure(current[:cut], size, bold) > max_w:
                        cut -= 1
                    lines.append(current[:cut])
                    current = current[cut:]
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines or [""]

    def layout(self, parts, max_w, pad, accent=0, gap=None):
        """parts: [(text, size, color, bold)]. Returns dict with lines, width, height."""
        inner_w = max(20, max_w - 2 * pad - accent)
        rows = []
        width = 0.0
        height = 0.0
        for idx, (text, size, color, bold) in enumerate(parts):
            lines = self.wrap(text, size, inner_w, bold)
            lh = size * 1.32
            for ln in lines:
                width = max(width, self.r.measure(ln, size, bold))
            rows.append((lines, size, color, bold, lh))
            height += lh * len(lines)
            if idx < len(parts) - 1:
                height += (gap if gap is not None else size * 0.35)
        return {"rows": rows, "w": int(min(max_w, width + 2 * pad + accent)), "h": int(height + 2 * pad), "pad": pad, "accent": accent}

    def paint(self, fr, block, x, y, bg=None, radius=0, accent_color=None, width=None):
        w = width or block["w"]
        h = block["h"]
        if bg is not None:
            fr.rect(x, y, w, h, bg, radius)
        if block["accent"] and accent_color is not None:
            fr.rect(x + block["pad"] * 0.5, y + block["pad"] * 0.6, block["accent"] * 0.6, h - block["pad"] * 1.2, accent_color, radius=block["accent"] * 0.3)
        tx = x + block["pad"] + block["accent"]
        ty = y + block["pad"]
        for idx, (lines, size, color, bold, lh) in enumerate(block["rows"]):
            for ln in lines:
                fr.text(tx, ty + (lh - size) * 0.35, ln, size, color, bold)
                ty += lh
            if idx < len(block["rows"]) - 1:
                ty += size * 0.35
        return w, h

    def pill(self, fr, x, y, label, color, size, text_color=None):
        pw = self.r.measure(label, size, True) + size * 1.1
        ph = size * 1.55
        fr.rect(x, y, pw, ph, color, radius=ph * 0.3)
        tc = text_color or (C_DARK if color in (C_UNTESTED, C_SETUP) else C_TEXT)
        fr.text(x + size * 0.55, y + (ph - size) * 0.35, label, size, tc, True)
        return pw, ph

    def measure_pill_line(self, label, message, size, max_w, pad=0):
        """Geometry of a pill followed by wrapped text, without drawing."""
        pill_size = size * 0.8
        pill_w = self.r.measure(label, pill_size, True) + pill_size * 1.1
        pill_h = pill_size * 1.55
        text_x = pad + pill_w + size * 0.5
        lines = self.wrap(message, size, max_w - text_x - pad)
        lh = size * 1.32
        text_h = lh * len(lines)
        h = max(pill_h, text_h) + 2 * pad
        w = min(max_w, text_x + max(self.r.measure(ln, size) for ln in lines) + pad)
        return {"w": w, "h": h, "lines": lines, "lh": lh, "text_h": text_h, "text_x": text_x, "pill_size": pill_size, "pill_h": pill_h}

    def pill_line(self, fr, x, y, label, color, message, size, max_w, bg=None, pad=0):
        """A pill followed by wrapped text. Returns (w, h). Draws bg first when given."""
        g = self.measure_pill_line(label, message, size, max_w, pad)
        if bg is not None:
            fr.rect(x, y, g["w"], g["h"], bg, radius=size * 0.45)
        text_first = g["text_h"] >= g["pill_h"]
        pill_y = y + pad + (g["lh"] - g["pill_h"]) / 2 if text_first else y + pad
        self.pill(fr, x + pad, pill_y, label, color, g["pill_size"])
        ty = y + pad if text_first else y + pad + (g["pill_h"] - g["text_h"]) / 2
        for ln in g["lines"]:
            fr.text(x + g["text_x"], ty + (g["lh"] - size) * 0.35, ln, size, C_TEXT)
            ty += g["lh"]
        return g["w"], g["h"]


def judge_tests(events):
    """Group assertions under the preceding test_start. Returns a list of tests in order."""
    tests = []
    current = None
    for ev in events:
        if ev["type"] == "test_start":
            current = {"name": ev["message"], "t": ev["video_t"], "assertions": []}
            tests.append(current)
        elif ev["type"] == "assertion":
            if current is None:
                current = {"name": "Preconditions", "t": ev["video_t"], "assertions": [], "implicit": True}
                tests.append(current)
            current["assertions"].append(ev)
    for test in tests:
        results = [a["result"] for a in test["assertions"]]
        if "failed" in results:
            test["result"] = "failed"
        elif not results or "untested" in results:
            test["result"] = "untested"
        else:
            test["result"] = "passed"
    return tests


def tally(events, upto=None):
    counts = {"passed": 0, "failed": 0, "untested": 0}
    for ev in events:
        if ev["type"] == "assertion" and (upto is None or ev["video_t"] <= upto):
            counts[ev["result"]] = counts.get(ev["result"], 0) + 1
    return counts


def test_tally(tests):
    counts = {"passed": 0, "failed": 0, "untested": 0}
    for t in tests:
        counts[t["result"]] += 1
    return counts


def tally_text(counts):
    return "%d passed  ·  %d failed  ·  %d untested" % (counts["passed"], counts["failed"], counts["untested"])


class OverlayRenderer:
    """Builds the timed PNG overlay sequence for one canvas.

    cfg keys:
      mode: "overlay" | "panel"
      canvas: (W, H)
      panes: [{rect:(x,y,w,h), label, events:[...], tests:[...]}]  (video_t already includes the title card)
      narration: [events]        narration_pos: "top" | "bottom" | "panel"
      panel_rect: (x,y,w,h)      (panel mode)
      header_h: int              (composite label bar height, 0 when none)
      card: float                title/summary card seconds (0 disables)
      dur: float                 content duration (without cards)
      title, meta: [str]
      toast: float
    """

    def __init__(self, raster, cfg, out_dir):
        self.p = Painter(raster)
        self.cfg = cfg
        self.out_dir = Path(out_dir)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        for old in self.out_dir.glob("f*.png"):
            old.unlink()
        self.total = cfg["card"] * 2 + cfg["dur"]

    # ---- timeline

    def boundaries(self):
        cfg = self.cfg
        pts = {0.0, cfg["card"], cfg["card"] + cfg["dur"], self.total}
        for pane in cfg["panes"]:
            for ev in pane["events"]:
                pts.add(ev["video_t"])
                if ev["type"] in ("assertion", "setup"):
                    pts.add(ev["video_t"] + cfg["toast"])
        for ev in cfg["narration"]:
            pts.add(ev["video_t"])
            if ev.get("hold"):
                pts.add(ev["video_t"] + ev["hold"])
        pts = sorted(round(p, 3) for p in pts if 0 <= p < self.total - 0.001)
        out = []
        for p in pts:
            if not out or p - out[-1] >= 0.02:
                out.append(p)
        return out

    def state_at(self, t):
        cfg = self.cfg
        if cfg["card"] and t < cfg["card"]:
            return {"card": "title"}
        if cfg["card"] and t >= cfg["card"] + cfg["dur"]:
            return {"card": "summary"}
        narr = None
        for ev in cfg["narration"]:
            if ev["video_t"] <= t and (not ev.get("hold") or t < ev["video_t"] + ev["hold"]):
                narr = ev.get("lines") or [ev["message"]]
            elif ev["video_t"] <= t and ev.get("hold") and t >= ev["video_t"] + ev["hold"]:
                narr = None
        panes = []
        for pane in cfg["panes"]:
            test_idx, test_msg, toast = 0, None, None
            total_tests = sum(1 for e in pane["events"] if e["type"] == "test_start")
            for ev in pane["events"]:
                if ev["video_t"] > t:
                    break
                if ev["type"] == "test_start":
                    test_idx += 1
                    test_msg = ev["message"]
                elif ev["type"] in ("assertion", "setup"):
                    toast = (ev["type"], ev.get("result") or "setup", ev["message"]) if t < ev["video_t"] + cfg["toast"] else None
            log = [(e["result"], e["message"]) for e in pane["events"] if e["type"] == "assertion" and e["video_t"] <= t][-8:]
            panes.append({"test": (test_idx, total_tests, test_msg) if test_msg else None, "toast": toast,
                          "tally": tally(pane["events"], t), "log": log,
                          "seen": any(e["type"] == "assertion" and e["video_t"] <= t for e in pane["events"])})
        return {"card": None, "narration": narr, "panes": panes}

    def build(self):
        pts = self.boundaries()
        frames = {}
        entries = []
        for idx, start in enumerate(pts):
            end = pts[idx + 1] if idx + 1 < len(pts) else self.total
            state = self.state_at(start + 0.001)
            key = hashlib.sha1(json.dumps(state, sort_keys=True).encode("utf-8")).hexdigest()
            if key not in frames:
                name = "f%04d.png" % len(frames)
                self.paint_state(state, self.out_dir / name)
                frames[key] = name
            entries.append((frames[key], max(0.02, end - start)))
        lines = ["ffconcat version 1.0"]
        for name, dur in entries:
            lines.append("file '%s'" % name)
            lines.append("duration %.3f" % dur)
        # Repeat the last frame so the stream lasts until the end of the video.
        lines.append("file '%s'" % entries[-1][0])
        list_path = self.out_dir / "overlay.ffconcat"
        list_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return list_path, len(frames)

    # ---- painting

    def paint_state(self, state, path):
        W, H = self.cfg["canvas"]
        fr = self.p.r.frame(W, H)
        self.paint_chrome(fr)
        if state.get("card") == "title":
            self.paint_title_card(fr)
        elif state.get("card") == "summary":
            self.paint_summary_card(fr)
        elif self.cfg["mode"] == "panel":
            self.paint_panel(fr, state)
        else:
            self.paint_overlay(fr, state)
        fr.save(path)

    def paint_chrome(self, fr):
        cfg = self.cfg
        if cfg.get("header_h"):
            # Each pane owns the header band directly above it (rect.y - header_h).
            s = cfg["scale"]
            slots = cfg["slots"]
            hh = cfg["header_h"]
            for pane in cfg["panes"]:
                x, y, w, h = pane["rect"]
                top = y - hh
                label = pane.get("label") or ""
                size = 30 * s
                tw = self.p.r.measure(label, size, True)
                fr.text(x + (w - tw) / 2, top + slots["pad"] + (slots["label_h"] - size) / 2 - size * 0.1, label, size, C_TEXT, True)
                fr.rect(x, y - 2, w, 2, C_DIVIDER)
                if x > 0:
                    fr.rect(x - 2, top, 4, hh + h, C_DIVIDER)
                if top > 0:
                    fr.rect(x, top, w, 2, C_DIVIDER)
            if cfg.get("footer_h"):
                fr.rect(0, cfg["canvas"][1] - cfg["footer_h"], cfg["canvas"][0], 2, C_DIVIDER)
        if cfg["mode"] == "panel":
            px, py, pw, ph = cfg["panel_rect"]
            fr.rect(px, py, 3, ph, C_DIVIDER)

    def card_rect(self):
        """Center the cards over the video area (not the panel or footer)."""
        cfg = self.cfg
        if cfg["mode"] == "panel":
            return cfg["panes"][0]["rect"]
        W, H = cfg["canvas"]
        return (0, 0, W, H - cfg.get("footer_h", 0))

    def paint_title_card(self, fr):
        cfg = self.cfg
        x, y, w, h = self.card_rect()
        s = min(w, h) / 1080.0 * (1.0 if w >= h else 1.25)
        fr.rect(x, y, w, h, C_DIM)
        parts = [(cfg["title"], 56 * s, C_TEXT, True)]
        for line in cfg["meta"]:
            parts.append((line, 26 * s, C_MUTED, False))
        block = self.p.layout(parts, int(w * 0.78), int(34 * s), gap=int(14 * s))
        self.p.paint(fr, block, x + (w - block["w"]) / 2, y + (h - block["h"]) / 2, bg=C_BG, radius=22 * s)

    def paint_summary_card(self, fr):
        cfg = self.cfg
        x, y, w, h = self.card_rect()
        s = min(w, h) / 1080.0 * (1.0 if w >= h else 1.25)
        fr.rect(x, y, w, h, C_DIM)
        tests = []
        for pane in cfg["panes"]:
            for t in pane["tests"]:
                prefix = ("[%s] " % pane["label"]) if len(cfg["panes"]) > 1 and pane.get("label") else ""
                tests.append((t["result"], prefix + t["name"]))
        counts = {"passed": 0, "failed": 0, "untested": 0}
        for r, _ in tests:
            counts[r] += 1
        pad = int(34 * s)
        max_w = int(w * 0.8)
        head = self.p.layout([("Results", 48 * s, C_TEXT, True),
                              ("%d tests  ·  %s" % (len(tests), tally_text(counts)), 28 * s, C_MUTED, False)],
                             max_w, 0, gap=int(10 * s))
        line_size = 26 * s
        shown = tests[:8]
        extra = len(tests) - len(shown)
        rows_h = 0
        row_layouts = []
        for r, name in shown:
            lines = self.p.wrap(name, line_size, max_w - 2 * pad - line_size * 5.5)
            rh = max(line_size * 1.55, line_size * 1.32 * len(lines)) + line_size * 0.45
            row_layouts.append((r, lines, rh))
            rows_h += rh
        if extra > 0:
            rows_h += line_size * 1.5
        block_w = max_w
        block_h = head["h"] + int(20 * s) + rows_h + 2 * pad
        bx = x + (w - block_w) / 2
        by = y + (h - block_h) / 2
        fr.rect(bx, by, block_w, block_h, C_BG, radius=22 * s)
        self.p.paint(fr, head, bx + pad, by + pad)
        ty = by + pad + head["h"] + int(20 * s)
        for r, lines, rh in row_layouts:
            self.p.pill(fr, bx + pad, ty, RESULT_LABELS[r], RESULT_COLORS[r], line_size * 0.8)
            lx = bx + pad + line_size * 5.5
            ly = ty
            for ln in lines:
                fr.text(lx, ly + line_size * 0.15, ln, line_size, C_TEXT)
                ly += line_size * 1.32
            ty += rh
        if extra > 0:
            fr.text(bx + pad, ty, "+%d more in report.md" % extra, line_size * 0.9, C_MUTED)

    @staticmethod
    def pane_scale(w, h):
        # Text scales with the pane: a 1080p landscape pane is 1.0; narrow portrait panes follow width.
        return min(h / 1080.0, w / 720.0)

    @staticmethod
    def narration_parts(lines, size):
        return [(line, size, C_TEXT, False) for line in lines]

    def paint_overlay(self, fr, state):
        cfg = self.cfg
        W, H = cfg["canvas"]
        if cfg.get("header_h"):
            self.paint_dashboard(fr, state)
            return
        # Single pane: chips and toasts sit on the video, narration top-left.
        pane, pstate = cfg["panes"][0], state["panes"][0]
        x, y, w, h = pane["rect"]
        s = self.pane_scale(w, h)
        pad = int(24 * s)
        if pstate["test"]:
            idx, total, msg = pstate["test"]
            block = self.p.layout([("TEST %d/%d" % (idx, total), 19 * s, C_TEST, True), (msg, 24 * s, C_TEXT, False)],
                                  int(w * 0.38), int(16 * s), gap=int(4 * s))
            self.p.paint(fr, block, x + w - pad - block["w"], y + pad, bg=C_BG, radius=12 * s)
        if pstate["toast"]:
            kind, result, msg = pstate["toast"]
            g = self.p.measure_pill_line(RESULT_LABELS[result], msg, 26 * s, int(w * 0.6), pad=int(16 * s))
            self.p.pill_line(fr, x + pad, y + h - pad - g["h"], RESULT_LABELS[result], RESULT_COLORS[result], msg, 26 * s,
                             int(w * 0.6), bg=C_BG, pad=int(16 * s))
        if pstate["seen"]:
            block = self.p.layout([(tally_text(pstate["tally"]), 21 * s, C_MUTED, False)], int(w * 0.5), int(12 * s))
            self.p.paint(fr, block, x + w - pad - block["w"], y + h - pad - block["h"], bg=C_BG_SOFT, radius=10 * s)
        if state.get("narration"):
            block = self.p.layout(self.narration_parts(state["narration"], 30 * s), int(w * 0.56), int(20 * s), accent=int(10 * s))
            self.p.paint(fr, block, x + pad, y + pad, bg=C_BG, radius=14 * s, accent_color=C_NARR)

    def paint_dashboard(self, fr, state):
        """Composite: per-pane state in the header above each pane, narration in the footer. The video stays clear."""
        cfg = self.cfg
        W, H = cfg["canvas"]
        s = cfg["scale"]
        slots = cfg["slots"]
        for pane, pstate in zip(cfg["panes"], state["panes"]):
            x, y, w, h = pane["rect"]
            inner_x = x + slots["pad"]
            inner_w = w - 2 * slots["pad"]
            top = y - cfg["header_h"] + slots["pad"] + slots["label_h"]
            if pstate["test"]:
                idx, total, msg = pstate["test"]
                block = self.p.layout([("TEST %d/%d" % (idx, total), 19 * s, C_TEST, True), (msg, 24 * s, C_TEXT, False)],
                                      inner_w, int(14 * s), gap=int(4 * s))
                self.p.paint(fr, block, inner_x, top, bg=C_BG, radius=12 * s, width=inner_w)
            top += slots["chip_h"] + slots["gap"]
            if pstate["toast"]:
                kind, result, msg = pstate["toast"]
                self.p.pill_line(fr, inner_x, top, RESULT_LABELS[result], RESULT_COLORS[result], msg, 24 * s, inner_w,
                                 bg=C_BG, pad=int(12 * s))
            top += slots["toast_h"] + slots["gap"]
            if pstate["seen"]:
                fr.text(inner_x, top + 4 * s, tally_text(pstate["tally"]), 21 * s, C_MUTED)
        if state.get("narration") and cfg.get("footer_h"):
            fy = H - cfg["footer_h"] + slots["pad"]
            block = self.p.layout(self.narration_parts(state["narration"], slots["narration_size"]), W - 2 * slots["pad"], int(16 * s),
                                  accent=int(10 * s))
            self.p.paint(fr, block, slots["pad"], fy, accent_color=C_NARR)

    def paint_panel(self, fr, state):
        cfg = self.cfg
        px, py, pw, ph = cfg["panel_rect"]
        s = pw / 720.0
        pad = int(28 * s)
        x = px + pad
        y = py + pad
        inner = pw - 2 * pad
        pstate = state["panes"][0]
        head = self.p.layout([(cfg["title"], 32 * s, C_TEXT, True)] + [(m, 19 * s, C_MUTED, False) for m in cfg["meta"]],
                             inner, 0, gap=int(6 * s))
        self.p.paint(fr, head, x, y)
        y += head["h"] + int(18 * s)
        fr.rect(x, y, inner, 2, C_DIVIDER)
        y += int(22 * s)
        if state.get("narration"):
            fr.text(x, y, "NARRATION", 17 * s, C_NARR, True)
            y += 17 * s * 1.6
            block = self.p.layout(self.narration_parts(state["narration"], 29 * s), inner, 0)
            self.p.paint(fr, block, x, y)
            y += block["h"] + int(26 * s)
        if pstate["test"]:
            idx, total, msg = pstate["test"]
            fr.text(x, y, "TEST %d/%d" % (idx, total), 17 * s, C_TEST, True)
            y += 17 * s * 1.6
            block = self.p.layout([(msg, 25 * s, C_TEXT, False)], inner, 0)
            self.p.paint(fr, block, x, y)
            y += block["h"] + int(26 * s)
        # Footer tally (reserve space).
        footer_h = int(21 * s * 1.6) + pad
        if pstate["log"]:
            fr.text(x, y, "CHECKS", 17 * s, C_SETUP, True)
            y += 17 * s * 1.6
            size = 22 * s
            for result, msg in reversed(pstate["log"]):
                probe = self.p.r.frame(4, 4)
                _, rh = self.p.pill_line(probe, 0, 0, RESULT_LABELS[result], RESULT_COLORS[result], msg, size, inner)
                if y + rh > py + ph - footer_h - pad:
                    break
                self.p.pill_line(fr, x, y, RESULT_LABELS[result], RESULT_COLORS[result], msg, size, inner)
                y += rh + int(10 * s)
        if pstate["seen"]:
            fr.text(x, py + ph - footer_h, tally_text(pstate["tally"]), 21 * s, C_MUTED)


# --------------------------------------------------------------------------- session storage


def session_paths(session):
    session = Path(session)
    return {
        "dir": session,
        "session": session / "session.json",
        "events": session / "events.jsonl",
        "recorder": session / "recorder.json",
        "exit": session / "recorder-exit.json",
        "stop_request": session / "stop.request",
        "capture": session / "capture",
        "overlay": session / "overlay",
        "video": session / "evidence.mp4",
        "report": session / "report.md",
        "manifest": session / "manifest.json",
        "supervisor_log": session / "supervisor.log",
        "capture_log": session / "capture.log",
    }


def load_session(session):
    sp = session_paths(session)
    data = read_json(sp["session"])
    if not data:
        die("not a session directory (session.json missing): %s" % sp["dir"])
    return data, sp


def read_events(sp):
    events = []
    if sp["events"].exists():
        for line in sp["events"].read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                events.append(json.loads(line))
    events.sort(key=lambda e: e["t"])
    return events


def append_event(sp, ev):
    with open(sp["events"], "a", encoding="utf-8") as fh:
        fh.write(json.dumps(ev, sort_keys=True) + "\n")


# --------------------------------------------------------------------------- environment discovery


def list_android_devices(adb):
    if not adb:
        return []
    res = run([adb, "devices", "-l"], timeout=30)
    devices = []
    for line in res.stdout.splitlines()[1:]:
        parts = line.split()
        if len(parts) >= 2 and parts[1] in ("device", "offline", "unauthorized"):
            info = {"serial": parts[0], "state": parts[1]}
            for kv in parts[2:]:
                if ":" in kv:
                    k, v = kv.split(":", 1)
                    info[k] = v
            devices.append(info)
    return devices


def list_avds(emulator):
    if not emulator:
        return []
    res = run([emulator, "-list-avds"], timeout=30)
    return [line.strip() for line in res.stdout.splitlines() if line.strip() and not line.startswith("INFO")]


def scrcpy_version():
    exe = which("scrcpy")
    if not exe:
        return None, None
    res = run([exe, "--version"], timeout=20)
    match = re.search(r"scrcpy\s+v?(\d+)\.(\d+)", res.stdout + res.stderr)
    if not match:
        return exe, (0, 0)
    return exe, (int(match.group(1)), int(match.group(2)))


def runtime_version(runtime_id):
    match = re.search(r"(\d+)[-.](\d+)(?:[-.](\d+))?$", runtime_id)
    if not match:
        return (0, 0, 0)
    return tuple(int(g) if g else 0 for g in match.groups())


def list_ios_devices():
    if not IS_MAC or not which("xcrun"):
        return None
    res = run(["xcrun", "simctl", "list", "devices", "-j"], timeout=60)
    if res.returncode != 0:
        return None
    data = json.loads(res.stdout or "{}")
    devices = []
    for runtime, entries in (data.get("devices") or {}).items():
        for dev in entries:
            if dev.get("isAvailable") is False:
                continue
            short = runtime.rsplit(".", 1)[-1].replace("-", " ", 1).replace("-", ".")
            devices.append({"udid": dev["udid"], "name": dev["name"], "state": dev.get("state"), "runtime": short,
                            "_rt": runtime_version(runtime)})
    devices.sort(key=lambda d: (d["name"], d["_rt"]), reverse=True)
    for d in devices:
        d.pop("_rt", None)
    return devices


def resolve_ios(target, need_booted):
    devices = list_ios_devices()
    if devices is None:
        die("xcrun simctl is unavailable (macOS with Xcode command line tools required)")
    if target:
        exact = [d for d in devices if d["udid"].lower() == target.lower() or d["name"].lower() == target.lower()]
        if not exact:
            die("no iOS simulator named or identified by %r" % target, available=[d["name"] for d in devices][:30])
        booted = [d for d in exact if d["state"] == "Booted"]
        return (booted or exact)[0]
    booted = [d for d in devices if d["state"] == "Booted"]
    if need_booted:
        if len(booted) == 1:
            return booted[0]
        die("pass --target: %d booted simulators" % len(booted), booted=[d["name"] for d in booted])
    die("pass --target <name or udid>")


def resolve_android(adb, target):
    devices = [d for d in list_android_devices(adb) if d["state"] == "device"]
    if target:
        for d in devices:
            if d["serial"] == target:
                return d
        die("android device %r is not connected (state device)" % target, connected=[d["serial"] for d in devices])
    if len(devices) == 1:
        return devices[0]
    die("pass --target <serial>: %d android devices connected" % len(devices), connected=[d["serial"] for d in devices])


def mac_screens(tc):
    if not (IS_MAC and tc.ffmpeg):
        return []
    res = run([tc.ffmpeg, "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], timeout=30)
    screens = []
    for line in (res.stderr + res.stdout).splitlines():
        match = re.search(r"\[(\d+)\]\s+Capture screen (\d+)", line)
        if match:
            screens.append({"index": int(match.group(1)), "screen": int(match.group(2))})
    return screens


def x11_screen_size(display):
    env = dict(os.environ, DISPLAY=display)
    try:
        res = subprocess.run(["xdpyinfo"], capture_output=True, text=True, timeout=15, env=env)
        match = re.search(r"dimensions:\s+(\d+)x(\d+)", res.stdout)
        if match:
            return int(match.group(1)), int(match.group(2))
    except (OSError, subprocess.TimeoutExpired):
        pass
    try:
        res = subprocess.run(["xrandr", "--current"], capture_output=True, text=True, timeout=15, env=env)
        match = re.search(r"current\s+(\d+)\s*x\s*(\d+)", res.stdout)
        if match:
            return int(match.group(1)), int(match.group(2))
    except (OSError, subprocess.TimeoutExpired):
        pass
    return None


def screen_capture_info(tc):
    info = {"available": False}
    if IS_MAC:
        screens = mac_screens(tc)
        info.update({"grabber": "avfoundation", "screens": screens, "available": bool(screens),
                     "note": "needs Screen Recording permission for the terminal or agent host app"})
    elif IS_WIN:
        info.update({"grabber": "gdigrab", "available": bool(tc.ffmpeg)})
    else:
        display = os.environ.get("DISPLAY")
        wayland = os.environ.get("WAYLAND_DISPLAY")
        wf = which("wf-recorder")
        options = []
        if display and "x11grab" in tc.demuxers:
            options.append({"grabber": "x11grab", "display": display, "size": x11_screen_size(display)})
        if wayland and wf:
            options.append({"grabber": "wf-recorder", "display": wayland,
                            "note": "needs a wlr-screencopy compositor (Sway, Hyprland, river, ...); GNOME and KDE are not supported"})
        info.update({"options": options, "available": bool(options)})
        if display and "x11grab" not in tc.demuxers:
            info["note"] = "ffmpeg lacks x11grab"
    return info


# --------------------------------------------------------------------------- commands: doctor, devices, boot


def cmd_doctor(args):
    tc = Toolchain()
    raster, overlay = overlay_backend(args.font)
    adb = adb_path()
    emu = emulator_path()
    scrcpy_exe, scrcpy_ver = scrcpy_version()
    ios = list_ios_devices()
    report = {
        "version": VERSION,
        "python": sys.version.split()[0],
        "ffmpeg": {"path": tc.ffmpeg, "version": tc.version, "encoder": tc.encoder, "ffprobe": tc.ffprobe},
        "ready": tc.ready,
        "overlay": overlay,
        "overlay_ready": raster is not None,
        "screen": screen_capture_info(tc) if tc.ffmpeg else {"available": False},
        "android": {
            "adb": adb,
            "devices": list_android_devices(adb),
            "emulator": emu,
            "avds": list_avds(emu),
            "scrcpy": scrcpy_exe,
            "scrcpy_version": ".".join(map(str, scrcpy_ver)) if scrcpy_ver else None,
            "recorder": "scrcpy" if scrcpy_exe else ("adb screenrecord (%ds segments)" % SEGMENT_LIMIT if adb else None),
        },
        "ios": {
            "available": ios is not None,
            "booted": [d for d in (ios or []) if d["state"] == "Booted"],
            "input_tools": {"idb": which("idb"), "maestro": which("maestro")},
        },
        "external": {"available": True, "note": "import a Playwright or other video at stop time with --video"},
    }
    sources = []
    if report["screen"].get("available"):
        sources.append("screen")
    if adb and report["android"]["devices"]:
        sources.append("android")
    if report["ios"]["booted"]:
        sources.append("ios")
    report["capture_sources"] = sources
    report["auto_source"] = sources[0] if sources else None
    if not tc.ready:
        report["hint"] = "install ffmpeg with ffprobe and an H.264 encoder (libx264 or videotoolbox)"
    emit(report)
    sys.exit(0 if tc.ready else 1)


def cmd_devices(args):
    tc = Toolchain()
    adb = adb_path()
    emu = emulator_path()
    emit({
        "android": {"devices": list_android_devices(adb), "avds": list_avds(emu)},
        "ios": list_ios_devices() or [],
        "screens": mac_screens(tc) if IS_MAC else screen_capture_info(tc).get("options", []),
    })


def spawn_detached(cmd, log_path, cwd=None, env=None):
    log = open(log_path, "ab")
    kwargs = {"stdin": subprocess.DEVNULL, "stdout": log, "stderr": log, "cwd": cwd, "env": env}
    if IS_WIN:
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | getattr(subprocess, "DETACHED_PROCESS", 0x00000008)
    else:
        kwargs["start_new_session"] = True
    proc = subprocess.Popen(cmd, **kwargs)
    log.close()
    return proc


def cmd_boot(args):
    if args.platform == "android":
        adb = adb_path()
        emu = emulator_path()
        if not adb or not emu:
            die("adb and emulator are required (set ANDROID_HOME or add the SDK to PATH)", adb=adb, emulator=emu)
        avds = list_avds(emu)
        if args.name not in avds:
            die("AVD %r not found" % args.name, avds=avds)
        before = {d["serial"] for d in list_android_devices(adb)}
        base_cmd = [emu, "-avd", args.name, "-no-boot-anim", "-no-snapshot-save"]
        if args.headless:
            base_cmd += ["-no-window", "-no-audio", "-gpu", "swiftshader_indirect"]
        if args.port:
            base_cmd += ["-port", str(args.port)]
        base_cmd += args.extra
        log_path = Path(args.log or (Path.cwd() / ("emulator-%s.log" % slug(args.name))))
        cold = "-no-snapshot-load" in args.extra
        cmd = list(base_cmd)
        proc = spawn_detached(cmd, log_path)
        deadline = now() + args.timeout
        serial = "emulator-%d" % args.port if args.port else None
        unauthorized_since = None
        while now() < deadline:
            time.sleep(2)
            if proc.poll() is not None:
                die("emulator exited early (code %s)" % proc.returncode, log=str(log_path), tail=tail(log_path))
            current = list_android_devices(adb)
            fresh = [d for d in current if d["serial"] not in before and d["serial"].startswith("emulator-")]
            if serial is None and fresh:
                serial = fresh[0]["serial"]
            state = next((d["state"] for d in current if d["serial"] == serial), None)
            if state == "unauthorized":
                # A restored snapshot can carry a stale adb key list; a cold boot re-injects the host key.
                unauthorized_since = unauthorized_since or now()
                if now() - unauthorized_since > 20 and not cold:
                    run([adb, "-s", serial, "emu", "kill"], timeout=20)
                    proc.terminate()
                    wait_exit(proc, 15)
                    cold = True
                    cmd = base_cmd + ["-no-snapshot-load"]
                    proc = spawn_detached(cmd, log_path)
                    unauthorized_since = None
                    warn("adb stayed unauthorized on the restored snapshot; cold booting %s" % args.name)
                continue
            if state == "device":
                res = run([adb, "-s", serial, "shell", "getprop", "sys.boot_completed"], timeout=20)
                if res.stdout.strip() == "1":
                    run([adb, "-s", serial, "shell", "settings", "put", "global", "stay_on_while_plugged_in", "7"], timeout=20)
                    run([adb, "-s", serial, "shell", "input", "keyevent", "KEYCODE_WAKEUP"], timeout=20)
                    run([adb, "-s", serial, "shell", "wm", "dismiss-keyguard"], timeout=20)
                    emit({"platform": "android", "serial": serial, "avd": args.name, "pid": proc.pid, "cold_boot": cold,
                          "headless": args.headless, "log": str(log_path)})
                    return
        die("timed out waiting for the emulator to boot", serial=serial, state=state, log=str(log_path), tail=tail(log_path),
            hint="pass `-- -no-snapshot-load` to force a cold boot, or `-- -wipe-data` for a fresh image")
    else:
        dev = resolve_ios(args.name, need_booted=False)
        if dev["state"] != "Booted":
            res = run(["xcrun", "simctl", "boot", dev["udid"]], timeout=120)
            if res.returncode != 0 and "Unable to boot device in current state: Booted" not in res.stderr:
                die("simctl boot failed", detail=res.stderr.strip())
        res = run(["xcrun", "simctl", "bootstatus", dev["udid"], "-b"], timeout=args.timeout)
        if res.returncode != 0:
            die("simulator did not finish booting", detail=(res.stderr or res.stdout).strip()[-800:])
        if not args.headless:
            run(["open", "-a", "Simulator", "--args", "-CurrentDeviceUDID", dev["udid"]], timeout=60)
        emit({"platform": "ios", "udid": dev["udid"], "name": dev["name"], "runtime": dev["runtime"],
              "headless": args.headless})


# --------------------------------------------------------------------------- commands: start, supervisor


def pick_source(tc, requested, target):
    if requested and requested != "auto":
        return requested
    if target and target.startswith("emulator-"):
        return "android"
    if screen_capture_info(tc).get("available"):
        return "screen"
    adb = adb_path()
    if adb and [d for d in list_android_devices(adb) if d["state"] == "device"]:
        return "android"
    ios = list_ios_devices() or []
    if [d for d in ios if d["state"] == "Booted"]:
        return "ios"
    die("no capture source detected; pass --source (screen, android, ios, external) and check `doctor`")


def parse_geometry(text):
    if not text:
        return None
    match = re.match(r"^(\d+)x(\d+)$", text)
    if not match:
        die("--geometry must look like 1280x720")
    return int(match.group(1)), int(match.group(2))


def parse_offset(text):
    if not text:
        return (0, 0)
    match = re.match(r"^(\d+),(\d+)$", text)
    if not match:
        die("--offset must look like 100,200")
    return int(match.group(1)), int(match.group(2))


def capture_plan(sess, sp):
    """Return the recorder plan for the supervisor: {kind, cmd, files, stop}."""
    tc = Toolchain()
    source = sess["source"]
    opts = sess["options"]
    cap = sp["capture"]
    cap.mkdir(exist_ok=True)
    geometry = parse_geometry(opts.get("geometry"))
    offset = parse_offset(opts.get("offset"))
    framerate = str(opts.get("framerate") or FPS)
    even_scale = "scale=trunc(iw/2)*2:trunc(ih/2)*2"
    common_out = ["-f", "mpegts", str(cap / "raw.ts")]

    if source == "test":
        size = "%dx%d" % geometry if geometry else "1280x720"
        cmd = [tc.ffmpeg, "-hide_banner", "-loglevel", "warning", "-re", "-f", "lavfi",
               "-i", "testsrc2=size=%s:rate=%s" % (size, framerate), *tc.encode_args(quality="capture"), *common_out]
        return {"kind": "ffmpeg", "cmd": cmd, "files": [str(cap / "raw.ts")]}

    if source == "screen":
        info = screen_capture_info(tc)
        if not info.get("available"):
            die("no screen capture source available on this machine", screen=info)
        if IS_MAC:
            index = opts.get("screen_index")
            if index is None:
                index = info["screens"][0]["index"]
            vf = [even_scale]
            if geometry:
                vf.insert(0, "crop=%d:%d:%d:%d" % (geometry[0], geometry[1], offset[0], offset[1]))
            cmd = [tc.ffmpeg, "-hide_banner", "-loglevel", "warning", "-f", "avfoundation", "-framerate", framerate,
                   "-capture_cursor", "1", "-i", "%s:none" % index, "-vf", ",".join(vf), *tc.capture_encoder_args(), *common_out]
            return {"kind": "ffmpeg", "cmd": cmd, "files": [str(cap / "raw.ts")], "target": "screen %s" % index}
        if IS_WIN:
            cmd = [tc.ffmpeg, "-hide_banner", "-loglevel", "warning", "-f", "gdigrab", "-framerate", framerate]
            if geometry:
                cmd += ["-offset_x", str(offset[0]), "-offset_y", str(offset[1]), "-video_size", "%dx%d" % geometry]
            cmd += ["-i", "desktop", "-vf", even_scale, *tc.capture_encoder_args(), *common_out]
            return {"kind": "ffmpeg", "cmd": cmd, "files": [str(cap / "raw.ts")], "target": "desktop"}
        grabber = opts.get("grabber") or info["options"][0]["grabber"]
        if grabber == "x11grab":
            display = opts.get("display") or os.environ.get("DISPLAY")
            size = geometry or x11_screen_size(display)
            if not size:
                die("cannot determine the X11 screen size; pass --geometry WxH")
            cmd = [tc.ffmpeg, "-hide_banner", "-loglevel", "warning", "-f", "x11grab", "-framerate", framerate,
                   "-video_size", "%dx%d" % size, "-i", "%s+%d,%d" % (display, offset[0], offset[1]),
                   "-vf", even_scale, *tc.capture_encoder_args(), *common_out]
            return {"kind": "ffmpeg", "cmd": cmd, "files": [str(cap / "raw.ts")], "target": display,
                    "env": {"XAUTHORITY": opts["xauthority"]} if opts.get("xauthority") else None}
        cmd = [which("wf-recorder"), "-f", str(cap / "raw.mkv"), "-c", "libx264", "-p", "preset=ultrafast"]
        if opts.get("output_name"):
            cmd += ["-o", opts["output_name"]]
        if geometry:
            cmd += ["-g", "%d,%d %dx%d" % (offset[0], offset[1], geometry[0], geometry[1])]
        return {"kind": "sigint", "cmd": cmd, "files": [str(cap / "raw.mkv")], "target": os.environ.get("WAYLAND_DISPLAY")}

    if source == "android":
        adb = adb_path()
        if not adb:
            die("adb not found")
        dev = resolve_android(adb, sess.get("target"))
        serial = dev["serial"]
        exe, ver = scrcpy_version()
        if exe and not opts.get("no_scrcpy"):
            playback_flag = "--no-playback" if ver >= (2, 0) else "--no-display"
            cmd = [exe, "-s", serial, playback_flag, "--record", str(cap / "raw.mkv")]
            if ver >= (2, 0):
                cmd.append("--no-audio")
            if geometry:
                cmd += ["--max-size", str(max(geometry))]
            return {"kind": "sigint", "cmd": cmd, "files": [str(cap / "raw.mkv")], "target": serial, "recorder": "scrcpy"}
        cmd = [adb, "-s", serial, "shell", "screenrecord", "--time-limit", str(SEGMENT_LIMIT), "--bit-rate", "8000000"]
        if geometry:
            cmd += ["--size", "%dx%d" % geometry]
        return {"kind": "adb-segments", "cmd": cmd, "adb": adb, "serial": serial, "files": [], "target": serial,
                "recorder": "adb screenrecord"}

    if source == "ios":
        dev = resolve_ios(sess.get("target"), need_booted=True)
        cmd = ["xcrun", "simctl", "io", dev["udid"], "recordVideo", "--codec", "h264", "--force", str(cap / "raw.mp4")]
        return {"kind": "sigint", "cmd": cmd, "files": [str(cap / "raw.mp4")], "target": "%s (%s)" % (dev["name"], dev["udid"]),
                "recorder": "simctl recordVideo", "start_marker": "Recording started"}

    if source == "external":
        return {"kind": "none", "cmd": None, "files": []}
    die("unknown source %r" % source)


def cmd_start(args):
    tc = Toolchain()
    if not tc.ready:
        die("ffmpeg toolchain not ready; run `doctor`")
    session_dir = Path(args.output).resolve()
    sp = session_paths(session_dir)
    if sp["session"].exists():
        die("session already exists: %s (pick another --output)" % session_dir)
    session_dir.mkdir(parents=True, exist_ok=True)
    source = pick_source(tc, args.source, args.target)
    if args.layout not in ("auto", "overlay", "panel"):
        die("--layout must be auto, overlay, or panel")
    sess = {
        "version": VERSION,
        "name": args.name or session_dir.name,
        "title": args.title,
        "commit": args.commit,
        "branch": args.branch,
        "environment": args.environment,
        "label": args.label,
        "source": source,
        "target": args.target,
        "created_at": now(),
        "status": STATUS_RECORDING,
        "options": {
            "geometry": args.geometry,
            "offset": args.offset,
            "screen_index": args.screen_index,
            "display": args.display,
            "xauthority": args.xauthority,
            "output_name": args.output_name,
            "grabber": args.grabber,
            "framerate": args.framerate,
            "layout": args.layout,
            "no_scrcpy": args.no_scrcpy,
        },
    }
    write_json(sp["session"], sess)
    if source == "external":
        sess["started_at"] = now()
        write_json(sp["session"], sess)
        emit({"session": str(session_dir), "source": source, "started_at": iso(sess["started_at"]),
              "note": "no recorder started; create the browser video now and pass it to `stop --video`"})
        return
    # Validate the plan in this process so errors surface before the supervisor is spawned.
    plan = capture_plan(sess, sp)
    for stale in (sp["recorder"], sp["exit"], sp["stop_request"]):
        if stale.exists():
            stale.unlink()
    cmd = [sys.executable, str(Path(__file__).resolve()), "_supervise", str(session_dir)]
    proc = spawn_detached(cmd, sp["supervisor_log"], cwd=str(session_dir))
    deadline = now() + args.start_timeout
    recorder = None
    while now() < deadline:
        recorder = read_json(sp["recorder"])
        if recorder and recorder.get("started_at"):
            break
        if proc.poll() is not None:
            die("supervisor exited before recording started", log=tail(sp["supervisor_log"]), capture_log=tail(sp["capture_log"]))
        time.sleep(0.2)
    if not recorder:
        die("recorder did not start within %ss" % args.start_timeout, log=tail(sp["supervisor_log"]), capture_log=tail(sp["capture_log"]))
    time.sleep(args.settle)
    if sp["exit"].exists():
        info = read_json(sp["exit"]) or {}
        sess["status"] = STATUS_FAILED
        write_json(sp["session"], sess)
        die("recorder exited immediately", exit=info, capture_log=tail(sp["capture_log"]))
    sess["started_at"] = recorder["started_at"]
    sess["target"] = plan.get("target") or sess.get("target")
    sess["recorder"] = plan.get("recorder") or plan["kind"]
    write_json(sp["session"], sess)
    emit({"session": str(session_dir), "source": source, "target": sess["target"], "recorder": sess["recorder"],
          "started_at": iso(sess["started_at"]), "supervisor_pid": recorder["supervisor_pid"], "child_pid": recorder.get("child_pid")})


def wait_exit(child, seconds):
    try:
        child.wait(timeout=seconds)
        return True
    except subprocess.TimeoutExpired:
        return False


def graceful_stop(child, kind):
    if child.poll() is not None:
        return
    if kind == "ffmpeg" and child.stdin:
        try:
            child.stdin.write(b"q")
            child.stdin.flush()
        except (OSError, ValueError):
            pass
        if wait_exit(child, 15):
            return
    elif kind == "sigint":
        try:
            if IS_WIN:
                child.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                child.send_signal(signal.SIGINT)
        except (OSError, ValueError):
            pass
        if wait_exit(child, 30):
            return
    child.terminate()
    if wait_exit(child, 8):
        return
    child.kill()
    wait_exit(child, 5)


def cmd_supervise(args):
    sess, sp = load_session(args.session)
    plan = capture_plan(sess, sp)
    log = open(sp["capture_log"], "ab")
    result = {"supervisor_pid": os.getpid(), "files": [], "unexpected": False, "error": None, "segments": 0,
              "first_byte_at": None, "stopped_at": None}
    env = dict(os.environ)
    if plan.get("env"):
        env.update(plan["env"])
    popen_kwargs = {"stdout": log, "stderr": log, "env": env}
    if IS_WIN:
        popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

    def record_child(child, started_at):
        write_json(sp["recorder"], {"supervisor_pid": os.getpid(), "child_pid": child.pid, "cmd": plan["cmd"],
                                    "kind": plan["kind"], "started_at": started_at, "marker": plan["cmd"][0]})

    def note_first_bytes(size_fn):
        # Video zero: the recorder's first written bytes, or its own "started" log line when it
        # writes the file only at the end (simctl).
        if result["first_byte_at"] is None:
            try:
                if marker_seen() or size_fn() > 0:
                    result["first_byte_at"] = now()
            except (OSError, ValueError):
                pass

    def marker_seen():
        marker = plan.get("start_marker")
        if not marker:
            return False
        try:
            return marker in Path(sp["capture_log"]).read_text(encoding="utf-8", errors="replace")
        except OSError:
            return False

    def local_size():
        return Path(plan["files"][0]).stat().st_size

    try:
        if plan["kind"] in ("ffmpeg", "sigint"):
            stdin = subprocess.PIPE if plan["kind"] == "ffmpeg" else subprocess.DEVNULL
            started_at = now()
            child = subprocess.Popen(plan["cmd"], stdin=stdin, **popen_kwargs)
            record_child(child, started_at)
            while True:
                note_first_bytes(local_size)
                if child.poll() is not None:
                    result["unexpected"] = True
                    result["stopped_at"] = now()
                    result["error"] = "recorder exited with code %s" % child.returncode
                    break
                if sp["stop_request"].exists():
                    result["stopped_at"] = now()
                    graceful_stop(child, plan["kind"])
                    break
                time.sleep(0.1)
            result["exit_code"] = child.returncode
            result["files"] = [f for f in plan["files"] if Path(f).exists()]
        elif plan["kind"] == "adb-segments":
            adb, serial = plan["adb"], plan["serial"]
            started_at = now()
            seg = 0
            stopping = False
            while not stopping:
                remote = "/sdcard/evidence-%s-%03d.mp4" % (os.getpid(), seg)
                child = subprocess.Popen(plan["cmd"] + [remote], stdin=subprocess.DEVNULL, **popen_kwargs)
                record_child(child, started_at)

                def remote_size():
                    out = run([adb, "-s", serial, "shell", "stat", "-c", "%s", remote], timeout=10).stdout.strip()
                    return int(out) if out.isdigit() else 0

                while child.poll() is None:
                    if seg == 0:
                        note_first_bytes(remote_size)
                    if sp["stop_request"].exists():
                        stopping = True
                        result["stopped_at"] = now()
                        run([adb, "-s", serial, "shell", "pkill", "-INT", "screenrecord"], timeout=20)
                        if not wait_exit(child, 20):
                            child.terminate()
                            wait_exit(child, 5)
                        break
                    time.sleep(0.1)
                time.sleep(0.5)  # let the device flush the moov atom
                local = sp["capture"] / ("seg-%03d.mp4" % seg)
                pulled = run([adb, "-s", serial, "pull", remote, str(local)], timeout=600)
                run([adb, "-s", serial, "shell", "rm", "-f", remote], timeout=20)
                if pulled.returncode == 0 and local.exists() and local.stat().st_size > 0:
                    result["files"].append(str(local))
                else:
                    result["error"] = "failed to pull %s: %s" % (remote, pulled.stderr.strip()[-300:])
                    break
                seg += 1
                if child.returncode not in (0, None) and not stopping:
                    result["unexpected"] = True
                    result["stopped_at"] = now()
                    result["error"] = "screenrecord exited with code %s" % child.returncode
                    break
            result["segments"] = seg
            result["exit_code"] = 0 if result["files"] else 1
        else:
            result["error"] = "nothing to supervise for source %s" % sess["source"]
    except Exception as exc:  # noqa: BLE001 - the supervisor must always leave an exit record
        result["unexpected"] = True
        result["error"] = "%s: %s" % (type(exc).__name__, exc)
    result["stopped_at"] = result["stopped_at"] or now()
    result["ended_at"] = now()
    write_json(sp["exit"], result)
    log.close()


# --------------------------------------------------------------------------- commands: annotate, narrate


def _annotate(sessions, ev_type, message, result=None, hold=None, at=None):
    if ev_type == "narration":
        limit = MAX_NARRATION
    else:
        limit = MAX_ANNOTATION
    message = " ".join(message.split())
    if not message:
        die("message is empty")
    if len(message) > limit:
        die("message is %d characters; keep %s under %d" % (len(message), ev_type, limit))
    if ev_type == "assertion" and result not in ("passed", "failed", "untested"):
        die("assertions need --result passed|failed|untested")
    out = []
    for session in sessions:
        sess, sp = load_session(session)
        if sess["status"] != STATUS_RECORDING:
            die("session %s is %s, not recording" % (sp["dir"], sess["status"]))
        if not sess.get("started_at"):
            die("session has no start time yet: %s" % sp["dir"])
        t = float(at) if at is not None else now() - sess["started_at"]
        ev = {"type": ev_type, "message": message, "t": round(max(0.0, t), 3), "at": now()}
        if ev_type == "assertion":
            ev["result"] = result
        if hold:
            ev["hold"] = float(hold)
        append_event(sp, ev)
        out.append({"session": str(sp["dir"]), "t": ev["t"], "type": ev_type, "message": message, "result": result})
    emit(out if len(out) > 1 else out[0])


def cmd_annotate(args):
    _annotate(args.session, args.type, args.message, result=args.result, at=args.at)


def cmd_narrate(args):
    _annotate(args.session, "narration", args.message, hold=args.hold, at=args.at)


# --------------------------------------------------------------------------- commands: stop, render


def ensure_recorder_stopped(sess, sp, args):
    """Stop the supervisor if it still runs. Returns (exit_info, warnings)."""
    warnings = []
    if sess["source"] == "external":
        return {"ended_at": now(), "files": []}, warnings
    exit_info = read_json(sp["exit"])
    if exit_info:
        return exit_info, warnings
    recorder = read_json(sp["recorder"])
    if not recorder:
        if not args.accept_untracked_recorder:
            die("the supervisor never recorded which process it started; check for a stray recorder yourself, "
                "then rerun stop with --accept-untracked-recorder", status=STATUS_LOST, log=tail(sp["supervisor_log"]))
        warnings.append("recorder process was never tracked; finalized whatever capture existed")
        return {"ended_at": now(), "files": [str(p) for p in sp["capture"].glob("*") if p.is_file()]}, warnings
    sup_alive, sup_match = process_alive(recorder["supervisor_pid"], "_supervise")
    if sup_alive and sup_match:
        sp["stop_request"].write_text(iso(now()), encoding="utf-8")
        deadline = now() + args.timeout
        while now() < deadline:
            exit_info = read_json(sp["exit"])
            if exit_info:
                return exit_info, warnings
            time.sleep(0.25)
        die("recorder did not stop within %ss; it may still be flushing, rerun stop" % args.timeout,
            status=STATUS_RECORDING, supervisor_pid=recorder["supervisor_pid"])
    child_alive, child_match = process_alive(recorder.get("child_pid"), recorder.get("marker"))
    if child_alive and child_match:
        die("the supervisor died but the recorder (pid %s) is still running; stop it by hand, then rerun stop"
            % recorder.get("child_pid"), status=STATUS_LOST)
    warnings.append("supervisor died before stop; finalized the capture that existed on disk")
    return {"ended_at": now(), "files": [str(p) for p in sorted(sp["capture"].glob("*")) if p.is_file() and p.suffix in (".ts", ".mkv", ".mp4", ".webm")]}, warnings


def render_opts_from_args(args):
    return {
        "layout": getattr(args, "layout", None),
        "narration": not getattr(args, "no_narration", False),
        "cards": not getattr(args, "no_cards", False),
        "card_seconds": getattr(args, "card_seconds", DEFAULT_CARD_SECONDS),
        "toast_seconds": getattr(args, "toast_seconds", DEFAULT_TOAST_SECONDS),
        "max_height": getattr(args, "max_height", 0) or 0,
        "font": getattr(args, "font", None),
        "preset": getattr(args, "preset", "veryfast"),
        "crf": getattr(args, "crf", 20),
    }


def meta_lines(sess):
    lines = []
    if sess.get("commit") or sess.get("branch"):
        parts = []
        if sess.get("commit"):
            parts.append("commit %s" % sess["commit"][:12])
        if sess.get("branch"):
            parts.append("branch %s" % sess["branch"])
        lines.append("  ·  ".join(parts))
    if sess.get("environment"):
        lines.append(sess["environment"])
    target = sess.get("target")
    lines.append("%s%s  ·  %s" % (sess.get("source", ""), (" " + target) if target else "", iso(sess.get("started_at") or now())))
    return lines


def prepare_events(events, offset, dur, card):
    """Apply the start-latency offset and the title-card shift. Returns new list with video_t."""
    out = []
    for ev in events:
        adjusted = min(max(0.0, ev["t"] - offset), max(0.0, dur - 0.05))
        item = dict(ev)
        item["adjusted_t"] = round(adjusted, 3)
        item["video_t"] = round(adjusted + card, 3)
        out.append(item)
    return out


def render_video(tc, raster, inputs, out_path, cfg, filter_prefix, overlay_dir, opts, warnings):
    """Run ffmpeg: inputs (list of arg lists for each video input), filter_prefix builds [base]."""
    cmd = [tc.ffmpeg, "-hide_banner", "-loglevel", "error", "-y"]
    for inp in inputs:
        cmd += inp
    overlay_input = None
    frames = 0
    if raster is not None:
        renderer = OverlayRenderer(raster, cfg, overlay_dir)
        list_path, frames = renderer.build()
        overlay_input = ["-f", "concat", "-safe", "0", "-i", str(list_path)]
        cmd += overlay_input
        graph = filter_prefix + ";[base][%d:v]overlay=0:0:format=rgb:eof_action=repeat,format=yuv420p[v]" % len(inputs)
    else:
        warnings.append("no text overlay backend (Pillow or ImageMagick); the video carries no burned-in annotations")
        graph = filter_prefix + ";[base]format=yuv420p[v]"
    cmd += ["-filter_complex", graph, "-map", "[v]", "-an", *tc.encode_args(preset=opts["preset"], crf=opts["crf"]),
            "-movflags", "+faststart", str(out_path)]
    res = run(cmd, timeout=7200)
    if res.returncode != 0:
        return None, res.stderr.strip()[-1500:], cmd
    return frames, None, cmd


def finalize_session(sess, sp, opts, exit_info, warnings, video_override=None, video_offset=0.0, align="start", caveats=None):
    tc = Toolchain()
    raster, overlay_info = overlay_backend(opts.get("font"))
    events = read_events(sp)
    if sess["source"] == "external":
        if video_override:
            src = Path(video_override)
            if not src.exists():
                die("--video not found: %s" % src)
            sp["capture"].mkdir(exist_ok=True)
            dest = sp["capture"] / ("raw" + src.suffix.lower())
            if src.resolve() != dest.resolve():
                shutil.copy2(src, dest)
            files = [str(dest)]
        else:
            files = [str(p) for p in sorted(sp["capture"].glob("raw.*"))] if sp["capture"].exists() else []
            if not files:
                die("external sessions need --video <file> at stop time")
    else:
        files = [f for f in (exit_info.get("files") or []) if Path(f).exists()]
        if not files and sp["capture"].exists():
            files = [str(p) for p in sorted(sp["capture"].glob("*")) if p.suffix in (".ts", ".mkv", ".mp4", ".webm")]
    if not files:
        sess["status"] = STATUS_FAILED
        write_json(sp["session"], sess)
        die("no capture file to finalize", status=STATUS_FAILED, exit=exit_info, capture_log=tail(sp["capture_log"]))
    probe = probe_inputs(tc, files)
    if not probe or not probe["duration"]:
        sess["status"] = STATUS_FAILED
        write_json(sp["session"], sess)
        die("capture is unreadable or empty", status=STATUS_FAILED, files=files, capture_log=tail(sp["capture_log"]))
    dur = probe["duration"]
    ended_at = exit_info.get("ended_at") or now()
    stopped_at = exit_info.get("stopped_at") or ended_at
    first_byte_at = exit_info.get("first_byte_at")
    wall = stopped_at - sess["started_at"]
    extend = 0.0
    if sess["source"] == "external":
        offset = (wall - dur) if align == "end" else float(video_offset or 0.0)
    else:
        # Video zero = when the recorder began writing frames. Encoders buffer roughly a tenth of a second.
        if first_byte_at and first_byte_at < stopped_at - 0.5:
            offset = max(0.0, first_byte_at - sess["started_at"] - 0.15)
        else:
            latency = wall - dur
            offset = max(0.0, latency) if -2.0 <= latency < 15 else 0.0
            if offset == 0.0 and abs(latency) >= 2.0:
                warnings.append("wall clock (%.1fs) and video (%.1fs) differ by %.1fs; timestamps not corrected" % (wall, dur, latency))
        # Some recorders (adb screenrecord) emit frames only when the display changes, so a static
        # ending shortens the file. Hold the last frame until the real stop time.
        missing = (wall - offset) - dur
        if 0.3 < missing <= 60:
            extend = missing
            warnings.append("held the last frame %.1fs: the recorder (adb screenrecord, simctl) emits frames only while the display changes, and the screen was static at the end" % extend)
        elif missing > 60:
            warnings.append("video is %.1fs shorter than the recording window; the tail was not captured" % missing)
    effective_dur = dur + extend
    if exit_info.get("segments", 0) > 1:
        warnings.append("android capture used %d adb screenrecord segments; about half a second is missing at each boundary, so later annotations may land up to that much late" % exit_info["segments"])
    if exit_info.get("unexpected"):
        warnings.append("recorder ended on its own: %s" % exit_info.get("error"))
    if sess["source"] == "test":
        warnings.append("source `test` is a synthetic pattern; never present it as evidence")

    # Geometry.
    w, h = probe["width"], probe["height"]
    if opts.get("max_height") and h > opts["max_height"]:
        w = even(w * opts["max_height"] / h)
        h = even(opts["max_height"])
    else:
        w, h = even(w), even(h)
    layout = opts.get("layout") or sess["options"].get("layout") or "auto"
    if layout == "auto":
        layout = "panel" if h > w else "overlay"
    card = float(opts["card_seconds"]) if opts.get("cards", True) and raster is not None else 0.0
    if layout == "panel":
        panel_w = even(max(640, w * 0.75))
        canvas = (w + panel_w, h)
        panel_rect = (w, 0, panel_w, h)
    else:
        panel_w = 0
        canvas = (w, h)
        panel_rect = None
    prepared = prepare_events(events, offset, effective_dur, card)
    narration = [e for e in prepared if e["type"] == "narration"] if opts.get("narration", True) else []
    pane_events = [e for e in prepared if e["type"] != "narration"]
    tests = judge_tests(pane_events)
    cfg = {
        "mode": layout,
        "canvas": canvas,
        "scale": h / 1080.0,
        "panes": [{"rect": (0, 0, w, h), "label": sess.get("label"), "events": pane_events, "tests": tests}],
        "narration": narration,
        "narration_pos": "panel" if layout == "panel" else "top",
        "panel_rect": panel_rect,
        "header_h": 0,
        "card": card,
        "dur": effective_dur,
        "title": sess["title"],
        "meta": meta_lines(sess),
        "toast": float(opts["toast_seconds"]),
    }
    inputs = [input_args_for(files, sp["capture"] / "segments.txt")]
    chain = "[0:v]fps=%d,scale=%d:%d,setsar=1" % (FPS, w, h)
    # `fps` between the pads: a tpad stop after a tpad start otherwise loses its padding (EOF pts not shifted).
    if card or extend:
        chain += ",tpad=start_duration=%.3f:start_mode=clone,fps=%d,tpad=stop_duration=%.3f:stop_mode=clone" % (card, FPS, card + extend)
    chain += ",pad=%d:%d:0:0:color=%s[base]" % (canvas[0], canvas[1], PAD_COLOR)
    frames, error, cmd = render_video(tc, raster, inputs, sp["video"], cfg, chain, sp["overlay"], opts, warnings)
    if error:
        sess["status"] = STATUS_FAILED
        write_json(sp["session"], sess)
        die("ffmpeg failed while rendering evidence.mp4", status=STATUS_FAILED, detail=error, command=cmd)
    out_probe = ffprobe_video(tc, sp["video"])
    verified = bool(out_probe and out_probe["duration"] and out_probe["duration"] > 0 and out_probe["width"] > 0)
    manifest = {
        "version": VERSION,
        "kind": "session",
        "session": str(sp["dir"]),
        "name": sess["name"],
        "title": sess["title"],
        "label": sess.get("label"),
        "commit": sess.get("commit"),
        "branch": sess.get("branch"),
        "environment": sess.get("environment"),
        "source": sess["source"],
        "target": sess.get("target"),
        "recorder": sess.get("recorder"),
        "started_at": sess["started_at"],
        "started_at_iso": iso(sess["started_at"]),
        "ended_at": ended_at,
        "stopped_at": stopped_at,
        "video_started_at": sess["started_at"] + offset,
        "wall_seconds": round(wall, 3),
        "raw": {"files": files, "duration": round(dur, 3), "effective_duration": round(effective_dur, 3),
                "width": probe["width"], "height": probe["height"], "codec": probe["codec"]},
        "timing": {"offset_applied": round(offset, 3), "offset_source": "first_bytes" if (first_byte_at and sess["source"] != "external") else "wall_clock",
                   "tail_hold": round(extend, 3), "card_seconds": card, "toast_seconds": float(opts["toast_seconds"])},
        "render": {"layout": layout, "canvas": list(canvas), "overlay_backend": overlay_info.get("backend"),
                   "font": overlay_info.get("font"), "overlay_frames": frames, "narration": bool(opts.get("narration", True))},
        "video": str(sp["video"]),
        "video_probe": out_probe,
        "events": prepared,
        "tests": [{"name": t["name"], "result": t["result"], "video_t": t["t"],
                   "assertions": [{"message": a["message"], "result": a["result"], "video_t": a["video_t"]} for a in t["assertions"]]} for t in tests],
        "assertion_tally": tally(pane_events),
        "test_tally": test_tally(tests),
        "warnings": warnings,
        "verified": verified,
    }
    write_json(sp["manifest"], manifest)
    write_report(sp["report"], manifest, caveats)
    sess["status"] = STATUS_FINALIZED if verified else STATUS_FAILED
    sess["render_options"] = opts
    sess["import"] = {"video_offset": float(video_offset or 0.0), "align": align}
    write_json(sp["session"], sess)
    return manifest


def write_report(path, m, caveats=None):
    existing = None
    if Path(path).exists() and caveats is None:
        # Preserve caveats the agent already wrote.
        text = Path(path).read_text(encoding="utf-8")
        match = re.search(r"## Caveats\n\n([\s\S]*?)(?:\n## |\Z)", text)
        if match and "REPLACE THIS" not in match.group(1):
            existing = match.group(1).strip()
    caveats = caveats or existing or ("REPLACE THIS with the caveats of this run: untested items and why, timing drift, "
                                       "flaky steps, anything the viewer must know. Write \"None.\" when there are none.")
    lines = ["# %s" % m["title"], ""]
    tt = m["test_tally"]
    at = m["assertion_tally"]
    lines.append("- Result: %d tests, %d passed, %d failed, %d untested (%d assertions: %d passed, %d failed, %d untested)"
                 % (sum(tt.values()), tt["passed"], tt["failed"], tt["untested"], sum(at.values()), at["passed"], at["failed"], at["untested"]))
    if m.get("commit") or m.get("branch"):
        lines.append("- Revision: `%s` on `%s`" % (m.get("commit") or "unknown", m.get("branch") or "unknown"))
    if m.get("environment"):
        lines.append("- Environment: %s" % m["environment"])
    if m["kind"] == "session":
        lines.append("- Capture: %s%s via %s, started %s, %s of footage" % (
            m["source"], (" " + m["target"]) if m.get("target") else "", m.get("recorder") or "import",
            m["started_at_iso"], mmss(m["raw"]["duration"])))
    else:
        for pane in m["panes"]:
            lines.append("- Pane `%s`: %s%s, started %s, %s of footage" % (
                pane["label"], pane["source"], (" " + pane["target"]) if pane.get("target") else "", pane["started_at_iso"], mmss(pane["duration"])))
    vp = m.get("video_probe") or {}
    lines.append("- Video: `%s` (%sx%s, %s, %.1f MB, %s)" % (
        Path(m["video"]).name, vp.get("width"), vp.get("height"), mmss(vp.get("duration") or 0),
        (vp.get("size") or 0) / 1e6, "verified" if m["verified"] else "NOT VERIFIED"))
    lines += ["", "## Tests", "", "| Time | Pane | Test | Assertion | Result |", "|---|---|---|---|---|"]
    rows = []
    panes = m["panes"] if m["kind"] == "composite" else [{"label": m.get("label") or "", "events": m["events"]}]
    for pane in panes:
        current = ""
        for ev in pane["events"]:
            if ev["type"] == "test_start":
                current = ev["message"]
                rows.append((ev["video_t"], pane["label"] or "", current, "", "started"))
            elif ev["type"] == "assertion":
                rows.append((ev["video_t"], pane["label"] or "", current, ev["message"], ev["result"]))
            elif ev["type"] == "setup":
                rows.append((ev["video_t"], pane["label"] or "", current, ev["message"], "setup"))
    for t, label, test, assertion, result in sorted(rows, key=lambda r: r[0]):
        lines.append("| %s | %s | %s | %s | %s |" % (mmss(t), label, test, assertion, result))
    narration = [e for e in (m["events"] if m["kind"] == "session" else m["narration"]) if e["type"] == "narration"]
    lines += ["", "## Narration", ""]
    if narration:
        lines += ["| Time | Text |", "|---|---|"]
        for ev in narration:
            lines.append("| %s | %s |" % (mmss(ev["video_t"]), ev["message"]))
    else:
        lines.append("None.")
    lines += ["", "## Notes", ""]
    if m["warnings"]:
        lines += ["- %s" % w for w in m["warnings"]]
    else:
        lines.append("None.")
    lines += ["", "## Caveats", "", caveats, ""]
    Path(path).write_text("\n".join(lines), encoding="utf-8")


def cmd_stop(args):
    sess, sp = load_session(args.session)
    if sess["status"] == STATUS_FINALIZED and not args.force:
        die("session already finalized; use `render` to re-render or --force to redo stop", manifest=str(sp["manifest"]))
    exit_info, warnings = ensure_recorder_stopped(sess, sp, args)
    opts = render_opts_from_args(args)
    manifest = finalize_session(sess, sp, opts, exit_info, warnings, video_override=args.video,
                                video_offset=args.video_offset, align=args.align, caveats=args.caveats)
    emit({"session": str(sp["dir"]), "verified": manifest["verified"], "video": manifest["video"],
          "report": str(sp["report"]), "manifest": str(sp["manifest"]), "duration": manifest["video_probe"]["duration"],
          "tests": manifest["test_tally"], "assertions": manifest["assertion_tally"], "warnings": warnings,
          "next": "fill in the Caveats section of report.md" if not args.caveats else None})


def cmd_render(args):
    sess, sp = load_session(args.session)
    if sess["status"] not in (STATUS_FINALIZED, STATUS_FAILED):
        die("render works on a stopped session; run stop first", status=sess["status"])
    exit_info = read_json(sp["exit"]) or {"ended_at": (read_json(sp["manifest"]) or {}).get("ended_at") or now(), "files": []}
    manifest_prev = read_json(sp["manifest"]) or {}
    if not exit_info.get("files"):
        exit_info["files"] = (manifest_prev.get("raw") or {}).get("files") or []
    if "segments" not in exit_info and manifest_prev:
        exit_info["segments"] = len(exit_info["files"])
    opts = render_opts_from_args(args)
    imported = sess.get("import") or {}
    manifest = finalize_session(sess, sp, opts, exit_info, [], video_offset=imported.get("video_offset", 0.0),
                                align=imported.get("align", "start"))
    emit({"session": str(sp["dir"]), "verified": manifest["verified"], "video": manifest["video"], "layout": manifest["render"]["layout"],
          "overlay_frames": manifest["render"]["overlay_frames"], "warnings": manifest["warnings"]})


# --------------------------------------------------------------------------- commands: frames


def cmd_frames(args):
    manifest = read_json(Path(args.session) / "manifest.json")
    if not manifest:
        die("manifest.json not found; stop or compose first")
    tc = Toolchain()
    video = Path(manifest["video"])
    out_dir = Path(args.out or (Path(args.session) / "frames"))
    out_dir.mkdir(parents=True, exist_ok=True)
    types = set(args.types.split(","))
    events = []
    if manifest["kind"] == "session":
        events = [(manifest.get("label") or "", e) for e in manifest["events"]]
    else:
        for pane in manifest["panes"]:
            events += [(pane["label"], e) for e in pane["events"]]
        events += [("", e) for e in manifest["narration"]]
    events = [(label, e) for label, e in events if e["type"] in types]
    events.sort(key=lambda le: le[1]["video_t"])
    duration = (manifest.get("video_probe") or {}).get("duration") or 0
    written = []
    for idx, (label, ev) in enumerate(events, 1):
        # Stay inside the content: the summary card starts at card + content length.
        timing = manifest.get("timing") or {}
        content_end = timing.get("card_seconds", 0) + (timing.get("content_seconds") or (manifest.get("raw") or {}).get("effective_duration") or duration)
        t = max(ev["video_t"], min(ev["video_t"] + args.delay, content_end - 0.1, max(0.0, duration - 0.1)))
        name = "%02d-%s-%s%s.png" % (idx, ev["type"].replace("_", "-"), slug(ev["message"], 48),
                                    ("-" + ev["result"]) if ev.get("result") else "")
        path = out_dir / name
        res = run([tc.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-ss", "%.3f" % t, "-i", str(video),
                   "-frames:v", "1", str(path)], timeout=300)
        if res.returncode == 0 and path.exists():
            written.append({"file": str(path), "video_t": round(t, 3), "type": ev["type"], "message": ev["message"],
                            "result": ev.get("result"), "pane": label or None})
    emit({"frames": written, "dir": str(out_dir)})


# --------------------------------------------------------------------------- commands: compose


def cmd_compose(args):
    tc = Toolchain()
    if not tc.ready:
        die("ffmpeg toolchain not ready; run `doctor`")
    out_dir = Path(args.output).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    opts = render_opts_from_args(args)
    raster, overlay_info = overlay_backend(opts.get("font"))
    manifests = []
    for session in args.session:
        m = read_json(Path(session) / "manifest.json")
        if not m or m.get("kind") != "session":
            die("not a finalized session (manifest.json missing): %s" % session)
        manifests.append(m)
    labels = list(args.label or [])
    if labels and len(labels) != len(manifests):
        die("--label count (%d) must match the number of sessions (%d)" % (len(labels), len(manifests)))
    if not labels:
        labels = [m.get("label") or m.get("target") or m["title"] for m in manifests]
    warnings = []
    for m in manifests:
        warnings += ["[%s] %s" % (m.get("label") or m["name"], w) for w in m["warnings"]]
    card = float(opts["card_seconds"]) if opts.get("cards", True) and raster is not None else 0.0
    starts = [m["video_started_at"] for m in manifests]
    t0 = min(starts)
    deltas = [0.0 for _ in starts] if args.no_align else [s - t0 for s in starts]
    durations = [m["raw"].get("effective_duration") or m["raw"]["duration"] for m in manifests]
    content = max(d + dur for d, dur in zip(deltas, durations))
    # Pane geometry.
    if args.direction == "h":
        PH = even(args.size)
        sizes = [(even(m["raw"]["width"] * PH / m["raw"]["height"]), PH) for m in manifests]
    else:
        PW = even(args.size)
        sizes = [(PW, even(m["raw"]["height"] * PW / m["raw"]["width"])) for m in manifests]
    # Pane events (video_t includes the alignment delta and the title card).
    pane_events = []
    for m, delta in zip(manifests, deltas):
        events = []
        for ev in m["events"]:
            if ev["type"] == "narration":
                continue
            item = dict(ev)
            item["video_t"] = round(ev["adjusted_t"] + delta + card, 3)
            events.append(item)
        pane_events.append(events)
    # Shared narration: lines from different panes within 3 s share one footer entry, prefixed by pane label;
    # identical text from several panes appears once.
    narration = []
    if opts.get("narration", True):
        merged = []
        for m, delta, label in zip(manifests, deltas, labels):
            for ev in m["events"]:
                if ev["type"] == "narration":
                    item = dict(ev)
                    item["video_t"] = round(ev["adjusted_t"] + delta + card, 3)
                    item["pane"] = label
                    merged.append(item)
        merged.sort(key=lambda e: e["video_t"])
        for ev in merged:
            group = narration[-1] if narration else None
            if group and ev["video_t"] - group["video_t"] < 3.0 and ev["pane"] not in group["panes"]:
                group["panes"].append(ev["pane"])
                if ev["message"] not in group["texts"]:
                    group["texts"].append(ev["message"])
                    group["entries"].append((ev["pane"], ev["message"]))
                continue
            narration.append({"type": "narration", "video_t": ev["video_t"], "t": ev["t"], "adjusted_t": ev["adjusted_t"],
                              "hold": ev.get("hold"), "panes": [ev["pane"]], "texts": [ev["message"]],
                              "entries": [(ev["pane"], ev["message"])]})
        for group in narration:
            if len(group["texts"]) == 1:
                group["lines"] = [group["texts"][0]]
            else:
                group["lines"] = ["[%s] %s" % (pane, text) for pane, text in group["entries"]]
            group["message"] = "  /  ".join(group["lines"])
            for key in ("panes", "texts", "entries"):
                group.pop(key)
    # Dashboard geometry: header rows sized for the longest content, footer for the longest narration.
    s = min(OverlayRenderer.pane_scale(pw, ph) for pw, ph in sizes)
    header_h = footer_h = 0
    slots = None
    if raster is not None:
        painter = Painter(raster)
        pad, gap = int(16 * s), int(8 * s)
        label_h = int(30 * s * 1.5)
        chip_h = toast_h = 0
        for (pw, ph), events in zip(sizes, pane_events):
            inner_w = pw - 2 * pad
            for ev in events:
                if ev["type"] == "test_start":
                    block = painter.layout([("TEST 0/0", 19 * s, C_TEST, True), (ev["message"], 24 * s, C_TEXT, False)], inner_w, int(14 * s), gap=int(4 * s))
                    chip_h = max(chip_h, block["h"])
                elif ev["type"] in ("assertion", "setup"):
                    g = painter.measure_pill_line(RESULT_LABELS[ev.get("result") or "setup"], ev["message"], 24 * s, inner_w, pad=int(12 * s))
                    toast_h = max(toast_h, int(g["h"]))
        tally_h = int(21 * s * 1.32 + 8 * s)
        header_h = even(pad + label_h + chip_h + gap + toast_h + gap + tally_h + pad)
        narration_size = 28 * s
        if narration:
            canvas_w = sum(pw for pw, _ in sizes) if args.direction == "h" else max(pw for pw, _ in sizes)
            tallest = max(painter.layout(OverlayRenderer.narration_parts(g["lines"], narration_size), canvas_w - 2 * pad, int(16 * s), accent=int(10 * s))["h"]
                          for g in narration)
            footer_h = even(pad + tallest + pad)
        slots = {"pad": pad, "gap": gap, "label_h": label_h, "chip_h": chip_h, "toast_h": toast_h, "tally_h": tally_h,
                 "narration_size": narration_size}
    panes = []
    x, y = 0, 0
    for (pw, ph), m, label, delta, events in zip(sizes, manifests, labels, deltas, pane_events):
        tests = judge_tests(events)
        panes.append({"rect": (x, y + header_h, pw, ph), "label": label, "events": events, "tests": tests, "source": m["source"],
                      "target": m.get("target"), "started_at_iso": m["started_at_iso"], "duration": m["raw"]["duration"],
                      "delta": round(delta, 3), "session": m["session"]})
        if args.direction == "h":
            x += pw
        else:
            y += header_h + ph
    if args.direction == "h":
        canvas = (x, header_h + max(ph for _, ph in sizes) + footer_h)
    else:
        canvas = (max(pw for pw, _ in sizes), y + footer_h)
    title = args.title or " + ".join(dict.fromkeys(m["title"] for m in manifests))
    first = manifests[0]
    meta = []
    if first.get("commit") or first.get("branch"):
        meta.append("  ·  ".join(p for p in ["commit %s" % first["commit"][:12] if first.get("commit") else None,
                                            "branch %s" % first["branch"] if first.get("branch") else None] if p))
    envs = list(dict.fromkeys(m.get("environment") for m in manifests if m.get("environment")))
    if envs:
        meta.append("  ·  ".join(envs))
    meta.append("  ·  ".join("%s: %s%s" % (label, m["source"], (" " + m["target"]) if m.get("target") else "") for label, m in zip(labels, manifests)))
    cfg = {
        "mode": "overlay",
        "canvas": canvas,
        "scale": s,
        "slots": slots,
        "panes": panes,
        "narration": narration,
        "narration_pos": "bottom",
        "panel_rect": None,
        "header_h": header_h,
        "footer_h": footer_h,
        "card": card,
        "dur": content,
        "title": title,
        "meta": meta,
        "toast": float(opts["toast_seconds"]),
    }
    inputs = []
    chains = []
    for idx, (m, (pw, ph), delta, dur) in enumerate(zip(manifests, sizes, deltas, durations)):
        inputs.append(input_args_for(m["raw"]["files"], out_dir / ("segments-%d.txt" % idx)))
        chain = "[%d:v]fps=%d,scale=%d:%d,setsar=1" % (idx, FPS, pw, ph)
        if delta > 0.02:
            chain += ",tpad=start_duration=%.3f:start_mode=add:color=%s,fps=%d" % (delta, PAD_COLOR, FPS)
        trailing = content - (delta + m["raw"]["duration"])
        if trailing > 0.02:
            chain += ",tpad=stop_duration=%.3f:stop_mode=clone" % trailing
        # Each pane carries its own header band so vertical stacks keep a band above every pane.
        chain += ",pad=%d:%d:0:%d:color=%s[p%d]" % (pw, ph + header_h, header_h, PAD_COLOR, idx)
        chains.append(chain)
    stack = "hstack" if args.direction == "h" else "vstack"
    graph = ";".join(chains) + ";" + "".join("[p%d]" % i for i in range(len(manifests))) + "%s=inputs=%d" % (stack, len(manifests))
    if card:
        graph += ",tpad=start_duration=%.3f:start_mode=clone,fps=%d,tpad=stop_duration=%.3f:stop_mode=clone" % (card, FPS, card)
    graph += ",pad=%d:%d:0:0:color=%s[base]" % (canvas[0], canvas[1], PAD_COLOR)
    video = out_dir / "composite.mp4"
    frames, error, cmd = render_video(tc, raster, inputs, video, cfg, graph, out_dir / "overlay", opts, warnings)
    if error:
        die("ffmpeg failed while composing", detail=error, command=cmd)
    out_probe = ffprobe_video(tc, video)
    verified = bool(out_probe and out_probe["duration"] and out_probe["width"] > 0)
    all_tests = []
    for pane in panes:
        all_tests += pane["tests"]
    all_events = []
    for pane in panes:
        all_events += pane["events"]
    manifest = {
        "version": VERSION,
        "kind": "composite",
        "title": title,
        "commit": first.get("commit"),
        "branch": first.get("branch"),
        "environment": "  ·  ".join(envs) if envs else None,
        "direction": args.direction,
        "video": str(video),
        "video_probe": out_probe,
        "panes": [dict({k: v for k, v in pane.items() if k != "tests"},
                       tests=[{"name": t["name"], "result": t["result"]} for t in pane["tests"]]) for pane in panes],
        "narration": narration,
        "timing": {"card_seconds": card, "toast_seconds": float(opts["toast_seconds"]), "content_seconds": round(content, 3)},
        "render": {"canvas": list(canvas), "overlay_backend": overlay_info.get("backend"), "overlay_frames": frames},
        "assertion_tally": tally(all_events),
        "test_tally": test_tally(all_tests),
        "warnings": warnings,
        "verified": verified,
    }
    write_json(out_dir / "manifest.json", manifest)
    write_report(out_dir / "report.md", manifest, args.caveats)
    emit({"output": str(out_dir), "video": str(video), "verified": verified, "canvas": list(canvas),
          "panes": [{"label": p["label"], "delta": p["delta"]} for p in panes], "tests": manifest["test_tally"],
          "warnings": warnings})


# --------------------------------------------------------------------------- CLI


def add_render_options(parser):
    parser.add_argument("--layout", default=None, help="overlay, panel, or auto (portrait video gets a side panel)")
    parser.add_argument("--no-narration", action="store_true", help="leave narration out of the overlay")
    parser.add_argument("--no-cards", action="store_true", help="skip the title and summary cards")
    parser.add_argument("--card-seconds", type=float, default=DEFAULT_CARD_SECONDS)
    parser.add_argument("--toast-seconds", type=float, default=DEFAULT_TOAST_SECONDS, help="how long each assertion stays on screen")
    parser.add_argument("--max-height", type=int, default=0, help="downscale taller video to this height (0 keeps the size)")
    parser.add_argument("--font", default=None, help="TTF/TTC font file for overlays (or EVIDENCE_FONT)")
    parser.add_argument("--preset", default="veryfast")
    parser.add_argument("--crf", type=int, default=20)


def build_parser():
    p = argparse.ArgumentParser(prog="evidence.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--version", action="version", version=VERSION)
    sub = p.add_subparsers(dest="command", required=True)

    d = sub.add_parser("doctor", help="check ffmpeg, overlay backend, and capture sources")
    d.add_argument("--font", default=None)
    d.set_defaults(func=cmd_doctor)

    dv = sub.add_parser("devices", help="list android devices/AVDs, iOS simulators, and screens")
    dv.set_defaults(func=cmd_devices)

    b = sub.add_parser("boot", help="boot an Android AVD or iOS simulator and wait until it is ready")
    b.add_argument("platform", choices=["android", "ios"])
    b.add_argument("name", help="AVD name, or iOS simulator name/UDID")
    b.add_argument("--headless", action="store_true", help="android: -no-window; ios: do not open Simulator.app")
    b.add_argument("--port", type=int, default=None, help="android: emulator console port (even number)")
    b.add_argument("--timeout", type=int, default=300)
    b.add_argument("--log", default=None, help="android: emulator log file")
    b.add_argument("extra", nargs="*", help="android: extra emulator arguments after --")
    b.set_defaults(func=cmd_boot)

    s = sub.add_parser("start", help="start recording into a new session directory")
    s.add_argument("--output", required=True, help="session directory to create")
    s.add_argument("--title", required=True, help="what is being verified")
    s.add_argument("--name", default=None)
    s.add_argument("--commit", default=None)
    s.add_argument("--branch", default=None)
    s.add_argument("--environment", default=None, help="OS / browser / device / deployment")
    s.add_argument("--label", default=None, help="pane label for compose (e.g. Android, iPhone 16)")
    s.add_argument("--source", default="auto", choices=["auto", "screen", "android", "ios", "external", "test"])
    s.add_argument("--target", default=None, help="android serial, iOS simulator name/UDID")
    s.add_argument("--geometry", default=None, help="WxH crop (screen), size (android), or test pattern size")
    s.add_argument("--offset", default=None, help="X,Y crop offset (screen)")
    s.add_argument("--screen-index", default=None, help="macOS avfoundation screen index (see doctor)")
    s.add_argument("--display", default=None, help="X11 display, default $DISPLAY")
    s.add_argument("--xauthority", default=None)
    s.add_argument("--output-name", default=None, help="wf-recorder output name (Wayland)")
    s.add_argument("--grabber", default=None, choices=["x11grab", "wf-recorder"], help="Linux: force a grabber")
    s.add_argument("--framerate", type=int, default=FPS)
    s.add_argument("--layout", default="auto", help="default overlay layout for this session: auto, overlay, panel")
    s.add_argument("--no-scrcpy", action="store_true", help="android: use adb screenrecord even if scrcpy exists")
    s.add_argument("--start-timeout", type=float, default=30.0)
    s.add_argument("--settle", type=float, default=1.5, help="seconds to wait before confirming the recorder stays up")
    s.set_defaults(func=cmd_start)

    a = sub.add_parser("annotate", help="timestamp a setup, test_start, or assertion")
    a.add_argument("session", nargs="+")
    a.add_argument("--type", required=True, choices=["setup", "test_start", "assertion"])
    a.add_argument("--message", required=True)
    a.add_argument("--result", default=None, choices=["passed", "failed", "untested"])
    a.add_argument("--at", type=float, default=None, help="seconds since session start (default: now)")
    a.set_defaults(func=cmd_annotate)

    n = sub.add_parser("narrate", help="timestamp a narration line shown until the next one")
    n.add_argument("session", nargs="+")
    n.add_argument("--message", required=True)
    n.add_argument("--hold", type=float, default=None, help="seconds to show; default until the next narration")
    n.add_argument("--at", type=float, default=None)
    n.set_defaults(func=cmd_narrate)

    st = sub.add_parser("stop", help="stop the recorder, burn overlays, write report.md and manifest.json")
    st.add_argument("session")
    st.add_argument("--video", default=None, help="external source: the recorded browser video to import")
    st.add_argument("--video-offset", type=float, default=0.0, help="external: seconds the video started after `start`")
    st.add_argument("--align", default="start", choices=["start", "end"], help="external: align the video to session start or stop")
    st.add_argument("--caveats", default=None, help="text for the Caveats section of report.md")
    st.add_argument("--timeout", type=float, default=90.0, help="seconds to wait for the recorder to flush")
    st.add_argument("--accept-untracked-recorder", action="store_true")
    st.add_argument("--force", action="store_true")
    add_render_options(st)
    st.set_defaults(func=cmd_stop)

    r = sub.add_parser("render", help="re-render evidence.mp4 from the raw capture with other options")
    r.add_argument("session")
    add_render_options(r)
    r.set_defaults(func=cmd_render)

    f = sub.add_parser("frames", help="extract a PNG at each annotation for review")
    f.add_argument("session", help="session or composite directory")
    f.add_argument("--types", default="assertion,test_start", help="comma list of event types")
    f.add_argument("--delay", type=float, default=0.6, help="seconds after the annotation to grab (lets the overlay appear)")
    f.add_argument("--out", default=None)
    f.set_defaults(func=cmd_frames)

    c = sub.add_parser("compose", help="stack finalized sessions side by side with a shared narration track")
    c.add_argument("--output", required=True, help="directory for composite.mp4, report.md, manifest.json")
    c.add_argument("session", nargs="+", help="finalized session directories, in pane order")
    c.add_argument("--label", action="append", help="pane label, one per session")
    c.add_argument("--direction", default="h", choices=["h", "v"])
    c.add_argument("--size", type=int, default=1080, help="pane height (h) or width (v) in pixels")
    c.add_argument("--title", default=None)
    c.add_argument("--no-align", action="store_true", help="start every pane at 0 instead of aligning by wall clock")
    c.add_argument("--caveats", default=None)
    add_render_options(c)
    c.set_defaults(func=cmd_compose)

    sv = sub.add_parser("_supervise")
    sv.add_argument("session")
    sv.set_defaults(func=cmd_supervise)
    return p


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
