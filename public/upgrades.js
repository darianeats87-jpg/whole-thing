/* Projection Studios upgrade layer: collaborative watchlists, people search, TV controls and responsive mini-player. */
(() => {
  const $ = (id) => document.getElementById(id);
  const H = window.shAppH;
  if (!H) return;
  const esc = H.esc;
  const E = (tag, cls, html) => { const el = document.createElement(tag); if (cls) el.className = cls; if (html != null) el.innerHTML = html; return el; };
  const loggedIn = () => !!(H.getUser() && H.getToken());

  // Shared lists: owner-managed invites, friend-only access, collaborative title additions.
  let activeListId = null;
  function sharedPanel() {
    let panel = $('shSharedLists');
    if (!panel) {
      panel = E('div', 'sh-panel'); panel.id = 'shSharedLists';
      panel.innerHTML = '<div class="sh-box sh-shared-box"></div>';
      document.body.append(panel);
      panel.addEventListener('click', e => { if (e.target === panel) window.shClose('shSharedLists'); });
    }
    return panel.querySelector('.sh-box');
  }
  const sharedHead = () => '<button class="sh-small" style="float:right" onclick="shClose(\'shSharedLists\')" aria-label="Close shared lists">✕</button><h2>Shared Watchlists</h2><p class="sh-note">Make a list with friends. Only invited friends can see or edit it.</p>';
  async function openSharedLists() {
    const box = sharedPanel(); box.innerHTML = sharedHead() + '<div class="sh-line"><button class="sh-small sh-yes" id="shCreateList">＋ Create list</button><button class="sh-small" id="shReloadLists">Refresh</button></div><div id="shSharedListContent" class="sh-shared-content">Loading…</div>';
    window.shOpen('shSharedLists');
    $('shCreateList').onclick = async () => { const name = prompt('Name your shared watchlist:'); if (!name || !name.trim()) return; try { await H.api('/shared-lists', {method:'POST',body:JSON.stringify({name:name.trim()})}); await renderSharedLists(); H.toast('Shared watchlist created.'); } catch(e) { H.toast(esc(e.message)); } };
    $('shReloadLists').onclick = renderSharedLists;
    await renderSharedLists();
  }
  async function renderSharedLists() {
    const content = $('shSharedListContent'); if (!content) return;
    if (!loggedIn()) { content.innerHTML = '<p class="sh-note">Sign in to create shared lists with friends.</p>'; return; }
    content.textContent = 'Loading lists…';
    try {
      const lists = await H.api('/shared-lists'); content.innerHTML = '';
      if (!lists.length) { content.innerHTML = '<p class="sh-note">No shared lists yet. Create one to start planning a movie night.</p>'; return; }
      lists.forEach(list => {
        const card = E('section','sh-shared-list');
        const memberNames = (list.members || []).map(m => m.displayName || m.username).join(', ');
        card.innerHTML = '<div class="sh-shared-list-head"><div><h3></h3><small></small></div><div class="sh-line"><button class="sh-small" data-add>Add title</button><button class="sh-small" data-invite>Invite friend</button></div></div><div class="sh-shared-items"></div>';
        card.querySelector('h3').textContent = list.name;
        card.querySelector('small').textContent = 'Shared with: ' + (memberNames || 'you');
        const items = card.querySelector('.sh-shared-items');
        if (!(list.items || []).length) items.innerHTML = '<p class="sh-note">This list is empty. Add a movie or show.</p>';
        (list.items || []).forEach(item => {
          const row = E('div','sh-shared-item');
          const poster = item.poster ? 'https://image.tmdb.org/t/p/w92' + item.poster : '';
          row.innerHTML = '<img alt=""><div class="sh-shared-item-title"><b></b><small></small></div><button class="sh-small" aria-label="Remove title">Remove</button>';
          if (poster) row.querySelector('img').src = poster; else row.querySelector('img').hidden = true;
          row.querySelector('b').textContent = item.title;
          row.querySelector('small').textContent = item.mediaType === 'tv' ? 'TV show' : 'Movie';
          row.querySelector('b').tabIndex = 0;
          row.querySelector('b').onclick = () => window.shOpenDetail(item.mediaId,item.mediaType,item.title);
          row.querySelector('button').onclick = async () => { try { await H.api('/shared-lists/'+list.id+'/items/'+item.id,{method:'DELETE'}); await renderSharedLists(); } catch(e) { H.toast(esc(e.message)); } };
          items.append(row);
        });
        card.querySelector('[data-add]').onclick = async () => {
          const q = prompt('Search for a movie or TV show to add:'); if (!q || !q.trim()) return;
          try {
            const result = await H.tmdb('search/multi?query='+encodeURIComponent(q.trim()));
            const choices = (result.results||[]).filter(x=>['movie','tv'].includes(x.media_type)).slice(0,8);
            if (!choices.length) { H.toast('No matching movies or shows found.'); return; }
            const choice = choices.length === 1 ? choices[0] : choices[Number(prompt('Choose a result number:\n'+choices.map((x,i)=>(i+1)+'. '+(x.title||x.name)+' ('+(x.media_type==='tv'?'TV':'Movie')+')').join('\n'),'1'))-1];
            if (!choice || !choice.id) return;
            await H.api('/shared-lists/'+list.id+'/items',{method:'POST',body:JSON.stringify({mediaId:choice.id,mediaType:choice.media_type,title:choice.title||choice.name,poster:choice.poster_path||null})});
            await renderSharedLists();
          } catch(e) { H.toast(esc(e.message)); }
        };
        card.querySelector('[data-invite]').onclick = async () => {
          if (list.role !== 'owner' && Number(list.ownerId) !== Number(H.getUser()?.id)) { H.toast('Only the list owner can invite friends.'); return; }
          try {
            const friends = await H.api('/friends');
            if (!friends.length) { H.toast('Add a friend first.'); return; }
            const raw = prompt('Invite which friend? Enter the number:\n'+friends.map((f,i)=>(i+1)+'. '+(f.displayName||f.name||f.username||('User '+f.id))).join('\n'),'1');
            if (raw == null) return;
            const friend = friends[Number(raw)-1]; if (!friend) { H.toast('That friend number is not valid.'); return; }
            await H.api('/shared-lists/'+list.id+'/invite',{method:'POST',body:JSON.stringify({userId:friend.id})});
            H.toast('Friend invited to the shared list.'); await renderSharedLists();
          } catch(e) { H.toast(esc(e.message)); }
        };
        content.append(card);
      });
    } catch(e) { content.innerHTML = '<p class="sh-note">Could not load shared lists: '+esc(e.message)+'</p>'; }
  }
  window.shOpenSharedLists = openSharedLists;

  // Add an entry point without duplicating existing nav items.
  const links = document.querySelector('.nav-links');
  if (links && !links.querySelector('[data-sh-shared-lists]')) {
    const a = E('a','', 'Shared Lists'); a.href='#'; a.dataset.shSharedLists='1';
    a.onclick = e => { e.preventDefault(); openSharedLists(); }; links.append(a);
  }
  // Surface shared lists from the existing Watch Together lobby/picker.
  const addWatchButton = () => {
    const box = $('shWatch'); if (!box || box.querySelector('#shPartySharedLists')) return;
    const target = box.querySelector('.sh-box') || box;
    const b = E('button','sh-small','📋 Shared Watchlists'); b.id='shPartySharedLists'; b.onclick=openSharedLists;
    const line = E('div','sh-line'); line.style.margin='10px 0'; line.append(b); target.append(line);
  };
  const watchObserver = new MutationObserver(addWatchButton); watchObserver.observe(document.body,{childList:true,subtree:true});
  addWatchButton();

  // Universal search includes TMDB people; click a person to view their known credits.
  window.shOpenPerson = async (id, name) => {
    let panel = $('shPersonDetail');
    if (!panel) { panel=E('div','sh-panel');panel.id='shPersonDetail';panel.innerHTML='<div class="sh-box"></div>';document.body.append(panel);panel.addEventListener('click',e=>{if(e.target===panel)window.shClose('shPersonDetail')}); }
    const box=panel.querySelector('.sh-box');box.innerHTML='<button class="sh-small" style="float:right" onclick="shClose(\'shPersonDetail\')">✕</button><h2>'+esc(name||'Person')+'</h2><p class="sh-note">Loading credits…</p>';window.shOpen('shPersonDetail');
    try {
      const d=await H.tmdb('person/'+Number(id)+'?append_to_response=combined_credits');
      box.innerHTML='<button class="sh-small" style="float:right" onclick="shClose(\'shPersonDetail\')">✕</button><div class="sh-person-detail-head">'+(d.profile_path?'<img alt="" src="https://image.tmdb.org/t/p/w185'+d.profile_path+'">':'')+'<div><h2>'+esc(d.name||name||'Person')+'</h2><p class="sh-note">'+esc(d.known_for_department||'Cast and crew')+(d.birthday?' · Born '+esc(d.birthday):'')+'</p><p>'+esc((d.biography||'').slice(0,700))+'</p></div></div><h3>Known credits</h3><div class="sh-person-credits"></div>';
      const credits=[...((d.combined_credits||{}).cast||[]),...((d.combined_credits||{}).crew||[])].filter(x=>x.id&&['movie','tv'].includes(x.media_type)).sort((a,b)=>(b.popularity||0)-(a.popularity||0)).filter((x,i,a)=>a.findIndex(y=>y.id===x.id&&y.media_type===x.media_type)===i).slice(0,20);
      const grid=box.querySelector('.sh-person-credits');credits.forEach(x=>{const b=E('button','sh-person-credit');b.innerHTML='<img alt=""><b></b><small></small>';if(x.poster_path)b.querySelector('img').src='https://image.tmdb.org/t/p/w185'+x.poster_path;else b.querySelector('img').hidden=true;b.querySelector('b').textContent=x.title||x.name;b.querySelector('small').textContent=x.media_type==='tv'?'TV show':'Movie';b.onclick=()=>{window.shClose('shPersonDetail');window.shOpenDetail(x.id,x.media_type,x.title||x.name)};grid.append(b)});
      if(!credits.length)grid.innerHTML='<p class="sh-note">No credits available.</p>';
    } catch(e) { box.innerHTML='<button class="sh-small" style="float:right" onclick="shClose(\'shPersonDetail\')">✕</button><h2>'+esc(name||'Person')+'</h2><p class="sh-note">Could not load credits: '+esc(e.message)+'</p>'; }
  };

  // Improve existing recommendations by blending several recent watches and list picks.
  let recommendationRun = 0;
  window.addEventListener('sh:home', async (event) => {
    const target = event.detail && event.detail.target; if (!target || document.body.classList.contains('anime')) return;
    const run = ++recommendationRun;
    const history = H.LS(H.hKey(), []);
    let list = []; try { list = H.lKey ? H.LS(H.lKey(), []) : []; } catch {}
    const seeds = [...history.slice(0,3), ...list.slice(0,1)].filter((x,i,a)=>x && x.id && ['movie','tv'].includes(x.type) && a.findIndex(y=>String(y.id)===String(x.id)&&y.type===x.type)===i).slice(0,4);
    if (!seeds.length) return;
    const batches = await Promise.all(seeds.map(async seed => { try { const d = await H.tmdb(seed.type+'/'+Number(seed.id)+'?append_to_response=recommendations'); return ((d.recommendations||{}).results||[]).map(x=>({...x,media_type:seed.type})); } catch { return []; } }));
    if (run !== recommendationRun || !target.isConnected || document.body.classList.contains('anime')) return;
    const seen = new Set(); const items=[];
    for (const x of batches.flat()) { const k=x.media_type+':'+x.id; if(!x.id||seen.has(k))continue;seen.add(k);if(seeds.some(y=>String(y.id)===String(x.id)&&y.type===x.media_type))continue;items.push(x); }
    if (!items.length) return;
    const section = H.rowEl('Picked for Your Taste',items.slice(0,18),'movie'); section.classList.add('sh-personalized-row'); target.append(section);
  });

  // The Arcade already contains multiplayer and per-game leaderboards; add daily goals and badges without duplicating them.
  function renderArcadeOverview() {
    const daily=$('shDailyChallenges'), badges=$('shArcadeAchievements'); if(!daily||!badges)return;
    let stats={games:0,wins:0,byGame:{},daily:{}};try{stats=JSON.parse(localStorage.getItem('shg:arcadeStats')||'null')||stats}catch{}
    const key=new Date().toISOString().slice(0,10), today=stats.daily&&stats.daily[key]||{games:0,wins:0};
    const goals=[{title:'Play a match today',progress:Math.min(1,today.games||0),target:1,desc:'Finish any Tic Tac Toe or Connect 4 match.'},{title:'Win a match today',progress:Math.min(1,today.wins||0),target:1,desc:'Beat a bot or a friend in a match.'}];
    daily.innerHTML='';goals.forEach(g=>{const c=E('div','sh-daily-card');c.innerHTML='<b></b><p></p><div class="sh-daily-track"><i></i></div><small></small>';c.querySelector('b').textContent=g.title;c.querySelector('p').textContent=g.desc;c.querySelector('i').style.width=(g.progress/g.target*100)+'%';c.querySelector('small').textContent=g.progress>=g.target?'✓ Completed today':g.progress+' / '+g.target+' completed';daily.append(c)});
    const games=stats.byGame||{}, total=stats.games||0, wins=stats.wins||0;const playedTTT=(games.tictactoe&&games.tictactoe.games||0)>0,playedC4=(games.connect4&&games.connect4.games||0)>0;
    const achievements=[{icon:'🎮',name:'First Match',desc:'Finish your first match',ok:total>=1},{icon:'🏆',name:'First Victory',desc:'Win your first match',ok:wins>=1},{icon:'🔥',name:'Five Wins',desc:'Win five matches',ok:wins>=5},{icon:'⚔️',name:'Two-Game Explorer',desc:'Play both Tic Tac Toe and Connect 4',ok:playedTTT&&playedC4},{icon:'🌟',name:'Arcade Regular',desc:'Finish ten matches',ok:total>=10}];
    badges.innerHTML='';achievements.forEach(a=>{const c=E('div','sh-achievement'+(a.ok?' earned':''));c.innerHTML='<span></span><div><b></b><small></small></div>';c.querySelector('span').textContent=a.icon;c.querySelector('b').textContent=a.name;c.querySelector('small').textContent=a.desc+(a.ok?' · Unlocked':' · Locked');badges.append(c)});
  }
  window.shRenderArcadeOverview=renderArcadeOverview;window.addEventListener('sh:arcade-stats',renderArcadeOverview);

  // A compact mini-player should never spill outside the available window.
  const mini=$('miniPlayer');
  function fitMini() { if (!mini || !mini.classList.contains('active')) return; const w=Math.min(400,Math.max(190,innerWidth-16)); const h=Math.min(225,Math.max(120,innerHeight*.42),w*.5625+36); mini.style.width=w+'px';mini.style.height=h+'px';const r=mini.getBoundingClientRect();if(r.right>innerWidth)mini.style.left=Math.max(8,innerWidth-w-8)+'px';if(r.bottom>innerHeight)mini.style.top=Math.max(8,innerHeight-h-8)+'px'; }
  window.addEventListener('resize',fitMini); if(mini)new MutationObserver(fitMini).observe(mini,{attributes:true,attributeFilter:['class']});

  // TV-style Back/Escape and Enter/Space support for cards and custom controls.
  document.addEventListener('keydown',e=>{
    const t=e.target;if(t&&(/INPUT|TEXTAREA|SELECT/.test(t.tagName)||t.isContentEditable))return;
    if((e.key==='Enter'||e.key===' ')&&t&&t.matches('.sh-card,.sh-person-result,.sh-person-credit,.sh-shared-item-title b,[role="button"][tabindex="0"]')){e.preventDefault();t.click();return;}
    if(e.key==='Escape'||e.key==='Backspace'){
      const opened=[...document.querySelectorAll('.sh-panel.open,.player-modal.active')];
      const top=opened[opened.length-1];if(top){if(top.id==='playerModal'&&window.closePlayer)window.closePlayer();else if(top.id)window.shClose(top.id);e.preventDefault();}
    }
  });
})();

/* Rotating featured title: uses the existing TMDB proxy and current hero controls. */
(() => {
  const hero = document.querySelector('.hero');
  const H = window.shAppH;
  if (!hero || !H || !H.tmdb) return;
  const titleEl = hero.querySelector('.hero-title');
  const descEl = hero.querySelector('.hero-desc');
  const metaEl = hero.querySelector('.hero-meta');
  const playEl = hero.querySelector('.btn-play');
  const infoEl = hero.querySelector('.btn-info');
  let items = [], index = 0, timer = null, request = 0;
  const show = item => {
    if (!item) return;
    const id = Number(item.id), type = item.media_type === 'tv' || item.name ? 'tv' : 'movie';
    const title = item.title || item.name || 'Featured title';
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = item.overview || 'Discover your next favorite on Projection Studios.';
    if (metaEl) metaEl.innerHTML = '<span class="match">Featured</span><span>' + (item.release_date || item.first_air_date || '').slice(0,4) + '</span><span>HD</span>';
    if (item.backdrop_path) hero.style.backgroundImage = 'linear-gradient(90deg,rgba(0,0,0,.86),rgba(0,0,0,.18)),linear-gradient(0deg,#141414,transparent 48%),url("https://image.tmdb.org/t/p/original' + item.backdrop_path + '")';
    if (playEl) playEl.onclick = () => window.shOpenDetail && window.shOpenDetail(id, type, title);
    if (infoEl) infoEl.onclick = () => window.shOpenDetail && window.shOpenDetail(id, type, title);
  };
  const next = () => { if (!items.length) return; index = (index + 1) % items.length; show(items[index]); };
  const start = () => { clearInterval(timer); timer = setInterval(next, 12000); };
  H.tmdb('trending/all/week').then(data => {
    items = (data.results || []).filter(x => ['movie','tv'].includes(x.media_type) && x.backdrop_path).slice(0,8);
    if (!items.length) return;
    index = 0; show(items[0]); start();
    hero.addEventListener('mouseenter', () => clearInterval(timer));
    hero.addEventListener('mouseleave', start);
    document.addEventListener('visibilitychange', () => document.hidden ? clearInterval(timer) : start());
  }).catch(() => {});
})();
