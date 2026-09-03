// 成员与权限数据层：注册申请 → 管理员审批 → 授权（板块 / 岗位 / 技能）
// 职级体系：总监 > 经理 > 专员（数据范围由职级决定）
//
// 重要限制：本工作台是纯前端应用，数据都在 localStorage。
// 「注册 / 审批 / 授权」在本机同一浏览器内真实生效（登录门控 + 侧边栏过滤 + 路由拦截），
// 但换浏览器或换设备会回到默认状态。需要真多人协同必须上后端。

import type { Position } from './growthStore';

/** 职级：专员 → 经理 → 总监 */
export type Level = 'staff' | 'manager' | 'director';

export type MemberStatus = 'pending' | 'active' | 'rejected' | 'disabled';

export type ModuleKey =
  | 'dashboard' | 'xiaohongshu' | 'douyin' | 'live' | 'community'
  | 'operations' | 'growth' | 'skills' | 'staff' | 'accounts' | 'api' | 'reprocess';

export const MODULES: { key: ModuleKey; label: string; path: string }[] = [
  { key: 'dashboard', label: '数据总览', path: '/' },
  { key: 'xiaohongshu', label: '小红书运营', path: '/xiaohongshu' },
  { key: 'douyin', label: '抖音运营', path: '/douyin' },
  { key: 'live', label: '直播工作间', path: '/live' },
  { key: 'community', label: '私域社群', path: '/community' },
  { key: 'operations', label: '运营管理', path: '/operations' },
  { key: 'growth', label: '成长小助手', path: '/growth' },
  { key: 'skills', label: 'Skill 中心', path: '/skills' },
  { key: 'staff', label: '员工管理', path: '/staff' },
  { key: 'accounts', label: '账号管理', path: '/accounts' },
  { key: 'api', label: 'API 配置', path: '/api' },
  { key: 'reprocess', label: '二创加工', path: '/reprocess' },
];

export const ALL_MODULE_KEYS = MODULES.map((m) => m.key);

export const LEVEL_META: Record<Level, { label: string; cls: string; desc: string }> = {
  director: { label: '总监', cls: 'bg-purple-500/20 text-purple-300', desc: '全部板块 · 全员数据 · 可审批与管理' },
  manager: { label: '经理', cls: 'bg-cyan-500/20 text-cyan-300', desc: '授权板块 · 本组数据 · 可指派本组账号' },
  staff: { label: '专员', cls: 'bg-emerald-500/20 text-emerald-300', desc: '授权板块 · 仅本人数据' },
};

export const STATUS_META: Record<MemberStatus, { label: string; cls: string }> = {
  pending: { label: '待审批', cls: 'bg-amber-500/20 text-amber-300' },
  active: { label: '在职', cls: 'bg-emerald-500/20 text-emerald-300' },
  rejected: { label: '已驳回', cls: 'bg-white/5 text-white/40' },
  disabled: { label: '已停用', cls: 'bg-rose-500/20 text-rose-300' },
};

/** 按岗位给一套默认板块，审批时预填、管理员可改 */
export const DEFAULT_MODULES_BY_POSITION: Record<Position, ModuleKey[]> = {
  admin: [...ALL_MODULE_KEYS],
  douyin: ['dashboard', 'douyin', 'accounts', 'reprocess', 'growth', 'skills', 'staff'],
  xiaohongshu: ['dashboard', 'xiaohongshu', 'accounts', 'reprocess', 'growth', 'skills', 'staff'],
  live: ['dashboard', 'live', 'accounts', 'growth', 'skills', 'staff'],
  private: ['dashboard', 'community', 'operations', 'growth', 'skills', 'staff'],
  intern: ['dashboard', 'growth', 'skills', 'staff'],
};

export interface Member {
  id: string;
  name: string;
  phone: string;
  wechat: string;
  bio: string;
  level: Level;             // 职级：专员 / 经理 / 总监
  position: Position;       // 岗位（决定绩效指标口径）
  status: MemberStatus;
  modules: ModuleKey[];     // 可见板块
  skillIds: string[];       // 可用技能（关联 skillHub）
  applyNote: string;        // 注册申请说明
  appliedAt: string;
  approvedAt: string;
  approvedBy: string;
  rejectReason: string;
  createdAt: string;
  // ===== API 密钥模式 =====
  // shared = 用管理员配置的团队共用接口（默认：无 API 配置入口，但 AI 功能照常可用）
  // own    = 经申请并由管理员同意后，可自行配置接口
  apiMode: ApiMode;
  apiRequest: ApiRequestStatus; // 独立接口的申请状态
  apiRequestNote: string;       // 申请理由
  apiRequestedAt: string;
  apiHandledBy: string;         // 审批人
  apiRejectReason: string;
}

/** API 使用模式：共用团队接口 / 自带接口 */
export type ApiMode = 'shared' | 'own';
/** 独立接口申请状态：未申请 / 待审批 / 已同意 / 已驳回 */
export type ApiRequestStatus = 'none' | 'pending' | 'approved' | 'rejected';

export const API_MODE_LABEL: Record<ApiMode, string> = {
  shared: '使用团队共用接口',
  own: '使用自己的接口',
};
export const API_REQUEST_LABEL: Record<ApiRequestStatus, string> = {
  none: '未申请',
  pending: '待审批',
  approved: '已同意',
  rejected: '已驳回',
};

const K = {
  members: 'member_directory_v1',
  migrated: 'member_directory_migrated_v2', // v2：职级体系 + 登录门控
  gate: 'member_gate_v2',
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
    console.error('[memberStore] 写入失败', key, e);
  }
}
const uid = () => `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();

// ===== 初始化：不预置任何成员 =====
// 公网部署时，这里预置的成员会出现在每个陌生人的浏览器里，
// 因此不放任何姓名/岗位。名册为空时 AuthGate 走「初始化工作台」
// 引导创建第一个总监（见 AuthGate 三重兜底①），不会死锁。
function seedMembers(): Member[] {
  return [];
}

/**
 * 一次性迁移到 v2：职级体系 + 登录门控。
 * 老数据只有 role（admin/operator/intern），这里映射成 level，并把非总监成员转为待审批。
 */
export function ensureMigrated(): number {
  try {
    if (localStorage.getItem(K.migrated)) return 0;
  } catch {
    return 0;
  }
  const seeded = seedMembers();
  write(K.members, seeded);
  try {
    localStorage.setItem(K.migrated, '1');
    localStorage.setItem(K.gate, '1');
  } catch {
    /* ignore */
  }
  return seeded.length;
}

// ===== 查询 =====
/**
 * 归一化成员对象。
 * 存量数据（本次升级前写入的）没有 apiMode / apiRequest 等字段，
 * 这里补齐默认值，避免上层出现 undefined 判断分支。
 */
function normalizeMember(m: Member): Member {
  return {
    ...m,
    apiMode: m.apiMode === 'own' ? 'own' : 'shared',
    apiRequest: m.apiRequest || 'none',
    apiRequestNote: m.apiRequestNote || '',
    apiRequestedAt: m.apiRequestedAt || '',
    apiHandledBy: m.apiHandledBy || '',
    apiRejectReason: m.apiRejectReason || '',
    modules: Array.isArray(m.modules) ? m.modules : [],
    skillIds: Array.isArray(m.skillIds) ? m.skillIds : [],
  };
}

export function getMembers(): Member[] {
  ensureMigrated();
  return read<Member[]>(K.members, []).map(normalizeMember);
}
export function getMember(name: string): Member | null {
  return getMembers().find((m) => m.name === name) || null;
}
export function getMemberById(id: string): Member | null {
  return getMembers().find((m) => m.id === id) || null;
}
export function getActiveMembers(): Member[] {
  return getMembers().filter((m) => m.status === 'active');
}
/** 供 workspace.ts 组装 staffList：只有 active 的人能登录 */
export function getActiveStaff(): { id: string; name: string; level: Level }[] {
  return getActiveMembers().map((m) => ({ id: m.id, name: m.name, level: m.level }));
}
export function getDirectors(): Member[] {
  return getMembers().filter((m) => m.level === 'director' && m.status === 'active');
}

// ===== 注册 / 审批 =====
export function applyMember(input: {
  name: string; phone?: string; wechat?: string; position: Position; applyNote?: string;
}): Member {
  const t = now();
  const item: Member = {
    id: uid(),
    name: input.name.trim(),
    phone: input.phone?.trim() || '',
    wechat: input.wechat?.trim() || '',
    bio: '',
    level: 'staff',
    position: input.position,
    status: 'pending',
    modules: [],
    skillIds: [],
    applyNote: input.applyNote?.trim() || '',
    appliedAt: t,
    approvedAt: '',
    approvedBy: '',
    rejectReason: '',
    createdAt: t,
    apiMode: 'shared',
    apiRequest: 'none',
    apiRequestNote: '',
    apiRequestedAt: '',
    apiHandledBy: '',
    apiRejectReason: '',
  };
  write(K.members, [...getMembers(), item]);
  return item;
}

export function approveMember(
  id: string,
  grant: { level: Level; position: Position; modules: ModuleKey[]; skillIds: string[] },
  by: string
) {
  updateMemberRaw(id, {
    status: 'active',
    level: grant.level,
    position: grant.position,
    modules: grant.modules.length ? grant.modules : [...DEFAULT_MODULES_BY_POSITION[grant.position]],
    skillIds: grant.skillIds,
    approvedAt: now(),
    approvedBy: by,
    rejectReason: '',
  });
}

export function rejectMember(id: string, reason: string, by: string) {
  updateMemberRaw(id, { status: 'rejected', rejectReason: reason, approvedBy: by, approvedAt: now() });
}

/**
 * 改状态或直接删除前的保护：必须至少留一名在职总监，
 * 否则没人能审批新成员，系统等于锁死。
 */
export function guardLastDirector(id: string, nextStatus?: MemberStatus): { ok: boolean; reason?: string } {
  const m = getMemberById(id);
  if (!m) return { ok: true };
  const willLoseDirector =
    m.level === 'director' &&
    m.status === 'active' &&
    (nextStatus === undefined || nextStatus !== 'active');
  if (!willLoseDirector) return { ok: true };
  const others = getDirectors().filter((d) => d.id !== id);
  if (others.length === 0) {
    return { ok: false, reason: '至少要保留一名在职总监，否则没人能审批新成员，系统会锁死。请先把总监转给别人，再停用或删除。' };
  }
  return { ok: true };
}

export function setMemberStatus(id: string, status: MemberStatus): { ok: boolean; reason?: string } {
  const g = guardLastDirector(id, status);
  if (!g.ok) return g;
  updateMemberRaw(id, { status });
  return { ok: true };
}

export function removeMember(id: string): { ok: boolean; reason?: string } {
  const g = guardLastDirector(id, undefined);
  if (!g.ok) return g;
  write(K.members, getMembers().filter((m) => m.id !== id));
  return { ok: true };
}

// ===== 独立 API 接口：申请 → 管理员审批 → 开通配置入口 =====

/** 成员申请使用自己的接口 */
export function applyOwnApi(name: string, note?: string): { ok: boolean; reason?: string } {
  const m = getMember(name);
  if (!m) return { ok: false, reason: '成员不存在' };
  if (m.level === 'director') return { ok: false, reason: '管理员本身就有接口配置权限' };
  if (m.apiMode === 'own' && m.apiRequest === 'approved') {
    return { ok: false, reason: '你已经在使用自己的接口了' };
  }
  if (m.apiRequest === 'pending') return { ok: false, reason: '申请已提交，等待管理员审批' };
  updateMemberRaw(m.id, {
    apiRequest: 'pending',
    apiRequestNote: (note || '').trim(),
    apiRequestedAt: now(),
    apiRejectReason: '',
  });
  return { ok: true };
}

/** 管理员同意：切为 own 模式并开放 API 配置入口 */
export function approveOwnApi(name: string, by: string): { ok: boolean; reason?: string } {
  const m = getMember(name);
  if (!m) return { ok: false, reason: '成员不存在' };
  if (m.apiRequest !== 'pending') return { ok: false, reason: '该成员当前没有待审批的接口申请' };
  const modules: ModuleKey[] = m.modules.includes('api') ? m.modules : [...m.modules, 'api' as ModuleKey];
  updateMemberRaw(m.id, {
    apiMode: 'own',
    apiRequest: 'approved',
    modules,
    apiHandledBy: by,
    apiRejectReason: '',
  });
  return { ok: true };
}

/** 管理员驳回 */
export function rejectOwnApi(name: string, by: string, reason?: string): { ok: boolean; reason?: string } {
  const m = getMember(name);
  if (!m) return { ok: false, reason: '成员不存在' };
  if (m.apiRequest !== 'pending') return { ok: false, reason: '该成员当前没有待审批的接口申请' };
  updateMemberRaw(m.id, {
    apiRequest: 'rejected',
    apiMode: 'shared',
    apiHandledBy: by,
    apiRejectReason: (reason || '').trim(),
  });
  return { ok: true };
}

/** 收回自带接口权限：回到共用模式，并关闭配置入口 */
export function revokeOwnApi(name: string): { ok: boolean; reason?: string } {
  const m = getMember(name);
  if (!m) return { ok: false, reason: '成员不存在' };
  updateMemberRaw(m.id, {
    apiMode: 'shared',
    apiRequest: 'none',
    modules: m.modules.filter((k) => k !== 'api'),
    apiRejectReason: '',
  });
  return { ok: true };
}

/** 待审批的接口申请列表 */
export function pendingApiRequests(): Member[] {
  return getMembers().filter((m) => m.apiRequest === 'pending' && m.status === 'active');
}

export function updateMember(id: string, patch: Partial<Member>): { ok: boolean; reason?: string } {
  // 把总监降级 / 停用 / 驳回时同样要留后路
  if (patch.level && patch.level !== 'director') {
    const g = guardLastDirector(id, 'disabled');
    if (!g.ok) return g;
  }
  updateMemberRaw(id, patch);
  return { ok: true };
}

function updateMemberRaw(id: string, patch: Partial<Member>) {
  write(K.members, getMembers().map((m) => (m.id === id ? { ...m, ...patch } : m)));
}

// ===== 权限判定 =====
/** 能否看某个板块 */
export function canSee(name: string, key: ModuleKey): boolean {
  const m = getMember(name);
  if (!m || m.status !== 'active') return false;
  if (m.level === 'director') return true;
  // API 配置入口只给「已获批自带接口」的人；共用模式下隐藏入口，但 AI 功能照常可用
  if (key === 'api') return m.apiMode === 'own' && m.apiRequest === 'approved';
  return m.modules.includes(key);
}

/** 能否审批 / 授权他人（总监） */
export function canApprove(name: string): boolean {
  const m = getMember(name);
  return !!m && m.status === 'active' && m.level === 'director';
}

/**
 * 能否指派账号负责人。
 * 总监：全部账号；经理：只能把账号指派给本组（同岗位）成员。
 */
export function canAssignAccount(name: string, targetName: string): boolean {
  const me = getMember(name);
  if (!me || me.status !== 'active') return false;
  if (me.level === 'director') return true;
  if (me.level === 'manager') {
    const target = getMember(targetName);
    return !!target && target.position === me.position;
  }
  return false;
}

/** 当前身份的职级（查不到按专员处理，避免误放行） */
export function levelOf(name: string): Level {
  return getMember(name)?.level || 'staff';
}
export function isDirector(name: string): boolean {
  const m = getMember(name);
  return !!m && m.status === 'active' && m.level === 'director';
}
export function isManagerOrAbove(name: string): boolean {
  const m = getMember(name);
  return !!m && m.status === 'active' && (m.level === 'director' || m.level === 'manager');
}

/** 数据可见范围由职级决定：总监=全员，经理=本组，专员=仅本人 */
export function viewableNames(name: string, allNames: string[]): string[] {
  const me = getMember(name);
  if (!me) return [name];
  if (me.level === 'director') return allNames;
  if (me.level === 'manager') {
    const team = getMembers()
      .filter((m) => m.status === 'active' && (m.position === me.position || m.id === me.id))
      .map((m) => m.name);
    return allNames.filter((n) => team.includes(n));
  }
  return [name];
}

/** 路径 → 板块 key，用于路由守卫 */
export function moduleKeyOfPath(pathname: string): ModuleKey | null {
  if (pathname === '/' || pathname === '') return 'dashboard';
  let hit: ModuleKey | null = null;
  let best = 0;
  for (const m of MODULES) {
    if (m.path === '/') continue;
    if (pathname === m.path || pathname.startsWith(m.path + '/')) {
      if (m.path.length > best) {
        best = m.path.length;
        hit = m.key;
      }
    }
  }
  return hit;
}

export function moduleLabelOf(key: ModuleKey): string {
  return MODULES.find((m) => m.key === key)?.label || key;
}

// ===== 账号归属 =====
// 实现放在 growthStore（与账号数据读取同处），这里统一出口，避免两份实现
export {
  getOwners, setOwner, removeOwner, ownedAccountsOf, ownerOf, listAssignable,
  type OwnerScope,
} from './growthStore';
