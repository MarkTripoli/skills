# Media recipes

Every file comes from a real recording or capture. Trimming, cropping, scaling and placing two clips side by side are the only edits. Write stills as WebP (`-c:v libwebp -quality 80`) when `ffmpeg -hide_banner -encoders | grep -q libwebp` succeeds, else JPEG (`-q:v 3`, as below), and keep the page's media small: a 720-pixel-high side-by-side at 15 fps is usually a few hundred kilobytes.

When the evidence came from `record-evidence`, its session already holds `capture/` (raw footage without overlay), `evidence.mp4` (with overlay) and reviewed `frames/`. Cut page media from the raw capture so the recorder's cards and toasts do not cover the screen.

## Time a moment

Extract frames at 2 per second around the transition and open them:

```sh
mkdir -p frames
ffmpeg -hide_banner -ss 28 -to 36 -i before.mp4 -vf fps=2 frames/before-%03d.jpg
```

Frame `n` of that run sits at about `28 + (n - 1) / 2` seconds, so the reading is good to half a second. With only a synchronized composite, time from it and say so; its alignment adds up to half a second. Find the frame where the person acts (the tap) and the first frame that shows the result; the difference is the measured time. State every time relative to that visible action ("seconds after tapping Join"), never relative to the start of the file. For exact frame times, `ffprobe -v error -select_streams v -read_intervals 28%36 -show_entries frame=pts_time -of csv=p=0 before.mp4`.

## Still and crop

```sh
ffmpeg -hide_banner -ss 9.0 -i after.mp4 -frames:v 1 -q:v 3 media/after-4.3s-workspace.jpg
ffmpeg -hide_banner -i media/after-4.3s-workspace.jpg -vf "crop=iw:160:0:0" -q:v 3 media/after-4.3s-header.jpg
```

`crop=w:h:x:y` takes the kept width and height and the top-left corner; `iw` keeps the full width. Name each still with its time after the action, such as `after-4.3s-workspace.jpg`, so every page and every agent reads the same time from the file name. Read the frame size with `ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 after.mp4`. Open every still before using it, and crop or pick another frame when it shows a credential, invite code or personal data.

## Synchronized side by side

Start each clip half a second before its own action time so both show the action at the same playback moment, then play both in real time. `tpad` holds the last frame of the shorter clip; `-t` ends the result.

```sh
ffmpeg -hide_banner \
  -ss "$BEFORE_ACTION_MINUS_HALF" -i before.mp4 \
  -ss "$AFTER_ACTION_MINUS_HALF" -i after.mp4 \
  -filter_complex "[0:v]scale=-2:720,setsar=1,fps=15,tpad=stop_mode=clone:stop_duration=120[a];[1:v]scale=-2:720,setsar=1,fps=15,tpad=stop_mode=clone:stop_duration=120[b];[a][b]hstack=inputs=2" \
  -t "$LENGTH" -an -c:v libx264 -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart media/side-by-side.mp4
```

`$LENGTH` covers the slower side until it reaches the result. Never speed up, slow down or cut one side. Extract a frame at 0.5 s from the result and confirm both halves show the action; the page caption says the clips are aligned on it and whether they used different test data. A supplied composite that fails this check and cannot be rebuilt stays as it is, and its caption and the footer say where its alignment comes from.
