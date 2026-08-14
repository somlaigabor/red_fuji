const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ASSET_DIR = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(path.join(ASSET_DIR, 'manifest.json')));
const bg = PNG.sync.read(fs.readFileSync(path.join(ASSET_DIR, 'red_fuji_bg.png')));

function drawSprite(sprite, m) {
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const si = (sprite.width * y + x) << 2;
      if (sprite.data[si + 3] === 0) continue; // transparent -> leave background alone
      const di = (bg.width * (m.y + y) + (m.x + x)) << 2;
      bg.data[di] = sprite.data[si]; bg.data[di + 1] = sprite.data[si + 1];
      bg.data[di + 2] = sprite.data[si + 2]; bg.data[di + 3] = 255;
    }
  }
}

for (const m of manifest) {
  const sprite = PNG.sync.read(fs.readFileSync(path.join(ASSET_DIR, `${m.name}.png`)));
  drawSprite(sprite, m);
}
fs.writeFileSync(path.join(ASSET_DIR, 'composite_all_on.png'), PNG.sync.write(bg));
console.log('wrote composite_all_on.png');
