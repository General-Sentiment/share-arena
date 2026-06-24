/* Are.na → Social
 * Renders an Are.na block or channel into share-ready images, in Are.na's style.
 * Static, serverless, no auth: read-only against the public Are.na v3 API.
 */

'use strict';

const API = 'https://api.are.na/v3';
const FONT = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

/* Are.na logo mark (for stamping onto the export). */
const ARENA_W = 150.38;
const ARENA_H = 88.986;
const ARENA_PATH = 'M148.93 62.356l-20.847-16.384c-1.276-1-1.276-2.642 0-3.645l20.848-16.38c1.28-1.002 1.815-2.695 1.19-3.76-.626-1.062-2.374-1.44-3.88-.84l-24.79 9.874c-1.507.606-2.927-.22-3.153-1.83L114.57 2.926C114.34 1.317 113.13 0 111.877 0c-1.247 0-2.456 1.317-2.68 2.925l-3.73 26.467c-.228 1.61-1.646 2.434-3.155 1.83l-24.38-9.71c-1.512-.602-3.975-.602-5.483 0l-24.384 9.71c-1.508.604-2.928-.22-3.154-1.83L41.186 2.925C40.956 1.317 39.748 0 38.5 0c-1.252 0-2.463 1.317-2.688 2.925l-3.73 26.467c-.226 1.61-1.645 2.434-3.153 1.83L4.14 21.35c-1.507-.603-3.252-.223-3.878.838-.625 1.066-.092 2.76 1.184 3.76l20.85 16.38c1.277 1.003 1.277 2.645 0 3.646L1.446 62.356C.166 63.358-.364 65.152.26 66.34c.627 1.19 2.372 1.668 3.877 1.064l24.567-9.866c1.51-.603 2.914.218 3.125 1.828l3.544 26.696c.214 1.607 1.618 2.923 3.12 2.923 1.5 0 2.905-1.315 3.12-2.923l3.55-26.696c.21-1.61 1.62-2.43 3.122-1.828l24.164 9.698c1.506.606 3.97.606 5.477 0l24.16-9.698c1.504-.603 2.91.218 3.125 1.828l3.55 26.696c.212 1.607 1.617 2.923 3.115 2.923 1.502 0 2.907-1.315 3.12-2.923l3.55-26.696c.216-1.61 1.62-2.43 3.124-1.828l24.57 9.866c1.5.604 3.25.125 3.876-1.063.627-1.186.094-2.98-1.185-3.982zM95.89 46.18L77.53 60.315c-1.285.99-3.393.99-4.674 0L54.49 46.18c-1.284-.99-1.294-2.62-.02-3.625l18.4-14.493c1.274-1.005 3.363-1.005 4.638 0l18.4 14.493c1.277 1.004 1.267 2.634-.02 3.626z';

/* Output formats — the renderer is parametric; add/change freely. */
const FORMATS = [
  { key: 'story',  name: 'Story',  w: 1080, h: 1920, ratio: '9:16' },
  { key: 'post',   name: 'Post',   w: 1080, h: 1440, ratio: '3:4' },
  { key: 'square', name: 'Square', w: 1080, h: 1080, ratio: '1:1' },
];

/* Flat white / flat black only. */
const THEMES = {
  // `ink` = block/text content; `cap` = caption title, url, and logo
  white: { bg: '#FFFFFF', blockBg: '#FFFFFF', border: 'rgba(0,0,0,0.28)', ink: '#000000', cap: '#999999' },
  black: { bg: '#000000', blockBg: '#000000', border: 'rgba(255,255,255,0.38)', ink: '#FFFFFF', cap: '#666666' },
};

/* Fixed text size for rendered text blocks (constant regardless of length). */
const TEXT_SIZE_FACTOR = 0.030;   // × canvas width
const TEXT_PAD_FACTOR = 0.0425;   // × square side (half of the original)
const TEXT_LINE_HEIGHT = 1.34;

/* ------------------------------------------------------------------ state */
const state = {
  channel: null,
  blocks: [],
  selected: null,
  format: 'story',
  theme: 'white',
  fit: 'contain',
  caption: true,
  logo: false,
  border: true,
  layout: 'single', // 'single' | 'grid' (channels only)
};

const imageCache = new Map();

/* ------------------------------------------------------------------- dom */
const $ = (sel, root = document) => root.querySelector(sel);
const el = {
  brand: $('.brand'),
  form: $('#form'),
  input: $('#input'),
  go: $('#go'),
  status: $('#status'),
  intro: $('#intro'),
  exporter: $('#exporter'),
  canvas: $('#canvas'),
  metaLink: $('#metaLink'),
  download: $('#download'),
  sizeSelect: $('#sizeSelect'),
  layoutRow: $('#layoutRow'),
  layoutToggle: $('#layoutToggle'),
  bgToggle: $('#bgToggle'),
  fitToggle: $('#fitToggle'),
  captionToggle: $('#captionToggle'),
  logoToggle: $('#logoToggle'),
  borderToggle: $('#borderToggle'),
  strip: $('#strip'),
  stripLabel: $('#stripLabel'),
  stripTrack: $('#stripTrack'),
};

/* ------------------------------------------------------------ input parse */
function parseInput(raw) {
  const s = (raw || '').trim();
  if (!s) return null;

  let path = s;
  const m = s.match(/are\.na\/(.+)$/i);
  if (m) {
    path = m[1];
  } else if (/^https?:\/\//i.test(s)) {
    try { path = new URL(s).pathname; } catch (_) { /* keep s */ }
  }

  if (path.includes('/')) {
    const parts = path.split(/[?#]/)[0].split('/').filter(Boolean);
    const bi = parts.findIndex((p) => p === 'block' || p === 'blocks');
    if (bi !== -1 && parts[bi + 1]) return { type: 'block', ref: parts[bi + 1] };
    if (parts.length >= 2) return { type: 'channel', ref: parts[1] };
    if (parts.length === 1) return { type: 'channel', ref: parts[0] };
  }

  if (/^\d+$/.test(s)) return { type: 'id', ref: s };
  return { type: 'channel', ref: s };
}

/* ------------------------------------------------------------------ fetch */
async function api(path) {
  const res = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchChannel(ref) {
  const meta = await api(`/channels/${encodeURIComponent(ref)}`);
  const key = encodeURIComponent(meta.slug || ref);

  let blocks = [];
  let page = 1;
  while (page <= 4) {
    const res = await api(`/channels/${key}/contents?per=100&page=${page}`);
    blocks = blocks.concat((res.data || []).filter(Boolean));
    if (!res.meta || !res.meta.has_more_pages || blocks.length >= 200) break;
    page += 1;
  }

  const channel = {
    title: meta.title || meta.slug,
    slug: meta.slug,
    length: (meta.counts && meta.counts.contents) || blocks.length,
    user: { slug: meta.owner && meta.owner.slug, name: meta.owner && meta.owner.name },
  };
  return { channel, blocks };
}

const fetchBlock = (ref) => api(`/blocks/${encodeURIComponent(ref)}`);

/* ------------------------------------------------------------ block model */
function blockKind(b) {
  switch (b.type) {
    case 'Image': return 'image';
    case 'Text': return 'text';
    case 'Embed':
    case 'Media': return 'media';
    case 'Link': return 'link';
    case 'Attachment': return 'attachment';
    case 'Channel': return 'channel';
    default: return (b.image ? 'image' : 'text');
  }
}

function imgSrc(variant) {
  return variant ? (variant.src || variant.src_2x || null) : null;
}

function blockImageURL(b, size) {
  const img = b.image;
  if (!img) return null;
  const order = size === 'thumb'
    ? ['square', 'small', 'medium', 'large']
    : ['large', 'medium', 'small', 'square'];
  for (const k of order) {
    const url = imgSrc(img[k]);
    if (url) return url;
  }
  return img.src || null;
}

function richText(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return v.plain || v.markdown || (v.html ? v.html.replace(/<[^>]+>/g, '') : '') || '';
}

function blockText(b) {
  return (richText(b.content) || richText(b.description)).trim();
}

// The block's body as markdown source (content for Text blocks, description for others).
function blockMarkdown(b) {
  const md = (v) => {
    if (!v) return '';
    if (typeof v === 'string') return v;
    return v.markdown || v.plain || '';
  };
  return (md(b.content) || md(b.description)).trim();
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
}

function blockTitle(b) {
  if (b.title) return b.title;
  const s = b.source || {};
  if (s.title) return s.title;
  if (s.provider && s.provider.name) return s.provider.name;
  if (s.url) return hostOf(s.url) || 'Untitled';
  const t = blockText(b);
  if (t) return t.length > 60 ? t.slice(0, 57) + '…' : t;
  return 'Untitled';
}

function captionTitle(block) {
  if (block.title) return block.title;
  const s = block.source || {};
  if (s.title) return s.title;
  if (state.channel && state.channel.title) return state.channel.title;
  if (s.provider && s.provider.name) return s.provider.name;
  if (s.url) return hostOf(s.url);
  return 'Are.na';
}

function handleText(block) {
  if (state.channel) return `are.na/${state.channel.user.slug || ''}/${state.channel.slug}`;
  const s = block.source || {};
  if (s.url) return hostOf(s.url);
  return 'are.na';
}

function isVideoEmbed(b) {
  const type = (b.embed && b.embed.type || '').toLowerCase();
  if (type === 'video') return true;
  return /youtube\.com|youtu\.be|vimeo\.com/i.test((b.source && b.source.url) || '');
}

function arenaURL(block) {
  return `https://www.are.na/block/${block.id}`;
}

/* --------------------------------------------------------- image loading */
function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (imageCache.has(url)) return imageCache.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  imageCache.set(url, p);
  return p;
}

/* ------------------------------------------------------------- canvas draw */
function fitDims(iw, ih, bw, bh, mode) {
  const scale = mode === 'cover' ? Math.max(bw / iw, bh / ih) : Math.min(bw / iw, bh / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  return { dw, dh, dx: (bw - dw) / 2, dy: (bh - dh) / 2 };
}

function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of text.split(/\r?\n/)) {
    if (para.trim() === '') { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = word;
        while (ctx.measureText(line).width > maxW && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxW) cut -= 1;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

function truncToWidth(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

/* Minimal markdown for block bodies: headings -> bold, **bold** inline, links -> their text. */
function mdInline(text) {
  const s = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')     // images -> drop
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // links -> label
    .replace(/`([^`]+)`/g, '$1');             // inline code -> text
  const segs = [];
  const re = /(\*\*|__)(.+?)\1/g;
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) segs.push({ text: s.slice(last, m.index), bold: false });
    segs.push({ text: m[2], bold: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) segs.push({ text: s.slice(last), bold: false });
  return segs.length ? segs : [{ text: s, bold: false }];
}

function mdParse(md) {
  const out = [];
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { out.push(null); continue; }              // blank -> paragraph gap
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (h) { out.push(mdInline(h[2]).map((x) => ({ text: x.text, bold: true }))); continue; } // heading -> bold
    out.push(mdInline(line.replace(/^\s*[-*+]\s+/, '• ').replace(/^>\s?/, '')));
  }
  return out;
}

function mdWrap(ctx, segs, maxW, fontOf) {
  const words = [];
  for (const seg of segs) for (const w of seg.text.split(/\s+/)) if (w) words.push({ text: w, bold: seg.bold });
  const lines = [];
  let line = [];
  let lineW = 0;
  for (const w of words) {
    ctx.font = fontOf(w.bold);
    const ww = ctx.measureText(w.text).width;
    const sp = line.length ? ctx.measureText(' ').width : 0;
    if (line.length && lineW + sp + ww > maxW) { lines.push(line); line = [{ ...w, lead: false }]; lineW = ww; }
    else { line.push({ ...w, lead: line.length > 0 }); lineW += sp + ww; }
  }
  if (line.length) lines.push(line);
  return lines;
}

// Fixed size, top-left, clipped to the square; renders block bodies with light markdown.
function drawMarkdown(ctx, md, box, theme, fontSize) {
  const pad = box.s * TEXT_PAD_FACTOR;
  const innerW = box.s - pad * 2;
  const lh = fontSize * TEXT_LINE_HEIGHT;
  const fontOf = (bold) => `${bold ? 'bold ' : ''}${fontSize}px ${FONT}`;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.s, box.s);
  ctx.clip();
  ctx.fillStyle = theme.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let y = box.y + pad;
  const x0 = box.x + pad;
  for (const para of mdParse(md)) {
    if (para === null) { y += lh * 0.5; continue; }
    for (const line of mdWrap(ctx, para, innerW, fontOf)) {
      let x = x0;
      for (const w of line) {
        ctx.font = fontOf(w.bold);
        const t = (w.lead ? ' ' : '') + w.text;
        ctx.fillText(t, x, y);
        x += ctx.measureText(t).width;
      }
      y += lh;
    }
  }
  ctx.restore();
}

function drawPlayButton(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.beginPath();
  const t = r * 0.46;
  ctx.moveTo(cx - t * 0.5, cy - t);
  ctx.lineTo(cx - t * 0.5, cy + t);
  ctx.lineTo(cx + t * 0.9, cy);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();
}

function drawLogo(ctx, cx, top, targetW, color) {
  const scale = targetW / ARENA_W;
  ctx.save();
  ctx.translate(cx - targetW / 2, top);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(ARENA_PATH));
  ctx.restore();
}

function footerMetrics(w) {
  const m = { hasLogo: state.logo, hasCap: state.caption };
  // title and url are the same size
  const capF = Math.round(w * 0.0205);
  m.titleF = m.hasCap ? capF : 0;
  m.handleF = m.hasCap ? capF : 0;
  m.gapTitleHandle = m.hasCap ? w * 0.012 : 0;
  m.capH = m.hasCap ? (m.titleF + m.gapTitleHandle + m.handleF) : 0;
  // logo sits beneath the text, a third of its former size
  m.logoW = m.hasLogo ? (w * 0.10 / 3) : 0;
  m.logoH = m.hasLogo ? m.logoW * (ARENA_H / ARENA_W) : 0;
  m.gapCapLogo = (m.hasLogo && m.hasCap) ? w * 0.022 : 0;
  m.total = m.capH + m.gapCapLogo + m.logoH;
  return m;
}

function drawFooter(ctx, block, top, w, theme, m) {
  let y = top;
  if (m.hasCap) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = theme.cap;
    ctx.font = `bold ${m.titleF}px ${FONT}`;
    ctx.fillText(truncToWidth(ctx, captionTitle(block), w * 0.86), w / 2, y);
    y += m.titleF + m.gapTitleHandle;
    ctx.font = `${m.handleF}px ${FONT}`;
    ctx.fillText(truncToWidth(ctx, handleText(block), w * 0.86), w / 2, y);
    y += m.handleF + m.gapCapLogo;
  }
  if (m.hasLogo) {
    drawLogo(ctx, w / 2, y, m.logoW, theme.cap);
  }
}

// Draws one Are.na block (image / video / text) into a square at (x,y,size).
function drawBlockFace(ctx, block, x, y, size, theme, img, fontSize) {
  ctx.fillStyle = theme.blockBg;
  ctx.fillRect(x, y, size, size);

  const kind = blockKind(block);
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    const f = fitDims(img.naturalWidth || img.width, img.naturalHeight || img.height, size, size, state.fit);
    ctx.drawImage(img, x + f.dx, y + f.dy, f.dw, f.dh);
    ctx.restore();
    if (kind === 'media' && isVideoEmbed(block)) {
      drawPlayButton(ctx, x + size / 2, y + size / 2, size * 0.09);
    }
  } else {
    drawMarkdown(ctx, blockMarkdown(block) || blockTitle(block), { x, y, s: size }, theme, fontSize);
  }

  if (state.border) {
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = Math.max(1.5, size * 0.0026);
    ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
  }
}

let renderSeq = 0;

async function renderToCanvas(canvas, block, fmt) {
  const token = ++renderSeq; // guards against overlapping async renders
  const theme = THEMES[state.theme];
  const { w, h } = fmt;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);

  const gridMode = state.layout === 'grid' && !!state.channel && state.blocks.length > 0;

  const m = footerMetrics(w);
  const hasFooter = m.hasLogo || m.hasCap;
  const pad = w * 0.05;
  const gap = hasFooter ? w * 0.045 : 0;
  const availH = h - pad * 2 - (hasFooter ? m.total + gap : 0);
  const s = Math.min(w - pad * 2, availH);
  const sx = (w - s) / 2;
  const groupH = s + (hasFooter ? gap + m.total : 0);
  const sy = Math.max(pad, (h - groupH) / 2);

  // Which block(s) fill the square: one, or a 2×2 starting at the selected block.
  let cells;
  if (gridMode) {
    const g = s * 0.03;
    const cs = (s - g) / 2;
    const start = Math.max(0, state.blocks.indexOf(block));
    const n = state.blocks.length;
    cells = [0, 1, 2, 3].map((i) => {
      const b = state.blocks[(start + i) % n];
      const col = i % 2;
      const row = (i / 2) | 0;
      return { block: b, x: sx + col * (cs + g), y: sy + row * (cs + g), size: cs };
    });
  } else {
    cells = [{ block, x: sx, y: sy, size: s }];
  }

  // Preload every cell's image up front, then draw.
  const imgs = await Promise.all(cells.map((c) => {
    const url = blockKind(c.block) !== 'text' ? blockImageURL(c.block, 'large') : null;
    return url ? loadImage(url) : Promise.resolve(null);
  }));
  if (token !== renderSeq) return; // a newer render superseded us while awaiting images

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const fontSize = gridMode ? Math.round(c.size * 0.0333) : Math.round(w * TEXT_SIZE_FACTOR);
    drawBlockFace(ctx, c.block, c.x, c.y, c.size, theme, imgs[i], fontSize);
  }

  // In grid mode the caption represents the channel, not a single block.
  if (hasFooter) drawFooter(ctx, gridMode ? {} : block, sy + s + gap, w, theme, m);
}

/* --------------------------------------------------------------- preview */
function currentFormat() {
  return FORMATS.find((f) => f.key === state.format) || FORMATS[0];
}

async function renderPreview() {
  if (!state.selected) return;
  await renderToCanvas(el.canvas, state.selected, currentFormat());
}

function downloadImage() {
  const fmt = currentFormat();
  el.canvas.toBlob((blob) => {
    if (!blob) return;
    const slug = state.channel ? state.channel.slug : `block-${state.selected.id}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `arena-${slug}-${fmt.key}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}

/* -------------------------------------------------------------- selection */
function selectBlock(block) {
  state.selected = block;

  el.metaLink.textContent = blockTitle(block);
  el.metaLink.href = arenaURL(block);

  for (const c of el.stripTrack.querySelectorAll('.cell')) {
    c.classList.toggle('is-selected', Number(c.dataset.id) === block.id);
  }

  el.exporter.hidden = false;
  renderPreview(); // re-renders in place — no scroll jump
}

/* ------------------------------------------------------------------ strip */
function renderStrip() {
  el.stripTrack.innerHTML = '';
  for (const block of state.blocks) {
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.type = 'button';
    cell.dataset.id = block.id;
    cell.title = blockTitle(block);

    const kind = blockKind(block);
    const thumb = blockImageURL(block, 'thumb');
    if (thumb) {
      const im = new Image();
      im.loading = 'lazy';
      im.alt = '';
      im.src = thumb;
      cell.appendChild(im);
      if (kind === 'media' && isVideoEmbed(block)) {
        const play = document.createElement('span');
        play.className = 'play';
        cell.appendChild(play);
      }
    } else {
      const t = document.createElement('div');
      t.className = 'cell-text';
      t.textContent = blockText(block) || blockTitle(block);
      cell.appendChild(t);
    }
    cell.addEventListener('click', () => selectBlock(block));
    el.stripTrack.appendChild(cell);
  }
  el.stripTrack.scrollLeft = 0;
}

/* ----------------------------------------------------------------- status */
function setStatus(msg, isError = false) {
  el.status.textContent = msg || '';
  el.status.title = msg || ''; // full text on hover, since the toolbar slot truncates
  el.status.classList.toggle('error', !!isError);
}

/* ------------------------------------------------------------------- load */
async function load(rawInput, { pushUrl = true } = {}) {
  const parsed = parseInput(rawInput);
  if (!parsed) { setStatus('Enter an Are.na channel or block.', true); return; }

  el.go.disabled = true;
  setStatus('Loading…');

  try {
    if (parsed.type === 'block') {
      enterBlock(await fetchBlock(parsed.ref));
    } else if (parsed.type === 'channel') {
      const { channel, blocks } = await fetchChannel(parsed.ref);
      enterChannel(channel, blocks);
    } else {
      try {
        enterBlock(await fetchBlock(parsed.ref));
      } catch (e) {
        if (e.status === 404) {
          const { channel, blocks } = await fetchChannel(parsed.ref);
          enterChannel(channel, blocks);
        } else { throw e; }
      }
    }

    if (pushUrl) {
      const url = new URL(location.href);
      url.searchParams.set('q', rawInput.trim());
      history.replaceState(null, '', url);
    }
    setStatus('');
  } catch (e) {
    console.error(e);
    if (e.status === 404) setStatus('Not found. Check the channel slug or block ID.', true);
    else if (e.status === 401 || e.status === 403) setStatus('That channel is private.', true);
    else if (e.status === 429) setStatus('Rate limited (30/min). Try again shortly.', true);
    else setStatus('Could not load that. Is the link right?', true);
  } finally {
    el.go.disabled = false;
  }
}

function enterChannel(channel, blocks) {
  state.channel = channel;
  state.blocks = blocks;
  el.intro.hidden = true;
  el.layoutRow.hidden = false; // grid option is channel-only

  const shown = blocks.length;
  const total = channel.length || shown;
  const count = total > shown ? `${shown} of ${total} blocks` : `${total} block${total === 1 ? '' : 's'}`;
  el.stripLabel.textContent = `${channel.title} · ${count}`;
  el.strip.hidden = false;
  document.body.classList.add('has-strip');
  renderStrip();

  if (blocks[0]) selectBlock(blocks[0]);
  else { el.exporter.hidden = true; setStatus('That channel is empty.', true); }
}

function enterBlock(block) {
  state.channel = null;
  state.blocks = [block];
  el.intro.hidden = true;
  el.strip.hidden = true;
  document.body.classList.remove('has-strip');
  el.layoutRow.hidden = true; // grid is channel-only; rendering ignores layout when there's no channel
  selectBlock(block);
}

// Clicking the title clears everything and returns to the empty state.
function goHome() {
  state.channel = null;
  state.blocks = [];
  state.selected = null;
  el.exporter.hidden = true;
  el.strip.hidden = true;
  el.layoutRow.hidden = true;
  document.body.classList.remove('has-strip');
  el.intro.hidden = false;
  el.input.value = '';
  setStatus('');
  history.replaceState(null, '', location.pathname);
  if (!$('#examples').children.length) loadExamples();
}

/* --------------------------------------------------------------- controls */
function setActive(group, matchFn) {
  for (const b of group.children) b.classList.toggle('is-active', matchFn(b));
}

function wireControls() {
  // size dropdown
  el.sizeSelect.innerHTML = '';
  for (const f of FORMATS) {
    const o = document.createElement('option');
    o.value = f.key;
    o.textContent = `${f.name} · ${f.ratio}`;
    el.sizeSelect.appendChild(o);
  }
  el.sizeSelect.addEventListener('change', () => {
    state.format = el.sizeSelect.value;
    saveSettings();
    renderPreview();
  });

  // segmented controls
  const seg = (root, attr, key) => root.addEventListener('click', (e) => {
    const btn = e.target.closest(`[data-${attr}]`);
    if (!btn) return;
    state[key] = btn.dataset[attr];
    setActive(root, (b) => b === btn);
    saveSettings();
    renderPreview();
  });
  seg(el.bgToggle, 'bg', 'theme');
  seg(el.layoutToggle, 'layout', 'layout');
  seg(el.fitToggle, 'fit', 'fit');

  // boolean chips
  const chip = (btn, key) => btn.addEventListener('click', () => {
    state[key] = !state[key];
    btn.classList.toggle('is-active', state[key]);
    btn.setAttribute('aria-pressed', String(state[key]));
    saveSettings();
    renderPreview();
  });
  chip(el.borderToggle, 'border');
  chip(el.captionToggle, 'caption');
  chip(el.logoToggle, 'logo');

  el.download.addEventListener('click', downloadImage);
}

/* --------------------------------------------------------------- examples */
const FEATURED = 'featured-channels-c1f30sunbl4';

async function loadExamples() {
  try {
    const res = await api(`/channels/${FEATURED}/contents?per=20&page=1`);
    const chans = (res.data || []).filter((b) => b.type === 'Channel' && b.slug).slice(0, 20);
    if (!chans.length) return;
    const wrap = $('#examples');
    wrap.innerHTML = '';
    for (const c of chans) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.title ? c.title.trim() : c.slug;
      b.addEventListener('click', () => { el.input.value = c.slug; load(c.slug); });
      wrap.appendChild(b);
    }
  } catch (_) { /* leave the intro as-is if the fetch fails */ }
}

/* --------------------------------------------------------------- settings */
const LS_KEY = 'share-arena:settings';
const PERSIST_KEYS = ['format', 'theme', 'fit', 'caption', 'logo', 'border', 'layout'];

function saveSettings() {
  try {
    const data = {};
    for (const k of PERSIST_KEYS) data[k] = state[k];
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch (_) { /* storage unavailable — non-fatal */ }
}

function loadSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    for (const k of PERSIST_KEYS) if (data[k] !== undefined) state[k] = data[k];
  } catch (_) { /* ignore corrupt data */ }
}

// Reflect the current state onto the controls (after restoring from storage).
function syncControls() {
  el.sizeSelect.value = state.format;
  setActive(el.bgToggle, (b) => b.dataset.bg === state.theme);
  setActive(el.fitToggle, (b) => b.dataset.fit === state.fit);
  setActive(el.layoutToggle, (b) => b.dataset.layout === state.layout);
  for (const [btn, on] of [[el.borderToggle, state.border], [el.captionToggle, state.caption], [el.logoToggle, state.logo]]) {
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  }
}

/* -------------------------------------------------------------------- init */
function init() {
  loadSettings();
  wireControls();
  syncControls();

  el.brand.addEventListener('click', goHome);

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    load(el.input.value);
  });

  const sp = new URLSearchParams(location.search);
  const q = sp.get('q') || sp.get('url') || sp.get('channel') || (sp.get('block') ? `block/${sp.get('block')}` : null);
  if (q) { el.input.value = q; load(q, { pushUrl: false }); }
  else { loadExamples(); }
}

init();
