#!/usr/bin/env python3
"""
render.py — turn src/index.html into an MP4.

Step 1  Launch headless Chromium (Playwright), open src/index.html.
Step 2  For every frame i:  call  seek(i / fps)  in the page, then screenshot it  → frames/f00000.jpg ...
Step 3  Stitch the JPEG frames into an H.264 MP4 with ffmpeg.

Examples
  python scripts/render.py                       # 1080p, 30 fps, full video  → output/agentic-ai-video-1080p.mp4
  python scripts/render.py --quality 4k          # 3840x2160 (same layout, rendered at 2x pixel density)
  python scripts/render.py --start 0 --end 10    # only the first 10 seconds (fast test)
  python scripts/render.py --workers 4           # use 4 browser processes in parallel
  python scripts/render.py --encode-only         # re-encode frames you already rendered
"""
import argparse
import os
import shutil
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "src" / "index.html"


def get_duration() -> float:
    """Read DUR from app.js so the script always matches the timeline."""
    for line in (ROOT / "src" / "app.js").read_text(encoding="utf-8").splitlines():
        if line.startswith("const DUR"):
            return float(line.split("=")[1].strip(" ;"))
    raise RuntimeError("Could not find 'const DUR = ...' in src/app.js")


def find_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:  # pip install imageio-ffmpeg ships a static ffmpeg binary (handy on Windows)
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        sys.exit("ffmpeg not found. Install it (see README) or run: pip install imageio-ffmpeg")


def render_worker(args):
    """One Chromium instance renders every n-th frame: worker w takes frames w, w+n, w+2n ..."""
    worker, n_workers, first, last, fps, scale, frames_dir, jpeg_q = args
    from playwright.sync_api import sync_playwright

    done, t0 = 0, time.time()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb"])
        page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=scale)
        page.goto(PAGE.as_uri())
        page.evaluate("document.fonts.ready")      # make sure JetBrains Mono / Inter are loaded
        page.wait_for_timeout(300)
        total = len(range(first + worker, last, n_workers))
        for i in range(first + worker, last, n_workers):
            page.evaluate(f"seek({i / fps})")
            page.screenshot(path=str(Path(frames_dir) / f"f{i:05d}.jpg"), type="jpeg", quality=jpeg_q)
            done += 1
            if done % 100 == 0 or done == total:
                rate = (time.time() - t0) / done
                print(f"  worker {worker}: {done}/{total} frames  ({rate:.2f}s/frame, ~{rate * (total - done):.0f}s left)", flush=True)
        browser.close()
    return done


def encode(ffmpeg, frames_dir, first, count, fps, out, crf):
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-framerate", str(fps), "-start_number", str(first),
           "-i", str(Path(frames_dir) / "f%05d.jpg"), "-frames:v", str(count),
           "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p",
           "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
           "-movflags", "+faststart", str(out)]
    print("Encoding with ffmpeg …")
    subprocess.run(cmd, check=True)


def main():
    dur = get_duration()
    ap = argparse.ArgumentParser(description="Render the Agentic AI video from src/index.html")
    ap.add_argument("--quality", choices=["1080p", "4k"], default="1080p")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--start", type=float, default=0.0, help="start time in seconds")
    ap.add_argument("--end", type=float, default=dur, help=f"end time in seconds (default {dur})")
    ap.add_argument("--workers", type=int, default=max(1, min(4, (os.cpu_count() or 2))))
    ap.add_argument("--crf", type=int, default=None, help="x264 quality: lower = better/bigger (default 18 for 1080p, 20 for 4k)")
    ap.add_argument("--frames-dir", default=str(ROOT / "output" / "frames"))
    ap.add_argument("--out", default=None)
    ap.add_argument("--encode-only", action="store_true", help="skip rendering, just encode existing frames")
    ap.add_argument("--keep-frames", action="store_true", help="don't delete the JPEG frames afterwards")
    a = ap.parse_args()

    scale = 2 if a.quality == "4k" else 1
    crf = a.crf if a.crf is not None else (20 if a.quality == "4k" else 18)
    first, last = int(round(a.start * a.fps)), int(round(min(a.end, dur) * a.fps))
    out = Path(a.out) if a.out else ROOT / "output" / f"agentic-ai-video-{a.quality}.mp4"
    frames_dir = Path(a.frames_dir)
    frames_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg = find_ffmpeg()

    print(f"Video: {a.start:.1f}s → {min(a.end, dur):.1f}s  |  {last - first} frames @ {a.fps} fps  |  "
          f"{1920 * scale}x{1080 * scale}  |  {a.workers} worker(s)")
    if not a.encode_only:
        t0 = time.time()
        jobs = [(w, a.workers, first, last, a.fps, scale, str(frames_dir), 92) for w in range(a.workers)]
        with ProcessPoolExecutor(max_workers=a.workers) as ex:
            total = sum(ex.map(render_worker, jobs))
        print(f"Rendered {total} frames in {time.time() - t0:.0f}s")

    encode(ffmpeg, frames_dir, first, last - first, a.fps, out, crf)
    if not a.keep_frames and not a.encode_only:
        shutil.rmtree(frames_dir, ignore_errors=True)
    print(f"Done → {out}  ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
