#!/usr/bin/env python3
"""Focused local video capture for Android and imported browser recordings."""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path


def emit(value):
    print(json.dumps(value, sort_keys=True))


def fail(message, code=2, **details):
    print(json.dumps({"error": message, **details}, sort_keys=True), file=sys.stderr)
    raise SystemExit(code)


def require_tool(name):
    path = shutil.which(name)
    if not path:
        fail("required tool is unavailable", tool=name)
    return path


def run(command, timeout=60, check=True):
    result = subprocess.run(command, text=True, capture_output=True, timeout=timeout)
    if check and result.returncode:
        fail("command failed", command=command, stderr=result.stderr.strip()[-1000:])
    return result


def paths(directory):
    root = Path(directory).resolve()
    return {
        "root": root,
        "control": root / ".recording.json",
        "capture": root / "capture",
        "raw": root / "capture" / "raw.mp4",
        "video": root / "evidence.mp4",
        "log": root / "capture" / "recorder.log",
    }


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail("unable to read recording state", path=str(path), detail=str(error))


def adb_devices(adb):
    output = run([adb, "devices"], check=False).stdout.splitlines()[1:]
    return [line.split()[0] for line in output if len(line.split()) >= 2 and line.split()[1] == "device"]


def android_target(target):
    adb = require_tool("adb")
    if target:
        return adb, target
    devices = adb_devices(adb)
    if len(devices) != 1:
        fail("choose an Android target when zero or multiple devices are connected", devices=devices)
    return adb, devices[0]


def video_details(video):
    ffprobe = require_tool("ffprobe")
    result = run([
        ffprobe, "-v", "error", "-show_entries", "format=duration,size:stream=codec_name,width,height",
        "-of", "json", str(video),
    ], check=False)
    if result.returncode:
        fail("video is not readable", video=str(video), detail=result.stderr.strip()[-1000:])
    data = json.loads(result.stdout)
    stream = next((item for item in data.get("streams", []) if item.get("width")), {})
    duration = float(data.get("format", {}).get("duration", 0))
    if duration <= 0 or not stream.get("width"):
        fail("video has no readable frames", video=str(video))
    return {
        "duration": round(duration, 3),
        "size": int(data["format"].get("size", 0)),
        "width": stream["width"],
        "height": stream["height"],
        "codec": stream.get("codec_name"),
    }


def cmd_doctor(_args):
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    adb = shutil.which("adb")
    emit({
        "ready": bool(ffmpeg and ffprobe),
        "ffmpeg": ffmpeg,
        "ffprobe": ffprobe,
        "android_available": bool(adb),
        "android_devices": adb_devices(adb) if adb else [],
        "sources": ["external"] + (["android"] if adb else []),
    })
    if not ffmpeg or not ffprobe:
        raise SystemExit(1)


def cmd_devices(_args):
    adb = require_tool("adb")
    emit({"android_devices": adb_devices(adb)})


def cmd_start(args):
    item = paths(args.output)
    if item["root"].exists():
        fail("evidence directory already exists", directory=str(item["root"]))
    item["capture"].mkdir(parents=True)
    state = {"source": args.source, "target": args.target, "recorder": None}
    if args.source == "android":
        adb, target = android_target(args.target)
        device_file = "/sdcard/video-evidence-%d.mp4" % int(time.time())
        log = open(item["log"], "wb")
        process = subprocess.Popen(
            [adb, "-s", target, "shell", "screenrecord", "--time-limit", "180", device_file],
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        log.close()
        state.update({"target": target, "recorder": {"pid": process.pid, "device_file": device_file}})
    write_json(item["control"], state)
    emit({"session": str(item["root"]), "source": state["source"], "target": state["target"]})


def stop_android(state, item):
    adb, target = android_target(state.get("target"))
    device_file = (state.get("recorder") or {}).get("device_file")
    if not device_file:
        fail("Android recording state is incomplete")
    run([adb, "-s", target, "shell", "pkill", "-INT", "screenrecord"], check=False)
    pid = (state.get("recorder") or {}).get("pid")
    deadline = time.time() + 10
    while pid and time.time() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            break
        time.sleep(0.2)
    if pid:
        try:
            os.kill(pid, 15)
        except ProcessLookupError:
            pass
    pulled = run([adb, "-s", target, "pull", device_file, str(item["raw"])], check=False)
    run([adb, "-s", target, "shell", "rm", "-f", device_file], check=False)
    if pulled.returncode or not item["raw"].exists() or not item["raw"].stat().st_size:
        fail("Android recording could not be retrieved", detail=pulled.stderr.strip()[-1000:])


def cmd_stop(args):
    item = paths(args.session)
    state = read_json(item["control"])
    if state["source"] == "android":
        stop_android(state, item)
    else:
        if not args.video:
            fail("external sessions require --video")
        supplied = Path(args.video).resolve()
        if not supplied.exists():
            fail("external video does not exist", video=str(supplied))
        shutil.copy2(supplied, item["raw"])
    ffmpeg = require_tool("ffmpeg")
    run([
        ffmpeg, "-y", "-i", str(item["raw"]), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", str(item["video"]),
    ], timeout=300)
    details = video_details(item["video"])
    item["control"].unlink(missing_ok=True)
    emit({"video": str(item["video"]), "source": state["source"], "target": state.get("target"), "verified": True, **details})


def cmd_frames(args):
    video = Path(args.video).resolve()
    details = video_details(video)
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    times = [float(value) for value in args.at.split(",")]
    ffmpeg = require_tool("ffmpeg")
    frames = []
    for index, timestamp in enumerate(times, 1):
        timestamp = max(0, min(timestamp, details["duration"] - 0.05))
        frame = output / ("%02d-%05.2fs.png" % (index, timestamp))
        run([ffmpeg, "-y", "-ss", str(timestamp), "-i", str(video), "-frames:v", "1", str(frame)], timeout=120)
        frames.append(str(frame))
    emit({"frames": frames})


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor").set_defaults(handler=cmd_doctor)
    commands.add_parser("devices").set_defaults(handler=cmd_devices)
    start = commands.add_parser("start")
    start.add_argument("--output", required=True)
    start.add_argument("--source", required=True, choices=("android", "external"))
    start.add_argument("--target")
    start.set_defaults(handler=cmd_start)
    stop = commands.add_parser("stop")
    stop.add_argument("session")
    stop.add_argument("--video")
    stop.set_defaults(handler=cmd_stop)
    frames = commands.add_parser("frames")
    frames.add_argument("--video", required=True)
    frames.add_argument("--output", required=True)
    frames.add_argument("--at", required=True, help="comma-separated seconds")
    frames.set_defaults(handler=cmd_frames)
    return parser


def main():
    args = build_parser().parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
