/* Projection Studios Player: plays direct video links (mp4/webm/m3u8 where the browser supports it) and YouTube links.
   Play / pause / seek are shared with everyone in the same Watch Together room. */
(() => {
  const E = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = s / 3600 | 0, m = (s % 3600) / 60 | 0, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const ytId = (u) => { const m = String(u).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/); return m ? m[1] : null; };
  const okUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:'; } catch { return false; } };

  let box, stage, titleEl, cur = null, applying = false, offKeys = null, ytTimer = null, hlsLoader = null;
  const isHls = (u) => /\.m3u8(?:[?#]|$)/i.test(String(u || ''));
  function loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (hlsLoader) return hlsLoader;
    hlsLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/hls.min.js'; // served from this site (copied from the hls.js npm package at deploy time)
      script.onload = () => window.Hls ? resolve(window.Hls) : reject(new Error('HLS.js failed to initialize'));
      script.onerror = () => reject(new Error('Could not load the HLS playback engine'));
      document.head.append(script);
    });
    return hlsLoader;
  }
  const P = { onSend: null, isHost: false };
  const send = (m) => { if (!applying && P.onSend) P.onSend(m); };
  const hold = (ms) => { applying = true; setTimeout(() => { applying = false; }, ms); };

  function ensure() {
    if (box) return;
    box = E('div', '', '<div class="shp-box"><div class="shp-head"><b id="shpT"></b><button id="shpX" aria-label="Close">✕</button></div><div id="shpS"></div></div>');
    box.id = 'shPlayer'; document.body.append(box); stage = box.querySelector('#shpS'); titleEl = box.querySelector('#shpT');
    box.querySelector('#shpX').onclick = close; box.addEventListener('click', (e) => { if (e.target === box) close(); });
  }
  function close() {
    if (!box) return;
    if (offKeys) { offKeys(); offKeys = null; }
    if (cur && cur.kind === 'anime') clearTimeout(cur.failTimer);
    clearInterval(ytTimer); if (cur && cur.tick) clearInterval(cur.tick); if (cur && cur.kind === 'video') { try { cur.v.pause(); if (cur.hls) cur.hls.destroy(); cur.v.removeAttribute('src'); cur.v.load(); } catch {} }
    if (cur && cur.kind === 'yt' && cur.yt && cur.yt.destroy) { try { cur.yt.destroy(); } catch {} }
    cur = null; stage.innerHTML = ''; box.classList.remove('open'); document.body.style.overflow = '';
  }
  const fail = (msg) => { stage.innerHTML = ''; stage.append(E('div', 'shp-msg', msg)); };

  function openVideo(src) {
    const wrap = E('div', 'shp-wrap'), v = E('video', 'shp-v'), bar = E('div', 'shp-bar');
    v.playsInline = true; v.preload = 'metadata';
    const btn = (t, title) => { const b = E('button', 'shp-b', t); b.title = title || ''; return b; };
    const pp = btn('▶', 'Play / pause'), back = btn('⏪ 10', 'Back 10 seconds'), fwd = btn('10 ⏩', 'Forward 10 seconds'), fs = btn('⛶', 'Fullscreen');
    const seek = E('input', 'shp-seek'); seek.type = 'range'; seek.min = 0; seek.max = 1000; seek.value = 0;
    const time = E('span', 'shp-time', '0:00 / 0:00'), vol = E('input', 'shp-vol'); vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.05; vol.value = 1;
    const spd = E('select', 'shp-spd'); [0.5, 0.75, 1, 1.25, 1.5, 2].forEach((s) => { const o = E('option', '', s + '×'); o.value = s; if (s === 1) o.selected = true; spd.append(o); });
    bar.append(pp, back, fwd, seek, time, vol, spd, fs); wrap.append(v, bar); stage.append(wrap);
    const toggle = () => (v.paused ? v.play().catch(() => {}) : v.pause());
    v.onclick = toggle; pp.onclick = toggle;
    v.onplay = () => { pp.textContent = '⏸'; send({ action: 'ctl', op: 'play', t: v.currentTime }); };
    v.onpause = () => { pp.textContent = '▶'; send({ action: 'ctl', op: 'pause', t: v.currentTime }); };
    v.onseeked = () => send({ action: 'ctl', op: 'seek', t: v.currentTime });
    v.ontimeupdate = () => { seek.value = v.duration ? v.currentTime / v.duration * 1000 : 0; time.textContent = fmt(v.currentTime) + ' / ' + fmt(v.duration); };
    v.onerror = () => fail('Could not play this video. Check that the link is a direct video file, an HLS (.m3u8) link, or a YouTube link, and that the host allows playing it here.');
    seek.oninput = () => { if (v.duration) v.currentTime = seek.value / 1000 * v.duration; };
    back.onclick = () => { v.currentTime = Math.max(0, v.currentTime - 10); }; fwd.onclick = () => { v.currentTime = Math.min(v.duration || 1e9, v.currentTime + 10); };
    vol.oninput = () => { v.volume = +vol.value; }; spd.onchange = () => { v.playbackRate = +spd.value; };
    fs.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : wrap.requestFullscreen && wrap.requestFullscreen());
    const kd = (e) => {
      if (/INPUT|SELECT/.test(e.target.tagName) && e.key !== ' ') return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight') v.currentTime += 5; else if (e.key === 'ArrowLeft') v.currentTime -= 5;
      else if (e.key === 'f') fs.onclick(); else if (e.key === 'm') v.muted = !v.muted; else if (e.key === 'Escape' && !document.fullscreenElement) close();
    };
    document.addEventListener('keydown', kd); offKeys = () => document.removeEventListener('keydown', kd);
    cur = { kind: 'video', v, hls: null, tick: setInterval(() => { if (P.isHost && !v.paused) send({ action: 'ctl', op: 'tick', t: v.currentTime, playing: true }); }, 3000) };
    const current = cur;
    if (isHls(src) && !v.canPlayType('application/vnd.apple.mpegurl')) {
      loadHls().then((Hls) => {
        if (cur !== current) return;
        if (!Hls.isSupported()) { fail('This browser cannot play HLS streams. Try Safari or another browser.'); return; }
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        current.hls = hls;
        hls.loadSource(src); hls.attachMedia(v);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data && data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else fail('The HLS stream could not be played. The host may be offline or may not allow playback here.');
          }
        });
      }).catch(() => { if (cur === current) fail('HLS playback support could not load. Try Safari or another browser.'); });
    } else { v.src = src; }
  }

  function openYT(id) {
    const make = () => {
      if (!box.classList.contains('open')) return;
      const holder = E('div'); holder.id = 'shpYT'; holder.className = 'shp-yt'; stage.append(holder);
      let last = 0; const c = { kind: 'yt' }; cur = c;
      c.yt = new YT.Player('shpYT', { videoId: id, width: '100%', height: '100%', playerVars: { rel: 0, modestbranding: 1, playsinline: 1 }, events: { onStateChange: (e) => {
        if (applying) return; const t = c.yt.getCurrentTime();
        if (e.data === 1) send({ action: 'ctl', op: 'play', t }); else if (e.data === 2) send({ action: 'ctl', op: 'pause', t });
      } } });
      ytTimer = setInterval(() => {
        if (!c.yt || !c.yt.getCurrentTime || !c.yt.getPlayerState) return; const t = c.yt.getCurrentTime(), st = c.yt.getPlayerState();
        if (applying) { last = t; return; }
        c.n = (c.n || 0) + 1; if (P.isHost && st === 1 && c.n % 6 === 0) send({ action: 'ctl', op: 'tick', t, playing: true });
        if ((st === 1 || st === 2) && Math.abs(t - last - (st === 1 ? 0.5 : 0)) > 1.5) send({ action: 'ctl', op: 'seek', t });
        last = t;
      }, 500);
    };
    if (window.YT && window.YT.Player) make();
    else { window.onYouTubeIframeAPIReady = make; if (!document.getElementById('shpYTapi')) { const s = E('script'); s.id = 'shpYTapi'; s.src = 'https://www.youtube.com/iframe_api'; document.head.append(s); } }
    const kd = (e) => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', kd); offKeys = () => document.removeEventListener('keydown', kd);
  }

  P.open = (src, title, o = {}) => {
    src = String(src || '').trim();
    const id = ytId(src);
    if (!id && !okUrl(src)) { alert('Please paste a secure link that starts with https://'); return false; }
    ensure(); close(); box.classList.add('open'); document.body.style.overflow = 'hidden';
    titleEl.textContent = String(title || 'Now playing').slice(0, 80) + (o.by ? '   ·   ' + o.by : '');
    if (id) openYT(id); else openVideo(src);
    if (!o.remote) send({ action: 'src', src, title: String(title || 'a video').slice(0, 80) });
    return true;
  };
  // MikazaAPI anime embed player. The API exposes AniList/MAL embeds and
  // posts time/complete events to the parent page (see https://mikaza.buzz/docs).
  const MIKA = 'https://mikaza.buzz';
  const getPref = (key, fallback) => { try { return localStorage.getItem('sh_mikaza_' + key) || fallback; } catch { return fallback; } };
  const setPref = (key, value) => { try { localStorage.setItem('sh_mikaza_' + key, String(value)); } catch {} };
  const animeUrl = (a, server) => {
    const lang = a.lang;
    if (server === 'haiku' && a.idMal) return `${MIKA}/embed/haiku/mal/${a.idMal}/${a.ep}/${lang}`;
    if (server === 'haiku') return `${MIKA}/embed/haiku/ani/${a.id}/${a.ep}/${lang}`;
    if (a.idMal && getPref('idtype', 'ani') === 'mal') return `${MIKA}/embed/${server}/mal/${a.idMal}/${a.ep}/${lang}`;
    return `${MIKA}/embed/${server}/ani/${a.id}/${a.ep}/${lang}`;
  };
  function renderAnime(a, server) {
    if (!cur || cur.kind !== 'anime') return;
    try { localStorage.setItem(`sh_mikaza_last_${a.id}`, JSON.stringify({ episode:a.ep, season:a.season, title:a.title })); } catch {}
    clearTimeout(cur.failTimer);
    cur.server = server;
    stage.innerHTML = '';
    const controls = E('div', 'shp-anime-controls');
    const serverLabel = E('label', '', 'SERVER ');
    const servers = E('select', 'shp-anime-select');
    [['auto','Auto'],['kira','Kira'],['haiku','Haiku'],['naoka','Naoka']].forEach(([v,t]) => { const o=E('option','',t); o.value=v; if(v===server)o.selected=true; servers.append(o); });
    const lang = E('button','shp-b',a.lang === 'dub' ? 'DUB' : 'SUB');
    const prev = E('button','shp-b','‹ Episode');
    const next = E('button','shp-b','Episode ›');
    const ep = E('span','shp-anime-ep',`S${a.season} · Episode ${a.ep}`);
    const retry = E('button','shp-b','Reload');
    serverLabel.append(servers); controls.append(serverLabel,lang,prev,ep,next,retry); stage.append(controls);
    const wrap = E('div','shp-anime-wrap');
    const frame = E('iframe','shp-anime-frame');
    frame.title = 'Mikaza anime player'; frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    frame.allowFullscreen = true;
    // Streaming providers may refuse sandboxed embeds; omit sandbox so playback can initialize.
    // Keep the normal origin-only referrer so providers that validate embed requests can initialize.
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    wrap.append(frame); stage.append(wrap); a.frame = frame;
    const actual = server === 'auto' ? (a.attempt % 3 === 0 ? 'naoka' : a.attempt % 3 === 1 ? 'kira' : 'haiku') : server;
    // Some providers validate the embedding origin/referrer. Do not sandbox the frame;
    // preserve the origin-only referrer and show recovery controls if the provider reports an error.
    frame.addEventListener('error', () => {
      if (cur !== a || a.frame !== frame) return;
      const msg = E('div', 'shp-msg');
      msg.textContent = 'Mikaza could not load this player. Try Reload or choose another server above.';
      wrap.replaceChildren(msg);
    }, { once: true });
    frame.src = animeUrl(a, actual);
    lang.onclick = () => { a.lang = a.lang === 'sub' ? 'dub' : 'sub'; setPref('lang',a.lang); a.attempt=0; renderAnime(a,a.server); };
    servers.onchange = () => { setPref('server',servers.value); a.attempt=0; renderAnime(a,servers.value); };
    prev.disabled = a.ep <= 1;
    prev.onclick = () => { if(a.ep>1){a.ep--;a.attempt=0;renderAnime(a,a.server);} };
    next.onclick = () => { a.ep++;a.attempt=0;renderAnime(a,a.server); };
    retry.onclick = () => { a.attempt=0; renderAnime(a,a.server); };
    // If Auto hasn't reported any playback progress after a generous startup
    // window, try the next documented server. Manual server selection is retained.
    if (a.server === 'auto' && a.attempt < 2) {
      a.failTimer = setTimeout(() => {
        if (cur === a && !a.gotProgress) { a.attempt++; renderAnime(a,'auto'); }
      }, 22000);
    }
  }
  P.openAnime = (media, episode = 1, season = 1) => {
    const id = Number(media && media.id), idMal = Number(media && media.idMal) || 0;
    if (!id && !idMal) { alert('This anime is missing its AniList/MAL ID.'); return false; }
    ensure(); close(); box.classList.add('open'); document.body.style.overflow='hidden';
    const title = (media.title && (media.title.english || media.title.romaji)) || media.name || 'Anime';
    titleEl.textContent = `${title} · S${season} E${episode} · MikazaAPI`;
    const a = { kind:'anime', id, idMal, title, ep:Math.max(1,Number(episode)||1), season:Math.max(1,Number(season)||1), lang:getPref('lang','sub'), server:getPref('server','auto'), attempt:0, gotProgress:false, frame:null, failTimer:null };
    cur = a; renderAnime(a,a.server);
    return true;
  };
  let animeProgressHandler = null;
  animeProgressHandler = (event) => {
    const a = cur;
    if (!a || a.kind !== 'anime' || event.origin !== 'https://mikaza.buzz' || !a.frame || event.source !== a.frame.contentWindow) return;
    let data = event.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
    if (!data || typeof data !== 'object') return;
    if (data.event === 'time' || data.event === 'watching-log') {
      a.gotProgress = true; clearTimeout(a.failTimer);
      const seconds = Number(data.time ?? data.currentTime);
      if (Number.isFinite(seconds) && seconds >= 0) {
        try { localStorage.setItem(`sh_mikaza_progress_${a.id}_${a.ep}_${a.lang}`, JSON.stringify({seconds,duration:Number(data.duration)||0,updatedAt:Date.now()})); } catch {}
      }
    } else if (data.event === 'complete') {
      a.ep++; a.attempt=0; renderAnime(a,a.server);
    }
  };
  window.addEventListener('message', animeProgressHandler);

  P.apply = (m) => {
    if (!cur || !m || typeof m.t !== 'number') return;
    if (cur.kind === 'video') {
      const v = cur.v; hold(700);
      if (m.op === 'tick') { if (Math.abs(v.currentTime - m.t) > 1.2) v.currentTime = m.t; if (m.playing && v.paused) v.play().catch(() => {}); return; }
      if (m.op === 'seek' || Math.abs(v.currentTime - m.t) > 1.5) v.currentTime = m.t;
      if (m.op === 'play') v.play().catch(() => {}); else if (m.op === 'pause') v.pause();
    } else if (cur.kind === 'yt' && cur.yt && cur.yt.seekTo) {
      hold(1200);
      if (m.op === 'tick') { if (Math.abs(cur.yt.getCurrentTime() - m.t) > 1.5) cur.yt.seekTo(m.t, true); if (m.playing && cur.yt.getPlayerState() !== 1) cur.yt.playVideo(); return; }
      if (m.op === 'seek' || Math.abs(cur.yt.getCurrentTime() - m.t) > 1.5) cur.yt.seekTo(m.t, true);
      if (m.op === 'play') cur.yt.playVideo(); else if (m.op === 'pause') cur.yt.pauseVideo();
    }
  };
  P.close = close; P._ytId = ytId;

  document.head.append(E('style', '', `
#shPlayer{position:fixed;inset:0;z-index:2600;background:rgba(0,0,0,.96);display:none;align-items:center;justify-content:center;padding:1.2vh 1vw}#shPlayer.open{display:flex}
.shp-box{width:98vw;height:97vh;max-width:none;max-height:97vh;color:#fff;display:flex;flex-direction:column;min-height:0}.shp-head{display:flex;flex:0 0 auto;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:17px;min-height:34px}.shp-head button{background:#333;color:#fff;border:0;border-radius:50%;width:34px;height:34px;cursor:pointer}
#shpS{flex:1;min-height:0;display:flex;flex-direction:column}.shp-wrap{position:relative;background:#000;border-radius:8px;overflow:hidden;flex:1;min-height:0}.shp-v{display:block;width:100%;height:100%;max-height:none;object-fit:contain;background:#000}
.shp-bar{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#141414;flex-wrap:wrap}.shp-b{background:#2a2a2a;color:#fff;border:0;border-radius:6px;padding:7px 11px;cursor:pointer;font-size:14px}.shp-b:hover{background:#3a3a3a}
.shp-seek{flex:1 1 220px;min-width:140px;accent-color:var(--sh-accent,#6d5efc)}.shp-vol{width:80px;accent-color:var(--sh-accent,#6d5efc)}.shp-time{font-variant-numeric:tabular-nums;font-size:13px;color:#ccc}.shp-spd{background:#2a2a2a;color:#fff;border:0;border-radius:6px;padding:6px}
.shp-yt{width:100%;aspect-ratio:16/9;background:#000;border-radius:8px;overflow:hidden}.shp-yt iframe{width:100%;height:100%;border:0}.shp-anime-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px;flex:0 0 auto}.shp-anime-controls label{font-size:10px;letter-spacing:.08em;color:#aaa;display:flex;align-items:center;gap:5px}.shp-anime-select{background:#222;color:#fff;border:1px solid #444;border-radius:6px;padding:7px}.shp-anime-ep{font-size:12px;color:#ccc}.shp-anime-wrap{width:100%;flex:1;min-height:0;aspect-ratio:auto;max-height:none;background:#000;border-radius:8px;overflow:hidden}.shp-anime-frame{display:block;width:100%;height:100%;min-height:0;border:0}.shp-msg{padding:60px 20px;text-align:center;background:#141414;border-radius:8px;color:#ddd}`));
  window.shPlayer = P;
})();
