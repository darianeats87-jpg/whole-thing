/* Projection Studios Anime UI: home page + title page.
   Metadata comes from AniList. Playback still goes through the existing player (playAnime). */
(function () {
  'use strict';

  /* Helpers live inside index.html's own scope, so they are handed over through window.shAnimeH. */
  const H = () => window.shAnimeH;
  const alq = (...a) => H().alq(...a);
  const esc = (v) => H().esc(v);
  const atitle = (m) => H().atitle(m);
  const LS = (...a) => H().LS(...a);
  const SV = (...a) => H().SV(...a);
  const hKey = () => H().hKey();
  const hItem = (x) => H().hItem(x);
  const rowEl = (...a) => H().rowEl(...a);
  const gamesRow = () => H().gamesRow();
  const freeRow = () => H().freeRow();
  const loadRows = (...a) => H().loadRows(...a);
  const playAnime = (m) => H().playAnime(m);
  const $ = (id) => document.getElementById(id);

  const F = 'id idMal title{romaji english native} coverImage{extraLarge large} bannerImage format episodes averageScore seasonYear genres status description(asHtml:false) nextAiringEpisode{episode}';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const SHOW_GENRES = ['Fantasy', 'Action', 'Romance', 'Comedy', 'Sci-Fi', 'Adventure', 'Drama', 'Supernatural'];

  const css = `
.ay-sec{padding:0 4%;margin:34px 0 0;position:relative;z-index:2}
.ay-h{display:flex;align-items:center;gap:10px;margin:0 0 14px}
.ay-h h2{margin:0;font-size:20px;font-weight:700;border-left:3px solid #fff;padding-left:10px;line-height:1.1}
.ay-pill{font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.1);color:#ffc2dc}
.ay-all{margin-left:auto;color:#aaa;font-size:12px;cursor:pointer;background:none;border:0}.ay-all:hover{color:#fff}
.ay-hero{position:relative;margin:-96px 0 0;min-height:min(78vh,620px);display:flex;align-items:flex-end;overflow:hidden;background:#111}
.ay-hero-bg{position:absolute;inset:0;background:center/cover no-repeat;transition:opacity .5s}
.ay-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,#0b0b0f 2%,rgba(11,11,15,.55) 45%,rgba(11,11,15,.2) 100%),linear-gradient(to right,rgba(11,11,15,.85) 0,transparent 65%)}
.ay-hero-in{position:relative;z-index:2;padding:0 4% 56px;max-width:720px;transition:opacity .35s}
.ay-badges{display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
.ay-b{font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14);color:#fff;letter-spacing:.03em}
.ay-b.on{background:rgba(255,126,182,.2);border-color:#ff7eb6;color:#ffd0e4}.ay-b.sc{color:#ffd45e}
.ay-t{font-size:clamp(30px,5.2vw,58px);font-weight:800;line-height:1.05;margin:0 0 12px;text-shadow:0 4px 24px #000}
.ay-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.ay-chip{font-size:11px;padding:3px 10px;border-radius:6px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#ddd}
.ay-d{color:#d8d8d8;font-size:15px;line-height:1.55;margin:0 0 20px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ay-btns{display:flex;gap:10px;flex-wrap:wrap}
.ay-btn{display:inline-flex;align-items:center;gap:8px;border-radius:8px;padding:11px 22px;font-size:14px;font-weight:700;cursor:pointer;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff}
.ay-btn:hover{background:rgba(255,255,255,.16)}
.ay-btn.p{background:#fff;color:#000;border-color:#fff}.ay-btn.p:hover{background:#e6e6e6}
.ay-nav{position:absolute;right:4%;bottom:56px;z-index:3;display:flex;gap:10px}
.ay-nav button{width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.45);color:#fff;font-size:18px;cursor:pointer}.ay-nav button:hover{background:rgba(255,255,255,.2)}
.ay-feat{display:flex;gap:22px;align-items:center;padding:22px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:center/cover no-repeat;position:relative;overflow:hidden}
.ay-feat::before{content:"";position:absolute;inset:0;background:linear-gradient(to right,rgba(11,11,15,.94) 35%,rgba(11,11,15,.6))}
.ay-feat>*{position:relative}.ay-feat img{width:130px;border-radius:8px;flex:none;box-shadow:0 8px 24px #000a}
.ay-feat .ay-t{font-size:26px;margin:8px 0}
.ay-scroll{display:flex;gap:14px;overflow-x:auto;padding:4px 2px 12px;scroll-behavior:smooth;scrollbar-width:thin}
.ay-card{flex:none;width:150px;cursor:pointer;transition:transform .2s}.ay-card:hover{transform:translateY(-4px)}
.ay-poster{position:relative;aspect-ratio:2/3;border-radius:10px;overflow:hidden;background:#1d1d24}
.ay-poster img{width:100%;height:100%;object-fit:cover;display:block}
.ay-sc{position:absolute;top:7px;right:7px;font-size:11px;font-weight:700;background:rgba(0,0,0,.72);color:#ffd45e;padding:2px 7px;border-radius:6px}
.ay-n{position:absolute;left:4px;bottom:-8px;font-size:54px;font-weight:900;color:transparent;-webkit-text-stroke:2px #ffb7d5;line-height:1;text-shadow:0 2px 10px #000}
.ay-ct{font-size:12px;font-weight:600;margin:8px 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ay-cs{font-size:11px;color:#999}
.ay-rel{position:absolute;top:7px;left:7px;font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;background:#1c8cff;color:#fff;text-transform:uppercase}
.ay-disc{display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:16px}
.ay-tabs{display:inline-flex;gap:4px;padding:3px;border-radius:10px;background:rgba(255,255,255,.06);margin-left:auto}
.ay-tabs button{background:none;border:0;color:#aaa;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer}
.ay-tabs button.on{background:#fff;color:#000}
.ay-q{display:flex;flex-direction:column;gap:6px;max-height:420px;overflow-y:auto;padding-right:4px}
.ay-qi{display:flex;gap:10px;align-items:center;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);cursor:pointer}
.ay-qi:hover,.ay-qi.on{background:rgba(255,126,182,.14);border-color:#ff7eb6}
.ay-qi b{font-size:15px;color:#888;width:30px;flex:none;text-align:center}.ay-qi img{width:38px;height:52px;object-fit:cover;border-radius:5px;flex:none}
.ay-qi div{min-width:0}.ay-qi span{display:block;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ay-qi small{color:#999;font-size:11px}
.ay-dp{position:relative;border-radius:14px;overflow:hidden;min-height:340px;display:flex;align-items:flex-end;background:#1d1d24 center/cover no-repeat;border:1px solid rgba(255,255,255,.1)}
.ay-dp::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(11,11,15,.97) 5%,rgba(11,11,15,.35))}
.ay-dp-in{position:relative;z-index:2;padding:24px;max-width:640px}.ay-dp .ay-t{font-size:32px}
.ay-wide{flex:none;width:300px;height:170px;border-radius:12px;overflow:hidden;position:relative;cursor:pointer;background:#1d1d24 center/cover no-repeat;border:1px solid rgba(255,255,255,.1);transition:transform .2s}.ay-wide:hover{transform:translateY(-4px)}
.ay-wide::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.85),transparent 60%)}
.ay-wide span{position:absolute;left:12px;right:12px;bottom:10px;z-index:2;font-size:13px;font-weight:700}
.ay-arrows{display:flex;gap:8px;margin-left:auto}.ay-arrows button{width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;cursor:pointer}
@media(max-width:800px){.ay-disc{grid-template-columns:1fr}.ay-feat{flex-direction:column;align-items:flex-start}.ay-hero-in{padding-bottom:70px}.ay-nav{bottom:18px}.ay-card{width:124px}}
/* title page */
#shDetail.ay .shd-box{max-width:1180px;background:#0b0b0f}
.ay-det{position:relative;min-height:80vh}
.ay-det-bg{position:absolute;inset:0 0 auto 0;height:420px;background:center/cover no-repeat;opacity:.38}
.ay-det-bg::after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,transparent,#0b0b0f)}
.ay-det-in{position:relative;z-index:2;display:grid;grid-template-columns:230px 1fr;gap:30px;padding:48px 32px 40px}
.ay-side img.ay-pos{width:100%;border-radius:12px;box-shadow:0 10px 30px #000a;display:block}
.ay-side .ay-btns{margin:14px 0}.ay-side .ay-btn{flex:1;justify-content:center}
.ay-info{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);border-radius:12px;padding:6px 16px}
.ay-ir{padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)}.ay-ir:last-child{border:0}
.ay-ir small{display:block;color:#888;font-size:11px;margin-bottom:3px}.ay-ir div{font-size:13px;color:#eee;line-height:1.4}
.ay-ir a{display:inline-block;margin-right:8px;padding:5px 10px;border-radius:8px;background:rgba(255,255,255,.08);color:#fff;font-size:12px;text-decoration:none}
.ay-main .ay-t{font-size:clamp(26px,4vw,44px)}
.ay-sub{color:#888;font-size:14px;margin:0 0 18px}
.ay-ptabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 22px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:18px}
.ay-ptabs button{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#ccc;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
.ay-ptabs button.on{background:#fff;color:#000}
.ay-pane h3{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#bbb;margin:26px 0 12px}.ay-pane h3:first-child{margin-top:0}
.ay-syn{font-size:14px;line-height:1.75;color:#ddd;white-space:pre-line;max-width:820px}
.ay-syn.cl{display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
.ay-more{background:none;border:0;color:#fff;font-weight:700;font-size:13px;cursor:pointer;margin-top:8px;padding:0}
.ay-wtw{display:flex;flex-wrap:wrap;gap:8px}.ay-wtw a{padding:8px 14px;border-radius:8px;border:1px solid #ff7eb6;color:#ffd0e4;text-decoration:none;font-size:13px}.ay-wtw a:hover{background:rgba(255,126,182,.15)}
.ay-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}.ay-grid .ay-card{width:auto}
.ay-chars{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
.ay-ch{display:flex;gap:10px;align-items:center;padding:8px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
.ay-ch img{width:48px;height:64px;object-fit:cover;border-radius:6px;flex:none}.ay-ch b{display:block;font-size:13px}.ay-ch small{color:#999;font-size:11px;text-transform:capitalize}
.ay-tr{position:relative;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000;max-width:820px}.ay-tr iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
@media(max-width:760px){.ay-det-in{grid-template-columns:1fr;padding:48px 16px 30px}.ay-side{max-width:230px}}
`;

  function injectCss() {
    if (document.getElementById('ayCss')) return;
    const s = document.createElement('style');
    s.id = 'ayCss';
    s.textContent = css;
    document.head.appendChild(s);
  }

  const score = (m) => (m.averageScore ? (m.averageScore / 10).toFixed(1) : '');
  const fmt = (f) => String(f || '').replace(/_/g, ' ');
  const plain = (d) => String(d || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
  const sub = (m) => [fmt(m.format), m.episodes ? m.episodes + ' Eps' : (m.nextAiringEpisode ? Math.max(0, m.nextAiringEpisode.episode - 1) + ' Eps' : '')].filter(Boolean).join(' \u00b7 ');
  const cover = (m) => (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || '';
  const statusLabel = (s) => (s === 'RELEASING' ? 'Ongoing' : s === 'NOT_YET_RELEASED' ? 'Upcoming' : s === 'FINISHED' ? 'Finished' : fmt(s));

  function season() {
    const n = new Date(), mo = n.getMonth() + 1;
    return { season: mo <= 3 ? 'WINTER' : mo <= 6 ? 'SPRING' : mo <= 9 ? 'SUMMER' : 'FALL', year: n.getFullYear() };
  }

  async function list(args, vars) {
    vars = vars || {};
    const T = { season: 'MediaSeason', year: 'Int', genre: 'String' };
    const decl = Object.keys(vars).map((k) => '$' + k + ':' + T[k]).join(',');
    const q = 'query' + (decl ? '(' + decl + ')' : '') + '{Page(page:1,perPage:' + (args.per || 20) + '){media(type:ANIME,isAdult:false,' + args.f + '){' + F + '}}}';
    const d = await alq(q, vars);
    return d.Page.media;
  }

  function mk(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function card(m, o) {
    o = o || {};
    const el = mk('div', 'ay-card');
    const img = cover(m);
    el.innerHTML = '<div class="ay-poster"><img loading="lazy" alt="" src="' + esc(img) + '">' +
      (score(m) && !o.noScore ? '<span class="ay-sc">\u2605 ' + esc(score(m)) + '</span>' : '') +
      (o.rel ? '<span class="ay-rel">' + esc(fmt(o.rel)) + '</span>' : '') +
      (o.num ? '<span class="ay-n">' + o.num + '</span>' : '') + '</div>' +
      '<div class="ay-ct">' + esc(atitle(m)) + '</div><div class="ay-cs">' + esc(o.sub || sub(m)) + '</div>';
    const im = el.querySelector('img');
    im.onerror = () => { im.style.visibility = 'hidden'; };
    el.onclick = () => shOpenAnime(m.id);
    return el;
  }

  function section(title, pill, viewAll) {
    const s = mk('section', 'ay-sec');
    const h = mk('div', 'ay-h');
    h.innerHTML = '<h2>' + esc(title) + '</h2>' + (pill ? '<span class="ay-pill">' + esc(pill) + '</span>' : '');
    if (viewAll) {
      const b = mk('button', 'ay-all', 'View all \u203a');
      b.onclick = () => loadRows('tv');
      h.append(b);
    }
    s.append(h);
    return { s, h };
  }

  function rowOf(title, pill, items, o) {
    o = o || {};
    const { s } = section(title, pill, o.all !== false);
    const sc = mk('div', 'ay-scroll');
    items.forEach((m, i) => sc.append(card(m, { num: o.rank ? i + 1 : 0 })));
    s.append(sc);
    return s;
  }

  function badges(m) {
    let h = '';
    if (m.status) h += '<span class="ay-b' + (m.status === 'RELEASING' ? ' on' : '') + '">' + esc(statusLabel(m.status).toUpperCase()) + '</span>';
    if (score(m)) h += '<span class="ay-b sc">\u2605 ' + esc(score(m)) + '</span>';
    if (m.format) h += '<span class="ay-b">' + esc(fmt(m.format)) + '</span>';
    return h;
  }
  const chips = (m, n) => (m.genres || []).slice(0, n || 4).map((g) => '<span class="ay-chip">' + esc(g) + '</span>').join('');

  function wire(root, m) {
    const w = root.querySelector('[data-w]'), d = root.querySelector('[data-d]');
    if (w) w.onclick = () => playAnime(m);
    if (d) d.onclick = () => shOpenAnime(m.id);
  }

  function hero(items) {
    const slides = items.filter((m) => m.bannerImage).slice(0, 6);
    if (!slides.length) return null;
    const el = mk('section', 'ay-hero');
    el.innerHTML = '<div class="ay-hero-bg"></div><div class="ay-hero-in"></div><div class="ay-nav"><button aria-label="Previous">\u2039</button><button aria-label="Next">\u203a</button></div>';
    const bg = el.querySelector('.ay-hero-bg'), inn = el.querySelector('.ay-hero-in');
    let i = 0, timer;
    const show = (n) => {
      i = (n + slides.length) % slides.length;
      const m = slides[i];
      inn.style.opacity = 0;
      setTimeout(() => {
        bg.style.backgroundImage = 'url("' + String(m.bannerImage).replace(/"/g, '%22') + '")';
        inn.innerHTML = '<div class="ay-badges">' + badges(m) + '</div><h1 class="ay-t">' + esc(atitle(m)) + '</h1><div class="ay-chips">' + chips(m, 4) + '</div><p class="ay-d">' + esc(plain(m.description)) + '</p><div class="ay-btns"><button class="ay-btn p" data-w>\u25b6 WATCH NOW</button><button class="ay-btn" data-d>\u24d8 Details</button></div>';
        wire(inn, m);
        inn.style.opacity = 1;
      }, 220);
    };
    const reset = () => {
      clearInterval(timer);
      timer = setInterval(() => { if (!el.isConnected) return clearInterval(timer); show(i + 1); }, 8000);
    };
    const [prev, next] = el.querySelectorAll('.ay-nav button');
    prev.onclick = () => { show(i - 1); reset(); };
    next.onclick = () => { show(i + 1); reset(); };
    show(0);
    reset();
    return el;
  }

  function featured(m) {
    const s = section('Featured Anime', "Editor's pick", false).s;
    const f = mk('div', 'ay-feat');
    if (m.bannerImage) f.style.backgroundImage = 'url("' + String(m.bannerImage).replace(/"/g, '%22') + '")';
    f.innerHTML = '<img alt="" src="' + esc(cover(m)) + '"><div><div class="ay-badges">' + badges(m) + '</div><h3 class="ay-t">' + esc(atitle(m)) + '</h3><div class="ay-chips">' + chips(m, 4) + '</div><p class="ay-d">' + esc(plain(m.description)) + '</p><div class="ay-btns"><button class="ay-btn p" data-w>\u25b6 Watch Now</button><button class="ay-btn" data-d>\u24d8 Details</button></div></div>';
    wire(f, m);
    s.append(f);
    return s;
  }

  function discover(lists) {
    const { s, h } = section('Discover', '', false);
    const tabs = mk('div', 'ay-tabs');
    const names = [['popular', 'Most Popular'], ['top', 'Top Rated'], ['season', 'This Season']];
    names.forEach(([k, n], i) => { const b = mk('button', i ? '' : 'on', n); b.dataset.k = k; tabs.append(b); });
    h.append(tabs);
    const wrap = mk('div', 'ay-disc');
    const q = mk('div', 'ay-q'), panel = mk('div', 'ay-dp');
    wrap.append(q, panel);
    s.append(wrap);

    const feat = (m) => {
      panel.style.backgroundImage = m.bannerImage || cover(m) ? 'url("' + String(m.bannerImage || cover(m)).replace(/"/g, '%22') + '")' : '';
      panel.innerHTML = '<div class="ay-dp-in"><div class="ay-badges">' + badges(m) + '</div><h3 class="ay-t">' + esc(atitle(m)) + '</h3><div class="ay-chips">' + chips(m, 4) + '</div><p class="ay-d">' + esc(plain(m.description)) + '</p><div class="ay-btns"><button class="ay-btn p" data-w>\u25b6 Watch Now</button><button class="ay-btn" data-d>\u24d8 Details</button></div></div>';
      wire(panel, m);
    };
    const fill = (k) => {
      const items = (lists[k] || []).slice(0, 10);
      q.innerHTML = '';
      items.forEach((m, i) => {
        const r = mk('div', 'ay-qi' + (i ? '' : ' on'));
        r.innerHTML = '<b>#' + (i + 1) + '</b><img alt="" src="' + esc((m.coverImage && m.coverImage.large) || '') + '"><div><span>' + esc(atitle(m)) + '</span><small>' + esc(fmt(m.format)) + (score(m) ? ' \u00b7 \u2605 ' + esc(score(m)) : '') + '</small></div>';
        r.onclick = () => { q.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); r.classList.add('on'); feat(m); };
        q.append(r);
      });
      if (items[0]) feat(items[0]); else panel.innerHTML = '';
    };
    tabs.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      fill(b.dataset.k);
    };
    fill('popular');
    return s;
  }

  function genreShowcase(genre, items) {
    const wide = items.filter((m) => m.bannerImage).slice(0, 10);
    if (!wide.length) return null;
    const { s, h } = section('Genre: ' + genre, '', true);
    const ar = mk('div', 'ay-arrows', '<button aria-label="Left">\u2039</button><button aria-label="Right">\u203a</button>');
    h.insertBefore(ar, h.querySelector('.ay-all'));
    h.querySelector('.ay-all').style.marginLeft = '8px';
    const sc = mk('div', 'ay-scroll');
    wide.forEach((m) => {
      const w = mk('div', 'ay-wide', '<span>' + esc(atitle(m)) + '</span>');
      w.style.backgroundImage = 'url("' + String(m.bannerImage).replace(/"/g, '%22') + '")';
      w.onclick = () => shOpenAnime(m.id);
      sc.append(w);
    });
    const [l, r] = ar.querySelectorAll('button');
    l.onclick = () => sc.scrollBy({ left: -620 });
    r.onclick = () => sc.scrollBy({ left: 620 });
    s.append(sc);
    return s;
  }

  async function home(target) {
    injectCss();
    target.innerHTML = '<div class="sh-loading" style="padding-top:120px">Loading anime from AniList\u2026</div>';
    const ss = season();
    const genre = SHOW_GENRES[Math.floor(Math.random() * SHOW_GENRES.length)];
    const jobs = [
      list({ f: 'sort:TRENDING_DESC', per: 20 }),
      list({ f: 'sort:POPULARITY_DESC', per: 30 }),
      list({ f: 'sort:SCORE_DESC,popularity_greater:30000', per: 10 }),
      list({ f: 'sort:POPULARITY_DESC,season:$season,seasonYear:$year', per: 20 }, ss),
      list({ f: 'sort:UPDATED_AT_DESC,status:RELEASING,popularity_greater:3000,format_in:[TV,ONA]', per: 20 }),
      list({ f: 'sort:POPULARITY_DESC,genre:$genre', per: 14 }, { genre }),
      list({ f: 'sort:POPULARITY_DESC,status:NOT_YET_RELEASED', per: 20 }),
    ];
    const res = await Promise.allSettled(jobs);
    if (res[0].status !== 'fulfilled') throw res[0].reason;
    const [trending, popular, top, seasonal, recent, byGenre, upcoming] = res.map((r) => (r.status === 'fulfilled' ? r.value : []));

    target.innerHTML = '';
    const h = hero(trending);
    if (h) target.append(h); else target.style.paddingTop = '96px';

    const hist = LS(hKey(), []);
    if (hist.length) {
      const row = rowEl('Continue Watching', hist.map(hItem), 'movie', { rm: (i) => { SV(hKey(), LS(hKey(), []).filter((x) => x.id !== i.id)); loadRows(); } });
      row.style.marginTop = '30px';
      target.append(row);
    }
    const pool = popular.filter((m) => m.bannerImage);
    if (pool.length) target.append(featured(pool[Math.floor(Math.random() * Math.min(pool.length, 12))]));
    if (trending.length) target.append(rowOf('Trending Now', 'Hot', trending));
    if (popular.length) target.append(discover({ popular, top, season: seasonal }));
    if (seasonal.length) target.append(rowOf('Popular This Season', '', seasonal));
    if (recent.length) target.append(rowOf('Recent Updates', 'New', recent));
    const g = genreShowcase(genre, byGenre);
    if (g) target.append(g);
    if (upcoming.length) target.append(rowOf('Upcoming Releases', 'Anticipated', upcoming));
    const tail = mk('div', '');
    tail.style.marginTop = '34px';
    tail.append(gamesRow(), freeRow());
    target.append(tail);
  }

  /* ---------------- title page ---------------- */
  const DQ = 'query($id:Int){Media(id:$id,type:ANIME){id idMal siteUrl isAdult title{romaji english native} coverImage{extraLarge large} bannerImage format episodes duration averageScore seasonYear genres status startDate{year month day} endDate{year month day} description(asHtml:false) trailer{id site} studios(isMain:true){nodes{name}} nextAiringEpisode{episode airingAt} externalLinks{site url type} characters(sort:[ROLE,FAVOURITES_DESC],perPage:12){edges{role node{name{full} image{medium}}}} relations{edges{relationType(version:2) node{id type isAdult title{romaji english} format seasonYear coverImage{large}}}}}}';

  const dstr = (d) => (d && d.year ? (d.month ? MON[d.month - 1] + ' ' : '') + (d.day ? d.day + ', ' : '') + d.year : '');

  async function detail(id) {
    injectCss();
    const my = H().bump(), body = $('shDetailBody'), box = $('shDetail');
    box.classList.add('ay', 'open');
    body.innerHTML = '<div class="sh-loading" style="padding:120px 20px;text-align:center">Loading\u2026</div>';
    document.body.style.overflow = 'hidden';
    box.scrollTop = 0;
    let m;
    try {
      const d = await alq(DQ, { id: Number(id) });
      m = d.Media;
      if (!m || m.isAdult) throw Error('Not found');
    } catch (e) {
      if (my === H().req()) body.innerHTML = '<div class="sh-loading" style="padding:80px 20px">Could not load this title.</div>';
      return;
    }
    if (my !== H().req()) return;

    const bg = m.bannerImage || cover(m);
    const studio = ((m.studios || {}).nodes || []).map((x) => esc(x.name)).join(', ');
    const aired = dstr(m.startDate) ? dstr(m.startDate) + ' to ' + (dstr(m.endDate) || '?') : '';
    const eps = m.episodes ? (m.status === 'RELEASING' && m.nextAiringEpisode ? Math.max(0, m.nextAiringEpisode.episode - 1) + ' / ' + m.episodes : String(m.episodes)) : (m.nextAiringEpisode ? Math.max(0, m.nextAiringEpisode.episode - 1) + ' aired' : '');
    const row = (k, v) => (v ? '<div class="ay-ir"><small>' + k + '</small><div>' + v + '</div></div>' : '');
    const trackers = '<a href="' + esc(m.siteUrl || 'https://anilist.co/anime/' + m.id) + '" target="_blank" rel="noopener noreferrer">AniList</a>' + (m.idMal ? '<a href="https://myanimelist.net/anime/' + esc(m.idMal) + '" target="_blank" rel="noopener noreferrer">MyAnimeList</a>' : '');
    const trailer = m.trailer && m.trailer.site && m.trailer.site.toLowerCase() === 'youtube' ? m.trailer.id : '';

    body.innerHTML = '<div class="ay-det"><div class="ay-det-bg"' + (bg ? ' style="background-image:url(\'' + esc(bg) + '\')"' : '') + '></div><div class="ay-det-in">' +
      '<aside class="ay-side"><img class="ay-pos" alt="" src="' + esc(cover(m)) + '"><div class="ay-btns"><button class="ay-btn p" data-w>\u25b6 Watch Now</button></div><div class="ay-info">' +
      row('Format', esc(fmt(m.format))) + row('Episodes', esc(eps)) + row('Status', esc(statusLabel(m.status))) + row('Aired Dates', esc(aired)) +
      row('Duration', m.duration ? esc(m.duration) + ' min' : '') + row('Studios', studio) + row('Trackers', trackers) + '</div></aside>' +
      '<main class="ay-main"><div class="ay-chips">' + (score(m) ? '<span class="ay-b sc">\u2605 ' + esc(score(m)) + '</span>' : '') + chips(m, 8) + '</div>' +
      '<h1 class="ay-t">' + esc(atitle(m)) + '</h1><div class="ay-sub">' + esc([m.title.romaji, m.title.native].filter((x) => x && x !== atitle(m)).join(' \u00b7 ')) + '</div>' +
      '<div class="ay-ptabs"></div><div class="ay-pane"></div></main></div></div>';

    body.querySelector('[data-w]').onclick = () => playAnime(m);
    const tabsEl = body.querySelector('.ay-ptabs'), pane = body.querySelector('.ay-pane');

    const rels = ((m.relations || {}).edges || []).filter((e) => e.node && e.node.type === 'ANIME' && !e.node.isAdult);
    const chars = ((m.characters || {}).edges || []).filter((e) => e.node);
    const links = (m.externalLinks || []).filter((l) => l.type === 'STREAMING' && /^https?:\/\//i.test(l.url));

    const panes = {
      Overview() {
        const p = mk('div');
        const syn = plain(m.description) || 'No synopsis available.';
        p.append(mk('h3', '', 'Synopsis'));
        const sy = mk('div', 'ay-syn' + (syn.length > 420 ? ' cl' : ''));
        sy.textContent = syn;
        p.append(sy);
        if (syn.length > 420) {
          const b = mk('button', 'ay-more', 'Read More');
          b.onclick = () => { const c = sy.classList.toggle('cl'); b.textContent = c ? 'Read More' : 'Show Less'; };
          p.append(b);
        }
        if (m.nextAiringEpisode) {
          const n = mk('div', 'ay-sub', '');
          n.style.marginTop = '14px';
          n.textContent = 'Next episode: #' + m.nextAiringEpisode.episode + ' on ' + new Date(m.nextAiringEpisode.airingAt * 1000).toLocaleDateString();
          p.append(n);
        }
        p.append(mk('h3', '', 'Where to watch'));
        const w = mk('div', 'ay-wtw');
        if (links.length) links.forEach((l) => { const a = mk('a'); a.href = l.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = '\u25b6 ' + l.site; w.append(a); });
        else w.textContent = 'No official streaming links are listed on AniList for this title.';
        p.append(w);
        if (rels.length) {
          p.append(mk('h3', '', 'Related Seasons & Series'));
          const g = mk('div', 'ay-grid');
          rels.slice(0, 12).forEach((e) => g.append(card(e.node, { rel: e.relationType, noScore: true, sub: [fmt(e.node.format), e.node.seasonYear].filter(Boolean).join(' \u00b7 ') })));
          p.append(g);
        }
        return p;
      },
      Characters() {
        const p = mk('div');
        p.append(mk('h3', '', 'Characters'));
        if (!chars.length) { p.append(mk('div', 'ay-sub', 'No characters listed.')); return p; }
        const g = mk('div', 'ay-chars');
        chars.forEach((e) => {
          const c = mk('div', 'ay-ch', '<img alt="" src="' + esc((e.node.image && e.node.image.medium) || '') + '"><div><b>' + esc(e.node.name && e.node.name.full) + '</b><small>' + esc(String(e.role || '').toLowerCase()) + '</small></div>');
          g.append(c);
        });
        p.append(g);
        return p;
      },
      Trailer() {
        const p = mk('div');
        p.append(mk('h3', '', 'Trailer'));
        p.append(mk('div', 'ay-tr', '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(trailer) + '" allow="encrypted-media;fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'));
        return p;
      },
    };

    const names = ['Overview'];
    if (chars.length) names.push('Characters');
    if (trailer) names.push('Trailer');
    const open = (n) => {
      tabsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.textContent === n));
      pane.innerHTML = '';
      pane.append(panes[n]());
    };
    names.forEach((n) => { const b = mk('button', '', n); b.onclick = () => open(n); tabsEl.append(b); });
    open('Overview');
  }

  window.shAnime = { home, detail };
})();
