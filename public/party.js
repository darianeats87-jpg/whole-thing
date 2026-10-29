/* Watch Party: the host picks something to watch, creates a lobby, shares the code and presses Start.
   Everyone's player opens together. Links and YouTube play in the Projection Studios Player, where play, pause and
   skipping are mirrored for everybody. TMDB titles play in the embedded player: we start together and stay on
   the same episode, but that player cannot be remote-controlled. */
(() => {
  const $ = (id) => document.getElementById(id);
  const E = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const H = window.shAppH; if (!H) return;
  const esc = H.esc;
  let lobby = null, members = [], you = '', tab = 'host', pick = null, pending = null, bound = null, active = false, announced = '', searchT = null;
  const code = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random() * 32 | 0]).join('');
  const box = () => document.querySelector('#shWatch .sh-box');
  const isHost = () => !!(lobby && lobby.hostCid === you);
  const avatar = (u) => (u.pic && u.pid ? '<img src="/api/pic/' + u.pid + '?v=1" alt="">' : H.av(u.avatar));
  const head = '<button class="sh-small" style="float:right" onclick="shClose(\'shWatch\')">✕</button><h2>Watch Party</h2>';
  const tail = '<input id="shRoomCode" type="hidden"><p id="shWatchStatus" class="sh-note"></p>';
  const kindLabel = (m) => (m.kind === 'link' ? 'Link' : m.type === 'tv' ? 'Series · S' + (m.season || 1) + ' E' + (m.episode || 1) : 'Movie');

  /* ----- picker (host) / join ----- */
  function renderPicker() {
    const b = box(); if (!b) return;
    b.innerHTML = head + '<div class="pt-tabs"><button data-t="host" class="' + (tab === 'host' ? 'on' : '') + '">Host a party</button><button data-t="join" class="' + (tab === 'join' ? 'on' : '') + '">Join a party</button></div><div id="ptBody"></div>' + tail;
    b.querySelectorAll('[data-t]').forEach((x) => { x.onclick = () => { tab = x.dataset.t; renderPicker(); }; });
    const body = $('ptBody');
    if (tab === 'join') {
      body.innerHTML = '<p class="sh-note">Enter the lobby code your friend gave you.</p><input id="ptCode" placeholder="e.g. K7M2QX" maxlength="40" style="text-transform:uppercase"><div class="sh-line"><button class="sh-small sh-yes" id="ptJoin">Join lobby</button></div>';
      const go = () => { const c = $('ptCode').value.trim().toUpperCase(); if (!c) return; H.joinRoom(c); $('shWatchStatus').textContent = 'Joining “' + c + '”…'; };
      $('ptJoin').onclick = go; $('ptCode').onkeydown = (e) => { if (e.key === 'Enter') go(); }; return;
    }
    body.innerHTML = '<p class="sh-note"><b>1.</b> Pick what to watch. Anime, shows and movies all work: search the title.</p><input id="ptQ" placeholder="Search anime, shows, movies…"><div id="ptRes" class="pt-res"></div><details style="margin:8px 0"><summary class="sh-note" style="cursor:pointer">Or use a link (best sync: play, pause and skip are mirrored)</summary><input id="ptLink" placeholder="Direct video link or YouTube link"><input id="ptLinkTitle" placeholder="Title (optional)"><div class="sh-line"><button class="sh-small" id="ptLinkUse">Use this link</button></div></details><div id="ptPicked"></div><div class="sh-line"><button class="sh-small sh-yes" id="ptCreate" disabled>Create lobby</button></div>';
    $('ptQ').oninput = () => { clearTimeout(searchT); searchT = setTimeout(search, 350); };
    $('ptLinkUse').onclick = () => { const src = $('ptLink').value.trim(); if (!/^https?:\/\//i.test(src)) { H.toast('Paste a link that starts with http:// or https://'); return; } pick = { kind: 'link', src, title: $('ptLinkTitle').value.trim() || 'Shared video' }; showPicked(); };
    $('ptCreate').onclick = create; showPicked();
  }
  async function search() {
    const q = ($('ptQ') || {}).value || ''; const res = $('ptRes'); if (!res) return; if (q.trim().length < 2) { res.innerHTML = ''; return; }
    res.innerHTML = '<p class="sh-note">Searching…</p>';
    try {
      const d = await H.tmdb('search/multi?query=' + encodeURIComponent(q.trim())); const list = (d.results || []).filter((x) => x.media_type === 'tv' || x.media_type === 'movie').slice(0, 8);
      res.innerHTML = ''; if (!list.length) res.innerHTML = '<p class="sh-note">Nothing found.</p>';
      list.forEach((x) => { const t = x.title || x.name, yr = (x.release_date || x.first_air_date || '').slice(0, 4); const r = E('div', 'r', '<img alt="" ' + (x.poster_path ? 'src="https://image.tmdb.org/t/p/w92' + x.poster_path + '"' : '') + '><div><b>' + esc(t) + '</b><br><small style="color:#aaa">' + (x.media_type === 'tv' ? 'Series' : 'Movie') + (yr ? ' · ' + yr : '') + '</small></div>'); r.onclick = () => choose(x); res.append(r); });
    } catch (e) { res.innerHTML = '<p class="sh-note">' + esc(e.message) + '</p>'; }
  }
  async function choose(x) {
    pick = { kind: 'tmdb', id: x.id, type: x.media_type, title: x.title || x.name, poster: x.poster_path || null, season: 1, episode: 1, seasons: 1 };
    if (x.media_type === 'tv') { try { const d = await H.tmdb('tv/' + x.id); pick.seasons = Math.max(1, d.number_of_seasons || 1); } catch {} }
    showPicked();
  }
  function showPicked() {
    const el = $('ptPicked'), btn = $('ptCreate'); if (!el) return; if (!pick) { el.innerHTML = ''; if (btn) btn.disabled = true; return; }
    el.innerHTML = '<div class="pt-pick">' + (pick.poster ? '<img alt="" src="https://image.tmdb.org/t/p/w185' + pick.poster + '">' : '<div style="width:56px;height:80px;border-radius:6px;background:#333;display:flex;align-items:center;justify-content:center;font-size:24px">🔗</div>') + '<div><b>' + esc(pick.title) + '</b><br><small style="color:#aaa">' + (pick.kind === 'link' ? 'Link' : pick.type === 'tv' ? 'Series' : 'Movie') + '</small>' + (pick.kind === 'tmdb' && pick.type === 'tv' ? '<div style="margin-top:6px;font-size:13px">Season <input type="number" id="ptS" min="1" max="' + pick.seasons + '" value="' + pick.season + '"> Episode <input type="number" id="ptE" min="1" value="' + pick.episode + '"></div>' : '') + '</div></div>';
    const s = $('ptS'), e = $('ptE'); if (s) s.oninput = () => { pick.season = Math.max(1, Number(s.value) || 1); }; if (e) e.oninput = () => { pick.episode = Math.max(1, Number(e.value) || 1); };
    if (btn) btn.disabled = false;
  }
  function create() { if (!pick) return; pending = { ...pick }; const c = code(); H.joinRoom(c); const st = $('shWatchStatus'); if (st) st.textContent = 'Creating lobby…'; }

  /* ----- lobby ----- */
  function renderLobby() {
    const b = box(); if (!b || !lobby) return; const m = lobby.media, host = isHost(), c = H.getRoom();
    const mem = members.map((u) => '<div class="pl-m"><div class="su-av">' + avatar(u) + '</div>' + esc(u.displayName) + (u.cid === lobby.hostCid ? ' 👑' : '') + '</div>').join('');
    const note = m.kind === 'link' ? 'Controls are shared: play, pause and skipping stay in sync for everyone. If one person skips 10 seconds, everyone jumps to the same spot.' : 'This title plays in the embedded player. Everyone starts together and follows the same episode, but that player cannot be remote-controlled, so pause and skip are not mirrored. Use a link for perfectly synced controls.';
    b.innerHTML = head + '<p class="sh-note">Share this code with your friends:</p><div class="pl-code">' + esc(c) + '</div><div class="pt-pick">' + (m.poster ? '<img alt="" src="https://image.tmdb.org/t/p/w185' + m.poster + '">' : '<div style="width:56px;height:80px;border-radius:6px;background:#333;display:flex;align-items:center;justify-content:center;font-size:24px">🔗</div>') + '<div><b>' + esc(m.title) + '</b><br><small style="color:#aaa">' + esc(kindLabel(m)) + '</small></div></div><label>In the lobby (' + members.length + ')</label><div class="pl-members">' + mem + '</div><p class="sh-note">' + note + '</p><div class="sh-line" style="flex-wrap:wrap">' +
      (host ? (lobby.started ? '<button class="sh-small sh-yes" id="plStart">▶ Open the player</button>' : '<button class="sh-small sh-yes" id="plStart">▶ Start party</button>') + '<button class="sh-small" id="plEnd">End lobby</button>' : (lobby.started ? '<button class="sh-small sh-yes" id="plJoin">▶ Join the party now</button>' : '<span class="sh-note">Waiting for the host to start…</span>')) +
      '<button class="sh-small" id="plCopy">Copy invite link</button><button class="sh-small" id="plLeave">Leave</button></div><div class="pt-extras"><div><b>Reactions</b> '+['❤️','😂','🔥','👏','😮','🍿'].map(x=>'<button class="sh-small" data-react="'+x+'">'+x+'</button>').join(' ')+'</div><div class="sh-line"><button class="sh-small" id="plReady">✓ I’m ready</button><button class="sh-small" id="plVoteStart">🗳 Pick what to watch</button><button class="sh-small" id="plSchedule">⏱ Schedule party</button></div><div id="ptExtraStatus" class="sh-note"></div><div id="ptVoteOptions" class="sh-line"></div></div>' + tail;
    const on = (i, f) => { const x = $(i); if (x) x.onclick = f; }; const s = H.getSocket();
    on('plStart', () => { if (lobby.started) startParty(lobby.media); else s.emit('lobby:start'); });
    on('plEnd', () => s.emit('lobby:end'));
    on('plJoin', () => startParty(lobby.media));
    on('plCopy', async () => { const link = location.origin + '/?room=' + encodeURIComponent(c); try { await navigator.clipboard.writeText(link); H.toast('Invite link copied'); } catch { prompt('Copy this invite link:', link); } });
    on('plLeave', () => { H.leaveRoom(); lobby = null; members = []; active = false; renderPicker(); });
    b.querySelectorAll('[data-react]').forEach(x=>x.onclick=()=>s.emit('party:reaction',{emoji:x.dataset.react}));
    on('plReady',()=>{s.emit('party:ready',{ready:true});const z=$('ptExtraStatus');if(z)z.textContent='You are marked ready.'});
    on('plVoteStart',()=>{if(!host){H.toast('Ask the host to start a vote.');return}const raw=prompt('Enter 2–4 titles separated by |');if(!raw)return;const options=raw.split('|').map(x=>x.trim()).filter(Boolean).slice(0,4);if(options.length<2){H.toast('Enter at least two titles.');return}s.emit('party:vote-start',{options})});
    on('plSchedule',()=>{const raw=prompt('Schedule party start (minutes from now, 1–10080):','30');const mins=Number(raw);if(!Number.isFinite(mins)||mins<1||mins>10080)return;s.emit('party:schedule',{at:Date.now()+mins*60000,title:lobby.media.title});});
  }
  function startParty(m) {
    active = true; window.shClose('shWatch');
    if (m.kind === 'link') { window.shPlayer.isHost = isHost(); window.shPlayer.open(m.src, m.title, { remote: true }); }
    else { window.shPlayer.isHost = false; window.openPlayer(m.id, m.title, m.type, m.season || 1, m.episode || 1, m.seasons || 1); }
  }
  function follow(m) {
    if (m.action === 'src' && m.src) window.shPlayer.open(m.src, m.title, { remote: true });
    else if (m.action === 'play' && m.mediaId) window.openPlayer(m.mediaId, m.title, m.mediaType, m.season || 1, m.episode || 1, m.seasons || (lobby && lobby.media && lobby.media.seasons) || 10);
  }

  /* ----- wiring ----- */
  function bind() {
    const s = H.getSocket(); if (!s || bound === s) return; bound = s;
    s.on('connect', () => { lobby = null; members = []; active = false; announced = ''; const b = box(); if (b && !pending) renderPicker(); if (pending) { s.emit('lobby:create', { media: pending }); pending = null; } });
    s.on('lobby:state', (d) => {
      lobby = d.lobby; members = d.members || []; you = d.you || you;
      if (!lobby) { if (box() && box().querySelector('.pl-code')) renderPicker(); return; }
      renderLobby();
      const key = H.getRoom(); if (announced !== key) { announced = key; const p = $('shWatch'); if (p && !p.classList.contains('open')) window.shOpen('shWatch'); }
    });
    s.on('party:start', (d) => startParty(d.media));
    s.on('party:reaction',d=>{const el=E('div','pt-reaction',d.emoji);document.body.append(el);const player=document.getElementById('playerContainer');if(player&&player.getBoundingClientRect().width>0){const r=player.getBoundingClientRect();el.style.left=(r.left+Math.random()*Math.max(1,r.width-50))+'px';el.style.bottom=(innerHeight-r.bottom+Math.max(12,r.height*.08))+'px'}else el.style.left=(18+Math.random()*64)+'%';setTimeout(()=>el.remove(),2400)});
    s.on('party:ready',d=>{const z=$('ptExtraStatus');if(z)z.textContent=(d.by&&d.by.displayName||'A guest')+(d.ready?' is ready.':' is not ready.')});
    s.on('party:ready-needed',d=>{const z=$('ptExtraStatus');if(z)z.textContent='Ready check: '+d.count+' participant(s) still need to press “I’m ready”.'});
    s.on('party:schedule',d=>{const z=$('ptExtraStatus');if(z){const tick=()=>{const left=Math.max(0,Math.ceil((d.at-Date.now())/1000));z.textContent='Party starts in '+Math.floor(left/60)+'m '+left%60+'s';if(!left){clearInterval(t);if(isHost())s.emit('lobby:start')}};tick();const t=setInterval(tick,1000)}});
    s.on('party:vote-start',d=>{const z=$('ptVoteOptions');if(!z)return;z.innerHTML='';const counts={};d.options.forEach(opt=>{counts[opt]=0;const bt=E('button','sh-small',opt);bt.dataset.voteName=opt;bt.onclick=()=>s.emit('party:vote',{option:opt});z.append(bt)});const st=$('ptExtraStatus');if(st)st.textContent='Vote for what to watch next.'});
    s.on('party:vote',d=>{const z=$('ptExtraStatus');if(z)z.textContent=(d.by&&d.by.displayName||'A guest')+' voted for '+d.option+'.';if(d.counts){const wrap=$('ptVoteOptions');if(wrap)[...wrap.children].forEach(b=>{const name=b.dataset.voteName||b.textContent.replace(/ \([0-9]+\)$/,'');b.dataset.voteName=name;b.textContent=name+' ('+(d.counts[name]||0)+')'})}});
  }
  const _open = window.shOpen; window.shOpen = (id) => { _open(id); if (id === 'shWatch') { bind(); if (lobby) renderLobby(); else renderPicker(); } };
  window.addEventListener('sh:ready', () => { bind(); if (box()) renderPicker(); });
  window.shParty = { active: () => active, follow };
})();
