// 直播工作间数据层：场次 / 话术 / 评分标准 / 复盘 Skill / 复盘报告
// 全部 localStorage 持久化

export type LivePlatform = 'shipinhao' | 'douyin' | 'unknown';

// ===== 直播场次记录 =====
export interface LiveSession {
  id: string;
  platform: LivePlatform;      // shipinhao=视频号 douyin=抖音
  account: string;             // 账号名称
  category: string;            // 所属板块（小学/初中…）
  sessionName: string;         // 场次（如 "2.25（星期二）第一场"）
  date: string;                // 开播日期
  duration: string;            // 开播时长
  timeSlot: string;            // 直播时段
  viewers: number;             // 观众总数（场观）
  peakOnline: number;          // 最高在线
  avgOnline: number;           // 平均在线
  newFollowers: number;        // 新增关注
  wechatAdds: number;          // 添加微信数（加微）
  conversions: number;         // 转换人数
  gmv: number;                 // GMV（卖货场才有）
  batchId: string;             // 导入批次
  sourceSheet: string;         // 来源子表名
  importedAt: string;
}

// ===== 话术 =====
export interface ScriptCategory {
  key: string;
  label: string;
  icon: string; // emoji
}

export interface ScriptItem {
  id: string;
  categoryKey: string;
  title?: string;      // 标题（文档名/话术名）；文档型话术用于折叠卡展示
  content: string;
  date: string;        // 话术使用的直播日期
  sessionRef: string;  // 关联场次（第几场）
  account: string;     // 哪个账号的直播
  platform: LivePlatform;
  splitFrom?: string;  // 拆分来源文档标题（区分这条话术是从哪份文档拆出来的）
  score?: number;      // LLM 评分（0-10）
  scoreReason?: string;
  createdAt: string;
}

// ===== 评分标准（自定义） =====
export interface ScoreRule {
  id: string;
  name: string;        // 如「高场观关联」
  description: string; // 具体评分要求，会拼进 LLM prompt
  weight: number;      // 权重 1-10
  enabled: boolean;
}

// ===== 复盘 Skill =====
export interface ReviewSkill {
  id: string;
  label: string;
  prompt: string;
  platform: 'douyin' | 'shipinhao' | 'all';
  enabled: boolean;
  createdAt: string;
}

// ===== 复盘报告 =====
export interface ReviewReport {
  id: string;
  platform: 'douyin' | 'shipinhao';
  skillId: string;
  skillLabel: string;
  sessionIds: string[];  // 基于哪些场次复盘
  content: string;
  month: string;         // YYYY-MM，月末汇总用
  isMonthly: boolean;    // true=月度汇总报告
  createdAt: string;
}

// ===== 话术文档（板块1 Word 上传存档，为板块2做准备） =====
export interface ScriptDoc {
  id: string;
  fileName: string;
  content: string;     // txt/md 直接解析的文本；docx 为用户粘贴的文本
  note: string;        // 备注（如"已按话术分类拆分"）
  createdAt: string;
}

const K = {
  sessions: 'live_sessions_v1',
  scripts: 'live_scripts_v1',
  categories: 'live_script_categories_v1',
  scoreRules: 'live_score_rules_v1',
  reviewSkills: 'live_review_skills_v1',
  reports: 'live_review_reports_v1',
  scriptDocs: 'live_script_docs_v1',
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function write(key: string, val: any): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch (e) {
    console.error('[liveStore] 写入失败（可能存储已满）', key, e);
    return false;
  }
}
const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ===== 默认数据 =====
export const DEFAULT_CATEGORIES: ScriptCategory[] = [
  { key: 'opening', label: '开场话术', icon: '🎬' },
  { key: 'product', label: '产品介绍', icon: '📦' },
  { key: 'interact', label: '互动话术', icon: '💬' },
  { key: 'closing', label: '逼单话术', icon: '🔥' },
  { key: 'ending', label: '结束话术', icon: '👏' },
  { key: 'pin', label: '留人话术', icon: '📌' },
];

export const DEFAULT_SCORE_RULES: ScoreRule[] = [
  {
    id: 'rule-viewers',
    name: '高场观关联',
    description: '该话术出现的场次观众总数是否显著高于平均值（场观越高分越高）',
    weight: 8,
    enabled: true,
  },
  {
    id: 'rule-wechat',
    name: '高引流关联',
    description: '该话术出现的场次加微数是否突出（引流效果越好分越高）',
    weight: 8,
    enabled: true,
  },
  {
    id: 'rule-hook',
    name: '钩子强度',
    description: '开头 3 秒是否有明确钩子（痛点/福利/悬念），能否让人停下来',
    weight: 6,
    enabled: true,
  },
  {
    id: 'rule-action',
    name: '行动指令',
    description: '是否有清晰的行动号召（点关注/加微信/扣1/下单）',
    weight: 5,
    enabled: true,
  },
];

export const DEFAULT_REVIEW_SKILLS: ReviewSkill[] = [
  {
    id: 'rskill-douyin',
    label: '抖音直播复盘',
    platform: 'douyin',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    prompt: `你是一位资深抖音直播运营复盘师。请基于我提供的直播场次数据，输出一份结构化复盘报告，格式：
【本场数据速览】场观/加微/转化/在线等核心数字与环比
【亮点】做得好的 2-3 点（结合数据证据）
【问题】暴露的 2-3 个问题（按影响排序）
【话术诊断】开场/留人/逼单各环节话术表现
【下场行动清单】3-5 条可立即执行的优化动作（具体、可检查）
要求：数据说话，不空谈；每条结论都引用具体数字。`,
  },
  {
    id: 'rskill-shipinhao',
    label: '视频号直播复盘',
    platform: 'shipinhao',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    prompt: `你是一位资深视频号直播运营复盘师。请基于我提供的直播场次数据，输出结构化复盘：
【本场数据速览】观众/加微/预约/转化核心数字
【流量来源分析】预约vs自然流量的表现推断
【亮点与问题】各 2-3 条，必须有数据支撑
【私域承接评估】加微动作、承接账号、转化率分析
【下场行动清单】3-5 条具体可执行动作
风格：务实直接，数据说话。`,
  },
  {
    id: 'rskill-touliu',
    label: '投流专项复盘',
    platform: 'all',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    prompt: `你是一位直播投流（千川/ADQ）优化师。基于直播数据输出投流复盘：
【消耗与产出】ROI、GMV、转化成本（如数据缺失请明确标注）
【流量结构】付费vs自然占比推断、流量峰值与投放节奏匹配度
【人群分析】观众画像数据解读（年龄/地域占比）
【投流问题诊断】2-3 个核心问题
【下场投放建议】预算分配/出价/定向/素材的具体调整建议
要求：凡数据缺失的维度明确写「本场无投放数据」，不要编造。`,
  },
];

// ===== 场次 CRUD =====
export function getSessions(): LiveSession[] {
  return read<LiveSession[]>(K.sessions, []);
}

// 追加模式：按 platform+account+sessionName+date 去重，返回 {added, skipped}
export function addSessions(list: Omit<LiveSession, 'id' | 'batchId' | 'importedAt'>[], batchId: string): { added: number; skipped: number } {
  const existing = getSessions();
  const keyOf = (s: { platform: LivePlatform; account: string; sessionName: string; date: string; timeSlot?: string }) =>
    `${s.platform}|${s.account}|${s.sessionName}|${s.date}|${s.timeSlot || ''}`;
  const existKeys = new Set(existing.map(keyOf));
  const now = new Date().toISOString();
  let added = 0;
  let skipped = 0;
  const toAdd: LiveSession[] = [];
  for (const s of list) {
    if (existKeys.has(keyOf(s))) {
      skipped++;
      continue;
    }
    existKeys.add(keyOf(s));
    toAdd.push({ ...s, id: uid('ls'), batchId, importedAt: now });
    added++;
  }
  write(K.sessions, [...existing, ...toAdd]);
  return { added, skipped };
}

// 覆盖模式：清空后整体写入
export function replaceSessions(list: Omit<LiveSession, 'id' | 'batchId' | 'importedAt'>[], batchId: string): number {
  const now = new Date().toISOString();
  const full = list.map((s) => ({ ...s, id: uid('ls'), batchId, importedAt: now }));
  write(K.sessions, full);
  return full.length;
}

export function removeSession(id: string) {
  write(K.sessions, getSessions().filter((s) => s.id !== id));
}
export function removeSessionsByBatch(batchId: string) {
  write(K.sessions, getSessions().filter((s) => s.batchId !== batchId));
}
export function clearSessions() {
  write(K.sessions, []);
}

// 统计
export function sessionStats(sessions: LiveSession[]) {
  const sph = sessions.filter((s) => s.platform === 'shipinhao');
  const dy = sessions.filter((s) => s.platform === 'douyin');
  return {
    total: sessions.length,
    shipinhaoCount: sph.length,
    douyinCount: dy.length,
    accounts: new Set(sessions.map((s) => s.account).filter(Boolean)).size,
    totalViewers: sessions.reduce((a, s) => a + (s.viewers || 0), 0),
    totalGmv: sessions.reduce((a, s) => a + (s.gmv || 0), 0),
    totalWechat: sessions.reduce((a, s) => a + (s.wechatAdds || 0), 0),
    totalConversions: sessions.reduce((a, s) => a + (s.conversions || 0), 0),
  };
}

// ===== 话术 CRUD =====
export function getScripts(): ScriptItem[] {
  return read<ScriptItem[]>(K.scripts, []);
}
export function addScript(s: Omit<ScriptItem, 'id' | 'createdAt'>): ScriptItem {
  const item: ScriptItem = { ...s, id: uid('sc'), createdAt: new Date().toISOString() };
  write(K.scripts, [item, ...getScripts()]);
  return item;
}
export function updateScript(id: string, patch: Partial<ScriptItem>) {
  write(K.scripts, getScripts().map((s) => (s.id === id ? { ...s, ...patch } : s)));
}
export function removeScript(id: string) {
  write(K.scripts, getScripts().filter((s) => s.id !== id));
}

// ===== 话术分类 =====
export function getCategories(): ScriptCategory[] {
  // 空数组属于损坏数据（分类全空会让管理/拆分功能全部失效），回退默认
  const stored = read<ScriptCategory[] | null>(K.categories, null);
  if (stored && stored.length > 0) return stored;
  return DEFAULT_CATEGORIES;
}
// 修复脏数据：强制把分类重置为默认（供"管理分类"异常时一键恢复）
export function resetCategories(): ScriptCategory[] {
  write(K.categories, DEFAULT_CATEGORIES);
  return DEFAULT_CATEGORIES;
}
export function saveCategories(list: ScriptCategory[]): boolean {
  const ok = write(K.categories, list);
  if (!ok) return false;
  // 读回验证（防止静默失败）
  const verified = read<ScriptCategory[] | null>(K.categories, null);
  return Array.isArray(verified) && verified.length === list.length;
}

// ===== 评分标准 =====
export function getScoreRules(): ScoreRule[] {
  return read<ScoreRule[]>(K.scoreRules, DEFAULT_SCORE_RULES);
}
export function saveScoreRules(list: ScoreRule[]) {
  write(K.scoreRules, list);
}

// ===== 复盘 Skill =====
export function getReviewSkills(): ReviewSkill[] {
  const stored = read<ReviewSkill[] | null>(K.reviewSkills, null);
  return stored ?? DEFAULT_REVIEW_SKILLS;
}
export function saveReviewSkills(list: ReviewSkill[]) {
  write(K.reviewSkills, list);
}

// ===== 复盘报告 =====
export function getReports(): ReviewReport[] {
  return read<ReviewReport[]>(K.reports, []);
}
export function addReport(r: Omit<ReviewReport, 'id' | 'createdAt'>): ReviewReport {
  const item: ReviewReport = { ...r, id: uid('rp'), createdAt: new Date().toISOString() };
  write(K.reports, [item, ...getReports()]);
  return item;
}
export function removeReport(id: string) {
  write(K.reports, getReports().filter((r) => r.id !== id));
}

// ===== 话术文档 =====
export function getScriptDocs(): ScriptDoc[] {
  return read<ScriptDoc[]>(K.scriptDocs, []);
}
export function addScriptDoc(d: Omit<ScriptDoc, 'id' | 'createdAt'>): ScriptDoc {
  const item: ScriptDoc = { ...d, id: uid('doc'), createdAt: new Date().toISOString() };
  write(K.scriptDocs, [item, ...getScriptDocs()]);
  return item;
}
export function removeScriptDoc(id: string) {
  write(K.scriptDocs, getScriptDocs().filter((d) => d.id !== id));
}

// ===== Excel 解析：直播复盘表 → 场次记录 =====
// 设计：通用别名 + 表头行自动探测（前 8 行找关键词最多的行）+ sheet 名平台推断
const COL_ALIASES: Record<string, string[]> = {
  account: ['账号名称', '账号', '账户', '直播账号'],
  category: ['所属板块', '板块', '业务板块', '类目', '直播类型'],
  sessionName: ['开播场次（星期、日期）', '开播场次', '直播场次', '场次', '主题', '直播主题'],
  date: ['月/周', '开播日期', '直播日期', '日期', '月份', '周次', '时间'],
  duration: ['开播时长', '直播时长', '时长'],
  timeSlot: ['开播时间', '直播时段', '时段'],
  viewers: ['观众总数', '场观', '观看人数', '累计观看', '观看人次', '观众数'],
  peakOnline: ['最高在线', '峰值在线', '在线峰值'],
  avgOnline: ['平均在线', '均在线'],
  newFollowers: ['新增关注', '新增粉丝', '涨粉', '粉丝增长'],
  wechatAdds: ['添加微信数', '加微数', '加微', '加微信', '引流人数', '添加微信'],
  conversions: ['转换总人数', '转换人数', '转化人数', '报名人数', '成交人数', '转化'],
  gmv: ['GMV', 'gmv', '销售额', '成交金额', '成交额', '卖货金额'],
};

const HEADER_KEYWORDS = ['账号', '场次', '观众', '日期', '微信', 'GMV', '在线', '板块', '时段', '时长', '关注', '转换'];

function norm(s: any): string {
  return String(s ?? '').replace(/\s+/g, '').replace(/\n/g, '').trim();
}

function matchCol(header: string): { field: keyof typeof COL_ALIASES; aliasLen: number } | null {
  const h = norm(header);
  if (!h) return null;
  // 先精确匹配（完全相等），别名越长优先级越高（「账号名称」优先于「账号」）
  let best: { field: keyof typeof COL_ALIASES; aliasLen: number } | null = null;
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    for (const a of aliases) {
      const na = norm(a);
      if (h === na && na.length > (best?.aliasLen || 0)) {
        best = { field: field as keyof typeof COL_ALIASES, aliasLen: na.length };
      }
    }
  }
  if (best) return best;
  // 再模糊包含，同样长别名优先
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    for (const a of aliases) {
      const na = norm(a);
      if (h.includes(na) && na.length > (best?.aliasLen || 0)) {
        best = { field: field as keyof typeof COL_ALIASES, aliasLen: na.length };
      }
    }
  }
  return best;
}

function toNum(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function detectPlatform(sheetName: string, rows: any[][]): LivePlatform {
  const name = sheetName.toLowerCase();
  if (/视频号|shipinhao|wechat.?channel/i.test(name)) return 'shipinhao';
  if (/抖音|douyin/i.test(name)) return 'douyin';
  // 从内容推断：全表扫描"视频号/抖音"字样（填表说明里常含平台名）
  const joined = rows.flat().map((c) => String(c ?? '')).join('|');
  if (/视频号/.test(joined)) return 'shipinhao';
  if (/抖音/.test(joined)) return 'douyin';
  return 'unknown';
}

// 分析区块起始行标志：出现这些词说明数据区结束、下面是分析/问题记录区
const ANALYSIS_BLOCK_RE = /问题记录|关联因素|问题分析|复盘分析|话术分析|改进措施|流量精准度|内容吸引力|产品展现力/;

export interface ParsedSheetResult {
  sheetName: string;
  platform: LivePlatform;
  sessions: Omit<LiveSession, 'id' | 'batchId' | 'importedAt'>[];
  skipped: boolean;
  skipReason?: string;
}

// 解析单个 sheet 的原始二维数组
export function parseLiveSheet(sheetName: string, rows: any[][]): ParsedSheetResult {
  const platform = detectPlatform(sheetName, rows);
  // 1. 表头行探测：前 8 行中「短单元格命中关键词」最多的行
  // （排除填表说明行：说明行是一个长文本单元格塞满关键词，真表头是多个独立短单元格）
  let headerIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const cells = rows[i] || [];
    let score = 0;
    for (const c of cells) {
      const n = norm(c);
      // 真表头单元格都很短；长文本（>12 字）视为说明文字，不参与关键词命中
      if (n && n.length <= 12 && HEADER_KEYWORDS.some((k) => n.includes(k))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      headerIdx = i;
    }
  }
  if (headerIdx < 0 || bestScore < 2) {
    return { sheetName, platform, sessions: [], skipped: true, skipReason: '未找到有效表头行' };
  }
  // 2. 列映射（同字段多列命中时，保留别名更精确的那列，如「账号名称」胜过「账号」分组列）
  const header = rows[headerIdx] || [];
  const colMap: Partial<Record<keyof typeof COL_ALIASES, number>> = {};
  const colAliasLen: Partial<Record<keyof typeof COL_ALIASES, number>> = {};
  header.forEach((cell, idx) => {
    const m = matchCol(cell);
    if (!m) return;
    if (colMap[m.field] === undefined || m.aliasLen > (colAliasLen[m.field] || 0)) {
      colMap[m.field] = idx;
      colAliasLen[m.field] = m.aliasLen;
    }
  });
  if (colMap.account === undefined && colMap.sessionName === undefined && colMap.viewers === undefined) {
    return { sheetName, platform, sessions: [], skipped: true, skipReason: '表头未匹配到关键列（账号/场次/观众）' };
  }
  // 3. 数据行（先判数据行，再判分析区截止；空账号/日期向下填充合并单元格）
  const rawSessions: ParsedSheetResult['sessions'] = [];
  const get = (row: any[], f: keyof typeof COL_ALIASES): any =>
    colMap[f] !== undefined ? row[colMap[f]!] : '';
  let lastAccount = '';
  let lastDate = '';
  let lastSession = '';
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    let account = String(get(row, 'account') ?? '').trim();
    let sessionName = String(get(row, 'sessionName') ?? '').trim();
    let date = String(get(row, 'date') ?? '').trim();
    const viewers = toNum(get(row, 'viewers'));
    const wechatAdds = toNum(get(row, 'wechatAdds'));
    const gmv = toNum(get(row, 'gmv'));
    const conversions = toNum(get(row, 'conversions'));
    // 说明性文字（以括号开头）不是账号名
    if (/^[（(]/.test(account)) account = '';
    // ① 先判数据行：有账号/场次/任何数字 → 是数据，绝不能被分析词误杀
    const hasData = !!(account || sessionName || viewers > 0 || wechatAdds > 0 || gmv > 0 || conversions > 0);
    if (!hasData) {
      // ② 无数据行：仅当「短单元格」含分析区标志词时才截止（长备注文本不参与判断）
      const isAnalysisStart = row.some((c) => {
        const n = norm(c);
        return n.length > 0 && n.length <= 15 && ANALYSIS_BLOCK_RE.test(n);
      });
      if (isAnalysisStart) break;
      continue; // 普通空行跳过
    }
    // ③ 向下填充：合并单元格导致账号/日期/场次只出现在首行
    if (account) lastAccount = account; else account = lastAccount;
    if (date) lastDate = date; else date = lastDate;
    if (sessionName) lastSession = sessionName; else sessionName = lastSession;
    rawSessions.push({
      platform,
      account,
      category: String(get(row, 'category') ?? '').trim(),
      sessionName,
      date,
      duration: String(get(row, 'duration') ?? '').trim(),
      timeSlot: String(get(row, 'timeSlot') ?? '').trim(),
      viewers,
      peakOnline: toNum(get(row, 'peakOnline')),
      avgOnline: toNum(get(row, 'avgOnline')),
      newFollowers: toNum(get(row, 'newFollowers')),
      wechatAdds,
      conversions,
      gmv,
      sourceSheet: sheetName,
    });
  }
  // 4. 同场次合并：仅针对「卖货场多产品行」——该行有 GMV 但无场观/加微/转化（纯产品明细行）
  // 才按键合并进首行（GMV 累加）；正常场次行（有场观等业务数据）绝不合并，避免误杀同月同主题的不同时段场次
  const groupKey = (s: ParsedSheetResult['sessions'][number]) =>
    `${s.platform}|${s.account}|${s.sessionName}|${s.date}|${s.timeSlot}`;
  const merged = new Map<string, ParsedSheetResult['sessions'][number]>();
  for (const s of rawSessions) {
    const isProductRow = s.gmv > 0 && !s.viewers && !s.wechatAdds && !s.conversions;
    if (!isProductRow) {
      // 正常场次行：直接保留（用唯一 key 防覆盖）
      merged.set(`${groupKey(s)}#${merged.size}`, { ...s });
      continue;
    }
    const k = groupKey(s);
    const exist = merged.get(k);
    if (!exist) {
      merged.set(k, { ...s });
    } else {
      exist.gmv += s.gmv;
    }
  }
  const sessions = [...merged.values()];
  return { sheetName, platform, sessions, skipped: sessions.length === 0, skipReason: sessions.length === 0 ? '无数据行' : undefined };
}

// 便捷入口：传入已读出的子表数组（由调用方用 xlsx 读取），解析前 N 个
export function parseLiveSheets(
  sheets: { name: string; rows: any[][] }[],
  maxSheets = 3,
): ParsedSheetResult[] {
  return sheets.slice(0, maxSheets).map((s) => parseLiveSheet(s.name, s.rows));
}
