# Share Are.na

A tiny, dependency-free web page that turns an **Are.na channel or block** into
share-ready images — rendered in Are.na's own block style.

Paste a link (or a slug, or an ID). You get the block as a square with a border —
exactly like Are.na — composed onto three social formats, each downloadable as a PNG.

| Format | Size | Ratio |
| --- | --- | --- |
| Story | 1080 × 1920 | 9:16 |
| Post | 1080 × 1440 | 3:4 |
| Square | 1080 × 1080 | 1:1 |

Pick the format from the **Size** dropdown — one preview at a time. The interface is
modeled on Are.na: Arial, square, monochrome, and built mobile-first.

## What it accepts

Any of these in the input field (or via `?q=` in the URL):

- A full URL — `https://www.are.na/jon-kyle-mohr/web-hot`
- A channel slug — `web-hot`
- A block URL or reference — `are.na/block/608547` or `block/608547`
- A bare ID — `608547` (tried as a block, then a channel)

**Channels** open as an Are.na-style grid — click any block to compose it.
**Blocks** open straight to the export view.

Every block type is supported the way Are.na shows it:
- **Image** — the image, fit or filled inside the square
- **Text** — the text, set on a clean card
- **Link** — the link's preview image
- **Media / video** — the thumbnail with a play marker

## Controls

- **Size** — Story / Post / Square (dropdown)
- **Layout** — a single block, or a 2×2 grid of four channel blocks (channels only)
- **Background** — flat white or flat black
- **Image** — Fit (letterbox the whole block) or Fill (crop to fill the square)
- **Caption** — toggle the title + `are.na/…` attribution line
- **Logo** — stamp the Are.na mark onto the export

A channel opens its blocks in a **fixed horizontal strip at the bottom** — tap any block
to compose it; the preview updates in place without the page jumping. Text blocks render
left-aligned at a fixed size (longer text simply wraps to more lines).

## Deep links

Prefill and auto-load via query params:

```
?q=web-hot
?q=block/608547
?channel=web-hot
?block=608547
?url=https://www.are.na/jon-kyle-mohr/web-hot
```

## Running it

It's three static files — no build, no dependencies. Serve the folder with anything:

```bash
python3 -m http.server 8731
# then open http://localhost:8731
```

Deploy by dropping `index.html`, `styles.css`, and `app.js` on any static host
(GitHub Pages, Netlify, Vercel, S3, …).

## How it works

- Data comes from the public **Are.na v3 API** (`https://api.are.na/v3`), used
  **read-only with no authentication** — so the whole thing is static and serverless.
  Endpoints: `GET /channels/:slug`, `GET /channels/:slug/contents`, `GET /blocks/:id`.
- Are.na's image CDN (`images.are.na`) sends `Access-Control-Allow-Origin: *`, so images
  load cross-origin without tainting the `<canvas>` — exports work with no proxy.
- The on-screen preview **is** the downloaded asset: each preview is a full-resolution
  canvas displayed scaled down, so what you see is exactly what you get.
- All Are.na access is isolated to the `API` constant and the `fetch*` / `block*` helpers
  in `app.js`.

## Notes

- Unauthenticated (guest) requests are rate-limited by Are.na to **30 / minute**; the app
  shows a message if you hit it. Loading a channel costs ~2 requests + one image per block.
- Private channels can't be read without a token, so they report as private.
- For large channels, up to 200 blocks are loaded for the grid (newest-first), 100 per page.
