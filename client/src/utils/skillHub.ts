// 技能台账数据层：Skill 中心唯一数据源
// 统一两类条目：kind='skill'（真 SKILL.md 技能）与 kind='prompt'（二创工坊的提示词模板）
// 全部 localStorage 持久化

import type { Platform } from '../types';
import { listZipEntries, readZipEntryText, createZipBlob } from './zipLite';
import type { Position } from './growthStore';

export type SkillKind = 'skill' | 'prompt';
export type SkillSource = 'imported' | 'custom'; // 本工作台不预置内置技能，全部由用户导入或自建

export interface SkillAttachment {
  name: string;
  size: number;
  content?: string; // 文本附件存内容；超限或二进制只留名字
}

export interface SkillEntry {
  id: string;
  name: string;
  desc: string;
  kind: SkillKind;
  source: SkillSource;
  triggers: string[];        // 触发词，用于搜索匹配
  positions: Position[];     // 挂载岗位（与成长小助手联动）
  platform?: Platform;       // 仅 prompt 类型：xiaohongshu / douyin
  enabled: boolean;
  content: string;           // skill=SKILL.md 全文（含 frontmatter）；prompt=提示词正文
  attachments: SkillAttachment[];
  useCount: number;
  lastUsedAt: string;
  createdAt: string;
  updatedAt: string;
}

const K = {
  entries: 'skill_hub_entries_v1',
  migrated: 'skill_hub_migrated_v1',
};

// 附件存储上限：单文件 100KB，单技能总计 400KB（localStorage 总量约 5MB）
const MAX_FILE_CHARS = 100_000;
const MAX_TOTAL_CHARS = 400_000;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function write(key: string, val: any) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error('[skillHub] 写入失败', key, e);
  }
}
const uid = () => `sk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();

// ===== CRUD =====
export function getEntries(): SkillEntry[] {
  return read<SkillEntry[]>(K.entries, []);
}
export function getEntry(id: string): SkillEntry | null {
  return getEntries().find((e) => e.id === id) || null;
}
export function addEntry(e: Omit<SkillEntry, 'id' | 'createdAt' | 'updatedAt' | 'useCount' | 'lastUsedAt'>): SkillEntry {
  const item: SkillEntry = { ...e, id: uid(), useCount: 0, lastUsedAt: '', createdAt: now(), updatedAt: now() };
  write(K.entries, [item, ...getEntries()]);
  return item;
}
export function updateEntry(id: string, patch: Partial<SkillEntry>) {
  write(K.entries, getEntries().map((e) => (e.id === id ? { ...e, ...patch, updatedAt: now() } : e)));
}
export function removeEntry(id: string) {
  write(K.entries, getEntries().filter((e) => e.id !== id));
}
export function duplicateEntry(id: string): SkillEntry | null {
  const src = getEntry(id);
  if (!src) return null;
  return addEntry({
    name: `${src.name}-副本`,
    desc: src.desc,
    kind: src.kind,
    source: 'custom',
    triggers: [...src.triggers],
    positions: [...src.positions],
    platform: src.platform,
    enabled: false,
    content: src.content,
    attachments: src.attachments.map((a) => ({ ...a })),
  });
}
/** 记录一次使用（生成调用指令 / 复制提示词时调用） */
export function markUsed(id: string) {
  const e = getEntry(id);
  if (!e) return;
  updateEntry(id, { useCount: e.useCount + 1, lastUsedAt: now() });
}

// ===== SKILL.md 解析 =====
export interface ParsedSkillMd {
  name: string;
  desc: string;
  body: string;
  agentCreated: boolean;
  raw: string;
}

/** 解析 YAML frontmatter（只处理 key: value 单行，支持引号包裹与行内冒号） */
export function parseSkillMd(text: string): ParsedSkillMd {
  const raw = String(text || '');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const fm = m ? m[1] : '';
  const body = m ? raw.slice(m[0].length) : raw;
  const get = (key: string): string => {
    const line = fm.split(/\r?\n/).find((l) => new RegExp(`^\\s*${key}\\s*:`).test(l));
    if (!line) return '';
    let v = line.replace(new RegExp(`^\\s*${key}\\s*:`), '').trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v.trim();
  };
  const agentCreated = /^\s*agent_created\s*:\s*true/m.test(fm);
  let name = get('name').trim();
  if (!name) {
    // 没有 frontmatter 时，回退用正文第一个标题
    const h = body.match(/^#\s+(.+)$/m);
    name = h ? h[1].trim().slice(0, 40) : '';
  }
  return { name, desc: get('description').trim(), body: body.trim(), agentCreated, raw };
}

/** 过滤无效词：太短太长、纯数字、以及只有 1-2 个字母的英文碎片 */
function isGoodToken(s: string): boolean {
  if (s.length < 2 || s.length > 12) return false;
  if (/^\d+$/.test(s)) return false;
  const chinese = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
  if (chinese === 0 && s.length < 3) return false;
  return true;
}

/** 以虚词开头的长短语不作为触发词（"面向抖音""当用户需要生成直播脚本"这类） */
const TRIGGER_STOP = /^(面向|覆盖|当用户|用于|适用|本技能|该技能|支持|通过|根据|结合|包括|以及|或者)$/;

// 英文常见词：回退切分时会切出 Create / from / this 这类废词，需过滤
const EN_STOP = new Set(
  ('the and for from with this that these those when where what which who how why use used using into onto your you are can will would should could such other another more most any all new old final first last create convert generate make made based via per etc also than then them they their there here have has had not but its it of to in on as at by or be is am was were do does did a an s t will just only very much many some every each both few own same so than too'.split(/\s+/))
);

/** 含中文的短语优先，纯英文术语其次，纯停用词丢弃 */
function hasChinese(s: string) {
  return /[\u4e00-\u9fa5]/.test(s);
}

/**
 * 从简介里抽触发词。
 * 优先级：① 「触发词：」段落 ② 「关键词：」段落 ③ 切整段简介并过滤虚词短语。
 * 前两种是作者专门写的，质量高；第三种是兜底，只取少量且中文优先，宁缺勿滥。
 */
export function extractTriggers(desc: string): string[] {
  const src = String(desc || '');
  const seg = src.match(/(?:触发词|关键词|适用场景|适合场景)\s*[:：]\s*([^。\n]+)/);
  const raw: string[] = seg
    ? seg[1].split(/[、,，/|\s]+/g)
    : src
        .split(/[。;；\n]/g)
        .flatMap((clause) => clause.split(/[、,，/|()（）"'""\s]+/g));

  let parts = raw.map((s) => s.trim()).filter(isGoodToken);

  if (seg) {
    parts = parts.filter((s) => !(!hasChinese(s) && EN_STOP.has(s.toLowerCase())));
  } else {
    // 兜底：丢虚词开头的短语、丢英文停用词、只留短词，中文优先后截断
    parts = parts
      .filter((s) => !TRIGGER_STOP.test(s.slice(0, 4)))
      .filter((s) => s.length <= 8)
      .filter((s) => hasChinese(s) || !EN_STOP.has(s.toLowerCase()))
      .sort((a, b) => (hasChinese(b) ? 1 : 0) - (hasChinese(a) ? 1 : 0));
  }
  return Array.from(new Set(parts)).slice(0, seg ? 8 : 4);
}

// ===== 导入 =====
export interface ImportResult {
  ok: boolean;
  message: string;
  entry?: SkillEntry;
}

function buildFromParsed(
  parsed: ParsedSkillMd,
  attachments: SkillAttachment[],
  fallbackName: string
): SkillEntry {
  const name = parsed.name || fallbackName;
  const desc = parsed.desc || parsed.body.slice(0, 80).replace(/\s+/g, ' ');
  return addEntry({
    name,
    desc,
    kind: 'skill',
    source: 'imported',
    triggers: extractTriggers(desc),
    positions: [],
    enabled: true,
    content: parsed.raw,
    attachments,
  });
}

/** 从 zip 技能包导入：定位 SKILL.md，其余文件作为附件 */
export async function importFromZip(file: File): Promise<ImportResult> {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const entries = listZipEntries(buf);
    if (entries.length === 0) return { ok: false, message: '不是有效的 zip，或文件已损坏' };
    // SKILL.md 可能在根目录或一层子目录里
    const target =
      entries.find((e) => /^[^/]+\/SKILL\.md$/i.test(e.name)) ||
      entries.find((e) => /SKILL\.md$/i.test(e.name));
    if (!target) {
      return { ok: false, message: '压缩包里没找到 SKILL.md，技能包必须包含它' };
    }
    const skillText = await readZipEntryText(buf, target);
    const parsed = parseSkillMd(skillText);
    if (!parsed.name && !parsed.body) {
      return { ok: false, message: 'SKILL.md 内容为空' };
    }
    const prefix = target.name.replace(/SKILL\.md$/i, '');
    let total = 0;
    const attachments: SkillAttachment[] = [];
    for (const e of entries) {
      if (e === target || e.name.endsWith('/')) continue;
      const rel = prefix && e.name.startsWith(prefix) ? e.name.slice(prefix.length) : e.name;
      if (!rel) continue;
      let content: string | undefined;
      if (total < MAX_TOTAL_CHARS && e.uncompressedSize <= MAX_FILE_CHARS) {
        try {
          content = await readZipEntryText(buf, e);
          total += content.length;
        } catch {
          content = undefined;
        }
      }
      attachments.push({ name: rel, size: e.uncompressedSize, content });
    }
    const fallback = file.name.replace(/\.zip$/i, '').replace(/[\\/]/g, '');
    const entry = buildFromParsed(parsed, attachments, fallback);
    const skipped = attachments.filter((a) => !a.content).length;
    return {
      ok: true,
      entry,
      message: `已导入「${entry.name}」${attachments.length ? `，附件 ${attachments.length} 个` : ''}${skipped ? `（${skipped} 个附件过大只记名字）` : ''}`,
    };
  } catch (e: any) {
    return { ok: false, message: `解析失败：${String(e?.message || e).slice(0, 120)}` };
  }
}

/** 从单个 md 文件导入 */
export async function importFromMd(file: File): Promise<ImportResult> {
  try {
    const text = await file.text();
    const parsed = parseSkillMd(text);
    if (!parsed.name && !parsed.body) return { ok: false, message: '文件内容为空' };
    const entry = buildFromParsed(parsed, [], file.name.replace(/\.md$/i, ''));
    return { ok: true, entry, message: `已导入「${entry.name}」` };
  } catch (e: any) {
    return { ok: false, message: `读取失败：${String(e?.message || e).slice(0, 120)}` };
  }
}

/** 从粘贴的正文导入 */
export function importFromText(text: string, fallbackName = '粘贴的技能'): ImportResult {
  const parsed = parseSkillMd(text);
  if (!parsed.name && !parsed.body.trim()) return { ok: false, message: '内容为空' };
  const entry = buildFromParsed(parsed, [], fallbackName);
  return { ok: true, entry, message: `已导入「${entry.name}」` };
}

// ===== 导出 =====
/** 导出标准技能包 zip（SKILL.md + 已保存的附件） */
export function exportSkillZip(entry: SkillEntry): Blob {
  const files: { name: string; data: string }[] = [{ name: `${entry.name}/SKILL.md`, data: entry.content }];
  for (const a of entry.attachments) {
    if (a.content) files.push({ name: `${entry.name}/${a.name}`, data: a.content });
  }
  if (entry.attachments.some((a) => !a.content)) {
    files.push({
      name: `${entry.name}/附件清单-未包含内容.txt`,
      data: entry.attachments
        .filter((a) => !a.content)
        .map((a) => `${a.name}（${a.size} 字节，超出浏览器存储上限未保存内容）`)
        .join('\n'),
    });
  }
  return createZipBlob(files);
}

/** 提示词类型导出为 md */
export function exportPromptMd(entry: SkillEntry): Blob {
  return new Blob([entry.content], { type: 'text/markdown;charset=utf-8' });
}

// ===== 调用指令 =====
/**
 * 生成可直接粘给 AI 的调用指令。
 * skill：以 @name 方式引用，并附上本次需求
 * prompt：把提示词作为系统约束 + 本次需求
 */
export function buildInvokeText(entry: SkillEntry, task: string): string {
  const t = task.trim();
  if (entry.kind === 'skill') {
    const lines = [`用 @${entry.name} 帮我完成以下任务：`, '', t || '（请在这里补充你要做的事）'];
    if (entry.triggers.length) lines.push('', `（该技能适用：${entry.triggers.slice(0, 4).join('、')}）`);
    return lines.join('\n');
  }
  return [
    '请严格按下面的技能要求完成我的任务。',
    '',
    '【技能要求】',
    entry.content,
    '',
    '【本次任务】',
    t || '（请在这里补充你要做的事）',
  ].join('\n');
}

// ===== 与二创工坊统一：一次性迁移既有提示词 =====
/**
 * 把 llmConfig 里 reprocess_skills_{platform}_v1 的既有条目迁进技能台账（kind='prompt'）。
 * 只执行一次，之后写入的都走 skillHub。
 */
export function migrateReprocessSkills(platforms: Platform[] = ['xiaohongshu', 'douyin']): number {
  try {
    if (localStorage.getItem(K.migrated)) return 0;
  } catch {
    return 0;
  }
  let count = 0;
  const all = getEntries();
  for (const p of platforms) {
    try {
      const raw = localStorage.getItem(`reprocess_skills_${p}_v1`);
      if (!raw) continue;
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) continue;
      for (const s of list) {
        if (!s || !s.label) continue;
        const dup = all.some((e) => e.kind === 'prompt' && e.name === s.label && e.platform === p);
        if (dup) continue;
        all.push({
          id: uid(),
          name: s.label,
          desc: String(s.prompt || '').slice(0, 80).replace(/\s+/g, ' '),
          kind: 'prompt',
          source: 'custom',
          triggers: extractTriggers(String(s.prompt || '')),
          positions: [],
          platform: p,
          enabled: !!s.enabled,
          content: String(s.prompt || ''),
          attachments: [],
          useCount: 0,
          lastUsedAt: '',
          createdAt: s.createdAt || now(),
          updatedAt: now(),
        });
        count += 1;
      }
    } catch {
      /* 单个平台迁移失败不影响其他 */
    }
  }
  if (count > 0) write(K.entries, all);
  try {
    localStorage.setItem(K.migrated, '1');
  } catch {
    /* ignore */
  }
  return count;
}

/** prompt 类型按平台取（供二创工坊复用） */
export function getPromptSkills(platform: Platform): { id: string; label: string; prompt: string; enabled: boolean; createdAt: string }[] {
  return getEntries()
    .filter((e) => e.kind === 'prompt' && e.platform === platform)
    .map((e) => ({ id: e.id, label: e.name, prompt: e.content, enabled: e.enabled, createdAt: e.createdAt }));
}
export function addPromptSkill(platform: Platform, label: string, prompt: string): SkillEntry {
  return addEntry({
    name: label,
    desc: prompt.slice(0, 80).replace(/\s+/g, ' '),
    kind: 'prompt',
    source: 'custom',
    triggers: extractTriggers(prompt),
    positions: [],
    platform,
    enabled: true,
    content: prompt,
    attachments: [],
  });
}
