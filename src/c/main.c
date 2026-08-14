#include <pebble.h>

// Each cloud bitmap is a crop of the actual Hokusai print (see
// resources/source/cloud_manifest.json + scripts/build_assets.js), with
// only the cloud's own pixels opaque -- everything else is transparent,
// so it composites cleanly wherever it's drawn. Most origins match the
// spot the cloud was cut from; a couple were nudged up a few px from
// that spot to clear Fuji's silhouette (see DRAW_OFFSET in the script).
// bit 1 = cloud drawn, bit 0 = left out (clear sky shows through).
typedef struct {
  uint32_t resource_id;
  GPoint origin;
  GBitmap *bitmap;
} CloudSprite;

// 12-hour format, MSB first (top of the left-edge cloud trail).
static CloudSprite s_hour_sprites[] = {
  { .resource_id = RESOURCE_ID_IMAGE_CLOUD_HOUR_3, .origin = { 7, 41 } },
  { .resource_id = RESOURCE_ID_IMAGE_CLOUD_HOUR_2, .origin = { 6, 51 } },
  { .resource_id = RESOURCE_ID_IMAGE_CLOUD_HOUR_1, .origin = { 0, 81 } },
  { .resource_id = RESOURCE_ID_IMAGE_CLOUD_HOUR_0, .origin = { 0, 137 } },
};

// 0-59, MSB first (top of the right-edge cloud trail).
static CloudSprite s_min_sprites[] = {
  { .resource_id = RESOURCE_ID_IMAGE_CLOUD_MIN_5, .origin = { 159, 70 } },
  { .resource_id = RESOURCE_ID_IMAGE_CLOUD_MIN_4, .origin = { 149, 97 } },
  { .resource_id = RESOURCE_ID_IMAGE_CLOUD_MIN_3, .origin = { 186, 128 } },
  { .resource_id = RESOURCE_ID_IMAGE_CLOUD_MIN_2, .origin = { 157, 130 } },
  { .resource_id = RESOURCE_ID_IMAGE_CLOUD_MIN_1, .origin = { 164, 144 } },
  { .resource_id = RESOURCE_ID_IMAGE_CLOUD_MIN_0, .origin = { 172, 153 } },
};

#define NUM_HOUR_BITS (int)(sizeof(s_hour_sprites) / sizeof(s_hour_sprites[0]))
#define NUM_MIN_BITS  (int)(sizeof(s_min_sprites) / sizeof(s_min_sprites[0]))

static Window *s_window;
static Layer *s_canvas_layer;
static GBitmap *s_background_bitmap;

static int s_hour_bits; // displayed hour, 1-12
static int s_min_bits;  // 0-59

static void draw_sprite_row(GContext *ctx, CloudSprite *sprites, int count, int value) {
  for (int i = 0; i < count; i++) {
    int bit_index = count - 1 - i; // sprites[0] is the MSB
    bool bit_set = (value >> bit_index) & 1;
    if (bit_set && sprites[i].bitmap) {
      GRect bounds = { .origin = sprites[i].origin, .size = gbitmap_get_bounds(sprites[i].bitmap).size };
      graphics_draw_bitmap_in_rect(ctx, sprites[i].bitmap, bounds);
    }
  }
}

static void canvas_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);

  graphics_context_set_compositing_mode(ctx, GCompOpAssign);
  if (s_background_bitmap) {
    graphics_draw_bitmap_in_rect(ctx, s_background_bitmap, bounds);
  }

  // Sprites carry real per-pixel transparency outside the cloud shape,
  // so use GCompOpSet -- GCompOpAssign would paint their fully-opaque
  // (but data-wise arbitrary) transparent pixels as solid rectangles.
  graphics_context_set_compositing_mode(ctx, GCompOpSet);
  draw_sprite_row(ctx, s_hour_sprites, NUM_HOUR_BITS, s_hour_bits);
  draw_sprite_row(ctx, s_min_sprites, NUM_MIN_BITS, s_min_bits);
}

static void update_time(void) {
  time_t now = time(NULL);
  struct tm *tick_time = localtime(&now);

  int hour12 = tick_time->tm_hour % 12;
  if (hour12 == 0) {
    hour12 = 12;
  }
  s_hour_bits = hour12;
  s_min_bits = tick_time->tm_min;

  layer_mark_dirty(s_canvas_layer);
}

static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  update_time();
}

static void load_sprites(CloudSprite *sprites, int count) {
  for (int i = 0; i < count; i++) {
    sprites[i].bitmap = gbitmap_create_with_resource(sprites[i].resource_id);
  }
}

static void destroy_sprites(CloudSprite *sprites, int count) {
  for (int i = 0; i < count; i++) {
    if (sprites[i].bitmap) {
      gbitmap_destroy(sprites[i].bitmap);
      sprites[i].bitmap = NULL;
    }
  }
}

static void window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  s_background_bitmap = gbitmap_create_with_resource(RESOURCE_ID_IMAGE_RED_FUJI_BG);
  load_sprites(s_hour_sprites, NUM_HOUR_BITS);
  load_sprites(s_min_sprites, NUM_MIN_BITS);

  s_canvas_layer = layer_create(bounds);
  layer_set_update_proc(s_canvas_layer, canvas_update_proc);
  layer_add_child(window_layer, s_canvas_layer);
}

static void window_unload(Window *window) {
  layer_destroy(s_canvas_layer);
  destroy_sprites(s_hour_sprites, NUM_HOUR_BITS);
  destroy_sprites(s_min_sprites, NUM_MIN_BITS);
  if (s_background_bitmap) {
    gbitmap_destroy(s_background_bitmap);
  }
}

static void init(void) {
  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = window_load,
    .unload = window_unload,
  });
  window_stack_push(s_window, true);

  update_time();
  tick_timer_service_subscribe(MINUTE_UNIT, tick_handler);
}

static void deinit(void) {
  tick_timer_service_unsubscribe();
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
