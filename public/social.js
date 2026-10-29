/* Projection Studios social layer: looks, privacy, people, friends, notifications, profile sharing,
   "what viewers watch most", the banner that changes every 3 days, and the live counter. */
(() => {
  const $ = (id) => document.getElementById(id);
  const E = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const H = window.shAppH; if (!H) return;
  const esc = H.esc;
  const LOOKS = [['', 'Default'], ['youtube', 'Crimson'], ['hulu', 'Mint'], ['paramount', 'Cobalt'], ['prime', 'Sky'], ['disney', 'Midnight'], ['max', 'Violet'], ['apple', 'Mono']];
  const setLook = (v) => { if (v) document.body.dataset.look = v; else delete document.body.dataset.look; try { localStorage.setItem('shLook', v || ''); } catch {} };
  setLook(localStorage.getItem('shLook') || '');
  const loggedIn = () => !!(H.getUser() && H.getToken());
  let me = null, started = false, watching = false, pres = null;

  const panel = (id) => { let p = $(id); if (!p) { p = E('div', 'sh-panel'); p.id = id; p.innerHTML = '<div class="sh-box"></div>'; document.body.append(p); p.addEventListener('click', (e) => { if (e.target === p) window.shClose(id); }); } return p.querySelector('.sh-box'); };
  const head = (id, title) => '<button class="sh-small" style="float:right" onclick="shClose(\'' + id + '\')">✕</button><h2>' + title + '</h2>';
  const avatar = (u) => (u.pic && u.pid ? '<img src="/api/pic/' + u.pid + '?v=1" alt="">' : H.av(u.avatar));

  /* ---------- Settings: look, privacy, friend requests, share ---------- */
  function injectSettings() {
    const box = document.querySelector('#shSettings .sh-box'); if (!box || box.dataset.social) return; box.dataset.social = '1';
    const s = E('div', 'sh-soc-set'); s.innerHTML = '<label>Look &amp; feel</label><select id="shLook">' + LOOKS.map((l) => '<option value="' + l[0] + '">' + l[1] + '</option>').join('') + '</select><div id="shPrivBox"></div>';
    box.append(s); const sel = $('shLook'); sel.value = localStorage.getItem('shLook') || ''; sel.onchange = () => setLook(sel.value);
  }
  async function renderPriv() {
    const b = $('shPrivBox'); if (!b) return;
    if (!loggedIn()) { b.innerHTML = '<p class="sh-note">Sign in to use privacy, friends and profile sharing.</p>'; return; }
    try { me = await H.api('/me'); } catch { return; }
    b.innerHTML = '<label class="sh-chk"><input type="checkbox" id="shPriv"> <span>Private profile: only friends can see my bio and recent watches</span></label><label class="sh-chk"><input type="checkbox" id="shAllow"> <span>Allow people to send me friend requests</span></label><div class="sh-line"><button class="sh-small" id="shShareBtn">Share a profile…</button></div>';
    $('shPriv').checked = !!me.private; $('shAllow').checked = me.allowRequests !== false;
    const save = async () => { try { me = await H.api('/me', { method: 'PATCH', body: JSON.stringify({ private: $('shPriv').checked, allowRequests: $('shAllow').checked }) }); } catch (e) { H.toast(esc(e.message)); } };
    $('shPriv').onchange = save; $('shAllow').onchange = save; $('shShareBtn').onclick = () => sharePicker();
  }
  const _open = window.shOpen; window.shOpen = (id) => { _open(id); if (id === 'shSettings') { injectSettings(); renderPriv(); } };

  /* ---------- Notifications ---------- */
  const setBadge = (n) => { const b = $('shBellN'); if (b) { b.textContent = n > 9 ? '9+' : n; b.style.display = n ? '' : 'none'; } };
  async function pollNotifs() { if (!loggedIn()) return; try { const d = await H.api('/notifications'); setBadge(d.unread || 0); return d; } catch {} }
  async function openNotifs() {
    const box = panel('shNotif'); box.innerHTML = head('shNotif', 'Notifications') + '<p class="sh-note">Loading…</p>'; window.shOpen('shNotif');
    if (!loggedIn()) { box.innerHTML = head('shNotif', 'Notifications') + '<p class="sh-note">Sign in to get friend requests and shared profiles.</p>'; return; }
    let d; try { d = await H.api('/notifications'); } catch (e) { box.innerHTML = head('shNotif', 'Notifications') + '<p class="sh-note">' + esc(e.message) + '</p>'; return; }
    const rows = d.items.map((n) => {
      const who = esc((n.data.from && n.data.from.name) || 'Someone'), open = n.status === 'new' || n.status === 'seen'; let text = '', acts = '';
      if (n.type === 'friend_request') { text = '<b>' + who + '</b> sent you a friend request'; if (open) acts = '<button class="sh-small sh-yes" data-a="1">Accept</button><button class="sh-small" data-a="0">Decline</button>'; }
      else if (n.type === 'profile_share') { text = '<b>' + who + '</b> wants to share the profile “' + esc((n.data.profile || {}).name) + '” with you'; if (open) acts = '<button class="sh-small sh-yes" data-a="1">Accept</button><button class="sh-small" data-a="0">Decline</button>'; }
      else if (n.type === 'friend_accepted') text = '<b>' + who + '</b> accepted your friend request';
      else if (n.type === 'share_accepted') text = '<b>' + who + '</b> accepted your shared profile';
      else if (n.type === 'title_share') { const m=n.data.media||{}; text='<b>'+who+'</b> sent you <b>'+esc(m.title||'a title')+'</b>'; acts='<button class="sh-small sh-yes" data-open-title="1">Open title</button>'; }
      else if (n.type === 'shared_list_invite') { text='<b>'+who+'</b> added you to the shared watchlist <b>'+esc(n.data.name||'Shared list')+'</b>'; acts='<button class="sh-small sh-yes" data-open-shared-list="1">Open lists</button>'; }
      else text = esc(n.type);
      if (!open && (n.type === 'friend_request' || n.type === 'profile_share')) text += ' · <i>' + n.status + '</i>';
      const row = E('div', 'sh-note-row' + (n.status === 'new' ? ' new' : ''), '<span>' + text + '</span><span class="acts">' + acts + '</span>');
      const openTitle=row.querySelector('[data-open-title]');if(openTitle)openTitle.onclick=()=>{const m=n.data.media||{};if(m.id&&m.type){window.shClose('shNotif');window.shOpenDetail(m.id,m.type,m.title)}};const openShared=row.querySelector('[data-open-shared-list]');if(openShared)openShared.onclick=()=>{window.shClose('shNotif');if(window.shOpenSharedLists)window.shOpenSharedLists()};
      row.querySelectorAll('[data-a]').forEach((b) => { b.onclick = async () => { b.disabled = true; try { const r = await H.api('/notifications/' + n.id + '/respond', { method: 'POST', body: JSON.stringify({ accept: b.dataset.a === '1' }) }); H.toast(r.accepted ? (n.type === 'profile_share' ? 'Profile added. Open the profile screen to switch to it.' : 'Friend added!') : 'Declined.'); openNotifs(); } catch (e) { H.toast(esc(e.message)); b.disabled = false; } }; });
      return row;
    });
    box.innerHTML = head('shNotif', 'Notifications'); if (!rows.length) box.append(E('p', 'sh-note', 'Nothing yet.')); rows.forEach((r) => box.append(r));
    H.api('/notifications/read', { method: 'POST', body: '{}' }).then(() => setBadge(0)).catch(() => {});
  }

  /* ---------- People ---------- */
  function stage() { const r = $('rowsContainer'); const hero = document.querySelector('.hero'); if (hero) hero.style.display = 'none'; document.body.classList.remove('sh-hero-on'); const nav = $('navbar'); r.innerHTML = ''; r.style.paddingTop = ((nav ? nav.offsetHeight : 72) + 24 - (parseFloat(getComputedStyle(r).marginTop) || 0)) + 'px'; window.scrollTo(0, 0); return r; }
  async function showPeople(q) {
    const r = stage(); r.innerHTML = '<div style="padding:0 4% 16px"><h1 style="margin:0 0 12px">People</h1><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="shPeopleQ" placeholder="Search by name… (leave blank to see everyone)" style="flex:1;min-width:200px;padding:11px;border-radius:8px;border:1px solid #444;background:#1a1a1f;color:#fff"><button class="sh-small" id="shPeopleGo">Search</button></div><p class="sh-note" style="margin:10px 0 0">All registered accounts appear here, including people who are offline.</p></div><div id="shPeopleList" class="sh-people"></div>';
    $('shPeopleQ').value = q || ''; $('shPeopleGo').onclick = () => showPeople($('shPeopleQ').value.trim()); $('shPeopleQ').onkeydown = (e) => { if (e.key === 'Enter') showPeople($('shPeopleQ').value.trim()); };
    const list = $('shPeopleList');
    if (!loggedIn()) { list.innerHTML = '<p class="sh-note" style="grid-column:1/-1">Sign in to see other people on Projection Studios.</p>'; return; }
    list.innerHTML = '<p class="sh-note">Loading people…</p>'; let users;
    try { users = await H.api('/users?q=' + encodeURIComponent(q || '')); } catch (e) { list.innerHTML = '<p class="sh-note" style="grid-column:1/-1">Could not load people: ' + esc(e.message) + '</p>'; return; }
    list.innerHTML = ''; if (!users.length) { list.innerHTML = '<p class="sh-note" style="grid-column:1/-1">No registered accounts found yet.</p>'; return; }
    users.forEach((u) => {
      const c = E('div', 'sh-pc');
      const self = !!u.isSelf;
      c.innerHTML = '<div class="su-av">' + avatar(u) + '</div><div class="sh-person-info"><b>' + esc(self ? 'You' : u.name) + (!self && u.private ? ' 🔒' : '') + '</b><small>' + (self ? 'Your profile · @' + esc(u.username) : '@' + esc(u.username) + (u.accountName && u.accountName !== u.name ? ' · account ' + esc(u.accountName) : ' · Offline users included')) + '</small><div class="sh-person-actions">' + (self ? '<span class="sh-note">This is you</span>' : (u.relation === 'none' && u.allowRequests ? '<button class="sh-small sh-yes" data-act="add">＋ Add friend</button>' : u.relation === 'pending_out' ? '<span class="sh-note">Request sent</span>' : u.relation === 'pending_in' ? '<span class="sh-note">Request received</span>' : u.relation === 'friends' ? '<span class="sh-note">✓ Friends</span>' : '')) + (self ? '' : '<button class="sh-small" data-act="dm">Message</button>') + '</div></div>';
      c.querySelector('.sh-person-info').addEventListener('click', (e) => { if (!e.target.closest('button') && !self) openUser(u.id); });
      const dm = c.querySelector('[data-act="dm"]'); if (dm) dm.onclick = (e) => { e.stopPropagation(); openDM(u); };
      const add = c.querySelector('[data-act="add"]'); if (add) add.onclick = async (e) => { e.stopPropagation(); add.disabled = true; try { await H.api('/friends/request', { method: 'POST', body: JSON.stringify({ userId: u.id }) }); H.toast('Friend request sent to <b>' + esc(u.name) + '</b>'); showPeople($('shPeopleQ').value.trim()); } catch (err) { H.toast(esc(err.message)); add.disabled = false; } };
      list.append(c);
    });
  }
  async function openDM(u) {
    if (u && u.isSelf) { H.toast('You cannot message yourself.'); return; }
    if (!loggedIn()) { H.toast('Sign in to send messages.'); return; }
    const box = panel('shDM'); box.innerHTML = head('shDM', 'Message ' + esc(u.name)) + '<div id="shDMLog" style="height:300px;overflow:auto;background:#111;padding:12px;border-radius:10px;margin:12px 0">Loading messages…</div><form id="shDMForm" style="display:flex;gap:8px"><input id="shDMText" maxlength="1000" required placeholder="Write a message…" style="flex:1;min-width:0;padding:11px;border-radius:8px;border:1px solid #444;background:#1a1a1f;color:#fff"><button class="sh-small sh-yes" type="submit">Send</button></form>';
    window.shOpen('shDM');
    const log = $('shDMLog');
    const load = async () => { try { const msgs = await H.api('/dm?with=' + u.id); log.innerHTML = ''; if (!msgs.length) log.innerHTML = '<p class="sh-note">No messages yet. Say hello!</p>'; msgs.forEach(m => { const row = E('div', '', '<div style="font-size:12px;color:#aaa;margin-bottom:3px">' + (m.senderId === Number(u.id) ? esc(u.name) : 'You') + ' · ' + esc(new Date(m.createdAt).toLocaleString()) + '</div><div style="white-space:pre-wrap;overflow-wrap:anywhere">' + esc(m.body) + '</div>'); row.style.cssText = 'padding:9px 10px;margin:8px 0;border-radius:10px;background:' + (m.senderId === Number(u.id) ? '#26262c' : '#3a171a'); log.append(row); }); log.scrollTop = log.scrollHeight; } catch (e) { log.innerHTML = '<p class="sh-note">' + esc(e.message) + '</p>'; } };
    await load(); $('shDMForm').onsubmit = async (e) => { e.preventDefault(); const input = $('shDMText'), message = input.value.trim(); if (!message) return; const btn = $('shDMForm').querySelector('button'); btn.disabled = true; try { await H.api('/dm', { method: 'POST', body: JSON.stringify({ toUserId: Number(u.id), message }) }); input.value = ''; await load(); } catch (err) { H.toast(esc(err.message)); } finally { btn.disabled = false; input.focus(); } };
  }
  async function openUser(id) {
    const box = panel('shUser'); box.innerHTML = head('shUser', 'Profile') + '<p class="sh-note">Loading…</p>'; window.shOpen('shUser'); let u;
    try { u = await H.api('/users/' + id); } catch (e) { box.innerHTML = head('shUser', 'Profile') + '<p class="sh-note">' + esc(e.message) + '</p>'; return; }
    const isSelf = u.relation === 'self' || !!u.isSelf;
    if (isSelf) u.name = 'You';
    let act = '';
    if (isSelf) act = '<span class="sh-note">This is you</span>';
    else if (u.relation === 'none') act = u.allowRequests ? '<button class="sh-small sh-yes" id="suAdd">＋ Add friend</button>' : '<span class="sh-note">Not accepting friend requests</span>';
    else if (u.relation === 'pending_out') act = '<span class="sh-note">Friend request sent</span>';
    else if (u.relation === 'pending_in') act = '<span class="sh-note">They sent you a request. Answer it in your notifications.</span>';
    else if (u.relation === 'friends') act = '<span class="sh-note">✓ Friends</span><button class="sh-small" id="suShare">Share a profile…</button><button class="sh-small" id="suRem">Remove friend</button>';
    else act = '<span class="sh-note">This is you</span>';
    if (!isSelf) act += '<button class="sh-small" id="suDM">Message</button>';  
    box.innerHTML = head('shUser', esc(u.name)) + '<div class="su-head"><div class="su-av">' + avatar(u) + '</div><div><small style="color:#aaa">@' + esc(u.username) + (u.private ? ' · 🔒 private' : '') + '</small></div></div><div class="sh-line" style="flex-wrap:wrap">' + act + '</div>' +
      (u.visible ? '<div class="su-bio">' + (u.bio ? esc(u.bio) : '<i style="color:#888">No bio yet.</i>') + '</div><label>Recently watched</label><div class="su-w" id="suW"></div>' : '<div class="su-bio"><i>This profile is private. Only friends can see it.</i></div>');
    if (u.visible) { const w = $('suW'); if (!u.recent.length) w.innerHTML = '<span class="sh-note">Nothing watched yet.</span>'; u.recent.forEach((x) => { const t = E('div', '', (x.poster ? '<img src="https://image.tmdb.org/t/p/w185' + esc(x.poster) + '" alt="">' : '<img alt="">') + '<span>' + esc(x.title) + (x.type === 'tv' && x.season ? ' · S' + x.season + 'E' + x.episode : '') + '</span>'); t.onclick = () => { window.shClose('shUser'); window.shOpenDetail(x.id, x.type, x.title); }; w.append(t); }); }
    const on = (i, f) => { const b = $(i); if (b) b.onclick = f; };
    if (isSelf) return;
    on('suAdd', async () => { try { await H.api('/friends/request', { method: 'POST', body: JSON.stringify({ userId: u.id }) }); H.toast('Friend request sent to <b>' + esc(u.name) + '</b>'); openUser(id); } catch (e) { H.toast(esc(e.message)); } });
    on('suDM', () => openDM(u)); on('suShare', () => sharePicker(u.id)); on('suRem', async () => { if (!confirm('Remove ' + u.name + ' from your friends?')) return; try { await H.api('/friends/remove', { method: 'POST', body: JSON.stringify({ userId: u.id }) }); openUser(id); } catch (e) { H.toast(esc(e.message)); } });
  }
  async function sharePicker(preTo) {
    if (!loggedIn()) { H.toast('Sign in to share a profile.'); return; }
    const box = panel('shShare'); box.innerHTML = head('shShare', 'Share a profile') + '<p class="sh-note">Loading…</p>'; window.shOpen('shShare'); let fr, pr;
    try { [fr, pr] = await Promise.all([H.api('/friends'), H.api('/profiles')]); } catch (e) { box.innerHTML = head('shShare', 'Share a profile') + '<p class="sh-note">' + esc(e.message) + '</p>'; return; }
    if (!fr.length) { box.innerHTML = head('shShare', 'Share a profile') + '<p class="sh-note">You need a friend first. Open People, add someone, and once they accept you can share a profile.</p>'; return; }
    box.innerHTML = head('shShare', 'Share a profile') + '<p class="sh-note">Pick one of your profiles. Your friend gets it only if they accept in their notifications.</p><label>Send to</label><select id="shShTo">' + fr.map((f) => '<option value="' + f.id + '">' + esc(f.name) + '</option>').join('') + '</select><label>Profile to share</label><select id="shShPr">' + pr.map((p) => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('') + '</select><div class="sh-line"><button class="sh-small sh-yes" id="shShGo">Send</button></div>';
    if (preTo) $('shShTo').value = preTo;
    $('shShGo').onclick = async () => { try { await H.api('/share', { method: 'POST', body: JSON.stringify({ toUserId: Number($('shShTo').value), profileId: Number($('shShPr').value) }) }); window.shClose('shShare'); H.toast('Share request sent. They can accept it in their notifications.'); } catch (e) { H.toast(esc(e.message)); } };
  }

  /* ---------- Live counter ---------- */
  const wsURL = () => { const u = new URL('/ws', location.href); u.protocol = u.protocol.replace('http', 'ws'); u.searchParams.set('room', '__presence'); return u; };
  const sendWatching = () => { if (pres && pres.readyState === 1) pres.send(JSON.stringify({ e: 'presence:set', d: { watching } })); };
  function showStats(d) { const c = $('shLive'); if (c) c.innerHTML = '<i></i>' + d.online + ' online · ' + d.watching + ' watching'; }
  function connectPresence() { const ws = new WebSocket(wsURL()); pres = ws; ws.onopen = sendWatching; ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m.e === 'presence:stats') showStats(m.d); } catch {} }; ws.onclose = () => { if (pres === ws) pres = null; setTimeout(connectPresence, 4000); }; }
  setInterval(() => { const w = !!(document.querySelector('#shPlayer.open') || document.querySelector('#playerModal.active')); if (w !== watching) { watching = w; sendWatching(); } }, 1500);

  /* ---------- What viewers watch most (counts when someone presses play) ---------- */
  const counted = new Set();
  function countView(tmdb, title, type) {
    if ((type !== 'tv' && type !== 'movie') || !tmdb || !title) return; const k = type + tmdb; if (counted.has(k)) return; counted.add(k);
    const ex = H.LS(H.hKey(), []).find((x) => String(x.id) === String(tmdb));
    const tk = localStorage.getItem('shToken'); if (!tk) return; /* view counts are for signed-in users only */
    fetch('/api/watched', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: JSON.stringify({ mediaId: tmdb, mediaType: type, title, poster: ex ? ex.poster : null }) }).catch(() => {});
  }
  const _op = window.openPlayer; window.openPlayer = function (tmdb, title, type) { const r = _op.apply(this, arguments); countView(tmdb, title, type); return r; };
  async function addPopular(target) {
    try {
      const items = await (await fetch('/api/popular')).json(); if (!Array.isArray(items) || !items.length) return;
      const row = H.rowEl('Projection Studios Viewers Mostly Watch', items.map((i) => ({ id: i.media_id, name: i.title, title: i.title, poster_path: i.poster, media_type: i.media_type })), 'tv');
      const rows = target.querySelectorAll('.row'); const at = rows[1] || rows[0]; if (at) at.after(row); else target.append(row);
    } catch {}
  }

  /* ---------- Banner that changes every 3 days ---------- */
  const FEAT = [['tv', 1396], ['tv', 60625], ['tv', 2316], ['tv', 1434], ['tv', 2190], ['tv', 1668], ['tv', 60574], ['tv', 76479], ['tv', 119051], ['tv', 94605], ['tv', 1429], ['tv', 85937], ['tv', 37854], ['tv', 95479], ['tv', 60059], ['tv', 93405], ['tv', 71446], ['tv', 82856], ['tv', 95557], ['movie', 27205], ['movie', 155], ['movie', 157336], ['movie', 872585], ['movie', 438631], ['movie', 324857], ['movie', 299534], ['movie', 245891], ['movie', 414906], ['movie', 545611]];
  let feat = null;
  async function applyFeatured() {
    const hero = $('hero'); if (!hero) return;
    if (!feat) {
      const slot = Math.floor(Date.now() / (3 * 86400000));
      for (let k = 0; k < 4 && !feat; k++) { const [type, id] = FEAT[(slot + k) % FEAT.length]; try { const d = await H.tmdb(type + '/' + id); if (d && (d.title || d.name) && d.backdrop_path) feat = { type, id, d }; } catch {} }
    }
    if (!feat) return; const { type, id, d } = feat, title = d.title || d.name, year = (d.release_date || d.first_air_date || '').slice(0, 4);
    hero.style.backgroundImage = 'url(https://image.tmdb.org/t/p/original' + d.backdrop_path + ')'; hero.style.backgroundSize = 'cover'; hero.style.backgroundPosition = 'center';
    const set = (sel, html) => { const e = hero.querySelector(sel); if (e) e.innerHTML = html; };
    set('.hero-title', esc(title));
    set('.hero-meta', '<span class="match">' + Math.round((d.vote_average || 0) * 10) + '% Match</span><span>' + esc(year) + '</span><span class="badge">' + (type === 'tv' ? 'Series' : 'Movie') + '</span><span>' + (type === 'tv' ? (d.number_of_seasons || 1) + (d.number_of_seasons > 1 ? ' Seasons' : ' Season') : (d.runtime ? Math.floor(d.runtime / 60) + 'h ' + (d.runtime % 60) + 'm' : 'HD')) + '</span><span>HD</span>');
    set('.hero-desc', esc((d.overview || '').slice(0, 240)));
    const play = hero.querySelector('.btn-play'), info = hero.querySelector('.btn-info');
    if (play) play.onclick = () => (type === 'tv' ? window.shResumePlay(id, title) : window.openPlayer(id, title, 'movie'));
    if (info) info.onclick = () => window.shOpenDetail(id, type, title);
    hero.removeAttribute('data-static');
  }

  /* ---------- Wire into the page ---------- */
  function addNav() {
    const right = document.querySelector('.nav-right'), links = document.querySelector('.nav-links');
    if (right && !$('shLive')) { const live = E('div', 'sh-live', '<i></i>– online'); live.id = 'shLive'; right.insertBefore(live, right.firstChild); }
    if (right && !$('shBell')) { const b = E('button', 'sh-bell', '🔔<b id="shBellN" style="display:none">0</b>'); b.id = 'shBell'; b.title = 'Notifications'; b.onclick = openNotifs; const pf = $('shProfileBtn'); right.insertBefore(b, pf && pf.parentNode === right ? pf : null); }
    if (links && !links.querySelector('.sh-people-nav')) { const a = E('a', 'sh-people-nav', 'People'); a.href = '#'; a.onclick = (e) => { e.preventDefault(); showPeople(''); }; links.append(a); }
  }
  window.addEventListener('sh:ready', () => {
    addNav(); applyFeatured(); pollNotifs();
    if (!started) { started = true; connectPresence(); setInterval(pollNotifs, 45000); }
  });
  async function addFriendsActivity(target) {
    if(!loggedIn()||!target||target.querySelector('.sh-friends-activity'))return;
    try{const d=await H.api('/activity');const watching=d.watching||[],recent=d.recent||[];if(!watching.length&&!recent.length)return;
      const section=E('section','row sh-friends-activity');section.innerHTML='<div class="row-title">Friends are watching now</div><div class="row-scroll sh-activity-row"></div>';const sc=section.querySelector('.row-scroll');
      watching.forEach(x=>{const c=E('div','sh-activity-card','<img alt=""><b></b><small></small>');c.querySelector('img').src=x.poster?'https://image.tmdb.org/t/p/w185'+esc(x.poster):'';c.querySelector('b').textContent=x.profileName||x.displayName;c.querySelector('small').textContent=(x.displayName||x.username)+' · '+x.title;c.onclick=()=>window.shOpenDetail(x.mediaId,x.mediaType,x.title);sc.append(c)});
      if(!watching.length)section.querySelector('.row-title').textContent='Friends recently watched';
      if(recent.length){const r=E('section','row sh-friends-recent','<div class="row-title">Friends recently watched</div><div class="row-scroll sh-activity-row"></div>');const rs=r.querySelector('.row-scroll');recent.forEach(x=>{const c=E('div','sh-activity-card','<img alt=""><b></b><small></small>');c.querySelector('img').src=x.poster?'https://image.tmdb.org/t/p/w185'+esc(x.poster):'';c.querySelector('b').textContent=x.title;c.querySelector('small').textContent=x.displayName||x.username;c.onclick=()=>window.shOpenDetail(x.mediaId,x.mediaType,x.title);rs.append(c)});target.prepend(r)}target.prepend(section);
    }catch{}
  }
  window.addEventListener('sh:home', (e) => { addPopular(e.detail.target); addFriendsActivity(e.detail.target); applyFeatured(); });
  window.shSocial = { openUser, showPeople, sharePicker };
})();
