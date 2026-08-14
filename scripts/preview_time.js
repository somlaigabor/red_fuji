const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ASSET_DIR = process.argv[2];
const hour12 = parseInt(process.argv[3], 10); // 1-12
const minute = parseInt(process.argv[4], 10); // 0-59
const outPath = process.argv[5];

const manifest = JSON.parse(fs.readFileSync(path.join(ASSET_DIR, 'manifest.json')));
const bg = PNG.sync.read(fs.readFileSync(path.join(ASSET_DIR, 'red_fuji_bg.png')));

function drawSprite(sprite, m) {
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const si = (sprite.width * y + x) << 2;
      if (sprite.data[si + 3] === 0) continue;
      const di = (bg.width * (m.y + y) + (m.x + x)) << 2;
      bg.data[di] = sprite.data[si]; bg.data[di + 1] = sprite.data[si + 1];
      bg.data[di + 2] = sprite.data[si + 2]; bg.data[di + 3] = 255;
    }
  }
}

for (const m of manifest) {
  const match = m.name.match(/^cloud_(hour|min)_(\d)$/);
  const bitIndex = parseInt(match[2], 10);
  const value = match[1] === 'hour' ? hour12 : minute;
  const bitSet = (value >> bitIndex) & 1;
  if (!bitSet) continue;
  const sprite = PNG.sync.read(fs.readFileSync(path.join(ASSET_DIR, `${m.name}.png`)));
  drawSprite(sprite, m);
}

const S = 3;
const out = new PNG({ width: bg.width * S, height: bg.height * S });
for (let y = 0; y < bg.height; y++) for (let x = 0; x < bg.width; x++) {
  const si = (bg.width * y + x) << 2;
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
    const oi = (out.width * (y * S + dy) + (x * S + dx)) << 2;
    for (let k = 0; k < 4; k++) out.data[oi + k] = bg.data[si + k];
  }
}
fs.writeFileSync(outPath, PNG.sync.write(out));
console.log(`hour=${hour12} (${hour12.toString(2).padStart(4,'0')}) minute=${minute} (${minute.toString(2).padStart(6,'0')}) -> ${outPath}`);
