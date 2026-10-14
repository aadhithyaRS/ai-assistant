# How the video is built: a deep dive

This guide explains every moving part, then walks you through adding your own scene.
Read it with `src/app.js` open next to it.

---

## 1. The big idea: a video is a function of time

Normal web animations use timers (`setTimeout`, CSS transitions). They run in real time, so if the
computer is slow, frames are dropped. That's fine on a website but terrible for making a video.

This project flips it around. There is **one function**:

```js
seek(t)   // t = time in seconds, e.g. 12.533
```

`seek` reads `t` and **sets every element to exactly how it should look at that instant**:
how much code is typed, where the mouse is, how zoomed-in the camera is, which node glows. It keeps no
memory of the previous frame. So:

- the renderer can call `seek(0)`, `seek(0.033)`, `seek(0.066)` … and screenshot each one
- a 4K screenshot can take 0.3 s and the final video is still perfectly smooth
- you can jump straight to any moment (`index.html?t=30`) to inspect it

```
 ┌──────────────┐  seek(i/30)  ┌───────────────────┐  screenshot  ┌────────────┐  ffmpeg  ┌──────────┐
 │ render.py    │ ───────────▶ │ index.html in     │ ───────────▶ │ f00000.jpg │ ───────▶ │ video.mp4│
 │ (Playwright) │   i = 0…1859 │ headless Chromium │              │ f00001.jpg │          └──────────┘
 └──────────────┘              └───────────────────┘              │   …        │
                                                                   └────────────┘
```

---

## 2. The five helpers you'll see everywhere

All are at the top of `src/app.js`.

| Helper | What it does | Example |
|---|---|---|
| `prog(t, a, b)` | progress from 0 to 1 as `t` goes from `a` to `b` (clamped) | `prog(t, 10, 12)` is 0.5 at t=11 |
| `ease(u)` | smooth start and stop (cubic in-out) for a 0–1 value | `ease(prog(t, 10, 12))` |
| `fadeWin(t, a, b)` | 0 → 1 over 0.35 s after `a`, then 1 → 0 before `b`. Used for scene cross-fades | `fadeWin(t, 22, 33.25)` |
| `typeN(t, t0, t1, n)` | how many of `n` characters are typed at time `t`, with slight speed jitter so it looks human | `text.slice(0, typeN(t, 34.5, 36.8, text.length))` |
| `kf(list, t, keys)` | keyframe interpolation: `[{t:0,x:0},{t:2,x:100}]` gives `x=50` at t=1 | camera and cursor paths |

With just these, almost any effect is one line. For example, a title that slides up while fading in:

```js
const u = easeOut(prog(t, 62.2, 62.9));
el.style.opacity = u;
el.style.transform = `translateY(${(1 - u) * 30}px)`;
```

---

## 3. Anatomy of `seek(t)`

```js
function seek(t) {
  // 1. Which scenes are visible? (opacity 0–1, cross-fades overlap by 0.35 s)
  const S = { code: fadeWin(t, -1, 22.25), graph: …, test: …, dash: …, gen: … };
  // 2. Only render visible scenes (keeps it fast)
  if (S.code > 0) renderVSCode(t);   if (S.graph > 0) renderGraph(t);   …
  // 3. Global layers: clock, camera zoom, mouse cursor + click ripples, chapter chip, fade to black
}
```

### Camera (zoom-ins)
Everything sits inside `#cam`. The `CAM` list holds keyframes `{ t, s (scale), x, y (point to look at) }`.
`seek` interpolates them and applies `translate(...) scale(...)`. The position is clamped so the camera never
shows empty space outside the 1920×1080 "screen".

### Mouse cursor
`CUR` holds keyframes `{ t, x, y }`. Add `c: 1` to show a click ripple at that moment.
In scene 3 the keyframes are **generated**: while dragging a node, the node and cursor use the same easing, so
the node stays locked under the pointer. While drawing an edge, the cursor follows `getPointAtLength()` along the SVG path.

---

## 4. The scenes in detail

### Scenes 1–2: VS Code (`renderVSCode`)
- **Typed code:** `FILES` maps each file to typing *segments* `[start, end, fromChar, toChar]`. `agent.py` is typed in
  two sessions (7–11 s and 18–22 s). The text comes from `src/code.js`.
- **Syntax highlighting:** `tokenize()` is a ~30-line regex tokenizer that classifies Python tokens (keyword,
  string, function, class, constant…) and maps them to VS Code "Dark+" colours (`.k .s .f .t …` in the CSS).
  The full file is tokenized once, so even half-typed strings are coloured correctly.
- **Auto-scroll:** the editor scrolls to keep the caret near the bottom. The scroll value is averaged over the
  last 0.3 s for a smooth motion.
- **Terminal:** `TERM1` is a *script*: a list of `{k:'cmd'|'out'|'fn'|'prompt', t, …}` entries. `renderTerm()`
  shows each entry once its time has passed, types commands character by character, and `fn` entries
  return live content such as the pip progress bars.
- **Details that sell realism:** unsaved-file dot on tabs, current-line highlight, minimap, status bar
  `Ln/Col`, a top-bar clock that jumps forward (timelapse), and the "▶▶ 8×" badge.

### Scene 3: Graph studio (`renderGraph`)
- `NODES` (position, colour, icon) and `EDGES` (SVG path) define the graph.
- Build phase: each node is dragged from the palette (`pick`→`drop` times), then each edge is "drawn" with the
  `stroke-dasharray` / `stroke-dashoffset` trick.
- Run phase: `PULSES` moves a glowing dot along edges, `ACTN` highlights active nodes, `BADGE` shows decisions
  (`→ tools`, `→ END`), and `GEV` fills the inspector log.
- Final mode (t ≥ 52.5): every node turns green and edges glow, with flowing dashes.
- ⚠ An SVG `filter` on a perfectly straight line uses a zero-height bounding box by default and makes the line
  vanish. That's why `#glow` uses `filterUnits="userSpaceOnUse"`.

### Scene 4: Terminal + chat (`renderTest`)
Same terminal engine (`TERM2`) plus a chat UI. The chat steps (`CSTEPS`) switch from a spinner to a ✓ at fixed
times, and the report rows fade in one after another.

### Scene 5: Dashboard (`renderDash`)
`DSTEPS` defines the plan: each step has a start, an end and the tool it lights up. Status chips, the
progress bar, KPI counters and the streamed output are all derived from `t`.

### Scene 6: Multimodal studio (`gen.js`)
- `artSVG()` draws the "generated" artwork (orb, rings, node network, perspective grid) in pure SVG.
  `ph` (phase) animates it, so the same function also produces the video frames and thumbnails.
- The **diffusion effect** is `filter: blur()` decreasing over time, plus an SVG `feTurbulence` noise layer
  whose seed changes every frame and whose opacity fades out.

---

## 5. Tutorial: add your own scene (an end card)

Goal: after the multimodal scene, fade to a title card for 3 seconds. This was tested exactly as written.

**Step 1. Markup.** In `src/index.html`, paste this just above `<div id="ripple"></div>`:

```html
  <!-- ===== MY SCENE: end card ===== -->
  <div class="scene" id="s-end">
    <div id="endcard">
      <div id="endtitle">Build your own Agentic AI</div>
      <div id="endsub">Code: github.com/your-username/agentic-ai-video-generator</div>
    </div>
  </div>
```

**Step 2. Style.** In the `<style>` block, add:

```css
#s-end{background:radial-gradient(900px 500px at 50% 45%,#2b2466,#07080f)}
#endcard{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
#endtitle{font-size:72px;font-weight:800;color:#fff;letter-spacing:-1px}
#endsub{font-family:JBM,monospace;font-size:22px;color:#a5f3fc}
```

**Step 3. Animate.** At the bottom of `src/app.js`, add:

```js
function renderEnd(t) {
  const u = easeOut(prog(t, 62.2, 62.9));            // 0 → 1 over 0.7 s
  $('endtitle').style.opacity = u;
  $('endtitle').style.transform = `translateY(${(1 - u) * 30}px)`;
  $('endsub').style.opacity = prog(t, 62.8, 63.4);
}
```

**Step 4. Register it in `seek()`** (all in `src/app.js`):

```js
const DUR = 65;                                   // was 62
// in the S = { … } object:
    'gen': fadeWin(t, 56.8, 62.3),                // was fadeWin(t, 56.8, 99)
    'end': fadeWin(t, 61.9, 99),                  // new
// z-order:
const Z = { code: 1, graph: t > 50 ? 5 : 2, test: 3, dash: 4, gen: 6, end: 7 };
// after "if (S.gen > 0) renderGen(t);":
  if (S.end > 0) renderEnd(t);
// hide the mouse before the card:     1 - prog(t, 61.6, 62)
// move the final fade-to-black:       prog(t, 64.4, 65)
```

**Step 5. Check it.**
```bash
python scripts/preview.py 62.1 63.5             # stills
python scripts/render.py --start 61 --end 65    # just the new part
python scripts/render.py                         # the whole thing
```

---

## 6. Exercises for students

1. **Easy:** change the chat prompt (`CPROMPT`) and the report table to compare three phones, colleges or cloud providers.
2. **Easy:** make the typing in scene 2 twice as slow (hint: the segment times in `FILES`), then shift the later scenes.
3. **Medium:** add a seventh node "Human Approval" to the graph between Reasoning and Tool Execution, with its own edge and pulse.
4. **Medium:** add a "▶▶ 4×" speed badge to scene 4 (see `SPEED`) without overlapping the chat input.
5. **Hard:** add a light theme. Move the colours into CSS variables and switch them with a URL parameter.
6. **Hard:** make the dashboard steps come from a JSON file so non-coders can edit the story.

---

## 7. Performance notes

- Rendering is dominated by the screenshot itself (~0.15 s at 1080p, ~0.3 s at 4K per frame per worker).
- `render.py` splits frames across workers by stride (worker 0 takes frames 0, 4, 8…), so all workers finish together.
- Frames are JPEG (quality 92) to save disk space: 1,860 4K frames ≈ 1–2 GB, deleted after encoding unless `--keep-frames`.
- 4K uses `device_scale_factor=2`: the layout stays 1920×1080 and Chromium draws every pixel twice as sharp,
  so text stays crisp instead of being upscaled.
