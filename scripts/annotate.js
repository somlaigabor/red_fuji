const fs = require('fs');
const { PNG } = require('pngjs');

const src = PNG.sync.read(fs.readFileSync(process.argv[2]));
const { width, height, data } = src;
const SCALE = 4;

function px(x, y) {
  const idx = (width * y + x) << 2;
  return [data[idx], data[idx + 1], data[idx + 2]];
}
function isCloud(x, y) {
  const [r, g, b] = px(x, y);
  return r > 170 && g > 170 && b > 150 && (r - b) < 60 && (r - b) > -20;
}

const visited = new Uint8Array(width * height);
const comps = [];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (visited[i] || !isCloud(x, y)) continue;
    const stack = [[x, y]];
    visited[i] = 1;
    let minX = x, maxX = x, minY = y, maxY = y, count = 0;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      count++;
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      for (const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (visited[ni] || !isCloud(nx, ny)) continue;
        visited[ni] = 1;
        stack.push([nx, ny]);
      }
    }
    comps.push({ minX, maxX, minY, maxY, count });
  }
}
const real = comps.filter(c => c.count >= 15).sort((a, b) => a.minY - b.minY || a.minX - b.minX);

// upscale nearest-neighbor
const out = new PNG({ width: width * SCALE, height: height * SCALE });
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const [r, g, b] = px(x, y);
    for (let dy = 0; dy < SCALE; dy++) {
      for (let dx = 0; dx < SCALE; dx++) {
        const ox = x * SCALE + dx, oy = y * SCALE + dy;
        const oi = (out.width * oy + ox) << 2;
        out.data[oi] = r; out.data[oi+1] = g; out.data[oi+2] = b; out.data[oi+3] = 255;
      }
    }
  }
}

function setPx(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= out.width || y >= out.height) return;
  const i = (out.width * y + x) << 2;
  out.data[i] = r; out.data[i+1] = g; out.data[i+2] = b; out.data[i+3] = 255;
}
function rect(minX, minY, maxX, maxY, r, g, b) {
  const x0 = minX * SCALE - 2, y0 = minY * SCALE - 2;
  const x1 = (maxX + 1) * SCALE + 2, y1 = (maxY + 1) * SCALE + 2;
  for (let x = x0; x <= x1; x++) { setPx(x, y0, r, g, b); setPx(x, y1, r, g, b); }
  for (let y = y0; y <= y1; y++) { setPx(x0, y, r, g, b); setPx(x1, y, r, g, b); }
}

real.forEach((c, idx) => {
  rect(c.minX, c.minY, c.maxX, c.maxY, 255, 0, 0);
});

fs.writeFileSync(process.argv[3], PNG.sync.write(out));
console.log(`wrote ${process.argv[3]}, ${real.length} boxes`);
real.forEach((c, idx) => console.log(idx, c));
