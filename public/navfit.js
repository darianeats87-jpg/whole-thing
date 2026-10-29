/* Projection Studios nav fit: if the top bar runs out of room, the least-used buttons move into a "☰ More" menu,
   so nothing is ever cut off or pushed off-screen (including Manga and Anime). */
(() => {
  const nav = document.querySelector('.navbar'); if (!nav) return;
  const st = document.createElement('style');
  st.textContent = '@media(max-width:820px){.nav-links a,.nav-links button{display:inline-flex!important;align-items:center}}' +
    '.sh-more{background:transparent;border:0;color:#e5e5e5;font-size:20px;cursor:pointer;padding:4px 8px;flex:none;margin-left:6px}' +
    '#shMore{position:fixed;top:64px;right:10px;z-index:1250;background:#181818;border:1px solid #333;border-radius:12px;padding:8px;display:none;flex-direction:column;gap:2px;min-width:min(190px,calc(100vw - 20px));max-width:calc(100vw - 20px);max-height:calc(100vh - 80px);overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.7)}' +
    '@media(max-width:300px){#shMore a,#shMore button,#shMore .sh-live{white-space:normal!important;padding:8px 8px!important;font-size:13px!important}html body nav.navbar .logo{font-size:12px!important;letter-spacing:-.5px!important;min-width:0}html body nav.navbar{padding:8px 6px!important;gap:4px!important}.sh-more{padding:4px 4px;margin-left:0}}' +
    '#shMore.open{display:flex}' +
    '#shMore a,#shMore button,#shMore .sh-live{display:flex!important;align-items:center;width:100%;text-align:left;padding:10px 12px!important;border-radius:8px;background:transparent;border:0;color:#fff;font-size:14px!important;cursor:pointer;text-decoration:none;white-space:nowrap;margin:0!important}' +
    '#shMore a:hover,#shMore button:hover{background:#2a2a2a}' +
    'body.light-mode #shMore{background:#fff;border-color:#ddd}body.light-mode #shMore a,body.light-mode #shMore button,body.light-mode #shMore .sh-live{color:#171717}';
  document.head.append(st);
  let btn, menu, busy = false, last = 0, timer = null; const moved = [];
  const ensure = () => {
    if (btn) return;
    btn = document.createElement('button'); btn.className = 'sh-more'; btn.textContent = '☰'; btn.title = 'More'; btn.setAttribute('aria-label', 'More menu'); btn.style.display = 'none';
    menu = document.createElement('div'); menu.id = 'shMore'; document.body.append(menu);
    btn.onclick = (e) => { e.stopPropagation(); const r = nav.getBoundingClientRect(); menu.style.top = Math.round(r.bottom + 4) + 'px'; menu.classList.toggle('open'); };
    menu.addEventListener('click', () => menu.classList.remove('open'));
    document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== btn) menu.classList.remove('open'); });
    nav.append(btn);
  };
  const restore = () => { while (moved.length) { const m = moved.pop(); if (m.ph.parentNode) m.ph.parentNode.replaceChild(m.el, m.ph); } };
  const candidates = () => {
    const links = [...document.querySelectorAll('.nav-links > *')], right = [...document.querySelectorAll('.nav-right > *')];
    const L = (t) => links.find((a) => a.textContent.trim().toLowerCase() === t);
    const R = (re) => right.find((e) => re.test(e.textContent.trim()));
    return [document.getElementById('shLive'), L('credits'), L('people'), L('new & popular'), L('games'), L('my list'), R(/^chat$/i), R(/watch together/i), R(/^⚙$/), L('movies'), L('tv shows'), L('manga'), document.getElementById('shAnimeBtn')].filter(Boolean);
  };
  const phoneOver = () => { const r = document.querySelector('.nav-right'); return !!r && r.scrollWidth > r.clientWidth + 2; };
  const overflow = () => {
    if (innerWidth <= 820) return phoneOver();
    let r = 0;
    nav.querySelectorAll('.nav-links > *, .nav-right > *').forEach((x) => { if (x.offsetParent) r = Math.max(r, x.getBoundingClientRect().right); });
    const clipped = (c) => !!c && c.scrollWidth > c.clientWidth + 2;
    return r > innerWidth - 10 || clipped(nav.querySelector('.nav-links')) || clipped(nav.querySelector('.nav-right'));
  };
  const fit = () => {
    if (busy) return; busy = true; ensure(); restore(); menu.innerHTML = ''; menu.classList.remove('open');
    const rail = document.body.dataset.look === 'youtube' && innerWidth > 820;
    if (rail) { btn.style.display = 'none'; busy = false; last = Date.now(); return; }
    btn.style.display = '';
    const phone = innerWidth <= 820, right = document.querySelector('.nav-right');
    const list = phone ? candidates().filter((el) => right && right.contains(el)).concat([document.getElementById('shBell'), document.getElementById('shProfileBtn'), document.querySelector('.nav-right .search-box')].filter(Boolean)) : candidates();
    for (const el of list) {
      if (!overflow()) break;
      const ph = document.createComment('m'); el.parentNode.replaceChild(ph, el); menu.append(el); moved.push({ el, ph });
    }
    btn.style.display = moved.length ? '' : 'none'; busy = false; last = Date.now();
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(fit, 140); };
  window.addEventListener('resize', later); window.addEventListener('sh:ready', later); window.addEventListener('sh:home', later); window.addEventListener('load', later);
  const mo = new MutationObserver(() => { if (!busy && Date.now() - last > 250) later(); });
  document.querySelectorAll('.nav-links, .nav-right').forEach((c) => mo.observe(c, { childList: true }));
  new MutationObserver(later).observe(document.body, { attributes: true, attributeFilter: ['data-look', 'class'] });
  fit();
})();
