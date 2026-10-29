# Only needed if Chrome ever shows a red warning on this site
(A brand-new URL starts with no warning. Use this if it ever gets flagged, after fixing whatever caused it.)


1. Check the current status: https://transparencyreport.google.com/safe-browsing/search?url=projection-studios.dogeeats531.workers.dev
2. Google Search Console (https://search.google.com/search-console) -> Add property -> **URL prefix** ->
   `https://projection-studios.dogeeats531.workers.dev/` -> choose the **HTML tag** method, copy the `<meta name="google-site-verification" ...>`
   tag, paste it inside `<head>` of `public/index.html`, run `npm run deploy`, then click Verify.
3. Search Console -> **Security & Manual Actions -> Security issues** -> **Request a review**. Paste something like:

> The site is an independent movie/show discovery and watch-party app. The warning was likely triggered by
> look-alike branding on a login page and by third-party embedded players. I have: (1) removed all Netflix branding,
> colours and brand-named themes, and added a clear "not affiliated" notice on the sign-in page; (2) removed the tab-disguise
> and panic-redirect features; (3) sandboxed all embedded players so they cannot open pop-ups or navigate the page, and
> restricted frames, forms and scripts with a Content-Security-Policy; (4) removed all third-party script hosting;
> (5) fixed unauthenticated write endpoints, added rate limiting, input validation and authentication checks on the API and
> chat WebSocket. No user is asked for payment details or for credentials of any other service.

4. Can't verify ownership? Use https://safebrowsing.google.com/safebrowsing/report_error/ ("Report incorrect phishing warning").
5. Reviews take from a few days to a couple of weeks. Do not redeploy risky features while it's pending.
