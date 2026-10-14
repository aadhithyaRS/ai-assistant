// player.js — live preview in a normal browser (not used when rendering frames).
//
//   index.html?play        → plays the whole video in real time, scaled to fit the window
//   index.html?play&from=22 → starts playing at 22 s
//   index.html?t=30         → freezes on the frame at 30 s (no playback)
//
// Keyboard (play mode): Space = pause/resume · ←/→ = seek 2 s · Home = restart · L = toggle loop
(function () {
  const q = new URLSearchParams(location.search);
  if (!q.has('play')) return;

  // Scale the fixed 1920×1080 stage to fit the browser window.
  document.documentElement.style.overflow = 'hidden';
  document.body.style.cssText += ';width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;background:#000';
  const stage = document.getElementById('stage');
  const fit = () => {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transformOrigin = 'center center';
    stage.style.position = 'relative';
    stage.style.width = '1920px'; stage.style.height = '1080px'; stage.style.flex = 'none';
    stage.style.transform = `scale(${s})`;
  };
  window.addEventListener('resize', fit); fit();

  // Small HUD with the current time.
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;font:12px/1.4 monospace;color:#cfd5e4;background:rgba(0,0,0,.6);padding:6px 10px;border-radius:6px';
  document.body.appendChild(hud);

  let t = parseFloat(q.get('from') || '0'), playing = true, loop = true, last = performance.now();
  function frame(now) {
    const dt = (now - last) / 1000; last = now;
    if (playing) { t += dt; if (t >= DUR) { t = loop ? 0 : DUR; if (!loop) playing = false; } }
    seek(t);
    hud.textContent = `${t.toFixed(2)}s / ${DUR}s  ${playing ? '▶' : '❚❚'}  loop:${loop ? 'on' : 'off'}  [space] pause  [←/→] seek  [home] restart`;
    requestAnimationFrame(frame);
  }
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { playing = !playing; e.preventDefault(); }
    if (e.code === 'ArrowRight') t = Math.min(DUR, t + 2);
    if (e.code === 'ArrowLeft') t = Math.max(0, t - 2);
    if (e.code === 'Home') t = 0;
    if (e.code === 'KeyL') loop = !loop;
  });
  document.fonts.ready.then(() => requestAnimationFrame(frame));
})();
