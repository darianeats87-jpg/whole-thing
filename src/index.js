// Projection Studios on Cloudflare Workers: API + D1 database + Durable Object for chat / Watch Together.
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const enc = new TextEncoder();
const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const hmacKey = (secret) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function signJwt(payload, secret) {
  const h = b64u(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const p = b64u(enc.encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 7 * 86400 })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(h + '.' + p));
  return h + '.' + p + '.' + b64u(sig);
}
async function verifyJwt(tok, secret) {
  try {
    const [h, p, s] = tok.split('.');
    if (!await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64u(s), enc.encode(h + '.' + p))) return null;
    const d = JSON.parse(new TextDecoder().decode(unb64u(p)));
    return d.exp > Date.now() / 1000 ? d : null;
  } catch { return null; }
}
async function hashPw(pw, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, k, 256);
  return b64u(salt) + '.' + b64u(bits);
}
const safeEq = (a, b) => { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };
const checkPw = async (pw, stored) => { try { return safeEq(await hashPw(pw, unb64u(String(stored).split('.')[0])), stored); } catch { return false; } };

// ---- input hygiene + abuse limits (security hardening) ----
// cleanText: strips control/bidi characters and angle brackets, collapses whitespace, caps length.
const cleanText = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
// cleanPoster: TMDB poster paths only (e.g. /abc123.jpg). Anything else becomes null.
const cleanPoster = (v) => (typeof v === 'string' && /^\/[A-Za-z0-9_-]{5,60}\.(jpg|jpeg|png|webp)$/.test(v) ? v : null);
// httpsUrl: valid https URL without credentials, or ''.
const httpsUrl = (v, max = 600) => { try { const u = new URL(String(v || '').trim()); return u.protocol === 'https:' && !u.username && !u.password && u.href.length <= max ? u.href : ''; } catch { return ''; } };
const RESERVED = /^(admin|administrator|root|support|staff|moderator|mod|system|streamhub|projection|studios|projectionstudios|netflix|official|security|help)$/i;
// Streaming body reader with a hard byte cap (does not trust Content-Length). Returns null when too large.
async function readJson(req, max = 150000) {
  if (Number(req.headers.get('content-length') || 0) > max) return null;
  if (!req.body) return {};
  const reader = req.body.getReader(), chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength; if (total > max) { try { await reader.cancel(); } catch {} return null; }
    chunks.push(value);
  }
  const buf = new Uint8Array(total); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  try { const v = JSON.parse(new TextDecoder().decode(buf)); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
// Durable rate limit (D1). Returns true when the caller is OVER the limit. Fails open if D1 errors.
async function limited(env, key, max, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  try {
    const r = await env.DB.prepare('INSERT INTO rate_limits(k,n,reset_at) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=CASE WHEN reset_at<=? THEN 1 ELSE n+1 END, reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END RETURNING n')
      .bind(key, now + windowSec, now, now, now + windowSec).first();
    if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM rate_limits WHERE reset_at<? AND k NOT LIKE 'migr:%'").bind(now).run();
    return !!r && r.n > max;
  } catch { return false; }
}
// Cheap per-isolate limiter for high-volume, low-risk routes (best effort only).
const MEM = new Map();
function memLimit(ip, k, max, sec) {
  const now = Date.now(), key = k + ':' + ip; let e = MEM.get(key);
  if (!e || e.r < now) { e = { n: 0, r: now + sec * 1000 }; MEM.set(key, e); }
  e.n++;
  if (MEM.size > 5000) for (const [kk, vv] of MEM) if (vv.r < now) MEM.delete(kk);
  return e.n > max;
}
// Watch-sync payloads are rebuilt from a whitelist so nobody can relay arbitrary data/URLs to a room.
function cleanSync(d) {
  if (!d || typeof d !== 'object') return null;
  const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : def; };
  if (d.action === 'src') { const src = httpsUrl(d.src, 600); return src ? { action: 'src', src, title: cleanText(d.title, 80) || 'a video' } : null; }
  if (d.action === 'play') {
    const id = int(d.mediaId, 1, 1e9, 0); if (!id) return null;
    const o = { action: 'play', mediaId: id, mediaType: d.mediaType === 'tv' ? 'tv' : 'movie', title: cleanText(d.title, 120) || 'a title', season: int(d.season, 1, 999, 1), episode: int(d.episode, 1, 9999, 1) };
    if (d.seasons != null) o.seasons = int(d.seasons, 1, 999, 1);
    return o;
  }
  if (d.action === 'ctl') { const t = Number(d.t); if (!['play', 'pause', 'seek', 'tick'].includes(d.op) || !Number.isFinite(t) || t < 0 || t > 1e6) return null; return { action: 'ctl', op: d.op, t, playing: !!d.playing }; }
  return null;
}
// Title name/poster come from TMDB itself, never from the client, so nobody can inject text into the Popular row.
async function tmdbMeta(env, ctx, t, id) {
  if (!env.TMDB_API_KEY) return null;
  const cache = caches.default, key = new Request('https://tmdb-meta.invalid/' + t + '/' + id);
  try { const hit = await cache.match(key); if (hit) return await hit.json(); } catch {}
  try {
    const r = await fetch('https://api.themoviedb.org/3/' + t + '/' + id + '?api_key=' + encodeURIComponent(env.TMDB_API_KEY));
    if (!r.ok) return null;
    const d = await r.json(), slim = { title: cleanText(d.title || d.name || '', 120), poster: cleanPoster(d.poster_path), adult: !!d.adult };
    if (!slim.title) return null;
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(slim), { headers: { 'cache-control': 'public, max-age=86400' } })));
    return slim;
  } catch { return null; }
}

let ready;
export const init = (env) => ready || (ready = env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS rate_limits(k TEXT PRIMARY KEY,n INTEGER NOT NULL,reset_at INTEGER NOT NULL)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE NOT NULL,username TEXT NOT NULL,display_name TEXT NOT NULL,bio TEXT DEFAULT '',avatar TEXT DEFAULT '',password_hash TEXT NOT NULL,created_at TEXT)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS profiles(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,name TEXT NOT NULL,kids INTEGER DEFAULT 0,avatar INTEGER DEFAULT 0,data TEXT DEFAULT '{}')`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS title_reviews(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,media_id INTEGER NOT NULL,media_type TEXT NOT NULL,rating INTEGER NOT NULL,comment TEXT DEFAULT '',created_at TEXT NOT NULL,UNIQUE(user_id,media_id,media_type))`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS watch_presence(user_id INTEGER NOT NULL,profile_id INTEGER NOT NULL,media_id INTEGER,media_type TEXT,title TEXT,poster TEXT,season INTEGER,episode INTEGER,last_at TEXT NOT NULL,PRIMARY KEY(user_id,profile_id))`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS game_scores(user_id INTEGER NOT NULL,game TEXT NOT NULL,wins INTEGER DEFAULT 0,losses INTEGER DEFAULT 0,draws INTEGER DEFAULT 0,updated_at TEXT,PRIMARY KEY(user_id,game))`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS chat_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,room TEXT NOT NULL,username TEXT NOT NULL,display_name TEXT NOT NULL,body TEXT NOT NULL,kind TEXT DEFAULT 'text',created_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS chat_room_time ON chat_messages(room,created_at)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS friends(id INTEGER PRIMARY KEY AUTOINCREMENT,a INTEGER NOT NULL,b INTEGER NOT NULL,status TEXT NOT NULL,created_at TEXT,UNIQUE(a,b))`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS dm_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,sender_id INTEGER NOT NULL,recipient_id INTEGER NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS dm_pair_time ON dm_messages(sender_id,recipient_id,id)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,type TEXT NOT NULL,data TEXT DEFAULT '{}',status TEXT DEFAULT 'new',created_at TEXT)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS popular(media_id INTEGER NOT NULL,media_type TEXT NOT NULL,title TEXT,poster TEXT,count INTEGER DEFAULT 0,last_at TEXT,PRIMARY KEY(media_id,media_type))`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS watch_history(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,media_id INTEGER NOT NULL,media_type TEXT NOT NULL,title TEXT NOT NULL,poster_path TEXT,watched_at TEXT,UNIQUE(user_id,media_id,media_type))`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS playback_progress(user_id INTEGER NOT NULL,media_id INTEGER NOT NULL,media_type TEXT NOT NULL,title TEXT NOT NULL,poster_path TEXT,season INTEGER NOT NULL DEFAULT 0,episode INTEGER NOT NULL DEFAULT 0,seconds REAL NOT NULL DEFAULT 0,duration REAL NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,media_id,media_type,season,episode))`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS shared_lists(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_id INTEGER NOT NULL,name TEXT NOT NULL,created_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS shared_list_members(list_id INTEGER NOT NULL,user_id INTEGER NOT NULL,role TEXT NOT NULL DEFAULT 'member',added_at TEXT NOT NULL,PRIMARY KEY(list_id,user_id))`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS shared_list_items(id INTEGER PRIMARY KEY AUTOINCREMENT,list_id INTEGER NOT NULL,media_id INTEGER NOT NULL,media_type TEXT NOT NULL,title TEXT NOT NULL,poster TEXT,added_by INTEGER NOT NULL,created_at TEXT NOT NULL,UNIQUE(list_id,media_id,media_type))`),
]).then(async () => { for (const q of ['ALTER TABLE profiles ADD COLUMN pic TEXT', 'ALTER TABLE profiles ADD COLUMN pin_hash TEXT', 'ALTER TABLE chat_messages ADD COLUMN meta TEXT', 'ALTER TABLE users ADD COLUMN is_private INTEGER DEFAULT 0', 'ALTER TABLE users ADD COLUMN allow_requests INTEGER DEFAULT 1']) await env.DB.prepare(q).run().catch(() => {});
  // One-time: the Popular list used to accept unauthenticated writes, so clear anything that may have been injected.
  try { const f = await env.DB.prepare("INSERT OR IGNORE INTO rate_limits(k,n,reset_at) VALUES('migr:popular-purge-1',1,9999999999)").run(); if (f.meta && f.meta.changes) await env.DB.prepare('DELETE FROM popular').run(); } catch {}
}).catch((e) => { ready = null; throw e; }));

const TMDB_OK = /^(trending\/(movie|tv)\/(day|week)|((movie|tv)\/(popular|top_rated|now_playing|on_the_air|upcoming))|(search\/(movie|tv|multi))|(discover\/(movie|tv))|(genre\/(movie|tv)\/list)|(movie|tv|person)\/\d+(\/season\/\d+)?)$/;
const userOut = (u) => ({ id: u.id, email: u.email, username: u.username, displayName: u.display_name, bio: u.bio || '', avatar: u.avatar || '', private: !!u.is_private, allowRequests: u.allow_requests !== 0 });
const PROFILE_FIELDS = 'id,name,kids,avatar,(pic IS NOT NULL) AS pic,(pin_hash IS NOT NULL) AS has_pin';
const picOk = (v) => typeof v === 'string' && v.length < 90000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(v);
const profOut = (r) => ({ id: r.id, name: r.name, kids: !!r.kids, avatar: r.avatar, pic: !!r.pic, hasPin: !!r.has_pin });
const cleanList = (a) => (Array.isArray(a) ? a : []).slice(0, 60).map((x) => ({
  id: Number(x.id) || 0, type: x.type === 'tv' ? 'tv' : 'movie', title: cleanText(x.title, 200),
  poster: cleanPoster(x.poster),
  season: Number(x.season) || undefined, episode: Number(x.episode) || undefined, t: Number(x.t) || undefined,
}));


// ---- AniList (official, free GraphQL API) proxy for anime mode ----
const AL_GENRES = new Set(['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mahou Shoujo','Mecha','Music','Mystery','Psychological','Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller']);
const AL_SORT = new Set(['TRENDING_DESC', 'POPULARITY_DESC', 'SCORE_DESC', 'START_DATE_DESC']);
const AL_LIST = 'id title{romaji english native} coverImage{large} format episodes averageScore seasonYear genres status';
const AL_FULL = 'id idMal isAdult title{romaji english native} coverImage{extraLarge large} bannerImage format episodes duration averageScore seasonYear season genres status description(asHtml:false) trailer{id site} studios(isMain:true){nodes{name}} nextAiringEpisode{episode airingAt} externalLinks{site url type}';
async function anilist(env, query, variables) {
  let last = 'unknown error';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(env.ANILIST_URL || 'https://graphql.anilist.co', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'ProjectionStudios/1.0 (Cloudflare Worker)' }, body: JSON.stringify({ query, variables }) });
      const text = await r.text();
      let d = {}; try { d = JSON.parse(text); } catch {}
      if (r.ok && !d.errors && d.data) return d.data;
      last = 'HTTP ' + r.status + ': ' + ((d.errors && d.errors[0] && d.errors[0].message) || text.replace(/\s+/g, ' ').slice(0, 160));
      if (r.status !== 429 && r.status < 500) break;
      await new Promise((res) => setTimeout(res, 700));
    } catch (e) { last = 'network: ' + String(e && e.message || e).slice(0, 160); await new Promise((res) => setTimeout(res, 400)); }
  }
  throw new Error(last);
}
function seasonNow() { const d = new Date(), m = d.getUTCMonth() + 1; return { season: m <= 3 ? 'WINTER' : m <= 6 ? 'SPRING' : m <= 9 ? 'SUMMER' : 'FALL', year: d.getUTCFullYear() }; }
async function animeApi(req, env, url, ctx) {
  const cache = caches.default, key = new Request(url.toString());
  const hit = await cache.match(key); if (hit) return hit;
  let out;
  try {
    const dm = url.pathname.match(/^\/api\/anime\/(\d+)$/);
    if (dm) {
      const d = await anilist(env, `query($id:Int){Media(id:$id,type:ANIME){${AL_FULL}}}`, { id: Number(dm[1]) });
      if (!d.Media || d.Media.isAdult) return J({ error: 'Not found.' }, 404);
      out = { media: d.Media };
    } else if (url.pathname === '/api/anime/list') {
      const q = url.searchParams;
      const v = { page: Math.max(1, Number(q.get('page')) || 1), per: Math.min(30, Math.max(1, Number(q.get('per')) || 20)), sort: [AL_SORT.has(q.get('sort')) ? q.get('sort') : 'POPULARITY_DESC'] };
      const f = q.get('format');
      if (f === 'movie') v.fin = ['MOVIE']; else if (f === 'tv') v.fin = ['TV', 'TV_SHORT', 'ONA'];
      if (['RELEASING', 'FINISHED', 'NOT_YET_RELEASED'].includes(q.get('status'))) v.status = q.get('status');
      if (q.get('season') === 'now') { const n = seasonNow(); v.season = n.season; v.year = n.year; }
      if (/^\d{4}$/.test(q.get('year') || '')) v.year = Number(q.get('year'));
      if (AL_GENRES.has(q.get('genre'))) v.genre = q.get('genre');
      if (q.get('q')) v.search = String(q.get('q')).slice(0, 80);
      if (v.sort[0] === 'SCORE_DESC') v.pop = 30000;
      if (v.sort[0] === 'START_DATE_DESC') v.notyet = 'NOT_YET_RELEASED';
      const d = await anilist(env, `query($page:Int,$per:Int,$sort:[MediaSort],$fin:[MediaFormat],$status:MediaStatus,$notyet:MediaStatus,$season:MediaSeason,$year:Int,$genre:String,$search:String,$pop:Int){Page(page:$page,perPage:$per){media(type:ANIME,isAdult:false,sort:$sort,format_in:$fin,status:$status,status_not:$notyet,season:$season,seasonYear:$year,genre:$genre,search:$search,popularity_greater:$pop){${AL_LIST}}}}`, v);
      out = { media: d.Page.media };
    } else return J({ error: 'Not found.' }, 404);
  } catch (e) { return J({ error: 'AniList request failed.', detail: String(e.message).slice(0, 300) }, 502); }
  const res = new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=600' } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function api(req, env, url, ctx) {
  const path = url.pathname, method = req.method;
  if (path === '/api/health') return J({ ok: true, service: 'Projection Studios API (Cloudflare)', database: !!env.DB, tmdb: !!env.TMDB_API_KEY });

  if (path.startsWith('/api/anime/')) return animeApi(req, env, url, ctx);

  if (path.startsWith('/api/tmdb/')) {
    if (!env.TMDB_API_KEY) return J({ error: 'TMDB_API_KEY is not configured on the backend.' }, 503);
    const p = path.slice('/api/tmdb/'.length);
    if (!TMDB_OK.test(p)) return J({ error: 'Unsupported TMDB endpoint.' }, 400);
    if (memLimit(req.headers.get('CF-Connecting-IP') || 'x', 'tmdb', 300, 60)) return J({ error: 'Too many requests. Slow down.' }, 429);
    const u = new URL('https://api.themoviedb.org/3/' + p);
    let nParams = 0;
    for (const [k, v] of url.searchParams) { if (++nParams > 25 || k.length > 40 || v.length > 200 || k === 'api_key' || k === 'include_adult') continue; u.searchParams.set(k, v); }
    u.searchParams.set('include_adult', 'false');
    u.searchParams.set('api_key', env.TMDB_API_KEY);
    try { const r = await fetch(u, { cf: { cacheTtl: 300, cacheEverything: true } }); return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=120' } }); }
    catch { return J({ error: 'TMDB request failed.' }, 502); }
  }
  if (!env.DB) return J({ error: 'Database not configured.' }, 503);
  await init(env);
  const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await readJson(req) : {};
  if (body === null) return J({ error: 'Request body too large.' }, 413);
  const clientIp = req.headers.get('CF-Connecting-IP') || 'unknown';

  if (path === '/api/chat/history') {
    const room = String(url.searchParams.get('room') || 'public').slice(0, 80);
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    const q = await env.DB.prepare('SELECT id,username,display_name AS displayName,body,kind,created_at AS createdAt,meta FROM chat_messages WHERE room=? AND created_at>? ORDER BY id DESC LIMIT 100').bind(room, cutoff).all();
    return J(q.results.reverse().map((r) => { let m = {}; try { m = JSON.parse(r.meta || '{}'); } catch {} delete r.meta; return { ...r, avatar: m.avatar, pid: m.pid, pic: m.pic }; }));
  }

  if (path === '/api/auth/signup') {
    if (!env.JWT_SECRET) return J({ error: 'JWT_SECRET is not set on the server.' }, 503);
    if (await limited(env, 'signup:' + clientIp, 8, 3600)) return J({ error: 'Too many sign-ups from this network. Please try again later.' }, 429);
    const { email, password, username, displayName } = body;
    const emailValue = String(email || '').trim().toLowerCase();
    const usernameValue = String(username || '').trim();
    const passwordValue = String(password || '');
    if (!emailValue || emailValue.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue) ||
        passwordValue.length < 12 || passwordValue.length > 128 || !/[A-Za-z]/.test(passwordValue) || !/[0-9]/.test(passwordValue) ||
        !/^[A-Za-z0-9_.-]{3,30}$/.test(usernameValue)) {
      return J({ error: 'Use a valid email, a 3–30 character username (letters, numbers, . _ -), and a 12–128 character password containing letters and numbers.' }, 400);
    }
    if (RESERVED.test(usernameValue)) return J({ error: 'That username is not available.' }, 409);
    if (await env.DB.prepare('SELECT id FROM users WHERE lower(username)=lower(?)').bind(usernameValue).first()) return J({ error: 'That username is already taken.' }, 409);
    const shownName = cleanText(displayName || usernameValue, 40) || usernameValue;
    try {
      const r = await env.DB.prepare('INSERT INTO users(email,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)')
        .bind(emailValue, usernameValue, shownName, await hashPw(passwordValue), new Date().toISOString()).run();
      const u = userOut({ id: r.meta.last_row_id, email: emailValue, username: usernameValue, display_name: shownName });
      return J({ token: await signJwt({ id: u.id, email: u.email, username: u.username, displayName: u.displayName }, env.JWT_SECRET), user: u }, 201);
    } catch (e) { return J({ error: /UNIQUE/i.test(String(e.message)) ? 'That email is already registered.' : 'Could not create account.' }, /UNIQUE/i.test(String(e.message)) ? 409 : 500); }
  }
  if (path === '/api/auth/login') {
    if (!env.JWT_SECRET) return J({ error: 'JWT_SECRET is not set on the server.' }, 503);
    const loginEmail = String(body.email || '').trim().toLowerCase();
    const loginPassword = String(body.password || '');
    if (!loginEmail || loginEmail.length > 254 || loginPassword.length > 128) return J({ error: 'Email or password is incorrect.' }, 401);
    if (await limited(env, 'login:ip:' + clientIp, 40, 900) || await limited(env, 'login:em:' + loginEmail, 10, 900)) return J({ error: 'Too many sign-in attempts. Please wait a few minutes and try again.' }, 429);
    const row = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(loginEmail).first();
    if (!row) { await hashPw(loginPassword); return J({ error: 'Email or password is incorrect.' }, 401); } // equalise timing so emails can't be enumerated
    if (!await checkPw(loginPassword, row.password_hash)) return J({ error: 'Email or password is incorrect.' }, 401);
    const u = userOut(row);
    return J({ token: await signJwt({ id: u.id, email: u.email, username: u.username, displayName: u.displayName }, env.JWT_SECRET), user: u });
  }

  if (path === '/api/popular' && method === 'GET') {
    const q = await env.DB.prepare('SELECT media_id,media_type,title,poster,count FROM popular ORDER BY count DESC, last_at DESC LIMIT 20').all();
    return J(q.results.map((r) => ({ media_id: r.media_id, media_type: r.media_type === 'tv' ? 'tv' : 'movie', title: cleanText(r.title, 120), poster: cleanPoster(r.poster), count: r.count })));
  }
  if (path === '/api/watched' && method === 'POST') {
    // Signed-in only, rate limited, and the stored title/poster are fetched from TMDB (client text is ignored).
    const who = env.JWT_SECRET ? await verifyJwt((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), env.JWT_SECRET) : null;
    if (!who) return J({ error: 'Please sign in again.' }, 401);
    if (await limited(env, 'watched:' + who.id, 200, 3600)) return J({ ok: true });
    const id = Number(body.mediaId), t = body.mediaType === 'tv' ? 'tv' : body.mediaType === 'movie' ? 'movie' : null;
    if (!Number.isInteger(id) || id < 1 || id > 1e9 || !t) return J({ error: 'Invalid.' }, 400);
    const meta = await tmdbMeta(env, ctx, t, id);
    if (!meta || meta.adult) return J({ error: 'Unknown title.' }, 404);
    await env.DB.prepare('INSERT INTO popular(media_id,media_type,title,poster,count,last_at) VALUES(?,?,?,?,1,?) ON CONFLICT(media_id,media_type) DO UPDATE SET count=count+1,title=excluded.title,poster=COALESCE(excluded.poster,poster),last_at=excluded.last_at')
      .bind(id, t, meta.title, meta.poster, new Date().toISOString()).run();
    return J({ ok: true });
  }

  const pm = path.match(/^\/api\/pic\/(\d+)$/);
  if (pm) {
    const row = await env.DB.prepare('SELECT pic FROM profiles WHERE id=?').bind(Number(pm[1])).first();
    const mt = row && row.pic && row.pic.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/=]+)$/);
    if (!mt) return new Response('Not found', { status: 404 });
    return new Response(Uint8Array.from(atob(mt[2]), (c) => c.charCodeAt(0)), { headers: { 'content-type': mt[1], 'cache-control': 'no-cache' } });
  }

  // everything below needs a signed-in user
  const me = env.JWT_SECRET ? await verifyJwt((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), env.JWT_SECRET) : null;
  if (!me) return J({ error: 'Please sign in again.' }, 401);


  // Cloud-backed playback progress. Every row is scoped to the authenticated account.
  if (path === '/api/progress/remove' && method === 'POST') {
    const id=Number(body.mediaId), type=body.mediaType==='tv'?'tv':body.mediaType==='movie'?'movie':'', season=Math.max(0,Math.min(100,Math.floor(Number(body.season)||0))), episode=Math.max(0,Math.min(1000,Math.floor(Number(body.episode)||0)));
    if(!Number.isSafeInteger(id)||id<1||!type)return J({error:'Invalid media.'},400);
    await env.DB.prepare('DELETE FROM playback_progress WHERE user_id=? AND media_id=? AND media_type=? AND season=? AND episode=?').bind(me.id,id,type,season,episode).run();return J({ok:true});
  }
  if (path === '/api/progress' && method === 'GET') {
    const q = await env.DB.prepare('SELECT media_id AS id,media_type AS type,title,poster_path AS poster,season,episode,seconds,duration,updated_at AS updatedAt FROM playback_progress WHERE user_id=? AND seconds>0 AND duration>seconds ORDER BY updated_at DESC LIMIT 60').bind(me.id).all();
    return J(q.results);
  }
  if (path === '/api/progress' && method === 'POST') {
    const id = Number(body.mediaId), type = body.mediaType === 'tv' ? 'tv' : body.mediaType === 'movie' ? 'movie' : '', season = type === 'tv' ? Math.max(1, Math.min(100, Math.floor(Number(body.season)||1))) : 0, episode = type === 'tv' ? Math.max(1, Math.min(1000, Math.floor(Number(body.episode)||1))) : 0, seconds = Number(body.seconds), duration = Number(body.duration), title = cleanText(body.title, 200), poster = cleanPoster(body.posterPath);
    if (!Number.isSafeInteger(id) || id < 1 || !type || !title || !Number.isFinite(seconds) || !Number.isFinite(duration) || seconds < 0 || duration <= 0 || seconds > duration + 5 || duration > 86400*10) return J({error:'Invalid playback progress.'},400);
    if (seconds >= duration - 20) {
      await env.DB.prepare('DELETE FROM playback_progress WHERE user_id=? AND media_id=? AND media_type=? AND season=? AND episode=?').bind(me.id,id,type,season,episode).run();
      return J({ok:true,completed:true});
    }
    await env.DB.prepare('INSERT INTO playback_progress(user_id,media_id,media_type,title,poster_path,season,episode,seconds,duration,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,media_id,media_type,season,episode) DO UPDATE SET title=excluded.title,poster_path=COALESCE(excluded.poster_path,playback_progress.poster_path),seconds=excluded.seconds,duration=excluded.duration,updated_at=excluded.updated_at').bind(me.id,id,type,title,poster,season,episode,seconds,duration,new Date().toISOString()).run();
    return J({ok:true});
  }

  // ===== people, friends, notifications, profile sharing =====
  const now = new Date().toISOString(), myName = String(me.displayName || me.username || 'Someone').slice(0, 40);
  const friendRow = (x, y) => env.DB.prepare('SELECT id,a,b,status FROM friends WHERE (a=? AND b=?) OR (a=? AND b=?)').bind(x, y, y, x).first();
  const relOf = (f) => (!f ? 'none' : f.status === 'accepted' ? 'friends' : (f.a === me.id ? 'pending_out' : 'pending_in'));
  const notify = (uid, type, data) => env.DB.prepare('INSERT INTO notifications(user_id,type,data,status,created_at) VALUES(?,?,?,?,?)').bind(uid, type, JSON.stringify(data), 'new', now).run();
  // Collaborative watchlists: every operation is scoped to a list the user belongs to.
  if (path === '/api/shared-lists' && method === 'GET') {
    const rows = await env.DB.prepare(`SELECT l.id,l.name,l.owner_id AS ownerId,l.created_at AS createdAt,m.role FROM shared_lists l JOIN shared_list_members m ON m.list_id=l.id WHERE m.user_id=? ORDER BY l.created_at DESC`).bind(me.id).all();
    const lists = [];
    for (const r of rows.results) {
      const members = await env.DB.prepare(`SELECT u.id,u.username,u.display_name AS displayName,m.role FROM shared_list_members m JOIN users u ON u.id=m.user_id WHERE m.list_id=? ORDER BY m.role DESC,u.username`).bind(r.id).all();
      const items = await env.DB.prepare(`SELECT id,media_id AS mediaId,media_type AS mediaType,title,poster,added_by AS addedBy,created_at AS createdAt FROM shared_list_items WHERE list_id=? ORDER BY id DESC LIMIT 100`).bind(r.id).all();
      lists.push({ ...r, members: members.results, items: items.results });
    }
    return J(lists);
  }
  if (path === '/api/shared-lists' && method === 'POST') {
    const name = cleanText(body.name, 60);
    if (!name) return J({ error: 'Enter a name for the shared list.' }, 400);
    const created = await env.DB.prepare('INSERT INTO shared_lists(owner_id,name,created_at) VALUES(?,?,?)').bind(me.id,name,now).run();
    const id = Number(created.meta.last_row_id);
    await env.DB.prepare('INSERT INTO shared_list_members(list_id,user_id,role,added_at) VALUES(?,?,?,?)').bind(id,me.id,'owner',now).run();
    return J({ ok: true, id, name }, 201);
  }
  const slItem = path.match(/^\/api\/shared-lists\/(\d+)\/items$/);
  const slInvite = path.match(/^\/api\/shared-lists\/(\d+)\/invite$/);
  const slDelete = path.match(/^\/api\/shared-lists\/(\d+)\/items\/(\d+)$/);
  if (slItem || slInvite || slDelete) {
    const listId = Number((slItem || slInvite || slDelete)[1]);
    const member = await env.DB.prepare('SELECT role FROM shared_list_members WHERE list_id=? AND user_id=?').bind(listId,me.id).first();
    if (!member) return J({ error: 'You do not have access to this shared list.' }, 403);
    if (slItem && method === 'POST') {
      const mediaId = Number(body.mediaId), mediaType = body.mediaType === 'tv' ? 'tv' : body.mediaType === 'movie' ? 'movie' : null, title = cleanText(body.title,200);
      if (!mediaId || !mediaType || !title) return J({ error: 'Choose a valid movie or show.' },400);
      await env.DB.prepare('INSERT INTO shared_list_items(list_id,media_id,media_type,title,poster,added_by,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(list_id,media_id,media_type) DO UPDATE SET title=excluded.title,poster=excluded.poster').bind(listId,mediaId,mediaType,title,cleanPoster(body.poster),me.id,now).run();
      return J({ ok:true });
    }
    if (slDelete && method === 'DELETE') {
      const itemId = Number(slDelete[2]);
      await env.DB.prepare(`DELETE FROM shared_list_items WHERE id=? AND list_id=? AND (added_by=? OR ?='owner')`).bind(itemId,listId,me.id,member.role).run();
      return J({ ok:true });
    }
    if (slInvite && method === 'POST') {
      if (member.role !== 'owner') return J({ error: 'Only the list owner can invite friends.' },403);
      const to = Number(body.userId);
      if (!to || to === me.id) return J({ error: 'Choose a friend to invite.' },400);
      const rel = await friendRow(me.id,to);
      if (!rel || rel.status !== 'accepted') return J({ error: 'Shared lists can only be shared with accepted friends.' },403);
      const exists = await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(to).first();
      if (!exists) return J({ error: 'User not found.' },404);
      await env.DB.prepare('INSERT OR IGNORE INTO shared_list_members(list_id,user_id,role,added_at) VALUES(?,?,?,?)').bind(listId,to,'member',now).run();
      const list = await env.DB.prepare('SELECT name FROM shared_lists WHERE id=?').bind(listId).first();
      await notify(to,'shared_list_invite',{from:{id:me.id,name:myName},listId,name:list?.name||'Shared list'});
      return J({ ok:true });
    }
  }
  if (path === '/api/users' && method === 'GET') {
    const qs = (url.searchParams.get('q') || '').trim().slice(0, 40), like = '%' + qs.replace(/[%_]/g, '') + '%';
    // People is profile-first: show every selectable profile belonging to another
    // registered account, including offline users. Friend requests and DMs still
    // target the owning account (u.id), not the profile id.
    const rows = await env.DB.prepare(`SELECT u.id,u.username,u.display_name,u.bio,u.is_private,u.allow_requests,
      p.id AS pid,p.name AS profile_name,p.avatar,(p.pic IS NOT NULL) AS pic
      FROM users u
      LEFT JOIN profiles p ON p.user_id=u.id
      WHERE (?='' OR u.username LIKE ? OR u.display_name LIKE ? OR p.name LIKE ?)
      ORDER BY u.id DESC, p.id ASC LIMIT 120`).bind(qs, like, like, like).all();
    const fr = await env.DB.prepare('SELECT a,b,status FROM friends WHERE a=? OR b=?').bind(me.id, me.id).all();
    return J(rows.results.map((r) => {
      const f = fr.results.find((x) => (x.a === me.id && x.b === r.id) || (x.b === me.id && x.a === r.id));
      const relation = relOf(f), vis = !r.is_private || relation === 'friends';
      return { id: r.id, name: r.profile_name || r.display_name || r.username,
        accountName: r.display_name || r.username, username: r.username, isSelf: r.id === me.id,
        bio: vis ? (r.bio || '') : '', private: !!r.is_private,
        allowRequests: r.allow_requests !== 0, pid: r.pid, profileId: r.pid,
        avatar: r.avatar || 0, pic: !!r.pic, relation };
    }));
  }
  if (path === '/api/dm' && method === 'GET') {
    const other = Number(url.searchParams.get('with'));
    if (!other || other === me.id) return J({ error: 'Choose another user.' }, 400);
    const exists = await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(other).first();
    if (!exists) return J({ error: 'User not found.' }, 404);
    const rel = await env.DB.prepare("SELECT status FROM friends WHERE ((a=? AND b=?) OR (a=? AND b=?))").bind(me.id,other,other,me.id).first();
    if (!rel || rel.status !== 'accepted') return J({ error: 'Private messages are available between friends only.' }, 403);
    const q = await env.DB.prepare('SELECT id,sender_id AS senderId,recipient_id AS recipientId,body,created_at AS createdAt FROM dm_messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY id DESC LIMIT 100').bind(me.id, other, other, me.id).all();
    return J(q.results.reverse());
  }
  if (path === '/api/dm' && method === 'POST') {
    const other = Number(body.toUserId), message = cleanText(body.message, 1001);
    if (!other || other === me.id) return J({ error: 'Choose another user.' }, 400);
    if (!message || message.length > 1000) return J({ error: 'Message must be 1–1000 characters.' }, 400);
    const exists = await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(other).first();
    if (!exists) return J({ error: 'User not found.' }, 404);
    const rel = await env.DB.prepare('SELECT status FROM friends WHERE ((a=? AND b=?) OR (a=? AND b=?))').bind(me.id,other,other,me.id).first();
    if (!rel || rel.status !== 'accepted') return J({ error: 'Private messages are available between friends only.' }, 403);
    const result = await env.DB.prepare('INSERT INTO dm_messages(sender_id,recipient_id,body,created_at) VALUES(?,?,?,?)').bind(me.id, other, message, now).run();
    return J({ ok: true, id: result.meta.last_row_id, createdAt: now });
  }
  const um = path.match(/^\/api\/users\/(\d+)$/);
  if (um && method === 'GET') {
    const uid = Number(um[1]);
    const u = await env.DB.prepare('SELECT id,username,display_name,bio,is_private,allow_requests FROM users WHERE id=?').bind(uid).first();
    if (!u) return J({ error: 'User not found.' }, 404);
    const relation = uid === me.id ? 'self' : relOf(await friendRow(me.id, uid));
    const visible = !u.is_private || relation === 'friends' || relation === 'self';
    let recent = [];
    if (visible) {
      const ps = await env.DB.prepare('SELECT data FROM profiles WHERE user_id=? AND kids=0').bind(uid).all(), all = [];
      for (const p of ps.results) { try { (JSON.parse(p.data || '{}').hist || []).forEach((x) => all.push(x)); } catch {} }
      all.sort((a, b) => (b.t || 0) - (a.t || 0)); const seen = new Set();
      recent = all.filter((x) => { const k = x.type + x.id; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10).map((x) => ({ id: x.id, type: x.type, title: x.title, poster: x.poster, season: x.season, episode: x.episode }));
    }
    const p0 = await env.DB.prepare('SELECT id,avatar,(pic IS NOT NULL) AS pic FROM profiles WHERE user_id=? ORDER BY id LIMIT 1').bind(uid).first();
    return J({ id: u.id, name: u.display_name || u.username, username: u.username, bio: visible ? (u.bio || '') : '', private: !!u.is_private, allowRequests: u.allow_requests !== 0, relation, visible, recent, pid: p0 ? p0.id : null, avatar: p0 ? p0.avatar : 0, pic: p0 ? !!p0.pic : false });
  }
  if (path === '/api/friends' && method === 'GET') {
    const q = await env.DB.prepare(`SELECT u.id,u.display_name,u.username,p.id AS pid,p.avatar,(p.pic IS NOT NULL) AS pic FROM friends f JOIN users u ON u.id=(CASE WHEN f.a=? THEN f.b ELSE f.a END) LEFT JOIN profiles p ON p.id=(SELECT MIN(id) FROM profiles WHERE user_id=u.id) WHERE (f.a=? OR f.b=?) AND f.status='accepted'`).bind(me.id, me.id, me.id).all();
    return J(q.results.map((r) => ({ id: r.id, name: r.display_name || r.username, pid: r.pid, avatar: r.avatar || 0, pic: !!r.pic })));
  }
  if (path === '/api/friends/request' && method === 'POST') {
    const to = Number(body.userId); if (!to || to === me.id) return J({ error: 'Invalid user.' }, 400);
    const u = await env.DB.prepare('SELECT id,allow_requests FROM users WHERE id=?').bind(to).first();
    if (!u) return J({ error: 'User not found.' }, 404);
    if (u.allow_requests === 0) return J({ error: 'This person is not accepting friend requests.' }, 403);
    if (await friendRow(me.id, to)) return J({ error: 'A request or friendship already exists.' }, 409);
    const r = await env.DB.prepare('INSERT INTO friends(a,b,status,created_at) VALUES(?,?,?,?)').bind(me.id, to, 'pending', now).run();
    await notify(to, 'friend_request', { from: { id: me.id, name: myName }, requestId: r.meta.last_row_id });
    return J({ ok: true });
  }
  if (path === '/api/friends/remove' && method === 'POST') {
    const to = Number(body.userId); await env.DB.prepare('DELETE FROM friends WHERE (a=? AND b=?) OR (a=? AND b=?)').bind(me.id, to, to, me.id).run(); return J({ ok: true });
  }
  if (path === '/api/notifications' && method === 'GET') {
    const q = await env.DB.prepare('SELECT id,type,data,status,created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 40').bind(me.id).all();
    const items = q.results.map((n) => { let d = {}; try { d = JSON.parse(n.data || '{}'); } catch {} if (d.profile) d.profile = { name: d.profile.name, avatar: d.profile.avatar, pic: !!d.profile.pic }; return { id: n.id, type: n.type, status: n.status, createdAt: n.created_at, data: d }; });
    return J({ items, unread: items.filter((n) => n.status === 'new').length });
  }
  if (path === '/api/notifications/read' && method === 'POST') {
    await env.DB.prepare("UPDATE notifications SET status='seen' WHERE user_id=? AND status='new'").bind(me.id).run(); return J({ ok: true });
  }
  const nm = path.match(/^\/api\/notifications\/(\d+)\/respond$/);
  if (nm && method === 'POST') {
    const n = await env.DB.prepare('SELECT * FROM notifications WHERE id=? AND user_id=?').bind(Number(nm[1]), me.id).first();
    if (!n || !['new', 'seen'].includes(n.status)) return J({ error: 'This request is no longer available.' }, 404);
    let d = {}; try { d = JSON.parse(n.data || '{}'); } catch {}
    const accept = !!body.accept;
    if (n.type === 'friend_request') {
      if (accept) { await env.DB.prepare("UPDATE friends SET status='accepted' WHERE id=? AND b=?").bind(d.requestId, me.id).run(); await notify(d.from.id, 'friend_accepted', { from: { id: me.id, name: myName } }); }
      else await env.DB.prepare('DELETE FROM friends WHERE id=? AND b=?').bind(d.requestId, me.id).run();
    } else if (n.type === 'profile_share') {
      if (accept) {
        const c = await env.DB.prepare('SELECT COUNT(*) AS c FROM profiles WHERE user_id=?').bind(me.id).first();
        if (c.c >= 5) return J({ error: 'You already have 5 profiles. Delete one first.' }, 400);
        const p = d.profile || {}; let data = {}; try { data = JSON.parse(p.data || '{}'); } catch {}
        await env.DB.prepare('INSERT INTO profiles(user_id,name,kids,avatar,pic,data) VALUES(?,?,?,?,?,?)').bind(me.id, String(p.name || 'Shared').slice(0, 14), p.kids ? 1 : 0, Number(p.avatar) || 0, picOk(p.pic) ? p.pic : null, JSON.stringify({ list: cleanList(data.list), hist: cleanList(data.hist) })).run();
        await notify(d.from.id, 'share_accepted', { from: { id: me.id, name: myName }, name: String(p.name || '').slice(0, 14) });
      }
    } else return J({ error: 'Nothing to answer here.' }, 400);
    await env.DB.prepare('UPDATE notifications SET status=? WHERE id=?').bind(accept ? 'accepted' : 'declined', n.id).run();
    return J({ ok: true, accepted: accept });
  }
  if (path === '/api/share' && method === 'POST') {
    const to = Number(body.toUserId), pid = Number(body.profileId), f = to ? await friendRow(me.id, to) : null;
    if (!f || f.status !== 'accepted') return J({ error: 'You can only share a profile with a friend.' }, 403);
    const pr = await env.DB.prepare('SELECT name,kids,avatar,pic,data FROM profiles WHERE id=? AND user_id=?').bind(pid, me.id).first();
    if (!pr) return J({ error: 'Profile not found.' }, 404);
    const snap = { name: pr.name, kids: !!pr.kids, avatar: pr.avatar, pic: pr.pic || null, data: (pr.data || '{}').length > 200000 ? '{}' : (pr.data || '{}') };
    await notify(to, 'profile_share', { from: { id: me.id, name: myName }, profile: snap });
    return J({ ok: true });
  }

  // Optional profile PINs are hashed server-side; never return the hash.
  const pinRoute = path.match(/^\/api\/profiles\/(\d+)\/pin$/);
  if (pinRoute && method === 'POST') {
    const profileId = Number(pinRoute[1]), row = await env.DB.prepare('SELECT id,pin_hash FROM profiles WHERE id=? AND user_id=?').bind(profileId, me.id).first();
    if (!row) return J({ error: 'Profile not found.' }, 404);
    if (body.verify !== undefined) {
      if (!row.pin_hash || !/^\d{4}$/.test(String(body.verify))) return J({ error: 'Enter the four-digit PIN.' }, 400);
      return J({ ok: await checkPw(String(body.verify), row.pin_hash) }, await checkPw(String(body.verify), row.pin_hash) ? 200 : 403);
    }
    const pin = String(body.pin || '');
    if (pin && !/^\d{4}$/.test(pin)) return J({ error: 'PIN must be exactly four digits, or leave it blank to remove it.' }, 400);
    await env.DB.prepare('UPDATE profiles SET pin_hash=? WHERE id=? AND user_id=?').bind(pin ? await hashPw(pin) : null, profileId, me.id).run();
    return J({ ok: true, hasPin: !!pin });
  }

  // Friend-only title sharing, activity and ratings/reviews.
  if (path === '/api/reviews' && method === 'GET') {
    const id = Number(url.searchParams.get('mediaId')), type = url.searchParams.get('mediaType') === 'tv' ? 'tv' : 'movie';
    if (!id) return J({ error: 'Invalid title.' }, 400);
    const q = await env.DB.prepare(`SELECT r.rating,r.comment,r.created_at AS createdAt,u.username,u.display_name AS displayName FROM title_reviews r JOIN users u ON u.id=r.user_id WHERE r.media_id=? AND r.media_type=? ORDER BY r.created_at DESC LIMIT 50`).bind(id,type).all();
    const avg = await env.DB.prepare('SELECT AVG(rating) AS average,COUNT(*) AS count FROM title_reviews WHERE media_id=? AND media_type=?').bind(id,type).first();
    const mine = await env.DB.prepare('SELECT rating,comment FROM title_reviews WHERE media_id=? AND media_type=? AND user_id=?').bind(id,type,me.id).first();
    return J({ items:q.results, average:Number(avg.average)||0, count:Number(avg.count)||0, mine:mine||null });
  }
  if (path === '/api/reviews' && method === 'POST') {
    const id=Number(body.mediaId), type=body.mediaType==='tv'?'tv':body.mediaType==='movie'?'movie':null, rating=Number(body.rating), comment=cleanText(body.comment,500);
    if (!id || !type || !Number.isInteger(rating) || rating<1 || rating>5) return J({error:'Choose a rating from 1 to 5.'},400);
    await env.DB.prepare(`INSERT INTO title_reviews(user_id,media_id,media_type,rating,comment,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,media_id,media_type) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,created_at=excluded.created_at`).bind(me.id,id,type,rating,comment,now).run();
    return J({ok:true});
  }
  if (path === '/api/share/title' && method === 'POST') {
    const to=Number(body.toUserId), id=Number(body.mediaId), type=body.mediaType==='tv'?'tv':body.mediaType==='movie'?'movie':null, title=cleanText(body.title,200);
    const f=to?await friendRow(me.id,to):null; if(!f||f.status!=='accepted')return J({error:'You can only send titles to a friend.'},403);
    if(!id||!type||!title)return J({error:'Invalid title.'},400);
    await notify(to,'title_share',{from:{id:me.id,name:myName},media:{id,type,title,poster:(cleanPoster(body.poster)||'')}}); return J({ok:true});
  }
  if (path === '/api/activity' && method === 'POST') {
    const pid=Number(body.profileId)||0, id=Number(body.mediaId)||0, type=body.mediaType==='tv'?'tv':body.mediaType==='movie'?'movie':null;
    if (!pid || !(await env.DB.prepare('SELECT id FROM profiles WHERE id=? AND user_id=?').bind(pid,me.id).first())) return J({error:'Choose your profile first.'},400);
    if (!id || !type) { await env.DB.prepare('DELETE FROM watch_presence WHERE user_id=? AND profile_id=?').bind(me.id,pid).run(); return J({ok:true}); }
    await env.DB.prepare(`INSERT INTO watch_presence(user_id,profile_id,media_id,media_type,title,poster,season,episode,last_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,profile_id) DO UPDATE SET media_id=excluded.media_id,media_type=excluded.media_type,title=excluded.title,poster=excluded.poster,season=excluded.season,episode=excluded.episode,last_at=excluded.last_at`).bind(me.id,pid,id,type,cleanText(body.title||'Watching',200),cleanPoster(body.poster),Number(body.season)||null,Number(body.episode)||null,now).run(); return J({ok:true});
  }
  if (path === '/api/activity' && method === 'GET') {
    const rows=await env.DB.prepare(`SELECT u.id AS userId,u.username,u.display_name AS displayName,p.name AS profileName,w.media_id AS mediaId,w.media_type AS mediaType,w.title,w.poster,w.season,w.episode,w.last_at AS lastAt FROM friends f JOIN users u ON u.id=CASE WHEN f.a=? THEN f.b ELSE f.a END JOIN watch_presence w ON w.user_id=u.id LEFT JOIN profiles p ON p.id=w.profile_id WHERE (f.a=? OR f.b=?) AND f.status='accepted' AND (p.kids=0 OR p.kids IS NULL) AND w.last_at>? ORDER BY w.last_at DESC LIMIT 30`).bind(me.id,me.id,me.id,new Date(Date.now()-2*60*1000).toISOString()).all();
    const recent=await env.DB.prepare(`SELECT u.id AS userId,u.username,u.display_name AS displayName,h.media_id AS mediaId,h.media_type AS mediaType,h.title,h.poster_path AS poster,h.watched_at AS lastAt FROM friends f JOIN users u ON u.id=CASE WHEN f.a=? THEN f.b ELSE f.a END JOIN watch_history h ON h.user_id=u.id WHERE (f.a=? OR f.b=?) AND f.status='accepted' AND h.watched_at>? ORDER BY h.watched_at DESC LIMIT 30`).bind(me.id,me.id,me.id,new Date(Date.now()-7*86400000).toISOString()).all();
    return J({watching:rows.results,recent:recent.results});
  }
  if (path === '/api/games/score' && method === 'POST') {
    const game=['connect4','tictactoe'].includes(body.game)?body.game:null, result=['win','loss','draw'].includes(body.result)?body.result:null;
    if(!game||!result)return J({error:'Invalid score.'},400);
    const col=result==='win'?'wins':result==='loss'?'losses':'draws';
    await env.DB.prepare(`INSERT INTO game_scores(user_id,game,${col},updated_at) VALUES(?,?,1,?) ON CONFLICT(user_id,game) DO UPDATE SET ${col}=${col}+1,updated_at=excluded.updated_at`).bind(me.id,game,now).run(); return J({ok:true});
  }
  if (path === '/api/games/leaderboard' && method === 'GET') {
    const game=['connect4','tictactoe'].includes(url.searchParams.get('game'))?url.searchParams.get('game'):'connect4';
    const q=await env.DB.prepare(`SELECT u.username,u.display_name AS displayName,g.wins,g.losses,g.draws FROM game_scores g JOIN users u ON u.id=g.user_id WHERE g.game=? ORDER BY g.wins DESC,g.losses ASC,g.updated_at DESC LIMIT 20`).bind(game).all(); return J(q.results);
  }

  if (path === '/api/me') {
    if (method === 'PATCH') {
      let uname = null, dname = null, bio = null, avatar = null;
      if (body.username !== undefined) {
        uname = String(body.username).trim();
        if (!/^[A-Za-z0-9_.-]{3,30}$/.test(uname)) return J({ error: 'Username must be 3–30 characters: letters, numbers, . _ -' }, 400);
        const cur = await env.DB.prepare('SELECT username FROM users WHERE id=?').bind(me.id).first();
        if (!cur || cur.username.toLowerCase() !== uname.toLowerCase()) {
          if (RESERVED.test(uname) || await env.DB.prepare('SELECT id FROM users WHERE lower(username)=lower(?) AND id<>?').bind(uname, me.id).first()) return J({ error: 'That username is not available.' }, 409);
        }
      }
      if (body.displayName !== undefined) { dname = cleanText(body.displayName, 40); if (!dname) return J({ error: 'Display name cannot be empty.' }, 400); }
      if (body.bio !== undefined) bio = cleanText(body.bio, 300);
      if (body.avatar !== undefined) avatar = cleanText(body.avatar, 16); // short emoji/label only, never a URL
      await env.DB.prepare('UPDATE users SET username=COALESCE(?,username),display_name=COALESCE(?,display_name),bio=COALESCE(?,bio),avatar=COALESCE(?,avatar),is_private=COALESCE(?,is_private),allow_requests=COALESCE(?,allow_requests) WHERE id=?')
        .bind(uname, dname, bio, avatar, body.private === undefined ? null : (body.private ? 1 : 0), body.allowRequests === undefined ? null : (body.allowRequests ? 1 : 0), me.id).run();
    }
    const row = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(me.id).first();
    return J(row ? userOut(row) : {});
  }
  if (path === '/api/history') {
    if (method === 'POST') {
      const { mediaId, mediaType, title, posterPath } = body;
      if (!Number.isInteger(Number(mediaId)) || Number(mediaId) < 1 || !['movie', 'tv'].includes(mediaType) || !cleanText(title, 200)) return J({ error: 'Invalid media.' }, 400);
      await env.DB.prepare('INSERT INTO watch_history(user_id,media_id,media_type,title,poster_path,watched_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,media_id,media_type) DO UPDATE SET title=excluded.title,poster_path=excluded.poster_path,watched_at=excluded.watched_at')
        .bind(me.id, Number(mediaId), mediaType, cleanText(title, 200), cleanPoster(posterPath), new Date().toISOString()).run();
      return J({ ok: true });
    }
    const q = await env.DB.prepare('SELECT media_id,media_type,title,poster_path,watched_at FROM watch_history WHERE user_id=? ORDER BY watched_at DESC LIMIT 30').bind(me.id).all();
    return J(q.results);
  }

  if (path === '/api/profiles') {
    if (method === 'POST') {
      const n = cleanText(body.name, 14);
      if (!n) return J({ error: 'Enter a name.' }, 400);
      const c = await env.DB.prepare('SELECT COUNT(*) AS c FROM profiles WHERE user_id=?').bind(me.id).first();
      if (c.c >= 5) return J({ error: 'You can have up to 5 profiles.' }, 400);
      const r = await env.DB.prepare('INSERT INTO profiles(user_id,name,kids,avatar,pic) VALUES(?,?,?,?,?)').bind(me.id, n, body.kids ? 1 : 0, Number(body.avatar) || 0, picOk(body.pic) ? body.pic : null).run();
      return J(profOut({ id: r.meta.last_row_id, name: n, kids: body.kids, avatar: Number(body.avatar) || 0, pic: picOk(body.pic) }), 201);
    }
    let q = await env.DB.prepare(`SELECT ${PROFILE_FIELDS} FROM profiles WHERE user_id=? ORDER BY id`).bind(me.id).all();
    if (!q.results.length) {
      await env.DB.prepare('INSERT INTO profiles(user_id,name) VALUES(?,?)').bind(me.id, String(me.displayName || me.username || 'Me').slice(0, 14)).run();
      q = await env.DB.prepare(`SELECT ${PROFILE_FIELDS} FROM profiles WHERE user_id=? ORDER BY id`).bind(me.id).all();
    }
    return J(q.results.map(profOut));
  }
  const m = path.match(/^\/api\/profiles\/(\d+)(\/data)?$/);
  if (m) {
    const id = Number(m[1]);
    if (m[2]) {
      if (method === 'PUT') {
        const r = await env.DB.prepare('UPDATE profiles SET data=? WHERE id=? AND user_id=?').bind(JSON.stringify({ list: cleanList(body.list), hist: cleanList(body.hist) }), id, me.id).run();
        return r.meta.changes ? J({ ok: true }) : J({ error: 'Profile not found.' }, 404);
      }
      const row = await env.DB.prepare('SELECT data FROM profiles WHERE id=? AND user_id=?').bind(id, me.id).first();
      if (!row) return J({ error: 'Profile not found.' }, 404);
      let d = {}; try { d = JSON.parse(row.data || '{}'); } catch {}
      return J({ list: Array.isArray(d.list) ? d.list : [], hist: Array.isArray(d.hist) ? d.hist : [] });
    }
    if (method === 'PATCH') {
      const n = cleanText(body.name, 14);
      if (!n) return J({ error: 'Enter a name.' }, 400);
      const r = await env.DB.prepare('UPDATE profiles SET name=?,kids=?,avatar=?,pic=CASE WHEN ? THEN ? ELSE pic END WHERE id=? AND user_id=?').bind(n, body.kids ? 1 : 0, Number(body.avatar) || 0, body.pic !== undefined ? 1 : 0, picOk(body.pic) ? body.pic : null, id, me.id).run();
      if (!r.meta.changes) return J({ error: 'Profile not found.' }, 404);
      return J(profOut(await env.DB.prepare(`SELECT ${PROFILE_FIELDS} FROM profiles WHERE id=?`).bind(id).first()));
    }
    if (method === 'DELETE') {
      const c = await env.DB.prepare('SELECT COUNT(*) AS c FROM profiles WHERE user_id=?').bind(me.id).first();
      if (c.c <= 1) return J({ error: 'You need at least one profile.' }, 400);
      await env.DB.prepare('DELETE FROM profiles WHERE id=? AND user_id=?').bind(id, me.id).run();
      return J({ ok: true });
    }
  }
  return J({ error: 'Not found.' }, 404);
}

// Security headers for responses produced by the Worker (API + JSON + profile images).
// NOTE: static pages (index.html etc.) are served by the assets layer and bypass this Worker,
// so THEIR headers (including the Content-Security-Policy) live in public/_headers.
function secureResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/ws') {
        if (req.headers.get('Upgrade') !== 'websocket') return secureResponse(new Response('Expected a WebSocket connection', { status: 426 }));
        // Block cross-site WebSocket hijacking: browsers always send Origin; it must be this site.
        const origin = req.headers.get('Origin');
        if (origin) { let ok = false; try { ok = new URL(origin).host === url.host; } catch {} if (!ok) return secureResponse(new Response('Forbidden', { status: 403 })); }
        const room = String(url.searchParams.get('room') || 'public').slice(0, 80);
        // WebSocket upgrade responses must be returned unchanged.
        return env.ROOM.get(env.ROOM.idFromName(room)).fetch(req);
      }
      if (url.pathname.startsWith('/api/')) return secureResponse(await api(req, env, url, ctx));
      return secureResponse(await env.ASSETS.fetch(req));
    } catch (e) { return secureResponse(J({ error: 'Server error.' }, 500)); }
  },
};

// One Durable Object per chat / Watch Party room (hibernating WebSockets). Room "__presence" counts who is online.
const cleanMedia = (m) => {
  if (!m || typeof m !== 'object') return null;
  const kind = m.kind === 'link' ? 'link' : 'tmdb', o = { kind, title: cleanText(m.title, 120), poster: cleanPoster(m.poster) };
  if (kind === 'link') {
    const href = httpsUrl(m.src, 600); if (!href) return null;
    o.src = href;
  }
  else { o.id = Number(m.id) || 0; if (!o.id) return null; o.type = m.type === 'tv' ? 'tv' : 'movie'; o.season = Number(m.season) || 1; o.episode = Number(m.episode) || 1; o.seasons = Number(m.seasons) || 1; }
  return o;
};
export class Room {
  constructor(state, env) { this.state = state; this.env = env; this.rl = new Map(); }
  // Per-connection flood control: chat is tight, cursor is loose, everything else moderate.
  tooFast(cid, e) {
    const cls = e === 'chat:send' ? 'c' : e === 'cursor:move' ? 'm' : 'o', cap = { c: 6, m: 200, o: 80 }[cls], now = Date.now(), k = cid + cls;
    let b = this.rl.get(k); if (!b || b.r < now) { b = { n: 0, r: now + 10000 }; this.rl.set(k, b); }
    b.n++;
    if (this.rl.size > 600) for (const [kk, vv] of this.rl) if (vv.r < now) this.rl.delete(kk);
    return b.n > cap;
  }
  async fetch(req) {
    if (this.state.getWebSockets().length >= 150) return new Response('Room is full', { status: 503 });
    const room = String(new URL(req.url).searchParams.get('room') || 'public').slice(0, 80);
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ room, cid: crypto.randomUUID().slice(0, 8), user: { username: 'Guest', displayName: 'Guest' }, joined: false, watching: false });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  send(list, e, d) { const m = JSON.stringify({ e, d }); for (const w of list) { try { w.send(m); } catch {} } }
  others(ws) { return this.state.getWebSockets().filter((w) => w !== ws); }
  stats(excl) {
    const all = this.state.getWebSockets().filter((w) => w !== excl); let w = 0;
    for (const s of all) { if ((s.deserializeAttachment() || {}).watching) w++; }
    this.send(all, 'presence:stats', { online: all.length, watching: w });
  }
  async pushLobby(excl) {
    const socks = this.state.getWebSockets().filter((w) => w !== excl), lobby = (await this.state.storage.get('lobby')) || null;
    const members = socks.map((w) => { const at = w.deserializeAttachment() || {}; return at.joined ? at.user : null; }).filter(Boolean);
    for (const w of socks) this.send([w], 'lobby:state', { lobby, members, you: (w.deserializeAttachment() || {}).cid });
  }
  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 6000) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.e !== 'string') return;
    const a = ws.deserializeAttachment() || {}, { e, d } = m;
    if (this.tooFast(a.cid || 'x', e)) return;
    if (e === 'presence:set') { ws.serializeAttachment({ ...a, watching: !!(d && d.watching), joined: true }); this.stats(); return; }
    if (e === 'room:join') {
      const u = (d && d.user) || {};
      // Identity is verified from the signed-in user's token. Anyone without a valid token is a guest and is labelled as one.
      let who = null;
      if (d && typeof d.token === 'string' && d.token && this.env.JWT_SECRET) who = await verifyJwt(d.token, this.env.JWT_SECRET);
      const shown = cleanText(u.displayName || u.username, 40) || 'Guest';
      let pid = '', pic = false;
      if (who && /^\d{1,12}$/.test(String(u.pid == null ? '' : u.pid))) {
        try { const own = await this.env.DB.prepare('SELECT id FROM profiles WHERE id=? AND user_id=?').bind(Number(u.pid), who.id).first(); if (own) { pid = String(own.id); pic = !!u.pic; } } catch {}
      }
      const user = {
        username: who ? cleanText(who.username, 30) : 'guest',
        displayName: who || /^guest\b/i.test(shown) ? shown : (shown + ' (guest)').slice(0, 48),
        avatar: Math.max(0, Math.min(99, Number(u.avatar) || 0)), pid, pic, verified: !!who, cid: a.cid };
      ws.serializeAttachment({ ...a, user, joined: true, partyReady: false });
      const n = this.state.getWebSockets().length;
      if (!a.joined) this.send(this.others(ws), 'room:presence', { type: 'join', user, count: n });
      this.send([ws], 'room:presence', { type: 'count', count: n });
      const last = await this.state.storage.get('last');
      if (last && Date.now() - last.at < 6 * 3600 * 1000) this.send([ws], 'watch:sync', last);
      await this.pushLobby();
    } else if (e === 'lobby:create') {
      const media = cleanMedia(d && d.media);
      if (media && !(await this.state.storage.get('lobby'))) await this.state.storage.put('lobby', { hostCid: a.cid, media, started: false });
      await this.pushLobby();
    } else if (e === 'lobby:start' || e === 'lobby:end') {
      const lb = await this.state.storage.get('lobby');
      if (!lb || lb.hostCid !== a.cid) return;
      if(e==='lobby:start'){const sockets=this.state.getWebSockets().filter(sock=>{const at=sock.deserializeAttachment()||{};return at.joined});const notReady=sockets.filter(sock=>!(sock.deserializeAttachment()||{}).partyReady);if(notReady.length){this.send([ws],'party:ready-needed',{count:notReady.length});return}}
      if (e === 'lobby:end') await this.state.storage.delete('lobby');
      else { lb.started = true; lb.startedAt = Date.now(); await this.state.storage.put('lobby', lb); this.send(this.state.getWebSockets(), 'party:start', { media: lb.media, by: a.user }); }
      await this.pushLobby();
    } else if (e === 'game:join') {
      const game = (d && d.game) === 'connect4' ? 'connect4' : 'tictactoe';
      let g = await this.state.storage.get('onlineGame');
      if(g){const live=new Set(this.state.getWebSockets().map(sock=>(sock.deserializeAttachment()||{}).cid));g.players=(g.players||[]).filter(cid=>live.has(cid))}
      if (!g || g.game !== game || g.winner) g = { game, players: [], board: game === 'connect4' ? Array(42).fill('') : Array(9).fill(''), turn: 'X', winner: '', updatedAt: Date.now() };
      if (!g.players.includes(a.cid) && g.players.length < 2) g.players.push(a.cid);
      const role = g.players[0] === a.cid ? 'X' : g.players[1] === a.cid ? 'O' : '';
      await this.state.storage.put('onlineGame', g);
      for(const sock of this.state.getWebSockets()){const at=sock.deserializeAttachment()||{};this.send([sock],'game:state',{...g,role:g.players[0]===at.cid?'X':g.players[1]===at.cid?'O':'',playerCount:g.players.length,you:at.cid})}
    } else if (e === 'game:move') {
      let g = await this.state.storage.get('onlineGame'); if (!g || g.winner || g.players.length < 2) return;
      const role = g.players[0] === a.cid ? 'X' : g.players[1] === a.cid ? 'O' : '';
      if (!role || role !== g.turn) return;
      if (g.game === 'tictactoe') {
        const i = Number(d && d.index); if (!Number.isInteger(i) || i < 0 || i > 8 || g.board[i]) return; g.board[i] = role;
        const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; if(lines.some(l=>l.every(i=>g.board[i]===role)))g.winner=role; else if(g.board.every(Boolean))g.winner='draw';
      } else {
        const c=Number(d && d.column); if(!Number.isInteger(c)||c<0||c>6)return;let placed=-1;for(let r=5;r>=0;r--){const i=r*7+c;if(!g.board[i]){g.board[i]=role;placed=i;break}}if(placed<0)return;
        const win=()=>{for(let r=0;r<6;r++)for(let c=0;c<7;c++)for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){let ok=true;for(let k=0;k<4;k++){const rr=r+dr*k,cc=c+dc*k;if(rr<0||rr>=6||cc<0||cc>=7||g.board[rr*7+cc]!==role){ok=false;break}}if(ok)return true}return false};
        if(win())g.winner=role;else if(g.board.every(Boolean))g.winner='draw';
      }
      if(!g.winner)g.turn=role==='X'?'O':'X';g.updatedAt=Date.now();await this.state.storage.put('onlineGame',g);for(const sock of this.state.getWebSockets()){const at=sock.deserializeAttachment()||{};this.send([sock],'game:state',{...g,playerCount:g.players.length,you:at.cid,role:g.players[0]===at.cid?'X':g.players[1]===at.cid?'O':''})}
    } else if (e === 'game:reset') {
      const g=await this.state.storage.get('onlineGame');if(!g||!g.players.includes(a.cid))return;g.board=g.game==='connect4'?Array(42).fill(''):Array(9).fill('');g.turn='X';g.winner='';g.updatedAt=Date.now();await this.state.storage.put('onlineGame',g);for(const sock of this.state.getWebSockets()){const at=sock.deserializeAttachment()||{};this.send([sock],'game:state',{...g,playerCount:g.players.length,you:at.cid,role:g.players[0]===at.cid?'X':g.players[1]===at.cid?'O':''})}
    } else if (['party:reaction','party:vote-start','party:vote','party:ready','party:schedule'].includes(e)) {
      const clean = (v) => cleanText(v, 160);
      if (e === 'party:reaction') this.send(this.state.getWebSockets(), e, { emoji: ['❤️','😂','🔥','👏','😮','🍿'].includes(d && d.emoji) ? d.emoji : '🍿', by: a.user, at: Date.now() });
      else if (e === 'party:vote-start') { const options = Array.isArray(d && d.options) ? d.options.map(clean).filter(Boolean).slice(0,4) : []; if(options.length>=2){await this.state.storage.put('partyVote',{options,votes:{},startedAt:Date.now()});this.send(this.state.getWebSockets(),e,{options,by:a.user,at:Date.now()});} }
      else if (e === 'party:vote') { const option=clean(d && d.option), v=await this.state.storage.get('partyVote'); if(v&&v.options.includes(option)){v.votes[a.cid]=option;await this.state.storage.put('partyVote',v);const counts={};v.options.forEach(o=>counts[o]=0);Object.values(v.votes).forEach(o=>counts[o]=(counts[o]||0)+1);this.send(this.state.getWebSockets(),e,{option,counts,by:a.user,at:Date.now()});} }
      else if (e === 'party:ready') {ws.serializeAttachment({...a,partyReady:!!(d&&d.ready)});this.send(this.state.getWebSockets(),e,{ready:!!(d && d.ready),by:a.user,at:Date.now()});}
      else if (e === 'party:schedule') { const at=Number(d && d.at); if(Number.isFinite(at)&&at>Date.now()&&at<Date.now()+30*86400000)this.send(this.state.getWebSockets(),e,{at,title:clean(d && d.title),by:a.user}); }
    } else if (e === 'chat:send') {
      const kind = (d && d.kind) || 'text';
      if (!a.joined || !['text', 'gif', 'movie'].includes(kind)) return;
      const body = kind === 'gif' ? httpsUrl(d && d.body, 500) : cleanText(d && d.body, 1200);
      if (!body) return;
      const u = a.user || {};
      const msg = { username: u.username, displayName: u.displayName, avatar: u.avatar, pid: u.pid, pic: u.pic, body, kind, createdAt: new Date().toISOString() };
      try {
        await init(this.env);
        const r = await this.env.DB.prepare('INSERT INTO chat_messages(room,username,display_name,body,kind,created_at,meta) VALUES(?,?,?,?,?,?,?)').bind(a.room, msg.username, msg.displayName, body, kind, msg.createdAt, JSON.stringify({ avatar: u.avatar, pid: u.pid, pic: u.pic })).run();
        msg.id = r.meta.last_row_id;
      } catch {}
      this.send(this.state.getWebSockets(), 'chat:message', msg);
    } else if (e === 'watch:sync') {
      const clean = cleanSync(d); if (!clean) return;
      const payload = { ...clean, by: a.user, at: Date.now() };
      if ((payload.action === 'play' && payload.mediaId) || payload.action === 'src') await this.state.storage.put('last', payload);
      this.send(this.others(ws), 'watch:sync', payload);
    } else if (e === 'cursor:move') {
      this.send(this.others(ws), 'cursor:move', { x: Number(d && d.x) || 0, y: Number(d && d.y) || 0, by: a.user });
    }
  }
  async webSocketClose(ws, code) {
    const a = ws.deserializeAttachment() || {};
    try { ws.close(code); } catch {}
    const rest = this.others(ws);
    if (a.room === '__presence') { this.stats(ws); return; }
    if (a.joined) this.send(rest, 'room:presence', { type: 'leave', user: a.user, count: rest.length });
    const lb = await this.state.storage.get('lobby');
    if (lb) {
      if (!rest.length) await this.state.storage.delete('lobby');
      else if (lb.hostCid === a.cid) { const nx = rest.map((w) => w.deserializeAttachment() || {}).find((x) => x.joined); if (nx) { lb.hostCid = nx.cid; await this.state.storage.put('lobby', lb); } }
      await this.pushLobby(ws);
    }
  }
  async webSocketError(ws) { await this.webSocketClose(ws, 1011); }
}
