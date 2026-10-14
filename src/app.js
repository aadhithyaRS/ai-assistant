/*
 * app.js — the timeline engine for the whole video.
 *
 * HOW IT WORKS
 *   Nothing here is animated with CSS transitions or timers. Instead, seek(t) looks at the
 *   time t (in seconds) and sets every element on the page to exactly how it should look at
 *   that moment. Because each frame depends only on t, the renderer can capture frames as
 *   slowly as it needs (4K screenshots take ~0.3 s each) and the video is still perfectly smooth.
 *
 * FILE MAP (search for the ===== banners)
 *   helpers ............ clamp / lerp / ease / prog / typeN (typing effect) / kf (keyframes)
 *   highlighter ........ tiny Python tokenizer that produces VS Code "Dark+" colours
 *   VS CODE ............ scenes 1–2: explorer, tabs, typed code, terminal (TERM1 script)
 *   GRAPH .............. scene 3 + finale glow: nodes, edges, drag-and-drop, run pulses
 *   TEST ............... scene 4: terminal logs (TERM2 script) + chat with report
 *   DASHBOARD .......... scene 5: KPI cards, execution plan, tools, streamed output
 *   CAMERA / CURSOR .... zoom keyframes (CAM), mouse path + clicks (CUR), chapter chips
 *   seek(t) ............ cross-fades scenes and calls each scene's render function
 *
 * gen.js adds scene 6 (multimodal image/video generation); code.js holds the typed source files.
 */
// Deterministic timeline: seek(t) renders the exact frame for time t (seconds).
const DUR = 62;
const $ = id => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, u) => a + (b - a) * u;
const ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const easeOut = u => 1 - Math.pow(1 - u, 3);
const prog = (t, a, b) => clamp((t - a) / (b - a));
const fadeWin = (t, a, b, f = .35) => Math.min(prog(t, a, a + f), 1 - prog(t, b - f, b));
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const typeN = (t, t0, t1, n) => { let p = prog(t, t0, t1); if (p > 0 && p < 1) p = clamp(p + 0.006 * Math.sin(p * 70)); return Math.floor(p * n); };
const blink = t => Math.floor(t * 1.9) % 2 === 0;
const CARET = '<span class="caret"></span>';

function kf(list, t, keys) {
  if (t <= list[0].t) return list[0];
  for (let i = 0; i < list.length - 1; i++) {
    const A = list[i], B = list[i + 1];
    if (t <= B.t) {
      const u0 = (t - A.t) / Math.max(1e-6, B.t - A.t);
      const u = B.lin ? u0 : ease(u0);
      const o = {}; for (const k of keys) o[k] = lerp(A[k], B[k], u); return o;
    }
  }
  return list[list.length - 1];
}

/* ====================== Python syntax highlighter ====================== */
const KC = new Set('import from return if else elif for in while with as try except raise pass break continue yield await async not and or is lambda'.split(' '));
const KD = new Set('def class None True False'.split(' '));
function tokenize(src) {
  const re = /(#[^\n]*)|("""[\s\S]*?(?:"""|$)|f?"(?:[^"\\\n]|\\.)*"?|f?'(?:[^'\\\n]|\\.)*'?)|(@\w+)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|([^\sA-Za-z_\d])/g;
  const out = []; let m, prevWord = '';
  while ((m = re.exec(src))) {
    const s = m[0]; let c = 'p';
    if (m[1]) c = 'c'; else if (m[2]) c = 's'; else if (m[3]) c = 'd'; else if (m[4]) c = 'n';
    else if (m[5]) {
      const next = src[re.lastIndex];
      if (KC.has(s)) c = 'k'; else if (KD.has(s)) c = 'b';
      else if (prevWord === 'def') c = 'f'; else if (prevWord === 'class') c = 't';
      else if (/^[A-Z][A-Z_0-9]+$/.test(s)) c = 'C';
      else if (/^[A-Z]/.test(s)) c = 't';
      else if (next === '(') c = 'f';
      else if (['str', 'int', 'dict', 'list', 'float', 'bool', 'self'].includes(s)) c = s === 'self' ? 'v' : 't';
      else c = 'v';
      prevWord = s;
    } else if (m[6]) c = 'w';
    out.push({ s, c });
  }
  return out;
}
function codeLines(tokens, n) {
  const lines = ['']; let left = n;
  for (const tk of tokens) {
    if (left <= 0) break;
    const s = tk.s.slice(0, left); left -= s.length;
    const parts = s.split('\n');
    parts.forEach((p, i) => {
      if (i > 0) lines.push('');
      if (p) lines[lines.length - 1] += tk.c === 'w' ? esc(p) : `<span class="${tk.c}">${esc(p)}</span>`;
    });
  }
  return lines;
}

/* ============================= VS CODE ============================= */
const FILES = {
  agent: { name: 'agent.py', src: SRC.agent, segs: [[7.25, 10.8, 0, SRC.agent1.length], [18.0, 21.8, SRC.agent1.length, SRC.agent.length]] },
  prompts: { name: 'prompts.py', src: SRC.prompts, segs: [[11.8, 14.35, 0, SRC.prompts.length]] },
  tools: { name: 'tools.py', src: SRC.tools, segs: [[15.15, 17.35, 0, SRC.tools.length]] },
};
for (const k in FILES) { FILES[k].tok = tokenize(FILES[k].src); }
const OPEN = [['agent', 7.0], ['prompts', 11.55], ['tools', 14.95]];
const ACTIVE = [[0, null], [7.0, 'agent'], [11.55, 'prompts'], [14.95, 'tools'], [17.7, 'agent']];
function typed(f, t) {
  let n = 0;
  for (const [a, b, c0, c1] of f.segs) { if (t >= a) n = c0 + typeN(t, a, b, c1 - c0); }
  return n;
}
function typingNow(f, t) { return f.segs.some(([a, b]) => t >= a && t <= b + 0.15); }
function dirty(f, t) { return f.segs.some(([a, b]) => t >= a && t < b + 0.45); }
const lineOf = (src, n) => { let c = 0; for (let i = 0; i < n; i++) if (src.charCodeAt(i) === 10) c++; return c; };

const TREE = [
  { t: 1.5, hdr: true },
  { t: 2.35, name: '.venv', folder: true },
  { t: 3.15, name: '.env' },
  { t: 3.15, name: 'agent.py', py: 'agent' },
  { t: 3.15, name: 'main.py', py: 1 },
  { t: 3.15, name: 'memory.py', py: 1 },
  { t: 3.15, name: 'prompts.py', py: 'prompts' },
  { t: 3.15, name: 'requirements.txt' },
  { t: 3.15, name: 'tools.py', py: 'tools' },
];

const P0 = '<span class="tg">dev@workstation</span>:<span class="tb">~/projects</span>$ ';
const P1 = '<span class="tg">dev@workstation</span>:<span class="tb">~/projects/agentic-ai-assistant</span>$ ';
const P2 = '(.venv) ' + P1;
const BAR = (t, t0, t1, size, speed) => {
  const p = prog(t, t0, t1), W = 40, k = Math.round(p * W);
  const col = p < 1 ? 'tm' : 'tg';
  return `   <span class="${col}">${'━'.repeat(k)}</span><span class="td">${'━'.repeat(W - k)}</span> <span class="tg">${p < 1 ? (parseFloat(size) * p).toFixed(1) + '/' + size.split('/')[1] : size}</span> <span class="tr">${speed}</span> eta <span class="tc">0:00:0${p < 1 ? Math.ceil((1 - p) * 3) : 0}</span>`;
};
const TERM1 = [
  { k: 'cmd', p: P0, t0: 0.7, t1: 1.4, text: 'mkdir agentic-ai-assistant && cd agentic-ai-assistant' },
  { k: 'cmd', p: P1, t0: 1.6, t1: 2.2, text: 'python3 -m venv .venv && source .venv/bin/activate' },
  { k: 'cmd', p: P2, t0: 2.4, t1: 3.0, text: 'touch agent.py tools.py memory.py prompts.py main.py requirements.txt .env' },
  { k: 'cmd', p: P2, t0: 3.2, t1: 3.85, text: 'pip install langgraph langchain-openai langchain-community tavily-python chromadb python-dotenv rich' },
  { k: 'out', t: 3.95, h: 'Collecting langgraph' },
  { k: 'out', t: 4.0, h: '  Downloading langgraph-0.4.8-py3-none-any.whl.metadata (6.8 kB)' },
  { k: 'out', t: 4.06, h: 'Collecting langchain-openai' },
  { k: 'out', t: 4.1, h: '  Downloading langchain_openai-0.3.24-py3-none-any.whl (68.9 kB)' },
  { k: 'fn', t: 4.12, f: t => BAR(t, 4.12, 4.35, '68.9/68.9 kB', '5.2 MB/s') },
  { k: 'out', t: 4.42, h: 'Collecting langchain-community' },
  { k: 'out', t: 4.46, h: '  Downloading langchain_community-0.3.25-py3-none-any.whl (2.5 MB)' },
  { k: 'fn', t: 4.5, f: t => BAR(t, 4.5, 4.9, '2.5/2.5 MB', '31.2 MB/s') },
  { k: 'out', t: 4.96, h: 'Collecting tavily-python' },
  { k: 'out', t: 5.02, h: 'Collecting chromadb' },
  { k: 'out', t: 5.06, h: '  Downloading chromadb-1.0.12-cp39-abi3-manylinux_2_17_x86_64.whl (19.3 MB)' },
  { k: 'fn', t: 5.1, f: t => BAR(t, 5.1, 5.55, '19.3/19.3 MB', '48.6 MB/s') },
  { k: 'out', t: 5.6, h: 'Collecting python-dotenv' },
  { k: 'out', t: 5.64, h: 'Collecting rich' },
  { k: 'out', t: 5.68, h: 'Collecting openai<2.0.0,>=1.86.0 (from langchain-openai)' },
  { k: 'out', t: 5.74, h: 'Collecting tiktoken<1,>=0.7 (from langchain-openai)' },
  { k: 'out', t: 5.86, h: 'Installing collected packages: python-dotenv, tiktoken, rich, openai, tavily-python, chromadb, langchain-community, langgraph, langchain-openai' },
  { k: 'out', t: 6.2, h: 'Successfully installed chromadb-1.0.12 langchain-community-0.3.25 langchain-openai-0.3.24 langgraph-0.4.8 openai-1.88.0 python-dotenv-1.1.0 rich-14.0.0 tavily-python-0.7.5' },
  { k: 'prompt', p: P2, t: 6.3 },
];
function renderTerm(script, t, maxLines) {
  const lines = []; let lastIdx = -1;
  script.forEach((e, i) => {
    const st = e.k === 'cmd' ? e.t0 : e.t;
    if (t < st) return;
    // a prompt line is replaced by the next command typed after it
    lastIdx = i;
    if (e.k === 'cmd') lines.push(e.p + esc(e.text.slice(0, typeN(t, e.t0, e.t1, e.text.length))));
    else if (e.k === 'out') lines.push(e.h);
    else if (e.k === 'fn') lines.push(e.f(t));
    else if (e.k === 'prompt') lines.push(e.p);
  });
  if (lastIdx >= 0) {
    const e = script[lastIdx];
    if ((e.k === 'cmd' && (t < e.t1 + 0.12 || blink(t))) || (e.k === 'prompt' && blink(t))) lines[lines.length - 1] += '<span style="background:#ccc">&nbsp;</span>';
  }
  return lines.slice(-maxLines).join('\n');
}

function renderVSCode(t) {
  // window launch
  const ap = easeOut(prog(t, 0, 0.5));
  $('vsc').style.transform = `scale(${lerp(0.965, 1, ap)})`;
  $('vsc').style.opacity = ap;

  let act = null; for (const [ts, f] of ACTIVE) if (t >= ts) act = f;
  const F = act ? FILES[act] : null;

  // explorer
  let tree = '';
  for (const it of TREE) {
    if (t < it.t) continue;
    if (it.hdr) { tree += `<div class="row"><span class="ic">⌄</span><b>AGENTIC-AI-ASSISTANT</b></div>`; continue; }
    const sel = it.py && it.py === act ? ' sel' : '';
    const ic = it.folder ? '<span class="ic" style="color:#c5c5c5">›</span>' : it.py ? '<span class="ic" style="color:#4b9fd6">py</span>' : it.name === '.env' ? '<span class="ic" style="color:#e5c07b">⚙</span>' : '<span class="ic" style="color:#9aa">≡</span>';
    tree += `<div class="row${sel}" style="padding-left:${it.folder ? 20 : 28}px">${ic}${it.name}</div>`;
  }
  $('tree').innerHTML = tree;

  // tabs
  let tabs = '';
  for (const [k, ts] of OPEN) {
    if (t < ts) continue;
    const f = FILES[k]; const on = k === act;
    tabs += `<div class="tab${on ? ' on' : ''}"><span class="py">py</span>${f.name}${dirty(f, t) ? '<span class="dot"></span>' : '<span style="margin-left:6px;color:' + (on ? '#ccc' : 'transparent') + '">×</span>'}</div>`;
  }
  if (!act) tabs = '<div class="tab on" style="color:#ccc">Welcome</div>';
  $('tabs').innerHTML = tabs;
  $('vttl').textContent = (F ? F.name + ' — agentic-ai-assistant' : t > 1.5 ? 'agentic-ai-assistant' : 'Welcome') + ' — Visual Studio Code';
  $('crumb').innerHTML = F ? `<span>agentic-ai-assistant</span> › <span>${F.name}</span>` : '';

  // panel
  const ph = lerp(300, 0, ease(prog(t, 11.0, 11.4)));
  $('panel').style.height = ph + 'px';
  const edH = 1054 - 34 - 22 - 57 - ph;
  $('editor').style.height = edH + 'px';
  $('welcome').style.display = F ? 'none' : 'flex';
  $('editor').style.display = F ? 'block' : 'none';
  $('term1').innerHTML = renderTerm(TERM1, t, 13);

  if (F) {
    const n = typed(F, t);
    const lines = codeLines(F.tok, n);
    const vis = Math.floor(edH / 22);
    // smoothed scroll
    let sc = 0;
    for (let k = 0; k < 6; k++) {
      const tn = typed(F, t - k * 0.06);
      sc += Math.max(0, lineOf(F.src, tn) - (vis - 6));
    }
    sc /= 6;
    const top = Math.floor(sc), off = (sc - top) * 22;
    const curLine = lines.length - 1;
    const showCaret = typingNow(F, t) || blink(t);
    let html = '';
    for (let i = top; i < Math.min(lines.length, top + vis + 2); i++) {
      html += `<div class="ln${i === curLine ? ' cur' : ''}"><span class="no">${i + 1}</span><span>${lines[i]}${i === curLine && showCaret ? CARET : ''}</span></div>`;
    }
    $('codewrap').innerHTML = html;
    $('codewrap').style.transform = `translateY(${-off}px)`;
    // minimap
    const raw = F.src.slice(0, n).split('\n');
    $('minimap').innerHTML = raw.map(l => {
      const w = Math.min(92, l.length * 1.15), ind = (l.length - l.trimStart().length) * 1.15;
      const c = l.trim().startsWith('#') ? '#4e6e42' : /"""|"/.test(l) ? '#7a5a48' : '#4b5a70';
      return `<div style="width:${w}px;margin-left:${ind}px;background:${l.trim() ? c : 'transparent'}"></div>`;
    }).join('');
    const lastLine = raw[raw.length - 1] || '';
    $('stpos').textContent = `Ln ${curLine + 1}, Col ${lastLine.length + 1}`;
    $('stlang').textContent = 'Python';
  } else { $('stpos').textContent = ''; $('stlang').textContent = ''; }
  $('stpy').textContent = t > 2.3 ? "3.11.9 ('.venv': venv)" : '';
}

/* ============================= GRAPH ============================= */
const ICONS = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  agent: '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M19 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  db: '<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v14c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
  done: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
};
const NODES = [
  { id: 'ur', name: 'User Request', sub: '__start__', x: 380, y: 460, col: '#3b82f6', ic: 'user' },
  { id: 'ag', name: 'AI Agent', sub: 'ChatOpenAI·gpt-4o', x: 680, y: 460, col: '#8b5cf6', ic: 'agent' },
  { id: 're', name: 'Reasoning', sub: 'reasoning()', x: 980, y: 460, col: '#ec4899', ic: 'bulb' },
  { id: 'to', name: 'Tool Execution', sub: 'ToolNode(3)', x: 980, y: 720, col: '#f59e0b', ic: 'tool' },
  { id: 'me', name: 'Memory', sub: 'vector store', x: 680, y: 240, col: '#10b981', ic: 'db' },
  { id: 'fi', name: 'Final Response', sub: '__end__', x: 1300, y: 460, col: '#22d3ee', ic: 'done' },
];
const PAL = i => ({ x: 128, y: 218 + i * 50 });
const GX = 50, GY = 50;
NODES.forEach(n => { n.x += GX; n.y += GY; });
NODES.forEach((n, i) => { n.pick = 22.55 + i * 0.48; n.drop = n.pick + 0.36; });
const EDGES = [
  { id: 'e1', d: 'M485 460 L575 460' },
  { id: 'e2', d: 'M785 460 L875 460' },
  { id: 'eM', d: 'M680 422 L680 278', dash: true, lab: ['context', 728, 350] },
  { id: 'e4', d: 'M980 498 L980 682', lab: ['tool_calls', 1036, 590] },
  { id: 'e5', d: 'M875 720 C770 720 680 650 680 498', lab: ['observation', 742, 676] },
  { id: 'e3', d: 'M1085 460 L1195 460', lab: ['done', 1140, 438] },
];
EDGES.forEach(e => { e.d = e.d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => `${+x + GX} ${+y + GY}`); if (e.lab) { e.lab[1] += GX; e.lab[2] += GY; } });
EDGES.forEach((e, j) => { e.t0 = 25.6 + j * 0.32; e.t1 = e.t0 + 0.25; });
// run animation
const PULSES = [
  ['e1', 28.2, 28.5], ['eM', 28.55, 28.8], ['eM', 28.95, 29.15, 1], ['e2', 29.1, 29.35], ['e4', 29.75, 30.05],
  ['e5', 30.55, 30.9], ['e2', 31.0, 31.25], ['e3', 31.6, 31.9],
];
const ACTN = { ur: [[28.0, 28.4]], ag: [[28.45, 29.15], [30.85, 31.05]], me: [[28.75, 29.0]], re: [[29.3, 29.8], [31.2, 31.65]], to: [[30.0, 30.6]], fi: [[31.85, 33.2]] };
const BADGE = { re: [[29.5, 29.85, '→ tools'], [31.4, 31.7, '→ END']], to: [[30.05, 30.65, 'web_search ×3']], me: [[28.75, 29.05, 'search · 4 hits']], fi: [[31.9, 99, 'report.md ✓']] };
const GEV = [
  [27.55, '10:42:05', 'Graph valid ✓ — 6 nodes · 6 edges'],
  [28.05, '10:42:07', '▶ run started · thread 7f3a91'],
  [28.6, '10:42:07', 'agent → memory.search() · 4 hits'],
  [29.55, '10:42:08', 'reasoning → decision: <span style="color:#c9bcff">tools</span>'],
  [30.1, '10:42:10', 'tools → web_search ×3 · save_note'],
  [31.45, '10:42:13', 'reasoning → decision: <span style="color:#c9bcff">END</span>'],
  [31.95, '10:42:13', '<span style="color:#6ee7a0">✓ final response · 7 steps · 18.4s</span>'],
];
let G = null;
function initGraph() {
  $('palette').innerHTML = NODES.map(n => `<div class="pitem"><i style="background:${n.col}"></i>${n.name}</div>`).join('');
  $('gnodes').innerHTML = NODES.map(n => `<div class="node" id="n-${n.id}"><div class="ico" style="background:${n.col}"><svg viewBox="0 0 24 24">${ICONS[n.ic]}</svg></div><div><div class="nt">${n.name}</div><div class="ns">${n.sub}</div></div><span class="st"></span><span class="badge" style="display:none"></span></div>`).join('');
  const NS = 'http://www.w3.org/2000/svg';
  for (const e of EDGES) {
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', e.d); p.setAttribute('fill', 'none');
    $('gedges').appendChild(p); e.el = p; e.len = p.getTotalLength();
    const f = document.createElementNS(NS, 'path'); f.setAttribute('d', e.d); f.setAttribute('fill', 'none');
    f.setAttribute('stroke', '#a7f3d0'); f.setAttribute('stroke-width', '2'); f.setAttribute('stroke-dasharray', '5 16'); f.setAttribute('stroke-linecap', 'round');
    $('gedges').appendChild(f); e.flow = f;
    if (e.lab) { const l = document.createElement('div'); l.className = 'elab'; l.textContent = e.lab[0]; l.style.left = e.lab[1] + 'px'; l.style.top = e.lab[2] + 'px'; $('glabels').appendChild(l); e.labEl = l; }
  }
  const PN = 'http://www.w3.org/2000/svg';
  G = { dots: [] };
  for (let i = 0; i < 2; i++) { const c = document.createElementNS(PN, 'circle'); c.setAttribute('r', '6'); c.setAttribute('fill', '#c4b5fd'); c.setAttribute('filter', 'url(#glow)'); $('gdots').appendChild(c); G.dots.push(c); }
}
const inWin = (wins, t) => (wins || []).some(([a, b]) => t >= a && t <= b);
function renderGraph(t) {
  const final = t >= 52.5;
  const T = final ? 40 : t; // in final mode everything is built & run
  let placed = 0, edgesDone = 0;
  NODES.forEach((n, i) => {
    const el = $('n-' + n.id);
    if (T < n.pick) { el.style.opacity = 0; return; }
    placed += T >= n.drop ? 1 : 0;
    const u = ease(prog(T, n.pick, n.drop)), P = PAL(i);
    const cx = lerp(P.x + 60, n.x, u), cy = lerp(P.y - 5 + 5, n.y, u);
    const drag = T < n.drop;
    el.style.left = cx + 'px'; el.style.top = cy + 'px';
    el.style.opacity = drag ? 0.9 : 1;
    el.style.transform = `scale(${drag ? 1.04 : 1 + 0.04 * (1 - prog(T, n.drop, n.drop + 0.15))})`;
    const active = !final && inWin(ACTN[n.id], t);
    const visited = final || (t >= 28 && ACTN[n.id] && t > ACTN[n.id][0][0]);
    let border = '#2c3346', shadow = '0 8px 24px rgba(0,0,0,.35)';
    if (drag) shadow = '0 18px 40px rgba(0,0,0,.6)';
    if (active) { border = n.col; shadow = `0 0 0 1px ${n.col}, 0 0 28px ${n.col}88`; }
    if (final) { const g = 0.5 + 0.5 * Math.sin(t * 2.4 + i * 0.9); border = '#2f8f62'; shadow = `0 0 0 1px #34d39955, 0 0 ${16 + 12 * g}px rgba(52,211,153,${0.18 + 0.17 * g})`; }
    el.style.borderColor = border; el.style.boxShadow = shadow;
    el.classList.toggle('done', !!visited && !active);
    const bd = el.querySelector('.badge'); let btxt = null;
    if (!final) for (const [a, b, s] of (BADGE[n.id] || [])) if (t >= a && t <= b) btxt = s;
    if (final && n.id === 'fi') btxt = 'report.md ✓';
    bd.style.display = btxt ? 'block' : 'none'; if (btxt) bd.textContent = btxt;
  });
  for (const e of EDGES) {
    const p = prog(T, e.t0, e.t1); if (p >= 1) edgesDone++;
    const act = !final && PULSES.some(([id, a, b]) => id === e.id && t >= a && t <= b + 0.3);
    const col = final ? '#34d399' : act ? '#a78bfa' : '#5d6680';
    e.el.setAttribute('stroke', col); e.el.setAttribute('stroke-width', final || act ? 2.6 : 2);
    e.el.setAttribute('filter', final || act ? 'url(#glow)' : '');
    if (e.dash && p >= 1) e.el.setAttribute('stroke-dasharray', '7 6'), e.el.removeAttribute('stroke-dashoffset');
    else { e.el.setAttribute('stroke-dasharray', e.len); e.el.setAttribute('stroke-dashoffset', e.len * (1 - p)); }
    const mk = final ? 'url(#ahG)' : act ? 'url(#ahA)' : 'url(#ah)';
    e.el.setAttribute('marker-end', p >= 1 ? mk : '');
    e.el.setAttribute('marker-start', p >= 1 && e.dash ? mk : '');
    e.el.style.opacity = T >= e.t0 ? 1 : 0;
    e.flow.style.opacity = final ? 0.55 * prog(t, 53.1, 53.8) : 0;
    e.flow.setAttribute('stroke-dashoffset', -t * 38);
    if (e.labEl) e.labEl.style.opacity = prog(T, e.t1, e.t1 + 0.2);
  }
  // pulses
  let di = 0;
  for (const [id, a, b, rev] of PULSES) {
    if (final || t < a || t > b || di > 1) continue;
    const e = EDGES.find(x => x.id === id); let u = ease(prog(t, a, b)); if (rev) u = 1 - u;
    const pt = e.el.getPointAtLength(e.len * u);
    G.dots[di].setAttribute('cx', pt.x); G.dots[di].setAttribute('cy', pt.y); G.dots[di].style.opacity = 1; di++;
  }
  for (; di < 2; di++) G.dots[di].style.opacity = 0;
  $('gcount').textContent = `${placed} nodes · ${edgesDone} edges`;
  // run button
  const running = !final && t >= 28 && t < 32;
  $('grun').textContent = running ? '■ Running…' : '▶ Run';
  $('grun').style.background = t >= 27.98 && t < 28.12 ? '#5444e0' : running ? '#3a3480' : '#6d5dfc';
  // inspector
  let ev = '';
  if (!final && t < 27.55) ev = `<div class="ev" style="color:#7d859b">No runs yet — build the graph, then press <b style="color:#c9bcff">Run</b>.</div>`;
  for (const [a, tm, h] of GEV) if (T >= a) ev += `<div class="ev" style="opacity:${final ? 1 : prog(t, a, a + .15)}"><div class="tm">${tm}</div>${h}</div>`;
  if (final) ev += `<div class="ev" style="border-color:#1f6f45;background:#10221a;color:#bdf5d3">Agent ready · listening for the next task</div>`;
  $('gev').innerHTML = ev;
  $('toast').style.opacity = final ? prog(t, 53.4, 53.8) : 0;
  $('toast').style.transform = `translateX(-50%) translateY(${final ? 12 * (1 - easeOut(prog(t, 53.4, 53.8))) : 0}px)`;
}

/* ============================= TEST (terminal + chat) ============================= */
const P3 = '(.venv) <span class="tg">dev@workstation</span>:<span class="tb">~/agentic-ai-assistant</span>$ ';
const L = (tm, tag, cls, body) => `<span class="td">${tm}</span> <span class="${cls}">${tag.padEnd(7)}</span> ${body}`;
const ST = (t, a, b) => t < b ? '<span class="td">…</span>' : `<span class="tg">✓ ${((b - a) * 1.6).toFixed(2)}s</span>`;
const TERM2 = [
  { k: 'cmd', p: P3, t0: 33.15, t1: 33.7, text: 'python main.py --serve' },
  { k: 'out', t: 33.85, h: '<span class="tg">INFO</span>     Loading agent graph from <span class="tw">agent.py</span>' },
  { k: 'out', t: 33.95, h: '<span class="tg">INFO</span>     Graph compiled: nodes=[reasoning, tools] edges=4 checkpointer=MemorySaver' },
  { k: 'out', t: 34.05, h: '<span class="tg">INFO</span>     Memory: chroma collection "agent_memory" (214 vectors)' },
  { k: 'out', t: 34.15, h: '<span class="tg">INFO</span>     Tools: web_search, save_note, write_report' },
  { k: 'out', t: 34.25, h: '<span class="tg">INFO</span>     Uvicorn running on <span class="tc">http://127.0.0.1:8000</span> (Press CTRL+C to quit)' },
  { k: 'out', t: 34.35, h: '<span class="tg">INFO</span>     Waiting for tasks…' },
  { k: 'out', t: 37.25, h: '' },
  { k: 'out', t: 37.25, h: '<span class="td">─────────────────────────────── task 7f3a91 ───────────────────────────────</span>' },
  { k: 'out', t: 37.3, h: L('10:42:07', 'TASK', 'tc', '<span class="tw">"Research three competitors and create a summary report."</span>') },
  { k: 'out', t: 37.55, h: L('10:42:07', 'NODE', 'tm', 'reasoning    ▸ planning (step 1/12)') },
  { k: 'out', t: 37.85, h: L('10:42:08', 'PLAN', 'ty', '1) find competitors  2) research each  3) compare  4) write report') },
  { k: 'out', t: 38.05, h: L('10:42:08', 'DECIDE', 'tb', '→ tools') },
  { k: 'out', t: 38.15, h: L('10:42:08', 'TOOL', 'tg', 'web_search(query="leading AI assistant platforms 2026")') },
  { k: 'fn', t: 38.2, f: t => { const p = prog(t, 38.2, 38.7), k = Math.round(p * 24); return `                  <span class="${p < 1 ? 'tm' : 'tg'}">${'━'.repeat(k)}</span><span class="td">${'━'.repeat(24 - k)}</span> ${p < 1 ? 'searching…' : '<span class="tg">5 results · 0.84s</span>'}`; } },
  { k: 'out', t: 38.8, h: L('10:42:09', 'MEM', 'ty', 'save_note("competitors: Nimbus AI, Coreline, Parallax Labs")') },
  { k: 'out', t: 39.0, h: L('10:42:09', 'NODE', 'tm', 'reasoning    ▸ step 3/12 · parallel tool calls') },
  { k: 'fn', t: 39.15, f: t => L('10:42:09', 'TOOL', 'tg', 'web_search(query="Nimbus AI pricing, features")'.padEnd(56)) + ST(t, 39.15, 39.5) },
  { k: 'fn', t: 39.3, f: t => L('10:42:10', 'TOOL', 'tg', 'web_search(query="Coreline product strategy")'.padEnd(56)) + ST(t, 39.3, 39.75) },
  { k: 'fn', t: 39.45, f: t => L('10:42:10', 'TOOL', 'tg', 'web_search(query="Parallax Labs customers, funding")'.padEnd(56)) + ST(t, 39.45, 40.0) },
  { k: 'out', t: 40.15, h: L('10:42:11', 'NODE', 'tm', 'reasoning    ▸ analyzing 15 sources') },
  { k: 'out', t: 40.6, h: L('10:42:12', 'MEM', 'ty', 'save_note("matrix: focus · pricing · differentiators")') },
  { k: 'out', t: 40.9, h: L('10:42:12', 'DECIDE', 'tb', '→ tools') },
  { k: 'fn', t: 41.0, f: t => L('10:42:12', 'TOOL', 'tg', 'write_report(title="Competitor Summary Report", sections=4)  ') + ST(t, 41.0, 41.6) },
  { k: 'out', t: 41.8, h: L('10:42:13', 'NODE', 'tm', 'reasoning    ▸ verifying citations … ok') },
  { k: 'out', t: 42.2, h: L('10:42:13', 'DECIDE', 'tb', '→ END') },
  { k: 'out', t: 42.4, h: L('10:42:13', 'DONE', 'tg', '<span class="tg">7 steps · 6 tool calls · 18.4s · 9,812 tokens</span>') },
  { k: 'out', t: 42.5, h: '<span class="tg">INFO</span>     127.0.0.1:52814 - "POST /api/tasks HTTP/1.1" <span class="tg">200 OK</span>' },
];
const CPROMPT = 'Research three competitors and create a summary report.';
const CSTEPS = [
  ['Planning the task', 37.3, 38.0],
  ['Searching the web', 38.05, 40.0],
  ['Analyzing 15 sources', 40.1, 40.95],
  ['Writing the report', 41.0, 41.65],
  ['Verifying citations', 41.75, 42.35],
];
function renderTest(t) {
  let term = renderTerm(TERM2, t, 47);
  if (t >= 37.3 && t < 42.4) {
    const step = Math.min(7, 1 + Math.floor((t - 37.3) / 0.75));
    term += `\n\n<span class="tm">${'◐◓◑◒'[Math.floor(t * 8) % 4]}</span> agent running · step ${step}/12 · elapsed ${((t - 37.3) * 3.6).toFixed(1)}s`;
  }
  $('term2').innerHTML = term;
  // chat input
  const focus = t >= 34.3 && t < 37.1;
  $('cinput').classList.toggle('focus', focus);
  const n = typeN(t, 34.55, 36.8, CPROMPT.length);
  let it = '';
  if (t >= 37.1) it = '<span class="ph">Ask the agent to do something…</span>';
  else if (n > 0) it = esc(CPROMPT.slice(0, n)) + (focus && (t < 36.9 || blink(t)) ? CARET : '');
  else it = (focus && blink(t) ? CARET : '') + '<span class="ph">Ask the agent to do something…</span>';
  $('ctext').innerHTML = it;
  $('csend').style.background = n >= CPROMPT.length && t < 37.15 ? '#6d5dfc' : '#2a2f3e';
  // messages
  let m = '';
  if (t >= 37.12) {
    const u = easeOut(prog(t, 37.12, 37.3));
    m += `<div class="ubub" style="opacity:${u};transform:translateY(${(1 - u) * 10}px)">${CPROMPT}</div>`;
  }
  if (t >= 37.3) {
    m += '<div class="abub"><div style="font-size:12.5px;color:#8b93a8;margin-bottom:6px">AGENT · autonomous run</div>';
    for (const [lab, a, b] of CSTEPS) {
      if (t < a - 0.15) continue;
      const ic = t >= b ? '<span class="chk">✓</span>' : t >= a ? `<span class="spin" style="transform:rotate(${t * 720}deg)"></span>` : '<span class="pend"></span>';
      let extra = '';
      if (lab.startsWith('Searching')) { const q = [38.7, 39.5, 39.75, 40.0].filter(x => t >= x).length; extra = ` <span style="color:#7d86a0;font-family:JBM,monospace;font-size:12.5px">${q}/4 queries</span>`; }
      m += `<div class="step" style="color:${t >= a ? '#e2e6f0' : '#6b7286'}">${ic}${lab}${extra}</div>`;
    }
    if (t >= 41.7) {
      const r = s => `opacity:${prog(t, s, s + 0.2)};transform:translateY(${(1 - easeOut(prog(t, s, s + 0.2))) * 6}px)`;
      m += `<div class="rep" style="margin-top:14px;border-top:1px solid #252a37;padding-top:14px">
      <h3 style="${r(41.75)}">Competitor Summary Report</h3>
      <table><tr style="${r(41.85)}"><th>Competitor</th><th>Focus</th><th>Pricing</th><th>Key edge</th></tr>
      <tr style="${r(42.0)}"><td><b>Nimbus AI</b></td><td>Enterprise copilots</td><td>$30 / seat / mo</td><td>Deep office-suite integration</td></tr>
      <tr style="${r(42.2)}"><td><b>Coreline</b></td><td>Workflow automation</td><td>Usage-based</td><td>400+ connectors</td></tr>
      <tr style="${r(42.4)}"><td><b>Parallax Labs</b></td><td>Research agents</td><td>$49 / mo</td><td>Citation accuracy</td></tr></table>
      <div style="${r(42.6)};font-weight:600;color:#fff;margin-bottom:6px">Key takeaways</div><ul>
      <li style="${r(42.75)}">Pricing is converging on per-seat plans with usage add-ons.</li>
      <li style="${r(42.95)}">Integrations, not model quality, are the main differentiator.</li>
      <li style="${r(43.15)}">Opportunity: verifiable research with built-in citations.</li></ul>
      <div class="src" style="${r(43.4)}">✓ Completed in 7 steps · 6 tool calls · 18.4s &nbsp;·&nbsp; 15 sources &nbsp;·&nbsp; saved to memory</div></div>`;
    }
    m += '</div>';
  }
  $('cmsgs').innerHTML = m;
}

/* ============================= DASHBOARD ============================= */
const DPROMPT = "Analyze this week's support tickets and draft an action plan";
const DSTEPS = [
  ['Understand the request', 'reasoning · plan(6 steps)', 49.05, 49.4, '0.4s', null],
  ['Recall related context', 'memory.search(k=4) → 4 notes', 49.4, 49.8, '0.6s', 3],
  ['Fetch support tickets', 'tickets_api.fetch(range="7d") → 312', 49.8, 50.4, '1.9s', 1],
  ['Cluster issues by theme', 'python.run("cluster.py") → 6 themes', 50.4, 51.0, '2.3s', 2],
  ['Draft the action plan', 'llm.generate(plan, context)', 51.0, 51.7, '3.1s', null],
  ['Save & share the report', 'docs.write("action-plan.md")', 51.7, 52.2, '0.5s', 4],
];
const DTOOLS = [['Web Search', 12], ['Tickets API', 4], ['Python Sandbox', 9], ['Vector Memory', 31], ['Docs Writer', 7]];
const DOUT = [
  ['h4', 'Action plan — support tickets, week 41'],
  ['li', 'Login failures (38%) — ship SSO session fix · owner: Platform'],
  ['li', 'Billing questions (24%) — add invoice FAQ and in-app tooltip'],
  ['li', 'Slow exports (17%) — move CSV export to a background job'],
  ['li', 'Review progress Friday · tasks created in the tracker'],
];
const spark = (pts, col) => `<svg width="110" height="36" viewBox="0 0 110 36"><polyline fill="none" stroke="${col}" stroke-width="2" points="${pts.map((v, i) => `${i * 110 / (pts.length - 1)},${34 - v * 30}`).join(' ')}"/></svg>`;
function renderDash(t) {
  const done = t >= 52.2;
  const calls = 942 + DSTEPS.filter(s => s[5] !== null && t >= s[3]).length + (t >= 52.2 ? 3 : 0);
  const K = [
    ['Tasks completed', done ? '129' : '128', '+12% vs last week', [.2, .35, .3, .5, .45, .6, .7, .65, .8, done ? .95 : .85]],
    ['Avg. steps / task', '6.4', 'autonomous', [.5, .4, .55, .5, .45, .5, .6, .55, .5, .52]],
    ['Tool calls today', String(calls), 'across 5 tools', [.1, .2, .3, .35, .5, .55, .6, .7, .8, .9]],
    ['Success rate', '98.2%', '+0.6 pts', [.8, .82, .79, .85, .86, .84, .88, .9, .89, .92]],
  ];
  $('kpis').innerHTML = K.map((k, i) => `<div class="card kpi" style="left:${32 + i * 409}px;width:389px;top:76px;height:112px"><div class="l">${k[0]}</div><div class="v">${k[1]}</div><div class="dlt">${k[2]}</div>${spark(k[3], ['#8b7bff', '#22d3ee', '#f59e0b', '#4ade80'][i])}</div>`).join('');
  const focus = t >= 46.8 && t < 48.9;
  $('dinput').classList.toggle('focus', focus);
  const n = typeN(t, 46.95, 48.55, DPROMPT.length);
  $('dtext').innerHTML = n > 0 ? esc(DPROMPT.slice(0, n)) + (focus && (t < 48.6 || blink(t)) ? CARET : '') : (focus && blink(t) ? CARET : '') + '<span style="color:#636b80">Describe a goal — e.g. “Summarize yesterday’s sales calls”</span>';
  const running = t >= 48.9 && !done;
  $('dbtn').innerHTML = running ? '<span class="spin" style="border-top-color:#fff;border-color:#ffffff55;border-top-color:#fff;transform:rotate(' + t * 720 + 'deg)"></span> Running…' : 'Run agent ▶';
  $('dbtn').style.background = t >= 48.88 && t < 49.0 ? '#5444e0' : running ? '#4a3fc0' : '#6d5dfc';
  let plan = '', k = 0;
  DSTEPS.forEach(([a, b2, s, e, dur], i) => {
    const appear = 49.0 + i * 0.07; if (t < appear) return;
    const st = t >= e ? 'd' : t >= s ? 'r' : 'q'; if (t >= e) k++;
    const lab = { q: 'Queued', r: 'Running', d: 'Done' }[st];
    const u = easeOut(prog(t, appear, appear + 0.2));
    plan += `<div class="ps" style="opacity:${u};transform:translateX(${(1 - u) * -12}px)"><div class="num" style="${st === 'd' ? 'background:#0f2a1c;color:#6ee7a0' : st === 'r' ? 'background:#272152;color:#c9bcff' : ''}">${st === 'd' ? '✓' : i + 1}</div><div class="tx"><div class="a">${a}</div><div class="b2">${b2}</div></div><span class="chip ${st}">${st === 'r' ? '● ' : ''}${lab}</span><span class="dur">${st === 'd' ? dur : st === 'r' ? '…' : ''}</span></div>`;
  });
  $('dplan').innerHTML = plan;
  $('dprog').style.width = (t < 49 ? 0 : (k + (DSTEPS.find(s => t >= s[2] && t < s[3]) ? prog(t, ...DSTEPS.find(s => t >= s[2] && t < s[3]).slice(2, 4)) : 0)) / 6 * 100) + '%';
  $('dplansub').textContent = t < 49 ? 'Waiting for a task' : done ? 'Completed · 6 steps · 8.8s' : `Running · step ${Math.min(6, k + 1)} of 6`;
  $('dtools').innerHTML = DTOOLS.map(([nm, c], i) => {
    const s = DSTEPS.find(x => x[5] === i && t >= x[2] && t < x[3] + 0.1);
    const used = DSTEPS.filter(x => x[5] === i && t >= x[3]).length;
    return `<div class="tool${s ? ' act' : ''}"><i></i>${nm}<span class="u">${s ? 'in use…' : (c + used) + ' calls today'}</span></div>`;
  }).join('');
  // output
  let out = '';
  if (t >= 51.15) {
    const total = DOUT.reduce((a, x) => a + x[1].length, 0);
    let left = typeN(t, 51.15, 52.3, total);
    let lis = '';
    for (const [tag, s] of DOUT) {
      if (left <= 0) break; const part = s.slice(0, left); left -= s.length;
      if (tag === 'h4') out += `<h4>${esc(part)}</h4>`; else lis += `<li>${esc(part)}</li>`;
    }
    out += `<ul>${lis}</ul>`;
    if (t >= 52.3) out += `<div style="margin-top:12px;font-size:12.5px;color:#7d86a0">✓ Saved to action-plan.md · shared with #support-leads</div>`;
  } else out = '<div style="color:#5d6478;font-size:14px">The agent’s result will appear here.</div>';
  $('dout').innerHTML = out;
  $('doutsub').textContent = t >= 52.3 ? 'action-plan.md' : t >= 51.15 ? 'streaming…' : '—';
}

/* ============================= CAMERA / CURSOR / OVERLAYS ============================= */
const CAM = [
  { t: 0, s: 1, x: 960, y: 540 }, { t: 3.2, s: 1, x: 960, y: 540 },
  { t: 4.1, s: 1.55, x: 900, y: 880 }, { t: 6.2, s: 1.55, x: 900, y: 880 },
  { t: 6.9, s: 1, x: 960, y: 540 }, { t: 7.6, s: 1.38, x: 760, y: 380 }, { t: 10.6, s: 1.38, x: 760, y: 460 },
  { t: 11.3, s: 1, x: 960, y: 540 }, { t: 12.0, s: 1.32, x: 800, y: 380 }, { t: 14.3, s: 1.32, x: 800, y: 420 },
  { t: 14.95, s: 1, x: 960, y: 540 }, { t: 15.5, s: 1.32, x: 820, y: 400 }, { t: 17.3, s: 1.32, x: 820, y: 520 },
  { t: 17.75, s: 1, x: 960, y: 540 }, { t: 18.5, s: 1.42, x: 860, y: 640 }, { t: 21.7, s: 1.42, x: 860, y: 640 },
  { t: 22.2, s: 1, x: 960, y: 540 }, { t: 28.4, s: 1, x: 960, y: 540 },
  { t: 29.2, s: 1.4, x: 950, y: 570 }, { t: 31.6, s: 1.4, x: 1010, y: 550 }, { t: 32.4, s: 1, x: 960, y: 540 },
  { t: 33.6, s: 1, x: 960, y: 540 }, { t: 34.3, s: 1.4, x: 1420, y: 900 }, { t: 37.1, s: 1.4, x: 1440, y: 900 },
  { t: 37.9, s: 1.38, x: 480, y: 380 }, { t: 41.0, s: 1.38, x: 480, y: 480 },
  { t: 41.7, s: 1.35, x: 1430, y: 560 }, { t: 45.0, s: 1.35, x: 1430, y: 600 }, { t: 45.8, s: 1, x: 960, y: 540 },
  { t: 46.2, s: 1, x: 960, y: 540 }, { t: 46.9, s: 1.38, x: 900, y: 360 }, { t: 48.9, s: 1.38, x: 1100, y: 360 },
  { t: 49.6, s: 1, x: 960, y: 540 }, { t: 52.4, s: 1, x: 960, y: 540 },
  { t: 53.0, s: 1, x: 960, y: 540 }, { t: 56.85, s: 1.09, x: 932, y: 558, lin: true }, { t: 57.25, s: 1, x: 960, y: 540 }, { t: 62, s: 1.05, x: 960, y: 560, lin: true },
];
// cursor keyframes (c = click)
const CUR = [
  { t: 0, x: 1250, y: 620 }, { t: 0.55, x: 1100, y: 900 }, { t: 6.3, x: 1060, y: 905 },
  { t: 6.9, x: 118, y: 172 }, { t: 7.0, x: 118, y: 172, c: 1 }, { t: 7.5, x: 1150, y: 520 }, { t: 11.05, x: 1150, y: 520 },
  { t: 11.45, x: 122, y: 238 }, { t: 11.55, x: 122, y: 238, c: 1 }, { t: 11.95, x: 1250, y: 600 }, { t: 14.5, x: 1250, y: 600 },
  { t: 14.85, x: 112, y: 282 }, { t: 14.95, x: 112, y: 282, c: 1 }, { t: 15.35, x: 1250, y: 640 }, { t: 17.3, x: 1250, y: 640 },
  { t: 17.62, x: 372, y: 77 }, { t: 17.7, x: 372, y: 77, c: 1 }, { t: 18.15, x: 1300, y: 760 }, { t: 22.3, x: 1300, y: 760 },
];
// graph scene: drag nodes from palette, then draw edges
NODES.forEach((n, i) => {
  const P = PAL(i);
  CUR.push({ t: n.pick - 0.02, x: P.x, y: P.y }, { t: n.pick, x: P.x, y: P.y, c: 1 }, { t: n.drop, x: n.x - 60, y: n.y });
});
EDGES.forEach(e => {
  const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path'); tmp.setAttribute('d', e.d);
  document.querySelector('#gsvg').appendChild(tmp); const len = tmp.getTotalLength();
  const p0 = tmp.getPointAtLength(0);
  CUR.push({ t: e.t0 - 0.02, x: p0.x, y: p0.y }, { t: e.t0, x: p0.x, y: p0.y, c: 1 });
  for (let k = 1; k <= 10; k++) { const p = tmp.getPointAtLength(len * k / 10); CUR.push({ t: e.t0 + (e.t1 - e.t0) * k / 10, x: p.x, y: p.y, lin: true }); }
  tmp.remove();
});
CUR.push({ t: 27.85, x: 1478, y: 126 }, { t: 28.0, x: 1478, y: 126, c: 1 }, { t: 28.5, x: 1380, y: 900 }, { t: 33.0, x: 1420, y: 880 },
  { t: 34.2, x: 1380, y: 1010 }, { t: 34.3, x: 1380, y: 1010, c: 1 }, { t: 36.85, x: 1380, y: 1010 },
  { t: 37.05, x: 1855, y: 1010 }, { t: 37.1, x: 1855, y: 1010, c: 1 }, { t: 37.7, x: 1700, y: 860 }, { t: 46.1, x: 1300, y: 760 },
  { t: 46.7, x: 760, y: 372 }, { t: 46.8, x: 760, y: 372, c: 1 }, { t: 48.6, x: 760, y: 372 },
  { t: 48.8, x: 1762, y: 372 }, { t: 48.88, x: 1762, y: 372, c: 1 }, { t: 49.5, x: 1560, y: 1010 }, { t: 52.6, x: 1600, y: 1020 }, { t: 56.55, x: 1640, y: 960 },
  { t: 57.0, x: 360, y: 1020 }, { t: 57.05, x: 360, y: 1020, c: 1 }, { t: 58.02, x: 360, y: 1020 }, { t: 58.15, x: 667, y: 1031 }, { t: 58.2, x: 667, y: 1031, c: 1 }, { t: 58.6, x: 640, y: 920 }, { t: 62, x: 650, y: 925 });
CUR.sort((a, b) => a.t - b.t);
const CLICKS = CUR.filter(k => k.c);

const CHAPTERS = [[0.35, 2.9, '01', 'Setting up the agent'], [11.2, 13.6, '02', 'Building the agent’s brain'], [22.35, 24.8, '03', 'Connecting the workflow'], [33.3, 35.7, '04', 'Testing the agent'], [46.2, 48.6, '05', 'Agentic AI comes alive']];
const SPEED = [[0.7, 6.3, '8×'], [7.2, 10.8, '8×'], [11.8, 14.4, '8×'], [15.1, 17.4, '8×'], [18.0, 21.8, '8×'], [22.5, 27.6, '4×']];

function seek(t) {
  // scenes
  const S = {
    'code': fadeWin(t, -1, 22.25),
    'graph': Math.max(fadeWin(t, 22.0, 33.25), fadeWin(t, 52.65, 57.15)),
    'gen': fadeWin(t, 56.8, 99),
    'test': fadeWin(t, 33.0, 46.25),
    'dash': fadeWin(t, 46.0, 53.0),
  };
  const Z = { code: 1, graph: t > 50 ? 5 : 2, test: 3, dash: 4, gen: 6 };
  for (const k in S) { const el = $('s-' + k); el.style.opacity = S[k]; el.style.zIndex = Z[k]; el.style.display = S[k] > 0 ? 'block' : 'none'; }
  if (S.code > 0) renderVSCode(t);
  if (S.graph > 0) renderGraph(t);
  if (S.test > 0) renderTest(t);
  if (S.dash > 0) renderDash(t);
  if (S.gen > 0) renderGen(t);
  // clock (timelapse)
  const mins = 12 + Math.floor(t * 1.0); $('clock').textContent = `Wed Oct 14  ${10 + Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
  // camera
  const c = kf(CAM, t, ['s', 'x', 'y']);
  const s = c.s, x = clamp(c.x, 960 / s, 1920 - 960 / s), y = clamp(c.y, 540 / s, 1080 - 540 / s);
  $('cam').style.transform = `translate(${960 - x * s}px,${540 - y * s}px) scale(${s})`;
  // cursor
  const p = kf(CUR, t, ['x', 'y']);
  $('cursor').style.transform = `translate(${p.x - 2}px,${p.y - 2}px)`;
  $('cursor').style.opacity = 1 - prog(t, 61.5, 62);
  let rp = 0, rx = 0, ry = 0;
  for (const k of CLICKS) if (t >= k.t && t < k.t + 0.38) { rp = prog(t, k.t, k.t + 0.38); rx = k.x; ry = k.y; }
  const rip = $('ripple');
  rip.style.opacity = rp > 0 ? 0.9 * (1 - rp) : 0;
  rip.style.left = rx + 'px'; rip.style.top = ry + 'px'; rip.style.transform = `scale(${0.35 + rp * 0.9})`;
  // chapter chip
  let ch = null; for (const c2 of CHAPTERS) if (t >= c2[0] - 0.3 && t <= c2[1] + 0.3) ch = c2;
  const chip = $('chapter');
  if (ch) { const o = Math.min(prog(t, ch[0] - 0.3, ch[0]), 1 - prog(t, ch[1], ch[1] + 0.3)); chip.style.opacity = o; chip.style.transform = `translateY(${(1 - o) * 10}px)`; $('chn').textContent = ch[2]; $('cht').textContent = ch[3]; }
  else chip.style.opacity = 0;
  let sp = null; for (const w of SPEED) if (t >= w[0] && t <= w[1]) sp = w;
  $('speed').style.opacity = sp ? Math.min(prog(t, sp[0], sp[0] + 0.2), 1 - prog(t, sp[1] - 0.2, sp[1])) : 0;
  if (sp) $('speed').textContent = '▶▶ ' + sp[2];
  $('black').style.opacity = Math.max(1 - prog(t, 0, 0.35), prog(t, 61.4, 62));
  return true;
}
initGraph();
window.seek = seek; window.DUR = DUR;
seek(parseFloat(new URLSearchParams(location.search).get('t') || '0'));
