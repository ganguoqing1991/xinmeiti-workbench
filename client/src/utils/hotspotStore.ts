// 行业热点数据层：月度/每日热点节点（AI 生成 + 手动维护）+ 项目配置 + 需求预设
// 全部 localStorage 持久化，范式与 communityStore 保持一致

export type HotspotCategory =
  | '开学'
  | '期末'
  | '半期'
  | '月考'
  | '选拔考试'
  | '中高考'
  | '政策'
  | '招生'
  | '家长会'
  | '竞赛'
  | '节假日'
  // 通用行业节点（茶业 / 零售 / 企业服务 / 跨境等）
  | '展会'
  | '节令'
  | '大促'
  | '申报'
  | '上新'
  | '其他';

export type HotspotAudience = '公立校' | '民办校' | '机构' | '平台' | '家长';

export interface HotspotItem {
  id: string;
  date: string;              // YYYY-MM-DD
  title: string;
  category: HotspotCategory; // 节点类型
  audience: HotspotAudience; // 影响对象
  note: string;              // 备注/应对建议
  pinned: boolean;           // 星标置顶
  source: 'ai' | 'manual';   // 来源
  createdAt: string;
}

export interface HotspotPreset {
  id: string;
  name: string;   // 预设名，如「教培·重庆公立校」
  prompt: string; // 行业需求描述，直接作为 AI 输入
  createdAt: string;
}

/** 项目：热点的生成配置载体，选项目 → 自动拼装需求描述 → AI 生成 */
export interface HotspotProject {
  id: string;
  name: string;                 // 项目名，如「南星教育」
  industry: string;             // 行业，如「K12教培」
  city: string;                 // 城市 / 区域，如「重庆」
  audience: string;             // 目标人群 / 学段，如「小学、初中家长」
  nodes: HotspotCategory[];     // 关注的节点类型（多选）
  extra: string;                // 补充要求
  docName?: string;             // 上传的项目说明文档名（.docx）
  docText?: string;             // 文档正文摘录（截断存储，供 AI 匹配行业热点）
  createdAt: string;
}

/** 文档摘录的存储上限（localStorage 容量有限，超出部分截断） */
export const MAX_DOC_CHARS = 5000;
/** 生成热点时送进提示词的文档摘录上限（控制 token） */
export const MAX_DOC_PROMPT_CHARS = 3000;

export const HOTSPOT_CATEGORIES: HotspotCategory[] = [
  '开学', '期末', '半期', '月考', '选拔考试', '中高考', '政策', '招生', '家长会', '竞赛', '节假日', '展会', '节令', '大促', '申报', '上新', '其他',
];
export const HOTSPOT_AUDIENCES: HotspotAudience[] = ['公立校', '民办校', '机构', '平台', '家长'];
export const HOTSPOT_INDUSTRIES = ['K12教培', '素质教育', '茶业/零售', '企业服务', '跨境电商', '职业教育', '本地生活', '其他'];

const K = {
  hotspots: 'op_hotspots_v1',
  presets: 'op_hotspot_presets_v1',
  projects: 'op_hotspot_projects_v1',
};

// 示例项目：不再自动写入，仅在用户点「载入示例项目」时按需导入
const DEFAULT_PROJECTS: HotspotProject[] = [
  {
    id: 'proj-nanxing',
    name: '南星教育',
    industry: 'K12教培',
    city: '重庆',
    audience: '小学、初中家长（幼小至初三）',
    nodes: ['开学', '期末', '半期', '月考', '选拔考试', '中高考', '家长会', '政策', '招生', '节假日'],
    extra: '重点关注小升初点招与衔接班窗口、38 个小红书账号矩阵的内容排期节点，覆盖 5 个校区',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'proj-jiari',
    name: '假日学校',
    industry: 'K12教培',
    city: '重庆',
    audience: '小学、初中、高中家长',
    nodes: ['开学', '期末', '半期', '家长会', '招生', '节假日'],
    extra: '优先给出校区续费窗口与假期班开班节点，兼顾团队执行节奏',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'proj-huixue',
    name: '慧学教育',
    industry: 'K12教培',
    city: '重庆',
    audience: '初中、高中生及家长',
    nodes: ['期末', '半期', '中高考', '选拔考试', '政策'],
    extra: '侧重中高考备考节奏、志愿填报窗口与政策发布时间',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'proj-jinshan',
    name: '缙山茶业',
    industry: '茶业/零售',
    city: '重庆',
    audience: '茶友、礼品采购客户',
    nodes: ['节令', '节假日', '展会', '上新', '大促'],
    extra: '春茶/秋茶上市、茶博会与展销会、春节/端午/中秋送礼季、电商大促节点',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'proj-chuhai',
    name: '重庆企业出海',
    industry: '跨境电商',
    city: '重庆',
    audience: '制造业与外贸企业主',
    nodes: ['展会', '政策', '申报', '大促'],
    extra: '境外展会排期、出海政策与补贴申报窗口、跨境电商大促节点',
    createdAt: new Date().toISOString(),
  },
];

const DEFAULT_PRESETS: HotspotPreset[] = [
  {
    id: 'preset-default',
    name: '教培·重庆公立校',
    prompt:
      '重庆 K12 教培行业，公立中小学关键节点：开学、期末测、半期测、月考、选拔/点招考试、中高考相关日程、家长会、政策发布、寒暑假与放假安排',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'preset-xiaoshengchu',
    name: '小升初专项',
    prompt:
      '重庆小升初关键节点：点招/推优/摇号报名、简历投递窗口、BS/KS 选拔考试时间、衔接班开班节点、政策发布时间、家长关注度高峰',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'preset-marketing',
    name: '节假日营销节点',
    prompt:
      '中国法定节假日与传统节日对教培机构的影响节点：寒暑假、开学季、期中期末、中高考、教师节、国庆、春节，给出适合做活动与内容营销的时间点',
    createdAt: new Date().toISOString(),
  },
];

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
    console.error('[hotspotStore] 写入失败', key, e);
  }
}
const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ===== 热点 CRUD =====
export function getHotspots(): HotspotItem[] {
  return read<HotspotItem[]>(K.hotspots, []);
}

/** 按月份取热点（month: 1-12），星标在前，其余按日期升序 */
export function getHotspotsByMonth(year: number, month: number): HotspotItem[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return getHotspots()
    .filter((h) => h.date.startsWith(prefix))
    .sort((a, b) => (a.pinned === b.pinned ? a.date.localeCompare(b.date) : a.pinned ? -1 : 1));
}

export function addHotspot(h: Omit<HotspotItem, 'id' | 'createdAt'>): HotspotItem {
  const item: HotspotItem = { ...h, id: uid('hs'), createdAt: new Date().toISOString() };
  write(K.hotspots, [...getHotspots(), item]);
  return item;
}

/** 批量写入（AI 预览确认后调用），返回实际写入条数 */
export function addHotspots(list: Omit<HotspotItem, 'id' | 'createdAt'>[]): number {
  if (list.length === 0) return 0;
  const exist = getHotspots();
  // 同日期 + 同标题视为重复，跳过
  const sigs = new Set(exist.map((h) => `${h.date}|${h.title}`));
  const fresh = list.filter((h) => !sigs.has(`${h.date}|${h.title}`));
  if (fresh.length === 0) return 0;
  const items: HotspotItem[] = fresh.map((h) => ({ ...h, id: uid('hs'), createdAt: new Date().toISOString() }));
  write(K.hotspots, [...exist, ...items]);
  return items.length;
}

export function updateHotspot(id: string, patch: Partial<HotspotItem>) {
  write(K.hotspots, getHotspots().map((h) => (h.id === id ? { ...h, ...patch } : h)));
}

export function removeHotspot(id: string) {
  write(K.hotspots, getHotspots().filter((h) => h.id !== id));
}

// ===== 需求预设 CRUD =====
export function getPresets(): HotspotPreset[] {
  const stored = read<HotspotPreset[] | null>(K.presets, null);
  if (stored && stored.length > 0) return stored;
  write(K.presets, DEFAULT_PRESETS);
  return DEFAULT_PRESETS;
}
export function addPreset(name: string, prompt: string): HotspotPreset {
  const item: HotspotPreset = { id: uid('preset'), name, prompt, createdAt: new Date().toISOString() };
  write(K.presets, [...getPresets(), item]);
  return item;
}
export function updatePreset(id: string, patch: Partial<HotspotPreset>) {
  write(K.presets, getPresets().map((p) => (p.id === id ? { ...p, ...patch } : p)));
}
export function removePreset(id: string) {
  write(K.presets, getPresets().filter((p) => p.id !== id));
}

// ===== 项目 CRUD =====
// 注意：空数组是合法状态（用户清空了项目），绝不能回补默认项目，否则删完会“复活”
export function getProjects(): HotspotProject[] {
  const stored = read<HotspotProject[] | null>(K.projects, null);
  if (stored) return stored;
  write(K.projects, []);
  return [];
}
export function addProject(p: Omit<HotspotProject, 'id' | 'createdAt'>): HotspotProject {
  const item: HotspotProject = { ...p, id: uid('proj'), createdAt: new Date().toISOString() };
  write(K.projects, [...getProjects(), item]);
  return item;
}
export function updateProject(id: string, patch: Partial<HotspotProject>) {
  write(K.projects, getProjects().map((p) => (p.id === id ? { ...p, ...patch } : p)));
}
export function removeProject(id: string) {
  write(K.projects, getProjects().filter((p) => p.id !== id));
}
/** 清空全部项目（不回补默认） */
export function clearProjects() {
  write(K.projects, []);
}
/** 按需载入 5 个示例项目（已存在的同名项目跳过） */
export function loadSampleProjects(): number {
  const exist = getProjects();
  const names = new Set(exist.map((p) => p.name));
  const fresh = DEFAULT_PROJECTS.filter((p) => !names.has(p.name));
  if (fresh.length === 0) return 0;
  write(K.projects, [...exist, ...fresh]);
  return fresh.length;
}

// 一次性迁移：早期版本会把 5 个示例项目自动写进 localStorage，用户要求默认不显示。
// 仅当存量项目与示例「完全一致且从未被改动」时才清空，改过的不动，执行后打标记不再重复。
const SAMPLE_CLEARED_FLAG = 'op_hotspot_projects_samples_cleared_v1';
const projectSig = (p: HotspotProject) =>
  [p.name, p.industry, p.city, p.audience, [...p.nodes].sort().join(','), p.extra, p.docName || ''].join('|');

export function clearUnmodifiedSamples(): number {
  try {
    if (localStorage.getItem(SAMPLE_CLEARED_FLAG)) return 0;
  } catch {
    /* localStorage 不可用时跳过迁移 */
  }
  const mark = () => {
    try {
      localStorage.setItem(SAMPLE_CLEARED_FLAG, '1');
    } catch {
      /* ignore */
    }
  };
  const stored = getProjects();
  if (stored.length !== DEFAULT_PROJECTS.length) {
    mark();
    return 0;
  }
  const a = stored.map(projectSig).sort().join('#');
  const b = DEFAULT_PROJECTS.map(projectSig).sort().join('#');
  if (a !== b) {
    mark();
    return 0;
  }
  clearProjects();
  mark();
  return stored.length;
}

/** 把项目配置拼装成 AI 可直接消费的需求描述 */
export function composeProjectPrompt(p: HotspotProject): string {
  const parts: string[] = [];
  if (p.industry.trim()) parts.push(`行业：${p.industry.trim()}`);
  if (p.city.trim()) parts.push(`城市/区域：${p.city.trim()}`);
  if (p.audience.trim()) parts.push(`目标人群/学段：${p.audience.trim()}`);
  if (p.nodes.length > 0) parts.push(`重点关注节点：${p.nodes.join('、')}`);
  if (p.extra.trim()) parts.push(`补充要求：${p.extra.trim()}`);
  return parts.join('；');
}

// ===== AI 输出解析 =====
function normalizeDate(raw: any, year: number, month: number): string | null {
  const mm = String(month).padStart(2, '0');
  const maxDay = new Date(year, month, 0).getDate();
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (y === year && mo === month && d >= 1 && d <= maxDay) return `${year}-${mm}-${String(d).padStart(2, '0')}`;
    return null;
  }
  m = s.match(/(\d{1,2})\s*[月/\-]\s*(\d{1,2})\s*[日号]?/);
  if (m) {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    if (mo === month && d >= 1 && d <= maxDay) return `${year}-${mm}-${String(d).padStart(2, '0')}`;
    return null;
  }
  m = s.match(/^(\d{1,2})\s*[日号]$/);
  if (m) {
    const d = Number(m[1]);
    if (d >= 1 && d <= maxDay) return `${year}-${mm}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

// ===== AI 输出 JSON 提取（容错共用） =====
/** 去掉 ```json 之类的代码块围栏 */
function stripFence(raw: string): string {
  let text = String(raw || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  return text;
}

/** 提取 JSON 数组：整段解析 → 截取 [ ... ] → 截断兜底逐个 {} 抽取 */
function extractJsonArr(raw: string): any[] {
  const text = stripFence(raw);
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* 落到兜底 */
    }
  }
  // 输出被 maxTokens 截断时的兜底：逐对象抽取
  const objs = text.match(/\{[^{}]*\}/g) || [];
  return objs
    .map((o) => {
      try {
        return JSON.parse(o);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** 提取 JSON 对象（扁平结构）：整段解析 → 截取 { ... } → 逐个 {} 兜底；模型若包成数组则取首个元素 */
function extractJsonObj(raw: string): any | null {
  const text = stripFence(raw);
  try {
    const v = JSON.parse(text);
    if (Array.isArray(v)) {
      if (v[0] && typeof v[0] === 'object') return v[0];
    } else if (v && typeof v === 'object') {
      return v;
    }
  } catch {
    /* 落到兜底 */
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      /* 落到兜底 */
    }
  }
  const objs = text.match(/\{[^{}]*\}/g) || [];
  for (const o of objs) {
    try {
      return JSON.parse(o);
    } catch {
      /* 继续 */
    }
  }
  return null;
}

/**
 * 解析 AI 返回文本为热点草稿。
 * 三级容错：① 去 ```json 围栏后整段 JSON.parse ② 截断兜底逐个 {} 抽取 ③ 丢弃无法归一化的条目
 */
export function parseHotspots(raw: string, year: number, month: number): Omit<HotspotItem, 'id' | 'createdAt'>[] {
  const arr = extractJsonArr(raw);

  const cats = HOTSPOT_CATEGORIES as readonly string[];
  const auds = HOTSPOT_AUDIENCES as readonly string[];
  const out: Omit<HotspotItem, 'id' | 'createdAt'>[] = [];
  const seen = new Set<string>();

  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const date = normalizeDate(it.date ?? it.day ?? it.time, year, month);
    if (!date) continue;
    const title = String(it.title ?? it.name ?? it.event ?? '').trim();
    if (!title) continue;
    const sig = `${date}|${title}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    const category = (cats.includes(String(it.category)) ? String(it.category) : '其他') as HotspotCategory;
    const audience = (auds.includes(String(it.audience)) ? String(it.audience) : '公立校') as HotspotAudience;
    out.push({
      date,
      title: title.slice(0, 60),
      category,
      audience,
      note: String(it.note ?? it.desc ?? it.remark ?? '').trim().slice(0, 200),
      pinned: false,
      source: 'ai',
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** 构造 AI 提示词（system + user）；docText 为项目文档摘录，用于让 AI 按文档匹配行业热点 */
export function buildHotspotPrompt(requirement: string, year: number, month: number, docText?: string) {
  const maxDay = new Date(year, month, 0).getDate();
  const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
  const firstWeek = weekNames[new Date(year, month - 1, 1).getDay()];
  const system =
    '你是一名中国市场的行业运营日历助手，熟悉教育培训、零售茶饮、企业服务、跨境电商等行业的年度经营节奏、' +
    '学期与考试安排、政策窗口、展会节令与家长/客户关注周期。' +
    '你会根据用户给出的行业需求，产出一个自然月内的关键节点清单。' +
    '严格要求：只输出一个 JSON 数组，不要任何解释、标题、markdown 代码块围栏或多余文字。';
  let user =
    `行业需求：${requirement}\n` +
    `目标月份：${year}年${month}月（共 ${maxDay} 天，1 号是星期${firstWeek}）\n`;
  const doc = String(docText || '').trim().slice(0, MAX_DOC_PROMPT_CHARS);
  if (doc) {
    user +=
      `以下是该项目的说明文档摘录，请优先依据文档里提到的行业、区域、客群、产品线、既往活动节奏来匹配热点；\n` +
      `文档与上方行业需求冲突时以文档为准：\n"""\n${doc}\n"""\n`;
  }
  user +=
    `请输出 8-15 条与该需求强相关的热点节点，按日期升序。每条格式：\n` +
    `{"date":"YYYY-MM-DD","title":"节点名称","category":"节点类型","audience":"影响对象","note":"简短说明或应对建议"}\n` +
    `category 只能取：${HOTSPOT_CATEGORIES.join(' / ')}\n` +
    `audience 只能取：${HOTSPOT_AUDIENCES.join(' / ')}\n` +
    `日期必须落在 ${year}年${month}月 内；若某节点无确切日期，请给该月内的合理估计日期，并在 note 里注明“预估”。`;
  return { system, user };
}

// ===== 从 Word 文档提取项目信息 =====
export interface ExtractedProject {
  name: string;
  industry: string;
  city: string;
  audience: string;
  nodes: HotspotCategory[];
  extra: string;
}

/** 构造「从文档提取项目信息」的提示词 */
export function buildDocExtractPrompt(docText: string, fileName: string) {
  const system =
    '你是企业资料结构化助手。从用户提供的项目/机构介绍文档中提取关键信息，用于后续生成行业运营热点日历。' +
    '严格要求：只输出一个 JSON 对象，不要任何解释、markdown 代码块围栏或多余文字。';
  const user =
    `文档名：${fileName || '未命名'}\n` +
    `文档正文：\n"""\n${String(docText || '').slice(0, MAX_DOC_PROMPT_CHARS)}\n"""\n` +
    `请提取并输出：\n` +
    `{"name":"项目名称或机构名称","industry":"行业","city":"城市或主要服务区域","audience":"目标客户人群或学段","nodes":["关注节点类型数组"],"extra":"补充要求"}\n` +
    `industry 只能取：${HOTSPOT_INDUSTRIES.join(' / ')}\n` +
    `nodes 只能从这些值中选，可多选：${HOTSPOT_CATEGORIES.join(' / ')}\n` +
    `extra 用 100 字以内概括：该项目做内容、招生或营销时最该关注的时间点与业务重点。\n` +
    `文档里找不到的字段留空字符串或空数组，不要编造。`;
  return { system, user };
}

/** 解析「从文档提取项目信息」的 AI 输出；什么都没提取到时返回 null */
export function parseProjectFromDoc(raw: string, fallbackName: string): ExtractedProject | null {
  const o = extractJsonObj(raw);
  if (!o || typeof o !== 'object') return null;

  const cats = HOTSPOT_CATEGORIES as readonly string[];
  const inds = HOTSPOT_INDUSTRIES as readonly string[];

  const name = String(o.name ?? o.project ?? o.title ?? '').trim() || fallbackName.replace(/\.docx?$/i, '').trim();
  const indRaw = String(o.industry ?? '').trim();
  const industry = inds.includes(indRaw) ? indRaw : indRaw ? '其他' : '';
  const city = String(o.city ?? o.region ?? o.area ?? '').trim();
  const audience = String(o.audience ?? o.target ?? o.crowd ?? '').trim();
  const extra = String(o.extra ?? o.summary ?? o.note ?? '').trim().slice(0, 200);

  let nodes: HotspotCategory[] = [];
  const rawNodes = Array.isArray(o.nodes) ? o.nodes : Array.isArray(o.categories) ? o.categories : [];
  nodes = rawNodes.map((n: any) => String(n).trim()).filter((n: string) => cats.includes(n)) as HotspotCategory[];
  nodes = Array.from(new Set(nodes));

  if (!name && !industry && !city && !audience && nodes.length === 0 && !extra) return null;
  return { name, industry, city, audience, nodes, extra };
}
