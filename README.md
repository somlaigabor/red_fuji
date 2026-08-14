# Red Fuji Binary

Pebble watchface: Hokusai's *Red Fuji* ("South Wind, Clear Sky"), where ten
of the print's own clouds double as a binary clock. Each cloud is drawn
only when its bit is `1`; at `0` it's left out and the clear sky (cloned
from the surrounding print texture) shows through instead.

- **Hour** (left edge, 4 clouds, top → bottom = MSB → LSB): 12-hour format, 1-12.
- **Minute** (right edge, 6 clouds, top → bottom = MSB → LSB): 0-59.

Targets `basalt`, `diorite`, and `emery` (Pebble Time 2) — color displays
only, since the background is a full-color image. Built and calibrated
against a 200x228 crop (emery's native resolution).

## How the assets were made

`resources/source/felhok_200.png` is the original supplied artwork. A
one-off analysis (connected-component detection on near-white pixels)
found every distinct cloud blob in it and separated the ones on the two
edges — genuine floating clouds — from the white snow-streaks on Fuji's
own slope, which were left untouched.

`scripts/build_assets.js` then, for the 10 chosen clouds:

1. Builds a per-pixel mask of just the cloud (bright, low-saturation
   pixels) inside each region and crops a sprite (+2px padding) into its
   own `resources/images/cloud_*.png` — non-cloud pixels in the crop
   (including any stray corner of Fuji's slope a rectangular region
   happens to clip) are left fully transparent, so only the actual cloud
   ever gets drawn back, never a rectangular patch of mountain.
2. Produces `resources/images/red_fuji_bg.png`: the original with just
   those cloud-mask pixels clone-stamped over using real sky texture from
   just outside each hole (not a flat color blend — the print has visible
   grain, and a flat fill reads as an obvious wiped patch), skipping any
   candidate patch that would bleed in mountain or other-cloud color.

Two of the six minute clouds (`cloud_min_0`, `cloud_min_2`) originally
sat only 1-2px above Fuji's silhouette in the source print, which read as
the cloud hanging into the mountain at watch size. `DRAW_OFFSET` in
`build_assets.js` nudges just their *drawn* position a few px up from
where they were cropped (the mask/crop itself is untouched, so the cloud
shape is unaffected) — picked by checking, per candidate shift, both the
resulting clearance from Fuji's edge and whether it starts overlapping a
neighboring cloud's own pixels.

`resources/source/cloud_manifest.json` records each sprite's final
`(x, y)` draw origin; `src/c/main.c`'s sprite tables use the same
coordinates.

If you want to swap in a different Red Fuji reproduction, edit the
`HOUR_REGIONS` / `MIN_REGIONS` bounding boxes (and `DRAW_OFFSET` if
needed) in `scripts/build_assets.js` to match its cloud positions, rerun
it with Node
(`node scripts/build_assets.js resources/source/<your-image>.png /tmp/out`
then copy the results into `resources/images/`), and update the
`.origin` values in `main.c` from the new manifest.

## Build and run

Two options, no local install required for the first one:

- **CloudPebble** (browser IDE): create a new project, upload
  `src/c/main.c`, `package.json`, and everything in `resources/images/`,
  then build and install to the emulator or a paired phone.
- **Local `pebble-tool`** (Rebble toolchain, needs Python 3.10+):

  ```bash
  pip install pebble-tool
  pebble build
  pebble install --emulator emery      # preview in the emulator
  pebble install --phone <phone-ip>    # or send to a paired watch
  ```

## Future bits

The print has plenty of untouched clouds left (see the ones skipped by
`build_assets.js`) if you want to encode more info later — same
crop-sprite-plus-clean-background technique, just add more entries to
`HOUR_REGIONS`/`MIN_REGIONS` (or a new region list) and a matching sprite
table in `main.c`.
