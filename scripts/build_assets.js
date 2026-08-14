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

// Cream/white cloud pixels: bright and low-saturation. Deliberately
// excludes Fuji's reddish-brown slope (high R, low G) even where a
// region's rectangular bounding box happens to clip a corner of it.
function isCloud(x, y) {
  const [r, g, b] = getPx(x, y);
  return r > 170 && g > 170 && b > 150 && (r - b) < 60 && (r - b) > -20;
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

// The sky has fine printing-grain texture, not a smooth gradient, so
// interpolating between edge pixels leaves a visibly "wiped clean" patch.
// Clone-stamp a same-size patch of real sky texture from just above (or
// below/sideways, near the frame edges) the hole instead of a flat blend.
function rectOverlaps(r1, r2) {
  return r1.minX <= r2.maxX && r1.maxX >= r2.minX && r1.minY <= r2.maxY && r1.maxY >= r2.minY;
}
function isCleanSkyPatch(rr) {
  let bad = 0, total = 0;
  for (let y = rr.minY; y <= rr.maxY; y++) {
    for (let x = rr.minX; x <= rr.maxX; x++) {
      total++;
      if (isMountain(x, y) || isCloud(x, y)) bad++;
    }
  }
  return bad / total < 0.05;
}

const spriteMasks = new Map(); // region -> Set("x,y") of cloud pixels within it

for (const r of allRegions) {
  const w = r.maxX - r.minX + 1;
  const h = r.maxY - r.minY + 1;
  const others = allRegions.filter(o => o !== r);

  const candidates = [
    { dx: 0, dy: -h }, { dx: 0, dy: h }, { dx: -w, dy: 0 }, { dx: w, dy: 0 },
    { dx: 0, dy: -2 * h }, { dx: 0, dy: 2 * h },
  ];

  let chosen = null;
  for (const c of candidates) {
    const cand = { minX: r.minX + c.dx, maxX: r.maxX + c.dx, minY: r.minY + c.dy, maxY: r.maxY + c.dy };
    if (cand.minX < 0 || cand.maxX >= width || cand.minY < 0 || cand.maxY >= height) continue;
    if (others.some(o => rectOverlaps(cand, o))) continue;
    if (!isCleanSkyPatch(cand)) continue;
    chosen = c;
    break;
  }
  if (!chosen) chosen = { dx: 0, dy: -h }; // shouldn't happen for our hand-picked regions

  // Only overwrite pixels that are actually part of the cloud -- if the
  // rectangular region clips a corner of the mountain, those pixels are
  // left completely untouched instead of being erased into fake sky.
  const mask = new Set();
  for (let y = r.minY; y <= r.maxY; y++) {
    for (let x = r.minX; x <= r.maxX; x++) {
      if (!isCloud(x, y)) continue;
      mask.add(`${x},${y}`);
      const sx = x + chosen.dx, sy = y + chosen.dy;
      const [pr, pg, pb] = getPx(sx, sy);
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
