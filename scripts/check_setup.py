#!/usr/bin/env python3
"""check_setup.py — verifies everything needed to render is installed. Run it first."""
import shutil
import sys

ok = True
print(f"Python {sys.version.split()[0]}", "✓" if sys.version_info >= (3, 9) else "✗ (need 3.9+)")
ok &= sys.version_info >= (3, 9)

try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        b.close()
    print("Playwright + Chromium ✓")
except ImportError:
    ok = False
    print("Playwright ✗   → pip install -r requirements.txt")
except Exception as e:
    ok = False
    print(f"Chromium ✗     → python -m playwright install chromium   ({e.__class__.__name__})")

ff = shutil.which("ffmpeg")
if not ff:
    try:
        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        ff = None
print("ffmpeg ✓  " + ff if ff else "ffmpeg ✗      → install ffmpeg or: pip install imageio-ffmpeg")
ok &= bool(ff)

print("\nAll good — try:  python scripts/preview.py" if ok else "\nFix the ✗ items above, then run this again.")
sys.exit(0 if ok else 1)
