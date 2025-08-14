
# CDJ-Style 4-Deck DJ — PWA (Browser-Only)

This package runs **entirely in the browser** (desktop or mobile). You can **Add to Home Screen** on iOS/Android and it will work offline after first load (for the UI; you still load your own audio files).

## Run it locally (desktop)
- Just open `index.html` in a modern browser (Chrome/Firefox/Edge). Safari works too.
- First interaction must be a click to unlock audio.
- Load audio via each deck's **Load File** button.

> Note: Service workers don't run on `file://` in iOS Safari. For iPhone/iPad, use a simple HTTP host or deploy it (below).

## Deploy free in minutes
- **GitHub Pages**: Create a repo, commit these files, and enable Pages → branch: main → root. Open the URL and **Add to Home Screen** on your phone.
- **Netlify Drop** or **Vercel**: Drag the folder onto their dashboards (free tiers). Open the URL and **Add to Home Screen**.

## iPhone/iPad (App-like)
1. Visit your hosted URL in Safari.
2. Share → **Add to Home Screen**.
3. Launch from the icon like a native app (standalone, full-screen).

## Optional: YouTube metadata (no streaming)
If you also downloaded the Node backend, set `CONFIG.BACKEND_ORIGIN` in `app.js` to your backend origin. The YouTube panel will appear for **search/metadata only** (no audio extraction).

## Limitations (same as prototype)
- No key-lock/time-stretch yet.
- No library/beatgrids.
- Do not attempt to stream or record copyrighted material from websites.

MIT license for this demo; respect 3rd-party ToS.
