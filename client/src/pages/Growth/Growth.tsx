// 成长小助手：按岗位分流指标 + 个人感悟沉淀 + AI 复盘报告（卡片流）+ 管理员板块配置
// 角色差异：管理员看团队经营盘（目标/人效/绩效/补人方向），专员看自己岗位的业务盘

import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Loader2, User, Settings2, Target, Star, Trash2, Save, ChevronUp, ChevronDown,
  PenLine, BookOpen, CheckCircle2, Circle, Info, GripVertical,
  Calendar, ChevronLeft, ChevronRight, Download,
} from 'lucide-react';
import GlassCard from '../../components/GlassCard';
import Modal from '../../components/Modal';
import GrowthReport from '../../components/GrowthReport';
import { parseReport } from '../../utils/reportParse';
import { useWorkspace } from '../../store/workspace';
import { downloadBlob } from '../../utils/zipLite';
import { getMyLLMConfig, apiMissingHint } from '../../utils/llmConfig';
import { callLLMStream } from '../../utils/llmCall';
import {
  POSITIONS, positionLabel, PERIOD_LABEL, METRIC_LABEL, METRIC_POOL,
  getPositionOf, getPositions,
  getBoardOf, saveBoard, resetBoard, getFocusOf, setFocus, resetFocus,
  getTeamGoals, saveTeamGoals,
  getReflection, listReflections, saveReflection, removeReflection,
  getReports, saveReport, removeReport,
  computeBoard, buildDigest, buildReportPrompt, periodKeyOf,
  type Position, type Period, type MetricKey, type MetricResult, type ReportRecord,
} from '../../utils/growthStore';
import { viewableNames, isDirector } from '../../utils/memberStore';

type ToastMsg = { type: 'success' | 'error' | 'info'; message: string } | null;
type MainTab = 'report' | 'reflection' | 'config' | 'archive';

const PERIODS: Period[] = ['daily', 'weekly', 'monthly'];
const TREND_CLS: Record<MetricResult['trend'], string> = {
  up: 'text-emerald-400',
  down: 'text-rose-400',
  flat: 'text-white/40',
  none: 'text-white/40',
};

// 四步指南配色（高亮，每步独立强调色）
const STEP_STYLE = [
  { done: 'bg-cyan-500/25 text-cyan-200 ring-1 ring-cyan-400/40', todo: 'bg-cyan-500/10 text-cyan-300 border border-cyan-400/30', label: 'text-cyan-200', labelDim: 'text-cyan-300/70', arrow: 'text-cyan-400/50' },
  { done: 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/40', todo: 'bg-amber-500/10 text-amber-300 border border-amber-400/30', label: 'text-amber-200', labelDim: 'text-amber-300/70', arrow: 'text-amber-400/50' },
  { done: 'bg-purple-500/25 text-purple-200 ring-1 ring-purple-400/40', todo: 'bg-purple-500/10 text-purple-300 border border-purple-400/30', label: 'text-purple-200', labelDim: 'text-purple-300/70', arrow: 'text-purple-400/50' },
  { done: 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/40', todo: 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/30', label: 'text-emerald-200', labelDim: 'text-emerald-300/70', arrow: 'text-emerald-400/50' },
];

// 操作指南：四步详细说明（高亮配色，与个人感悟/报告的新顺序一致）
const GUIDE_STEPS = [
  { n: '①', c: 0, txt: '选好要复盘的成员和周期（今日 / 本周 / 本月）。' },
  { n: '②', c: 1, txt: '在「个人感悟」里写三条：做对了什么、踩了什么坑、下期改一件事，再打个自评分。写过的感悟 AI 会读，报告里会专门回应你说到要做到的改变有没有做到。' },
  { n: '③', c: 2, txt: '切到「复盘报告」点「AI 生成报告」，AI 会结合你岗位的指标卡 + 任务数据 + 你的感悟一起生成。' },
  { n: '④', c: 3, txt: '报告出来后核对数字，确认没问题就自动归档；想留档可点「复制全文」。' },
];
const GUIDE_STYLE = [
  { wrap: 'bg-cyan-500/10 border border-cyan-500/25', text: 'text-cyan-100/90' },
  { wrap: 'bg-amber-500/10 border border-amber-500/25', text: 'text-amber-100/90' },
  { wrap: 'bg-purple-500/10 border border-purple-500/25', text: 'text-purple-100/90' },
  { wrap: 'bg-emerald-500/10 border border-emerald-500/25', text: 'text-emerald-100/90' },
];

// 本地日期 YYYY-MM-DD（用于日历按生成时间分组，避免 UTC 偏移导致的错位）
const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const reportDateKey = (iso: string) => ymdLocal(new Date(iso));

// 一键下载：把所有可见归档报告汇成一份 Markdown
function buildReportsMarkdown(list: ReportRecord[]): string {
  const lines: string[] = ['# 复盘报告归档', ''];
  lines.push(`> 导出时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push(`> 共 ${list.length} 份（按生成时间倒序）`);
  lines.push('');
  for (const r of list) {
    lines.push(`## ${r.staffName} · ${PERIOD_LABEL[r.period]} · ${r.periodKey}`);
    lines.push('');
    lines.push(`- 评分：${r.score ?? '—'}`);
    lines.push(`- 生成时间：${new Date(r.createdAt).toLocaleString('zh-CN')}`);
    lines.push(`- 周期键：${r.periodKey}`);
    lines.push('');
    lines.push(r.raw.trim());
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

const Growth: React.FC = () => {
  const { currentStaff, staffList } = useWorkspace();
  const staffNames = staffList.map((s) => s.name);
  const isAdmin = isDirector(currentStaff.name);
  const viewable = useMemo(() => viewableNames(currentStaff.name, staffNames), [currentStaff.name, staffNames]);
  const canSwitch = viewable.length > 1;

  const [period, setPeriod] = useState<Period>('weekly');
  const [selectedStaff, setSelectedStaff] = useState(currentStaff.name);
  const [tab, setTab] = useState<MainTab>('reflection');
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState('');
  const [toast, setToast] = useState<ToastMsg>(null);
  const [boardTick, setBoardTick] = useState(0); // 配置变更后触发指标重算
  const [guideOpen, setGuideOpen] = useState(false);
  const [reportTick, setReportTick] = useState(0); // 报告归档变更后触发日历重读
  const [calMonth, setCalMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  const [dayReports, setDayReports] = useState<string | null>(null); // 日历某天详情
  const [activeReportId, setActiveReportId] = useState<string | null>(null); // 报告全文弹窗

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2600);
  };

  // 非管理员只能看自己
  // 可见范围由成员权限的「数据范围」决定：all=全员 / team=同岗位 / self=仅本人
  const viewStaff = canSwitch ? (viewable.includes(selectedStaff) ? selectedStaff : viewable[0]) : currentStaff.name;
  const viewPosition = getPositionOf(viewStaff);
  const hasExplicitPosition = !!getPositions()[viewStaff];
  const periodKey = periodKeyOf(period);

  const cards = useMemo(
    () => computeBoard(viewStaff, viewPosition, period, staffNames),
    [viewStaff, viewPosition, period, staffNames, boardTick]
  );
  const reports = useMemo(() => getReports().filter((r) => r.staffName === viewStaff && r.period === period && r.periodKey === periodKey), [viewStaff, period, periodKey, output]);
  const archived = reports.length > 0;

  // ===== 个人感悟 =====
  const emptyRf = { didWell: '', pitfall: '', improve: '', freeNote: '', score: 3 };
  const [rf, setRf] = useState(emptyRf);
  const savedRf = useMemo(
    () => getReflection(viewStaff, period, periodKey),
    [viewStaff, period, periodKey, tab]
  );
  useEffect(() => {
    const e = getReflection(viewStaff, period, periodKey);
    setRf(e ? { didWell: e.didWell, pitfall: e.pitfall, improve: e.improve, freeNote: e.freeNote, score: e.score } : emptyRf);
  }, [viewStaff, period, periodKey]);
  const rfDirty = savedRf
    ? rf.didWell !== savedRf.didWell || rf.pitfall !== savedRf.pitfall || rf.improve !== savedRf.improve ||
      rf.freeNote !== savedRf.freeNote || rf.score !== savedRf.score
    : !!(rf.didWell || rf.pitfall || rf.improve || rf.freeNote);
  const history = useMemo(() => listReflections(viewStaff, 8), [viewStaff, tab, periodKey, boardTick]);

  // ===== 管理员配置面板 =====
  const [cfgPos, setCfgPos] = useState<Position>('private');
  const [cfgCards, setCfgCards] = useState<MetricKey[]>(() => getBoardOf('private').cards);
  const [cfgFocus, setCfgFocus] = useState<MetricKey[]>([]);
  const [goals, setGoals] = useState(() => getTeamGoals());
  const [cfgStaff, setCfgStaff] = useState(''); // '' = 岗位默认（模板）；否则某成员姓名
  const [cfgFocusStaff, setCfgFocusStaff] = useState<MetricKey[]>([]);
  useEffect(() => {
    const b = getBoardOf(cfgPos);
    setCfgCards(b.cards);
    setCfgFocus(b.focus);
  }, [cfgPos, boardTick]);

  // ===== AI 生成 =====
  const handleGenerate = async () => {
    const llm = getMyLLMConfig('xiaohongshu');
    if (!llm?.apiKey || !llm?.baseUrl) {
      showToast('error', apiMissingHint());
      return;
    }
    setGenerating(true);
    setOutput('');
    setTab('report');
    const focusLabels = getFocusOf(viewStaff).map((k) => METRIC_LABEL[k]).filter(Boolean);
    const digest = buildDigest(viewStaff, viewPosition, period, staffNames, cards);
    const { system, user } = buildReportPrompt(viewPosition, period, focusLabels);
    try {
      const cfg = { ...llm, temperature: 0.5, maxTokens: Math.max(llm.maxTokens || 0, 8192) };
      const result = await callLLMStream(
        cfg,
        [
          { role: 'system', content: system },
          { role: 'user', content: user.replace('{DIGEST}', digest) },
        ],
        (chunk) => setOutput((p) => p + chunk),
        () => {}
      );
      if (!result.trim()) {
        showToast('error', 'AI 未返回内容，请重试');
      } else {
        const parsed = parseReport(result);
        saveReport({
          staffName: viewStaff,
          period,
          periodKey,
          raw: result,
          score: parsed?.score ?? null,
        });
        setReportTick((v) => v + 1);
        showToast('success', parsed ? '报告已生成并归档' : '报告已生成（原文模式）并归档');
      }
    } catch (e: any) {
      showToast('error', `生成失败：${String(e?.message || e).slice(0, 120)}`);
    } finally {
      setGenerating(false);
    }
  };

  // 4 步指南完成状态
  const steps = [
    { label: '确认成员与周期', done: true },
    { label: '写下本期感悟', done: !!savedRf },
    { label: '点 AI 生成报告', done: !!output.trim() && !generating },
    { label: '核对并归档', done: archived },
  ];

  const saveRf = () => {
    if (!rf.didWell.trim() && !rf.pitfall.trim() && !rf.improve.trim() && !rf.freeNote.trim()) {
      showToast('error', '至少写一条内容再保存');
      return;
    }
    saveReflection({
      staffName: viewStaff,
      period,
      periodKey,
      didWell: rf.didWell.trim(),
      pitfall: rf.pitfall.trim(),
      improve: rf.improve.trim(),
      freeNote: rf.freeNote.trim(),
      score: rf.score,
    });
    setBoardTick((v) => v + 1);
    showToast('success', '感悟已保存，AI 生成报告时会一并读取');
  };

  const saveCfg = () => {
    if (cfgCards.length === 0) {
      showToast('error', '至少保留一个指标卡');
      return;
    }
    saveBoard(cfgPos, { cards: cfgCards, focus: cfgFocus.filter((k) => cfgCards.includes(k)) });
    setBoardTick((v) => v + 1);
    showToast('success', `${positionLabel(cfgPos)} 的板块已保存`);
  };

  // 个人攻坚项（北极星指标）覆盖
  const onCfgStaffChange = (name: string) => {
    setCfgStaff(name);
    if (name) setCfgFocusStaff(getFocusOf(name));
  };
  const saveFocusStaff = () => {
    if (!cfgStaff) return;
    setFocus(cfgStaff, cfgFocusStaff);
    setBoardTick((v) => v + 1);
    showToast('success', `${cfgStaff} 的攻坚项已保存`);
  };
  const resetFocusStaff = () => {
    if (!cfgStaff) return;
    resetFocus(cfgStaff);
    setCfgFocusStaff(getBoardOf(getPositionOf(cfgStaff)).focus);
    setBoardTick((v) => v + 1);
    showToast('info', `${cfgStaff} 已恢复为岗位默认攻坚项`);
  };

  // ===== 归档日历 =====
  const now = new Date();
  // 当前用户可见的归档（管理员=全员，专员=仅本人），按生成时间倒序
  const visibleReports = useMemo(
    () => getReports().filter((r) => viewable.includes(r.staffName)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [viewable, reportTick, tab]
  );
  const reportsByDate = useMemo(() => {
    const map: Record<string, ReportRecord[]> = {};
    for (const r of visibleReports) {
      const k = reportDateKey(r.createdAt);
      if (!map[k]) map[k] = [];
      map[k].push(r);
    }
    return map;
  }, [visibleReports]);

  const downloadAllReports = () => {
    if (visibleReports.length === 0) {
      showToast('info', '暂无可下载的归档报告');
      return;
    }
    const md = buildReportsMarkdown(visibleReports);
    downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `复盘报告归档_${ymdLocal(now)}.md`);
    showToast('success', `已下载 ${visibleReports.length} 份归档报告`);
  };

  const generateCalendar = () => {
    const { year, month } = calMonth;
    const firstDay = new Date(year, month - 1, 1).getDay(); // 0=周日
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: { day: number | null; reports: ReportRecord[] }[] = [];
    for (let i = 0; i < firstDay; i++) cells.push({ day: null, reports: [] });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, reports: reportsByDate[dateStr] || [] });
    }
    return cells;
  };
  const calendarCells = generateCalendar();

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

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-white text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-fuchsia-400" /> 成长小助手
          </h2>
          <p className="text-xs text-white/50 mt-1">
            当前身份 {currentStaff.name} · {isAdmin ? '管理员' : positionLabel(getPositionOf(currentStaff.name))}
            {canSwitch && ` · 可查看 ${viewable.length} 人（数据范围 ${viewable.length === staffNames.length ? '全员' : '本组'}）`}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setTab(tab === 'config' ? 'report' : 'config')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
              tab === 'config' ? 'bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-200' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" /> 北极星指标
          </button>
        )}
      </div>

      {/* 操作台：指南 + 选人 + 周期 + 生成 */}
      <GlassCard hoverable={false}>
        {/* 四步指南（高亮配色） */}
        <div className="flex items-center gap-2 flex-wrap mb-3 pb-3 border-b border-white/5">
          {steps.map((s, i) => {
            const st = STEP_STYLE[i];
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  s.done ? st.done : st.todo
                }`}>{s.done ? '✓' : i + 1}</span>
                <span className={`text-[11px] font-medium ${s.done ? st.label : st.labelDim}`}>{s.label}</span>
                {i < steps.length - 1 && <span className={`text-sm mx-0.5 ${st.arrow}`}>→</span>}
              </div>
            );
          })}
          <button
            onClick={() => setGuideOpen((v) => !v)}
            className="ml-auto text-[10px] text-cyan-300/70 hover:text-cyan-200 flex items-center gap-1"
          >
            <Info className="w-3 h-3" /> 操作指南
          </button>
        </div>
        {guideOpen && (
          <div className="mb-3 space-y-2">
            {GUIDE_STEPS.map((g, i) => {
              const st = GUIDE_STYLE[g.c];
              return (
                <div key={i} className={`flex gap-2.5 p-2.5 rounded-lg ${st.wrap}`}>
                  <span className={`text-xs font-bold shrink-0 ${st.text}`}>{g.n}</span>
                  <p className={`text-[11px] leading-relaxed ${st.text}`}>{g.txt}</p>
                </div>
              );
            })}
            <p className="text-[10px] text-white/35 pt-1">
              提示：指标卡上的「攻坚项」由管理员在「北极星指标」里设定，被设为攻坚的指标会高亮，并单独出现在报告的攻坚进度里。
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          {canSwitch ? (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-white/40" />
              <select
                value={viewStaff}
                onChange={(e) => { setSelectedStaff(e.target.value); setOutput(''); }}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white"
              >
                {viewable.map((n) => (
                  <option key={n} value={n}>
                    {n}（{positionLabel(getPositionOf(n))}）
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="text-xs text-white/50 flex items-center gap-1.5">
              <User className="w-4 h-4 text-white/40" /> {viewStaff}
            </span>
          )}

          <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setOutput(''); }}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  period === p ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-md' : 'text-white/60 hover:text-white'
                }`}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generating ? 'AI 生成中...' : output ? '重新生成' : 'AI 生成报告'}
          </button>
        </div>
        <p className="text-[10px] text-white/35 mt-2">
          周期键 {periodKey} · 岗位 {positionLabel(viewPosition)}
          {!hasExplicitPosition && isAdmin && ' · 尚未指派岗位，当前按私域专员显示，可在「北极星指标」里指派'}
        </p>
      </GlassCard>

      {/* 岗位指标卡 */}
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <h3 className="text-white text-sm font-medium">
            {viewStaff} · {positionLabel(viewPosition)} · {PERIOD_LABEL[period]}关键指标
          </h3>
          {getFocusOf(viewStaff).length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300">
              攻坚项 {getFocusOf(viewStaff).map((k) => METRIC_LABEL[k]).join('、')}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {cards.map((c) => (
            <GlassCard
              key={c.key}
              hoverable={false}
              className={`!p-3 ${c.focus ? '!border-cyan-500/40 !bg-cyan-500/5' : ''}`}
            >
              <div className="flex items-center gap-1 mb-1">
                {c.focus && <Target className="w-3 h-3 text-cyan-300 shrink-0" />}
                <span className="text-[10px] text-white/50 truncate">{c.label}</span>
              </div>
              <p className="text-white font-bold text-base leading-none">{c.value}</p>
              {c.delta && (
                <p className={`text-[10px] mt-1.5 truncate ${TREND_CLS[c.trend]}`}>
                  {c.trend === 'up' ? '↑ ' : c.trend === 'down' ? '↓ ' : ''}{c.delta}
                </p>
              )}
            </GlassCard>
          ))}
        </div>
      </div>

      {/* 主 Tab */}
      <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10 w-fit">
        {([
          ['reflection', '个人感悟', <PenLine className="w-3.5 h-3.5 inline mr-1.5" />],
          ['report', '复盘报告', <BookOpen className="w-3.5 h-3.5 inline mr-1.5" />],
          ['archive', '归档日历', <Calendar className="w-3.5 h-3.5 inline mr-1.5" />],
        ] as [MainTab, string, React.ReactNode][]).map(([k, label, icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              tab === k ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            {icon}
            {label}
            {k === 'reflection' && savedRf && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />}
          </button>
        ))}
      </div>

      {/* 复盘报告 */}
      {tab === 'report' && (
        <GlassCard hoverable={false}>
          {output ? (
            <GrowthReport
              raw={output}
              streaming={generating}
              title={`${viewStaff} · ${positionLabel(viewPosition)} · ${PERIOD_LABEL[period]}复盘`}
              onToast={(m) => showToast('success', m)}
            />
          ) : (
            <div className="py-14 text-center">
              <Sparkles className="w-10 h-10 text-white/15 mx-auto mb-3" />
              <p className="text-sm text-white/40">点「AI 生成报告」，会读取 {viewStaff} 的岗位指标、任务与感悟</p>
              <p className="text-xs text-white/30 mt-1">建议先到「个人感悟」写几条，报告会专门回应你</p>
            </div>
          )}
        </GlassCard>
      )}

      {/* 个人感悟 */}
      {tab === 'reflection' && (
        <div className="space-y-3">
          <GlassCard hoverable={false}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-white text-sm font-medium flex items-center gap-2">
                <PenLine className="w-4 h-4 text-fuchsia-400" />
                {PERIOD_LABEL[period]}感悟 · {periodKey}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/40">自评</span>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setRf({ ...rf, score: n })} title={`${n} 分`}>
                      <Star className={`w-3.5 h-3.5 ${n <= rf.score ? 'text-amber-300' : 'text-white/20'}`} fill={n <= rf.score ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </div>
                <button
                  onClick={saveRf}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white text-xs font-medium"
                >
                  <Save className="w-3.5 h-3.5" /> {savedRf ? '更新' : '保存'}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { key: 'didWell' as const, label: '做对了什么', placeholder: '例：本周日更没断，「三升四暑假规划」收藏 218，是本月最高', color: 'emerald' },
                { key: 'pitfall' as const, label: '踩了什么坑', placeholder: '例：选题会开了但没落地，笔记还是按老套路写', color: 'rose' },
                { key: 'improve' as const, label: '下期改一件事', placeholder: '例：选题会当场定钩子句，隔天就发', color: 'amber' },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-xs text-white/50 block mb-1">{f.label}</label>
                  <textarea
                    value={rf[f.key]}
                    onChange={(e) => setRf({ ...rf, [f.key]: e.target.value })}
                    rows={2}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white resize-none"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs text-white/50 block mb-1">自由补充（可选）</label>
                <textarea
                  value={rf.freeNote}
                  onChange={(e) => setRf({ ...rf, freeNote: e.target.value })}
                  rows={2}
                  placeholder="任何想让 AI 在复盘时看到的背景、困难、想法"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white resize-none"
                />
              </div>
            </div>
            {rfDirty && <p className="text-[10px] text-amber-300/70 mt-2">有未保存的改动</p>}
          </GlassCard>

          {history.length > 0 && (
            <GlassCard hoverable={false}>
              <h3 className="text-white text-sm font-medium mb-3">历史沉淀（{history.length}）</h3>
              <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
                {history.map((h) => (
                  <div key={h.id} className="p-3 rounded-lg bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] text-fuchsia-300 font-mono">{h.periodKey}</span>
                      <span className="text-[10px] text-white/40">{PERIOD_LABEL[h.period]}</span>
                      <span className="text-[10px] text-amber-300">{'★'.repeat(h.score)}</span>
                      <button
                        onClick={() => { if (window.confirm('删除这条感悟？')) { removeReflection(h.id); setBoardTick((v) => v + 1); } }}
                        className="ml-auto text-rose-300/40 hover:text-rose-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {h.didWell && <p className="text-[11px] text-white/60"><span className="text-emerald-300/70">做对 </span>{h.didWell}</p>}
                    {h.pitfall && <p className="text-[11px] text-white/60"><span className="text-rose-300/70">踩坑 </span>{h.pitfall}</p>}
                    {h.improve && <p className="text-[11px] text-white/60"><span className="text-amber-300/70">要改 </span>{h.improve}</p>}
                    {h.freeNote && <p className="text-[11px] text-white/40 mt-0.5">{h.freeNote}</p>}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {/* 归档日历 */}
      {tab === 'archive' && (
        <GlassCard hoverable={false}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCalMonth((m) => (m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 }))}
                className="w-8 h-8 rounded-md flex items-center justify-center text-white/60 hover:bg-white/10"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="text-white font-medium text-sm">{calMonth.year}年{calMonth.month}月</h3>
              <button
                onClick={() => setCalMonth((m) => (m.month === 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 }))}
                className="w-8 h-8 rounded-md flex items-center justify-center text-white/60 hover:bg-white/10"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCalMonth({ year: now.getFullYear(), month: now.getMonth() + 1 })}
                className="text-[10px] text-cyan-300/70 hover:text-cyan-200 ml-1"
              >回到本月</button>
            </div>
            <button
              onClick={downloadAllReports}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-medium hover:opacity-90"
            >
              <Download className="w-3.5 h-3.5" /> 一键全部下载（{visibleReports.length}）
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
              <div key={d} className="text-center text-xs text-white/40 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((c, i) => {
              const isToday = c.day !== null && c.day === now.getDate() && calMonth.month === now.getMonth() + 1 && calMonth.year === now.getFullYear();
              const has = c.reports.length > 0;
              return (
                <div
                  key={i}
                  onClick={() => c.day && has && setDayReports(`${calMonth.year}-${String(calMonth.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`)}
                  className={`min-h-[68px] p-1.5 rounded-lg border transition-colors ${
                    c.day
                      ? isToday
                        ? 'bg-cyan-500/20 border-cyan-500/40'
                        : has
                          ? 'bg-white/5 border-cyan-500/20 hover:bg-white/10 cursor-pointer'
                          : 'bg-white/3 border-white/5'
                      : 'border-transparent'
                  }`}
                >
                  {c.day && (
                    <>
                      <p className={`text-xs ${isToday ? 'text-cyan-300 font-bold' : 'text-white/60'}`}>{c.day}</p>
                      {c.reports.slice(0, 3).map((r) => (
                        <p
                          key={r.id}
                          className="text-[10px] mt-0.5 truncate rounded bg-fuchsia-500/15 text-fuchsia-200 px-1 py-0.5"
                          title={`${r.staffName} · ${PERIOD_LABEL[r.period]}`}
                        >
                          {r.staffName}{PERIOD_LABEL[r.period]}
                        </p>
                      ))}
                      {c.reports.length > 3 && (
                        <p className="text-[10px] mt-0.5 text-white/40">+{c.reports.length - 3} 份</p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-white/30 mt-3">
            共 {visibleReports.length} 份归档（{isAdmin ? '全员' : '仅本人'}可见）。点有标记的日期查看当天报告；右上角可一键下载全部为 Markdown。
          </p>
        </GlassCard>
      )}

      {/* 管理员：北极星指标 */}
      {tab === 'config' && isAdmin && (
        <div className="space-y-3">
          {/* 板块卡片配置（北极星指标） */}
          <GlassCard hoverable={false}>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <h3 className="text-white text-sm font-medium flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-fuchsia-400" /> 北极星指标
              </h3>
              <select
                value={cfgStaff}
                onChange={(e) => onCfgStaffChange(e.target.value)}
                className="h-8 px-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white"
              >
                <option value="">岗位默认（模板）</option>
                {staffList.map((s) => <option key={s.id} value={s.name}>{s.name}（{positionLabel(getPositionOf(s.name))}）</option>)}
              </select>
              {cfgStaff === '' && (
                <select
                  value={cfgPos}
                  onChange={(e) => setCfgPos(e.target.value as Position)}
                  className="h-8 px-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white"
                >
                  {POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              )}
              {cfgStaff === '' && (
                <button
                  onClick={() => { resetBoard(cfgPos); setBoardTick((v) => v + 1); showToast('success', '已恢复默认板块'); }}
                  className="ml-auto text-[10px] text-white/40 hover:text-white/70"
                >
                  恢复默认
                </button>
              )}
            </div>

            {cfgStaff === '' ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-white/40 mb-2">可选指标（勾选后按右侧顺序展示）</p>
                    <div className="flex flex-wrap gap-1.5">
                      {METRIC_POOL[cfgPos].map((k) => {
                        const on = cfgCards.includes(k);
                        return (
                          <button
                            key={k}
                            onClick={() => setCfgCards(on ? cfgCards.filter((x) => x !== k) : [...cfgCards, k])}
                            className={`px-2 py-1 rounded-lg text-[11px] border ${
                              on ? 'bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-200' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                            }`}
                          >
                            {METRIC_LABEL[k]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/40 mb-2">展示顺序与攻坚项（点 🎯 设为攻坚）</p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto scrollbar-thin">
                      {cfgCards.map((k, i) => (
                        <div key={k} className={`flex items-center gap-2 p-1.5 rounded-lg ${cfgFocus.includes(k) ? 'bg-cyan-500/10' : 'bg-white/5'}`}>
                          <GripVertical className="w-3 h-3 text-white/20" />
                          <span className="text-xs text-white flex-1 truncate">{METRIC_LABEL[k]}</span>
                          <button
                            onClick={() => setCfgFocus(cfgFocus.includes(k) ? cfgFocus.filter((x) => x !== k) : [...cfgFocus, k])}
                            title="设为攻坚项"
                            className={cfgFocus.includes(k) ? 'text-cyan-300' : 'text-white/25 hover:text-cyan-300'}
                          >
                            <Target className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if (i > 0) { const n = [...cfgCards]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setCfgCards(n); } }} className="text-white/30 hover:text-white">
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if (i < cfgCards.length - 1) { const n = [...cfgCards]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setCfgCards(n); } }} className="text-white/30 hover:text-white">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end mt-3">
                  <button onClick={saveCfg} className="px-4 py-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white text-xs font-medium">
                    保存岗位默认
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[10px] text-white/40 mb-3">
                  {cfgStaff}（{positionLabel(getPositionOf(cfgStaff))}）的攻坚项——仅对该成员生效，不影响同岗位其他人；卡片沿用岗位默认。
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-white/40 mb-2">该岗位全部指标（点选加入此人的攻坚项）</p>
                    <div className="flex flex-wrap gap-1.5">
                      {METRIC_POOL[getPositionOf(cfgStaff)].map((k) => {
                        const on = cfgFocusStaff.includes(k);
                        return (
                          <button
                            key={k}
                            onClick={() => setCfgFocusStaff(on ? cfgFocusStaff.filter((x) => x !== k) : [...cfgFocusStaff, k])}
                            className={`px-2 py-1 rounded-lg text-[11px] border ${
                              on ? 'bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-200' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                            }`}
                          >
                            {METRIC_LABEL[k]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/40 mb-2">此人的攻坚项（点 🎯 移除，可排序）</p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto scrollbar-thin">
                      {cfgFocusStaff.map((k, i) => (
                        <div key={k} className="flex items-center gap-2 p-1.5 rounded-lg bg-cyan-500/10">
                          <GripVertical className="w-3 h-3 text-white/20" />
                          <span className="text-xs text-white flex-1 truncate">{METRIC_LABEL[k]}</span>
                          <button
                            onClick={() => setCfgFocusStaff(cfgFocusStaff.filter((x) => x !== k))}
                            title="移除攻坚项"
                            className="text-rose-300/60 hover:text-rose-300"
                          >
                            <Target className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if (i > 0) { const n = [...cfgFocusStaff]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setCfgFocusStaff(n); } }} className="text-white/30 hover:text-white">
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if (i < cfgFocusStaff.length - 1) { const n = [...cfgFocusStaff]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setCfgFocusStaff(n); } }} className="text-white/30 hover:text-white">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {cfgFocusStaff.length === 0 && <p className="text-[11px] text-white/30 py-3 text-center">尚未设定，将从岗位默认继承</p>}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={resetFocusStaff}
                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs hover:text-white"
                  >
                    恢复为岗位默认
                  </button>
                  <button onClick={saveFocusStaff} className="px-4 py-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white text-xs font-medium">
                    保存个人攻坚项
                  </button>
                </div>
              </>
            )}
          </GlassCard>

          {/* 团队目标 */}
          <GlassCard hoverable={false}>
            <h3 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-400" /> 团队目标（管理员视角「目标完成度」的分母）
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'taskRate' as const, label: '任务完成率目标 (%)' },
                { key: 'deals' as const, label: '成单目标 (单)' },
                { key: 'gmv' as const, label: 'GMV 目标 (元)' },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-[10px] text-white/40 block mb-1">{f.label}</label>
                  <input
                    type="number"
                    value={goals[f.key]}
                    onChange={(e) => setGoals({ ...goals, [f.key]: Number(e.target.value) || 0 })}
                    className="w-full h-9 px-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-3">
              <button
                onClick={() => { saveTeamGoals(goals); setBoardTick((v) => v + 1); showToast('success', '团队目标已保存'); }}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs hover:text-white"
              >
                保存目标
              </button>
            </div>
          </GlassCard>

        </div>
      )}

      {/* 归档：某天报告列表 */}
      <Modal open={dayReports !== null} onClose={() => setDayReports(null)} title={`归档报告 · ${dayReports || ''}`} maxWidth="max-w-2xl">
        {(() => {
          const dayList = dayReports ? visibleReports.filter((r) => reportDateKey(r.createdAt) === dayReports) : [];
          return (
            <div className="space-y-2">
              {dayList.map((r) => (
                <div key={r.id} className="p-3 rounded-lg bg-white/5 flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-medium">{r.staffName} · {PERIOD_LABEL[r.period]}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">评分 {r.score ?? '—'} · {new Date(r.createdAt).toLocaleString('zh-CN')}</p>
                    <p className="text-[11px] text-white/50 mt-1 line-clamp-2">{r.raw.trim().slice(0, 80)}…</p>
                  </div>
                  <button
                    onClick={() => { setDayReports(null); setActiveReportId(r.id); }}
                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs hover:text-white"
                  >查看</button>
                  <button
                    onClick={() => { if (window.confirm('删除这份归档报告？')) { removeReport(r.id); setReportTick((v) => v + 1); } }}
                    className="p-1.5 rounded bg-white/5 text-rose-300/50 hover:text-rose-300"
                  ><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {dayList.length === 0 && <p className="text-xs text-white/30 py-6 text-center">当天没有归档报告</p>}
            </div>
          );
        })()}
      </Modal>

      {/* 归档：报告全文 */}
      <Modal open={activeReportId !== null} onClose={() => setActiveReportId(null)} title="复盘报告全文" maxWidth="max-w-3xl">
        {(() => {
          const r = visibleReports.find((x) => x.id === activeReportId);
          if (!r) return null;
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-white/50">
                <span className="px-2 py-0.5 rounded bg-fuchsia-500/15 text-fuchsia-200">{r.staffName}</span>
                <span>{PERIOD_LABEL[r.period]}</span>
                <span>评分 {r.score ?? '—'}</span>
                <span>{new Date(r.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              <GrowthReport raw={r.raw} streaming={false} title={`${r.staffName} · ${PERIOD_LABEL[r.period]}复盘`} onToast={(m) => showToast('success', m)} />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => downloadBlob(new Blob([buildReportsMarkdown([r])], { type: 'text/markdown;charset=utf-8' }), `复盘报告_${r.staffName}_${r.periodKey}.md`)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs hover:text-white"
                >单独下载</button>
                <button
                  onClick={() => { if (window.confirm('删除这份归档报告？')) { removeReport(r.id); setReportTick((v) => v + 1); setActiveReportId(null); } }}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-200 text-xs"
                >删除</button>
              </div>
            </div>
          );
        })()}
      </Modal>

    </div>
  );
};

export default Growth;
