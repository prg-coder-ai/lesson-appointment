/**
 * 任务栏角标图标生成器（纯 Node，无第三方依赖）
 * ==========================================================================
 * 为什么自己画 PNG：
 *   Windows 的任务栏数字角标走 `BrowserWindow.setOverlayIcon(nativeImage, desc)`，
 *   而 `app.setBadgeCount()` 在 Windows 上**不支持**（只有 macOS / Linux Dock）。
 *   setOverlayIcon 需要一张 nativeImage —— 要么带一堆预渲染图片进包，要么现画。
 *   现画的好处是任意数字都能出图、不用为 1~99 塞 99 个文件。
 *
 * 实现：32×32 RGBA 位图手绘 → 标准 PNG 编码（IHDR/IDAT/IEND + CRC32）。
 *   只用 Node 内置 zlib，不引依赖。16px 任务栏缩放后看起来仍然清楚。
 *
 * 为什么是 32 而不是 16：
 *   Windows 在 125% / 150% 缩放下按 20px / 24px 取图，给 32 让它自己缩，
 *   比直接给 16 再由系统放大要清楚得多。
 */
'use strict';

const zlib = require('zlib');

const SIZE = 32;
const BG = [239, 68, 68, 255];      // #ef4444 红底
const FG = [255, 255, 255, 255];    // 白字

/* 3×5 点阵数字 —— 32px 下最多两位，够用且不糊 */
const GLYPH = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

/* ───────── PNG 编码 ───────── */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // color type: RGBA
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0;                       // filter: none
    rgba.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ───────── 绘制 ───────── */
function put(buf, x, y, color) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  buf[i] = color[0]; buf[i + 1] = color[1]; buf[i + 2] = color[2]; buf[i + 3] = color[3];
}

function drawCircle(buf) {
  const c = (SIZE - 1) / 2;
  const r = SIZE / 2 - 0.5;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - c, dy = y - c;
      const d2 = dx * dx + dy * dy;
      // 边缘一像素做点软过渡，避免放大后锯齿过硬
      if (d2 <= r * r) put(buf, x, y, BG);
      else if (d2 <= (r + 1) * (r + 1)) put(buf, x, y, [BG[0], BG[1], BG[2], 120]);
    }
  }
}

function drawText(buf, text) {
  const chars = String(text).split('');
  const scale = chars.length >= 2 ? 3 : 4;
  const gw = 3 * scale;
  const gh = 5 * scale;
  const gap = chars.length >= 2 ? 1 : 0;
  const totalW = chars.length * gw + (chars.length - 1) * gap;
  let x0 = Math.round((SIZE - totalW) / 2);
  const y0 = Math.round((SIZE - gh) / 2);

  chars.forEach((ch) => {
    const g = GLYPH[ch];
    if (g) {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if (g[row][col] !== '1') continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              put(buf, x0 + col * scale + sx, y0 + row * scale + sy, FG);
            }
          }
        }
      }
    }
    x0 += gw + gap;
  });
}

/**
 * 生成角标 PNG。
 * @param {number} count 未读数；<=0 返回 null（调用方据此清除角标）
 * @returns {Buffer|null}
 */
function badgeImage(count) {
  const n = Math.floor(Number(count) || 0);
  if (n <= 0) return null;
  const text = n > 99 ? '99' : String(n);   // 两位就顶格了，99+ 在 32px 里画不下

  const buf = Buffer.alloc(SIZE * SIZE * 4, 0);   // 全透明底
  drawCircle(buf);
  drawText(buf, text);
  return encodePng(SIZE, SIZE, buf);
}

module.exports = { badgeImage, encodePng, SIZE };
