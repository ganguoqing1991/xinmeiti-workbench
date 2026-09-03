// 零依赖 zip 读写：浏览器原生 API，离线可用，兼容 Chrome/Edge 80+
// 读：列出全部条目 + 按条目取文本（DecompressionStream 解压）
// 写：仅 stored（不压缩）+ CRC32，用于导出技能包，体积小但足够用

export interface ZipEntry {
  name: string;
  compressionMethod: number; // 0=stored 8=deflate
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function dv(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

// ===== 读 =====
/** 列出 zip 中所有条目（基于中央目录，文件名按 UTF-8 解码） */
export function listZipEntries(buf: Uint8Array): ZipEntry[] {
  const view = dv(buf);
  const minPos = Math.max(0, buf.length - 65536 - 22);
  let eocdPos = -1;
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) return [];
  const entryCount = view.getUint16(eocdPos + 10, true);
  let pos = view.getUint32(eocdPos + 16, true);
  const out: ZipEntry[] = [];
  const dec = new TextDecoder('utf-8');
  for (let n = 0; n < entryCount; n++) {
    if (pos + 46 > buf.length || view.getUint32(pos, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const uncompressedSize = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localHeaderOffset = view.getUint32(pos + 42, true);
    const name = dec.decode(buf.subarray(pos + 46, pos + 46 + nameLen));
    out.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** 读取某个条目的原始字节 */
export async function readZipEntryBytes(buf: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = dv(buf);
  const p = entry.localHeaderOffset;
  if (view.getUint32(p, true) !== 0x04034b50) throw new Error('zip 结构损坏（local header 签名不符）');
  const nameLen = view.getUint16(p + 26, true);
  const extraLen = view.getUint16(p + 28, true);
  const dataStart = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.compressionMethod === 0) return raw;
  if (entry.compressionMethod === 8) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([raw.slice()]).stream().pipeThrough(ds);
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  }
  throw new Error(`不支持的压缩方式（method=${entry.compressionMethod}）`);
}

/** 读取某个条目并按 UTF-8 解成文本 */
export async function readZipEntryText(buf: Uint8Array, entry: ZipEntry): Promise<string> {
  const bytes = await readZipEntryBytes(buf, entry);
  return new TextDecoder('utf-8').decode(bytes);
}

// ===== 写 =====
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/**
 * 生成一个 zip Blob（全部 stored 不压缩）。
 * 目录条目会自动创建（以 / 结尾、长度为 0 的条目）。
 */
export function createZipBlob(files: { name: string; data: string | Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const now = new Date();
  const { time, date } = dosDateTime(now);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  const pushEntry = (name: string, bytes: Uint8Array) => {
    const nameBytes = enc.encode(name);
    const crc = crc32(bytes);
    const flags = 0x0800; // UTF-8 文件名标志，中文名不乱码

    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, bytes.length, true);
    lv.setUint32(22, bytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, bytes.length, true);
    cv.setUint32(24, bytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);

    locals.push(lh, bytes);
    centrals.push(ch);
    offset += lh.length + bytes.length;
  };

  // 先补目录条目，保证解压后目录结构完整
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.name.split('/');
    parts.pop();
    let cur = '';
    for (const p of parts) {
      cur += p + '/';
      dirs.add(cur);
    }
  }
  for (const d of Array.from(dirs).sort()) pushEntry(d, new Uint8Array(0));
  for (const f of files) {
    const bytes = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    pushEntry(f.name, bytes);
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const c of centrals) cdSize += c.length;
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, locals.length / 2, true);
  ev.setUint16(10, locals.length / 2, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  ev.setUint16(20, 0, true);

  // TS 5.7 起 Uint8Array 的 buffer 泛型与 BlobPart 不直接兼容，这里统一转一次
  const parts = [...locals, ...centrals, eocd] as unknown as BlobPart[];
  return new Blob(parts, { type: 'application/zip' });
}

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
