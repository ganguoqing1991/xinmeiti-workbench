// 直播工作间：三大板块
// 1. 上传数据（Excel 场次 + Word 话术文档 + 统计）
// 2. 话术分析（分类自定义 + 评分标准自定义 + LLM 评分排序）
// 3. 直播复盘（视频号/抖音双 Tab + 选 Skill 生成复盘 + 月报汇总）

import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio,
  Upload,
  FileSpreadsheet,
  FileText,
  Trash2,
  Plus,
  Pencil,
  Star,
  Play,
  Loader2,
  Copy,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  BarChart3,
  Calendar,
  Users,
  Eye,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  X,
  RefreshCw,
  ClipboardList,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import GlassCard from '../../components/GlassCard';
import { useWorkspace } from '../../store/workspace';
import {
  getMembers, setOwner, removeOwner, ownerOf, canAssignAccount, LEVEL_META,
} from '../../utils/memberStore';
import Modal from '../../components/Modal';
import { formatNumber } from '../../utils/format';
import { getMyLLMConfig,
  apiMissingHint, type LLMConfig } from '../../utils/llmConfig';
import { callLLMStream } from '../../utils/llmCall';
import {
  getSessions,
  addSessions,
  replaceSessions,
  removeSession,
  sessionStats,
  parseLiveSheets,
  getScripts,
  addScript,
  updateScript,
  removeScript,
  getCategories,
  saveCategories,
  resetCategories,
  getScoreRules,
  saveScoreRules,
  getReviewSkills,
  saveReviewSkills,
  getReports,
  addReport,
  removeReport,
  getScriptDocs,
  addScriptDoc,
  removeScriptDoc,
  type LiveSession,
  type LivePlatform,
  type ScriptItem,
  type ScriptCategory,
  type ScoreRule,
  type ReviewSkill,
  type ReviewReport,
} from '../../utils/liveStore';

type LiveTab = 'dashboard' | 'upload' | 'scripts' | 'review';
type ToastMsg = { type: 'success' | 'error' | 'info'; message: string } | null;

const PLATFORM_LABEL: Record<LivePlatform, string> = {
  shipinhao: '视频号',
  douyin: '抖音',
  unknown: '未识别',
};

const Live: React.FC = () => {
  const [tab, setTab] = useState<LiveTab>('dashboard');
  const [toast, setToast] = useState<ToastMsg>(null);
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2800);
  };

  return (
    <div className="space-y-4">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed top-4 right-4 z-50"
          >
            <div
              className={`px-4 py-2.5 rounded-lg border shadow-lg backdrop-blur-md text-sm ${
                toast.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  : toast.type === 'error'
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                  : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
              }`}
            >
              {toast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div>
        <h2 className="text-white text-2xl font-bold flex items-center gap-2">
          <Radio className="w-7 h-7 text-amber-400" /> 直播工作间
        </h2>
        <p className="text-xs text-white/50 mt-1">上传复盘数据 · 话术分析评分 · AI 复盘报告</p>
      </div>

      {/* Tab 栏（副标题下方，与抖音运营布局一致） */}
      <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10 w-fit">
        {(
          [
            { key: 'dashboard', label: '📊 数据看板' },
            { key: 'upload', label: '📥 上传数据' },
            { key: 'scripts', label: '💬 话术分析' },
            { key: 'review', label: '📋 直播复盘' },
          ] as { key: LiveTab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              tab === t.key
                ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <DashboardPanel />}
      {tab === 'upload' && <UploadPanel showToast={showToast} />}
      {tab === 'scripts' && <ScriptPanel showToast={showToast} />}
      {tab === 'review' && <ReviewPanel showToast={showToast} />}
    </div>
  );
};

// ============================================================
// 板块 0：综合数据看板（折线/柱状/饼图 + 日期筛选 + 提升提示）
// ============================================================
const CHART_COLORS = ['#A855F7', '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#8B5CF6'];

// 提升小提示（截图样式：↗ +6.5% 本周）
const DeltaBadge: React.FC<{ pct: number | null; suffix?: string }> = ({ pct, suffix = '较前期均值' }) => {
  if (pct === null || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
      <TrendingUp className={`w-3 h-3 ${up ? '' : 'rotate-180'}`} />
      {up ? '+' : ''}{pct.toFixed(1)}% {suffix}
    </span>
  );
};

const DashboardPanel: React.FC = () => {
  const sessions = useMemo(() => getSessions(), []);
  const [dateFilter, setDateFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');

  // 日期期次（按出现顺序，即表格录入的时间顺序）
  const dateOptions = useMemo(() => {
    const seen: string[] = [];
    for (const s of sessions) {
      if (s.date && !seen.includes(s.date)) seen.push(s.date);
    }
    return seen;
  }, [sessions]);
  const accountOptions = useMemo(
    () => [...new Set(sessions.map((s) => s.account).filter(Boolean))],
    [sessions]
  );

  const filtered = useMemo(
    () =>
      sessions.filter(
        (s) =>
          (dateFilter === 'all' || s.date === dateFilter) &&
          (accountFilter === 'all' || s.account === accountFilter)
      ),
    [sessions, dateFilter, accountFilter]
  );

  const stats = useMemo(() => sessionStats(filtered), [filtered]);

  // ===== 提升提示：最新一期 vs 之前各期平均值 =====
  const delta = useMemo(() => {
    if (dateOptions.length < 2) return { viewers: null, wechat: null, avgViewers: null } as { viewers: number | null; wechat: number | null; avgViewers: number | null };
    const latest = dateOptions[dateOptions.length - 1];
    const latestRows = sessions.filter((s) => s.date === latest);
    const prevRows = sessions.filter((s) => s.date !== latest);
    const sum = (rows: LiveSession[], f: 'viewers' | 'wechatAdds') => rows.reduce((a, s) => a + (s[f] || 0), 0);
    const avg = (rows: LiveSession[]) => (rows.length ? sum(rows, 'viewers') / rows.length : 0);
    // 前期按"期"平均（避免期次场次数量不同带来偏差）
    const prevDates = dateOptions.slice(0, -1);
    const prevPeriodAvgViewers = prevDates.length
      ? prevDates.reduce((a, d) => a + sum(sessions.filter((s) => s.date === d), 'viewers'), 0) / prevDates.length
      : 0;
    const prevPeriodAvgWechat = prevDates.length
      ? prevDates.reduce((a, d) => a + sum(sessions.filter((s) => s.date === d), 'wechatAdds'), 0) / prevDates.length
      : 0;
    const prevAvgPerSession = prevRows.length ? avg(prevRows) : 0;
    const pct = (cur: number, base: number) => (base > 0 ? ((cur - base) / base) * 100 : null);
    return {
      viewers: pct(sum(latestRows, 'viewers'), prevPeriodAvgViewers),
      wechat: pct(sum(latestRows, 'wechatAdds'), prevPeriodAvgWechat),
      avgViewers: pct(avg(latestRows), prevAvgPerSession),
    };
  }, [sessions, dateOptions]);

  // ===== 折线图：各期平均场观趋势（视频号 vs 抖音）=====
  const trendData = useMemo(
    () =>
      dateOptions.map((d) => {
        const sph = sessions.filter((s) => s.date === d && s.platform === 'shipinhao');
        const dy = sessions.filter((s) => s.date === d && s.platform === 'douyin');
        const avgV = (rows: LiveSession[]) => (rows.length ? Math.round(rows.reduce((a, s) => a + s.viewers, 0) / rows.length) : 0);
        return { date: d, 视频号: avgV(sph), 抖音: avgV(dy) };
      }),
    [sessions, dateOptions]
  );

  // ===== 直播账号负责人 =====
  const { currentStaff } = useWorkspace();
  const [ownerTick, setOwnerTick] = useState(0);
  const ownerCandidates = getMembers().filter((m) => m.status === 'active' && canAssignAccount(currentStaff.name, m.name));
  const canEditOwner = ownerCandidates.length > 0;

  // ===== 柱状图：各账号总场观 TOP10（当前筛选范围）=====
  const barData = useMemo(() => {
    const map = new Map<string, { viewers: number; wechat: number; count: number }>();
    for (const s of filtered) {
      if (!s.account) continue;
      const cur = map.get(s.account) || { viewers: 0, wechat: 0, count: 0 };
      cur.viewers += s.viewers;
      cur.wechat += s.wechatAdds;
      cur.count += 1;
      map.set(s.account, cur);
    }
    return [...map.entries()]
      .map(([account, v]) => ({ account: account.length > 8 ? account.slice(0, 8) + '…' : account, ...v }))
      .sort((a, b) => b.viewers - a.viewers)
      .slice(0, 10);
  }, [filtered]);

  // ===== 饼图：场观平台分布（当前筛选范围）=====
  const pieData = useMemo(() => {
    const sum = (p: LivePlatform) => filtered.filter((s) => s.platform === p).reduce((a, s) => a + s.viewers, 0);
    return [
      { name: '视频号', value: sum('shipinhao') },
      { name: '抖音', value: sum('douyin') },
      { name: '卖货场', value: sum('unknown') },
    ].filter((d) => d.value > 0);
  }, [filtered]);

  // ===== 饼图2：加微账号分布 TOP6 =====
  const wechatPie = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of filtered) {
      if (!s.account || !s.wechatAdds) continue;
      map.set(s.account, (map.get(s.account) || 0) + s.wechatAdds);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name: name.length > 6 ? name.slice(0, 6) + '…' : name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [filtered]);

  if (sessions.length === 0) {
    return (
      <GlassCard hoverable={false}>
        <div className="py-16 text-center">
          <BarChart3 className="w-12 h-12 text-white/15 mx-auto mb-3" />
          <p className="text-sm text-white/40">暂无数据</p>
          <p className="text-xs text-white/30 mt-1">先到「上传数据」板块上传直播复盘表</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* 筛选器 */}
      <GlassCard hoverable={false} className="!p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-white/50">筛选：</span>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white"
          >
            <option value="all">全部日期（{dateOptions.length} 期）</option>
            {dateOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white"
          >
            <option value="all">全部账号（{accountOptions.length} 个）</option>
            {accountOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          {(dateFilter !== 'all' || accountFilter !== 'all') && (
            <button
              onClick={() => { setDateFilter('all'); setAccountFilter('all'); }}
              className="text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white/50 hover:text-white"
            >
              重置
            </button>
          )}
          <span className="text-[10px] text-white/30 ml-auto">当前范围：{filtered.length} 场</span>
        </div>
      </GlassCard>

      {/* 统计卡 + 提升提示 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: '场次', value: `${stats.shipinhaoCount} 视频号 / ${stats.douyinCount} 抖音`, icon: <Radio className="w-4 h-4 text-amber-400" />, badge: null as React.ReactNode },
          { label: '账号数', value: `${stats.accounts}`, icon: <Users className="w-4 h-4 text-cyan-400" />, badge: null },
          { label: '总场观', value: formatNumber(stats.totalViewers), icon: <Eye className="w-4 h-4 text-purple-400" />, badge: <DeltaBadge pct={delta.viewers} suffix="最新一期" /> },
          { label: '场均场观', value: formatNumber(filtered.length ? Math.round(stats.totalViewers / filtered.length) : 0), icon: <TrendingUp className="w-4 h-4 text-emerald-400" />, badge: <DeltaBadge pct={delta.avgViewers} suffix="最新一期" /> },
          { label: '总加微', value: formatNumber(stats.totalWechat), icon: <MessageSquare className="w-4 h-4 text-rose-400" />, badge: <DeltaBadge pct={delta.wechat} suffix="最新一期" /> },
        ].map((c) => (
          <GlassCard key={c.label} hoverable={false} className="!p-3">
            <div className="flex items-center gap-2 mb-1">{c.icon}<span className="text-[10px] text-white/50">{c.label}</span></div>
            <div className="text-white font-bold text-sm">{c.value}</div>
            {c.badge && <div className="mt-1">{c.badge}</div>}
          </GlassCard>
        ))}
      </div>
      {stats.totalGmv > 0 && (
        <div className="text-xs text-white/50 -mt-2">💰 当前范围总 GMV：<span className="text-emerald-300 font-semibold">¥{formatNumber(stats.totalGmv)}</span>（卖货场 {filtered.filter((s) => s.gmv > 0).length} 场）</div>
      )}

      {/* 折线图：场观趋势 */}
      <GlassCard hoverable={false}>
        <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" /> 各期平均场观趋势
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'rgba(20,20,40,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#fff' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="视频号" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="抖音" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      {/* 账号负责人 */}
      <GlassCard hoverable={false}>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-amber-400" /> 账号负责人
          </h3>
          <span className="text-[10px] text-white/35">
            {canEditOwner ? '总监可指派全部账号，经理只能指派给本组' : '只读（需要总监或经理权限）'}
          </span>
        </div>
        {accountOptions.filter((a) => a !== 'all').length === 0 ? (
          <p className="text-xs text-white/30 py-6 text-center">还没有直播账号，先导入场次表</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {accountOptions.filter((a) => a !== 'all').map((name) => {
              const who = ownerOf('live', name);
              const editable = canEditOwner && (!who || canAssignAccount(currentStaff.name, who));
              return (
                <div key={name} className="flex items-center gap-2 p-2.5 rounded-lg bg-white/5 flex-wrap">
                  <span className="text-xs text-white truncate flex-1 min-w-0">{name}</span>
                  {editable ? (
                    <select
                      value={who}
                      onChange={(e) => {
                        if (e.target.value) setOwner('live', name, e.target.value);
                        else removeOwner('live', name);
                        setOwnerTick((v) => v + 1);
                      }}
                      className="text-[10px] h-6 px-1.5 rounded bg-white/5 border border-white/15 text-white/70 max-w-[130px]"
                    >
                      <option value="">+ 指派负责人</option>
                      {ownerCandidates.map((m) => (
                        <option key={m.id} value={m.name}>{m.name}（{LEVEL_META[m.level].label}）</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      who ? 'bg-white/5 text-white/60 border-white/10' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    }`}>{who ? `负责人 ${who}` : '未指派'}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 柱状图：账号场观 TOP10 */}
        <GlassCard hoverable={false}>
          <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-purple-400" /> 账号总场观 TOP10
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="account" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} angle={-35} textAnchor="end" />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'rgba(20,20,40,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="viewers" name="场观" fill="#A855F7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="wechat" name="加微" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* 饼图合集 */}
        <GlassCard hoverable={false}>
          <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
            <Eye className="w-4 h-4 text-cyan-400" /> 占比分布
          </h3>
          <div className="grid grid-cols-2 gap-2 h-64">
            <div>
              <div className="text-[10px] text-white/40 text-center mb-1">场观 · 平台分布</div>
              <ResponsiveContainer width="100%" height="90%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={30} outerRadius={55} label={(p: any) => `${p.name} ${(p.percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'rgba(20,20,40,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="text-[10px] text-white/40 text-center mb-1">加微 · 账号 TOP6</div>
              <ResponsiveContainer width="100%" height="90%">
                <PieChart>
                  <Pie data={wechatPie} dataKey="value" nameKey="name" innerRadius={30} outerRadius={55} label={(p: any) => `${p.name} ${(p.percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {wechatPie.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[(i + 3) % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'rgba(20,20,40,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

// ============================================================
// 板块 1：上传数据
// ============================================================
// 待确认的导入预览
interface ImportPreview {
  fileName: string;
  results: ReturnType<typeof parseLiveSheets>;
  all: Omit<LiveSession, 'id' | 'batchId' | 'importedAt'>[];
}

const UploadPanel: React.FC<{ showToast: (t: 'success' | 'error' | 'info', m: string) => void }> = ({ showToast }) => {
  const [sessions, setSessions] = useState<LiveSession[]>(() => getSessions());
  const [docs, setDocs] = useState(() => getScriptDocs());
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const [docText, setDocText] = useState('');
  const [docName, setDocName] = useState('');

  const stats = useMemo(() => sessionStats(sessions), [sessions]);

  // Excel 上传：只解析生成预览，不写入（等用户点「确认导入」）
  const handleExcel = async (file: File) => {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheets = (wb.SheetNames || []).map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) as any[][],
      }));
      const results = parseLiveSheets(sheets, 3);
      const all = results.flatMap((r) => r.sessions);
      setPreview({ fileName: file.name, results, all });
      if (all.length === 0) {
        showToast('error', '未解析到场次数据，请查看下方各子表识别结果');
      } else {
        showToast('info', `已解析 ${all.length} 场，请确认后导入`);
      }
    } catch (e: any) {
      showToast('error', `Excel 解析失败：${e?.message || '未知错误'}`);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // 确认导入：按当前模式写入
  const confirmImport = () => {
    if (!preview) return;
    const batchId = `batch-${Date.now()}`;
    if (importMode === 'replace') {
      const n = replaceSessions(preview.all, batchId);
      showToast('success', `✓ 已覆盖更新：共 ${n} 场直播数据`);
    } else {
      const { added, skipped } = addSessions(preview.all, batchId);
      showToast('success', `✓ 新增 ${added} 场${skipped > 0 ? `，跳过重复 ${skipped} 场` : ''}`);
    }
    setSessions(getSessions());
    setPreview(null);
  };

  // Word / 文本上传（docx 直接解析提取文字，无需手动复制）
  const handleDocFile = async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop() || '';
    setDocName(file.name);
    try {
      if (ext === 'txt' || ext === 'md') {
        const text = await file.text();
        setDocText(text);
        showToast('info', `已读取「${file.name}」，请确认按话术分类拆分后保存`);
      } else if (ext === 'docx') {
        showToast('info', '正在解析 docx...');
        const { extractDocxText } = await import('../../utils/docxText');
        const text = await extractDocxText(file);
        setDocText(text);
        showToast('success', `✓ 已提取「${file.name}」共 ${text.length} 字，确认拆分后保存`);
      } else {
        showToast('info', `「${file.name}」为旧版 .doc 格式：请另存为 .docx 再上传，或复制内容粘贴到下方`);
      }
    } catch (e: any) {
      showToast('error', `文档解析失败：${e?.message || '未知错误'}，可手动复制内容粘贴到下方`);
    }
    if (docFileRef.current) docFileRef.current.value = '';
  };

  const saveDoc = () => {
    if (!docText.trim()) {
      showToast('error', '请先粘贴/读取话术文档内容');
      return;
    }
    addScriptDoc({
      fileName: docName || `话术文档-${new Date().toLocaleDateString()}`,
      content: docText.trim(),
      note: '待按话术分类拆分',
    });
    setDocs(getScriptDocs());
    setDocText('');
    setDocName('');
    showToast('success', '✓ 话术文档已保存，可在「话术分析」板块拆分使用');
  };

  return (
    <div className="space-y-4">
      {/* 统计卡 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: '已录入场次', value: `${stats.shipinhaoCount} 视频号 / ${stats.douyinCount} 抖音`, icon: <Radio className="w-4 h-4 text-amber-400" /> },
          { label: '直播账号数', value: `${stats.accounts}`, icon: <Users className="w-4 h-4 text-cyan-400" /> },
          { label: '总场观', value: formatNumber(stats.totalViewers), icon: <Eye className="w-4 h-4 text-purple-400" /> },
          { label: '总 GMV', value: stats.totalGmv > 0 ? `¥${formatNumber(stats.totalGmv)}` : '—', icon: <TrendingUp className="w-4 h-4 text-emerald-400" /> },
          { label: '总加微', value: formatNumber(stats.totalWechat), icon: <MessageSquare className="w-4 h-4 text-rose-400" /> },
        ].map((c) => (
          <GlassCard key={c.label} hoverable={false} className="!p-3">
            <div className="flex items-center gap-2 mb-1">{c.icon}<span className="text-[10px] text-white/50">{c.label}</span></div>
            <div className="text-white font-bold text-sm">{c.value}</div>
          </GlassCard>
        ))}
      </div>

      {/* Excel 上传 */}
      <GlassCard hoverable={false}>
        <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-3">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> 上传直播复盘表（Excel）
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleExcel(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {importing ? '解析中...' : '选择 Excel 文件'}
          </button>
          {/* 导入模式 */}
          <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
            <button
              onClick={() => setImportMode('append')}
              className={`px-3 py-1.5 rounded-md text-xs ${importMode === 'append' ? 'bg-emerald-500/30 text-emerald-200' : 'text-white/60'}`}
              title="依次叠加：新数据追加进已有表单，重复的场次自动跳过（适合二次三次上传）"
            >
              追加（自动去重）
            </button>
            <button
              onClick={() => setImportMode('replace')}
              className={`px-3 py-1.5 rounded-md text-xs ${importMode === 'replace' ? 'bg-rose-500/30 text-rose-200' : 'text-white/60'}`}
              title="覆盖更新：清空已有全部场次，用本次文件整体替换"
            >
              覆盖全部
            </button>
          </div>
        </div>
        <p className="text-[10px] text-white/40 mt-2 leading-relaxed">
          · 自动读取前 3 个子表（视频号复盘表 / 抖音复盘表 / 卖货场）；子表名含「视频号/抖音」自动识别平台<br />
          · <strong>追加模式</strong>：新数据依次叠加进表单，重复场次（同平台+账号+场次+日期）自动跳过，适合后续多次上传<br />
          · <strong>覆盖模式</strong>：清空所有已有场次，用本次文件整体替换
        </p>

        {/* 解析预览 + 确认导入 */}
        {preview && (
          <div className="mt-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs text-amber-200 font-medium">
                📄 {preview.fileName} · 共解析 <strong>{preview.all.length}</strong> 场
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreview(null)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs hover:bg-white/10"
                >
                  取消
                </button>
                <button
                  onClick={confirmImport}
                  disabled={preview.all.length === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-medium hover:opacity-90 disabled:opacity-40"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  确认导入（{importMode === 'append' ? '追加去重' : '覆盖全部'}）
                </button>
              </div>
            </div>
            {/* 各子表识别结果 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {preview.results.map((r) => (
                <div key={r.sheetName} className={`p-2.5 rounded-lg border text-xs ${
                  r.sessions.length > 0 ? 'bg-white/5 border-white/10' : 'bg-rose-500/5 border-rose-500/20'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white/80 font-medium">「{r.sheetName}」</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      r.platform === 'shipinhao' ? 'bg-emerald-500/20 text-emerald-300'
                      : r.platform === 'douyin' ? 'bg-cyan-500/20 text-cyan-300'
                      : 'bg-white/10 text-white/40'
                    }`}>
                      {PLATFORM_LABEL[r.platform]}
                    </span>
                  </div>
                  {r.sessions.length > 0 ? (
                    <div className="text-emerald-300/80">✓ 识别 {r.sessions.length} 场</div>
                  ) : (
                    <div className="text-rose-300/80">✗ {r.skipReason || '无数据'}</div>
                  )}
                </div>
              ))}
            </div>
            {/* 场次明细预览 */}
            {preview.all.length > 0 && (
              <div className="max-h-44 overflow-y-auto scrollbar-thin space-y-1 pr-1">
                {preview.all.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-white/5 text-[11px]">
                    <span className={`px-1 py-0.5 rounded text-[9px] shrink-0 ${
                      s.platform === 'shipinhao' ? 'bg-emerald-500/20 text-emerald-300'
                      : s.platform === 'douyin' ? 'bg-cyan-500/20 text-cyan-300'
                      : 'bg-white/10 text-white/40'
                    }`}>
                      {PLATFORM_LABEL[s.platform]}
                    </span>
                    <span className="text-white/80">{s.account || <span className="text-amber-300/70">未填账号</span>}</span>
                    <span className="text-white/40 truncate">{s.sessionName || '—'}</span>
                    <span className="text-white/30 ml-auto shrink-0">
                      场观{formatNumber(s.viewers)} · 加微{s.wechatAdds}{s.gmv > 0 ? ` · ¥${formatNumber(s.gmv)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* Word 话术文档上传（为板块2准备） */}
      <GlassCard hoverable={false}>
        <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-1">
          <FileText className="w-4 h-4 text-purple-400" /> 上传话术文档（Word/文本）
        </h3>
        <div className="p-2.5 mb-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 leading-relaxed">
          ⚠️ 上传文字类话术前，请<strong>提前按话术分类（开场/互动/逼单等）拆分好文案</strong>，每段标注所属分类，这样在「话术分析」板块才能快速归档评分。
        </div>
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <input
            ref={docFileRef}
            type="file"
            accept=".docx,.doc,.txt,.md"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleDocFile(e.target.files[0])}
          />
          <button
            onClick={() => docFileRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs hover:bg-white/10"
          >
            <Upload className="w-3.5 h-3.5" /> 选择文档
          </button>
          {docName && <span className="text-xs text-white/50">{docName}</span>}
        </div>
        <textarea
          value={docText}
          onChange={(e) => setDocText(e.target.value)}
          placeholder={'上传 .docx 自动提取文字到这里，也可以直接粘贴\n建议格式：\n【开场话术】xxx\n【互动话术】xxx'}
          className="w-full h-28 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 resize-none focus:outline-none focus:border-purple-500/50"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={saveDoc}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-medium hover:opacity-90"
          >
            保存话术文档
          </button>
        </div>
        {docs.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                <div className="text-xs text-white/70">
                  <FileText className="w-3 h-3 inline mr-1.5 text-purple-300" />
                  {d.fileName} <span className="text-white/30 ml-2">{d.content.length} 字 · {new Date(d.createdAt).toLocaleDateString()}</span>
                </div>
                <button onClick={() => { removeScriptDoc(d.id); setDocs(getScriptDocs()); }} className="text-rose-300/60 hover:text-rose-300">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* 场次列表 */}
      <GlassCard hoverable={false}>
        <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-3">
          <ClipboardList className="w-4 h-4 text-cyan-400" /> 已录入场次
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">{sessions.length}</span>
        </h3>
        {sessions.length === 0 ? (
          <p className="text-xs text-white/30 py-8 text-center">暂无数据，上传 Excel 复盘表后展示</p>
        ) : (
          <div className="max-h-80 overflow-y-auto scrollbar-thin space-y-1.5 pr-1">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 group">
                <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                  s.platform === 'shipinhao' ? 'bg-emerald-500/20 text-emerald-300'
                  : s.platform === 'douyin' ? 'bg-cyan-500/20 text-cyan-300'
                  : 'bg-white/10 text-white/40'
                }`}>
                  {PLATFORM_LABEL[s.platform]}
                </span>
                <div className="flex-1 min-w-0 text-xs">
                  <span className="text-white/80 font-medium">{s.account || '未填账号'}</span>
                  <span className="text-white/40 mx-1.5">·</span>
                  <span className="text-white/60">{s.sessionName || s.sourceSheet}</span>
                  {s.date && <><span className="text-white/40 mx-1.5">·</span><span className="text-white/40">{s.date}</span></>}
                </div>
                <div className="text-[10px] text-white/50 shrink-0 hidden md:block">
                  场观 {formatNumber(s.viewers)} · 加微 {s.wechatAdds}{s.gmv > 0 ? ` · GMV ¥${formatNumber(s.gmv)}` : ''}
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`删除「${s.account} ${s.sessionName}」这条记录？`)) {
                      removeSession(s.id);
                      setSessions(getSessions());
                      showToast('success', '已删除');
                    }
                  }}
                  className="text-rose-300/40 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
};

// ============================================================
// 板块 2：话术分析
// ============================================================
const ScriptPanel: React.FC<{ showToast: (t: 'success' | 'error' | 'info', m: string) => void }> = ({ showToast }) => {
  const [scripts, setScripts] = useState<ScriptItem[]>(() => getScripts());
  const [categories, setCategories] = useState<ScriptCategory[]>(() => getCategories());
  const [rules, setRules] = useState<ScoreRule[]>(() => getScoreRules());
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [showAddScript, setShowAddScript] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [showRuleManager, setShowRuleManager] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [scoreProgress, setScoreProgress] = useState('');
  const sessions = useMemo(() => getSessions(), []);
  // 已上传话术文档（板块1上传的 docx/txt），供「添加话术」提取
  const [scriptDocs] = useState(() => getScriptDocs());
  const [docListOpen, setDocListOpen] = useState(false);

  // 新话术表单
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState(categories[0]?.key || 'opening');
  const [newDate, setNewDate] = useState('');
  const [newSessionRef, setNewSessionRef] = useState('');
  const [newAccount, setNewAccount] = useState('');
  // 文档型话术折叠展开状态
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  // 单条拆分进行中
  const [splittingIds, setSplittingIds] = useState<Set<string>>(new Set());

  // 单条触发拆分
  const handleSplitOne = async (doc: ScriptItem) => {
    if (splittingIds.has(doc.id)) return;
    setSplittingIds((prev) => new Set(prev).add(doc.id));
    try {
      const r = await splitOneDoc(doc);
      if (r.ok) {
        setScripts(getScripts());
        showToast('success', `✓ 已拆分为 ${r.added} 条分类话术，点「AI 评分排序」打分`);
      } else {
        showToast('error', `拆分失败：${r.error}`);
      }
    } finally {
      setSplittingIds((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
    }
  };

  const filtered = activeCategory === 'all' ? scripts : scripts.filter((s) => s.categoryKey === activeCategory);
  const sorted = [...filtered].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const UNCATEGORIZED = '__uncategorized__';
  const coreOfLabel = (label: string) => label.replace(/话术$/, '').replace(/^cat-/, '').replace(/话术$/, '').trim();
  // 精确 key → 核心词互含模糊匹配（修复孤儿 key 显示原始 key 的问题）
  const catOf = (key: string): { key: string; label: string; icon: string } | undefined => {
    if (key === UNCATEGORIZED) return { key: UNCATEGORIZED, label: '未分类', icon: '📥' };
    const exact = categories.find((c) => c.key === key);
    if (exact) return exact;
    // 孤儿 key（如 cat-转化-8）：提取核心词与现有分类互含匹配
    const core = coreOfLabel(key);
    if (!core) return undefined;
    return categories.find((c) => {
      const cl = coreOfLabel(c.label);
      return cl === core || cl.includes(core) || core.includes(cl);
    });
  };

  // 孤儿 key 自动修复：挂载时把找不到分类的话术迁移到相似分类
  React.useEffect(() => {
    const all = getScripts();
    const orphans = all.filter((s) => s.categoryKey !== UNCATEGORIZED && !categories.some((c) => c.key === s.categoryKey));
    if (orphans.length === 0) return;
    let fixed = 0;
    for (const s of orphans) {
      const core = coreOfLabel(s.categoryKey);
      const target = categories.find((c) => {
        const cl = coreOfLabel(c.label);
        return cl === core || (core && (cl.includes(core) || core.includes(cl)));
      });
      if (target) {
        updateScript(s.id, { categoryKey: target.key });
        fixed++;
      }
    }
    if (fixed > 0) setScripts(getScripts());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length]);

  // 合集分组：文档型在上，短话术按来源文档 splitFrom 分组成「合集子页」
  const docItems = sorted.filter((s) => (s.content || '').length >= 300 || s.categoryKey === UNCATEGORIZED);
  const shortItems = sorted.filter((s) => !((s.content || '').length >= 300 || s.categoryKey === UNCATEGORIZED));
  const groupedShorts = useMemo(() => {
    const groups = new Map<string, typeof shortItems>();
    for (const s of shortItems) {
      const g = s.splitFrom || '__manual__';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(s);
    }
    // 组内按评分 desc；组间按组内最高分 desc，手动添加组排最后
    return [...groups.entries()]
      .map(([from, items]) => ({
        from,
        items: [...items].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
        top: Math.max(...items.map((i) => i.score ?? -1)),
      }))
      .sort((a, b) => (a.from === '__manual__' ? 1 : b.from === '__manual__' ? -1 : b.top - a.top));
  }, [shortItems]);

  const handleAddScript = () => {
    if (!newContent.trim()) {
      showToast('error', '话术内容不能为空');
      return;
    }
    addScript({
      categoryKey: newCategory,
      title: newTitle.trim() || undefined,
      content: newContent.trim(),
      date: newDate,
      sessionRef: newSessionRef,
      account: newAccount,
      platform: 'unknown',
    });
    setScripts(getScripts());
    setNewTitle('');
    setNewContent('');
    setNewDate('');
    setNewSessionRef('');
    setShowAddScript(false);
    showToast('success', '✓ 话术已添加' + (newContent.trim().length >= 300 ? '（整篇文档，点「AI 评分排序」自动拆分分类）' : ''));
  };

  // 动作标签图标表
  const TAG_ICON: Record<string, string> = {
    '开场': '🎬', '控品': '📦', '产品介绍': '📦', '拉新': '🧲', '转化': '💰',
    '加微': '➕', '互动': '💬', '逼单': '🔥', '留人': '📌', '结束': '👏',
  };

  // 拆分单份文档为动作标签话术（返回 {ok, added, error}）；新标签自动建成分类
  const splitOneDoc = async (doc: ScriptItem): Promise<{ ok: boolean; added: number; error?: string }> => {
    const llmRaw = getMyLLMConfig('xiaohongshu');
    if (!llmRaw.apiKey) return { ok: false, added: 0, error: apiMissingHint() };
    // 拆分输出较长（整篇文档 → 多条 JSON），maxTokens 至少 8192 防止截断
    const llm = { ...llmRaw, maxTokens: Math.max(llmRaw.maxTokens || 0, 8192) };
    const existLabels = categories.map((c) => c.label).join('/');
    const prompt = `你是直播话术动作拆解专家。把下面这份直播话术文档，按「动作标签」拆分成多条独立话术。

【参考动作标签】（优先使用，也可根据内容自定义更准确的）
开场 / 控品 / 拉新 / 转化 / 加微 / 互动 / 逼单 / 留人 / 结束${existLabels ? `（已有分类也可用：${existLabels}）` : ''}

【输出格式】只输出 JSON 数组，不要任何其他文字、不要代码块标记、不要解释：
[{"tag":"开场","content":"..."},{"tag":"加微","content":"..."}]

【要求】
1. 每条话术是完整、可独立使用的一段（保留原文表述，不要改写）
2. 文档里用【】标注了分类的，优先按标注归类
3. 同一标签可以拆出多条话术
4. 不要遗漏文档中的话术内容，也不要编造新内容
5. 每条 content 至少 10 个字

【话术文档】
${doc.content.slice(0, 6000)}`;
    let result = '';
    try {
      result = await callLLMStream(llm, [{ role: 'user', content: prompt }], () => {}, () => {});
    } catch (e: any) {
      return { ok: false, added: 0, error: `AI 调用失败：${e?.message?.slice(0, 60) || '未知'}` };
    }
    const m = result.match(/\[[\s\S]*\]/);
    if (!m) return { ok: false, added: 0, error: 'AI 未返回可解析的拆分结果（未找到 JSON 数组）' };
    let arr: any[];
    try {
      arr = JSON.parse(m[0]);
    } catch {
      return { ok: false, added: 0, error: '拆分结果 JSON 解析失败（可能输出被 maxTokens 截断）' };
    }
    const items = (Array.isArray(arr) ? arr : []).filter(
      (it: any) => it && typeof it.content === 'string' && it.content.trim().length >= 10
    );
    if (items.length === 0) return { ok: false, added: 0, error: 'AI 返回的数组为空或无有效话术（每条需 ≥10 字）' };
    // 动态分类表：先匹配现有类似分类（控品→控品话术），没有才新建「XX话术」
    const currentCats = [...getCategories()];
    const coreOf = (label: string) => label.replace(/话术$/, '').trim();
    const ensureCategory = (tag: string): string => {
      const core = coreOf(String(tag || ''));
      if (!core) return doc.categoryKey;
      // ① 核心词互含匹配现有分类（'控品' 命中 '控品话术'，'转化' 命中 '转化话术'）
      const exist = currentCats.find((c) => {
        const cl = coreOf(c.label);
        return cl === core || cl.includes(core) || core.includes(cl);
      });
      if (exist) return exist.key;
      // ② 没有类似分类 → 新建「XX话术」，key 稳定（同核心词永远同 key，不重复建）
      const label = `${core}话术`;
      const key = `cat-${core}`;
      if (!currentCats.some((c) => c.key === key)) {
        currentCats.push({ key, label, icon: TAG_ICON[core] || '🏷️' });
      }
      return key;
    };
    // 先算好全部标签的分类 key；splitFrom 标记来源文档（合集子页分组用）
    const docTitle = doc.title || doc.content.slice(0, 20) + '…';
    const mapped = items.map((it) => ({
      categoryKey: ensureCategory(it.tag || it.category),
      content: String(it.content).trim(),
    }));
    // 第一步：分类必须先落盘成功（否则话术按新 key 归档后分类栏显示不了）
    const savedOk = saveCategories(currentCats);
    if (!savedOk) {
      return { ok: false, added: 0, error: '分类保存失败（浏览器存储可能已满，请到「管理分类」点「恢复默认分类」后重试）' };
    }
    setCategories(currentCats);
    // 第二步：写入拆分出的话术（带来源标记），再删除原文档
    for (const it of mapped) {
      addScript({
        categoryKey: it.categoryKey,
        title: undefined,
        content: it.content,
        date: doc.date,
        sessionRef: doc.sessionRef,
        account: doc.account,
        platform: doc.platform,
        splitFrom: docTitle,
      });
    }
    removeScript(doc.id);
    return { ok: true, added: mapped.length };
  };

  // LLM 评分排序（含前置步骤：长文档型话术自动拆分为分类话术）
  const handleScore = async () => {
    const llm = getMyLLMConfig('xiaohongshu');
    if (!llm.apiKey) {
      showToast('error', apiMissingHint());
      return;
    }
    const enabledRules = rules.filter((r) => r.enabled);
    if (enabledRules.length === 0) {
      showToast('error', '请先在「评分标准」中启用至少一条标准');
      return;
    }
    setScoring(true);
    try {
      // ===== 前置：拆分长文档型话术（自动打标签，新标签自动建成分类）=====
      const LONG_DOC_LEN = 300;
      const splitSource = getScripts().filter(
        (s) => (activeCategory === 'all' || s.categoryKey === activeCategory) && (s.content || '').length >= LONG_DOC_LEN
      );
      if (splitSource.length > 0) {
        let splitOk = 0;
        const splitErrors: string[] = [];
        for (const doc of splitSource) {
          setScoreProgress(`拆分文档话术 ${splitOk + 1}/${splitSource.length}...`);
          const r = await splitOneDoc(doc);
          if (r.ok) {
            splitOk++;
          } else {
            splitErrors.push(`「${doc.title || doc.content.slice(0, 12) + '…'}」${r.error}`);
          }
        }
        setScripts(getScripts());
        if (splitOk > 0) showToast('success', `✓ 已拆分 ${splitOk} 份文档，按动作标签自动归类`);
        // 拆分失败必须明示，不再静默
        if (splitErrors.length > 0) {
          showToast('error', `拆分未完成：${splitErrors[0]}${splitErrors.length > 1 ? `（另 ${splitErrors.length - 1} 条也失败）` : ''}`);
        }
      }

      // ===== 评分（排除未拆分的整篇文档——整篇不能当一条话术打分）=====
      const targets = getScripts().filter(
        (s) => (activeCategory === 'all' || s.categoryKey === activeCategory) && (s.content || '').length < LONG_DOC_LEN
      );
      if (targets.length === 0) {
        showToast('error', '当前分类下没有话术可评分');
        return;
      }
      // 场次数据摘要（供高场观/高引流关联评分）
      const sessionDigest = sessions.slice(0, 30).map((s) =>
        `场次[${s.sessionName || s.date}] 账号${s.account} 场观${s.viewers} 加微${s.wechatAdds} 转化${s.conversions}`
      ).join('\n');
      let done = 0;
      for (const script of targets) {
        setScoreProgress(`评分中 ${++done}/${targets.length}...`);
        const prompt = `你是直播话术评分专家。请按以下评分标准给这段直播话术打分（0-10 分，可含 1 位小数）。

【评分标准】（按权重综合考虑）
${enabledRules.map((r) => `- ${r.name}（权重${r.weight}）：${r.description}`).join('\n')}

【直播场次数据参考】（用于判断高场观/高引流关联）
${sessionDigest || '（暂无场次数据，仅按话术本身质量评分）'}

【待评分话术】
分类：${catOf(script.categoryKey)?.label || script.categoryKey}
使用日期/场次：${script.date || '未标注'} ${script.sessionRef || ''}
内容：${script.content}

【输出格式】（严格遵守，只输出两行）
分数：X.X
理由：一句话说明（50字内）`;
        try {
          const result = await callLLMStream(llm, [{ role: 'user', content: prompt }], () => {}, () => {});
          const scoreMatch = result.match(/分数[：:]\s*([\d.]+)/);
          const reasonMatch = result.match(/理由[：:]\s*(.+)/);
          const score = scoreMatch ? Math.min(10, Math.max(0, parseFloat(scoreMatch[1]))) : undefined;
          updateScript(script.id, {
            score,
            scoreReason: reasonMatch?.[1]?.trim().slice(0, 120),
          });
        } catch (e) {
          console.error('[话术评分] 单条失败', e);
        }
      }
      setScripts(getScripts());
      showToast('success', `✓ 评分完成，已按分数排序`);
    } finally {
      setScoring(false);
      setScoreProgress('');
    }
  };

  return (
    <div className="space-y-4">
      {/* 分类栏 + 操作 */}
      <GlassCard hoverable={false}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs ${activeCategory === 'all' ? 'bg-purple-500/30 text-purple-200 border border-purple-500/40' : 'bg-white/5 text-white/60 border border-white/10'}`}
            >
              全部（{scripts.length}）
            </button>
            {categories.map((c) => (
              <button
                key={c.key}
                onClick={() => setActiveCategory(c.key)}
                className={`px-3 py-1.5 rounded-lg text-xs ${activeCategory === c.key ? 'bg-purple-500/30 text-purple-200 border border-purple-500/40' : 'bg-white/5 text-white/60 border border-white/10'}`}
              >
                {c.icon} {c.label}（{scripts.filter((s) => s.categoryKey === c.key).length}）
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCatManager(true)} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs hover:bg-white/10">
              管理分类
            </button>
            <button onClick={() => setShowRuleManager(true)} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs hover:bg-white/10">
              评分标准
            </button>
            <button
              onClick={() => setShowAddScript(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> 添加话术
            </button>
            <button
              onClick={handleScore}
              disabled={scoring}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-medium disabled:opacity-50"
            >
              {scoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
              {scoring ? scoreProgress : 'AI 评分排序'}
            </button>
          </div>
        </div>

        {/* 话术列表：文档型折叠卡在上 + 短话术按来源文档分组合集 */}
        {sorted.length === 0 ? (
          <p className="text-xs text-white/30 py-10 text-center">暂无话术，点「添加话术」录入，或先在「上传数据」板块上传话术文档</p>
        ) : (
          <div className="space-y-3 max-h-[520px] overflow-y-auto scrollbar-thin pr-1">
            {/* 文档型（待拆分）折叠卡 */}
            {docItems.map((s) => {
              const expanded = expandedDocs.has(s.id);
              return (
                <div key={s.id} className="rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 group">
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button
                      onClick={() => {
                        const next = new Set(expandedDocs);
                        if (expanded) next.delete(s.id); else next.add(s.id);
                        setExpandedDocs(next);
                      }}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      {expanded ? <ChevronDown className="w-3.5 h-3.5 text-white/40 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-white/40 shrink-0" />}
                      <FileText className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                      <span className="text-xs text-white font-medium truncate">{s.title || s.content.slice(0, 20) + '…'}</span>
                      <span className="text-[10px] text-white/30 shrink-0">{s.content.length} 字</span>
                    </button>
                    <button
                      onClick={() => handleSplitOne(s)}
                      disabled={splittingIds.has(s.id)}
                      className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 hover:bg-amber-500/30 shrink-0 disabled:opacity-50"
                      title="AI 把这份文档拆分为分类话术"
                    >
                      {splittingIds.has(s.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      {splittingIds.has(s.id) ? '拆分中' : 'AI 拆分'}
                    </button>
                    {s.score !== undefined ? (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                        s.score >= 8 ? 'bg-emerald-500/20 text-emerald-300'
                        : s.score >= 6 ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-white/10 text-white/50'
                      }`}>
                        ★ 已评分 {s.score.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/40 shrink-0">未评分</span>
                    )}
                    <button
                      onClick={() => { removeScript(s.id); setScripts(getScripts()); }}
                      className="text-rose-300/40 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {expanded && (
                    <div className="px-3 pb-3 border-t border-white/5 pt-2">
                      <p className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto scrollbar-thin">{s.content}</p>
                    </div>
                  )}
                </div>
              );
            })}

            {/* 合集子页：按来源文档分组（区分是哪份文档拆出来的） */}
            {groupedShorts.map((g) => {
              const scored = g.items.filter((i) => i.score !== undefined);
              const avg = scored.length ? (scored.reduce((a, i) => a + (i.score || 0), 0) / scored.length).toFixed(1) : null;
              return (
                <div key={g.from} className="rounded-xl border border-white/10 overflow-hidden">
                  {/* 合集头 */}
                  <div className="px-3 py-2 bg-white/8 border-b border-white/10 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span className="text-xs text-white/80 font-medium truncate">
                      {g.from === '__manual__' ? '手动添加的话术' : `合集 · ${g.from}`}
                    </span>
                    <span className="text-[10px] text-white/40 shrink-0">{g.items.length} 条</span>
                    {avg && <span className="text-[10px] text-emerald-300 shrink-0 ml-auto">平均 ★{avg}</span>}
                  </div>
                  <div className="p-2 space-y-2">
                    {g.items.map((s) => (
                      <div key={s.id} className="p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 group">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                                {catOf(s.categoryKey)?.icon} {catOf(s.categoryKey)?.label || s.categoryKey}
                              </span>
                              {s.date && (
                                <span className="text-[10px] text-white/40 flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />{s.date}{s.sessionRef ? ` · ${s.sessionRef}` : ''}
                                </span>
                              )}
                              {s.score !== undefined ? (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                  s.score >= 8 ? 'bg-emerald-500/20 text-emerald-300'
                                  : s.score >= 6 ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-white/10 text-white/50'
                                }`}>
                                  ★ {s.score.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/40">未评分</span>
                              )}
                            </div>
                            <p className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap">{s.content}</p>
                            {s.scoreReason && <p className="text-[10px] text-white/40 mt-1">💡 {s.scoreReason}</p>}
                          </div>
                          <button
                            onClick={() => { removeScript(s.id); setScripts(getScripts()); }}
                            className="text-rose-300/40 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* 添加话术 Modal */}
      <Modal open={showAddScript} onClose={() => setShowAddScript(false)} title="添加话术" subtitle="可从已上传文档提取内容；保存到「全部」后点「AI 评分排序」自动拆分分类" maxWidth="max-w-lg">
        <div className="space-y-3">
          {/* 从已上传文档提取（折叠） */}
          {scriptDocs.length > 0 && (
            <div className="rounded-lg border border-purple-500/30 bg-purple-500/5">
              <button
                onClick={() => setDocListOpen(!docListOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-purple-200"
              >
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> 从已上传文档提取（{scriptDocs.length} 份）
                </span>
                {docListOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {docListOpen && (
                <div className="px-2 pb-2 space-y-1 max-h-36 overflow-y-auto scrollbar-thin">
                  {scriptDocs.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        setNewContent(d.content);
                        setNewTitle(d.fileName);
                        setNewCategory('__uncategorized__');
                        setDocListOpen(false);
                        showToast('info', `已填入「${d.fileName}」· 保存后点「AI 评分排序」自动拆分打标签`);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded bg-white/5 hover:bg-purple-500/20 text-xs text-white/70 transition-colors"
                    >
                      <FileText className="w-3 h-3 inline mr-1.5 text-purple-300" />
                      {d.fileName}
                      <span className="text-white/30 ml-2">{d.content.length} 字</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            <label className="text-[10px] text-white/50 block mb-1">标题（整篇文档填文档名，列表里折叠显示）</label>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="如：暑期直播话术合集.docx" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-white/50 block mb-1">话术分类</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                <option value="__uncategorized__">📥 未分类（整篇文档待 AI 拆分）</option>
                {categories.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-white/50 block mb-1">直播日期</label>
              <input value={newDate} onChange={(e) => setNewDate(e.target.value)} placeholder="如 2.25" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
            </div>
            <div>
              <label className="text-[10px] text-white/50 block mb-1">哪一场直播</label>
              <input value={newSessionRef} onChange={(e) => setNewSessionRef(e.target.value)} placeholder="如 第一场" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
            </div>
            <div>
              <label className="text-[10px] text-white/50 block mb-1">账号（可选）</label>
              <input value={newAccount} onChange={(e) => setNewAccount(e.target.value)} placeholder="账号名称" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-white/50 block mb-1">话术内容</label>
            <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={5} placeholder="粘贴/输入话术原文..." className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddScript(false)} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
            <button onClick={handleAddScript} className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium">保存</button>
          </div>
        </div>
      </Modal>

      {/* 分类管理 Modal */}
      <CategoryManager
        open={showCatManager}
        onClose={() => setShowCatManager(false)}
        categories={categories}
        onSave={(list) => {
          const ok = saveCategories(list);
          if (ok) {
            setCategories(list);
            showToast('success', '✓ 分类已更新');
          } else {
            showToast('error', '分类保存失败：浏览器存储可能已满，可先点「恢复默认分类」再重试');
          }
        }}
        onResetDefault={() => {
          const d = resetCategories();
          setCategories(d);
          showToast('success', '✓ 已恢复默认分类，可重新新增');
        }}
      />

      {/* 评分标准管理 Modal */}
      <RuleManager
        open={showRuleManager}
        onClose={() => setShowRuleManager(false)}
        rules={rules}
        onSave={(list) => { saveScoreRules(list); setRules(list); showToast('success', '✓ 评分标准已更新'); }}
      />
    </div>
  );
};

// 分类管理
const CategoryManager: React.FC<{
  open: boolean; onClose: () => void;
  categories: ScriptCategory[];
  onSave: (list: ScriptCategory[]) => void;
  onResetDefault?: () => void;
}> = ({ open, onClose, categories, onSave, onResetDefault }) => {
  const [list, setList] = useState<ScriptCategory[]>(categories);
  const [newLabel, setNewLabel] = useState('');
  const [newIcon, setNewIcon] = useState('💬');
  React.useEffect(() => { if (open) setList(categories); }, [open, categories]);

  return (
    <Modal open={open} onClose={onClose} title="话术分类管理" subtitle="自定义增删改，删除分类不会删除已有话术" maxWidth="max-w-md">
      <div className="space-y-2">
        {list.length === 0 && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
            ⚠️ 当前分类为空（数据异常）。点击下方「恢复默认分类」一键修复，再重新新增。
          </div>
        )}
        {list.map((c, i) => (
          <div key={c.key} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
            <input
              value={c.icon}
              onChange={(e) => setList(list.map((x, xi) => xi === i ? { ...x, icon: e.target.value } : x))}
              className="w-10 px-1 py-1 rounded bg-white/5 border border-white/10 text-center text-sm"
            />
            <input
              value={c.label}
              onChange={(e) => setList(list.map((x, xi) => xi === i ? { ...x, label: e.target.value } : x))}
              className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/10 text-sm text-white"
            />
            <button onClick={() => setList(list.filter((_, xi) => xi !== i))} className="text-rose-300/60 hover:text-rose-300">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-2">
          <input value={newIcon} onChange={(e) => setNewIcon(e.target.value)} className="w-10 px-1 py-1.5 rounded bg-white/5 border border-white/10 text-center text-sm" placeholder="💬" />
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="新分类名称" className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          <button
            onClick={() => {
              if (!newLabel.trim()) return;
              setList([...list, { key: `cat-${Date.now()}`, label: newLabel.trim(), icon: newIcon || '💬' }]);
              setNewLabel('');
            }}
            className="px-3 py-1.5 rounded-lg bg-purple-500/30 text-purple-200 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          {onResetDefault && (
            <button
              onClick={() => { onResetDefault(); onClose(); }}
              className="px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs mr-auto"
            >
              恢复默认分类
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
          <button onClick={() => { onSave(list); onClose(); }} className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium">保存</button>
        </div>
      </div>
    </Modal>
  );
};

// 评分标准管理
const RuleManager: React.FC<{
  open: boolean; onClose: () => void;
  rules: ScoreRule[];
  onSave: (list: ScoreRule[]) => void;
}> = ({ open, onClose, rules, onSave }) => {
  const [list, setList] = useState<ScoreRule[]>(rules);
  React.useEffect(() => { if (open) setList(rules); }, [open, rules]);

  return (
    <Modal open={open} onClose={onClose} title="评分标准管理" subtitle="评分标准会拼进 AI 评分 prompt；标准版可改，改后点「AI 评分排序」生效" maxWidth="max-w-xl">
      <div className="space-y-2 max-h-[50vh] overflow-y-auto scrollbar-thin pr-1">
        {list.map((r, i) => (
          <div key={r.id} className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => setList(list.map((x, xi) => xi === i ? { ...x, enabled: e.target.checked } : x))}
                className="accent-purple-500"
              />
              <input
                value={r.name}
                onChange={(e) => setList(list.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))}
                className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/10 text-sm text-white font-medium"
              />
              <label className="text-[10px] text-white/40 flex items-center gap-1 shrink-0">
                权重
                <input
                  type="number" min={1} max={10}
                  value={r.weight}
                  onChange={(e) => setList(list.map((x, xi) => xi === i ? { ...x, weight: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) } : x))}
                  className="w-12 px-1 py-1 rounded bg-white/5 border border-white/10 text-sm text-white text-center"
                />
              </label>
              <button onClick={() => setList(list.filter((_, xi) => xi !== i))} className="text-rose-300/60 hover:text-rose-300 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              value={r.description}
              onChange={(e) => setList(list.map((x, xi) => xi === i ? { ...x, description: e.target.value } : x))}
              rows={2}
              className="w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-xs text-white/80 resize-none"
              placeholder="评分要求描述（会拼进 AI prompt）"
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => setList([...list, { id: `rule-${Date.now()}`, name: '新标准', description: '', weight: 5, enabled: true }])}
        className="mt-2 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs hover:bg-white/10"
      >
        <Plus className="w-3.5 h-3.5" /> 新增标准
      </button>
      <div className="flex justify-end gap-2 pt-3">
        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
        <button onClick={() => { onSave(list); onClose(); }} className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium">保存</button>
      </div>
    </Modal>
  );
};

// ============================================================
// 板块 3：直播复盘
// ============================================================
const ReviewPanel: React.FC<{ showToast: (t: 'success' | 'error' | 'info', m: string) => void }> = ({ showToast }) => {
  const [platform, setPlatform] = useState<'shipinhao' | 'douyin'>('shipinhao');
  const [skills, setSkills] = useState<ReviewSkill[]>(() => getReviewSkills());
  const [reports, setReports] = useState<ReviewReport[]>(() => getReports());
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [currentOutput, setCurrentOutput] = useState('');
  const [showSkillManager, setShowSkillManager] = useState(false);
  // 场次筛选（账号 / 日期）
  const [accountFilter, setAccountFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const sessions = useMemo(() => getSessions(), []);

  const platformSessions = sessions.filter((s) => s.platform === platform);
  // 筛选选项（当前平台下）
  const accountOptions = useMemo(
    () => [...new Set(platformSessions.map((s) => s.account).filter(Boolean))],
    [platformSessions]
  );
  const dateOptions = useMemo(() => {
    const seen: string[] = [];
    for (const s of platformSessions) {
      if (s.date && !seen.includes(s.date)) seen.push(s.date);
    }
    return seen;
  }, [platformSessions]);
  const filteredSessions = useMemo(
    () =>
      platformSessions.filter(
        (s) =>
          (accountFilter === 'all' || s.account === accountFilter) &&
          (dateFilter === 'all' || s.date === dateFilter)
      ),
    [platformSessions, accountFilter, dateFilter]
  );
  const platformReports = reports.filter((r) => r.platform === platform && !r.isMonthly);
  const monthlyReports = reports.filter((r) => r.isMonthly);
  const usableSkills = skills.filter((s) => s.enabled && (s.platform === platform || s.platform === 'all'));
  const activeSkill = skills.find((s) => s.id === selectedSkillId) || usableSkills[0];

  const toggleSession = (id: string) => {
    const next = new Set(selectedSessions);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedSessions(next);
  };

  // 生成复盘
  const handleReview = async () => {
    const llm = getMyLLMConfig('xiaohongshu');
    if (!llm.apiKey) {
      showToast('error', apiMissingHint());
      return;
    }
    if (!activeSkill) {
      showToast('error', '请先选择一个复盘 Skill');
      return;
    }
    const targets = platformSessions.filter((s) => selectedSessions.has(s.id));
    if (targets.length === 0) {
      showToast('error', '请勾选至少一场直播数据');
      return;
    }
    setGenerating(true);
    setCurrentOutput('');
    const dataText = targets.map((s, i) =>
      `第${i + 1}场：平台${PLATFORM_LABEL[s.platform]} 账号${s.account || '未填'} 场次${s.sessionName || '未填'} 日期${s.date || '未填'} 时长${s.duration || '—'} 时段${s.timeSlot || '—'} 场观${s.viewers} 最高在线${s.peakOnline} 平均在线${s.avgOnline} 新增关注${s.newFollowers} 加微${s.wechatAdds} 转化${s.conversions}${s.gmv > 0 ? ` GMV¥${s.gmv}` : ''}`
    ).join('\n');
    try {
      const result = await callLLMStream(
        llm,
        [
          { role: 'system', content: activeSkill.prompt },
          { role: 'user', content: `以下是 ${targets.length} 场${PLATFORM_LABEL[platform]}直播数据，请输出复盘报告：\n\n${dataText}` },
        ],
        (chunk) => setCurrentOutput((prev) => prev + chunk),
        () => {},
      );
      if (result.trim()) {
        const month = (targets[0].date || new Date().toISOString()).slice(0, 7).replace(/[^\d-]/g, '') || new Date().toISOString().slice(0, 7);
        addReport({
          platform,
          skillId: activeSkill.id,
          skillLabel: activeSkill.label,
          sessionIds: targets.map((s) => s.id),
          content: result,
          month,
          isMonthly: false,
        });
        setReports(getReports());
        showToast('success', '✓ 复盘完成，报告已保存');
      }
    } catch (e: any) {
      showToast('error', `复盘失败：${e?.message?.slice(0, 80) || '未知'}`);
    } finally {
      setGenerating(false);
    }
  };

  // 月度汇总
  const handleMonthly = async () => {
    const llm = getMyLLMConfig('xiaohongshu');
    if (!llm.apiKey) {
      showToast('error', apiMissingHint());
      return;
    }
    const targets = platformReports.filter((r) => selectedReports.has(r.id));
    if (targets.length < 2) {
      showToast('error', '请勾选至少 2 份单场复盘报告');
      return;
    }
    setGenerating(true);
    setCurrentOutput('');
    const digest = targets.map((r, i) => `【报告${i + 1}】${r.month} · Skill「${r.skillLabel}」\n${r.content.slice(0, 1500)}`).join('\n\n');
    try {
      const result = await callLLMStream(
        llm,
        [
          { role: 'system', content: `你是直播运营总监。基于以下 ${targets.length} 份单场直播复盘报告，输出一份【月度复盘汇总】，格式：
【本月整体数据趋势】各场核心指标的横向对比与趋势判断
【共性问题】多份报告中反复出现的问题（按频次排序）
【已验证有效的打法】多场都证明有效的动作/话术
【下月重点计划】3-5 条，每条注明负责方向与验收标准
要求：合并同类项，不重复罗列单场细节，聚焦趋势与决策。` },
          { role: 'user', content: digest },
        ],
        (chunk) => setCurrentOutput((prev) => prev + chunk),
        () => {},
      );
      if (result.trim()) {
        addReport({
          platform,
          skillId: '__monthly__',
          skillLabel: '月度汇总',
          sessionIds: targets.map((r) => r.id),
          content: result,
          month: targets[0].month,
          isMonthly: true,
        });
        setReports(getReports());
        showToast('success', '✓ 月度报告已生成并保存');
      }
    } catch (e: any) {
      showToast('error', `月报失败：${e?.message?.slice(0, 80) || '未知'}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 平台 Tab */}
      <div className="flex items-center gap-2">
        <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
          <button
            onClick={() => { setPlatform('shipinhao'); setSelectedSessions(new Set()); setSelectedReports(new Set()); }}
            className={`px-4 py-1.5 rounded-md text-xs font-medium ${platform === 'shipinhao' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white' : 'text-white/60'}`}
          >
            视频号复盘（{sessions.filter((s) => s.platform === 'shipinhao').length} 场）
          </button>
          <button
            onClick={() => { setPlatform('douyin'); setSelectedSessions(new Set()); setSelectedReports(new Set()); }}
            className={`px-4 py-1.5 rounded-md text-xs font-medium ${platform === 'douyin' ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white' : 'text-white/60'}`}
          >
            抖音复盘（{sessions.filter((s) => s.platform === 'douyin').length} 场）
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左：选 Skill + 选场次 + 开始复盘 */}
        <div className="space-y-4">
          {/* Step 1：选 Skill */}
          <GlassCard hoverable={false}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-amber-500/30 text-amber-300 text-[10px] flex items-center justify-center font-bold">1</span>
                选择复盘 Skill
              </h3>
              <button onClick={() => setShowSkillManager(true)} className="text-[10px] text-white/50 hover:text-white/80 flex items-center gap-1">
                <Plus className="w-3 h-3" /> 管理 Skill
              </button>
            </div>
            <div className="space-y-1.5">
              {usableSkills.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSkillId(s.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-all ${
                    (activeSkill?.id === s.id)
                      ? 'bg-amber-500/15 border-amber-500/40 text-white'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  <Sparkles className="w-3 h-3 inline mr-1.5 text-amber-300" />
                  {s.label}
                  <span className="text-white/30 ml-2">{s.platform === 'all' ? '通用' : PLATFORM_LABEL[s.platform as LivePlatform]}</span>
                </button>
              ))}
              {usableSkills.length === 0 && <p className="text-xs text-white/30 py-3 text-center">暂无可用 Skill，点「管理 Skill」添加</p>}
            </div>
          </GlassCard>

          {/* Step 2：选场次 */}
          <GlassCard hoverable={false}>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-amber-500/30 text-amber-300 text-[10px] flex items-center justify-center font-bold">2</span>
                勾选直播场次（{selectedSessions.size}/{filteredSessions.length}）
              </h3>
              {filteredSessions.length > 0 && (
                <button
                  onClick={() => {
                    if (selectedSessions.size === filteredSessions.length) {
                      setSelectedSessions(new Set());
                    } else {
                      setSelectedSessions(new Set(filteredSessions.map((s) => s.id)));
                    }
                  }}
                  className="text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90"
                >
                  {selectedSessions.size === filteredSessions.length ? '清空' : '全选'}
                </button>
              )}
            </div>
            {/* 账号 / 日期筛选 */}
            {platformSessions.length > 0 && (
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <select
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] text-white"
                >
                  <option value="all">全部账号（{accountOptions.length}）</option>
                  {accountOptions.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] text-white"
                >
                  <option value="all">全部日期（{dateOptions.length} 期）</option>
                  {dateOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {(accountFilter !== 'all' || dateFilter !== 'all') && (
                  <button
                    onClick={() => { setAccountFilter('all'); setDateFilter('all'); }}
                    className="text-[10px] text-white/40 hover:text-white/80"
                  >
                    重置
                  </button>
                )}
              </div>
            )}
            {platformSessions.length === 0 ? (
              <p className="text-xs text-white/30 py-4 text-center">该平台暂无场次数据，先到「上传数据」板块上传</p>
            ) : filteredSessions.length === 0 ? (
              <p className="text-xs text-white/30 py-4 text-center">当前筛选条件下没有场次</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                {filteredSessions.map((s) => (
                  <label key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs ${
                    selectedSessions.has(s.id) ? 'bg-amber-500/10 border-amber-500/40' : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}>
                    <input type="checkbox" checked={selectedSessions.has(s.id)} onChange={() => toggleSession(s.id)} className="accent-amber-500" />
                    <span className="text-white/80 font-medium shrink-0">{s.account || '未填'}</span>
                    {s.date && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-300 shrink-0">{s.date}</span>
                    )}
                    <span className="text-white/40 truncate">{s.sessionName || '—'}</span>
                    <span className="text-white/30 ml-auto shrink-0">场观{formatNumber(s.viewers)}</span>
                  </label>
                ))}
              </div>
            )}
          </GlassCard>

          {/* Step 3：开始复盘 */}
          <button
            onClick={handleReview}
            disabled={generating || selectedSessions.size === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold text-sm hover:opacity-90 disabled:opacity-40"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {generating ? 'AI 复盘中...' : '3 · 开始复盘'}
          </button>
        </div>

        {/* 右：输出 + 历史报告 */}
        <div className="space-y-4">
          {/* 输出区 */}
          <GlassCard hoverable={false}>
            <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-amber-400" /> 复盘输出
            </h3>
            {currentOutput ? (
              <div className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto scrollbar-thin pr-1">
                {currentOutput}
              </div>
            ) : (
              <p className="text-xs text-white/30 py-10 text-center">左侧选 Skill → 勾选场次 → 开始复盘，报告将在这里生成</p>
            )}
          </GlassCard>

          {/* 单场报告列表 + 月报 */}
          <GlassCard hoverable={false}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold text-sm">已保存报告（{platformReports.length}）</h3>
              <button
                onClick={handleMonthly}
                disabled={generating || selectedReports.size < 2}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-medium disabled:opacity-40"
                title="勾选 2 份以上单场报告，生成月度汇总"
              >
                {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calendar className="w-3 h-3" />}
                生成月报（已选 {selectedReports.size}）
              </button>
            </div>
            {platformReports.length === 0 ? (
              <p className="text-xs text-white/30 py-4 text-center">暂无保存的报告</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto scrollbar-thin pr-1">
                {platformReports.map((r) => (
                  <ReportRow
                    key={r.id}
                    report={r}
                    checked={selectedReports.has(r.id)}
                    onToggle={() => {
                      const next = new Set(selectedReports);
                      if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                      setSelectedReports(next);
                    }}
                    onDelete={() => { removeReport(r.id); setReports(getReports()); }}
                    onCopy={() => { navigator.clipboard?.writeText(r.content); showToast('success', '已复制'); }}
                  />
                ))}
              </div>
            )}
            {/* 月度报告 */}
            {monthlyReports.filter((r) => r.platform === platform).length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="text-[10px] text-white/40 mb-1.5">📅 月度汇总报告</div>
                {monthlyReports.filter((r) => r.platform === platform).map((r) => (
                  <ReportRow
                    key={r.id}
                    report={r}
                    checked={false}
                    onToggle={() => {}}
                    onDelete={() => { removeReport(r.id); setReports(getReports()); }}
                    onCopy={() => { navigator.clipboard?.writeText(r.content); showToast('success', '已复制'); }}
                    hideCheckbox
                  />
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* Skill 管理 Modal */}
      <ReviewSkillManager
        open={showSkillManager}
        onClose={() => setShowSkillManager(false)}
        skills={skills}
        onSave={(list) => { saveReviewSkills(list); setSkills(list); showToast('success', '✓ 复盘 Skill 已更新'); }}
      />
    </div>
  );
};

// 报告行（可展开查看）
const ReportRow: React.FC<{
  report: ReviewReport;
  checked: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onCopy: () => void;
  hideCheckbox?: boolean;
}> = ({ report, checked, onToggle, onDelete, onCopy, hideCheckbox }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg bg-white/5 border border-white/10">
      <div className="flex items-center gap-2 px-3 py-2">
        {!hideCheckbox && <input type="checkbox" checked={checked} onChange={onToggle} className="accent-purple-500" />}
        <button onClick={() => setOpen(!open)} className="flex-1 text-left flex items-center gap-2 min-w-0">
          {open ? <ChevronDown className="w-3 h-3 text-white/40 shrink-0" /> : <ChevronRight className="w-3 h-3 text-white/40 shrink-0" />}
          <span className="text-xs text-white/80 truncate">{report.skillLabel}</span>
          <span className="text-[10px] text-white/30 shrink-0">{report.month} · {new Date(report.createdAt).toLocaleDateString()}</span>
        </button>
        <button onClick={onCopy} className="text-white/40 hover:text-white/80 shrink-0"><Copy className="w-3.5 h-3.5" /></button>
        <button onClick={onDelete} className="text-rose-300/40 hover:text-rose-300 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      {open && (
        <div className="px-3 pb-3 text-xs text-white/70 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto scrollbar-thin border-t border-white/5 pt-2">
          {report.content}
        </div>
      )}
    </div>
  );
};

// 复盘 Skill 管理
const ReviewSkillManager: React.FC<{
  open: boolean; onClose: () => void;
  skills: ReviewSkill[];
  onSave: (list: ReviewSkill[]) => void;
}> = ({ open, onClose, skills, onSave }) => {
  const [list, setList] = useState<ReviewSkill[]>(skills);
  React.useEffect(() => { if (open) setList(skills); }, [open, skills]);

  return (
    <Modal open={open} onClose={onClose} title="复盘 Skill 管理" subtitle="视频号 / 抖音直播 / 投流 Skill 都可自定义增删改" maxWidth="max-w-2xl">
      <div className="space-y-2 max-h-[55vh] overflow-y-auto scrollbar-thin pr-1">
        {list.map((s, i) => (
          <div key={s.id} className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) => setList(list.map((x, xi) => xi === i ? { ...x, enabled: e.target.checked } : x))}
                className="accent-amber-500"
              />
              <input
                value={s.label}
                onChange={(e) => setList(list.map((x, xi) => xi === i ? { ...x, label: e.target.value } : x))}
                className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/10 text-sm text-white font-medium"
              />
              <select
                value={s.platform}
                onChange={(e) => setList(list.map((x, xi) => xi === i ? { ...x, platform: e.target.value as ReviewSkill['platform'] } : x))}
                className="px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white"
              >
                <option value="shipinhao">视频号</option>
                <option value="douyin">抖音</option>
                <option value="all">通用</option>
              </select>
              <button onClick={() => setList(list.filter((_, xi) => xi !== i))} className="text-rose-300/60 hover:text-rose-300 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              value={s.prompt}
              onChange={(e) => setList(list.map((x, xi) => xi === i ? { ...x, prompt: e.target.value } : x))}
              rows={4}
              className="w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-xs text-white/80 resize-none font-mono"
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => setList([...list, { id: `rskill-${Date.now()}`, label: '新复盘 Skill', prompt: '', platform: 'all', enabled: true, createdAt: new Date().toISOString() }])}
        className="mt-2 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs hover:bg-white/10"
      >
        <Plus className="w-3.5 h-3.5" /> 新增 Skill
      </button>
      <div className="flex justify-end gap-2 pt-3">
        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
        <button onClick={() => { onSave(list); onClose(); }} className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white text-sm font-medium">保存</button>
      </div>
    </Modal>
  );
};

export default Live;
