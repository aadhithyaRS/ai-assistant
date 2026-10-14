#!/usr/bin/env python3
"""
preview.py — save still images at chosen moments. Use this while editing: it takes seconds,
whereas a full render takes minutes.

  python scripts/preview.py                 # default moments, one per scene
  python scripts/preview.py 5 12.5 30       # specific times in seconds
Images are written to output/stills/t_<time>.png
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TIMES = [5, 16, 27, 30, 40, 44, 51, 55.5, 59.6, 61.4]


def main():
    times = [float(x) for x in sys.argv[1:]] or DEFAULT_TIMES
    out = ROOT / "output" / "stills"
    out.mkdir(parents=True, exist_ok=True)
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto((ROOT / "src" / "index.html").as_uri())
        page.evaluate("document.fonts.ready")
        for t in times:
            page.evaluate(f"seek({t})")
            path = out / f"t_{t:05.1f}.png"
            page.screenshot(path=str(path))
            print("saved", path.relative_to(ROOT))
        browser.close()
    if errors:
        print("\nJavaScript errors:\n  " + "\n  ".join(errors))
        sys.exit(1)


if __name__ == "__main__":
    main()
