/**
 * Canvas painters for the four crew meme cards (issue #87): the 1080×1920 PNG the admin saves or shares to the
 * Zalo group. Each painter draws the final frame of the in-app animation, laid out on the mockup's 270×480 card and
 * scaled ×4. Every label comes in from the caller (this library has no copy), as with `ledgerCard.ts`.
 */

export type MemeKind = 'awards' | 'wanted' | 'verse' | 'board';
export interface MemeAward {
  kind: 'regular' | 'back' | 'guest' | 'noShow';
  title: string;
  name: string;
  stat: string;
}
export type MemeInput =
  | { kind: 'awards'; heading: string; subheading: string; awards: MemeAward[]; footer: string }
  | {
      kind: 'wanted';
      heading: string;
      group: string;
      name: string;
      initials: string;
      avatarUrl?: string | null;
      crime: string;
      lastSeen: string;
      reward: string;
      stamp: string | null;
      footer: string;
    }
  | {
      kind: 'verse';
      heading: string;
      month: string;
      verses: { line6: string; line8: string; name: string; tag: string }[];
      seal: string;
      footer: string;
    }
  | {
      kind: 'board';
      heading: string;
      subheading: string;
      rows: { label: string; name: string; value: number; tone: 'hot' | 'plain' | 'cold' }[];
      ticker: string;
      footer: string;
    };

/** The mockup's colours (`.superpowers/brainstorm/.../meme-cards.html`). Image-only: these never reach the UI theme. */
export const MEME_COLOURS = {
  awards: {
    bg: '#0b4f4a',
    glow: 'rgba(20, 184, 166, 0.45)',
    glowEnd: 'rgba(20, 184, 166, 0)',
    ink: '#f6f7f4',
    row: '#f6f7f4',
    title: '#0f766e',
    name: '#1c1917',
    stat: '#57534e',
    foot: '#ccfbf1',
    avatar: {
      regular: { bg: '#bbf7d0', ink: '#14532d' },
      back: { bg: '#bfdbfe', ink: '#1e3a8a' },
      guest: { bg: '#fde68a', ink: '#78350f' },
      noShow: { bg: '#fecdd3', ink: '#881337' },
    },
  },
  wanted: {
    bg: '#efe1c3',
    shine: 'rgba(255, 255, 255, 0.45)',
    shineEnd: 'rgba(255, 255, 255, 0)',
    stain: 'rgba(120, 80, 30, 0.18)',
    stainEnd: 'rgba(120, 80, 30, 0)',
    ink: '#3b2a1a',
    border: '#6b4a2b',
    // The photo is sepia(.35)-filtered in the mockup: these are its colours after the filter.
    photo: '#ffe2d1',
    photoInk: '#742537',
    photoBorder: '#3c2e20',
    stamp: '#047857',
    stampBg: 'rgba(239, 225, 195, 0.55)',
    foot: '#6b4a2b',
  },
  verse: {
    bg: '#fbf6ee',
    ink: '#2a2420',
    frame: '#c9b79c',
    frameInner: '#e3d6c2',
    month: '#7a6a58',
    name: '#0f766e',
    tag: '#6b5b49',
    seal: '#b91c1c',
    sealInk: '#fbf6ee',
    foot: '#7a6a58',
  },
  board: {
    bg: '#111a19',
    ink: '#e6fffb',
    heading: '#5eead4',
    sub: '#a7c4c0',
    row: '#1b2726',
    flap: '#0a1110',
    flapLine: '#000000',
    hot: '#5eead4',
    plain: '#ffffff',
    cold: '#fda4af',
    ticker: '#5eead4',
    tickerInk: '#0a1110',
    foot: '#a7c4c0',
  },
} as const;

/** Mockup card size; the PNG is SCALE times this. */
const W = 270;
const H = 480;
const SCALE = 4;

const BODY = '"Be Vietnam Pro", system-ui, sans-serif';
const SLAB = '"Alfa Slab One", Georgia, serif';
const SERIF = '"Playfair Display", Georgia, serif';
const BOARD = 'Bungee, Impact, sans-serif';

type Ctx = CanvasRenderingContext2D;
interface Run {
  text: string;
  font: string;
  color: string;
}

/** `text` cut with "…" so `measure(text)` fits in `max` pixels. */
function fit(text: string, max: number, measure: (s: string) => number): string {
  if (measure(text) <= max) return text;
  const chars = Array.from(text);
  while (chars.length > 0 && measure(chars.join('') + '…') > max) chars.pop();
  return chars.join('') + '…';
}

function setFont(ctx: Ctx, font: string, spacingEm = 0, size = 0) {
  ctx.font = font;
  // letterSpacing is newer than some typings and some engines; an engine without it just ignores the assignment.
  (ctx as unknown as { letterSpacing: string }).letterSpacing = spacingEm && size ? `${spacingEm * size}px` : '0px';
}

function width(ctx: Ctx, s: string) {
  return ctx.measureText(s).width;
}

/** One line of text in `font`, cut to `max`, drawn at (x, y) with the current alignment. Returns what was drawn. */
function line(ctx: Ctx, text: string, x: number, y: number, max: number, font: string, color: string, spacingEm = 0, size = 0) {
  setFont(ctx, font, spacingEm, size);
  ctx.fillStyle = color;
  const shown = fit(text, max, (s) => width(ctx, s));
  ctx.fillText(shown, x, y);
  return shown;
}

/** Mixed-style runs on one line, cut with "…" where they pass `max`. Left edge at x, or centred on x. */
function runs(ctx: Ctx, parts: Run[], x: number, y: number, max: number, centred: boolean) {
  const laid: (Run & { w: number })[] = [];
  let used = 0;
  for (const p of parts) {
    if (!p.text) continue;
    setFont(ctx, p.font);
    const w = width(ctx, p.text);
    if (used + w <= max) {
      laid.push({ ...p, w });
      used += w;
      continue;
    }
    const text = fit(p.text, max - used, (s) => width(ctx, s));
    const cw = width(ctx, text);
    laid.push({ ...p, text, w: cw });
    used += cw;
    break;
  }
  ctx.textAlign = 'left';
  let cx = centred ? x - used / 2 : x;
  for (const p of laid) {
    setFont(ctx, p.font);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, cx, y);
    cx += p.w;
  }
}

/** Up to two lines: an explicit "\n" wins; otherwise split at the word break that balances the two widths. */
function twoLines(text: string, max: number, measure: (s: string) => number): string[] {
  const explicit = text.split('\n').filter(Boolean);
  if (explicit.length > 1) return explicit.slice(0, 2).map((l) => fit(l, max, measure));
  if (measure(text) <= max) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [fit(text, max, measure)];
  let best = 1;
  let bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const w = Math.max(measure(words.slice(0, i).join(' ')), measure(words.slice(i).join(' ')));
    if (w < bestW) {
      bestW = w;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')].map((l) => fit(l, max, measure));
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function radial(ctx: Ctx, cx: number, cy: number, r: number, from: string, to: string) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** The mockup's shuttlecock symbol (viewBox 24×32) drawn as paths into a w×h box. */
function shuttle(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / 24, h / 32);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(4, 2);
  ctx.lineTo(12, 20);
  ctx.lineTo(20, 2);
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of [
    [8, 2, 12, 20],
    [16, 2, 12, 20],
    [12, 2, 12, 20],
    [6.5, 8, 17.5, 8],
    [8.2, 13, 15.8, 13],
  ] as const) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(8.5, 20);
  ctx.lineTo(15.5, 20);
  ctx.lineTo(15.5, 23);
  ctx.arc(12, 23, 3.5, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function footer(ctx: Ctx, text: string, color: string) {
  ctx.textAlign = 'center';
  line(ctx, text, W / 2, H - 20, W - 32, `600 11px ${BODY}`, color, 0.04, 11);
}

/** Two-letter avatar initials: the start of the given name (the last word in a Vietnamese name). */
function initialsOf(name: string) {
  const words = name.trim().split(/\s+/);
  return Array.from(words[words.length - 1] ?? '').slice(0, 2).join('');
}

function paintAwards(ctx: Ctx, input: Extract<MemeInput, { kind: 'awards' }>) {
  const C = MEME_COLOURS.awards;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  // The glow: a closest-side radial gradient on a box 70% tall, hanging 40% above the card.
  radial(ctx, W / 2, -24, 168, C.glow, C.glowEnd);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const inner = W - 32;
  ctx.globalAlpha = 0.8;
  line(ctx, input.subheading, W / 2, 28, inner, `600 11px ${BODY}`, C.ink, 0.05, 11);
  ctx.globalAlpha = 1;
  setFont(ctx, `900 26px ${BODY}`);
  const heads = twoLines(input.heading, inner, (s) => width(ctx, s));
  heads.forEach((h, i) => line(ctx, h, W / 2, 54 + i * 27.3, inner, `900 26px ${BODY}`, C.ink));

  const rowH = 66;
  let y = 40 + heads.length * 27.3 + 16;
  for (const a of input.awards.slice(0, 4)) {
    ctx.fillStyle = C.row;
    roundRect(ctx, 16, y, inner, rowH, 16);
    ctx.fill();

    const av = C.avatar[a.kind];
    ctx.fillStyle = av.bg;
    ctx.beginPath();
    ctx.arc(27 + 19, y + rowH / 2, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    line(ctx, initialsOf(a.name), 27 + 19, y + rowH / 2, 32, `700 13px ${BODY}`, av.ink);

    ctx.textAlign = 'left';
    const tx = 75;
    const col = 16 + inner - 11 - tx;
    line(ctx, a.title, tx, y + 16.5, col, `700 11px ${BODY}`, C.title, 0.03, 11);
    line(ctx, a.name, tx, y + 32.5, col, `800 15px ${BODY}`, C.name);
    line(ctx, a.stat, tx, y + 49, col, `400 12px ${BODY}`, C.stat);
    y += rowH + 9;
  }
  footer(ctx, input.footer, C.foot);
}

function paintWanted(ctx: Ctx, input: Extract<MemeInput, { kind: 'wanted' }>, avatarImg?: HTMLImageElement | null) {
  const C = MEME_COLOURS.wanted;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  radial(ctx, 54, 72, 185, C.shine, C.shineEnd);
  radial(ctx, 229.5, 384, 201, C.stain, C.stainEnd);

  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  roundRect(ctx, 9, 9, W - 18, H - 18, 12);
  ctx.stroke();

  const inner = W - 36;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  line(ctx, input.heading, W / 2, 51, inner, `50px ${SLAB}`, C.ink, 0.02, 50);
  line(ctx, input.group, W / 2, 90, inner, `700 12px ${BODY}`, C.ink, 0.12, 12);

  // Photo: 132×132 with a 3px border.
  const px = (W - 132) / 2;
  const py = 112;
  ctx.fillStyle = C.photoBorder;
  ctx.fillRect(px, py, 132, 132);
  ctx.fillStyle = C.photo;
  ctx.fillRect(px + 3, py + 3, 126, 126);
  if (avatarImg && avatarImg.naturalWidth > 0 && avatarImg.naturalHeight > 0) {
    const boxX = px + 3;
    const boxY = py + 3;
    const boxSize = 126;
    const iw = avatarImg.naturalWidth;
    const ih = avatarImg.naturalHeight;
    const side = Math.min(iw, ih);
    const sx = (iw - side) / 2;
    const sy = (ih - side) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(boxX, boxY, boxSize, boxSize);
    ctx.clip();
    if ('filter' in ctx) ctx.filter = 'sepia(0.35)';
    ctx.drawImage(avatarImg, sx, sy, side, side, boxX, boxY, boxSize, boxSize);
    ctx.restore();
  } else {
    line(ctx, input.initials, W / 2, py + 66, 120, `44px ${SLAB}`, C.photoInk);
  }

  line(ctx, input.name, W / 2, 271, inner, `28px ${SLAB}`, C.ink);

  // "Tội danh: <b>…</b>": the part after the first ": " is bold, as in the mockup.
  const cut = input.crime.indexOf(': ');
  const crimeRuns: Run[] =
    cut >= 0
      ? [
          { text: input.crime.slice(0, cut + 2), font: `400 13px ${BODY}`, color: C.ink },
          { text: input.crime.slice(cut + 2), font: `800 13px ${BODY}`, color: C.ink },
        ]
      : [{ text: input.crime, font: `800 13px ${BODY}`, color: C.ink }];
  runs(ctx, crimeRuns, W / 2, 303, inner, true);
  ctx.textAlign = 'center';
  line(ctx, input.lastSeen, W / 2, 321, inner, `400 13px ${BODY}`, C.ink);

  // Reward: shuttle + text between two 2px rules.
  setFont(ctx, `800 13px ${BODY}`);
  const reward = fit(input.reward, inner - 38, (s) => width(ctx, s));
  const rw = 10 + 12 + 6 + width(ctx, reward) + 10;
  const rx = (W - rw) / 2;
  const ry = 342;
  const rh = 29;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rx, ry + 1);
  ctx.lineTo(rx + rw, ry + 1);
  ctx.moveTo(rx, ry + rh - 1);
  ctx.lineTo(rx + rw, ry + rh - 1);
  ctx.stroke();
  shuttle(ctx, rx + 10, ry + rh / 2 - 8, 12, 16, C.ink);
  ctx.textAlign = 'left';
  ctx.fillStyle = C.ink;
  ctx.fillText(reward, rx + 28, ry + rh / 2);

  if (input.stamp !== null) {
    ctx.save();
    ctx.translate(W / 2, H * 0.44);
    ctx.rotate((-14 * Math.PI) / 180);
    setFont(ctx, `27px ${SLAB}`);
    const stamp = fit(input.stamp, W - 60, (s) => width(ctx, s));
    const sw = width(ctx, stamp) + 32;
    const sh = 48;
    ctx.fillStyle = C.stampBg;
    roundRect(ctx, -sw / 2, -sh / 2, sw, sh, 10);
    ctx.fill();
    ctx.strokeStyle = C.stamp;
    ctx.lineWidth = 4;
    roundRect(ctx, -sw / 2 + 2, -sh / 2 + 2, sw - 4, sh - 4, 8);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = C.stamp;
    ctx.fillText(stamp, 0, 1);
    ctx.restore();
  }
  footer(ctx, input.footer, C.foot);
}

function paintVerse(ctx: Ctx, input: Extract<MemeInput, { kind: 'verse' }>) {
  const C = MEME_COLOURS.verse;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 1;
  ctx.strokeStyle = C.frame;
  roundRect(ctx, 10.5, 10.5, W - 21, H - 21, 14);
  ctx.stroke();
  ctx.strokeStyle = C.frameInner;
  roundRect(ctx, 16.5, 16.5, W - 33, H - 33, 10);
  ctx.stroke();

  const inner = W - 44;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  line(ctx, input.heading, W / 2, 38, inner, `700 20px ${SERIF}`, C.ink);
  line(ctx, input.month, W / 2, 62, inner, `italic 500 13px ${SERIF}`, C.month);

  const verseFont = (size: number, base: string) => `italic 500 ${size}px ${base}`;
  let y = 88;
  for (const v of input.verses.slice(0, 4)) {
    // Shrink a long couplet down to 13px before cutting it.
    let size = 15;
    for (; size > 13; size--) {
      setFont(ctx, verseFont(size, SERIF));
      if (width(ctx, v.line6) <= inner - 22 && width(ctx, v.line8) <= inner) break;
    }
    ctx.textAlign = 'left';
    line(ctx, v.line6, 22 + 22, y + 10.9, inner - 22, verseFont(size, SERIF), C.ink);
    const at = v.name ? v.line8.indexOf(v.name) : -1;
    const plain = verseFont(size, SERIF);
    const parts: Run[] =
      at >= 0
        ? [
            { text: v.line8.slice(0, at), font: plain, color: C.ink },
            { text: v.name, font: `700 ${size}px ${SERIF}`, color: C.name },
            { text: v.line8.slice(at + v.name.length), font: plain, color: C.ink },
          ]
        : [{ text: v.line8, font: plain, color: C.ink }];
    runs(ctx, parts, 22, y + 32.6, inner, false);
    line(ctx, `— ${v.tag}`, 22 + 22, y + 54.2, inner - 22, `400 12px ${BODY}`, C.tag, 0.06, 12);
    y += 62.9 + 14;
  }

  // Seal: 46×46, 22px from the right, 40px from the bottom, turned -6°.
  ctx.save();
  ctx.translate(W - 22 - 23, H - 40 - 23);
  ctx.rotate((-6 * Math.PI) / 180);
  ctx.fillStyle = C.seal;
  roundRect(ctx, -23, -23, 46, 46, 8);
  ctx.fill();
  ctx.textAlign = 'center';
  setFont(ctx, `700 13px ${SERIF}`);
  const seal = twoLines(input.seal, 40, (s) => width(ctx, s));
  seal.forEach((s, i) => line(ctx, s, 0, (i - (seal.length - 1) / 2) * 13.65, 40, `700 13px ${SERIF}`, C.sealInk));
  ctx.restore();

  footer(ctx, input.footer, C.foot);
}

function paintBoard(ctx: Ctx, input: Extract<MemeInput, { kind: 'board' }>) {
  const C = MEME_COLOURS.board;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  const inner = W - 28;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  setFont(ctx, `21px ${BOARD}`);
  const heads = twoLines(input.heading, inner, (s) => width(ctx, s));
  heads.forEach((h, i) => line(ctx, h, W / 2, 29 + i * 22.05, inner, `21px ${BOARD}`, C.heading));
  const subY = 18 + heads.length * 22.05 + 4 + 5.8;
  line(ctx, input.subheading, W / 2, subY, inner, `600 11px ${BODY}`, C.sub, 0.06, 11);

  const rowH = 52;
  let y = subY + 5.8 + 14;
  for (const r of input.rows.slice(0, 5)) {
    ctx.fillStyle = C.row;
    roundRect(ctx, 14, y, inner, rowH, 10);
    ctx.fill();

    const flapsX = 14 + inner - 10 - 47;
    const col = flapsX - 6 - 24;
    ctx.textAlign = 'left';
    line(ctx, r.label, 24, y + 16, col, `600 11.5px ${BODY}`, C.sub, 0.03, 11.5);
    line(ctx, r.name, 24, y + 35, col, `800 14px ${BODY}`, C.ink);

    const digits = String(Math.min(99, Math.max(0, Math.round(r.value)))).padStart(2, '0');
    Array.from(digits).forEach((d, i) => {
      const fx = flapsX + i * 25;
      const fy = y + (rowH - 30) / 2;
      ctx.fillStyle = C.flap;
      roundRect(ctx, fx, fy, 22, 30, 4);
      ctx.fill();
      ctx.textAlign = 'center';
      setFont(ctx, `18px ${BOARD}`);
      ctx.fillStyle = C[r.tone];
      ctx.fillText(d, fx + 11, fy + 15);
      ctx.fillStyle = C.flapLine;
      ctx.fillRect(fx, fy + 15, 22, 1);
    });
    y += rowH + 8;
  }

  // Ticker: a still frame shows the message from its start.
  ctx.fillStyle = C.ticker;
  ctx.fillRect(0, H - 34 - 26, W, 26);
  ctx.textAlign = 'left';
  line(ctx, input.ticker, 10, H - 34 - 13, W - 20, `800 12px ${BODY}`, C.tickerInk);

  footer(ctx, input.footer, C.foot);
}

/** The faces a card draws with, as `document.fonts.load` specs. */
function facesFor(kind: MemeKind): string[] {
  const body = ['400', '600', '700', '800', '900'].map((w) => `${w} 16px "Be Vietnam Pro"`);
  switch (kind) {
    case 'awards':
      return body;
    case 'wanted':
      return [...body, '50px "Alfa Slab One"'];
    case 'verse':
      return [...body, '700 20px "Playfair Display"', 'italic 500 15px "Playfair Display"'];
    case 'board':
      return [...body, '21px "Bungee"'];
  }
}

/** Every string a card shows, so `fonts.load` fetches the unicode-range subsets (Vietnamese) it needs. */
function textOf(input: MemeInput): string {
  const strings: string[] = Object.entries(input)
    .filter(([k, v]) => k !== 'avatarUrl' && typeof v === 'string')
    .map(([, v]) => v as string);
  if (input.kind === 'awards') for (const a of input.awards) strings.push(a.title, a.name, a.stat);
  if (input.kind === 'verse') for (const v of input.verses) strings.push(v.line6, v.line8, v.tag);
  if (input.kind === 'board') for (const r of input.rows) strings.push(r.label, r.name);
  return strings.join(' ') + ' 0123456789…—';
}

async function loadFaces(input: MemeInput) {
  const fonts = (document as { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.load !== 'function') return;
  const text = textOf(input);
  await Promise.all(facesFor(input.kind).map((f) => fonts.load(f, text).catch(() => [])));
}

function loadAvatarImage(url: string, timeoutMs = 2000): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (res: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    img.crossOrigin = 'anonymous';
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    img.src = url;
  });
}

/** 1080×1920 PNG of the card's final frame. Waits for `document.fonts.load` of the card's faces first. */
export async function renderMemePng(input: MemeInput): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const [, avatarImg] = await Promise.all([
    loadFaces(input),
    input.kind === 'wanted' && input.avatarUrl ? loadAvatarImage(input.avatarUrl) : Promise.resolve(null),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'middle';

  switch (input.kind) {
    case 'awards':
      paintAwards(ctx, input);
      break;
    case 'wanted':
      paintWanted(ctx, input, avatarImg);
      break;
    case 'verse':
      paintVerse(ctx, input);
      break;
    case 'board':
      paintBoard(ctx, input);
      break;
  }

  const toPng = () =>
    new Promise<Blob | null>((resolve, reject) => {
      try {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      } catch (err) {
        reject(err);
      }
    });

  try {
    return await toPng();
  } catch {
    if (input.kind === 'wanted' && avatarImg) {
      paintWanted(ctx, input, null);
      try {
        return await toPng();
      } catch {
        return null;
      }
    }
    return null;
  }
}
