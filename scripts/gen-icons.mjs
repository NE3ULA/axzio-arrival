/* Generates the PWA / touch icons (192 + 512 PNG) with no dependencies:
   a deep-navy field, a soft cyan glow, and the AXZIO triangle mark.
   Run: node scripts/gen-icons.mjs  (writes into public/icons/) */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = dirname(fileURLToPath(import.meta.url)) + "/../public/icons";
mkdirSync(outDir, { recursive: true });

// --- minimal PNG encoder (RGBA, filter 0) ---
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- drawing ---
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return Math.hypot(px - x, py - y);
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const top = [10, 20, 52]; // #0a1434
  const bottom = [4, 6, 15]; // #04060f
  const tri = [
    [cx, size * 0.24],
    [cx + size * 0.27, size * 0.72],
    [cx - size * 0.27, size * 0.72],
  ];
  const inner = [
    [cx, size * 0.47],
    [cx + size * 0.115, size * 0.71],
    [cx - size * 0.115, size * 0.71],
  ];
  const stroke = size * 0.028;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = y / size;
      let r = top[0] + (bottom[0] - top[0]) * t;
      let g = top[1] + (bottom[1] - top[1]) * t;
      let b = top[2] + (bottom[2] - top[2]) * t;
      // soft glow around the mark
      const glowD = Math.hypot(x - cx, y - size * 0.48) / (size * 0.55);
      const glow = Math.max(0, 1 - glowD) ** 2 * 0.35;
      r += 86 * glow;
      g += 200 * glow;
      b += 245 * glow;
      // triangle outlines (outer + inner), cyan-white core with soft edge
      const dOuter = Math.min(
        distToSegment(x, y, ...tri[0], ...tri[1]),
        distToSegment(x, y, ...tri[1], ...tri[2]),
        distToSegment(x, y, ...tri[2], ...tri[0])
      );
      const dInner = Math.min(
        distToSegment(x, y, ...inner[0], ...inner[1]),
        distToSegment(x, y, ...inner[1], ...inner[2]),
        distToSegment(x, y, ...inner[2], ...inner[0])
      );
      const d = Math.min(dOuter, dInner);
      const edge = Math.max(0, 1 - Math.abs(d - stroke / 2) / (stroke / 2 + 1.5));
      if (edge > 0) {
        r += (190 - r) * edge;
        g += (235 - g) * edge;
        b += (255 - b) * edge;
      }
      rgba[i] = Math.min(255, Math.round(r));
      rgba[i + 1] = Math.min(255, Math.round(g));
      rgba[i + 2] = Math.min(255, Math.round(b));
      rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, rgba);
}

for (const size of [192, 512]) {
  writeFileSync(`${outDir}/icon-${size}.png`, render(size));
  console.log(`wrote public/icons/icon-${size}.png`);
}
