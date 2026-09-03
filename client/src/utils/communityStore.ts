// 私域社群数据层：社群 / 群活动 / 工作计划(任务) / 漏斗目标 / 运营日历
// 全部 localStorage 持久化

// ===== 社群 =====
export type GradeSegment = '幼小' | '小学' | '初中' | '高中' | '其他';

export interface CommunityGroup {
  id: string;
  name: string;            // 群名称
  ownerName: string;       // 群主姓名
  ownerWechat: string;     // 群主微信号
  admins: string[];        // 管理员
  members: number;         // 当前群成员数
  memberHistory: { week: string; count: number }[]; // 按周人数记录（增减趋势）
  createdAt: string;       // 建群时间 YYYY-MM-DD
  grade: GradeSegment;     // 学段
  activeDays: number;      // 活跃天数
  activityCount: number;   // 活动数量
  conversions: number;     // 转化数量
  color: string;           // 渐变类名
}

// ===== 群活动 =====
export interface GroupActivity {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  date: string;            // 活动日期
  ownerName: string;       // 负责人
  status: 'applied' | 'done'; // applied=本周申请待执行 done=已执行
  featured: boolean;       // 精选案例
  // 全链路数据（前端流量 → 后期转化）
  reach: number;           // 触达人数
  participants: number;    // 参与人数
  leads: number;           // 留资/加微
  trials: number;          // 试听
  deals: number;           // 成单
  revenue: number;         // 成交金额
  note: string;            // 复盘备注
}

// ===== 任务 / 工作计划（运营管理 + 运营日报共用） =====
export interface OpTask {
  id: string;
  title: string;
  assignee: string;        // 负责人姓名（个人任务=自己）
  scope: 'personal' | 'team';
  date: string;            // 计划执行日期 YYYY-MM-DD
  done: boolean;
  priority: 'high' | 'mid' | 'low';
  visibility: 'all' | 'member'; // all=全员可看 member=仅组员（管理员）可看
  createdAt: string;
}

// ===== 海盗模型（AARRR）目标 =====
export interface FunnelStage {
  key: string;             // acquisition/activation/retention/revenue/referral
  name: string;            // 获取/激活/留存/收益/推荐
  target: number;          // 目标值
  actual: number;          // 实际值
}

// ===== 运营日历事件 =====
export interface CalEvent {
  id: string;
  date: string;
  title: string;
  type: string;
}

const K = {
  groups: 'community_groups_v1',
  activities: 'community_activities_v1',
  tasks: 'op_tasks_v1',
  funnel: 'community_funnel_v1',
  calEvents: 'community_calendar_events_v1',
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
function write(key: string, val: any) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error('[communityStore] 写入失败', key, e);
  }
}
const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ===== 预置数据 =====
const DEFAULT_GROUPS: CommunityGroup[] = [
  { id: 'g1', name: '三年级学习一群', ownerName: '待定', ownerWechat: '', admins: [], members: 486, memberHistory: [{ week: '8月3周', count: 458 }, { week: '8月4周', count: 486 }], createdAt: '2026-03-12', grade: '小学', activeDays: 26, activityCount: 12, conversions: 18, color: 'from-cyan-500 to-blue-500' },
  { id: 'g2', name: '初三全一冲复盘', ownerName: '待定', ownerWechat: '', admins: [], members: 512, memberHistory: [{ week: '8月3周', count: 505 }, { week: '8月4周', count: 512 }], createdAt: '2026-02-20', grade: '初中', activeDays: 22, activityCount: 9, conversions: 24, color: 'from-amber-500 to-orange-500' },
  { id: 'g3', name: '五年级三升四暑假复盘', ownerName: '待定', ownerWechat: '', admins: [], members: 634, memberHistory: [{ week: '8月3周', count: 596 }, { week: '8月4周', count: 634 }], createdAt: '2026-05-08', grade: '小学', activeDays: 30, activityCount: 16, conversions: 31, color: 'from-emerald-500 to-teal-500' },
  { id: 'g4', name: '五年级三升四小升初衔接', ownerName: '待定', ownerWechat: '', admins: [], members: 388, memberHistory: [{ week: '8月3周', count: 380 }, { week: '8月4周', count: 388 }], createdAt: '2026-04-15', grade: '小学', activeDays: 18, activityCount: 7, conversions: 12, color: 'from-rose-500 to-pink-500' },
  { id: 'g5', name: '六年级学习一群', ownerName: '待定', ownerWechat: '', admins: [], members: 712, memberHistory: [{ week: '8月3周', count: 688 }, { week: '8月4周', count: 712 }], createdAt: '2026-01-26', grade: '小学', activeDays: 28, activityCount: 14, conversions: 27, color: 'from-purple-500 to-indigo-500' },
  { id: 'g6', name: '高一数学思维群', ownerName: '待定', ownerWechat: '', admins: [], members: 356, memberHistory: [{ week: '8月3周', count: 340 }, { week: '8月4周', count: 356 }], createdAt: '2026-06-30', grade: '高中', activeDays: 15, activityCount: 5, conversions: 8, color: 'from-blue-500 to-cyan-500' },
];

const DEFAULT_ACTIVITIES: GroupActivity[] = [
  { id: 'a1', groupId: 'g3', groupName: '五年级三升四暑假复盘', title: '暑期学习打卡挑战', date: '2026-08-25', ownerName: '待定', status: 'done', featured: true, reach: 580, participants: 326, leads: 96, trials: 42, deals: 15, revenue: 29850, note: '打卡 7 天送 1v1 诊断，参与率超预期，家长自发晒打卡截图带来二次传播。' },
  { id: 'a2', groupId: 'g1', groupName: '三年级学习一群', title: '家长分享会：如何陪写作业不崩溃', date: '2026-08-24', ownerName: '待定', status: 'done', featured: false, reach: 420, participants: 156, leads: 38, trials: 12, deals: 4, revenue: 7960, note: '分享嘉宾口碑好，但留资环节引导偏晚。' },
  { id: 'a3', groupId: 'g5', groupName: '六年级学习一群', title: '小升初政策答疑专场', date: '2026-08-27', ownerName: '待定', status: 'applied', featured: false, reach: 0, participants: 0, leads: 0, trials: 0, deals: 0, revenue: 0, note: '' },
  { id: 'a4', groupId: 'g2', groupName: '初三全一冲复盘', title: '开学摸底测讲评直播', date: '2026-08-28', ownerName: '待定', status: 'applied', featured: false, reach: 0, participants: 0, leads: 0, trials: 0, deals: 0, revenue: 0, note: '' },
];

const DEFAULT_FUNNEL: FunnelStage[] = [
  { key: 'acquisition', name: '获取（拉新加微）', target: 2000, actual: 1860 },
  { key: 'activation', name: '激活（首次互动）', target: 1200, actual: 980 },
  { key: 'retention', name: '留存（持续活跃）', target: 800, actual: 620 },
  { key: 'revenue', name: '收益（试听成单）', target: 200, actual: 121 },
  { key: 'referral', name: '推荐（老带新）', target: 150, actual: 74 },
];

// ===== 示例种子数据 =====
// 首次使用会写入一批示例社群/活动，方便看到界面效果。
// 但这属于「凭空出现的内容」，用户可以一键清空，清空后不再回补（同 hotspotStore 的做法）。
const SEED_FLAG = 'community_seeded_v1';
function ensureSeeded() {
  try {
    if (localStorage.getItem(SEED_FLAG)) return;
  } catch {
    return;
  }
  write(K.groups, DEFAULT_GROUPS);
  write(K.activities, DEFAULT_ACTIVITIES);
  write(K.funnel, DEFAULT_FUNNEL);
  try {
    localStorage.setItem(SEED_FLAG, '1');
  } catch {
    /* ignore */
  }
}

/** 示例数据的固定 id，用于识别与清空 */
const SEED_GROUP_IDS = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];
const SEED_ACTIVITY_IDS = ['a1', 'a2', 'a3', 'a4'];
const FUNNEL_CLEARED_FLAG = 'community_funnel_cleared_v1';

/** 漏斗是否还是初始示例值（未被用户改过、也没被清理过） */
function isFunnelSeed(): boolean {
  if (localStorage.getItem(FUNNEL_CLEARED_FLAG)) return false;
  const f = getFunnel();
  return (
    f.length === DEFAULT_FUNNEL.length &&
    f.every((s, i) => s.actual === DEFAULT_FUNNEL[i].actual && s.target === DEFAULT_FUNNEL[i].target)
  );
}

/** 当前是否还残留示例数据（社群 / 活动 / 漏斗任一） */
export function hasSeedData(): boolean {
  return (
    getGroups().some((g) => SEED_GROUP_IDS.includes(g.id)) ||
    getActivities().some((a) => SEED_ACTIVITY_IDS.includes(a.id)) ||
    isFunnelSeed()
  );
}

/** 清空示例数据（只删种子项，用户自己录入的不动），返回清除条数 */
export function clearSeedData(): { groups: number; activities: number; funnel: number } {
  const gs = getGroups();
  const as = getActivities();
  const g2 = gs.filter((g) => !SEED_GROUP_IDS.includes(g.id));
  const a2 = as.filter((a) => !SEED_ACTIVITY_IDS.includes(a.id));
  write(K.groups, g2);
  write(K.activities, a2);

  // 漏斗是固定 5 阶段，示例值清空 = 目标与实际均归零，之后可自己填或用活动数据导入
  let funnel = 0;
  if (isFunnelSeed()) {
    write(K.funnel, DEFAULT_FUNNEL.map((s) => ({ ...s, target: 0, actual: 0 })));
    funnel = DEFAULT_FUNNEL.length;
  }
  try {
    localStorage.setItem(FUNNEL_CLEARED_FLAG, '1');
  } catch {
    /* ignore */
  }
  return { groups: gs.length - g2.length, activities: as.length - a2.length, funnel };
}

/**
 * 用真实活动数据填充漏斗（替代示例值）。
 * 获取=留资合计 / 激活=参与合计 / 留存=试听合计 / 收益=成单合计
 * 推荐（老带新）在活动数据里没有对应字段，保留原值由人工填写。
 */
export function fillFunnelFromActivities(): FunnelStage[] {
  const as = getActivities();
  const sum = (k: 'leads' | 'participants' | 'trials' | 'deals') =>
    as.reduce((s, a) => s + (Number(a[k]) || 0), 0);
  const cur = getFunnel();
  const byKey = new Map(cur.map((s) => [s.key, s]));
  const mapped: Record<string, number> = {
    acquisition: sum('leads'),
    activation: sum('participants'),
    retention: sum('trials'),
    revenue: sum('deals'),
  };
  const next: FunnelStage[] = DEFAULT_FUNNEL.map((seed) => {
    const old = byKey.get(seed.key);
    const v = mapped[seed.key];
    return {
      key: seed.key,
      name: seed.name,
      target: old?.target || 0,
      // 推荐阶段无对应数据，保留用户已填的值
      actual: v === undefined ? (old?.actual || 0) : v,
    };
  });
  write(K.funnel, next);
  return next;
}

// ===== 社群 CRUD =====
export function getGroups(): CommunityGroup[] {
  ensureSeeded();
  return read<CommunityGroup[]>(K.groups, []);
}
export function addGroup(g: Omit<CommunityGroup, 'id'>): CommunityGroup {
  const item: CommunityGroup = { ...g, id: uid('grp') };
  write(K.groups, [item, ...getGroups()]);
  return item;
}
export function updateGroup(id: string, patch: Partial<CommunityGroup>) {
  write(K.groups, getGroups().map((g) => (g.id === id ? { ...g, ...patch } : g)));
}
export function removeGroup(id: string) {
  write(K.groups, getGroups().filter((g) => g.id !== id));
}
// 按周更新群人数（写入历史 + 更新当前值）
export function updateGroupMembers(id: string, week: string, count: number) {
  const groups = getGroups();
  write(
    K.groups,
    groups.map((g) => {
      if (g.id !== id) return g;
      const history = [...g.memberHistory.filter((h) => h.week !== week), { week, count }].slice(-12);
      return { ...g, members: count, memberHistory: history };
    })
  );
}

// ===== 群活动 CRUD =====
export function getActivities(): GroupActivity[] {
  ensureSeeded();
  return read<GroupActivity[]>(K.activities, []);
}
export function addActivity(a: Omit<GroupActivity, 'id'>): GroupActivity {
  const item: GroupActivity = { ...a, id: uid('act') };
  write(K.activities, [item, ...getActivities()]);
  return item;
}
export function updateActivity(id: string, patch: Partial<GroupActivity>) {
  write(K.activities, getActivities().map((a) => (a.id === id ? { ...a, ...patch } : a)));
}
export function removeActivity(id: string) {
  write(K.activities, getActivities().filter((a) => a.id !== id));
}

// ===== 任务 CRUD =====
export function getTasks(): OpTask[] {
  return read<OpTask[]>(K.tasks, []);
}
export function addTask(t: Omit<OpTask, 'id' | 'createdAt'>): OpTask {
  const item: OpTask = { ...t, id: uid('task'), createdAt: new Date().toISOString() };
  write(K.tasks, [item, ...getTasks()]);
  return item;
}
export function updateTask(id: string, patch: Partial<OpTask>) {
  write(K.tasks, getTasks().map((t) => (t.id === id ? { ...t, ...patch } : t)));
}
export function removeTask(id: string) {
  write(K.tasks, getTasks().filter((t) => t.id !== id));
}

// ===== 漏斗目标 =====
export function getFunnel(): FunnelStage[] {
  ensureSeeded();
  return read<FunnelStage[]>(K.funnel, []);
}
export function saveFunnel(list: FunnelStage[]) {
  write(K.funnel, list);
}

// ===== 运营日历 =====
export function getCalEvents(): CalEvent[] {
  return read<CalEvent[]>(K.calEvents, []);
}
export function addCalEvent(e: Omit<CalEvent, 'id'>): CalEvent {
  const item: CalEvent = { ...e, id: uid('cal') };
  write(K.calEvents, [...getCalEvents(), item]);
  return item;
}
export function updateCalEvent(id: string, patch: Partial<CalEvent>) {
  write(K.calEvents, getCalEvents().map((e) => (e.id === id ? { ...e, ...patch } : e)));
}
export function removeCalEvent(id: string) {
  write(K.calEvents, getCalEvents().filter((e) => e.id !== id));
}

// ===== 改名迁移：把旧名字在任务/社群/活动里的引用全部替换为新名字 =====
// 用户改名后，"我的任务""我负责的社群"等按名字匹配的数据要实时跟着变
export function renameStaffReferences(oldName: string, newName: string): { tasks: number; groups: number; activities: number } {
  const oldN = oldName.trim();
  const newN = newName.trim();
  if (!oldN || !newN || oldN === newN) return { tasks: 0, groups: 0, activities: 0 };
  let tasks = 0;
  let groups = 0;
  let activities = 0;
  // 任务负责人
  const taskList = getTasks().map((t) => {
    if (t.assignee === oldN) {
      tasks++;
      return { ...t, assignee: newN };
    }
    return t;
  });
  if (tasks > 0) write(K.tasks, taskList);
  // 社群群主/管理员
  const groupList = getGroups().map((g) => {
    const hit = g.ownerName === oldN || g.admins.includes(oldN);
    if (hit) {
      groups++;
      return {
        ...g,
        ownerName: g.ownerName === oldN ? newN : g.ownerName,
        admins: g.admins.map((a) => (a === oldN ? newN : a)),
      };
    }
    return g;
  });
  if (groups > 0) write(K.groups, groupList);
  // 活动负责人
  const actList = getActivities().map((a) => {
    if (a.ownerName === oldN) {
      activities++;
      return { ...a, ownerName: newN };
    }
    return a;
  });
  if (activities > 0) write(K.activities, actList);
  return { tasks, groups, activities };
}

// ===== 统计辅助 =====
export function isThisMonth(dateStr: string): boolean {
  if (!dateStr) return false;
  const now = new Date();
  return dateStr.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
}
export function isThisWeek(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // 周一
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  return d >= weekStart && d < weekEnd;
}
