// 数据总览：按岗位分流窗口，数据全部取自各模块已录入的真实内容
// 原则：没有任何真实数据的地方显示「—」并给出去哪录入的引导，不编造数字。

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, FileText, TrendingUp, Activity, Target, CheckCircle2, Circle, Plus, Trash2,
  Calendar, Flame, Radio, BookOpen, Video, ShieldCheck, Clock, Sparkles, AlertTriangle, Send,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import GlassCard from '../../components/GlassCard';
import { useWorkspace } from '../../store/workspace';
import type { Platform } from '../../types';
import { getSyncedAccounts } from '../../utils/syncedPool';
import { getSessions } from '../../utils/liveStore';
import { getGroups, getActivities, getTasks } from '../../utils/communityStore';
import { getHotspots } from '../../utils/hotspotStore';
import { getMember, isDirector } from '../../utils/memberStore';
import { periodRange, periodKeyOf, positionLabel, type Position } from '../../utils/growthStore';
import { getReflection, getReports } from '../../utils/growthStore';
import {
  getPersonalBoard, getPersonalDone, setPersonalDone,
  getTeamTodos, addTeamTodo, updateTeamTodo, removeTeamTodo,
  type TeamTodo, type TodoPriority, type PersonalItem,
} from '../../utils/todoStore';
import { formatNumber } from '../../utils/format';
import {
  platformSummary, liveSummary, privateSummary, teamSummary, hotspotSummary, daysAgo, inRange,
  clearSeedData,
  type PlatformSummary,
} from '../../utils/dashboardData';

const money =(n: number) => (n >= 10000 ? `¥${(n / 10000).toFixed(1)}万` : `¥${Math.round(n)}`);
const dash = (v: number | string, suffix = '') => (v === 0 || v === '' ? '—' : `${v}${suffix}`);

/** 无数据时的引导 */
const EmptyHint: React.FC<{ text: string; to: string; link: string }> = ({ text, to, link }) => (
  <div className="py-8 text-center">
    <p className="text-xs text-white/35 mb-2">{text}</p>
    <Link to={to} className="text-[11px] text-cyan-300/70 hover:text-cyan-300">{link} →</Link>
  </div>
);

const MetricCard: React.FC<{ label: string; value: string; sub?: string; icon: React.ReactNode; tone?: string }> = ({ label, value, sub, icon, tone = 'text-white' }) => (
  <GlassCard hoverable={false} className="!p-3.5">
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="shrink-0">{icon}</span>
      <span className="text-[10px] text-white/50 truncate">{label}</span>
    </div>
    <p className={`font-bold text-xl leading-none ${tone}`}>{value}</p>
    {sub && <p className="text-[10px] text-white/35 mt-1.5 truncate">{sub}</p>}
  </GlassCard>
);

const Dashboard: React.FC = () => {
  const { currentStaff, staffList } = useWorkspace();
  const staffNames = staffList.map((s) => s.name);
  const me = getMember(currentStaff.name);
  const position: Position = me?.position || (isDirector(currentStaff.name) ? 'admin' : 'private');

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
  const userName = currentStaff.name; // 跟随当前身份

  const [seedTick, setSeedTick] = useState(0); // 清空示例数据后触发重算

  // ===== 今日待办 =====
  const [todoTab, setTodoTab] = useState<'personal' | 'team'>('personal');
  const [personalDone, setPersonalDoneMap] = useState<Record<string, boolean>>(getPersonalDone);
  const [teamTodos, setTeamTodos] = useState<TeamTodo[]>(getTeamTodos);
  const [teamText, setTeamText] = useState('');
  const [teamAssignee, setTeamAssignee] = useState('');
  const [teamPriority, setTeamPriority] = useState<TodoPriority>('mid');

  const xhs = useMemo(() => platformSummary('xiaohongshu'), [seedTick]);
  const dy = useMemo(() => platformSummary('douyin'), [seedTick]);
  const live = useMemo(() => liveSummary(), [seedTick]);
  const priv = useMemo(() => privateSummary(), [seedTick]);
  const team = useMemo(() => teamSummary(staffNames), [staffNames, seedTick]);
  const hot = useMemo(() => hotspotSummary(), [seedTick]);

  const myWeekTasks = useMemo(() => {
    const r = periodRange('weekly', 0);
    const t = getTasks().filter((x) => x.assignee === currentStaff.name && inRange(x.date, r));
    return { done: t.filter((x) => x.done).length, total: t.length, list: t.slice(0, 6) };
  }, [currentStaff.name]);
  const myOverdue = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return getTasks().filter((x) => x.assignee === currentStaff.name && !x.done && x.date < today).length;
  }, [currentStaff.name]);

  // 个人板块：内容来自本人最近一期周度复盘报告，勾选态按报告隔离（生成新周报后自动重置）
  const personal = useMemo(() => getPersonalBoard(currentStaff.name), [currentStaff.name, seedTick]);
  const countDone = (items: PersonalItem[]) => items.filter((i) => personalDone[i.key]).length;
  const togglePersonal = (key: string) => {
    setPersonalDone(key, !personalDone[key]);
    setPersonalDoneMap(getPersonalDone());
  };

  // 团队板块：管理员 / 经理·总监 撰写并下放；专员只看得到指派给自己的
  const canAuthorTeam = position === 'admin' || me?.level === 'manager' || me?.level === 'director';
  // 下放给我的：无论什么角色都并入「个人」板块（专员只有个人板块，团队待办直接落在这里）
  const myTeamTodos = teamTodos.filter((t) => t.assignee === currentStaff.name);
  const visibleTeamTodos = canAuthorTeam ? teamTodos : myTeamTodos;
  const addTeam = () => {
    if (!teamText.trim() || !teamAssignee) return;
    addTeamTodo({ text: teamText, assignee: teamAssignee, priority: teamPriority, author: currentStaff.name });
    setTeamTodos(getTeamTodos());
    setTeamText('');
  };
  const toggleTeam = (t: TeamTodo) => {
    updateTeamTodo(t.id, { done: !t.done });
    setTeamTodos(getTeamTodos());
  };
  const removeTeam = (id: string) => {
    removeTeamTodo(id);
    setTeamTodos(getTeamTodos());
  };

  const isAdmin = position === 'admin';

  return (
    <div className="space-y-4">
      {/* 示例数据提示：系统预置的社群/活动属于示例内容，可一键清空 */}
      {priv.seed && (
        <GlassCard hoverable={false}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">示例数据</span>
            <p className="text-xs text-white/60 flex-1 min-w-[220px]">
              当前私域里混有系统预置的示例社群与活动（不是你录入的），相关数字会受影响。
            </p>
            <button
              onClick={() => {
                if (!window.confirm('清空系统示例社群与活动？你自己录入的数据不受影响，且清空后不会再回来。')) return;
                const n = clearSeedData();
                setSeedTick((v) => v + 1);
                window.alert(`已清空示例数据：社群 ${n.groups} 个、活动 ${n.activities} 场。你自己录入的内容都保留着。`);
              }}
              className="text-[11px] px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 shrink-0"
            >
              一键清空示例数据
            </button>
          </div>
        </GlassCard>
      )}

      {/* 问候 Banner */}
      <GlassCard hoverable={false}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-white text-xl font-bold">
              {greeting}，{userName}
            </h2>
            <p className="text-xs text-white/45 mt-1">
              {dateStr} · {positionLabel(position)}
              {me ? '' : ' · 尚未登记成员档案'}
            </p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {isAdmin ? (
              <>
                <div className="text-right">
                  <p className="text-[10px] text-white/40">团队成员</p>
                  <p className="text-white font-bold text-lg leading-tight">{team.headcount} 人</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-white/40">本周周报</p>
                  <p className="text-white font-bold text-lg leading-tight">{team.submitted}/{team.headcount}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-white/40">任务完成</p>
                  <p className="text-emerald-300 font-bold text-lg leading-tight">{Math.round(team.rate)}%</p>
                </div>
              </>
            ) : (
              <>
                <div className="text-right">
                  <p className="text-[10px] text-white/40">本周任务</p>
                  <p className="text-white font-bold text-lg leading-tight">{myWeekTasks.done}/{myWeekTasks.total}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-white/40">逾期</p>
                  <p className={`font-bold text-lg leading-tight ${myOverdue > 0 ? 'text-rose-300' : 'text-white'}`}>{myOverdue}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </GlassCard>

      {/* ===== 管理员：团队全景 ===== */}
      {isAdmin && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="团队成员" value={`${team.headcount} 人`} icon={<Users className="w-4 h-4 text-purple-400" />} />
            <MetricCard label="本周任务完成" value={team.total ? `${team.done}/${team.total}` : '—'} sub={team.total ? `完成率 ${Math.round(team.rate)}%` : '本周无任务'} icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} />
            <MetricCard label="本周周报" value={`${team.submitted}/${team.headcount}`} sub={`AI 复盘 ${team.reported} 人`} icon={<FileText className="w-4 h-4 text-cyan-400" />} />
            <MetricCard label="本周产出" value={team.gmv ? money(team.gmv) : '—'} sub="私域收入 + 直播 GMV" icon={<TrendingUp className="w-4 h-4 text-amber-400" />} />
            <MetricCard label="人效" value={team.gmv ? money(team.perCapita) : '—'} sub={`团队 ${money(team.gmv)} ÷ ${team.headcount} 人`} icon={<Activity className="w-4 h-4 text-fuchsia-400" />} />
            <MetricCard label="私域总人数" value={priv.groupCount ? formatNumber(priv.members) : '—'} sub={priv.groupCount ? `${priv.groupCount} 个群` : '未录入社群'} icon={<ShieldCheck className="w-4 h-4 text-teal-400" />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <GlassCard hoverable={false} className="lg:col-span-2">
              <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" /> 近 7 天发布量
              </h3>
              {xhs.series.some((s) => s.value) || dy.series.some((s) => s.value) ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={xhs.series.map((s, i) => ({ day: s.day, 小红书: s.value, 抖音: dy.series[i]?.value || 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="day" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                    <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(20,20,30,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12 }} />
                    <Line type="monotone" dataKey="小红书" stroke="#EC4899" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="抖音" stroke="#06B6D4" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyHint text="还没有账号发布数据" to="/xiaohongshu" link="去对标监控同步账号" />
              )}
            </GlassCard>

            <GlassCard hoverable={false}>
              <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" /> 本月热点（{hot.count}）
              </h3>
              {hot.list.length ? (
                <div className="space-y-1.5">
                  {hot.list.map((h) => (
                    <div key={h.id} className="flex items-center gap-2 text-[11px]">
                      <span className="text-amber-300 font-mono shrink-0">{h.date.slice(5)}</span>
                      <span className="text-white/70 truncate flex-1">{h.title}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 shrink-0">{h.category}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyHint text="本月还没有热点" to="/operations" link="去运营管理生成热点" />
              )}
            </GlassCard>
          </div>
        </>
      )}

      {/* ===== 抖音专员 ===== */}
      {position === 'douyin' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="负责账号" value={dash(dy.count, ' 个')} icon={<Video className="w-4 h-4 text-cyan-400" />} />
            <MetricCard label="粉丝总量" value={dy.count ? formatNumber(dy.followers) : '—'} icon={<Users className="w-4 h-4 text-purple-400" />} />
            <MetricCard label="本周发布" value={dash(dy.weekPosts, ' 条')} icon={<FileText className="w-4 h-4 text-emerald-400" />} />
            <MetricCard label="本周播放" value={dy.weekViews ? formatNumber(dy.weekViews) : '—'} icon={<Activity className="w-4 h-4 text-amber-400" />} />
            <MetricCard label="涨粉率" value={dy.count ? `${dy.growth.toFixed(1)}%` : '—'} icon={<TrendingUp className="w-4 h-4 text-fuchsia-400" />} />
            <MetricCard label="爆款率" value={dy.weekPosts ? `${dy.hitRate.toFixed(1)}%` : '—'} sub={dy.weekPosts ? '点赞超均值 2 倍' : '本周无发布'} icon={<Target className="w-4 h-4 text-rose-400" />} />
          </div>
          <PlatformBody s={dy} label="抖音" to="/douyin" />
        </>
      )}

      {/* ===== 小红书专员 ===== */}
      {position === 'xiaohongshu' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="负责账号" value={dash(xhs.count, ' 个')} icon={<BookOpen className="w-4 h-4 text-rose-400" />} />
            <MetricCard label="粉丝总量" value={xhs.count ? formatNumber(xhs.followers) : '—'} icon={<Users className="w-4 h-4 text-purple-400" />} />
            <MetricCard label="本周笔记" value={dash(xhs.weekPosts, ' 条')} icon={<FileText className="w-4 h-4 text-emerald-400" />} />
            <MetricCard label="本周曝光" value={xhs.weekViews ? formatNumber(xhs.weekViews) : '—'} icon={<Activity className="w-4 h-4 text-amber-400" />} />
            <MetricCard label="互动率" value={xhs.count ? `${xhs.engagement.toFixed(1)}%` : '—'} icon={<TrendingUp className="w-4 h-4 text-fuchsia-400" />} />
            <MetricCard label="爆文率" value={xhs.weekPosts ? `${xhs.hitRate.toFixed(1)}%` : '—'} sub={xhs.weekPosts ? '点赞超均值 2 倍' : '本周无发布'} icon={<Target className="w-4 h-4 text-rose-400" />} />
          </div>
          <PlatformBody s={xhs} label="小红书" to="/xiaohongshu" />
        </>
      )}

      {/* ===== 直播专员 ===== */}
      {position === 'live' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="累计场次" value={dash(live.count, ' 场')} icon={<Radio className="w-4 h-4 text-amber-400" />} />
            <MetricCard label="本周场次" value={dash(live.weekCount, ' 场')} icon={<Calendar className="w-4 h-4 text-cyan-400" />} />
            <MetricCard label="本周场观" value={live.weekViewers ? formatNumber(live.weekViewers) : '—'} icon={<Activity className="w-4 h-4 text-purple-400" />} />
            <MetricCard label="场均在线" value={live.weekCount ? formatNumber(Math.round(live.avgOnline)) : '—'} icon={<Users className="w-4 h-4 text-emerald-400" />} />
            <MetricCard label="新增关注" value={live.weekFollowers ? formatNumber(live.weekFollowers) : '—'} icon={<TrendingUp className="w-4 h-4 text-fuchsia-400" />} />
            <MetricCard label="加微数" value={live.weekAdds ? formatNumber(live.weekAdds) : '—'} sub={live.weekGmv ? `GMV ${money(live.weekGmv)}` : undefined} icon={<Target className="w-4 h-4 text-rose-400" />} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <GlassCard hoverable={false} className="lg:col-span-2">
              <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-400" /> 近期场观
              </h3>
              {live.series.length ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={live.series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="day" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                    <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(20,20,30,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12 }} />
                    <Bar dataKey="value" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyHint text="还没有直播场次数据" to="/live" link="去直播工作间导入场次表" />
              )}
            </GlassCard>
            <GlassCard hoverable={false}>
              <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
                <Radio className="w-4 h-4 text-amber-400" /> 最近场次
              </h3>
              {live.list.length ? (
                <div className="space-y-1.5">
                  {live.list.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-[11px]">
                      <span className="text-white/40 font-mono shrink-0">{s.date.slice(5)}</span>
                      <span className="text-white/70 truncate flex-1">{s.sessionName || s.account}</span>
                      <span className="text-amber-300 shrink-0">{formatNumber(s.viewers || 0)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyHint text="暂无场次" to="/live" link="去导入" />
              )}
            </GlassCard>
          </div>
        </>
      )}

      {/* ===== 私域专员 ===== */}
      {position === 'private' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="在管群数" value={dash(priv.groupCount, ' 个')} icon={<ShieldCheck className="w-4 h-4 text-teal-400" />} />
            <MetricCard label="群总人数" value={priv.groupCount ? formatNumber(priv.members) : '—'} icon={<Users className="w-4 h-4 text-purple-400" />} />
            <MetricCard label="本周净增" value={priv.groupCount ? `${priv.net >= 0 ? '+' : ''}${priv.net}` : '—'} sub="按最近两次记录" icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} />
            <MetricCard label="本周活动" value={dash(priv.weekActs, ' 场')} icon={<Calendar className="w-4 h-4 text-cyan-400" />} />
            <MetricCard label="本周成单" value={priv.weekDeals ? `${priv.weekDeals} 单` : '—'} icon={<Target className="w-4 h-4 text-rose-400" />} />
            <MetricCard label="本周收入" value={priv.weekRevenue ? money(priv.weekRevenue) : '—'} icon={<Activity className="w-4 h-4 text-amber-400" />} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <GlassCard hoverable={false} className="lg:col-span-2">
              <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-400" /> 近 7 天活动场次
              </h3>
              {priv.series.some((s) => s.value) ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={priv.series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="day" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                    <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(20,20,30,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12 }} />
                    <Bar dataKey="value" fill="#14B8A6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyHint text="近 7 天还没有活动记录" to="/community" link="去私域社群录入活动" />
              )}
            </GlassCard>
            <GlassCard hoverable={false}>
              <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" /> 本月热点（{hot.count}）
              </h3>
              {hot.list.length ? (
                <div className="space-y-1.5">
                  {hot.list.map((h) => (
                    <div key={h.id} className="flex items-center gap-2 text-[11px]">
                      <span className="text-amber-300 font-mono shrink-0">{h.date.slice(5)}</span>
                      <span className="text-white/70 truncate flex-1">{h.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyHint text="本月还没有热点" to="/operations" link="去运营管理生成" />
              )}
            </GlassCard>
          </div>
        </>
      )}

      {/* ===== 实习生 ===== */}
      {position === 'intern' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="本周任务" value={myWeekTasks.total ? `${myWeekTasks.done}/${myWeekTasks.total}` : '—'} icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} />
          <MetricCard label="逾期任务" value={String(myOverdue)} tone={myOverdue > 0 ? 'text-rose-300' : 'text-white'} icon={<Clock className="w-4 h-4 text-rose-400" />} />
          <MetricCard label="本周感悟" value={getReflection(currentStaff.name, 'weekly', periodKeyOf('weekly')) ? '已写' : '未写'} sub={getReflection(currentStaff.name, 'weekly', periodKeyOf('weekly')) ? '成长小助手已记录' : '去成长小助手补一条'} icon={<FileText className="w-4 h-4 text-cyan-400" />} />
          <MetricCard label="可用技能" value={`${me?.skillIds.length || 0} 个`} sub="找管理员开通" icon={<Sparkles className="w-4 h-4 text-purple-400" />} />
        </div>
      )}

      {/* ===== 我的任务（非管理员）===== */}
      {!isAdmin && (
        <GlassCard hoverable={false}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 我的本周任务（{myWeekTasks.done}/{myWeekTasks.total}）
            </h3>
            <Link to="/operations" className="text-[11px] text-cyan-300/70 hover:text-cyan-300">去运营管理 →</Link>
          </div>
          {myWeekTasks.list.length ? (
            <div className="space-y-1.5">
              {myWeekTasks.list.map((t) => (
                <div key={t.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-white/5">
                  {t.done ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Circle className="w-3.5 h-3.5 text-white/25 shrink-0" />}
                  <span className={`text-xs flex-1 truncate ${t.done ? 'text-white/40 line-through' : 'text-white/80'}`}>{t.title}</span>
                  <span className="text-[10px] text-white/35 shrink-0">{t.date.slice(5)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyHint text="本周还没有你的任务" to="/operations" link="去运营管理查看" />
          )}
        </GlassCard>
      )}

      {/* ===== 今日待办：个人（取自周报） / 团队（管理员·经理撰写后下放）===== */}
      <GlassCard hoverable={false}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-white font-medium text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" /> 今日待办
          </h3>
          {canAuthorTeam ? (
            <div className="flex gap-1 p-0.5 rounded-lg bg-white/5">
              {([['personal', '个人'], ['team', '团队']] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTodoTab(k)}
                  className={`px-3 py-1 rounded-md text-[11px] transition-colors ${
                    todoTab === k ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/45 hover:text-white/70'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/40">个人</span>
          )}
        </div>

        {todoTab === 'personal' || !canAuthorTeam ? (
          personal || myTeamTodos.length > 0 ? (
            <div className="space-y-3">
              {personal ? (
                <>
                  <p className="text-[10px] text-white/35">
                    来自你的周度复盘报告（{personal.periodKey}）· 勾选状态本地保存，生成新周报后自动重置
                  </p>

                  {personal.actions.length > 0 && (
                    <div>
                      <p className="text-[11px] text-cyan-300/80 mb-1.5 flex items-center gap-1">
                        <Target className="w-3 h-3" /> 下周要做的事情（{countDone(personal.actions)}/{personal.actions.length}）
                      </p>
                      <div className="space-y-1.5">
                        {personal.actions.map((it) => (
                          <div key={it.key} className="flex items-start gap-2.5 p-2 rounded-lg bg-white/5">
                            <button onClick={() => togglePersonal(it.key)} className="shrink-0 mt-0.5">
                              {personalDone[it.key]
                                ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                : <Circle className="w-4 h-4 text-white/25" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm block ${personalDone[it.key] ? 'text-white/40 line-through' : 'text-white/80'}`}>
                                {it.title}
                              </span>
                              {it.expect && <span className="text-[10px] text-white/35 block mt-0.5">预期：{it.expect}</span>}
                            </div>
                            {it.priority === 'high' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 shrink-0">高</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {personal.risks.length > 0 && (
                    <div>
                      <p className="text-[11px] text-amber-300/80 mb-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> 需要注意的（{countDone(personal.risks)}/{personal.risks.length}）
                      </p>
                      <div className="space-y-1.5">
                        {personal.risks.map((it) => (
                          <div key={it.key} className="flex items-start gap-2.5 p-2 rounded-lg bg-white/5">
                            <button onClick={() => togglePersonal(it.key)} className="shrink-0 mt-0.5">
                              {personalDone[it.key]
                                ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                : <Circle className="w-4 h-4 text-white/25" />}
                            </button>
                            <span className={`text-sm flex-1 ${personalDone[it.key] ? 'text-white/40 line-through' : 'text-white/80'}`}>
                              {it.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[10px] text-white/35">
                  还没有你的周度复盘报告，生成后这里会列出「下周要做的事情 / 需要注意的」
                </p>
              )}

              {myTeamTodos.length > 0 && (
                <div>
                  <p className="text-[11px] text-purple-300/80 mb-1.5 flex items-center gap-1">
                    <Send className="w-3 h-3" /> 下放给我的（{myTeamTodos.filter((t) => t.done).length}/{myTeamTodos.length}）
                  </p>
                  <div className="space-y-1.5">
                    {myTeamTodos.map((t) => (
                      <div key={t.id} className="flex items-start gap-2.5 p-2 rounded-lg bg-white/5">
                        <button onClick={() => toggleTeam(t)} className="shrink-0 mt-0.5">
                          {t.done
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            : <Circle className="w-4 h-4 text-white/25" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm block ${t.done ? 'text-white/40 line-through' : 'text-white/80'}`}>
                            {t.text}
                          </span>
                          <span className="text-[10px] text-white/35 block mt-0.5">{t.author} 下放</span>
                        </div>
                        {t.priority === 'high' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 shrink-0">高</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyHint
              text="还没有你的周度复盘报告，个人待办会自动从报告的「下周要做的事情 / 需要注意的」生成"
              to="/growth"
              link="去成长小助手生成周报"
            />
          )
        ) : (
          <div className="space-y-3">
            {canAuthorTeam && (
              <div className="space-y-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/10">
                <p className="text-[10px] text-white/40">撰写团队待办并下放给成员，只有被指派的人能看到</p>
                <input
                  value={teamText}
                  onChange={(e) => setTeamText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTeam()}
                  placeholder="写下一条团队待办..."
                  className="w-full h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25"
                />
                <div className="flex gap-2 flex-wrap">
                  <select
                    value={teamAssignee}
                    onChange={(e) => setTeamAssignee(e.target.value)}
                    className="h-9 px-2 rounded-lg bg-[#2a2a34] border border-white/10 text-xs text-white"
                  >
                    <option value="" className="bg-[#2a2a34] text-white">下放给…</option>
                    {staffList.map((s) => (
                      <option key={s.name} value={s.name} className="bg-[#2a2a34] text-white">{s.name}</option>
                    ))}
                  </select>
                  <select
                    value={teamPriority}
                    onChange={(e) => setTeamPriority(e.target.value as TodoPriority)}
                    className="h-9 px-2 rounded-lg bg-[#2a2a34] border border-white/10 text-xs text-white"
                  >
                    <option value="high" className="bg-[#2a2a34] text-white">高</option>
                    <option value="mid" className="bg-[#2a2a34] text-white">中</option>
                    <option value="low" className="bg-[#2a2a34] text-white">低</option>
                  </select>
                  <button
                    onClick={addTeam}
                    className="h-9 px-3 rounded-lg bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 flex items-center gap-1 text-xs"
                  >
                    <Send className="w-3.5 h-3.5" /> 下放
                  </button>
                </div>
              </div>
            )}

            {visibleTeamTodos.length > 0 ? (
              <div className="space-y-1.5">
                {visibleTeamTodos.map((t) => (
                  <div key={t.id} className="flex items-start gap-2.5 p-2 rounded-lg bg-white/5">
                    <button onClick={() => toggleTeam(t)} className="shrink-0 mt-0.5">
                      {t.done
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        : <Circle className="w-4 h-4 text-white/25" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm block ${t.done ? 'text-white/40 line-through' : 'text-white/80'}`}>
                        {t.text}
                      </span>
                      <span className="text-[10px] text-white/35 block mt-0.5">
                        下放给 {t.assignee}{canAuthorTeam ? ` · ${t.author} 撰写` : ''}
                      </span>
                    </div>
                    {t.priority === 'high' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 shrink-0">高</span>
                    )}
                    {canAuthorTeam && (
                      <button onClick={() => removeTeam(t.id)} className="text-white/25 hover:text-rose-400 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/30 py-4 text-center">
                {canAuthorTeam ? '还没有团队待办，在上面写一条下放给成员' : '目前没有下放给你的团队待办'}
              </p>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
};

/** 抖音 / 小红书专员共用的下半部分：发布趋势 + 近 30 天爆款榜 */
const PlatformBody: React.FC<{ s: ReturnType<typeof platformSummary>; label: string; to: string }> = ({ s, label, to }) => (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <GlassCard hoverable={false} className="lg:col-span-2">
      <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-cyan-400" /> 近 7 天发布量
      </h3>
      {s.series.some((x) => x.value) ? (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={s.series}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="day" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
            <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ backgroundColor: 'rgba(20,20,30,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12 }} />
            <Line type="monotone" dataKey="value" stroke={label === '抖音' ? '#06B6D4' : '#EC4899'} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <EmptyHint text="近 7 天没有发布记录" to={to} link={`去${label}运营同步账号`} />
      )}
    </GlassCard>
    <GlassCard hoverable={false}>
      <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
        <Target className="w-4 h-4 text-rose-400" /> 近 30 天爆款
      </h3>
      {s.top.length ? (
        <div className="space-y-2">
          {s.top.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="text-white/30 w-3 shrink-0">{i + 1}</span>
              <span className="text-white/70 truncate flex-1" title={p.title}>{p.title}</span>
              <span className="text-rose-300 shrink-0">{formatNumber(p.likes)}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint text="近 30 天还没有内容" to={to} link="去同步账号" />
      )}
    </GlassCard>
  </div>
);

export default Dashboard;
