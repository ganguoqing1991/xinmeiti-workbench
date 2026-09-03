// 私域社群：数据总览 / 社群管理 / 群活动管理 / 转化漏斗(海盗模型) / 话术库
// 员工管理已移出（见员工管理页）；运营日历已移出（见运营管理页）

import React, { useState, useMemo } from 'react';
import {
  Users,
  Calendar,
  Download,
  TrendingUp,
  Plus,
  Search,
  Crown,
  Target,
  MessageSquare,
  Edit3,
  Trash2,
  BarChart3,
  Activity,
  Zap,
  Loader2,
  Sparkles,
  X,
  ChevronDown,
  ChevronRight,
  Eye,
  AlertTriangle,
  Filter as FilterIcon,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';
import GlassCard from '../../components/GlassCard';
import StatCard from '../../components/StatCard';
import Modal from '../../components/Modal';
import { formatNumber } from '../../utils/format';
import { useWorkspace } from '../../store/workspace';
import { isDirector } from '../../utils/memberStore';
import { getMyLLMConfig,
  apiMissingHint } from '../../utils/llmConfig';
import { callLLMStream } from '../../utils/llmCall';
import {
  getGroups,
  addGroup,
  updateGroup,
  removeGroup,
  updateGroupMembers,
  getActivities,
  addActivity,
  updateActivity,
  removeActivity,
  getTasks,
  updateTask,
  getFunnel,
  saveFunnel,
  isThisMonth,
  isThisWeek,
  hasSeedData,
  clearSeedData,
  fillFunnelFromActivities,
  type CommunityGroup,
  type GroupActivity,
  type GradeSegment,
  type FunnelStage,
} from '../../utils/communityStore';

type CommunityTab = 'overview' | 'groups' | 'activities' | 'funnel' | 'scripts';
type ToastMsg = { type: 'success' | 'error' | 'info'; message: string } | null;

const GRADES: GradeSegment[] = ['幼小', '小学', '初中', '高中', '其他'];
const GROUP_COLORS = [
  'from-cyan-500 to-blue-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-purple-500 to-indigo-500',
  'from-blue-500 to-cyan-500',
];

// ===== 话术（带分类） =====
const SCRIPT_CATEGORIES = ['欢迎新人', '活动通知', '转化逼单', '答疑互动', '学习反馈', '其他'];
type CommunityScript = { id: string; title: string; content: string; category: string; useCount: number; time: string };
const SCRIPT_KEY = 'community_scripts_v2';
const DEFAULT_SCRIPTS: CommunityScript[] = [
  { id: 'c1', title: '欢迎新朋友', category: '欢迎新人', content: '欢迎新朋友进群！我是群主，为了让大家更高效地获取信息，请先看一下群公告，并修改群昵称为「孩子学龄+姓名」。', useCount: 328, time: '2026-08-01' },
  { id: 'c2', title: '新人打卡引导', category: '欢迎新人', content: '欢迎新入群的同学！请按格式【昵称：XX / 学龄：XX年级 / 目标：XX】介绍一下自己哦，完成后可以领 1 次老师 1v1 答疑机会。', useCount: 256, time: '2026-08-03' },
  { id: 'c3', title: '暑期打卡活动', category: '活动通知', content: '暑期学习打卡挑战开始啦！连续打卡 7 天的家长可以免费获得老师 1v1 学情诊断一次，名额有限~', useCount: 412, time: '2026-08-05' },
  { id: 'c4', title: '课程优惠提醒', category: '转化逼单', content: '本群专属福利：8 月新课 9 折券 + 免费试听 1 次，限前 30 名家长报名，扫码即可领取。', useCount: 198, time: '2026-08-08' },
  { id: 'c5', title: '学习反馈收集', category: '学习反馈', content: '为了让老师更精准地辅导孩子，请大家在群内回复一下最近孩子的学习表现，老师会逐一查看。', useCount: 167, time: '2026-08-12' },
];
function loadScripts(): CommunityScript[] {
  try {
    const raw = localStorage.getItem(SCRIPT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_SCRIPTS;
}
function saveScripts(list: CommunityScript[]) {
  try { localStorage.setItem(SCRIPT_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

/**
 * 社群活跃度趋势：按真实活动日期聚合近 30 天。
 * active = 当日活动参与人数合计，newAdd = 当日活动留资（加微）合计。
 * 没有录入活动的日子就是 0——不伪造曲线。
 */
function buildCommunityTrend(activities: GroupActivity[], days = 30) {
  const byDay = new Map<string, { active: number; newAdd: number; actCount: number }>();
  for (const a of activities) {
    if (!a.date) continue;
    const cur = byDay.get(a.date) || { active: 0, newAdd: 0, actCount: 0 };
    cur.active += a.participants || 0;
    cur.newAdd += a.leads || 0;
    cur.actCount += 1;
    byDay.set(a.date, cur);
  }
  const out: { date: string; active: number; newAdd: number; actCount: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const hit = byDay.get(key);
    out.push({
      date: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      active: hit?.active || 0,
      newAdd: hit?.newAdd || 0,
      actCount: hit?.actCount || 0,
    });
  }
  return out;
}

const Community: React.FC = () => {
  const [tab, setTab] = useState<CommunityTab>('overview');
  const [toast, setToast] = useState<ToastMsg>(null);
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2600);
  };

  const tabs: { key: CommunityTab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: '数据总览', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'groups', label: '社群管理', icon: <Users className="w-4 h-4" /> },
    { key: 'activities', label: '群活动管理', icon: <Zap className="w-4 h-4" /> },
    { key: 'funnel', label: '转化漏斗', icon: <FilterIcon className="w-4 h-4" /> },
    { key: 'scripts', label: '话术库', icon: <MessageSquare className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-6 z-50">
          <div className={`px-4 py-2.5 rounded-lg shadow-2xl text-sm border ${
            toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
            : toast.type === 'error' ? 'bg-rose-500/20 text-rose-200 border-rose-500/30'
            : 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30'
          }`}>
            {toast.message}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Users className="w-6 h-6 text-emerald-400" /> 私域社群
        </h2>
        <p className="text-xs text-white/40">学员·管家岛</p>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-xl glass-card-dark w-fit overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.key ? 'text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            {tab === t.key && (
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30" />
            )}
            <span className="relative z-10 flex items-center gap-2">{t.icon} {t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewPanel showToast={showToast} />}
      {tab === 'groups' && <GroupsPanel showToast={showToast} />}
      {tab === 'activities' && <ActivitiesPanel showToast={showToast} />}
      {tab === 'funnel' && <FunnelPanel showToast={showToast} />}
      {tab === 'scripts' && <ScriptsPanel showToast={showToast} />}
    </div>
  );
};

// ============================================================
// 数据总览
// ============================================================
const OverviewPanel: React.FC<{ showToast: (t: 'success' | 'error' | 'info', m: string) => void }> = ({ showToast }) => {
  const { currentStaff } = useWorkspace();
  const isAdmin = isDirector(currentStaff.name);
  // dataTick：清理示例数据后强制重新读取
  const [dataTick, setDataTick] = useState(0);
  const groups = useMemo(() => getGroups(), [dataTick]);
  const activities = useMemo(() => getActivities(), [dataTick]);
  const [tasks, setTasks] = useState(() => getTasks());
  const [queryWechat, setQueryWechat] = useState<string | null>(null);
  // 系统示例数据（首次使用时自动写入的种子群/活动），需用户确认后清理
  const seedPresent = useMemo(() => hasSeedData(), [dataTick]);
  const handleClearSeed = () => {
    const r = clearSeedData();
    setDataTick((v) => v + 1);
    showToast('success', `已清空示例数据：社群 ${r.groups} 个 / 活动 ${r.activities} 场（你自己录入的数据不受影响）`);
  };

  const today = new Date().toISOString().slice(0, 10);
  // 今日工作计划：按可见范围过滤（管理员全看；组员只看 all）
  const todayPlans = tasks
    .filter((t) => t.date === today && (isAdmin || t.visibility === 'all'))
    .sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));

  // 真实指标：全部由已录入的群与活动数据算出，无数据时为 0 / 不显示环比，不编造
  const stats = useMemo(() => {
    const totalMembers = groups.reduce((a, g) => a + (g.members || 0), 0);
    const totalConv = groups.reduce((a, g) => a + (g.conversions || 0), 0);

    // 本月 / 上月新增：取活动的留资（加微）数合计
    const now = new Date();
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const curKey = monthKey(now);
    const prevKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const leadsOf = (mk: string) =>
      activities.filter((a) => (a.date || '').startsWith(mk)).reduce((s, a) => s + (a.leads || 0), 0);
    const monthNew = leadsOf(curKey);
    const prevMonthNew = leadsOf(prevKey);

    // 环比：上月为 0 时无法计算百分比，返回 undefined（卡片不显示环比）
    const pct = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : undefined);

    // 活跃群数环比用「本月新建群数」；总人数环比用各群 memberHistory 最后两条记录的净增
    const monthNewGroups = groups.filter((g) => isThisMonth(g.createdAt)).length;
    const memberDelta = groups.reduce((s, g) => {
      const h = g.memberHistory || [];
      if (h.length < 2) return s;
      return s + ((h[h.length - 1]?.count || 0) - (h[h.length - 2]?.count || 0));
    }, 0);
    const memberDeltaPct = totalMembers > 0 ? (memberDelta / Math.max(totalMembers - memberDelta, 1)) * 100 : undefined;

    return {
      totalMembers,
      totalConv,
      convRate: totalMembers > 0 ? (totalConv / totalMembers) * 100 : 0,
      monthNew,
      monthNewChange: pct(monthNew, prevMonthNew),
      groupCount: groups.length,
      monthNewGroups,
      memberDelta,
      memberDeltaPct,
      hasActivities: activities.length > 0,
    };
  }, [groups, activities]);

  // 社群活跃度趋势：按真实活动日期聚合（无活动数据的日子为 0）
  const trend = useMemo(() => buildCommunityTrend(activities), [activities]);

  // 按群主（微信号）聚合排行：活跃度 = 活跃天数 + 活动数量加权
  const ownerRanking = useMemo(() => {
    const map = new Map<string, { wechat: string; name: string; groups: CommunityGroup[]; score: number }>();
    for (const g of groups) {
      const key = g.ownerWechat || g.ownerName;
      const cur = map.get(key) || { wechat: g.ownerWechat, name: g.ownerName, groups: [], score: 0 };
      cur.groups.push(g);
      cur.score += g.activeDays + g.activityCount * 2 + g.conversions;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.score - a.score);
  }, [groups]);
  const maxScore = ownerRanking[0]?.score || 1;

  // 某个微信号的查询详情
  const queryDetail = useMemo(() => {
    if (!queryWechat) return null;
    const owner = ownerRanking.find((o) => (o.wechat || o.name) === queryWechat);
    if (!owner) return null;
    const monthNew = owner.groups.filter((g) => isThisMonth(g.createdAt)).length;
    const weekNew = owner.groups.filter((g) => isThisWeek(g.createdAt)).length;
    const monthActs = activities.filter((a) => owner.groups.some((g) => g.id === a.groupId) && isThisMonth(a.date)).length;
    const weekActs = activities.filter((a) => owner.groups.some((g) => g.id === a.groupId) && isThisWeek(a.date)).length;
    return { owner, monthNew, weekNew, monthActs, weekActs };
  }, [queryWechat, ownerRanking, activities]);

  return (
    <div className="space-y-4">
      {/* 示例数据提示：系统首次使用时自动写入的种子群/活动，混在真实数据里会看不准 */}
      {seedPresent && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-200/90 font-medium">当前混有系统示例数据</p>
            <p className="text-[10px] text-amber-200/60 mt-0.5">
              首次使用时系统自动写入了示例社群与活动，它们会算进上面的统计。清理后只保留你自己录入的数据，且不会再回来。
            </p>
          </div>
          <button
            onClick={handleClearSeed}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-200 text-xs font-medium hover:bg-amber-500/30 transition-colors"
          >
            一键清空示例数据
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="私域总人数"
          value={formatNumber(stats.totalMembers)}
          unit="人"
          change={stats.memberDeltaPct}
          changeLabel={stats.memberDelta !== 0 ? `本周${stats.memberDelta > 0 ? '+' : ''}${stats.memberDelta}` : '本周持平'}
          icon={<Users className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          title="本月新增"
          value={formatNumber(stats.monthNew)}
          unit="人"
          change={stats.monthNewChange}
          changeLabel="环比（按活动留资）"
          icon={<TrendingUp className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="活跃群数"
          value={String(stats.groupCount)}
          unit="个"
          change={undefined}
          changeLabel={stats.monthNewGroups > 0 ? `本月新建 ${stats.monthNewGroups}` : '本月暂无新建'}
          icon={<Calendar className="w-5 h-5" />}
          color="purple"
        />
        <StatCard
          title="转化率"
          value={stats.convRate.toFixed(1)}
          unit="%"
          change={undefined}
          changeLabel={`${formatNumber(stats.totalConv)} 转化 / ${formatNumber(stats.totalMembers)} 人`}
          icon={<Download className="w-5 h-5" />}
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard hoverable={false}>
          <h3 className="text-white font-medium text-sm mb-1 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" /> 社群活跃度趋势
          </h3>
          <p className="text-[10px] text-white/40 mb-3">近 30 天 · 按活动参与人数与留资数统计</p>
          <div className="h-64">
            {stats.hasActivities ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="activeArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                  <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(20,20,30,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12 }} />
                  <Area type="monotone" dataKey="active" stroke="#06b6d4" fill="url(#activeArea)" name="活跃人数" />
                  <Area type="monotone" dataKey="newAdd" stroke="#10b981" fill="url(#activeArea)" name="留资数" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center gap-1">
                <Activity className="w-6 h-6 text-white/15" />
                <p className="text-xs text-white/30">还没有活动数据</p>
                <p className="text-[10px] text-white/20">到「群活动管理」补录活动后，这里会按日期自动生成曲线</p>
              </div>
            )}
          </div>
        </GlassCard>

        {/* 社群活跃排行榜：按微信号聚合，点击查询详情 */}
        <GlassCard hoverable={false}>
          <h3 className="text-white font-medium text-sm mb-1 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" /> 社群活跃排行榜
          </h3>
          <p className="text-[10px] text-white/40 mb-3">按群主微信号聚合 · 点击查询 TA 管理的社群详情</p>
          <div className="space-y-1.5">
            {ownerRanking.map((o) => {
              const key = o.wechat || o.name;
              const expanded = queryWechat === key;
              return (
                <div key={key}>
                  <button
                    onClick={() => setQueryWechat(expanded ? null : key)}
                    className={`w-full flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors ${expanded ? 'bg-emerald-500/10' : 'hover:bg-white/5'}`}
                  >
                    {expanded ? <ChevronDown className="w-3 h-3 text-emerald-300 shrink-0" /> : <ChevronRight className="w-3 h-3 text-white/30 shrink-0" />}
                    <span className="w-24 text-xs text-white/70 truncate text-left">{o.name}</span>
                    <span className="text-[10px] text-white/30 truncate hidden sm:inline">{o.wechat}</span>
                    <div className="flex-1 h-3 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${(o.score / maxScore) * 100}%` }} />
                    </div>
                    <span className="w-10 text-xs text-emerald-300 font-mono text-right">{o.score}</span>
                  </button>
                  {/* 查询详情 */}
                  {expanded && queryDetail && (
                    <div className="ml-6 mt-1 mb-2 p-3 rounded-lg bg-white/5 border border-emerald-500/20 space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                        <div><p className="text-[9px] text-white/40">本月新建群</p><p className="text-sm text-emerald-300 font-bold">{queryDetail.monthNew}</p></div>
                        <div><p className="text-[9px] text-white/40">本周新建群</p><p className="text-sm text-cyan-300 font-bold">{queryDetail.weekNew}</p></div>
                        <div><p className="text-[9px] text-white/40">本月活动</p><p className="text-sm text-amber-300 font-bold">{queryDetail.monthActs}</p></div>
                        <div><p className="text-[9px] text-white/40">本周活动</p><p className="text-sm text-purple-300 font-bold">{queryDetail.weekActs}</p></div>
                      </div>
                      <div className="space-y-1">
                        {queryDetail.owner.groups.map((g) => (
                          <div key={g.id} className="flex items-center gap-2 text-[11px]">
                            <span className="text-white/80 font-medium">{g.name}</span>
                            <span className="px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-300 text-[9px]">{g.grade}</span>
                            <span className="text-white/30">建群 {g.createdAt}</span>
                            <span className="text-white/30 ml-auto">{g.members}人 · 活动{g.activityCount} · 转化{g.conversions}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard hoverable={false} className="lg:col-span-2">
          <h3 className="text-white font-medium text-sm mb-1">已新建社群活动数</h3>
          <p className="text-[10px] text-white/40 mb-3">近 25 天 · 按活动创建日期统计</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buildCommunityTrend(activities, 25).map((x) => ({ day: x.date, count: x.actCount }))}>
                <defs>
                  <linearGradient id="bar1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 9 }} />
                <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(20,20,30,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12 }} />
                <Bar dataKey="count" fill="url(#bar1)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* 运营日报：当日员工工作计划 */}
        <GlassCard hoverable={false}>
          <h3 className="text-white font-medium text-sm mb-1 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" /> 运营日报 · 今日工作计划
          </h3>
          <p className="text-[10px] text-white/40 mb-3">
            {today} · {isAdmin ? '管理员视图（可见全部，可设置可见范围）' : '组员视图（仅可见全员公开的计划）'}
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
            {todayPlans.length === 0 ? (
              <p className="text-xs text-white/30 py-6 text-center">今日暂无工作计划<br />到「运营管理」添加任务后显示在这里</p>
            ) : (
              todayPlans.map((t) => (
                <div key={t.id} className="p-2.5 rounded-lg bg-white/5 border-l-2 border-amber-500/40">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={(e) => { updateTask(t.id, { done: e.target.checked }); setTasks(getTasks()); }}
                      className="accent-emerald-500"
                    />
                    <p className={`text-sm flex-1 ${t.done ? 'text-white/40 line-through' : 'text-white'}`}>{t.title}</p>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          const next = t.visibility === 'all' ? 'member' : 'all';
                          updateTask(t.id, { visibility: next });
                          setTasks(getTasks());
                          showToast('success', next === 'all' ? '已设为全员可看' : '已设为仅组员可看');
                        }}
                        className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${
                          t.visibility === 'all' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/40'
                        }`}
                        title="点击切换可见范围"
                      >
                        {t.visibility === 'all' ? '全员可看' : '仅组员'}
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-white/40 mt-1 ml-5">{t.assignee} · {t.scope === 'team' ? '团队任务' : '个人任务'}</p>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

// ============================================================
// 社群管理
// ============================================================
const GroupsPanel: React.FC<{ showToast: (t: 'success' | 'error' | 'info', m: string) => void }> = ({ showToast }) => {
  const [groups, setGroups] = useState<CommunityGroup[]>(() => getGroups());
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<CommunityGroup | null>(null);
  const [memberOpen, setMemberOpen] = useState<CommunityGroup | null>(null);
  const [memberWeek, setMemberWeek] = useState('');
  const [memberCount, setMemberCount] = useState('');

  const openAdd = () => {
    setEditing({
      id: '', name: '', ownerName: '', ownerWechat: '', admins: [], members: 0,
      memberHistory: [], createdAt: new Date().toISOString().slice(0, 10),
      grade: '小学', activeDays: 0, activityCount: 0, conversions: 0,
      color: GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)],
    });
    setEditOpen(true);
  };

  const handleSave = () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.ownerName.trim()) {
      showToast('error', '群名称和群主不能为空');
      return;
    }
    if (editing.id) {
      updateGroup(editing.id, editing);
      showToast('success', '✓ 社群已更新');
    } else {
      addGroup({ ...editing, memberHistory: [{ week: '本周', count: editing.members }] });
      showToast('success', '✓ 社群已新增');
    }
    setGroups(getGroups());
    setEditOpen(false);
    setEditing(null);
  };

  const saveMembers = () => {
    if (!memberOpen) return;
    const count = parseInt(memberCount);
    if (!memberWeek.trim() || !Number.isFinite(count)) {
      showToast('error', '请填写周次和人数');
      return;
    }
    updateGroupMembers(memberOpen.id, memberWeek.trim(), count);
    setGroups(getGroups());
    setMemberOpen(null);
    setMemberWeek('');
    setMemberCount('');
    showToast('success', '✓ 群人数已更新并记录到周趋势');
  };

  const weekTrend = (g: CommunityGroup) => {
    if (g.memberHistory.length < 2) return null;
    const last = g.memberHistory[g.memberHistory.length - 1].count;
    const prev = g.memberHistory[g.memberHistory.length - 2].count;
    const diff = last - prev;
    return diff === 0 ? null : diff;
  };

  return (
    <GlassCard hoverable={false}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-white font-medium text-sm">
          已建社群（{groups.length} 个群 · 总成员 {formatNumber(groups.reduce((a, g) => a + g.members, 0))} 人）
        </h3>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-medium">
          <Plus className="w-3.5 h-3.5" /> 新增社群
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {groups.map((g) => {
          const trend = weekTrend(g);
          return (
            <div key={g.id} className="p-4 rounded-xl border bg-white/5 border-white/5 hover:bg-white/10 transition-all group">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${g.color} flex items-center justify-center text-white font-bold`}>
                  {g.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm text-white font-medium truncate">{g.name}</h4>
                  <p className="text-xs text-white/40">群主：{g.ownerName}（{g.ownerWechat}）</p>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 shrink-0">{g.grade}</span>
              </div>
              <p className="text-[10px] text-white/40 mb-2">管理员：{g.admins.join('、') || '—'} · 建群 {g.createdAt}</p>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div>
                  <p className="text-[10px] text-white/40">成员</p>
                  <p className="text-sm text-white font-bold">
                    {g.members}
                    {trend !== null && (
                      <span className={`text-[9px] ml-1 ${trend > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {trend > 0 ? `+${trend}` : trend}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-white/40">活跃天数</p>
                  <p className="text-sm text-emerald-300 font-bold">{g.activeDays}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/40">活动/转化</p>
                  <p className="text-sm text-amber-300 font-bold">{g.activityCount}/{g.conversions}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { setMemberOpen(g); setMemberCount(String(g.members)); }}
                  className="flex-1 text-[10px] px-2 py-1.5 rounded bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                >
                  按周更新人数
                </button>
                <button
                  onClick={() => { setEditing({ ...g }); setEditOpen(true); }}
                  className="text-[10px] px-2 py-1.5 rounded bg-white/5 text-white/60 hover:bg-white/10"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`删除「${g.name}」？`)) {
                      removeGroup(g.id);
                      setGroups(getGroups());
                      showToast('success', '已删除');
                    }
                  }}
                  className="text-[10px] px-2 py-1.5 rounded bg-white/5 text-white/60 hover:bg-rose-500/20 hover:text-rose-300"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 新增/编辑社群弹窗 */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={editing?.id ? '编辑社群' : '新增社群'} maxWidth="max-w-lg">
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-white/50 block mb-1">群名称</label>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">群主姓名</label>
                <input value={editing.ownerName} onChange={(e) => setEditing({ ...editing, ownerName: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">群主微信号</label>
                <input value={editing.ownerWechat} onChange={(e) => setEditing({ ...editing, ownerWechat: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">管理员（顿号分隔）</label>
                <input value={editing.admins.join('、')} onChange={(e) => setEditing({ ...editing, admins: e.target.value.split(/[、,，]/).map((s) => s.trim()).filter(Boolean) })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">学段</label>
                <select value={editing.grade} onChange={(e) => setEditing({ ...editing, grade: e.target.value as GradeSegment })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">建群时间</label>
                <input type="date" value={editing.createdAt} onChange={(e) => setEditing({ ...editing, createdAt: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">当前成员数</label>
                <input type="number" value={editing.members} onChange={(e) => setEditing({ ...editing, members: parseInt(e.target.value) || 0 })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">活跃天数</label>
                <input type="number" value={editing.activeDays} onChange={(e) => setEditing({ ...editing, activeDays: parseInt(e.target.value) || 0 })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">活动数量</label>
                <input type="number" value={editing.activityCount} onChange={(e) => setEditing({ ...editing, activityCount: parseInt(e.target.value) || 0 })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">转化数量</label>
                <input type="number" value={editing.conversions} onChange={(e) => setEditing({ ...editing, conversions: parseInt(e.target.value) || 0 })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
              <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-medium">保存</button>
            </div>
          </div>
        )}
      </Modal>

      {/* 按周更新人数弹窗 */}
      <Modal open={!!memberOpen} onClose={() => setMemberOpen(null)} title={`按周更新人数 · ${memberOpen?.name || ''}`} subtitle="写入周记录，成员趋势自动计算增减" maxWidth="max-w-sm">
        <div className="space-y-3">
          {memberOpen && memberOpen.memberHistory.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-[10px] text-white/40">
              {memberOpen.memberHistory.slice(-4).map((h) => (
                <span key={h.week} className="px-1.5 py-0.5 rounded bg-white/5">{h.week}: {h.count}</span>
              ))}
            </div>
          )}
          <div>
            <label className="text-xs text-white/50 block mb-1">周次（如 8月5周）</label>
            <input value={memberWeek} onChange={(e) => setMemberWeek(e.target.value)} placeholder="8月5周" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">本周最新人数</label>
            <input type="number" value={memberCount} onChange={(e) => setMemberCount(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setMemberOpen(null)} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
            <button onClick={saveMembers} className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-medium">保存</button>
          </div>
        </div>
      </Modal>
    </GlassCard>
  );
};

// ============================================================
// 群活动管理
// ============================================================
const ActivitiesPanel: React.FC<{ showToast: (t: 'success' | 'error' | 'info', m: string) => void }> = ({ showToast }) => {
  const [activities, setActivities] = useState<GroupActivity[]>(() => getActivities());
  const groups = useMemo(() => getGroups(), []);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<GroupActivity | null>(null);
  const [detailCase, setDetailCase] = useState<GroupActivity | null>(null);

  const featured = activities.filter((a) => a.featured && a.status === 'done');
  const weekApplied = activities.filter((a) => a.status === 'applied');
  const done = activities.filter((a) => a.status === 'done');

  const openAdd = () => {
    setEditing({
      id: '', groupId: groups[0]?.id || '', groupName: groups[0]?.name || '', title: '',
      date: new Date().toISOString().slice(0, 10), ownerName: '', status: 'applied', featured: false,
      reach: 0, participants: 0, leads: 0, trials: 0, deals: 0, revenue: 0, note: '',
    });
    setEditOpen(true);
  };

  const handleSave = () => {
    if (!editing) return;
    if (!editing.title.trim() || !editing.ownerName.trim()) {
      showToast('error', '活动名称和负责人不能为空');
      return;
    }
    const groupName = groups.find((g) => g.id === editing.groupId)?.name || editing.groupName;
    const payload = { ...editing, groupName, status: editing.status };
    if (editing.id) {
      updateActivity(editing.id, payload);
      showToast('success', '✓ 活动已更新');
    } else {
      addActivity(payload);
      showToast('success', '✓ 活动已提交申请');
    }
    setActivities(getActivities());
    setEditOpen(false);
    setEditing(null);
  };

  // 全链路漏斗（案例详情用）
  const funnelOf = (a: GroupActivity) => [
    { label: '前端触达', value: a.reach },
    { label: '活动参与', value: a.participants },
    { label: '留资加微', value: a.leads },
    { label: '试听', value: a.trials },
    { label: '后期成单', value: a.deals },
  ];

  return (
    <div className="space-y-4">
      {/* 统计卡 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '活动总数', value: String(activities.length), color: 'text-cyan-300' },
          { label: '本周申请中', value: String(weekApplied.length), color: 'text-amber-300' },
          { label: '已执行', value: String(done.length), color: 'text-emerald-300' },
          { label: '精选案例', value: String(featured.length), color: 'text-purple-300' },
        ].map((c) => (
          <GlassCard key={c.label} hoverable={false} className="!p-3 text-center">
            <p className="text-[10px] text-white/40">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          </GlassCard>
        ))}
      </div>

      {/* 精选案例 */}
      {featured.length > 0 && (
        <GlassCard hoverable={false}>
          <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-400" /> 精选案例
            <span className="text-[10px] text-white/40">点击查看全链路转化分析</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {featured.map((a) => (
              <button
                key={a.id}
                onClick={() => setDetailCase(a)}
                className="p-4 rounded-xl bg-gradient-to-b from-amber-500/10 to-transparent border border-amber-500/30 hover:border-amber-400/60 transition-all text-left"
              >
                <Crown className="w-6 h-6 text-amber-400 mb-2" />
                <p className="text-sm text-white font-medium">{a.title}</p>
                <p className="text-xs text-amber-300 mt-1">{a.ownerName}</p>
                <p className="text-[10px] text-white/40 mt-0.5">{a.groupName} · {a.date}</p>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-white/50">
                  <span>参与 {a.participants}</span>
                  <span>成单 {a.deals}</span>
                  <span className="text-emerald-300">¥{formatNumber(a.revenue)}</span>
                </div>
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      {/* 本周群活动申请管理 */}
      <GlassCard hoverable={false}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-white font-medium text-sm">本周群活动申请（{weekApplied.length}）</h3>
          <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-medium">
            <Plus className="w-3.5 h-3.5" /> 申请新活动
          </button>
        </div>
        {weekApplied.length === 0 ? (
          <p className="text-xs text-white/30 py-4 text-center">本周暂无待执行活动</p>
        ) : (
          <div className="space-y-1.5">
            {weekApplied.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">申请中</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white font-medium truncate">{a.title}</p>
                  <p className="text-[10px] text-white/40">{a.groupName} · {a.ownerName} · 计划 {a.date}</p>
                </div>
                <button
                  onClick={() => { updateActivity(a.id, { status: 'done' }); setActivities(getActivities()); showToast('success', '已标记为已执行，请补录活动数据'); }}
                  className="text-[10px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 shrink-0"
                >
                  标记已执行
                </button>
                <button onClick={() => { setEditing({ ...a }); setEditOpen(true); }} className="text-white/40 hover:text-white/80 shrink-0">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { if (window.confirm('删除该申请？')) { removeActivity(a.id); setActivities(getActivities()); } }}
                  className="text-rose-300/40 hover:text-rose-300 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* 已执行活动数据查询 */}
      <GlassCard hoverable={false}>
        <h3 className="text-white font-medium text-sm mb-3">已执行活动 · 数据查询（{done.length}）</h3>
        {done.length === 0 ? (
          <p className="text-xs text-white/30 py-4 text-center">暂无已执行活动</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-white/40 text-[10px] border-b border-white/10">
                  <th className="text-left py-2 pr-3 font-normal">活动</th>
                  <th className="text-left py-2 pr-3 font-normal">负责人</th>
                  <th className="text-right py-2 pr-3 font-normal">触达</th>
                  <th className="text-right py-2 pr-3 font-normal">参与</th>
                  <th className="text-right py-2 pr-3 font-normal">加微</th>
                  <th className="text-right py-2 pr-3 font-normal">试听</th>
                  <th className="text-right py-2 pr-3 font-normal">成单</th>
                  <th className="text-right py-2 pr-3 font-normal">金额</th>
                  <th className="text-right py-2 font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {done.map((a) => (
                  <tr key={a.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-1.5">
                        {a.featured && <Crown className="w-3 h-3 text-amber-400 shrink-0" />}
                        <div>
                          <p className="text-white/80 font-medium">{a.title}</p>
                          <p className="text-[10px] text-white/30">{a.groupName} · {a.date}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-white/60">{a.ownerName}</td>
                    <td className="py-2.5 pr-3 text-right text-white/60">{a.reach}</td>
                    <td className="py-2.5 pr-3 text-right text-white/60">{a.participants}</td>
                    <td className="py-2.5 pr-3 text-right text-cyan-300">{a.leads}</td>
                    <td className="py-2.5 pr-3 text-right text-white/60">{a.trials}</td>
                    <td className="py-2.5 pr-3 text-right text-amber-300">{a.deals}</td>
                    <td className="py-2.5 pr-3 text-right text-emerald-300">¥{formatNumber(a.revenue)}</td>
                    <td className="py-2.5 text-right shrink-0">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setDetailCase(a)} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/60 hover:bg-white/10" title="查看全链路分析">
                          <Eye className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => {
                            updateActivity(a.id, { featured: !a.featured });
                            setActivities(getActivities());
                            showToast('success', a.featured ? '已取消精选' : '👑 已设为精选案例');
                          }}
                          className={`text-[10px] px-1.5 py-0.5 rounded ${a.featured ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-white/60 hover:bg-amber-500/10 hover:text-amber-300'}`}
                          title={a.featured ? '取消精选' : '设为精选案例'}
                        >
                          <Crown className="w-3 h-3" />
                        </button>
                        <button onClick={() => { setEditing({ ...a }); setEditOpen(true); }} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/60 hover:bg-white/10">
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => { if (window.confirm('删除该活动？')) { removeActivity(a.id); setActivities(getActivities()); } }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/60 hover:bg-rose-500/20 hover:text-rose-300"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* 案例全链路分析弹窗 */}
      <Modal open={!!detailCase} onClose={() => setDetailCase(null)} title={detailCase?.title || ''} subtitle={detailCase ? `${detailCase.groupName} · ${detailCase.ownerName} · ${detailCase.date}` : ''} maxWidth="max-w-xl">
        {detailCase && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {detailCase.featured && <Crown className="w-4 h-4 text-amber-400" />}
              <span className="text-xs text-white/50">从前端流量到后期转化的全链路分析</span>
            </div>
            <div className="space-y-2">
              {funnelOf(detailCase).map((s, i, arr) => {
                const pct = i === 0 ? 100 : arr[i - 1].value > 0 ? (s.value / arr[i - 1].value) * 100 : 0;
                return (
                  <div key={s.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-white/70">{s.label}</span>
                      <span className="text-white/50">{s.value} 人{i > 0 && <span className="text-emerald-300 ml-2">{pct.toFixed(1)}%</span>}</span>
                    </div>
                    <div className="h-7 rounded-md bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-md bg-gradient-to-r from-cyan-500 to-emerald-500 flex items-center justify-end pr-2"
                        style={{ width: `${Math.max(4, (s.value / (arr[0].value || 1)) * 100)}%` }}
                      >
                        <span className="text-[10px] text-white font-bold">{s.value}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-white/5"><p className="text-[9px] text-white/40">参与率</p><p className="text-sm text-cyan-300 font-bold">{detailCase.reach > 0 ? ((detailCase.participants / detailCase.reach) * 100).toFixed(1) : 0}%</p></div>
              <div className="p-2 rounded-lg bg-white/5"><p className="text-[9px] text-white/40">成单率</p><p className="text-sm text-amber-300 font-bold">{detailCase.participants > 0 ? ((detailCase.deals / detailCase.participants) * 100).toFixed(1) : 0}%</p></div>
              <div className="p-2 rounded-lg bg-white/5"><p className="text-[9px] text-white/40">成交金额</p><p className="text-sm text-emerald-300 font-bold">¥{formatNumber(detailCase.revenue)}</p></div>
            </div>
            {detailCase.note && (
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-[10px] text-white/40 mb-1">复盘备注</p>
                <p className="text-xs text-white/70 leading-relaxed">{detailCase.note}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 活动新增/编辑弹窗 */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={editing?.id ? '编辑活动' : '申请新活动'} maxWidth="max-w-lg">
        {editing && (
          <div className="space-y-3 max-h-[65vh] overflow-y-auto scrollbar-thin pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-white/50 block mb-1">活动名称</label>
                <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">所属社群</label>
                <select value={editing.groupId} onChange={(e) => setEditing({ ...editing, groupId: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">负责人</label>
                <input value={editing.ownerName} onChange={(e) => setEditing({ ...editing, ownerName: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">活动日期</label>
                <input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">状态</label>
                <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as GroupActivity['status'] })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                  <option value="applied">申请中</option>
                  <option value="done">已执行</option>
                </select>
              </div>
            </div>
            {editing.status === 'done' && (
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <p className="text-[10px] text-emerald-300 mb-2">全链路数据（前端流量 → 后期转化）</p>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['reach', '触达人数'],
                      ['participants', '参与人数'],
                      ['leads', '留资加微'],
                      ['trials', '试听'],
                      ['deals', '成单'],
                      ['revenue', '成交金额'],
                    ] as [keyof GroupActivity, string][]
                  ).map(([key, label]) => (
                    <div key={key}>
                      <label className="text-[10px] text-white/40 block mb-0.5">{label}</label>
                      <input
                        type="number"
                        value={editing[key] as number}
                        onChange={(e) => setEditing({ ...editing, [key]: parseInt(e.target.value) || 0 })}
                        className="w-full h-9 px-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-white/50 block mb-1">复盘备注</label>
              <textarea value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white resize-none" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
              <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-medium">保存</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ============================================================
// 转化漏斗（海盗模型 AARRR + AI 诊断）
// ============================================================
const FunnelPanel: React.FC<{ showToast: (t: 'success' | 'error' | 'info', m: string) => void }> = ({ showToast }) => {
  const [stages, setStages] = useState<FunnelStage[]>(() => getFunnel());
  const [editMode, setEditMode] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const maxVal = Math.max(...stages.map((s) => Math.max(s.target, s.actual)), 1);
  const colors = ['#06b6d4', '#0ea5e9', '#10b981', '#f59e0b', '#a855f7'];

  const handleAiDiagnose = async () => {
    const llm = getMyLLMConfig('xiaohongshu');
    if (!llm.apiKey) {
      showToast('error', apiMissingHint());
      return;
    }
    setAnalyzing(true);
    setAiResult('');
    const dataText = stages.map((s) => `${s.name}：目标 ${s.target}，实际 ${s.actual}，缺口 ${s.target - s.actual}（达成 ${((s.actual / (s.target || 1)) * 100).toFixed(1)}%）`).join('\n');
    try {
      const result = await callLLMStream(
        llm,
        [
          { role: 'system', content: `你是私域社群运营增长专家，精通 AARRR 海盗模型。基于每层的「目标 vs 实际 vs 缺口」，逐层诊断：
1. 判断该层问题的根因类型：【人数不够】（流量/拉新不足）、【活动不够】（互动/激活手段不足）、还是【转化手段不够】（逼单/承接话术/产品呈现不足）
2. 每层给出 1-2 条最优先的补救动作（具体、本周可执行）
3. 最后给一句「本周最该先补哪一层」的结论
要求：直接、务实，不说套话；每层分析不超过 3 行。` },
          { role: 'user', content: `本月 AARRR 漏斗数据：\n${dataText}` },
        ],
        (chunk) => setAiResult((prev) => prev + chunk),
        () => {},
      );
      if (!result.trim()) showToast('error', 'AI 未返回内容');
    } catch (e: any) {
      showToast('error', `诊断失败：${e?.message?.slice(0, 60) || '未知'}`);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <GlassCard hoverable={false}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-white font-medium text-sm">转化漏斗 · 海盗模型（AARRR）</h3>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const acts = getActivities();
                if (acts.length === 0) {
                  showToast('error', '还没有活动数据，先到「群活动管理」补录');
                  return;
                }
                const next = fillFunnelFromActivities();
                setStages(next);
                showToast('success', '已按真实活动数据填充（推荐层无对应数据，需手动填）');
              }}
              className="text-[10px] px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20"
              title="获取=留资合计 / 激活=参与合计 / 留存=试听合计 / 收益=成单合计"
            >
              用活动数据填充
            </button>
            <button
              onClick={() => setEditMode(!editMode)}
              className="text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"
            >
              {editMode ? '完成' : '设置目标'}
            </button>
          </div>
        </div>
        <p className="text-xs text-white/40 mb-4">获取 → 激活 → 留存 → 收益 → 推荐 · 目标 vs 实际</p>
        <div className="space-y-3">
          {stages.map((s, i) => {
            const gap = s.target - s.actual;
            const rate = ((s.actual / (s.target || 1)) * 100).toFixed(0);
            return (
              <div key={s.key}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-white font-medium text-xs">{s.name}</span>
                  <div className="flex items-center gap-2 text-[11px]">
                    {editMode ? (
                      <>
                        <input
                          type="number"
                          value={s.target}
                          onChange={(e) => {
                            const next = stages.map((x) => (x.key === s.key ? { ...x, target: parseInt(e.target.value) || 0 } : x));
                            setStages(next);
                          }}
                          className="w-16 h-6 px-1 rounded bg-white/5 border border-white/10 text-white text-right"
                          title="目标"
                        />
                        <input
                          type="number"
                          value={s.actual}
                          onChange={(e) => {
                            const next = stages.map((x) => (x.key === s.key ? { ...x, actual: parseInt(e.target.value) || 0 } : x));
                            setStages(next);
                          }}
                          className="w-16 h-6 px-1 rounded bg-white/5 border border-cyan-500/30 text-cyan-300 text-right"
                          title="实际"
                        />
                      </>
                    ) : (
                      <>
                        <span className="text-white/50">目标 {formatNumber(s.target)}</span>
                        <span className="text-cyan-300">实际 {formatNumber(s.actual)}</span>
                        <span className={`${gap > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                          {gap > 0 ? `差 ${formatNumber(gap)}` : '✓ 达标'}
                        </span>
                        <span className="text-white/40">{rate}%</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="relative h-9 rounded-lg bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-lg flex items-center justify-end pr-2 transition-all"
                    style={{
                      width: `${Math.max(5, (s.actual / maxVal) * 100)}%`,
                      background: `linear-gradient(90deg, ${colors[i]}80, ${colors[i]})`,
                    }}
                  >
                    <span className="text-[10px] text-white font-bold">{formatNumber(s.actual)}</span>
                  </div>
                  {/* 目标刻度线 */}
                  <div className="absolute top-0 bottom-0 w-0.5 bg-white/50" style={{ left: `${(s.target / maxVal) * 100}%` }} title={`目标 ${s.target}`} />
                </div>
              </div>
            );
          })}
        </div>
        {editMode && (
          <div className="flex justify-end mt-3">
            <button
              onClick={() => { saveFunnel(stages); setEditMode(false); showToast('success', '✓ 目标已保存'); }}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-medium"
            >
              保存目标
            </button>
          </div>
        )}
      </GlassCard>

      {/* AI 诊断 */}
      <GlassCard hoverable={false}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-medium text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" /> AI 缺口诊断
          </h3>
          <button
            onClick={handleAiDiagnose}
            disabled={analyzing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-medium disabled:opacity-50"
          >
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {analyzing ? '分析中...' : '开始诊断'}
          </button>
        </div>
        <p className="text-[10px] text-white/40 mb-3">AI 按每层缺口判断：人数不够 / 活动不够 / 转化手段不够，并给补救动作</p>
        {aiResult ? (
          <div className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap max-h-[420px] overflow-y-auto scrollbar-thin">{aiResult}</div>
        ) : (
          <div className="py-12 text-center text-white/30 text-xs">
            设置好各层目标与实际值后，点「开始诊断」<br />AI 会逐层分析缺口根因并给出本周补救动作
          </div>
        )}
      </GlassCard>
    </div>
  );
};

// ============================================================
// 话术库（分类查询 + 新建/编辑）
// ============================================================
const ScriptsPanel: React.FC<{ showToast: (t: 'success' | 'error' | 'info', m: string) => void }> = ({ showToast }) => {
  const [scripts, setScripts] = useState<CommunityScript[]>(loadScripts);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<CommunityScript | null>(null);

  const filtered = scripts.filter(
    (s) =>
      (categoryFilter === 'all' || s.category === categoryFilter) &&
      (!search || s.title.includes(search) || s.content.includes(search))
  );

  const openAdd = () => {
    setEditing({ id: `c${Date.now()}`, title: '', content: '', category: '欢迎新人', useCount: 0, time: new Date().toISOString().slice(0, 10) });
    setEditOpen(true);
  };
  const handleSave = () => {
    if (!editing) return;
    if (!editing.title.trim() || !editing.content.trim()) {
      showToast('error', '标题和内容不能为空');
      return;
    }
    const exists = scripts.find((s) => s.id === editing.id);
    const next = exists ? scripts.map((s) => (s.id === editing.id ? editing : s)) : [editing, ...scripts];
    setScripts(next);
    saveScripts(next);
    showToast('success', exists ? '✓ 话术已更新' : '✓ 话术已新增');
    setEditOpen(false);
    setEditing(null);
  };

  return (
    <GlassCard hoverable={false}>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="搜索话术标题或内容..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
        >
          <option value="all">全部分类（{scripts.length}）</option>
          {SCRIPT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}（{scripts.filter((s) => s.category === c).length}）</option>
          ))}
        </select>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-medium">
          <Plus className="w-3.5 h-3.5" /> 新建话术
        </button>
      </div>
      {/* 分类标签快捷过滤 */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {['all', ...SCRIPT_CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors ${
              categoryFilter === c ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-white/5 text-white/50 border border-white/10 hover:text-white/80'
            }`}
          >
            {c === 'all' ? '全部' : c}
          </button>
        ))}
      </div>
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-white/30 py-8 text-center">当前分类/搜索下暂无话术</p>
        ) : (
          filtered.map((s) => (
            <div key={s.id} className="p-4 rounded-lg bg-white/5 border border-white/5 hover:border-emerald-500/30 transition-colors">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm text-white font-medium">{s.title}</h4>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">{s.category}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/40 shrink-0">
                  <span>使用 {s.useCount} 次</span>
                  <span>·</span>
                  <span>{s.time}</span>
                </div>
              </div>
              <p className="text-sm text-white/70 leading-relaxed mb-3">{s.content}</p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => { setEditing({ ...s }); setEditOpen(true); }} className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/60 hover:bg-white/10">
                  <Edit3 className="w-3 h-3 inline mr-1" /> 编辑
                </button>
                <button
                  onClick={() => {
                    if (!window.confirm('确定删除该话术？')) return;
                    const next = scripts.filter((x) => x.id !== s.id);
                    setScripts(next);
                    saveScripts(next);
                    showToast('success', '话术已删除');
                  }}
                  className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/60 hover:bg-rose-500/20 hover:text-rose-300"
                >
                  <Trash2 className="w-3 h-3 inline mr-1" /> 删除
                </button>
                <button
                  onClick={() => { navigator.clipboard?.writeText(s.content); showToast('success', '已复制到剪贴板'); }}
                  className="text-[10px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 ml-auto"
                >
                  复制
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 新建/编辑话术弹窗（统一 Modal 组件，修复打不开问题） */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={editing && scripts.find((s) => s.id === editing.id) ? '编辑话术' : '新建话术'} maxWidth="max-w-2xl">
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-white/50 block mb-1">标题</label>
                <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">分类</label>
                <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                  {SCRIPT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">话术内容</label>
              <textarea value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} rows={6} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white resize-none" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
              <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-medium">保存</button>
            </div>
          </div>
        )}
      </Modal>
    </GlassCard>
  );
};

export default Community;
