// Pixel art for Squeek Garden: every sprite is painted in code on a tiny grid from
// one fixed palette, outlined in ink, then scaled up without smoothing.
(() => {
'use strict';

const C = {
  ink: '#2b2135', cream: '#fff4dc', white: '#ffffff',
  wood: '#a0683e', woodDark: '#6b3e2e', soil: '#7a4a32', soilDark: '#4f2f24', soilLight: '#a06a45',
  leaf: '#3fa34d', leafLight: '#8fdc5e', leafDark: '#25693a',
  yellow: '#ffd25a', gold: '#f2b632', orange: '#f08a3a', red: '#e2453c', pink: '#f59ac0',
  blue: '#4f7fd8', blueLight: '#9cc3ff', purple: '#8a5ac8', lilac: '#c7a6f0',
  moon: '#f8f0c6', fur: '#e9a65a', furLight: '#f8dcae', wilt: '#9c8a5a', wiltDark: '#6e6040',
  steel: '#b8c0d0', steelDark: '#6b7590',
};

// ---------- tiny painter ----------
function grid(w, h) {
  const g = Array.from({ length: h }, () => Array(w).fill(null));
  const P = {
    w, h, g,
    px(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c; },
    rect(x, y, ww, hh, c) { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) P.px(x + i, y + j, c); },
    line(x0, y0, x1, y1, c) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let e = dx + dy;
      for (;;) { P.px(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
    },
    disc(cx, cy, r, c) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + .3) P.px(x, y, c); },
    ring(cx, cy, r, c) { for (let a = 0; a < 360; a += 2) P.px(cx + Math.cos(a * Math.PI / 180) * r, cy + Math.sin(a * Math.PI / 180) * r, c); },
    erase(cx, cy, r) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) P.px(x, y, null); },
    outline(c = C.ink) {
      const add = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (g[y][x] !== null) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => g[y + b] && g[y + b][x + a] && g[y + b][x + a] !== c)) add.push([x, y]);
      }
      for (const [x, y] of add) g[y][x] = c;
    },
  };
  return P;
}

// ---------- sprites (16x16, ground at y = 15) ----------
const leaf = (P, x, y, dir) => { P.px(x, y, C.leaf); P.px(x + dir, y, C.leaf); P.px(x + dir, y - 1, C.leafLight); P.px(x + 2 * dir, y - 1, C.leaf); };
const stem = (P, top) => P.line(8, 15, 8, top, C.leafDark);

const SPRITES = {
  chicken(P) { P.disc(7, 10, 4, C.white); P.disc(11, 6, 2.5, C.white); P.rect(10, 2, 2, 2, C.red); P.px(14, 6, C.orange); P.px(13, 6, C.orange); P.px(12, 5, C.ink); P.rect(2, 7, 2, 2, C.steel); P.rect(6, 14, 1, 2, C.orange); P.rect(9, 14, 1, 2, C.orange); P.outline(); },
  pig(P) { P.rect(2, 7, 10, 6, C.pink); P.rect(10, 5, 5, 6, C.pink); P.rect(14, 8, 2, 2, C.red); P.px(12, 6, C.ink); P.px(10, 4, C.pink); P.rect(3, 13, 2, 2, C.pink); P.rect(9, 13, 2, 2, C.pink); P.px(1, 7, C.pink); P.outline(); },
  cow(P) { P.rect(1, 6, 11, 6, C.white); P.rect(11, 4, 4, 6, C.white); P.rect(3, 7, 3, 3, C.ink); P.rect(8, 9, 2, 2, C.ink); P.px(13, 5, C.ink); P.rect(13, 8, 2, 2, C.pink); P.px(11, 3, C.wilt); P.px(14, 3, C.wilt); P.rect(2, 12, 2, 3, C.white); P.rect(9, 12, 2, 3, C.white); P.outline(); },
  sack(P) { P.rect(2, 3, 4, 4, C.wood); P.rect(3, 1, 2, 2, C.woodDark); P.rect(3, 4, 2, 2, C.leafLight); P.outline(); },
  glove(P) { P.rect(2, 2, 1, 3, C.gold); P.rect(3, 1, 1, 4, C.gold); P.rect(4, 1, 1, 4, C.gold); P.rect(5, 2, 1, 3, C.gold); P.px(6, 4, C.gold); P.rect(2, 5, 4, 2, C.wood); P.outline(); },
  sprout(P) { stem(P, 11); leaf(P, 7, 11, -1); leaf(P, 9, 11, 1); P.outline(); },
  young(P) {
    stem(P, 5); leaf(P, 7, 12, -1); leaf(P, 9, 10, 1); leaf(P, 7, 8, -1);
    P.disc(8, 4, 1.6, C.leafLight); P.px(8, 3, C.yellow); P.outline();
  },
  wilted(P) {
    P.line(8, 15, 8, 11, C.wiltDark); P.line(8, 11, 11, 10, C.wiltDark); P.line(11, 10, 13, 12, C.wiltDark);
    P.disc(13, 13, 1.4, C.wilt); P.px(6, 13, C.wilt); P.px(5, 14, C.wilt); P.outline();
  },
  moonmoss(P) {
    P.disc(8, 14, 6, C.leaf); P.rect(0, 15, 16, 1, null);
    [[5, 11], [9, 10], [11, 12], [4, 13], [7, 12]].forEach(([x, y]) => P.px(x, y, C.leafLight));
    [[6, 13], [10, 13], [12, 14]].forEach(([x, y]) => P.px(x, y, C.leafDark));
    P.px(8, 11, C.lilac); P.px(3, 14, C.lilac); P.px(12, 11, C.lilac);
    P.disc(8, 4, 3.4, C.moon); P.erase(9.8, 3, 2.8); P.px(6, 5, C.yellow); P.px(6, 4, C.yellow);
    P.outline();
  },
  trotbean(P) {
    stem(P, 2); leaf(P, 7, 14, -1); leaf(P, 9, 13, 1);
    P.rect(4, 4, 2, 7, C.yellow); P.rect(11, 3, 2, 7, C.yellow);
    [[5, 5], [5, 7], [5, 9], [12, 4], [12, 6], [12, 8]].forEach(([x, y]) => P.px(x, y, C.gold));
    P.px(4, 4, C.white); P.px(11, 3, C.white);
    P.line(6, 4, 7, 4, C.leafDark); P.line(10, 3, 9, 3, C.leafDark);
    P.outline();
  },
  zoomflower(P) {
    stem(P, 8); leaf(P, 7, 13, -1); leaf(P, 9, 11, 1);
    [[8, 2], [8, 9], [4.5, 5.5], [11.5, 5.5]].forEach(([x, y]) => P.disc(x, y, 1.9, C.orange));
    [[5, 2.5], [11, 2.5], [5, 8.5], [11, 8.5]].forEach(([x, y]) => P.px(x, y, C.red));
    [[7, 1], [3, 5], [7, 8], [10, 5]].forEach(([x, y]) => P.px(x, y, C.yellow));
    P.disc(8, 5.5, 1.5, C.yellow); P.px(8, 5, C.orange);
    P.outline();
  },
  mileoak(P) {
    P.rect(7, 10, 2, 6, C.wood); P.px(6, 15, C.wood); P.px(9, 15, C.wood); P.px(8, 12, C.woodDark);
    P.disc(8, 6, 4.6, C.leaf); P.disc(4, 8, 3, C.leaf); P.disc(12, 8, 3, C.leaf);
    [[6, 3], [7, 2], [5, 4], [3, 6], [10, 4], [11, 6]].forEach(([x, y]) => P.px(x, y, C.leafLight));
    [[9, 9], [5, 10], [12, 10], [8, 8], [3, 9]].forEach(([x, y]) => P.px(x, y, C.leafDark));
    P.px(10, 7, C.red); P.px(5, 7, C.red);
    P.outline();
  },
  comet(P) {
    stem(P, 11); leaf(P, 9, 13, -1);
    for (let t = 0; t <= 1; t += .1) P.disc(6 + t * 5, 4 + t * 6, 1.6 - t * .4, C.red);
    P.px(6, 3, C.orange); P.px(7, 4, C.orange); P.px(6, 4, C.white); P.line(5, 3, 4, 2, C.leafDark);
    P.px(2, 6, C.yellow); P.px(1, 8, C.yellow); P.px(13, 2, C.yellow); P.px(3, 10, C.yellow);
    P.outline();
  },
  dreamcap(P) {
    P.disc(8, 10, 5.6, C.purple); P.rect(0, 10, 16, 6, null); P.rect(7, 10, 2, 6, C.cream);
    P.px(6, 7, C.white); P.px(10, 6, C.white); P.px(4, 9, C.lilac); P.px(12, 9, C.lilac); P.px(8, 5, C.lilac);
    P.px(2, 2, C.yellow); P.px(13, 1, C.yellow); P.px(11, 3, C.lilac);
    P.outline();
  },
  twinvine(P) {
    P.line(8, 15, 8, 10, C.leafDark); P.line(8, 10, 5, 7, C.leafDark); P.line(8, 10, 11, 7, C.leafDark); leaf(P, 9, 13, 1);
    P.disc(4.5, 5, 2.4, C.blue); P.disc(11.5, 5, 2.4, C.blue);
    P.px(4, 4, C.blueLight); P.px(11, 4, C.blueLight); P.px(3, 4, C.white); P.px(10, 4, C.white);
    P.px(8, 6, C.leaf); P.px(7, 6, C.leafLight);
    P.outline();
  },
  wheelbloom(P) {
    stem(P, 11); leaf(P, 7, 14, -1); leaf(P, 9, 13, 1);
    P.ring(8, 6, 4.6, C.gold); P.ring(8, 6, 5.1, C.gold);
    for (let a = 0; a < 6; a++) { const t = a * Math.PI / 3; P.line(8, 6, 8 + Math.cos(t) * 4, 6 + Math.sin(t) * 4, C.orange); }
    P.disc(8, 6, 1.3, C.yellow); P.px(5, 2, C.white);
    P.outline();
  },
  // 8x8 icons
  moon(P) { P.disc(4, 4, 3, C.moon); P.erase(5.6, 3, 2.4); P.px(2, 5, C.yellow); P.outline(); },
  paw(P) { P.disc(4, 5, 1.8, C.pink); P.px(2, 2, C.pink); P.px(4, 1, C.pink); P.px(6, 2, C.pink); P.outline(); },
  bolt(P) { P.line(5, 0, 2, 4, C.yellow); P.line(2, 4, 5, 4, C.yellow); P.line(5, 4, 2, 7, C.orange); P.outline(); },
  coin(P) { P.disc(3.5, 3.5, 3, C.gold); P.px(3, 2, C.yellow); P.px(3, 3, C.yellow); P.px(2, 2, C.white); P.px(4, 5, C.orange); P.outline(); },
  can(P) { P.rect(1, 3, 4, 4, C.blue); P.line(5, 4, 7, 2, C.blue); P.line(1, 2, 4, 2, C.steelDark); P.px(2, 4, C.blueLight); P.outline(); },
  dome(P) { P.disc(4, 5, 3.2, C.blueLight); P.rect(0, 6, 8, 2, null); P.rect(1, 6, 7, 1, C.wood); P.px(3, 3, C.white); P.outline(); },
  sparkle(P) { P.line(3, 0, 3, 6, C.yellow); P.line(0, 3, 6, 3, C.yellow); P.px(3, 3, C.white); },
  soil(P) {
    P.rect(0, 0, 8, 8, C.soil);
    [[1, 1], [5, 2], [2, 5], [6, 6], [4, 4], [0, 7]].forEach(([x, y]) => P.px(x, y, C.soilDark));
    [[3, 1], [7, 4], [1, 3]].forEach(([x, y]) => P.px(x, y, C.soilLight));
  },
};
const SIZES = { moon: 8, paw: 8, bolt: 8, coin: 8, can: 8, dome: 8, sparkle: 7, soil: 8, glove: 8, sack: 8 };

// ---------- hamster frames (13x9) ----------
const HAMSTER = {
  run(P, f) {
    P.disc(6, 5, 3.6, C.fur); P.rect(3, 3, 7, 5, C.fur); P.disc(9.5, 4, 2.6, C.fur);
    P.px(8, 1, C.pink); P.px(8, 0, C.fur); P.px(11, 4, C.ink); P.px(12, 5, C.pink);
    P.rect(4, 6, 4, 2, C.furLight); P.px(10, 6, C.furLight); P.px(5, 3, C.furLight);
    if (f) { P.px(3, 8, C.pink); P.px(9, 8, C.pink); } else { P.px(5, 8, C.pink); P.px(7, 8, C.pink); }
    P.outline();
  },
  sleep(P) {
    P.disc(6, 6, 3.4, C.fur); P.rect(2, 4, 8, 4, C.fur); P.disc(9.5, 6, 2.4, C.fur);
    P.px(8, 3, C.pink); P.line(10, 6, 11, 6, C.ink); P.rect(4, 7, 5, 1, C.furLight); P.px(12, 7, C.pink);
    P.outline();
  },
};

const urls = new Map(), grids = new Map();
function spriteGrid(name) {
  if (!grids.has(name)) { const s = SIZES[name] || 16, P = grid(s, s); SPRITES[name](P); grids.set(name, P); }
  return grids.get(name);
}
function sprite(name) {
  if (!urls.has(name)) {
    const P = spriteGrid(name), c = document.createElement('canvas'); c.width = P.w; c.height = P.h;
    const x = c.getContext('2d');
    for (let y = 0; y < P.h; y++) for (let i = 0; i < P.w; i++) { const v = P.g[y][i]; if (v) { x.fillStyle = v; x.fillRect(i, y, 1, 1); } }
    urls.set(name, c.toDataURL());
  }
  return urls.get(name);
}
function hamsterGrid(kind, frame) { const P = grid(13, 9); HAMSTER[kind](P, frame); return P; }

window.Pixel = { C, sprite, spriteGrid, grid, hamsterGrid };
})();
