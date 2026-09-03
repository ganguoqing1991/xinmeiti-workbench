// 零依赖 docx 文本提取：docx 是 zip 包，手写 zip 目录解析 + DecompressionStream 解压
// 浏览器原生 API，离线可用，兼容 Chrome/Edge 80+

// 在 zip 中央目录里找 word/document.xml 的位置信息
interface ZipEntry {
  compressionMethod: number; // 0=stored 8=deflate
  compressedSize: number;
  localHeaderOffset: number;
}

function findEntry(buf: Uint8Array, targetName: string): ZipEntry | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // 1. 从文件尾找 EOCD（签名 0x06054b50），最多回溯 64KB（注释区上限）
  const minPos = Math.max(0, buf.length - 65536 - 22);
  let eocdPos = -1;
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) return null;
  const entryCount = view.getUint16(eocdPos + 10, true);
  let pos = view.getUint32(eocdPos + 16, true); // 中央目录起始偏移

  // 2. 遍历中央目录条目（签名 0x02014b50）
  for (let n = 0; n < entryCount; n++) {
    if (pos + 46 > buf.length || view.getUint32(pos, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localHeaderOffset = view.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(buf.subarray(pos + 46, pos + 46 + nameLen));
    if (name === targetName) {
      return { compressionMethod, compressedSize, localHeaderOffset };
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// 按 local header 取出条目数据（压缩或未压缩）
async function readEntryData(buf: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const p = entry.localHeaderOffset;
  if (view.getUint32(p, true) !== 0x04034b50) throw new Error('docx 结构损坏（local header 签名不符）');
  const nameLen = view.getUint16(p + 26, true);
  const extraLen = view.getUint16(p + 28, true);
  const dataStart = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.compressionMethod === 0) return raw; // stored 未压缩
  if (entry.compressionMethod === 8) {
    // raw deflate：用浏览器内置 DecompressionStream 解压
    const ds = new DecompressionStream('deflate-raw');
    // slice() 拷贝出独立 buffer（raw 是大文件 buffer 上的 subarray 视图，不能直接传）
    const stream = new Blob([raw.slice()]).stream().pipeThrough(ds);
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  }
  throw new Error(`不支持的压缩方式（method=${entry.compressionMethod}）`);
}

// 从 document.xml 提取纯文本：w:p 分段、w:t 文本节点
function xmlToText(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const paragraphs: string[] = [];
  // 命名空间无关地取所有 w:p（getElementsByTagNameNS 用 * 通配命名空间）
  const ps = doc.getElementsByTagNameNS('*', 'p');
  for (let i = 0; i < ps.length; i++) {
    const ts = ps[i].getElementsByTagNameNS('*', 't');
    let line = '';
    for (let j = 0; j < ts.length; j++) {
      line += ts[j].textContent || '';
    }
    paragraphs.push(line);
  }
  return paragraphs.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// 主入口：File → 纯文本
export async function extractDocxText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entry = findEntry(buf, 'word/document.xml');
  if (!entry) throw new Error('不是有效的 docx（未找到 word/document.xml）');
  const xmlBytes = await readEntryData(buf, entry);
  const xml = new TextDecoder('utf-8').decode(xmlBytes);
  const text = xmlToText(xml);
  if (!text) throw new Error('docx 中没有提取到文字内容');
  return text;
}
