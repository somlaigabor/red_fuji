const fs = require('fs');
const { PNG } = require('pngjs');

const png = PNG.sync.read(fs.readFileSync(process.argv[2]));
const { width, height, data } = png;

function px(x, y) {
  const idx = (width * y + x) << 2;
  return [data[idx], data[idx + 1], data[idx + 2]];
}

// crude "is this pixel part of a white/cream cloud" test
function isCloud(x, y) {
  const [r, g, b] = px(x, y);
  return r > 170 && g > 170 && b > 150 && (r - b) < 60 && (r - b) > -20;
}

// connected components (4-connectivity) over the cloud mask
const visited = new Uint8Array(width * height);
const comps = [];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (visited[i] || !isCloud(x, y)) continue;
    // BFS
    const stack = [[x, y]];
    visited[i] = 1;
    let minX = x, maxX = x, minY = y, maxY = y, count = 0;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      count++;
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      const neighbors = [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (visited[ni] || !isCloud(nx, ny)) continue;
        visited[ni] = 1;
        stack.push([nx, ny]);
      }
    }
    comps.push({ minX, maxX, minY, maxY, count, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
}

// filter tiny noise blobs
const real = comps.filter(c => c.count >= 15).sort((a, b) => a.minY - b.minY || a.minX - b.minX);

console.log(`image ${width}x${height}, ${comps.length} raw blobs, ${real.length} after filtering`);
for (const c of real) {
  console.log(`  bbox=(${c.minX},${c.minY})-(${c.maxX},${c.maxY}) size=${c.w}x${c.h} px=${c.count} center=(${Math.round((c.minX+c.maxX)/2)},${Math.round((c.minY+c.maxY)/2)})`);
}
