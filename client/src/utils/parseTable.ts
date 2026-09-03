// 表格解析与字段映射工具
// 负责把用户上传的 CSV/Excel 数据解析成对标监控账号和二创内容

import * as XLSX from 'xlsx';
import type { RecentPost, Platform, BenchmarkAccount } from '../types';

export interface ParsedPost extends RecentPost {
  // 解析出来的每行内容，含来源标识
  source: 'import';
  sourceFile?: string;
  // 完整正文（来自"笔记内容/正文/文案/详情"列），用于二创详情展示
  content?: string;
  // 视频文件链接（抖音用，点击卡片可播放）
  videoUrl?: string;
  // 音频文件链接（二创前用 ASR 提取口播文字）
  audioUrl?: string;
  // 手动添加（不走表格导入）时填写的原账号名，列表直接显示，无需反查账号表
  accountName?: string;
  // true = 页面里「添加视频 / 添加二创」按钮手动录入，区别于表格批量导入
  manual?: boolean;
}

// 每次上传一次抓取数据，生成一个快照
export interface AccountSnapshot {
  uploadedAt: string; // ISO
  sourceFile?: string;
  followers: number;
  avgLikes: number;
  avgComments: number;
  avgCollects: number;
  avgShares: number;
  notes: number;
  // 互动率（%）：(likes+comments*3+collects*2+shares*2) / followers × 100
  engagementRate: number;
  // 互动量汇总（likes + comments*3 + collects*2 + shares*2）
  interScore: number;
}

export interface ParsedAccount extends BenchmarkAccount {
  source: 'import';
  sourceFile?: string;
  // 历史快照：每次合并时 push 一次，最新一个永远在末尾
  history: AccountSnapshot[];
  // 最近一次上传相对上一次上传的增量（Δ），如果只有一次则为 undefined
  delta?: {
    followers: number;
    avgLikes: number;
    avgComments: number;
    avgCollects: number;
    avgShares: number;
    interScore: number;
  };
}

export interface ParseResult {
  headers: string[];
  rows: string[][]; // 含表头的全部原始行
  accounts: ParsedAccount[];
  posts: ParsedPost[]; // 每行对应一条二创内容
  matchedFields: Record<string, number>; // 识别到的字段→列索引
  unrecognized: string[]; // 未识别的列名
}

export interface ConfirmPayload {
  accounts: ParsedAccount[];
  posts: ParsedPost[];
}

// 字段别名 → 标准名
const FIELD_ALIASES: Record<string, string[]> = {
  title: ['标题', '笔记标题', '内容标题', '视频标题', 'title', 'name', '作品标题'],
  name: ['账号', '账号名', '昵称', '作者', '博主', '达人', 'account', 'username'],
  followers: ['粉丝', '粉丝数', '关注', 'followers', 'fans'],
  likes: ['点赞', '点赞数', '获赞', '赞', 'likes', 'like_count'],
  comments: ['评论', '评论数', '留言', '回复', 'comments', 'comment_count'],
  collects: ['收藏', '收藏数', '藏', 'collects', 'saves'],
  shares: ['分享', '分享数', '转发', '转', 'shares', 'forwards'],
  views: ['播放', '播放量', '阅读', '曝光', '观看', 'views', 'play_count'],
  notes: ['笔记数', '作品数', '视频数', 'notes', 'works'],
  url: ['链接', 'url', 'link', 'note_url'],
  // 博主主页链接（用于「提取博主信息」：整理 + 去重 + 一键复制）
  homeUrl: [
    '主页链接', '主页地址', '博主主页', '账号主页', '达人主页', '博主链接',
    '账号链接', '达人链接', '个人主页', '首页链接', '主页URL', '主页url',
    'homepage', 'home_url', 'homeurl', 'profile', 'profile_url', 'user_url',
    'author_url', 'blogger_url', '博主主页链接', '账号主页链接',
  ],
  coverUrl: [
    // 中文 — 标准
    '笔记封面链接', '封面链接', '封面', '封面图', '封面图片', '封面地址', '封面url', '封面URL',
    '封面图地址', '封面图片链接', '笔记封面', '笔记封面图', '笔记封面图片',
    '图片链接', '图片地址', '图片url', '图片URL',
    // 中文 — 别名
    '首图', '主图', '背景图', '缩略图', '配图', '头图', '笔记图', '笔记图片',
    'cover', 'cover_url', 'coverurl', 'coverurl', 'coverimage', 'cover_image',
    'image', 'image_url', 'imageurl', 'img', 'img_url', 'imgurl', 'img_url_list',
    'pic', 'pic_url', 'picture', 'thumbnail', 'thumb', 'thumb_url', 'thumburl',
    'poster', 'photo', 'photo_url', 'background',
  ],
  // 笔记内容/正文/详情/文案/描述/口播稿：用于二创详情展示页（也作为口播文案来源）
  content: [
    '笔记内容', '笔记正文', '正文', '内容', '文案', '笔记文案', '详情',
    '内容描述', '内容详情', '描述', 'text', 'content', 'body', 'detail',
    'note_content', 'note_text', 'note_body', 'note_detail',
    // 口播/转写类列名（表格已带文案时直接识别，无需再调 ASR/LLM）
    '口播文案', '口播稿', '口播内容', '口播文字', '字幕', '转写', '转写稿',
    '转写内容', '语音文案', '配音文案', '脚本', '台词', '文稿', '全文',
    'transcript', 'subtitle', 'script', 'speech_text',
  ],
  // 视频文件链接（用于抖音卡片直接播放）
  videoUrl: [
    '视频链接', '视频地址', '视频', '视频URL', 'video', 'video_url', 'videourl',
    '播放链接', '播放地址', 'play_url', 'mp4', 'mp4_url', 'src', 'source_url',
    '视频源', '视频文件', 'video_src', 'aweme_url',
  ],
  // 音频文件链接（用于二创前提取口播为文字）
  audioUrl: [
    '音频文件链接', '音频链接', '音频地址', '音频URL', 'audio', 'audio_url', 'audiourl',
    '口播链接', '口播音频', '语音', '音频文件', 'mp3', 'mp3_url', 'voice_url',
    'voice', 'speech', 'speech_url', 'audio_src', '音频',
  ],
  // 话题标签（用于热门话题标签聚合）
  tags: [
    '标签', '话题', '话题标签', 'tags', 'tag', 'hashtags', 'hashtag',
    '笔记标签', '关键词', 'keywords', 'topic', 'topics', '主题',
  ],
  // 笔记类型（干货/经验/避坑/测评/资源/工具等）
  type: [
    '类型', '笔记类型', '内容类型', 'type', 'note_type', 'category',
    '分类', '类别',
  ],
};

// 平台级默认字段（识别不到时优先用平台习惯字段作为"互动数"）
const PLATFORM_PRIORITY: Record<Platform, (keyof typeof FIELD_ALIASES)[]> = {
  xiaohongshu: ['collects', 'likes', 'comments', 'shares'],
  douyin: ['likes', 'comments', 'shares', 'collects'],
};

function findColumn(headers: string[], aliases: string[]): number {
  const norm = headers.map((h) => (h || '').toString().trim().toLowerCase());
  for (const alias of aliases) {
    const a = alias.toLowerCase();
    const idx = norm.findIndex((h) => h === a);
    if (idx >= 0) return idx;
  }
  for (const alias of aliases) {
    const a = alias.toLowerCase();
    const idx = norm.findIndex((h) => h.includes(a));
    if (idx >= 0) return idx;
  }
  return -1;
}

function num(v: any, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'number') return isFinite(v) ? v : fallback;
  const cleaned = String(v).replace(/[^\d.\-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? fallback : n;
}

function pickAvatarColor(seed: number): string {
  const palette = [
    'from-rose-500 to-pink-500',
    'from-purple-500 to-indigo-500',
    'from-cyan-500 to-blue-500',
    'from-amber-500 to-orange-500',
    'from-emerald-500 to-teal-500',
    'from-fuchsia-500 to-purple-500',
    'from-sky-500 to-cyan-500',
    'from-orange-500 to-rose-500',
  ];
  return palette[seed % palette.length];
}

function pickCoverColor(seed: number): string {
  const palette = [
    'from-rose-500 to-pink-500',
    'from-purple-500 to-indigo-500',
    'from-cyan-500 to-blue-500',
    'from-amber-500 to-orange-500',
    'from-emerald-500 to-teal-500',
    'from-fuchsia-500 to-purple-500',
  ];
  return palette[seed % palette.length];
}

// 从 File 读取为二维数组（CSV/Excel）
export async function readTableFile(file: File): Promise<string[][]> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'csv' || file.type === 'text/csv') {
    const text = await file.text();
    return parseCSV(text);
  }
  // Excel: 通过 SheetJS 读 array buffer
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];
  const ws = wb.Sheets[firstSheet];
  // header:1 输出二维数组
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', blankrows: false });
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',' || ch === '\t') {
        cur.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field !== '' || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

// 主入口：解析表格
export function parseTable(rows: string[][], platform: Platform, sourceFile?: string): ParseResult {
  if (!rows || rows.length === 0) {
    return { headers: [], rows: [], accounts: [], posts: [], matchedFields: {}, unrecognized: [] };
  }
  const headers = rows[0].map((h) => String(h ?? '').trim());
  const matchedFields: Record<string, number> = {};
  const unrecognized: string[] = [];

  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = findColumn(headers, aliases);
    if (idx >= 0) matchedFields[key] = idx;
  }
  for (let i = 0; i < headers.length; i++) {
    if (!Object.values(matchedFields).includes(i)) {
      if (headers[i]) unrecognized.push(headers[i]);
    }
  }

  const dataRows = rows.slice(1);
  const accounts: ParsedAccount[] = [];
  const posts: ParsedPost[] = [];
  const hasName = matchedFields.name !== undefined;
  const hasTitle = matchedFields.title !== undefined;
  const hasContent = matchedFields.content !== undefined;
  const hasTags = matchedFields.tags !== undefined;
  const hasType = matchedFields.type !== undefined;
  const hasNotes = matchedFields.notes !== undefined;
  const hasVideoUrl = matchedFields.videoUrl !== undefined;
  const hasAudioUrl = matchedFields.audioUrl !== undefined;
  const hasHomeUrl = matchedFields.homeUrl !== undefined;

  // 把"标签/标签1,标签2,标签3"或"标签|标签|标签"或数组都解析成数组
  const parseTagsCell = (raw: any): string[] => {
    if (raw === undefined || raw === null) return [];
    const s = String(raw).trim();
    if (!s) return [];
    return s
      .split(/[,，|、;\s]+/)
      .map((x) => x.replace(/^#/, '').trim())
      .filter(Boolean);
  };
  // 没有 name 列时，尝试将"标题列"作为 name（兜底）
  const effectiveNameIdx = matchedFields.name ?? (hasTitle ? -1 : -1);

  if (hasName) {
    // 每行 = 一个账号 + 一条代表性内容（二创）
    // 严格按上传数据：找不到字段 → 0；不再随机数填充
    dataRows.forEach((row, i) => {
      const name = String(row[matchedFields.name] || `导入账号${i + 1}`).trim() || `导入账号${i + 1}`;
      const followers = num(row[matchedFields.followers], 0);
      const avgLikes = num(row[matchedFields.likes], 0);
      const avgComments = num(row[matchedFields.comments], 0);
      const avgCollects = num(row[matchedFields.collects], 0);
      const avgShares = num(row[matchedFields.shares], 0);
      const views = num(row[matchedFields.views], 0);
      const notes = hasNotes ? num(row[matchedFields.notes], 0) : 0;
      const title = hasTitle ? String(row[matchedFields.title] || `${name}代表笔记`).trim() : `${name}代表笔记`;
      // 笔记封面链接（支持本地 data: URL、http(s) URL、相对路径）
      const coverUrlRaw = matchedFields.coverUrl !== undefined ? String(row[matchedFields.coverUrl] || '').trim() : '';
      const coverUrl = coverUrlRaw || undefined;

      // 互动率：按上传数据计算，找不到时返回 0
      const engRaw = followers > 0
        ? ((avgLikes + avgComments + avgCollects + avgShares) / followers) * 100
        : 0;
      const engagementRate = followers > 0
        ? +Math.min(Math.max(engRaw, 0), 100).toFixed(2)
        : 0;

      // 标签：上传的 tags 优先，否则回退到平台默认
      const uploadedTags = hasTags ? parseTagsCell(row[matchedFields.tags]) : [];
      const finalTags = uploadedTags.length > 0
        ? uploadedTags
        : ['导入数据', platform === 'xiaohongshu' ? '小红书' : '抖音'];

      // 笔记类型
      const noteType = hasType ? String(row[matchedFields.type] || '').trim() || '导入' : '导入';

      const acc: ParsedAccount = {
        id: `${platform}-imp-${Date.now()}-${i}`,
        platform,
        name,
        homeUrl: hasHomeUrl ? String(row[matchedFields.homeUrl] || '').trim() || undefined : undefined,
        avatar: name.charAt(0).toUpperCase().slice(0, 1) || '导',
        avatarColor: pickAvatarColor(accounts.length + i + 1),
        followers,
        notes,
        avgLikes,
        avgComments,
        avgShares,
        avgCollects,
        engagementRate,
        // growthRate 没有上传就不计算（避免胡编）；从 history 多点才能算
        growthRate: 0,
        lastSyncTime: new Date().toISOString(),
        syncStatus: 'synced',
        hasUpdate: true,
        tags: finalTags,
        recentPosts: [],
        trendData: [],
        source: 'import',
        sourceFile,
        history: [],
      };

      const post: ParsedPost = {
        id: `${acc.id}-p0`,
        title,
        likes: avgLikes,
        comments: avgComments,
        shares: avgShares,
        collects: avgCollects,
        views,
        publishTime: new Date().toISOString().slice(0, 10),
        coverColor: pickCoverColor(i + 2),
        coverUrl,
        content: hasContent ? String(row[matchedFields.content] || '').trim() || undefined : undefined,
        videoUrl: hasVideoUrl ? String(row[matchedFields.videoUrl] || '').trim() || undefined : undefined,
        audioUrl: hasAudioUrl ? String(row[matchedFields.audioUrl] || '').trim() || undefined : undefined,
        type: noteType,
        tags: finalTags,
        source: 'import',
        sourceFile,
      };
      acc.recentPosts = [post];
      accounts.push(acc);
      posts.push(post);
    });
  } else {
    // 没有 name 列：每行 = 一条二创内容，归属一个默认账号
    const accName = sourceFile ? sourceFile.replace(/\.[^.]+$/, '') : '导入数据';
    const acc: ParsedAccount = {
      id: `${platform}-imp-${Date.now()}-0`,
      platform,
      name: accName,
      avatar: accName.charAt(0).toUpperCase().slice(0, 1) || '导',
      avatarColor: pickAvatarColor(0),
      followers: 0,
      notes: dataRows.length,
      avgLikes: 0,
      avgComments: 0,
      avgShares: 0,
      avgCollects: 0,
      engagementRate: 0,
      growthRate: 0,
      lastSyncTime: new Date().toISOString(),
      syncStatus: 'synced',
      hasUpdate: true,
      tags: ['导入数据', platform === 'xiaohongshu' ? '小红书' : '抖音'],
      recentPosts: [],
      trendData: [],
      source: 'import',
      sourceFile,
      history: [],
    };

    // 严格按上传数据：找不到字段 → 0
    dataRows.forEach((row, i) => {
      const title = hasTitle
        ? String(row[matchedFields.title] || `导入内容${i + 1}`).trim() || `导入内容${i + 1}`
        : `导入内容${i + 1}`;
      const likes = num(row[matchedFields.likes], 0);
      const comments = num(row[matchedFields.comments], 0);
      const collects = num(row[matchedFields.collects], 0);
      const shares = num(row[matchedFields.shares], 0);
      const views = num(row[matchedFields.views], likes * 30);
      const coverUrlRaw = matchedFields.coverUrl !== undefined ? String(row[matchedFields.coverUrl] || '').trim() : '';
      const coverUrl = coverUrlRaw || undefined;
      const videoUrl = hasVideoUrl ? String(row[matchedFields.videoUrl] || '').trim() || undefined : undefined;
      const audioUrl = hasAudioUrl ? String(row[matchedFields.audioUrl] || '').trim() || undefined : undefined;
      const post: ParsedPost = {
        id: `${acc.id}-p${i}`,
        title,
        likes,
        comments,
        shares,
        collects,
        views,
        publishTime: new Date().toISOString().slice(0, 10),
        coverColor: pickCoverColor(i + 1),
        coverUrl,
        content: hasContent ? String(row[matchedFields.content] || '').trim() || undefined : undefined,
        videoUrl,
        audioUrl,
        source: 'import',
        sourceFile,
      };
      acc.recentPosts.push(post);
      posts.push(post);
    });
    accounts.push(acc);
  }

  return { headers, rows, accounts, posts, matchedFields, unrecognized };
}

// 已录入池：localStorage key
const STORAGE_KEY_ACCOUNTS_XHS = 'xhs_imported_accounts_v1';
const STORAGE_KEY_ACCOUNTS_DY = 'dy_imported_accounts_v1';
const STORAGE_KEY_POSTS_XHS = 'xhs_imported_posts_v1';
const STORAGE_KEY_POSTS_DY = 'dy_imported_posts_v1';

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, val: any) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error('写入本地存储失败', e);
  }
}

export function getImportedAccounts(platform: Platform): ParsedAccount[] {
  const key = platform === 'xiaohongshu' ? STORAGE_KEY_ACCOUNTS_XHS : STORAGE_KEY_ACCOUNTS_DY;
  return readJSON<ParsedAccount[]>(key, []);
}

export function setImportedAccounts(platform: Platform, list: ParsedAccount[]) {
  const key = platform === 'xiaohongshu' ? STORAGE_KEY_ACCOUNTS_XHS : STORAGE_KEY_ACCOUNTS_DY;
  writeJSON(key, list);
}

export function getImportedPosts(platform: Platform): ParsedPost[] {
  const key = platform === 'xiaohongshu' ? STORAGE_KEY_POSTS_XHS : STORAGE_KEY_POSTS_DY;
  return readJSON<ParsedPost[]>(key, []);
}

export function setImportedPosts(platform: Platform, list: ParsedPost[]) {
  const key = platform === 'xiaohongshu' ? STORAGE_KEY_POSTS_XHS : STORAGE_KEY_POSTS_DY;
  writeJSON(key, list);
}

// 更新单条已导入 post（用于视频解析后回填 videoUrl）
export function updatePost(platform: Platform, postId: string, patch: Partial<ParsedPost>) {
  const list = getImportedPosts(platform);
  const idx = list.findIndex((p) => p.id === postId);
  if (idx < 0) return;
  list[idx] = { ...list[idx], ...patch };
  setImportedPosts(platform, list);
}

// 更新单条账号内的 post（同步 recentPosts 里的字段）
export function updateAccountPost(
  platform: Platform,
  accountId: string,
  postId: string,
  patch: Partial<ParsedPost>
) {
  const list = getImportedAccounts(platform);
  const acc = list.find((a) => a.id === accountId);
  if (!acc) return;
  const idx = acc.recentPosts.findIndex((p) => p.id === postId);
  if (idx < 0) return;
  acc.recentPosts[idx] = { ...acc.recentPosts[idx], ...patch };
  setImportedAccounts(platform, list);
}

/**
 * 手动录入一条内容到内容池 —— 对应页面上的「添加视频 / 添加二创」按钮。
 *
 * 场景：刷到一条好内容想直接拿来做二创，不值得先整理成表格再上传。
 * 与表格导入走同一个池（getImportedPosts），所以录入后立刻出现在内容展示列表里，
 * 可以像导入内容一样勾选、加入二创、删除。
 */
export function addManualPost(
  platform: Platform,
  input: {
    title: string;
    content?: string;
    accountName?: string;
    coverUrl?: string;
    videoUrl?: string;
    audioUrl?: string;
  }
): ParsedPost {
  const list = getImportedPosts(platform);
  const post: ParsedPost = {
    id: `manual-${platform}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: input.title.trim(),
    // 手动录入没有统计数据，互动量全部记 0，避免污染排序与看板
    likes: 0,
    comments: 0,
    shares: 0,
    collects: 0,
    views: 0,
    publishTime: new Date().toISOString(),
    coverColor: pickCoverColor(list.length + 1),
    coverUrl: input.coverUrl?.trim() || undefined,
    content: input.content?.trim() || undefined,
    videoUrl: input.videoUrl?.trim() || undefined,
    audioUrl: input.audioUrl?.trim() || undefined,
    source: 'import',
    accountName: input.accountName?.trim() || undefined,
    manual: true,
  };
  setImportedPosts(platform, [post, ...list]);
  return post;
}

export function clearImported(platform: Platform) {
  if (platform === 'xiaohongshu') {
    writeJSON(STORAGE_KEY_ACCOUNTS_XHS, []);
    writeJSON(STORAGE_KEY_POSTS_XHS, []);
  } else {
    writeJSON(STORAGE_KEY_ACCOUNTS_DY, []);
    writeJSON(STORAGE_KEY_POSTS_DY, []);
  }
}

// 合并结果描述（用于 UI 反馈）
export interface MergeReport {
  accounts: ParsedAccount[];        // 合并后的最终账号列表（已写入 localStorage）
  posts: ParsedPost[];             // 合并后的最终帖子列表
  mergedItems: {                   // 每个新上传账号的合并情况
    name: string;
    action: 'merged' | 'new';      // merged = 命中已有，new = 新增
    delta?: ParsedAccount['delta']; // 仅 merged 时有值
  }[];
}

// 合并上传数据到已导入池
// 同一账号（按 name 匹配）多次上传时：
//   - 粉丝/点赞/评论/收藏/分享取最新上传的数值
//   - 计算相对上一次上传的 Δ 增量
//   - history 追加本次 snapshot
//   - 帖子用新上传的（不去重）
export function mergeImportedAccounts(
  platform: Platform,
  newAccounts: ParsedAccount[],
  newPosts: ParsedPost[]
): MergeReport {
  const existingAccounts = getImportedAccounts(platform);
  const existingPosts = getImportedPosts(platform);

  const mergedItems: MergeReport['mergedItems'] = [];
  const finalAccounts: ParsedAccount[] = [...existingAccounts];

  for (const newAcc of newAccounts) {
    const idx = finalAccounts.findIndex(
      (a) => a.name.trim().toLowerCase() === newAcc.name.trim().toLowerCase()
    );

    if (idx >= 0) {
      // 命中：取最新数值 + 计算 Δ
      const old = finalAccounts[idx];
      const interScore = (n: ParsedAccount) =>
        n.avgLikes + n.avgComments * 3 + n.avgCollects * 2 + n.avgShares * 2;
      const engRate = (n: ParsedAccount) =>
        n.followers > 0 ? +((interScore(n) / n.followers) * 100).toFixed(2) : 0;

      const oldSnapshot: AccountSnapshot = {
        uploadedAt: old.lastSyncTime || new Date().toISOString(),
        sourceFile: old.sourceFile,
        followers: old.followers,
        avgLikes: old.avgLikes,
        avgComments: old.avgComments,
        avgCollects: old.avgCollects,
        avgShares: old.avgShares,
        notes: old.notes,
        engagementRate: engRate(old),
        interScore: interScore(old),
      };
      const newSnapshot: AccountSnapshot = {
        uploadedAt: new Date().toISOString(),
        sourceFile: newAcc.sourceFile,
        followers: newAcc.followers,
        avgLikes: newAcc.avgLikes,
        avgComments: newAcc.avgComments,
        avgCollects: newAcc.avgCollects,
        avgShares: newAcc.avgShares,
        notes: newAcc.notes,
        engagementRate: engRate(newAcc),
        interScore: interScore(newAcc),
      };

      const delta = {
        followers: newSnapshot.followers - oldSnapshot.followers,
        avgLikes: newSnapshot.avgLikes - oldSnapshot.avgLikes,
        avgComments: newSnapshot.avgComments - oldSnapshot.avgComments,
        avgCollects: newSnapshot.avgCollects - oldSnapshot.avgCollects,
        avgShares: newSnapshot.avgShares - oldSnapshot.avgShares,
        interScore: newSnapshot.interScore - oldSnapshot.interScore,
      };

      const updated: ParsedAccount = {
        ...old,
        followers: newAcc.followers,
        avgLikes: newAcc.avgLikes,
        avgComments: newAcc.avgComments,
        avgCollects: newAcc.avgCollects,
        avgShares: newAcc.avgShares,
        notes: newAcc.notes,
        engagementRate: newAcc.engagementRate,
        lastSyncTime: newSnapshot.uploadedAt,
        sourceFile: newAcc.sourceFile,
        // 把新上传的 recentPosts 合并（避免覆盖掉前几次的）
        recentPosts: [...old.recentPosts, ...newAcc.recentPosts].slice(-50),
        // history 只追加新快照：oldSnapshot 的值等同于上次的 newSnapshot（已存在 history 末尾）
        // 之前 [old, oldSnapshot, newSnapshot] 会让同一状态存两次
        history: [...(old.history || []), newSnapshot],
        delta,
      };
      finalAccounts[idx] = updated;
      mergedItems.push({ name: newAcc.name, action: 'merged', delta });
    } else {
      // 新增
      const interScore = (n: ParsedAccount) =>
        n.avgLikes + n.avgComments * 3 + n.avgCollects * 2 + n.avgShares * 2;
      const engRate = (n: ParsedAccount) =>
        n.followers > 0 ? +((interScore(n) / n.followers) * 100).toFixed(2) : 0;
      const initialSnapshot: AccountSnapshot = {
        uploadedAt: new Date().toISOString(),
        sourceFile: newAcc.sourceFile,
        followers: newAcc.followers,
        avgLikes: newAcc.avgLikes,
        avgComments: newAcc.avgComments,
        avgCollects: newAcc.avgCollects,
        avgShares: newAcc.avgShares,
        notes: newAcc.notes,
        engagementRate: engRate(newAcc),
        interScore: interScore(newAcc),
      };
      finalAccounts.push({
        ...newAcc,
        history: [initialSnapshot],
      });
      mergedItems.push({ name: newAcc.name, action: 'new' });
    }
  }

  // 帖子：直接追加（新帖子 + 新账号的新帖子）
  const finalPosts: ParsedPost[] = [...existingPosts, ...newPosts];

  setImportedAccounts(platform, finalAccounts);
  setImportedPosts(platform, finalPosts);

  return { accounts: finalAccounts, posts: finalPosts, mergedItems };
}

// 根据 sourceFile 删除已导入的账号和帖子（用于 UploadTable 删除文件时联动）
// 返回 { removedAccounts, removedPosts }，父组件再清掉 accounts state
export function removeImportedBySourceFile(
  platform: Platform,
  sourceFile: string
): { removedAccounts: ParsedAccount[]; removedPosts: ParsedPost[]; remainingAccounts: ParsedAccount[]; remainingPosts: ParsedPost[] } {
  const existingAccounts = getImportedAccounts(platform);
  const existingPosts = getImportedPosts(platform);

  // 找出属于这个 sourceFile 的账号/帖子
  const removedAccounts = existingAccounts.filter((a) => a.sourceFile === sourceFile);
  const removedAccIds = new Set(removedAccounts.map((a) => a.id));
  const removedPosts = existingPosts.filter(
    (p) => p.sourceFile === sourceFile || removedAccIds.has(p.id.split('-p')[0])
  );

  const remainingAccounts = existingAccounts.filter((a) => a.sourceFile !== sourceFile);
  const remainingPosts = existingPosts.filter(
    (p) => p.sourceFile !== sourceFile && !removedAccIds.has(p.id.split('-p')[0])
  );

  setImportedAccounts(platform, remainingAccounts);
  setImportedPosts(platform, remainingPosts);

  return { removedAccounts, removedPosts, remainingAccounts, remainingPosts };
}

// 单个账号的增量趋势数据（用于详情页图表）
export function getAccountTrend(acc: ParsedAccount): {
  date: string;
  followers: number;
  avgLikes: number;
  avgComments: number;
  avgCollects: number;
  avgShares: number;
  interScore: number;
}[] {
  if (!acc.history || acc.history.length === 0) return [];
  return acc.history.map((s) => ({
    date: s.uploadedAt.slice(5, 10), // MM-DD
    followers: s.followers,
    avgLikes: s.avgLikes,
    avgComments: s.avgComments,
    avgCollects: s.avgCollects,
    avgShares: s.avgShares,
    interScore: s.interScore,
  }));
}

// 工具：从已导入账号/帖子构建用于二创的合并列表（合并 mock 帖子）
export function getMergedPosts(platform: Platform, mockPosts: RecentPost[], mockAccountName = '对标账号'): (RecentPost & { accountName: string })[] {
  const imported = getImportedPosts(platform);
  const importedAccs = getImportedAccounts(platform);
  const importedFlat = imported.map((p) => {
    const acc = importedAccs.find((a) => a.recentPosts.some((rp) => rp.id === p.id));
    return { ...p, accountName: acc?.name || (p.sourceFile ? p.sourceFile.replace(/\.[^.]+$/, '') : '导入账号') };
  });
  const mockFlat = mockPosts.map((p) => ({ ...p, accountName: mockAccountName }));
  return [...importedFlat, ...mockFlat];
}
