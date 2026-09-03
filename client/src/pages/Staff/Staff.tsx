// 员工管理：按角色分流
// 管理员：团队总览 / 注册审批 / 周报汇总 / 重点任务
// 专员与实习生：我的绩效（周·月）/ 我的板块与技能 / 我的任务
//
// 权限说明：注册、审批、授权都真实生效（侧边栏过滤 + 路由拦截），
// 但数据存在 localStorage，只在当前浏览器内有效，换设备会回到默认。

import React, { useEffect, useMemo, useState } from 'react';
import {
  UserCog, UserPlus, ShieldCheck, Clock, Users, Briefcase, Check, X, Lock, Settings2, KeyRound,
  FileText, Sparkles, Target, Trash2, Edit3, ChevronRight,
} from 'lucide-react';
import GlassCard from '../../components/GlassCard';
import Modal from '../../components/Modal';
import { useWorkspace } from '../../store/workspace';
import { getTasks } from '../../utils/communityStore';
import {
  POSITIONS, positionLabel, PERIOD_LABEL, computeBoard, periodKeyOf, periodRange,
  getPositions, setPosition, getPositionOf,
  getOwners, setOwner, removeOwner, listAssignable,
  type Position, type Period, type OwnerScope,
} from '../../utils/growthStore';
import {
  getMembers, getMember, applyMember, approveMember, rejectMember, setMemberStatus,
  updateMember, removeMember, canSee, DEFAULT_MODULES_BY_POSITION, MODULES, ALL_MODULE_KEYS,
  STATUS_META, LEVEL_META, isDirector, approveOwnApi, rejectOwnApi, revokeOwnApi,
  type Member, type MemberStatus, type ModuleKey, type Level,
} from '../../utils/memberStore';
import { getEntries, type SkillEntry } from '../../utils/skillHub';
import { setPassword, hasPassword } from '../../utils/authStore';
import { getReflection, getReports } from '../../utils/growthStore';

type ToastMsg = { type: 'success' | 'error' | 'info'; message: string } | null;
type AdminTab = 'overview' | 'approval' | 'api' | 'weekly' | 'tasks' | 'assignment';

interface TaskItem { id: string; tag: string; text: string; priority: 'rose' | 'amber' | 'cyan'; done: boolean }

const TASKS_KEY = 'staff_tasks_v1';
// 职级：专员 → 经理 → 总监

function loadTasks(): TaskItem[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
  } catch { /* ignore */ }
  return [];
}
function saveTasks(list: TaskItem[]) {
  try { localStorage.setItem(TASKS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

const inRange = (d: string, r: { start: string; end: string }) => !!d && d >= r.start && d <= r.end;

function taskStatOf(name: string, period: Period) {
  const r = periodRange(period, 0);
  const list = getTasks().filter((t) => t.assignee === name && inRange(t.date, r));
  return { done: list.filter((t) => t.done).length, total: list.length };
}
function overdueOf(name: string) {
  const today = new Date().toISOString().slice(0, 10);
  return getTasks().filter((t) => t.assignee === name && !t.done && t.date < today).length;
}

const Staff: React.FC = () => {
  const { currentStaff, staffList } = useWorkspace();
  const staffNames = staffList.map((s) => s.name);
  const isAdmin = isDirector(currentStaff.name);

  const [members, setMembers] = useState<Member[]>(() => getMembers());
  const [toast, setToast] = useState<ToastMsg>(null);
  const [tab, setTab] = useState<AdminTab>('overview');
  const [perfPeriod, setPerfPeriod] = useState<Period>('weekly');
  const [tasks, setTasks] = useState<TaskItem[]>(loadTasks);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState<{ tag: string; text: string; priority: 'rose' | 'amber' | 'cyan' }>({ tag: '常规', text: '', priority: 'cyan' });

  // 岗位与归属（从成长小助手「北极星指标」迁入）
  const [positions, setPositions] = useState<Record<string, Position>>(() => getPositions());
  const [scope, setScope] = useState<OwnerScope>('douyin');
  const [owners, setOwners] = useState(() => getOwners());
  const assignable = useMemo(() => listAssignable(scope), [scope, owners]);

  // 注册申请
  const pendingApi = members.filter((m) => m.apiRequest === 'pending' && m.status === 'active');
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyForm, setApplyForm] = useState({ name: '', phone: '', wechat: '', position: 'private' as Position, note: '' });

  // 授权弹窗（审批同意 / 编辑成员共用）
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantTarget, setGrantTarget] = useState<Member | null>(null);
  const [grantForm, setGrantForm] = useState<{
    level: Level; position: Position; modules: ModuleKey[];
    skillIds: string[];
  }>({ level: 'staff', position: 'private', modules: [], skillIds: [] });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // 重置密码（仅总监）
  const [pwOpen, setPwOpen] = useState(false);
  const [pwTarget, setPwTarget] = useState<Member | null>(null);
  const [pwForm, setPwForm] = useState({ password: '', confirm: '' });

  const me = getMember(currentStaff.name);
  const weekKey = periodKeyOf('weekly');
  const skills = useMemo(() => getEntries(), [members]);

  useEffect(() => { setMembers(getMembers()); }, []);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2800);
  };
  const refresh = () => setMembers(getMembers());

  const pending = members.filter((m) => m.status === 'pending');
  const active = members.filter((m) => m.status === 'active');
  const myPosition: Position = me?.position || 'private';

  // 团队本周任务完成率
  const teamTaskRate = useMemo(() => {
    const r = periodRange('weekly', 0);
    const list = getTasks().filter((t) => staffNames.includes(t.assignee) && inRange(t.date, r));
    return list.length ? (list.filter((t) => t.done).length / list.length) * 100 : 0;
  }, [staffNames, members]);

  // 周报汇总：直接读成长小助手的感悟与报告归档，不用另填表
  const weeklyRows = useMemo(
    () =>
      active.map((m) => ({
        name: m.name,
        position: m.position,
        reflection: !!getReflection(m.name, 'weekly', weekKey),
        report: getReports().some((r) => r.staffName === m.name && r.period === 'weekly' && r.periodKey === weekKey),
        ...taskStatOf(m.name, 'weekly'),
        overdue: overdueOf(m.name),
      })),
    [active, members, weekKey]
  );

  // ===== 注册申请 =====
  const submitApply = () => {
    if (!applyForm.name.trim()) {
      showToast('error', '请填写姓名');
      return;
    }
    if (members.some((m) => m.name === applyForm.name.trim() && m.status !== 'rejected')) {
      showToast('error', '已有同名成员在册或待审批');
      return;
    }
    applyMember({
      name: applyForm.name,
      phone: applyForm.phone,
      wechat: applyForm.wechat,
      position: applyForm.position,
      applyNote: applyForm.note,
    });
    refresh();
    setApplyOpen(false);
    setApplyForm({ name: '', phone: '', wechat: '', position: 'private', note: '' });
    showToast('success', '申请已提交，需管理员在「注册审批」里通过后才能登录');
  };

  // ===== 授权 =====
  const openGrant = (m: Member) => {
    setGrantTarget(m);
    setGrantForm({
      level: m.level,
      position: m.position,
      modules: m.modules.length ? [...m.modules] : [...DEFAULT_MODULES_BY_POSITION[m.position]],
      skillIds: [...m.skillIds],
    });
    setGrantOpen(true);
  };
  const saveGrant = () => {
    if (!grantTarget) return;
    if (grantForm.modules.length === 0) {
      showToast('error', '至少勾选一个板块');
      return;
    }
    approveMember(grantTarget.id, grantForm, currentStaff.name);
    if (grantTarget.status === 'active') {
      // 已是成员时走同一套授权，状态不变
      const r = setMemberStatus(grantTarget.id, 'active');
      if (!r.ok) return showToast('error', r.reason || '操作被拒绝');
    }
    refresh();
    setGrantOpen(false);
    showToast('success', `${grantTarget.name} 已授权：${grantForm.modules.length} 个板块 · ${grantForm.skillIds.length} 个技能`);
  };
  const doReject = () => {
    if (!grantTarget) return;
    rejectMember(grantTarget.id, rejectReason.trim() || '未说明', currentStaff.name);
    refresh();
    setRejectOpen(false);
    setRejectReason('');
    showToast('success', '已驳回');
  };

  const submitResetPw = async () => {
    if (!pwTarget) return;
    if (pwForm.password.length < 6) {
      showToast('error', '密码至少 6 位');
      return;
    }
    if (pwForm.password !== pwForm.confirm) {
      showToast('error', '两次输入的密码不一致');
      return;
    }
    await setPassword(pwTarget.name, pwForm.password);
    setPwOpen(false);
    setPwForm({ password: '', confirm: '' });
    showToast('success', `${pwTarget.name} 的密码已重置，让他用新密码登录`);
  };

  // ===== 重点任务 ===
  const updateTasks = (next: TaskItem[]) => { setTasks(next); saveTasks(next); };

  // 专员绩效卡（复用成长小助手同一套算法）
  const myCards = me ? computeBoard(currentStaff.name, myPosition, perfPeriod, staffNames) : [];

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-20 right-6 z-50">
          <div className={`px-4 py-2.5 rounded-lg shadow-2xl text-sm border ${
            toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
            : toast.type === 'error' ? 'bg-rose-500/20 text-rose-200 border-rose-500/30'
            : 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30'
          }`}>{toast.message}</div>
        </div>
      )}

      {/* 头部 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-white text-2xl font-bold flex items-center gap-2">
            <Briefcase className="w-7 h-7 text-purple-400" /> 员工管理
          </h2>
          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
            {isAdmin ? '管理员视角' : positionLabel(myPosition)}
          </span>
          {isAdmin && pending.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">{pending.length} 人待审批</span>
          )}
        </div>
        <button
          onClick={() => setApplyOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-medium"
        >
          <UserPlus className="w-3.5 h-3.5" /> 注册申请
        </button>
      </div>

      {/* 权限说明 */}
      <GlassCard hoverable={false}>
        <div className="flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
          <p className="text-xs text-white/70 leading-relaxed">
            注册 → 管理员审批 → 开通板块与技能，这套流程在本机浏览器内真实生效（未授权的板块不显示，手输地址也会被拦）。
            但数据存在浏览器本地，<span className="text-cyan-300">换设备或换浏览器会回到默认状态</span>，多人跨设备协同需要上后端。
          </p>
        </div>
      </GlassCard>

      {isAdmin ? (
        <>
          {/* 管理员指标 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: '团队成员', value: `${active.length} 人`, sub: `在册 ${members.length} 人` },
              { label: '本周周报', value: `${weeklyRows.filter((r) => r.reflection).length}/${active.length}`, sub: weeklyRows.filter((r) => !r.reflection).map((r) => r.name).join('、') || '全部已交' },
              { label: '团队任务完成', value: `${Math.round(teamTaskRate)}%`, sub: '本周口径' },
              { label: '待办任务', value: `${staffNames.reduce((a, n) => a + overdueOf(n), 0)} 项`, sub: '逾期未完成' },
            ].map((c) => (
              <GlassCard key={c.label} hoverable={false} className="!p-3">
                <p className="text-[10px] text-white/50 mb-1">{c.label}</p>
                <p className="text-white font-bold text-xl leading-none">{c.value}</p>
                <p className="text-[10px] text-white/35 mt-1.5 truncate">{c.sub}</p>
              </GlassCard>
            ))}
          </div>

          {/* 管理员 Tab */}
          <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10 w-fit flex-wrap">
            {([
              ['overview', '团队总览'],
              ['approval', `注册审批${pending.length ? ` ${pending.length}` : ''}`],
              ['api', `接口申请${pendingApi.length ? ` ${pendingApi.length}` : ''}`],
              ['weekly', '周报汇总'],
              ['tasks', '重点任务'],
              ['assignment', '岗位与归属'],
            ] as [AdminTab, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                  tab === k ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
                }`}
              >{label}</button>
            ))}
          </div>

          {/* 团队总览 */}
          {tab === 'overview' && (
            <GlassCard hoverable={false}>
              <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" /> 在册成员（{members.length}）
              </h3>
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 flex-wrap">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-xs font-semibold text-white shrink-0">
                      {m.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-white font-medium text-sm">{m.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_META[m.status].cls}`}>{STATUS_META[m.status].label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">{positionLabel(m.position)}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/40">{LEVEL_META[m.level].label}</span>
                      </div>
                      <p className="text-[10px] text-white/40">
                        {m.modules.length} 个板块 · {m.skillIds.length} 个技能 · {LEVEL_META[m.level].desc}
                        {m.status === 'active' && ` · 本周任务 ${taskStatOf(m.name, 'weekly').done}/${taskStatOf(m.name, 'weekly').total}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {m.status === 'pending' && (
                        <button onClick={() => openGrant(m)} className="text-[11px] px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300">审批</button>
                      )}
                      {m.status === 'active' && (
                        <>
                          <button onClick={() => openGrant(m)} className="p-1.5 rounded bg-white/5 text-white/50 hover:text-white" title="改授权">
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => { setPwTarget(m); setPwForm({ password: '', confirm: '' }); setPwOpen(true); }}
                              className="text-[11px] px-2 py-1 rounded bg-white/5 text-white/50 hover:text-cyan-300"
                              title={hasPassword(m.name) ? '重置登录密码' : '尚未设置密码，立即设置'}
                            >{hasPassword(m.name) ? '重置密码' : '设密码'}</button>
                          )}
                          <button
                            onClick={() => { const r = setMemberStatus(m.id, 'disabled'); if (!r.ok) return showToast('error', r.reason || '操作被拒绝'); refresh(); showToast('success', `${m.name} 已停用`); }}
                            className="text-[11px] px-2 py-1 rounded bg-white/5 text-white/50 hover:text-rose-300"
                          >停用</button>
                        </>
                      )}
                      {m.status === 'disabled' && (
                        <button
                          onClick={() => { setMemberStatus(m.id, 'active'); refresh(); showToast('success', `${m.name} 已恢复`); }}
                          className="text-[11px] px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300"
                        >启用</button>
                      )}
                      <button
                        onClick={() => { if (!window.confirm(`删除成员「${m.name}」？`)) return; const r = removeMember(m.id); if (!r.ok) return showToast('error', r.reason || '操作被拒绝'); refresh(); }}
                        className="p-1.5 rounded bg-white/5 text-rose-300/50 hover:text-rose-300"
                      ><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
                {members.length === 0 && <p className="text-xs text-white/30 py-8 text-center">还没有成员，点右上角「注册申请」</p>}
              </div>
            </GlassCard>
          )}

          {/* 注册审批 */}
          {tab === 'approval' && (
            <GlassCard hoverable={false}>
              <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" /> 待审批（{pending.length}）
              </h3>
              {pending.length === 0 ? (
                <p className="text-xs text-white/30 py-8 text-center">没有待审批的申请</p>
              ) : (
                <div className="space-y-2">
                  {pending.map((m) => (
                    <div key={m.id} className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-white font-medium text-sm">{m.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">申请 {positionLabel(m.position)}</span>
                        <span className="text-[10px] text-white/30 ml-auto">{m.appliedAt.slice(0, 16).replace('T', ' ')}</span>
                      </div>
                      <p className="text-[11px] text-white/50 mb-2.5">
                        {[m.phone, m.wechat].filter(Boolean).join(' · ') || '未留联系方式'}
                        {m.applyNote && ` — ${m.applyNote}`}
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => openGrant(m)} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-medium">
                          同意并授权
                        </button>
                        <button
                          onClick={() => { setGrantTarget(m); setRejectReason(''); setRejectOpen(true); }}
                          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs hover:text-white"
                        >驳回</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {members.filter((m) => m.status === 'rejected').length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/5">
                  <p className="text-[10px] text-white/35 mb-2">历史驳回</p>
                  {members.filter((m) => m.status === 'rejected').map((m) => (
                    <p key={m.id} className="text-[11px] text-white/40 mb-1">
                      {m.name} · {m.rejectReason}
                      <button onClick={() => { const r = setMemberStatus(m.id, 'pending'); if (!r.ok) return showToast('error', r.reason || '操作被拒绝'); refresh(); }} className="ml-2 text-cyan-300/60 hover:text-cyan-300">恢复待审</button>
                    </p>
                  ))}
                </div>
              )}
            </GlassCard>
          )}

          {/* 接口申请：成员申请使用自己的 AI 接口，管理员同意后才有配置入口 */}
          {tab === 'api' && (
            <GlassCard hoverable={false}>
              <h3 className="text-white font-medium text-sm mb-1 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-cyan-400" /> 独立接口申请（{pendingApi.length}）
              </h3>
              <p className="text-[10px] text-white/40 mb-3">
                同意后该成员可在「API 配置」页配置自己的接口；不同意则继续使用你在 API 配置页设置的团队共用接口。
              </p>
              {pendingApi.length === 0 ? (
                <p className="text-xs text-white/30 py-6 text-center">暂无待审批的接口申请</p>
              ) : (
                <div className="space-y-2">
                  {pendingApi.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 flex-wrap">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white text-xs font-medium shrink-0">
                        {m.name.slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium">
                          {m.name}
                          <span className="text-[10px] text-white/40 ml-2">
                            {LEVEL_META[m.level].label} · {positionLabel(m.position)}
                          </span>
                        </p>
                        <p className="text-[10px] text-white/40 mt-0.5">
                          申请理由：{m.apiRequestNote || '（未填写）'}
                        </p>
                        <p className="text-[10px] text-white/25 mt-0.5">提交于 {m.apiRequestedAt.slice(0, 16).replace('T', ' ')}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            const r = approveOwnApi(m.name, currentStaff.name);
                            if (!r.ok) return showToast('error', r.reason || '操作失败');
                            refresh();
                            showToast('success', `已同意 ${m.name} 使用自己的接口`);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs hover:bg-emerald-500/25"
                        >
                          同意
                        </button>
                        <button
                          onClick={() => {
                            const reason = window.prompt(`驳回 ${m.name} 的接口申请，说明原因（选填）`);
                            if (reason === null) return;
                            const r = rejectOwnApi(m.name, currentStaff.name, reason);
                            if (!r.ok) return showToast('error', r.reason || '操作失败');
                            refresh();
                            showToast('success', `已驳回 ${m.name} 的申请`);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-rose-300/70 text-xs hover:text-rose-300"
                        >
                          驳回
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 已开通自带接口的成员：可收回 */}
              {(() => {
                const owned = members.filter((m) => m.apiMode === 'own' && m.apiRequest === 'approved' && m.status === 'active');
                if (owned.length === 0) return null;
                return (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <p className="text-[11px] text-white/50 mb-2">已开通自带接口（{owned.length} 人）</p>
                    <div className="space-y-1.5">
                      {owned.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 flex-wrap">
                          <span className="text-xs text-white flex-1 min-w-0">
                            {m.name}
                            <span className="text-[10px] text-white/35 ml-2">{LEVEL_META[m.level].label}</span>
                          </span>
                          <button
                            onClick={() => {
                              if (!window.confirm(`收回 ${m.name} 的独立接口权限？他将重新使用团队共用接口，且配置入口关闭。`)) return;
                              revokeOwnApi(m.name);
                              refresh();
                              showToast('info', `已收回 ${m.name} 的独立接口权限`);
                            }}
                            className="shrink-0 px-2 py-1 rounded bg-white/5 text-white/50 hover:text-rose-300 text-[10px]"
                          >
                            收回
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </GlassCard>
          )}

          {/* 周报汇总 */}
          {tab === 'weekly' && (
            <GlassCard hoverable={false}>
              <h3 className="text-white font-medium text-sm mb-1 flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" /> 本周周报汇总
              </h3>
              <p className="text-[10px] text-white/35 mb-3">
                周期 {weekKey} · 数据直接来自「成长小助手」的个人感悟与复盘报告归档，不用另外填表
              </p>
              <div className="space-y-1.5">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-[10px] text-white/35 pb-1.5 border-b border-white/5">
                  <span>成员</span><span>本周感悟</span><span>AI 复盘</span><span>任务完成</span>
                </div>
                {weeklyRows.map((r) => (
                  <div key={r.name} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center text-xs py-1">
                    <span className="text-white truncate">{r.name}<span className="text-white/30 ml-1.5">{positionLabel(r.position)}</span></span>
                    <span className={r.reflection ? 'text-emerald-300' : 'text-rose-300'}>{r.reflection ? '已交' : '未交'}</span>
                    <span className={r.report ? 'text-emerald-300' : 'text-white/40'}>{r.report ? '已生成' : '未生成'}</span>
                    <span className="text-white/60">{r.done}/{r.total}{r.overdue > 0 && <span className="text-rose-300 ml-1">逾期{r.overdue}</span>}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* 重点任务 */}
          {tab === 'tasks' && (
            <GlassCard hoverable={false}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-medium text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" /> 重点任务
                  <span className="text-xs text-white/40 font-normal">({tasks.filter((t) => t.done).length}/{tasks.length} 已完成)</span>
                </h3>
                <button onClick={() => setShowAddTask(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs hover:text-white">
                  <span className="text-sm leading-none">+</span> 添加任务
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {tasks.map((t) => (
                  <div key={t.id} className={`p-3 rounded-lg flex items-center gap-2 ${t.done ? 'bg-emerald-500/5 opacity-70' : 'bg-white/5'}`}>
                    <button
                      onClick={() => updateTasks(tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${t.done ? 'bg-emerald-500 text-white' : 'border border-white/30'}`}
                    >{t.done && <Check className="w-3 h-3" />}</button>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                      t.priority === 'rose' ? 'bg-rose-500/20 text-rose-300' : t.priority === 'amber' ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'
                    }`}>{t.tag}</span>
                    <span className={`text-sm flex-1 ${t.done ? 'text-white/40 line-through' : 'text-white/80'}`}>{t.text}</span>
                    <button onClick={() => updateTasks(tasks.filter((x) => x.id !== t.id))} className="text-white/30 hover:text-rose-400 shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {tasks.length === 0 && <p className="col-span-full text-center py-6 text-white/40 text-sm">暂无任务</p>}
              </div>
              {showAddTask && (
                <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2 flex-wrap">
                  <select value={newTask.tag} onChange={(e) => setNewTask({ ...newTask, tag: e.target.value })} className="h-9 px-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white">
                    <option>紧急</option><option>本周</option><option>常规</option>
                  </select>
                  <input
                    value={newTask.text}
                    onChange={(e) => setNewTask({ ...newTask, text: e.target.value })}
                    placeholder="任务内容..."
                    className="flex-1 min-w-[200px] h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
                  />
                  <button
                    onClick={() => {
                      if (!newTask.text.trim()) return;
                      updateTasks([...tasks, { id: `t${Date.now()}`, tag: newTask.tag, text: newTask.text.trim(), priority: newTask.priority, done: false }]);
                      setNewTask({ tag: '常规', text: '', priority: 'cyan' });
                      setShowAddTask(false);
                    }}
                    className="h-9 px-3 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-medium"
                  >保存</button>
                  <button onClick={() => setShowAddTask(false)} className="h-9 px-2 rounded-lg text-white/40 hover:text-white/80">取消</button>
                </div>
              )}
            </GlassCard>
          )}

          {/* 岗位与归属（迁入自成长小助手「北极星指标」） */}
          {tab === 'assignment' && (
            <div className="space-y-3">
              {/* 成员岗位指派 */}
              <GlassCard hoverable={false}>
                <h3 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" /> 成员岗位指派
                </h3>
                <div className="space-y-2">
                  {staffList.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/5">
                      <span className="text-sm text-white w-20 shrink-0 truncate">{s.name}</span>
                      <select
                        value={getPositionOf(s.name)}
                        onChange={(e) => {
                          setPosition(s.name, e.target.value as Position);
                          setPositions(getPositions());
                          showToast('success', `${s.name} 已设为${positionLabel(e.target.value as Position)}`);
                        }}
                        className="flex-1 h-9 px-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white"
                      >
                        {POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-white/30 mt-2">岗位决定该成员看到哪套指标卡与报告视角。建议总监保持「管理员 / 团队管理者」。</p>
              </GlassCard>

              {/* 账号归属指派 */}
              <GlassCard hoverable={false}>
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <h3 className="text-white text-sm font-medium flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" /> 账号归属指派
                  </h3>
                  <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
                    {([['douyin', '抖音'], ['xiaohongshu', '小红书'], ['live', '直播']] as [OwnerScope, string][]).map(([k, label]) => (
                      <button
                        key={k}
                        onClick={() => setScope(k)}
                        className={`px-3 py-1 rounded-md text-[11px] ${scope === k ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {assignable.length === 0 ? (
                  <p className="text-xs text-white/30 py-6 text-center">
                    暂无可指派的账号。请先到对应页面导入数据（抖音/小红书做一次同步，直播导入场次表）。
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin">
                    {assignable.map((a) => (
                      <div key={a.name} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                        <span className="text-xs text-white flex-1 min-w-0 truncate">{a.name}</span>
                        <select
                          value={a.owner}
                          onChange={(e) => {
                            if (e.target.value) setOwner(scope, a.name, e.target.value);
                            else removeOwner(scope, a.name);
                            setOwners(getOwners());
                          }}
                          className="h-8 px-2 rounded-lg bg-white/5 border border-white/10 text-[11px] text-white max-w-[150px]"
                        >
                          <option value="">未指派</option>
                          {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-white/30 mt-2">
                  抖音 / 小红书 / 直播的数据本身没有负责人字段，指派后对应专员的指标卡才会算出自己的数。
                </p>
              </GlassCard>
            </div>
          )}
        </>
      ) : (
        <>
          {/* 专员 / 实习生视角 */}
          <GlassCard hoverable={false}>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-base font-semibold text-white shrink-0">
                {currentStaff.name.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <p className="text-white font-medium">{currentStaff.name} · {positionLabel(myPosition)}</p>
                <p className="text-[11px] text-white/40 mt-0.5">
                  权限：{me?.modules.filter((k) => canSee(currentStaff.name, k)).length || 0} 个板块 · {me?.skillIds.length || 0} 个技能 · {me ? LEVEL_META[me.level].desc : ''}
                </p>
              </div>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                {me ? STATUS_META[me.status].label : '未登记'}
              </span>
            </div>
            {!me && (
              <p className="text-[11px] text-amber-300/70 mt-3">
                你还没有在成员名册里，点右上角「注册申请」提交，管理员通过后会开通对应板块。
              </p>
            )}
          </GlassCard>

          {/* 我的绩效 */}
          {me && (
            <GlassCard hoverable={false}>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h3 className="text-white font-medium text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-fuchsia-400" /> 我的绩效
                </h3>
                <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10 ml-auto">
                  {(['weekly', 'monthly'] as Period[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPerfPeriod(p)}
                      className={`px-3 py-1 rounded-md text-[11px] ${perfPeriod === p ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}
                    >{PERIOD_LABEL[p]}数据</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {myCards.map((c) => (
                  <div key={c.key} className={`p-3 rounded-lg border ${c.focus ? 'bg-cyan-500/5 border-cyan-500/40' : 'bg-white/5 border-white/5'}`}>
                    <div className="flex items-center gap-1 mb-1">
                      {c.focus && <Target className="w-3 h-3 text-cyan-300 shrink-0" />}
                      <span className="text-[10px] text-white/50 truncate">{c.label}</span>
                    </div>
                    <p className="text-white font-bold text-base leading-none">{c.value}</p>
                    {c.delta && (
                      <p className={`text-[10px] mt-1.5 truncate ${
                        c.trend === 'up' ? 'text-emerald-400' : c.trend === 'down' ? 'text-rose-400' : 'text-white/40'
                      }`}>{c.trend === 'up' ? '↑ ' : c.trend === 'down' ? '↓ ' : ''}{c.delta}</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-white/30 mt-3">
                与「成长小助手」同一套算法，周/月口径一致；带靶心的是管理员设定的攻坚项。
              </p>
            </GlassCard>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 我的板块 */}
            <GlassCard hoverable={false}>
              <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" /> 我的板块
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {MODULES.filter((m) => canSee(currentStaff.name, m.key)).map((m) => (
                  <span key={m.key} className="text-[11px] px-2 py-1 rounded-lg bg-cyan-500/15 text-cyan-300">{m.label}</span>
                ))}
                {MODULES.filter((m) => canSee(currentStaff.name, m.key)).length === 0 && (
                  <p className="text-xs text-white/30">还没有开通任何板块</p>
                )}
              </div>
              <p className="text-[10px] text-white/30 mt-3">未授权的板块不会出现在左侧栏，手输地址也会被拦截。</p>
            </GlassCard>

            {/* 我的技能 */}
            <GlassCard hoverable={false}>
              <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" /> 我的技能
              </h3>
              {me && me.skillIds.length > 0 ? (
                <div className="space-y-1.5">
                  {skills.filter((s: SkillEntry) => me.skillIds.includes(s.id)).map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-white/5">
                      <span className="text-white truncate">{s.name}</span>
                      <span className="text-[10px] text-white/35 ml-auto shrink-0">
                        {s.kind === 'skill' ? '技能' : '提示词'}{s.useCount > 0 ? ` · 用过 ${s.useCount} 次` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/30 py-4">还没有分配技能，找管理员在「团队总览 → 授权」里开通</p>
              )}
            </GlassCard>
          </div>

          {/* 我的任务 */}
          {me && (
            <GlassCard hoverable={false}>
              <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" /> 我的任务
              </h3>
              <div className="grid grid-cols-3 gap-2.5">
                {(['weekly', 'monthly'] as Period[]).map((p) => {
                  const s = taskStatOf(currentStaff.name, p);
                  return (
                    <div key={p} className="p-3 rounded-lg bg-white/5">
                      <p className="text-[10px] text-white/50 mb-1">{PERIOD_LABEL[p]}</p>
                      <p className="text-white font-bold text-xl leading-none">{s.done}/{s.total}</p>
                    </div>
                  );
                })}
                <div className="p-3 rounded-lg bg-white/5">
                  <p className="text-[10px] text-white/50 mb-1">逾期</p>
                  <p className="text-rose-300 font-bold text-xl leading-none">{overdueOf(currentStaff.name)}</p>
                </div>
              </div>
              <p className="text-[10px] text-white/30 mt-3">与「运营管理」「成长小助手」共用同一份任务数据。</p>
            </GlassCard>
          )}
        </>
      )}

      {/* 注册申请弹窗 */}
      <Modal open={applyOpen} onClose={() => setApplyOpen(false)} title="注册申请" maxWidth="max-w-md">
        <div className="space-y-3">
          <p className="text-[11px] text-white/45">
            提交后进入待审批，需要用管理员身份在「注册审批」里通过并授权，才能用这个身份登录。
          </p>
          <div>
            <label className="text-xs text-white/50 block mb-1">姓名</label>
            <input value={applyForm.name} onChange={(e) => setApplyForm({ ...applyForm, name: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 block mb-1">手机号（可选）</label>
              <input value={applyForm.phone} onChange={(e) => setApplyForm({ ...applyForm, phone: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">微信号（可选）</label>
              <input value={applyForm.wechat} onChange={(e) => setApplyForm({ ...applyForm, wechat: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
            </div>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">申请岗位</label>
            <select value={applyForm.position} onChange={(e) => setApplyForm({ ...applyForm, position: e.target.value as Position })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
              {POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">申请说明（可选）</label>
            <textarea value={applyForm.note} onChange={(e) => setApplyForm({ ...applyForm, note: e.target.value })} rows={3} placeholder="例：负责六年级家长群，需要社群数据与活动管理权限" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setApplyOpen(false)} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
            <button onClick={submitApply} className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium">提交申请</button>
          </div>
        </div>
      </Modal>

      {/* 授权弹窗 */}
      <Modal open={grantOpen} onClose={() => setGrantOpen(false)} title={`授权 · ${grantTarget?.name || ''}`} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-white/50 block mb-1">角色</label>
              <select value={grantForm.level} onChange={(e) => setGrantForm({ ...grantForm, level: e.target.value as Level })} className="w-full h-10 px-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white">
                <option value="director">总监</option>
                <option value="manager">经理</option>
                <option value="staff">专员</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">岗位</label>
              <select
                value={grantForm.position}
                onChange={(e) => {
                  const p = e.target.value as Position;
                  setGrantForm({ ...grantForm, position: p, modules: [...DEFAULT_MODULES_BY_POSITION[p]] });
                }}
                className="w-full h-10 px-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white"
              >
                {POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">数据范围（由职级决定）</label>
              <input value={LEVEL_META[grantForm.level].desc.split(' · ')[1] || ''} disabled className="w-full h-10 px-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs text-white/50">可见板块</label>
              <button
                onClick={() => setGrantForm({
                  ...grantForm,
                  modules: grantForm.modules.length === MODULES.length ? [] : [...ALL_MODULE_KEYS],
                })}
                className="ml-auto text-[10px] text-cyan-300/60 hover:text-cyan-300"
              >{grantForm.modules.length === MODULES.length ? '全不选' : '全选'}</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MODULES.map((m) => {
                const on = grantForm.modules.includes(m.key);
                return (
                  <button
                    key={m.key}
                    onClick={() => setGrantForm({ ...grantForm, modules: on ? grantForm.modules.filter((x) => x !== m.key) : [...grantForm.modules, m.key] })}
                    className={`px-2 py-1 rounded-lg text-[11px] border ${
                      on ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                    }`}
                  >{m.label}</button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50 block mb-2">可用技能（{grantForm.skillIds.length}）</label>
            {skills.length === 0 ? (
              <p className="text-[11px] text-white/30 py-2">技能中心还没有技能，先去「Skill 中心」导入后再分配</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto scrollbar-thin">
                {skills.map((s) => {
                  const on = grantForm.skillIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => setGrantForm({ ...grantForm, skillIds: on ? grantForm.skillIds.filter((x) => x !== s.id) : [...grantForm.skillIds, s.id] })}
                      className={`px-2 py-1 rounded-lg text-[11px] border ${
                        on ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                      }`}
                    >{s.name}</button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setGrantOpen(false)} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
            <button onClick={saveGrant} className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-medium">
              {grantTarget?.status === 'active' ? '保存授权' : '同意并开通'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 重置密码弹窗 */}
      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title={`重置密码 · ${pwTarget?.name || ''}`} maxWidth="max-w-sm">
        <div className="space-y-3">
          <p className="text-[11px] text-white/45">
            重置后该成员需要用新密码登录。{pwTarget && !hasPassword(pwTarget.name) && '（该账号还没设过密码）'}
          </p>
          <div>
            <label className="text-xs text-white/50 block mb-1">新密码</label>
            <input type="password" value={pwForm.password} onChange={(e) => setPwForm({ ...pwForm, password: e.target.value })} placeholder="至少 6 位" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">确认新密码</label>
            <input type="password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} placeholder="再输一次" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setPwOpen(false)} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
            <button onClick={submitResetPw} className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium">确认重置</button>
          </div>
        </div>
      </Modal>

      {/* 驳回弹窗 */}
      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title={`驳回 ${grantTarget?.name || ''}`} maxWidth="max-w-sm">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1">驳回原因</label>
            <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="例：岗位待定" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setRejectOpen(false)} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
            <button onClick={doReject} className="px-4 py-2 rounded-lg bg-rose-500/20 text-rose-200 text-sm">确认驳回</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Staff;
