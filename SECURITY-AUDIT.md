# Projection Studios security notes (v1.1, Oct 27 2026)

This is a hardening pass, not a certification. It fixes what was found in the code; it cannot make
third-party player sites trustworthy (see "What this does NOT fix").

## Why Chrome showed "Dangerous site"
That red screen is Google Safe Browsing's *social engineering / deceptive site* category. The things in this
project most likely to trigger it:
1. The page was branded "Netflix Clone", used Netflix's red and a "Netflix Originals" row, and had an email +
   password form. To an automated classifier that looks like a Netflix phishing page.
2. Tab "cloak" (rename the tab / swap its icon) and a panic key that redirects to google.com. These are
   disguise features that deceptive sites use.
3. Third-party embedded players (player.vidking.ws, mikaza.buzz). Google counts deceptive content that arrives
   through embeds/ads against the host page.
4. Anyone could write text into the home-page "Popular" row (unauthenticated endpoint) and push links/URLs to
   other users' video players through Watch Together.
No injected/obfuscated malware, hidden redirects, or invisible click-trap overlays were found in Projection Studios's own code.

## What changed
Branding / deception
- Removed "Netflix Clone" title/footer/row, changed the accent colour, renamed brand-named themes (Hulu/Disney/etc.).
- Removed tab cloak and panic-key redirect (and wipes the saved values from existing visitors' browsers).
- Login page now states it is independent and tells people not to reuse passwords.

Embeds / redirects / pop-ups
- Player iframes are sandboxed in the HTML itself (no popups, no top-level navigation, no same-origin) and send no referrer.
- Content-Security-Policy (public/_headers): frames only from the 4 known player hosts; forms can only post to this site;
  no <object>/<embed>; scripts only from this site + YouTube's player API; base-uri locked.
- HLS engine is now served from this site (public/vendor, copied from the hls.js npm package) instead of cdn.jsdelivr.net.
- "Play a link" / Watch Together links must be https. Remote rooms can no longer push arbitrary data: sync messages are
  rebuilt from a whitelist (play / pause / seek / https video link / title).
- Anime trailer iframe sandboxed.

Account security / API
- Login + sign-up rate limits (per IP and per email), timing-safe password compare, no email-enumeration timing gap,
  usernames unique (case-insensitive) with reserved names blocked, tokens now last 7 days.
- Profile edits validated server-side (username format, short name/bio, avatar can no longer be a URL).
- All free-text going into the DB or to other users is stripped of control/bidi characters and < >.
- "Popular" row: signed-in only, rate limited, and title/poster come from TMDB — client text is ignored.
  The existing Popular table is cleared once on first run, in case anything was injected.
- Request bodies are capped while streaming (not just by Content-Length). API responses are no-store.
- TMDB proxy: adult results forced off, API key cannot be overridden, params capped, per-IP limit, edge cache.

Server / WebSocket
- Cross-site WebSocket connections are refused (Origin check).
- Chat identity comes from the signed token. Anyone not signed in is shown as "(guest)", cannot use another
  person's name/avatar, cannot chat before joining, and is flood-limited. GIF chat messages must be https.
- Frame size cap, per-connection rate limits, 150 connections per room.

## What this does NOT fix (be honest with yourself)
1. **Third-party players.** vidking.ws and mikaza.buzz serve other people's content and ads. The sandbox stops them
   from opening pop-ups or redirecting your page, but Projection Studios cannot inspect what they show inside their own frame.
   If Google (or Cloudflare) sees abuse coming from those frames, the warning can return. Streaming copyrighted
   movies/shows through such providers is also a copyright / Cloudflare-terms risk that no code change removes.
   The only fully safe option is licensed sources, YouTube, or video you host/own.
2. The big inline script means the CSP still has to allow 'unsafe-inline' scripts, so it will not stop an injected
   inline script. I removed the injection points I found, but a full fix = move inline JS to files + nonce CSP.
3. Login tokens are still in localStorage (a successful script injection could read them). Moving to HttpOnly
   cookies needs a coordinated login/CSRF change.
4. Anyone can still read a public chat room's history by room name and `/api/pic/<id>` profile pictures are public by ID.
5. Shared `*.workers.dev` hostname: reputation is per-hostname and shared infrastructure gets scrutiny. A custom
   domain (a few dollars/yr) gives you a clean, separate reputation and is the best long-term fix.
6. Add Cloudflare WAF / rate-limiting rules (dashboard > Security) for defence in depth.

## After deploying — smoke test
Sign up / log in / log out; profile picker + PIN; open a movie and a TV episode (player loads, fullscreen works);
Play-a-link with an https .mp4; Watch Together with two browsers; chat + GIF; anime title + trailer; manga;
games. If a provider only works with a weaker sandbox, **tell me** rather than removing the sandbox.
