# Projection Studios on Cloudflare

> **v1.1 security update:** read `SECURITY-AUDIT.md` first. Deploy with `npm install` then `npm run deploy`
> (the deploy script now copies the HLS engine into `public/vendor`). **Rotate your JWT_SECRET** when you deploy this version:
> `openssl rand -base64 48 | npx wrangler secret put JWT_SECRET` (everyone will have to sign in again - that is intended).


Runs entirely on Cloudflare: no computer left on, no sleeping.
- `public/index.html` is the site
- `src/index.js` is the API (accounts, profiles, chat history) plus the live chat / Watch Together rooms
- Accounts, profiles, My List and chat are stored in a Cloudflare D1 database that is created automatically

## Deploy (Mac, about 5 minutes)

1. Open Terminal, type `cd ` (with a space), drag this folder in, press Enter.
2. `npm install`   (required - it also fetches the HLS player engine)
   If it says install scripts were blocked, run: `npm install-scripts approve esbuild fsevents workerd`
3. `npx wrangler login` (skip if you're already logged in from your other project)
4. `npm run deploy`
   Wrangler creates the database for you. If it asks to create one, say yes.
5. Add your two secrets (paste the value when asked):
   - `npx wrangler secret put TMDB_API_KEY`   (your TMDB v3 API key)
   - `npx wrangler secret put JWT_SECRET`     (any long random string)
6. Open the link printed in step 4 (https://projection-studios.YOURNAME.workers.dev).
   Check https://YOUR-LINK/api/health. It should say "database":true and "tmdb":true.

## Update later
Edit files, then run `npm run deploy` again.

## If the database step fails
Run `npx wrangler d1 create projection-studios`, copy the `database_id` it prints, and put it in wrangler.jsonc:
  "d1_databases": [{ "binding": "DB", "database_name": "projection-studios", "database_id": "PASTE_ID_HERE" }]
Then run `npm run deploy` again.

## Notes
- Changing JWT_SECRET later logs everyone out.
- Free plan limits apply (about 100,000 requests per day).

## Updating an existing deployment
Just run `npm run deploy` again. New database columns (profile photos, chat avatars) are added automatically,
and your accounts, profiles and secrets stay as they are.


## Community, resume, and responsive upgrades

- Very narrow split-window layouts adapt navigation, cards, dialogs, and player controls.
- Movie resume uses saved player progress and the existing embed `progress` parameter; Continue labels show the saved time. TV progress bars use the player progress messages when available.
- Optional profile PINs are four digits and are stored as server-side password hashes. The PIN gate protects profile switching in the UI; it is not a substitute for a separate account login.
- Signed-in users can rate titles, post short reviews, send titles to accepted friends, view friend watch activity, and use friend-only direct messages.
- Tic Tac Toe and Connect 4 include online room-code matches and an account-backed leaderboard. Both players should use the same room code and be signed in for leaderboard scores.
- Watch Together includes floating reactions, a title vote, ready checks, and a scheduled-start countdown. The party room must remain connected for its live state.

New D1 tables and the optional profile PIN column are initialized automatically by the existing API startup migration. Deploy with `npx wrangler deploy`; preserve your existing `wrangler.jsonc` and secrets.


## Approved feature improvements (October 2026)

- Adds collaborative shared watchlists for accepted friends, with owner-controlled invites and shared title additions/removals. The D1 tables are created by the existing startup migration.
- Enhances universal search with TMDB people results and a known-credits panel.
- Adds a TV-style Skip Intro control for episodes (provider-independent 90-second seek via the existing `progress` URL parameter); the existing Next Episode and auto-next controls remain intact.
- Improves Continue Watching card labels and keeps movie resume times visible while episode cards continue to show season/episode progress.
- Improves mini-player fitting in narrow windows and adds TV-style Back/Enter/Space keyboard support.
- Blends recommendations from several recent watches, and adds Arcade daily challenges and achievement badges. Existing multiplayer rooms and per-game leaderboards are reused rather than duplicated.

Feature notes: exact resume/skip behavior depends on the embedded player honoring the `progress` parameter and emitting progress events. Arcade achievements are local to the browser; multiplayer leaderboards remain server-backed for signed-in accounts.

## Automatic MikazaAPI anime playback

Anime titles opened from AniList use the MikazaAPI player automatically. TMDB titles detected as Japanese animation now display a MikazaAPI recommendation and route Play/Continue/episode selections to MikazaAPI after resolving the title against AniList. SUB/DUB and server preferences remain controlled by the existing Mikaza player settings. This depends on a reliable AniList match and the title having a usable AniList/MAL ID; provider playback and episode/season mapping still need live-browser verification.

## Security notes
- HTTP responses add baseline browser security headers, including `nosniff`, a strict referrer policy, framing restrictions, and a restrictive permissions policy.
- API mutation requests with a declared content length over 150 KB are rejected.
- Signup validates email and username formats and requires a 12–128 character password containing letters and numbers. Existing accounts are not automatically migrated; password policy applies to new registrations.
- Watch-together shared links accept HTTPS URLs only and reject URLs with embedded credentials.
- Keep `JWT_SECRET`, `TMDB_API_KEY`, and any provider keys as Cloudflare Worker secrets. Never put real values in `wrangler.jsonc` or browser files.
- This is defense-in-depth, not a complete security audit. Rate limiting should also be configured in Cloudflare for login/signup and other abuse-prone API routes. A strict script CSP is intentionally not enabled yet because the current app uses inline scripts and external player providers; test a report-only policy before enforcing one.
