const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC = process.argv[2];
const OUT_DIR = process.argv[3];
const PAD = 2;

const src = PNG.sync.read(fs.readFileSync(SRC));
const { width, height, data } = src;

function getPx(x, y) {
  const i = (width * y + x) << 2;
  return [data[i], data[i + 1], data[i + 2]];
}

// Cream/white cloud pixels: bright, with G tracking close to R (the
// print's cloud fill runs warmer/more amber than a first color sample
// suggested -- r-g up to ~50 is still cloud, not sky). Deliberately
// excludes Fuji's reddish-brown slope (high R, LOW g) even where a
// region's rectangular bounding box happens to clip a corner of it.
// Verified against every bright pixel in all 10 hand-picked regions of
// the source print: this catches 100% of them with zero false positives
// on a clear-sky sample.
function isCloud(x, y) {
  const [r, g] = getPx(x, y);
  return r > 188 && g > 158 && (r - g) < 55;
}
// Mountain pixel: strongly red-shifted relative to green (cream cloud
// pixels are not -- R and G stay close together there).
function isMountain(x, y) {
  const [r, g] = getPx(x, y);
  return r - g > 50;
}

// bit index: 0 = MSB (topmost cloud), reading top-to-bottom down each trail
const HOUR_REGIONS = [
  { minX: 9,  maxX: 19,  minY: 43,  maxY: 47 },   // H3 (MSB)
  { minX: 8,  maxX: 36,  minY: 53,  maxY: 58 },   // H2
  { minX: 0,  maxX: 25,  minY: 83,  maxY: 90 },   // H1
  { minX: 0,  maxX: 23,  minY: 139, maxY: 146 },  // H0 (LSB)
];
const MIN_REGIONS = [
  { minX: 161, maxX: 199, minY: 72,  maxY: 82 },  // M5 (MSB)
  { minX: 151, maxX: 198, minY: 99,  maxY: 102 }, // M4
  { minX: 188, maxX: 199, minY: 130, maxY: 132 }, // M3
  { minX: 159, maxX: 199, minY: 135, maxY: 143 }, // M2
  { minX: 166, maxX: 190, minY: 146, maxY: 152 }, // M1
  { minX: 174, maxX: 199, minY: 159, maxY: 170 }, // M0 (LSB)
];

// Draw-position nudges: some clouds sit only 1-2px above Fuji's slope in
// the source print, which reads as "hanging into the mountain" at watch
// size. Shifting just the drawn position up (the crop/mask stays put, so
// the actual cloud pixels are unaffected) gives them clear air without
// re-picking different source clouds.
const DRAW_OFFSET = {
  cloud_min_0: { dy: -4 },
  cloud_min_2: { dy: -3 },
};

function pad(r) {
  return {
    minX: Math.max(0, r.minX - PAD),
    minY: Math.max(0, r.minY - PAD),
    maxX: Math.min(width - 1, r.maxX + PAD),
    maxY: Math.min(height - 1, r.maxY + PAD),
  };
}

const bg = new PNG({ width, height });
data.copy(bg.data);

const namedRegions = [
  ...HOUR_REGIONS.map((r, i) => ({ ...pad(r), name: `cloud_hour_${HOUR_REGIONS.length - 1 - i}` })),
  ...MIN_REGIONS.map((r, i) => ({ ...pad(r), name: `cloud_min_${MIN_REGIONS.length - 1 - i}` })),
];
const allRegions = namedRegions;

// The sky is a horizontally-banded woodblock-print gradient: tone is
// driven almost entirely by row (y), with the ten clouds packed tightly
// enough that any single clone-stamp offset big enough to dodge every
// nearby cloud/mountain pixel usually has to cross into a visibly
// different band, leaving an obvious wrong-toned patch. Filling from a
// per-row average sidesteps that: for each row, average every clean
// (non-cloud, non-mountain) pixel across the *entire* row -- always
// tonally correct for that exact y, and never contaminated since bad
// pixels are simply excluded from the average rather than dodged.
// Track spread too, not just the mean -- a dead-flat fill reads as an
// obvious rectangle against the print's grain, so each filled pixel gets
// a small amount of noise scaled to how much that row's real pixels vary.
const rowFill = new Array(height);
for (let y = 0; y < height; y++) {
  const samples = [];
  for (let x = 0; x < width; x++) {
    if (isMountain(x, y) || isCloud(x, y)) continue;
    samples.push(getPx(x, y));
  }
  if (samples.length === 0) { rowFill[y] = { mean: [140, 170, 190], std: [0, 0, 0] }; continue; }
  // The print's dark wave-line strokes run through the sky too; averaging
  // them in with the base tone drags the fill toward a muddy grey. Using
  // only the lighter half of each row's clean pixels keeps the fill on
  // the base sky tone the eye actually reads as "the sky" at that row.
  samples.sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2]));
  const lighter = samples.slice(0, Math.max(1, Math.ceil(samples.length / 2)));
  const n = lighter.length;
  const mean = [0, 1, 2].map(k => lighter.reduce((s, p) => s + p[k], 0) / n);
  const std = [0, 1, 2].map(k => Math.sqrt(lighter.reduce((s, p) => s + (p[k] - mean[k]) ** 2, 0) / n));
  rowFill[y] = { mean, std };
}
function fillColorFor(y) {
  const { mean, std } = rowFill[y];
  const jitter = std.map(s => (Math.random() * 2 - 1) * Math.min(s, 15));
  return [0, 1, 2].map(k => Math.max(0, Math.min(255, Math.round(mean[k] + jitter[k]))));
}

const spriteMasks = new Map(); // region -> Set("x,y") of cloud pixels within it

for (const r of allRegions) {
  // Only overwrite pixels that are actually part of the cloud -- if the
  // rectangular region clips a corner of the mountain, those pixels are
  // left completely untouched instead of being erased into fake sky.
  const mask = new Set();
  for (let y = r.minY; y <= r.maxY; y++) {
    for (let x = r.minX; x <= r.maxX; x++) {
      if (!isCloud(x, y)) continue;
      mask.add(`${x},${y}`);
      const [pr, pg, pb] = fillColorFor(y);
      const i = (width * y + x) << 2;
      bg.data[i] = pr; bg.data[i + 1] = pg; bg.data[i + 2] = pb; bg.data[i + 3] = 255;
    }
  }
  spriteMasks.set(r, mask);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'red_fuji_bg.png'), PNG.sync.write(bg));

function writeSprite(rPad) {
  const w = rPad.maxX - rPad.minX + 1;
  const h = rPad.maxY - rPad.minY + 1;
  const mask = spriteMasks.get(rPad);
  const sprite = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = rPad.minX + x, gy = rPad.minY + y;
      const isCloudPx = mask.has(`${gx},${gy}`);
      const [r, g, b] = getPx(gx, gy);
      const i = (w * y + x) << 2;
      sprite.data[i] = r; sprite.data[i + 1] = g; sprite.data[i + 2] = b;
      sprite.data[i + 3] = isCloudPx ? 255 : 0;
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, `${rPad.name}.png`), PNG.sync.write(sprite));
  const offset = DRAW_OFFSET[rPad.name] || { dx: 0, dy: 0 };
  return { name: rPad.name, x: rPad.minX + (offset.dx || 0), y: rPad.minY + (offset.dy || 0), w, h };
}

const manifest = namedRegions.map(writeSprite);

fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(manifest);
