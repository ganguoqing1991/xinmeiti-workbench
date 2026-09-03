// 成长小助手数据层：岗位 / 账号归属 / 板块配置 / 团队目标 / 个人感悟 / 报告归档 + 指标计算
// 全部 localStorage 持久化，范式与 communityStore 保持一致
// 说明：员工主数据在 workspace.ts 里是硬编码的，且只持久化 currentStaff。
// 因此本模块一律用「员工姓名」做关联键，避免改动既有员工模型与三处硬编码名单。

import type { BenchmarkAccount, Platform } from '../types';
import { getGroups, getActivities, getTasks, type CommunityGroup, type GroupActivity, type OpTask } from './communityStore';
import { getSessions, type LiveSession } from './liveStore';
import { getSyncedAccounts } from './syncedPool';

// ===== 岗位 =====
export type Position = 'admin' | 'douyin' | 'xiaohongshu' | 'live' | 'private' | 'intern';

export const POSITIONS: { key: Position; label: string }[] = [
  { key: 'admin', label: '管理员 / 团队管理者' },
  { key: 'douyin', label: '抖音专员' },
  { key: 'xiaohongshu', label: '小红书专员' },
  { key: 'live', label: '直播专员' },
  { key: 'private', label: '私域专员' },
  { key: 'intern', label: '实习生' },
];
export const positionLabel = (p: Position) => POSITIONS.find((x) => x.key === p)?.label || '运营';

// ===== 周期 =====
export type Period = 'daily' | 'weekly' | 'monthly';
export const PERIOD_LABEL: Record<Period, string> = { daily: '今日', weekly: '本周', monthly: '本月' };

// ===== 指标 =====
export type MetricKey =
  // 管理员
  | 'teamSize' | 'goalCompletion' | 'teamTaskRate' | 'perCapita' | 'topPerformer' | 'teamDeals' | 'dealTrend'
  // 抖音 / 小红书
  | 'accountCount' | 'postsThisPeriod' | 'totalViews' | 'avgCollects' | 'engagementRate' | 'followerGrowth' | 'hitRate'
  // 直播
  | 'sessionCount' | 'totalViewers' | 'avgOnline' | 'newFollowers' | 'wechatAdds' | 'liveGmv'
  // 私域
  | 'groupCount' | 'groupMembers' | 'weeklyNetAdd' | 'activityCount' | 'deals' | 'privateGmv' | 'conversionRate'
  // 实习生
  | 'taskRate' | 'weekTasks' | 'monthTasks' | 'joinedActivities' | 'reflectionCount';

/** 每个岗位默认展示的指标卡（管理员可在配置面板里改顺序、增减、设攻坚项） */
export const DEFAULT_BOARD: Record<Position, MetricKey[]> = {
  admin: ['teamSize', 'goalCompletion', 'teamTaskRate', 'perCapita', 'topPerformer', 'teamDeals'],
  douyin: ['accountCount', 'postsThisPeriod', 'totalViews', 'followerGrowth', 'engagementRate', 'hitRate'],
  xiaohongshu: ['accountCount', 'postsThisPeriod', 'avgCollects', 'followerGrowth', 'engagementRate', 'hitRate'],
  live: ['sessionCount', 'totalViewers', 'avgOnline', 'newFollowers', 'wechatAdds', 'liveGmv'],
  private: ['groupCount', 'groupMembers', 'weeklyNetAdd', 'activityCount', 'deals', 'privateGmv'],
  intern: ['taskRate', 'weekTasks', 'monthTasks', 'joinedActivities', 'reflectionCount'],
};

/** 每个岗位可选的指标池（配置面板里能勾选的全部） */
export const METRIC_POOL: Record<Position, MetricKey[]> = {
  admin: ['teamSize', 'goalCompletion', 'teamTaskRate', 'perCapita', 'topPerformer', 'teamDeals', 'dealTrend'],
  douyin: ['accountCount', 'postsThisPeriod', 'totalViews', 'followerGrowth', 'engagementRate', 'hitRate'],
  xiaohongshu: ['accountCount', 'postsThisPeriod', 'avgCollects', 'followerGrowth', 'engagementRate', 'hitRate'],
  live: ['sessionCount', 'totalViewers', 'avgOnline', 'newFollowers', 'wechatAdds', 'liveGmv', 'conversionRate'],
  private: ['groupCount', 'groupMembers', 'weeklyNetAdd', 'activityCount', 'deals', 'privateGmv', 'conversionRate'],
  intern: ['taskRate', 'weekTasks', 'monthTasks', 'joinedActivities', 'reflectionCount', 'groupCount'],
};

export const METRIC_LABEL: Record<MetricKey, string> = {
  teamSize: '团队人数',
  goalCompletion: '目标完成度',
  teamTaskRate: '团队任务完成',
  perCapita: '人效（人均产出）',
  topPerformer: '绩效第一',
  teamDeals: '团队成单',
  dealTrend: '成单走势',
  accountCount: '负责账号',
  postsThisPeriod: '本期发布',
  totalViews: '总播放',
  avgCollects: '篇均收藏',
  engagementRate: '互动率',
  followerGrowth: '涨粉率',
  hitRate: '爆款率',
  sessionCount: '直播场次',
  totalViewers: '总场观',
  avgOnline: '场均在线',
  newFollowers: '新增关注',
  wechatAdds: '加微数',
  liveGmv: '直播 GMV',
  groupCount: '在管群数',
  groupMembers: '群总人数',
  weeklyNetAdd: '本周净增',
  activityCount: '活动场次',
  deals: '成单数',
  privateGmv: '私域 GMV',
  conversionRate: '转化率',
  taskRate: '任务完成率',
  weekTasks: '本周任务',
  monthTasks: '本月任务',
  joinedActivities: '参与活动',
  reflectionCount: '感悟沉淀',
};

// ===== 板块配置 =====
export interface BoardConfig {
  cards: MetricKey[];
  focus: MetricKey[]; // 攻坚项
}
export interface TeamGoals {
  taskRate: number; // 团队任务完成率目标 %
  deals: number;    // 成单目标
  gmv: number;      // GMV 目标
}

// ===== 个人感悟 =====
export interface Reflection {
  id: string;
  staffName: string;
  period: Period;
  periodKey: string;  // 2026-08-29 / 2026-W35 / 2026-08
  didWell: string;    // 做对了什么
  pitfall: string;    // 踩了什么坑
  improve: string;    // 下期改一件事
  freeNote: string;   // 自由补充
  score: number;      // 自评 1-5
  createdAt: string;
  updatedAt: string;
}

// ===== 报告归档 =====
export interface ReportRecord {
  id: string;
  staffName: string;
  period: Period;
  periodKey: string;
  raw: string;      // AI 原始输出
  score: number | null;
  createdAt: string;
}

// ===== 账号归属（管理员指派）=====
export type OwnerScope = 'douyin' | 'xiaohongshu' | 'live';

const K = {
  positions: 'growth_positions_v1',
  owners: 'growth_account_owners_v1',
  board: 'growth_board_config_v1',
  goals: 'growth_team_goals_v1',
  reflections: 'growth_reflections_v1',
  reports: 'growth_reports_v1',
  focusByStaff: 'growth_focus_by_staff_v1', // 个人攻坚项（北极星指标）覆盖
};

const DEFAULT_GOALS: TeamGoals = { taskRate: 85, deals: 60, gmv: 300000 };

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
    console.error('[growthStore] 写入失败', key, e);
  }
}
const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ===== 日期工具 =====
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const diff = (x.getDay() + 6) % 7; // 周一为起点
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** 周期日期区间；offset=0 本期，1 上一期 */
export function periodRange(period: Period, offset = 0): { start: string; end: string } {
  const now = new Date();
  if (period === 'daily') {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    const s = ymd(d);
    return { start: s, end: s };
  }
  if (period === 'weekly') {
    const s0 = startOfWeek(now);
    s0.setDate(s0.getDate() - offset * 7);
    const e0 = new Date(s0);
    e0.setDate(e0.getDate() + 6);
    return { start: ymd(s0), end: ymd(e0) };
  }
  const s0 = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const e0 = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0);
  return { start: ymd(s0), end: ymd(e0) };
}

/** YYYY-MM-DD 字符串可直接字典序比较 */
const inRange = (dateStr: string, r: { start: string; end: string }) =>
  !!dateStr && dateStr >= r.start && dateStr <= r.end;

/** 周期键：daily=YYYY-MM-DD / monthly=YYYY-MM / weekly=YYYY-Www */
export function periodKeyOf(period: Period, offset = 0): string {
  const r = periodRange(period, offset);
  if (period === 'daily') return r.start;
  if (period === 'monthly') return r.start.slice(0, 7);
  const d = new Date(`${r.start}T00:00:00`);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const fDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - fDayNr + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ===== 岗位 =====
export function getPositions(): Record<string, Position> {
  return read<Record<string, Position>>(K.positions, {});
}
export function setPosition(staffName: string, position: Position) {
  write(K.positions, { ...getPositions(), [staffName]: position });
}
export function getPositionOf(staffName: string): Position {
  return getPositions()[staffName] || 'private';
}

// ===== 账号归属 =====
export function getOwners(): Record<string, Record<string, string>> {
  return read<Record<string, Record<string, string>>>(K.owners, {});
}
export function setOwner(scope: OwnerScope, accountName: string, staffName: string) {
  const all = getOwners();
  write(K.owners, { ...all, [scope]: { ...(all[scope] || {}), [accountName]: staffName } });
}
export function removeOwner(scope: OwnerScope, accountName: string) {
  const all = getOwners();
  const next = { ...(all[scope] || {}) };
  delete next[accountName];
  write(K.owners, { ...all, [scope]: next });
}
/** 某员工在某范围负责的账号名列表 */
export function ownedAccountsOf(scope: OwnerScope, staffName: string): string[] {
  const map = getOwners()[scope] || {};
  return Object.keys(map).filter((acc) => map[acc] === staffName);
}
/** 单个账号的负责人（未指派返回空串） */
export function ownerOf(scope: OwnerScope, accountName: string): string {
  return (getOwners()[scope] || {})[accountName] || '';
}
/** 全部可指派的账号名（未分配的也列出，方便管理员认领） */
export function listAssignable(scope: OwnerScope): { name: string; owner: string }[] {
  const map = getOwners()[scope] || {};
  if (scope === 'live') {
    const names = Array.from(new Set(getSessions().map((s) => s.account))).filter(Boolean);
    return names.map((n) => ({ name: n, owner: map[n] || '' }));
  }
  const platform: Platform = scope === 'douyin' ? 'douyin' : 'xiaohongshu';
  const names = getSyncedAccounts(platform).map((s) => s.account.name).filter(Boolean);
  const extra = Object.keys(map).filter((n) => !names.includes(n));
  return [...names, ...extra].map((n) => ({ name: n, owner: map[n] || '' }));
}

// ===== 板块配置 =====
export function getBoardConfig(): Record<string, BoardConfig> {
  return read<Record<string, BoardConfig>>(K.board, {});
}
export function getBoardOf(position: Position): BoardConfig {
  const all = getBoardConfig();
  const cfg = all[position];
  if (cfg && Array.isArray(cfg.cards)) return { cards: cfg.cards, focus: cfg.focus || [] };
  return { cards: DEFAULT_BOARD[position], focus: [] };
}
export function saveBoard(position: Position, cfg: BoardConfig) {
  write(K.board, { ...getBoardConfig(), [position]: cfg });
}
export function resetBoard(position: Position) {
  const all = getBoardConfig();
  delete all[position];
  write(K.board, all);
}

// ===== 个人攻坚项（北极星指标）覆盖 =====
// 每个成员可有自己独立的攻坚项；未单独设定时沿用其岗位的默认攻坚项。
export function getFocusOf(staffName: string): MetricKey[] {
  const map = read<Record<string, MetricKey[]>>(K.focusByStaff, {});
  if (map[staffName] && Array.isArray(map[staffName])) return map[staffName];
  return getBoardOf(getPositionOf(staffName)).focus; // 沿用岗位默认
}
export function setFocus(staffName: string, focus: MetricKey[]) {
  const map = read<Record<string, MetricKey[]>>(K.focusByStaff, {});
  write(K.focusByStaff, { ...map, [staffName]: focus });
}
export function resetFocus(staffName: string) {
  const map = read<Record<string, MetricKey[]>>(K.focusByStaff, {});
  delete map[staffName];
  write(K.focusByStaff, map);
}

// ===== 团队目标 =====
export function getTeamGoals(): TeamGoals {
  return read<TeamGoals>(K.goals, DEFAULT_GOALS);
}
export function saveTeamGoals(g: TeamGoals) {
  write(K.goals, g);
}

// ===== 个人感悟 =====
export function getReflections(): Reflection[] {
  return read<Reflection[]>(K.reflections, []);
}
export function getReflection(staffName: string, period: Period, periodKey: string): Reflection | null {
  return (
    getReflections().find((r) => r.staffName === staffName && r.period === period && r.periodKey === periodKey) || null
  );
}
export function listReflections(staffName: string, limit = 6): Reflection[] {
  return getReflections()
    .filter((r) => r.staffName === staffName)
    .sort((a, b) => b.periodKey.localeCompare(a.periodKey) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}
export function saveReflection(r: Omit<Reflection, 'id' | 'createdAt' | 'updatedAt'>): Reflection {
  const all = getReflections();
  const now = new Date().toISOString();
  const idx = all.findIndex(
    (x) => x.staffName === r.staffName && x.period === r.period && x.periodKey === r.periodKey
  );
  if (idx >= 0) {
    const merged: Reflection = { ...all[idx], ...r, updatedAt: now };
    all[idx] = merged;
    write(K.reflections, all);
    return merged;
  }
  const item: Reflection = { ...r, id: uid('rf'), createdAt: now, updatedAt: now };
  write(K.reflections, [...all, item]);
  return item;
}
export function removeReflection(id: string) {
  write(K.reflections, getReflections().filter((r) => r.id !== id));
}

// ===== 报告归档 =====
export function getReports(): ReportRecord[] {
  return read<ReportRecord[]>(K.reports, []);
}
export function saveReport(r: Omit<ReportRecord, 'id' | 'createdAt'>): ReportRecord {
  const item: ReportRecord = { ...r, id: uid('rp'), createdAt: new Date().toISOString() };
  const all = [item, ...getReports()].slice(0, 60); // 只留最近 60 份
  write(K.reports, all);
  return item;
}
export function removeReport(id: string) {
  write(K.reports, getReports().filter((r) => r.id !== id));
}

// ===== 指标计算 =====
export interface MetricResult {
  key: MetricKey;
  label: string;
  value: string;
  delta: string;                                   // 环比说明，无数据时为 ''
  trend: 'up' | 'down' | 'flat' | 'none';          // 正向=up（绿） 负向=down（红）
  focus: boolean;
}

interface MetricCtx {
  staffName: string;
  position: Position;
  period: Period;
  cur: { start: string; end: string };
  prev: { start: string; end: string };
  headcount: number;
  staffNames: string[];
  groups: CommunityGroup[];
  activities: GroupActivity[];
  tasks: OpTask[];
  sessions: LiveSession[];
  accounts: BenchmarkAccount[];
  goals: TeamGoals;
  reflectionCount: number;
}

const num = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0);
const pct = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;
const money = (n: number) => (n >= 10000 ? `¥${(n / 10000).toFixed(1)}万` : `¥${num(n)}`);

/** 组装指标计算上下文：按岗位把对应数据源筛到这个员工名下 */
function buildCtx(staffName: string, position: Position, period: Period, staffNames: string[]): MetricCtx {
  const allGroups = getGroups();
  const allActs = getActivities();
  const allTasks = getTasks();
  const allSessions = getSessions();

  const mine = (n: string) => n === staffName;
  // 私域/任务按数据里的负责人字段直接归属
  const groups = allGroups.filter((g) => mine(g.ownerName) || g.admins.includes(staffName));
  const activities = allActs.filter((a) => mine(a.ownerName));
  const tasks = allTasks.filter((t) => mine(t.assignee));
  // 抖音/小红书/直播按管理员指派的账号归属
  const liveOwned = new Set(ownedAccountsOf('live', staffName));
  const sessions = allSessions.filter((s) => liveOwned.has(s.account));
  const accPlatform: Platform = position === 'douyin' ? 'douyin' : 'xiaohongshu';
  const accOwned = new Set(ownedAccountsOf(accPlatform, staffName));
  const accounts = getSyncedAccounts(accPlatform)
    .map((s) => s.account)
    .filter((a) => accOwned.has(a.name));

  return {
    staffName,
    position,
    period,
    cur: periodRange(period, 0),
    prev: periodRange(period, 1),
    headcount: Math.max(1, staffNames.length),
    staffNames,
    groups,
    activities,
    tasks,
    sessions,
    accounts,
    goals: getTeamGoals(),
    reflectionCount: getReflections().filter((r) => r.staffName === staffName).length,
  };
}

/** 账号在某个时间窗内发布的帖子 */
function postsIn(acc: BenchmarkAccount, r: { start: string; end: string }) {
  return (acc.recentPosts || []).filter((p) => inRange(String(p.publishTime || '').slice(0, 10), r));
}

const CALC: Record<MetricKey, (c: MetricCtx) => { value: string; delta: string; trend: MetricResult['trend'] }> = {
  // ---- 管理员 ----
  teamSize: (c) => ({ value: `${c.staffNames.length} 人`, delta: '', trend: 'none' }),
  goalCompletion: (c) => {
    const teamTasks = getTasks().filter((t) => c.staffNames.includes(t.assignee));
    const rate = teamTasks.length ? (teamTasks.filter((t) => t.done).length / teamTasks.length) * 100 : 0;
    const teamActs = getActivities();
    const deals = teamActs.reduce((a, x) => a + (x.deals || 0), 0);
    const gmv = teamActs.reduce((a, x) => a + (x.revenue || 0), 0) + getSessions().reduce((a, s) => a + (s.gmv || 0), 0);
    const r1 = c.goals.taskRate ? Math.min(rate / c.goals.taskRate, 1) : 1;
    const r2 = c.goals.deals ? Math.min(deals / c.goals.deals, 1) : 1;
    const r3 = c.goals.gmv ? Math.min(gmv / c.goals.gmv, 1) : 1;
    const avg = ((r1 + r2 + r3) / 3) * 100;
    return {
      value: pct(avg),
      delta: `累计口径 · 目标 ${c.goals.taskRate}% / ${c.goals.deals}单 / ${money(c.goals.gmv)}`,
      trend: avg >= 80 ? 'up' : avg >= 50 ? 'flat' : 'down',
    };
  },
  teamTaskRate: (c) => {
    const all = getTasks().filter((t) => c.staffNames.includes(t.assignee));
    const inP = all.filter((t) => inRange(t.date, c.cur));
    const done = inP.filter((t) => t.done).length;
    const rate = inP.length ? (done / inP.length) * 100 : 0;
    return { value: inP.length ? `${done}/${inP.length}` : '—', delta: `完成率 ${pct(rate)}`, trend: rate >= 80 ? 'up' : rate >= 50 ? 'flat' : 'down' };
  },
  perCapita: (c) => {
    // 与「团队成单」「私域 GMV」保持同口径：只统计当前周期内产生的产出
    const gmv =
      getActivities().filter((a) => inRange(a.date, c.cur)).reduce((a, x) => a + (x.revenue || 0), 0) +
      getSessions().filter((s) => inRange(s.date, c.cur)).reduce((a, s) => a + (s.gmv || 0), 0);
    const per = gmv / c.headcount;
    return { value: money(per), delta: `${PERIOD_LABEL[c.period]}产出 ${money(gmv)} ÷ ${c.headcount} 人`, trend: 'none' };
  },
  topPerformer: (c) => {
    const all = getTasks();
    const rank = c.staffNames
      .map((n) => ({ n, done: all.filter((t) => t.assignee === n && t.done).length }))
      .sort((a, b) => b.done - a.done);
    const top = rank[0];
    return { value: top ? `${top.n} · ${top.done} 项` : '—', delta: rank[1] ? `次位 ${rank[1].n} ${rank[1].done} 项` : '', trend: 'none' };
  },
  teamDeals: (c) => {
    const acts = getActivities().filter((a) => inRange(a.date, c.cur));
    const prev = getActivities().filter((a) => inRange(a.date, c.prev));
    const cur = acts.reduce((a, x) => a + (x.deals || 0), 0);
    const old = prev.reduce((a, x) => a + (x.deals || 0), 0);
    const d = cur - old;
    return { value: `${cur} 单`, delta: old ? `环比 ${d >= 0 ? '+' : ''}${d}` : '', trend: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
  },
  dealTrend: (c) => {
    const acts = getActivities().filter((a) => inRange(a.date, c.cur));
    const cur = acts.reduce((a, x) => a + (x.deals || 0), 0);
    const old = getActivities().filter((a) => inRange(a.date, c.prev)).reduce((a, x) => a + (x.deals || 0), 0);
    return { value: `${cur} 单`, delta: old ? `上期 ${old}` : '', trend: cur >= old ? 'up' : 'down' };
  },

  // ---- 抖音 / 小红书 ----
  accountCount: (c) => ({ value: `${c.accounts.length} 个`, delta: c.accounts.length ? '' : '未指派账号', trend: c.accounts.length ? 'none' : 'down' }),
  postsThisPeriod: (c) => {
    const cur = c.accounts.reduce((a, acc) => a + postsIn(acc, c.cur).length, 0);
    const old = c.accounts.reduce((a, acc) => a + postsIn(acc, c.prev).length, 0);
    const d = cur - old;
    return { value: `${cur} 条`, delta: `上期 ${old} 条`, trend: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
  },
  totalViews: (c) => {
    const cur = c.accounts.reduce((a, acc) => a + postsIn(acc, c.cur).reduce((x, p) => x + (p.views || 0), 0), 0);
    const old = c.accounts.reduce((a, acc) => a + postsIn(acc, c.prev).reduce((x, p) => x + (p.views || 0), 0), 0);
    const d = cur - old;
    return { value: cur >= 10000 ? `${(cur / 10000).toFixed(1)}万` : `${num(cur)}`, delta: old ? `环比 ${d >= 0 ? '+' : ''}${num(d)}` : '', trend: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
  },
  avgCollects: (c) => {
    const arr = c.accounts.map((a) => a.avgCollects || 0).filter((n) => n > 0);
    const v = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return { value: num(v).toLocaleString(), delta: arr.length ? `按 ${arr.length} 个账号均值` : '暂无数据', trend: 'none' };
  },
  engagementRate: (c) => {
    const arr = c.accounts.map((a) => a.engagementRate || 0).filter((n) => n > 0);
    const v = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return { value: pct(v), delta: arr.length ? '' : '暂无数据', trend: 'none' };
  },
  followerGrowth: (c) => {
    const arr = c.accounts.map((a) => a.growthRate || 0).filter((n) => Number.isFinite(n));
    const v = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const total = c.accounts.reduce((a, x) => a + (x.followers || 0), 0);
    return { value: pct(v), delta: `粉丝总量 ${num(total).toLocaleString()}`, trend: v > 0 ? 'up' : v < 0 ? 'down' : 'flat' };
  },
  hitRate: (c) => {
    // 爆款 = 点赞量超过该账号近 30 天均值 2 倍的帖子
    let hit = 0;
    let total = 0;
    for (const acc of c.accounts) {
      const ps = postsIn(acc, c.cur);
      const avg = acc.avgLikes || 0;
      for (const p of ps) {
        total += 1;
        if (avg > 0 && (p.likes || 0) >= avg * 2) hit += 1;
      }
    }
    const r = total ? (hit / total) * 100 : 0;
    return { value: pct(r), delta: total ? `${hit}/${total} 篇` : '本期无发布', trend: 'none' };
  },

  // ---- 直播 ----
  sessionCount: (c) => {
    const cur = c.sessions.filter((s) => inRange(s.date, c.cur)).length;
    const old = c.sessions.filter((s) => inRange(s.date, c.prev)).length;
    return { value: `${cur} 场`, delta: `上期 ${old} 场`, trend: cur > old ? 'up' : cur < old ? 'down' : 'flat' };
  },
  totalViewers: (c) => {
    const cur = c.sessions.filter((s) => inRange(s.date, c.cur)).reduce((a, s) => a + (s.viewers || 0), 0);
    const old = c.sessions.filter((s) => inRange(s.date, c.prev)).reduce((a, s) => a + (s.viewers || 0), 0);
    const d = cur - old;
    return { value: cur >= 10000 ? `${(cur / 10000).toFixed(1)}万` : `${num(cur)}`, delta: old ? `环比 ${d >= 0 ? '+' : ''}${num(d)}` : '', trend: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
  },
  avgOnline: (c) => {
    const s = c.sessions.filter((x) => inRange(x.date, c.cur));
    const v = s.length ? s.reduce((a, x) => a + (x.avgOnline || 0), 0) / s.length : 0;
    return { value: num(v).toLocaleString(), delta: s.length ? `${s.length} 场均值` : '本期无直播', trend: 'none' };
  },
  newFollowers: (c) => {
    const cur = c.sessions.filter((s) => inRange(s.date, c.cur)).reduce((a, s) => a + (s.newFollowers || 0), 0);
    const old = c.sessions.filter((s) => inRange(s.date, c.prev)).reduce((a, s) => a + (s.newFollowers || 0), 0);
    const d = cur - old;
    return { value: `${num(cur)}`, delta: old ? `环比 ${d >= 0 ? '+' : ''}${num(d)}` : '', trend: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
  },
  wechatAdds: (c) => {
    const cur = c.sessions.filter((s) => inRange(s.date, c.cur)).reduce((a, s) => a + (s.wechatAdds || 0), 0);
    const old = c.sessions.filter((s) => inRange(s.date, c.prev)).reduce((a, s) => a + (s.wechatAdds || 0), 0);
    const d = cur - old;
    return { value: `${num(cur)}`, delta: old ? `环比 ${d >= 0 ? '+' : ''}${num(d)}` : '', trend: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
  },
  liveGmv: (c) => {
    const cur = c.sessions.filter((s) => inRange(s.date, c.cur)).reduce((a, s) => a + (s.gmv || 0), 0);
    const old = c.sessions.filter((s) => inRange(s.date, c.prev)).reduce((a, s) => a + (s.gmv || 0), 0);
    const d = cur - old;
    return { value: money(cur), delta: old ? `环比 ${d >= 0 ? '+' : ''}${money(Math.abs(d))}` : '', trend: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
  },

  // ---- 私域 ----
  groupCount: (c) => {
    const added = c.groups.filter((g) => inRange(g.createdAt, c.cur)).length;
    return { value: `${c.groups.length} 个`, delta: added ? `本期新建 ${added}` : '本期无新建', trend: added ? 'up' : 'flat' };
  },
  groupMembers: (c) => {
    const total = c.groups.reduce((a, g) => a + (g.members || 0), 0);
    return { value: num(total).toLocaleString(), delta: `覆盖 ${c.groups.length} 个群`, trend: 'none' };
  },
  weeklyNetAdd: (c) => {
    let net = 0;
    for (const g of c.groups) {
      const h = g.memberHistory || [];
      if (h.length >= 2) net += h[h.length - 1].count - h[h.length - 2].count;
      else if (h.length === 1 && g.members) net += 0;
    }
    return { value: `${net >= 0 ? '+' : ''}${net}`, delta: '按最近两次记录', trend: net > 0 ? 'up' : net < 0 ? 'down' : 'flat' };
  },
  activityCount: (c) => {
    const cur = c.activities.filter((a) => inRange(a.date, c.cur)).length;
    const old = c.activities.filter((a) => inRange(a.date, c.prev)).length;
    return { value: `${cur} 场`, delta: `上期 ${old} 场`, trend: cur > old ? 'up' : cur < old ? 'down' : 'flat' };
  },
  deals: (c) => {
    const cur = c.activities.filter((a) => inRange(a.date, c.cur)).reduce((a, x) => a + (x.deals || 0), 0);
    const old = c.activities.filter((a) => inRange(a.date, c.prev)).reduce((a, x) => a + (x.deals || 0), 0);
    const d = cur - old;
    return { value: `${cur} 单`, delta: old ? `环比 ${d >= 0 ? '+' : ''}${d}` : '', trend: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
  },
  privateGmv: (c) => {
    const cur = c.activities.filter((a) => inRange(a.date, c.cur)).reduce((a, x) => a + (x.revenue || 0), 0);
    const old = c.activities.filter((a) => inRange(a.date, c.prev)).reduce((a, x) => a + (x.revenue || 0), 0);
    const d = cur - old;
    return { value: money(cur), delta: old ? `环比 ${d >= 0 ? '+' : ''}${money(Math.abs(d))}` : '', trend: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
  },
  conversionRate: (c) => {
    const acts = c.activities.filter((a) => inRange(a.date, c.cur));
    const leads = acts.reduce((a, x) => a + (x.leads || 0), 0);
    const deal = acts.reduce((a, x) => a + (x.deals || 0), 0);
    const r = leads ? (deal / leads) * 100 : 0;
    return { value: pct(r), delta: leads ? `留资 ${leads} → 成单 ${deal}` : '本期无数据', trend: 'none' };
  },

  // ---- 实习生 ----
  taskRate: (c) => {
    const all = c.tasks;
    const done = all.filter((t) => t.done).length;
    if (!all.length) return { value: '—', delta: '暂无任务', trend: 'flat' };
    const r = (done / all.length) * 100;
    return { value: pct(r), delta: `${done}/${all.length} 项`, trend: r >= 80 ? 'up' : r >= 50 ? 'flat' : 'down' };
  },
  weekTasks: (c) => {
    const w = getTasks().filter((t) => t.assignee === c.staffName && isIn(t.date, periodRange('weekly', 0)));
    const done = w.filter((t) => t.done).length;
    return { value: `${done}/${w.length}`, delta: '本周', trend: done >= w.length && w.length ? 'up' : 'flat' };
  },
  monthTasks: (c) => {
    const m = getTasks().filter((t) => t.assignee === c.staffName && isIn(t.date, periodRange('monthly', 0)));
    const done = m.filter((t) => t.done).length;
    return { value: `${done}/${m.length}`, delta: '本月', trend: done >= m.length && m.length ? 'up' : 'flat' };
  },
  joinedActivities: (c) => {
    const cur = getActivities().filter((a) => a.ownerName === c.staffName && inRange(a.date, c.cur)).length;
    return { value: `${cur} 场`, delta: `负责 ${c.activities.length} 场`, trend: 'none' };
  },
  reflectionCount: (c) => ({ value: `${c.reflectionCount} 篇`, delta: '累计沉淀', trend: c.reflectionCount ? 'up' : 'flat' }),
};

// 供 CALC 内部使用的区间判定别名
function isIn(dateStr: string, r: { start: string; end: string }) {
  return inRange(dateStr, r);
}

/** 计算某员工在指定周期下的指标卡（顺序与攻坚项来自板块配置） */
export function computeBoard(
  staffName: string,
  position: Position,
  period: Period,
  staffNames: string[]
): MetricResult[] {
  const cfg = getBoardOf(position);
  const focus = getFocusOf(staffName);
  const ctx = buildCtx(staffName, position, period, staffNames);
  return cfg.cards
    .filter((k) => CALC[k])
    .map((k) => {
      let out = { value: '—', delta: '', trend: 'none' as MetricResult['trend'] };
      try {
        out = CALC[k](ctx);
      } catch (e) {
        console.error('[growthStore] 指标计算失败', k, e);
      }
      return { key: k, label: METRIC_LABEL[k], value: out.value, delta: out.delta, trend: out.trend, focus: focus.includes(k) };
    });
}

/** 把指标卡 + 感悟 + 任务拼成 AI 可读的数据摘要 */
export function buildDigest(
  staffName: string,
  position: Position,
  period: Period,
  staffNames: string[],
  cards: MetricResult[]
): string {
  const r = periodRange(period, 0);
  const tasks = getTasks().filter((t) => t.assignee === staffName && inRange(t.date, r));
  const refs = listReflections(staffName, 3);
  const lines: string[] = [];
  lines.push(`【员工】${staffName}（${positionLabel(position)}）`);
  lines.push(`【周期】${PERIOD_LABEL[period]}（${r.start} ~ ${r.end}）`);
  lines.push('');
  lines.push('【关键指标】');
  cards.forEach((c) => lines.push(`- ${c.label}：${c.value}${c.delta ? `（${c.delta}）` : ''}${c.focus ? ' ★本期攻坚项' : ''}`));
  lines.push('');
  lines.push(`【周期内任务】共 ${tasks.length} 项，完成 ${tasks.filter((t) => t.done).length} 项`);
  tasks.slice(0, 12).forEach((t) => lines.push(`  ${t.done ? '✓' : '✗'} ${t.title}（${t.date}）`));
  const pend = getTasks().filter((t) => t.assignee === staffName && !t.done);
  if (pend.length) {
    lines.push('');
    lines.push(`【长期未完成】${pend.slice(0, 8).map((t) => `${t.title}(${t.date})`).join('；')}`);
  }
  if (refs.length) {
    lines.push('');
    lines.push('【本人最近的反思记录】（务必在报告里回应这些内容，尤其是"下期要改的一件事"是否做到）');
    refs.forEach((x) => {
      lines.push(`  ${x.periodKey}（自评 ${x.score}/5）`);
      if (x.didWell) lines.push(`    做对了：${x.didWell}`);
      if (x.pitfall) lines.push(`    踩坑：${x.pitfall}`);
      if (x.improve) lines.push(`    要改的：${x.improve}`);
      if (x.freeNote) lines.push(`    补充：${x.freeNote}`);
    });
  }
  return lines.join('\n');
}

/** 各岗位的 AI 报告提示词：要求输出结构化 JSON，解析失败会降级为纯文本展示 */
export function buildReportPrompt(position: Position, period: Period, focusLabels: string[]): { system: string; user: string } {
  const focusText = focusLabels.length ? `本期攻坚项：${focusLabels.join('、')}（必须在 focus_progress 里单独给出达成情况）` : '';
  const roleDesc: Record<Position, string> = {
    admin: '你是团队管理者的经营参谋。站在负责人视角看全局，重点回答"团队该补什么方向、人效怎么提、谁该被帮一把"。',
    douyin: '你是抖音运营的带教主管，熟悉完播率、互动率、爆款结构与涨粉节奏。',
    xiaohongshu: '你是小红书运营的带教主管，熟悉笔记选题、封面钩子、收藏率与爆文结构。',
    live: '你是直播运营的带教主管，熟悉场观、停留、加微与转化的全链路。',
    private: '你是私域运营的带教主管，熟悉社群活跃、活动转化与复购。',
    intern: '你是带新人的师父，重在帮新人建立工作习惯，多鼓励、少苛责，指出具体的练习方向。',
  };
  const system =
    `${roleDesc[position]}\n` +
    '根据提供的数据生成一份复盘报告。严格要求：只输出一个 JSON 对象，不要任何解释、不要 markdown 代码块围栏。\n' +
    'JSON 结构：\n' +
    '{"headline":"一句话总评（40 字内）","score":0-100 的整数综合评分,\n' +
    '"metrics":[{"label":"指标名","value":"带单位的当前值","delta":"环比说明，没有就空字符串","trend":"up|down|flat"}],\n' +
    '"highlights":["做得好的 1-3 条，每条要带数据证据"],\n' +
    '"risks":["要注意的 1-3 条，指出具体掉在哪"],\n' +
    '"actions":[{"title":"具体动作","priority":"high|mid|low","expect":"预期改善什么指标、改善多少"}],\n' +
    '"focus_progress":"攻坚项达成情况，一句话",\n' +
    '"reflection_response":"回应本人反思记录里的内容，指出说到的改变是否做到；没有反思记录时空字符串",\n' +
    '"direction":"仅管理员岗位填写：团队下一步该补充的方向（人/能力/机制），其余岗位空字符串"}';
  const user =
    `周期：${PERIOD_LABEL[period]}\n${focusText}\n\n` +
    '下面是该成员的数据摘要：\n"""\n{DIGEST}\n"""\n\n' +
    '按上面的 JSON 结构输出报告。数据里没有的指标不要编造数字，用"暂无数据"表示。';
  return { system, user };
}
