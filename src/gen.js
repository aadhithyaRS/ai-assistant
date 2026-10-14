/*
 * gen.js — scene 6 (57–62 s): a prompt with an attached image; the agent then generates
 * an image (noise → sharp "denoising" effect) and a video (frames render, then play).
 * Uses helpers defined in app.js (prog, ease, typeN, esc, blink, CARET, $), so load it after app.js.
 */
// Finale (57–62s): multimodal prompt → agent plans → generates an image and a video.
const GPROMPT = 'Generate a launch poster and a 10-sec promo video for our AI agent, using the attached brand colors.';
const T6 = { click: 57.05, type0: 57.15, type1: 58.0, send: 58.2, img0: 58.75, img1: 60.1, vid0: 59.2, vid1: 61.0 };

// Original generated-looking artwork: glowing orb above a perspective grid with an orbiting node network.
function artSVG(w, h, ph, poster) {
  const cx = w / 2, hz = h * 0.66, cy = h * (poster ? 0.38 : 0.42), R = Math.min(w, h) * 0.2;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="display:block">
  <defs><radialGradient id="abg" cx="50%" cy="34%" r="80%"><stop offset="0" stop-color="#3d2c86"/><stop offset=".5" stop-color="#15143a"/><stop offset="1" stop-color="#04050c"/></radialGradient>
  <radialGradient id="aorb"><stop offset="0" stop-color="#f0fbff"/><stop offset=".28" stop-color="#7ee8fa"/><stop offset=".62" stop-color="#7c3aed" stop-opacity=".85"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></radialGradient>
  <linearGradient id="afl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee" stop-opacity=".55"/><stop offset="1" stop-color="#22d3ee" stop-opacity=".05"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#abg)"/>`;
  // stars (deterministic)
  for (let i = 0; i < 46; i++) {
    const x = (i * 97.13) % w, y = ((i * 53.71) % (hz * 0.95)), tw = 0.35 + 0.35 * Math.sin(ph * 3 + i);
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(i % 3 === 0 ? 1.3 : 0.8)}" fill="#fff" opacity="${tw.toFixed(2)}"/>`;
  }
  // floor grid
  let g = '';
  for (let k = 1; k <= 9; k++) { const y = hz + (h - hz) * Math.pow(k / 9, 1.8) + ((ph * 14) % ((h - hz) / 9)) * (k / 9); if (y < h) g += `<line x1="0" x2="${w}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }
  for (let k = -10; k <= 10; k++) g += `<line x1="${cx}" y1="${hz}" x2="${cx + k * w * 0.14}" y2="${h}"/>`;
  s += `<rect x="0" y="${hz}" width="${w}" height="${h - hz}" fill="#070818"/><g stroke="url(#afl)" stroke-width="1">${g}</g>`;
  s += `<line x1="0" x2="${w}" y1="${hz}" y2="${hz}" stroke="#a78bfa" stroke-opacity=".7" stroke-width="1.2"/>`;
  // reflection
  s += `<ellipse cx="${cx}" cy="${hz + (hz - cy) * 0.55}" rx="${R * 1.5}" ry="${R * 0.5}" fill="url(#aorb)" opacity=".35"/>`;
  // network
  const N = 9, pts = [];
  for (let i = 0; i < N; i++) { const a = ph * 0.9 + i * Math.PI * 2 / N, rr = R * (1.75 + 0.35 * Math.sin(i * 2.3)); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.55]); }
  let net = '';
  pts.forEach((p, i) => { const q = pts[(i + 1) % N], q2 = pts[(i + 3) % N]; net += `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}"/><line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q2[0].toFixed(1)}" y2="${q2[1].toFixed(1)}" stroke-opacity=".25"/>`; });
  s += `<g stroke="#a5f3fc" stroke-opacity=".5" stroke-width="1">${net}</g>`;
  // rings + orb
  for (let k = 0; k < 3; k++) s += `<ellipse cx="${cx}" cy="${cy}" rx="${R * (1.25 + k * 0.28)}" ry="${R * (0.38 + k * 0.08)}" fill="none" stroke="${k === 1 ? '#f472b6' : '#67e8f9'}" stroke-opacity="${0.55 - k * 0.12}" stroke-width="1.6" transform="rotate(${(ph * 25 * (k % 2 ? -1 : 1) + k * 18).toFixed(1)} ${cx} ${cy})"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${R * 1.35}" fill="url(#aorb)"/>`;
  pts.forEach((p, i) => s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i % 3 ? 3 : 4.5}" fill="${i % 3 ? '#e0f2fe' : '#f9a8d4'}"/>`);
  if (poster) {
    s += `<text x="${cx}" y="${h * 0.86}" text-anchor="middle" font-family="Inter,sans-serif" font-weight="800" font-size="${w * 0.1}" letter-spacing="6" fill="#fff">AGENTIC AI</text>
    <text x="${cx}" y="${h * 0.93}" text-anchor="middle" font-family="JBM,monospace" font-size="${w * 0.03}" letter-spacing="5" fill="#a5f3fc">THINKS · PLANS · ACTS</text>`;
  }
  return s + '</svg>';
}
const noise = (seed, op) => `<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:${op.toFixed(3)}"><filter id="nz${seed}"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="${seed}"/><feColorMatrix type="saturate" values="0.4"/></filter><rect width="100%" height="100%" filter="url(#nz${seed})"/></svg>`;
const chk = '<span class="chk">✓</span>';
const spinner = t => `<span class="spin" style="transform:rotate(${t * 720}deg)"></span>`;

function renderGen(t) {
  // ---------- input ----------
  const focus = t >= T6.click && t < T6.send;
  $('minput').classList.toggle('focus', focus);
  $('mchip').innerHTML = t >= T6.click + 0.05 && t < T6.send ? `<span class="achip" style="opacity:${prog(t, T6.click + 0.05, T6.click + 0.2)}"><i></i>brand-colors.png <span style="color:#7d859b">· 84 KB</span></span>` : '';
  const n = typeN(t, T6.type0, T6.type1, GPROMPT.length);
  if (t >= T6.send) $('mtext').innerHTML = '<span style="color:#636b80">Describe an image, a video, or a task…</span>';
  else $('mtext').innerHTML = n > 0 ? esc(GPROMPT.slice(0, n)) + (focus && (t < T6.type1 + 0.05 || blink(t)) ? CARET : '') : (focus ? CARET : '') + '<span style="color:#636b80">Describe an image, a video, or a task…</span>';
  $('msend').style.background = n >= GPROMPT.length && t < T6.send + 0.05 ? '#6d5dfc' : '#2a2f3e';

  // ---------- chat ----------
  let m = '';
  if (t >= T6.send) {
    const u = easeOut(prog(t, T6.send, T6.send + 0.18));
    m += `<div style="opacity:${u};transform:translateY(${(1 - u) * 10}px)"><div class="ubub" style="max-width:600px">${GPROMPT}<div style="margin-top:10px"><span class="achip" style="background:#4a4390;border-color:#5f57b0;color:#fff"><i></i>brand-colors.png</span></div></div></div>`;
  }
  if (t >= 58.3) {
    const S = [
      ['Understanding the request', 'text + image reference → 2 deliverables', 58.3, 58.55],
      ['Writing the image prompt', '"neon neural orb over a reflective grid, brand purple/cyan, poster, 4k"', 58.55, 58.75],
      ['Generating image', 'image.generate(size="1024x1024", steps=30)', T6.img0, T6.img1],
      ['Storyboarding video', '4 shots · 10s · 24 fps', 58.8, 59.2],
      ['Rendering video', 'video.generate(duration=10, res="1080p")', T6.vid0, T6.vid1],
    ];
    m += '<div class="abub" style="margin-top:16px"><div style="font-size:12.5px;color:#8b93a8;margin-bottom:10px">AGENT · multimodal run</div>';
    for (const [a, b, s0, s1] of S) {
      if (t < s0 - 0.05) continue;
      const ic = t >= s1 ? chk : spinner(t);
      let extra = '';
      if (a === 'Generating image' && t < s1) extra = ` <span style="color:#c9bcff;font-family:JBM,monospace;font-size:12px">${Math.round(prog(t, s0, s1) * 100)}%</span>`;
      if (a === 'Rendering video' && t < s1) extra = ` <span style="color:#c9bcff;font-family:JBM,monospace;font-size:12px">frame ${Math.round(prog(t, s0, s1) * 240)}/240</span>`;
      m += `<div class="gstep" style="opacity:${prog(t, s0 - 0.05, s0 + 0.1)}">${ic}<div><div>${a}${extra}</div><div class="sub">${b}</div></div></div>`;
    }
    if (t >= 61.1) m += `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #252a37;color:#bdf5d3;font-size:14px;opacity:${prog(t, 61.1, 61.3)}">✓ Done — 1 poster (1024×1024) and 1 video (10s, 1080p) are ready.</div>`;
    m += '</div>';
  }
  $('mmsgs').innerHTML = m;

  // ---------- image card ----------
  const pi = prog(t, T6.img0, T6.img1);
  const st = (el, txt, cls) => { $(el).textContent = txt; $(el).style.background = cls === 'r' ? '#272152' : cls === 'd' ? '#0f2a1c' : '#1b1f2b'; $(el).style.color = cls === 'r' ? '#c9bcff' : cls === 'd' ? '#6ee7a0' : '#7d859b'; };
  if (t < T6.img0) { $('mimgbox').innerHTML = '<div class="ph">Waiting for a prompt…</div>'; st('mimgst', t >= 58.3 ? 'Queued' : 'Idle', 'q'); $('mimgmeta').innerHTML = ''; }
  else {
    const blur = 26 * Math.pow(1 - pi, 1.6), nop = Math.pow(1 - pi, 1.3) * 0.95;
    $('mimgbox').innerHTML = `<div style="position:absolute;inset:0;filter:blur(${blur.toFixed(2)}px) saturate(${(0.4 + 0.6 * pi).toFixed(2)})">${artSVG(512, 512, 1.2, true)}</div>` + (nop > 0.01 ? noise(1 + Math.floor(t * 14) % 40, nop) : '');
    const step = Math.min(30, Math.floor(pi * 30));
    st('mimgst', pi < 1 ? `Generating ${Math.round(pi * 100)}%` : 'Ready', pi < 1 ? 'r' : 'd');
    $('mimgmeta').innerHTML = pi < 1
      ? `<div class="mmeta">denoising step ${step}/30 · seed 48213 · 1024×1024</div><div class="bar" style="margin-top:8px"><div style="width:${pi * 100}%"></div></div>`
      : `<div class="mmeta">poster.png · 1024×1024 · seed 48213 · 30 steps · 4.1s</div><div class="mbtns"><span class="pri">Download</span><span>Variations</span><span>Upscale 4×</span></div>`;
  }

  // ---------- video card ----------
  const pv = prog(t, T6.vid0, T6.vid1);
  if (t < 58.8) { $('mvidbox').innerHTML = '<div class="ph">Waiting for a prompt…</div>'; st('mvidst', t >= 58.3 ? 'Queued' : 'Idle', 'q'); $('mstrip').innerHTML = ''; $('mvidmeta').innerHTML = ''; }
  else {
    const playing = t >= T6.vid1;
    const ph = playing ? 3.0 + (t - T6.vid1) * 0.9 : pv * 3.0;
    const nop = t < T6.vid0 ? 0.9 : playing ? 0 : 0.35 * (1 - pv);
    let box = t < T6.vid0 ? '<div class="ph" style="border:none">Storyboarding…</div>' : `<div style="position:absolute;inset:0">${artSVG(512, 288, ph, false)}</div>` + (nop > 0.01 ? noise(50 + Math.floor(t * 14) % 40, nop) : '');
    if (playing) {
      const sec = Math.min(10, (t - T6.vid1) * 4);
      box += `<div class="tl"><span>❚❚</span><span>00:${String(Math.floor(sec)).padStart(2, '0')}</span><div class="trk"><b style="width:${sec * 10}%"></b></div><span>00:10</span></div>`;
    } else if (t >= T6.vid0) {
      box += `<div class="tl"><span style="color:#c9bcff">● REC</span><span>rendering</span><div class="trk"><b style="width:${pv * 100}%"></b></div><span>${Math.round(pv * 100)}%</span></div>`;
    }
    $('mvidbox').innerHTML = box;
    st('mvidst', playing ? 'Ready · playing' : t < T6.vid0 ? 'Storyboarding' : `Rendering ${Math.round(pv * 100)}%`, playing ? 'd' : 'r');
    let strip = '';
    for (let k = 0; k < 8; k++) strip += `<div>${pv >= (k + 1) / 8 || playing ? artSVG(512, 288, k * 0.4, false) : ''}</div>`;
    $('mstrip').innerHTML = strip;
    const shots = [['00:00', 'Orb ignites — slow push-in'], ['00:03', 'Network nodes link up'], ['00:06', 'Camera glides over the grid'], ['00:08', 'Title card: AGENTIC AI']];
    let sb = '<div style="margin-top:16px;font-size:12px;color:#7d859b;letter-spacing:.06em">STORYBOARD</div>';
    shots.forEach(([tc, d], i) => {
      if (t < 58.85 + i * 0.08) return;
      const done = playing || pv >= (i + 1) / 4;
      sb += `<div class="sb">${done ? chk : t >= T6.vid0 && pv >= i / 4 ? spinner(t) : '<span class="pend"></span>'}<span class="n">${tc}</span>${d}</div>`;
    });
    if (playing) sb += `<div class="mbtns"><span class="pri">Download MP4</span><span>Edit shots</span><span>Add voiceover</span></div>`;
    $('mvidmeta').innerHTML = sb;
  }
}
