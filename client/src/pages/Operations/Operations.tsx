// 运营管理：行业热点（AI 生成 + 手动维护）+ 运营日历 + 个人任务 + 团队任务
// 从私域社群摘出，独立左侧栏目

import React, { useEffect, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Edit3,
  User,
  Users,
  CheckCircle2,
  Circle,
  ClipboardList,
  Flame,
  Sparkles,
  Loader2,
  Star,
  Check,
  Briefcase,
  Upload,
  FileText,
  X,
} from 'lucide-react';
import GlassCard from '../../components/GlassCard';
import Modal from '../../components/Modal';
import { useWorkspace } from '../../store/workspace';
import { getMyLLMConfig, apiMissingHint } from '../../utils/llmConfig';
import { callLLMStream } from '../../utils/llmCall';
import {
  getCalEvents,
  addCalEvent,
  updateCalEvent,
  removeCalEvent,
  getTasks,
  addTask,
  updateTask,
  removeTask,
  type CalEvent,
  type OpTask,
} from '../../utils/communityStore';
import {
  getHotspots,
  getHotspotsByMonth,
  addHotspot,
  addHotspots,
  updateHotspot,
  removeHotspot,
  getProjects,
  addProject,
  updateProject,
  removeProject,
  clearProjects,
  loadSampleProjects,
  clearUnmodifiedSamples,
  composeProjectPrompt,
  parseHotspots,
  parseProjectFromDoc,
  buildHotspotPrompt,
  buildDocExtractPrompt,
  MAX_DOC_CHARS,
  HOTSPOT_CATEGORIES,
  HOTSPOT_AUDIENCES,
  HOTSPOT_INDUSTRIES,
  type HotspotItem,
  type HotspotProject,
  type HotspotCategory,
  type HotspotAudience,
} from '../../utils/hotspotStore';

type OpTab = 'calendar' | 'personal' | 'team';
type ToastMsg = { type: 'success' | 'error' | 'info'; message: string } | null;

const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const CAL_TYPES = ['活动', '公开课', '分享', '直播', '运营', '其他'];
const PRIORITY_LABEL: Record<OpTask['priority'], { label: string; cls: string }> = {
  high: { label: '高', cls: 'bg-rose-500/20 text-rose-300' },
  mid: { label: '中', cls: 'bg-amber-500/20 text-amber-300' },
  low: { label: '低', cls: 'bg-white/10 text-white/50' },
};

const Operations: React.FC = () => {
  const { currentStaff, staffList } = useWorkspace();
  const [tab, setTab] = useState<OpTab>('calendar');
  const [toast, setToast] = useState<ToastMsg>(null);
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2400);
  };

  // ===== 日历 state =====
  const now = new Date();
  const [calMonth, setCalMonth] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [calEvents, setCalEvents] = useState<CalEvent[]>(() => getCalEvents());
  const [calForm, setCalForm] = useState<{ open: boolean; id: string | null; date: string; title: string; type: string }>({
    open: false, id: null, date: '', title: '', type: '活动',
  });

  // ===== 任务 state =====
  const [tasks, setTasks] = useState<OpTask[]>(() => getTasks());
  const [taskForm, setTaskForm] = useState<{ open: boolean; scope: OpTask['scope']; title: string; assignee: string; date: string; priority: OpTask['priority']; visibility: OpTask['visibility'] }>({
    open: false, scope: 'personal', title: '', assignee: currentStaff.name, date: new Date().toISOString().slice(0, 10), priority: 'mid', visibility: 'all',
  });

  // ===== 行业热点 state =====
  const [hotspots, setHotspots] = useState<HotspotItem[]>(() => getHotspots());
  const [projects, setProjects] = useState<HotspotProject[]>(() => getProjects());
  const CUSTOM = '__custom__'; // 不绑定项目，需求描述自由输入
  const [projectId, setProjectId] = useState<string>(() => {
    const ps = getProjects();
    return ps[0]?.id || CUSTOM;
  });
  const [reqText, setReqText] = useState<string>(() => {
    const ps = getProjects();
    return ps[0] ? composeProjectPrompt(ps[0]) : '';
  });
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState('');
  type HotspotDraft = Omit<HotspotItem, 'id' | 'createdAt'>;
  const [preview, setPreview] = useState<{ open: boolean; items: HotspotDraft[] }>({ open: false, items: [] });
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [hotForm, setHotForm] = useState<{ open: boolean; id: string | null; date: string; title: string; category: HotspotCategory; audience: HotspotAudience; note: string }>({
    open: false, id: null, date: '', title: '', category: '开学', audience: '公立校', note: '',
  });
  const [dayDetail, setDayDetail] = useState<{ open: boolean; date: string }>({ open: false, date: '' });
  const [projForm, setProjForm] = useState<{ open: boolean; id: string | null; name: string; industry: string; city: string; audience: string; nodes: HotspotCategory[]; extra: string }>({
    open: false, id: null, name: '', industry: 'K12教培', city: '', audience: '', nodes: [], extra: '',
  });
  // 项目文档（Word 上传）
  const [docState, setDocState] = useState<{ name: string; text: string }>({ name: '', text: '' });
  const [docBusy, setDocBusy] = useState(false);
  const [docMsg, setDocMsg] = useState('');

  const currentProject = projects.find((p) => p.id === projectId) || null;

  const monthHotspots = getHotspotsByMonth(calMonth.year, calMonth.month);

  // 一次性迁移：清掉早期自动写入、且从未被改动的示例项目
  useEffect(() => {
    const n = clearUnmodifiedSamples();
    if (n > 0) {
      const next = getProjects();
      setProjects(next);
      setProjectId(next[0]?.id || CUSTOM);
      setReqText(next[0] ? composeProjectPrompt(next[0]) : '');
    }
  }, []);

  /** 选择项目 → 用项目配置拼出需求描述并回填输入框 */
  const applyProject = (id: string) => {
    setProjectId(id);
    if (id === CUSTOM) return;
    const p = projects.find((x) => x.id === id);
    if (p) setReqText(composeProjectPrompt(p));
  };

  const openProjectForm = (id: string | null) => {
    setDocMsg('');
    if (id) {
      const p = projects.find((x) => x.id === id);
      if (!p) return;
      setProjForm({ open: true, id: p.id, name: p.name, industry: p.industry, city: p.city, audience: p.audience, nodes: p.nodes, extra: p.extra });
      setDocState({ name: p.docName || '', text: p.docText || '' });
    } else {
      setProjForm({ open: true, id: null, name: '', industry: 'K12教培', city: '', audience: '', nodes: [], extra: '' });
      setDocState({ name: '', text: '' });
    }
  };

  /** 上传 Word 文档 → 本地零依赖解析出纯文本 */
  const handleDocFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/\.docx$/i.test(f.name)) {
      showToast('error', '仅支持 .docx（Word 2007+），旧版 .doc 请先另存为 .docx');
      return;
    }
    setDocBusy(true);
    setDocMsg('正在解析文档...');
    try {
      const { extractDocxText } = await import('../../utils/docxText');
      const text = await extractDocxText(f);
      const kept = text.slice(0, MAX_DOC_CHARS);
      setDocState({ name: f.name, text: kept });
      showToast('success', `已读取 ${text.length} 字${text.length > MAX_DOC_CHARS ? `，超出部分截断为 ${MAX_DOC_CHARS} 字` : ''}`);
    } catch (err: any) {
      showToast('error', `文档解析失败：${String(err?.message || err).slice(0, 120)}`);
    } finally {
      setDocBusy(false);
      setDocMsg('');
    }
  };

  /** 让 AI 读文档 → 自动填项目字段 */
  const extractProjectFromDoc = async () => {
    if (!docState.text) {
      showToast('error', '请先上传 Word 文档');
      return;
    }
    const llm = getMyLLMConfig('xiaohongshu');
    if (!llm?.apiKey || !llm?.baseUrl) {
      showToast('error', apiMissingHint());
      return;
    }
    setDocBusy(true);
    setDocMsg('正在请求模型...');
    try {
      const { system, user } = buildDocExtractPrompt(docState.text, docState.name);
      const cfg = { ...llm, temperature: 0.3, maxTokens: Math.max(llm.maxTokens || 0, 4096) };
      const raw = await callLLMStream(cfg, [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], () => {}, (m) => setDocMsg(m));
      const p = parseProjectFromDoc(raw, docState.name);
      if (!p) {
        showToast('error', '未能从文档中提取出项目信息，请手动填写');
        return;
      }
      setProjForm((prev) => ({
        ...prev,
        name: p.name || prev.name,
        industry: p.industry || prev.industry,
        city: p.city || prev.city,
        audience: p.audience || prev.audience,
        nodes: p.nodes.length > 0 ? p.nodes : prev.nodes,
        extra: p.extra || prev.extra,
      }));
      showToast('success', '已从文档提取项目信息，核对后保存');
    } catch (err: any) {
      showToast('error', `提取失败：${String(err?.message || err).slice(0, 140)}`);
    } finally {
      setDocBusy(false);
      setDocMsg('');
    }
  };

  const clearAllProjects = () => {
    if (projects.length === 0) return;
    if (!window.confirm(`清空全部 ${projects.length} 个项目？已生成的热点不受影响。`)) return;
    clearProjects();
    setProjects(getProjects());
    setProjectId(CUSTOM);
    showToast('success', '项目已清空');
  };

  const loadSamples = () => {
    const n = loadSampleProjects();
    if (n === 0) {
      showToast('info', '示例项目已存在，无需重复载入');
      return;
    }
    const next = getProjects();
    setProjects(next);
    setProjectId(next[0].id);
    setReqText(composeProjectPrompt(next[0]));
    showToast('success', `已载入 ${n} 个示例项目`);
  };

  const saveProjectForm = () => {
    if (!projForm.name.trim()) {
      showToast('error', '项目名称不能为空');
      return;
    }
    if (projForm.nodes.length === 0) {
      showToast('error', '至少选择一个关注节点类型');
      return;
    }
    const payload = {
      name: projForm.name.trim(),
      industry: projForm.industry,
      city: projForm.city.trim(),
      audience: projForm.audience.trim(),
      nodes: projForm.nodes,
      extra: projForm.extra.trim(),
      docName: docState.name || undefined,
      docText: docState.text || undefined,
    };
    if (projForm.id) {
      updateProject(projForm.id, payload);
      const next = getProjects();
      setProjects(next);
      const p = next.find((x) => x.id === projForm.id);
      if (p) setReqText(composeProjectPrompt(p));
      showToast('success', '项目已更新，需求描述已同步');
    } else {
      const p = addProject(payload);
      const next = getProjects();
      setProjects(next);
      setProjectId(p.id);
      setReqText(composeProjectPrompt(p));
      showToast('success', `项目「${p.name}」已创建`);
    }
    setProjForm({ ...projForm, open: false });
  };

  const deleteProject = () => {
    if (!currentProject) return;
    if (!window.confirm(`删除项目「${currentProject.name}」？已生成的热点不受影响。`)) return;
    removeProject(currentProject.id);
    const next = getProjects();
    setProjects(next);
    if (next.length > 0) {
      setProjectId(next[0].id);
      setReqText(composeProjectPrompt(next[0]));
    } else {
      setProjectId(CUSTOM);
    }
    showToast('success', '项目已删除');
  };

  const generateHotspots = async () => {
    const requirement = reqText.trim();
    if (!requirement) {
      showToast('error', '请先填写行业需求描述');
      return;
    }
    const llm = getMyLLMConfig('xiaohongshu');
    if (!llm?.apiKey || !llm?.baseUrl) {
      showToast('error', apiMissingHint());
      return;
    }
    setGenerating(true);
    setGenMsg('正在请求模型...');
    try {
      const { year, month } = calMonth;
      const { system, user } = buildHotspotPrompt(requirement, year, month, currentProject?.docText);
      const cfg = { ...llm, temperature: 0.4, maxTokens: Math.max(llm.maxTokens || 0, 8192) };
      const result = await callLLMStream(cfg, [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], () => {}, (m) => setGenMsg(m));
      const parsed = parseHotspots(result, year, month);
      if (parsed.length === 0) {
        showToast('error', 'AI 未返回可解析的热点，请换个说法或补充行业/城市后重试');
        return;
      }
      setPreview({ open: true, items: parsed });
      setChecked(Object.fromEntries(parsed.map((_, i) => [i, true])));
      showToast('success', `已解析 ${parsed.length} 条热点，勾选后写入日历`);
    } catch (e: any) {
      showToast('error', `生成失败：${String(e?.message || e).slice(0, 140)}`);
    } finally {
      setGenerating(false);
      setGenMsg('');
    }
  };

  const confirmPreview = () => {
    const picked = preview.items.filter((_, i) => checked[i]);
    if (picked.length === 0) {
      showToast('error', '至少勾选一条');
      return;
    }
    const n = addHotspots(picked);
    setHotspots(getHotspots());
    setPreview({ open: false, items: [] });
    setChecked({});
    showToast('success', n > 0 ? `已写入 ${n} 条热点` : '所选热点已存在，未重复写入');
  };

  const saveHotForm = () => {
    if (!hotForm.title.trim()) {
      showToast('error', '热点标题不能为空');
      return;
    }
    const payload = {
      date: hotForm.date,
      title: hotForm.title.trim(),
      category: hotForm.category,
      audience: hotForm.audience,
      note: hotForm.note.trim(),
    };
    if (hotForm.id) {
      updateHotspot(hotForm.id, payload);
      showToast('success', '热点已更新');
    } else {
      addHotspot({ ...payload, pinned: false, source: 'manual' });
      showToast('success', '热点已添加');
    }
    setHotspots(getHotspots());
    setHotForm({ ...hotForm, open: false, id: null, title: '', note: '' });
  };

  // ===== 日历逻辑 =====
  const generateCalendar = () => {
    const { year, month } = calMonth;
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: { day: number | null; events: CalEvent[]; hots: HotspotItem[] }[] = [];
    for (let i = 0; i < firstDay; i++) cells.push({ day: null, events: [], hots: [] });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        day: d,
        events: calEvents.filter((e) => e.date === dateStr),
        hots: hotspots.filter((h) => h.date === dateStr),
      });
    }
    return cells;
  };
  const calendarCells = generateCalendar();

  // 当日详情面板数据
  const dayHots = hotspots.filter((h) => h.date === dayDetail.date);
  const dayEvents = calEvents.filter((e) => e.date === dayDetail.date);
  const dayTaskList = tasks.filter((t) => t.date === dayDetail.date);

  const saveCalForm = () => {
    if (!calForm.title.trim()) {
      showToast('error', '事件标题不能为空');
      return;
    }
    if (calForm.id) {
      updateCalEvent(calForm.id, { date: calForm.date, title: calForm.title.trim(), type: calForm.type });
      showToast('success', '事件已更新');
    } else {
      addCalEvent({ date: calForm.date, title: calForm.title.trim(), type: calForm.type });
      showToast('success', '事件已添加');
    }
    setCalEvents(getCalEvents());
    setCalForm({ open: false, id: null, date: '', title: '', type: '活动' });
  };

  // ===== 任务逻辑 =====
  const saveTask = () => {
    if (!taskForm.title.trim()) {
      showToast('error', '任务内容不能为空');
      return;
    }
    addTask({
      title: taskForm.title.trim(),
      assignee: taskForm.assignee,
      scope: taskForm.scope,
      date: taskForm.date,
      done: false,
      priority: taskForm.priority,
      visibility: taskForm.visibility,
    });
    setTasks(getTasks());
    setTaskForm({ ...taskForm, open: false, title: '' });
    showToast('success', '✓ 任务已添加' + (taskForm.scope === 'team' ? '，今日任务会显示在私域社群·运营日报' : ''));
  };

  const renderTaskList = (scope: OpTask['scope']) => {
    const list = tasks
      .filter((t) => t.scope === scope && (scope === 'team' || t.assignee === currentStaff.name))
      .sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || a.date.localeCompare(b.date));
    if (list.length === 0) {
      return <p className="text-xs text-white/30 py-10 text-center">暂无{scope === 'personal' ? '个人' : '团队'}任务，点右上角添加</p>;
    }
    return (
      <div className="space-y-1.5">
        {list.map((t) => (
          <div key={t.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${t.done ? 'bg-white/3 border-white/5 opacity-60' : 'bg-white/5 border-white/10'}`}>
            <button onClick={() => { updateTask(t.id, { done: !t.done }); setTasks(getTasks()); }}>
              {t.done ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Circle className="w-4 h-4 text-white/30" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${t.done ? 'text-white/40 line-through' : 'text-white'}`}>{t.title}</p>
              <p className="text-[10px] text-white/40 mt-0.5">
                {t.assignee} · {t.date}
                {t.scope === 'team' && (
                  <span className={`ml-1.5 px-1 py-0.5 rounded ${t.visibility === 'all' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-white/40'}`}>
                    {t.visibility === 'all' ? '全员可看' : '仅组员'}
                  </span>
                )}
              </p>
            </div>
            <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_LABEL[t.priority].cls}`}>
              {PRIORITY_LABEL[t.priority].label}优先级
            </span>
            <button
              onClick={() => { if (window.confirm('删除该任务？')) { removeTask(t.id); setTasks(getTasks()); } }}
              className="text-rose-300/40 hover:text-rose-300 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
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
        <div>
          <h2 className="text-white text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-cyan-400" /> 运营管理
          </h2>
          <p className="text-xs text-white/50 mt-1">运营日历 · 个人任务 · 团队任务（今日任务同步到私域社群·运营日报）</p>
        </div>
        <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
          {(
            [
              { key: 'calendar', label: '📅 运营日历' },
              { key: 'personal', label: '👤 个人任务' },
              { key: 'team', label: '👥 团队任务' },
            ] as { key: OpTab; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === t.key ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-md' : 'text-white/60 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'calendar' && (
        <>
      {/* 行业热点 */}
      <GlassCard hoverable={false}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-white font-medium text-sm flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" /> 行业热点
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
              {calMonth.month}月 {monthHotspots.length} 条
            </span>
          </h3>
          <button
            onClick={() => setHotForm({ open: true, id: null, date: `${calMonth.year}-${String(calMonth.month).padStart(2, '0')}-01`, title: '', category: '开学', audience: '公立校', note: '' })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> 手动添加
          </button>
        </div>

        <div className="flex gap-2 mb-2 flex-wrap items-center">
          <select
            value={projectId}
            onChange={(e) => applyProject(e.target.value)}
            className="h-9 px-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white max-w-[180px]"
          >
            {projects.length === 0 && <option value={CUSTOM}>暂无项目</option>}
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value={CUSTOM}>自定义描述（不绑定项目）</option>
          </select>
          <button
            onClick={() => openProjectForm(null)}
            title="新建项目"
            className="px-2.5 py-1.5 rounded-lg bg-white/5 text-white/60 hover:text-white text-xs flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> 项目
          </button>
          <button
            onClick={() => currentProject && openProjectForm(currentProject.id)}
            disabled={!currentProject}
            title="编辑当前项目"
            className="px-2.5 py-1.5 rounded-lg bg-white/5 text-white/60 hover:text-white text-xs disabled:opacity-30"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={deleteProject}
            disabled={!currentProject}
            title="删除当前项目"
            className="px-2.5 py-1.5 rounded-lg bg-white/5 text-rose-300/50 hover:text-rose-300 text-xs disabled:opacity-30"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <input
            value={reqText}
            onChange={(e) => setReqText(e.target.value)}
            placeholder="选择项目后自动填充，也可直接改这句描述再生成"
            className="flex-1 min-w-[240px] h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-xs text-white"
          />
          <button
            onClick={generateHotspots}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-medium disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generating ? '生成中...' : `AI 生成 ${calMonth.month} 月热点`}
          </button>
        </div>
        {generating && <p className="text-[11px] text-cyan-300 mb-2">{genMsg}</p>}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {currentProject ? (
            <>
              <span className="text-[10px] text-white/30 flex items-center gap-1">
                <Briefcase className="w-3 h-3" /> 当前项目
              </span>
              {currentProject.industry && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">{currentProject.industry}</span>}
              {currentProject.city && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">{currentProject.city}</span>}
              {currentProject.audience && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">{currentProject.audience}</span>}
              {currentProject.nodes.map((n) => (
                <span key={n} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">{n}</span>
              ))}
              {currentProject?.docName && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300" title={currentProject.docName}>
                  已附文档 {currentProject.docName}
                </span>
              )}
              <span className="text-[10px] text-white/25">改配置点铅笔图标，改完需求描述会同步</span>
              <button onClick={clearAllProjects} className="text-[10px] text-rose-300/40 hover:text-rose-300 ml-auto">清空全部项目</button>
            </>
          ) : (
            <span className="text-[10px] text-white/30 flex items-center gap-1">
              <Briefcase className="w-3 h-3" /> 当前为自定义描述，未被任何项目绑定，改了不会被覆盖
            </span>
          )}
          {projects.length === 0 && (
            <button onClick={loadSamples} className="text-[10px] text-cyan-300/60 hover:text-cyan-300 ml-auto">载入 5 个示例项目</button>
          )}
        </div>

        {monthHotspots.length === 0 ? (
          <p className="text-xs text-white/30 py-6 text-center">本月还没有热点，点「AI 生成 {calMonth.month} 月热点」或「手动添加」</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
            {monthHotspots.map((h) => (
              <div key={h.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-white/5 border border-white/5">
                <span className="text-xs text-amber-300 font-mono w-[46px] shrink-0">{h.date.slice(5)}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">{h.category}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{h.title}</p>
                  {h.note && <p className="text-[10px] text-white/40 truncate">{h.note}</p>}
                </div>
                <span className="text-[10px] text-white/30 shrink-0">{h.audience}</span>
                <span className={`text-[9px] px-1 py-0.5 rounded shrink-0 ${h.source === 'ai' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-white/10 text-white/40'}`}>
                  {h.source === 'ai' ? 'AI' : '手动'}
                </span>
                <button
                  onClick={() => { updateHotspot(h.id, { pinned: !h.pinned }); setHotspots(getHotspots()); }}
                  title="星标置顶"
                  className={h.pinned ? 'text-amber-300' : 'text-white/20 hover:text-white/50'}
                >
                  <Star className="w-3.5 h-3.5" fill={h.pinned ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={() => setHotForm({ open: true, id: h.id, date: h.date, title: h.title, category: h.category, audience: h.audience, note: h.note })}
                  className="text-white/40 hover:text-white/80"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { if (window.confirm('删除该热点？')) { removeHotspot(h.id); setHotspots(getHotspots()); } }}
                  className="text-rose-300/40 hover:text-rose-300"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* 运营日历 */}
        <GlassCard hoverable={false}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCalMonth((m) => (m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 }))}
                className="w-8 h-8 rounded-md flex items-center justify-center text-white/60 hover:bg-white/10"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="text-white font-medium text-sm">{calMonth.year}年{monthNames[calMonth.month - 1]}</h3>
              <button
                onClick={() => setCalMonth((m) => (m.month === 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 }))}
                className="w-8 h-8 rounded-md flex items-center justify-center text-white/60 hover:bg-white/10"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setCalForm({ open: true, id: null, date: `${calMonth.year}-${String(calMonth.month).padStart(2, '0')}-01`, title: '', type: '活动' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> 添加日程
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
              <div key={d} className="text-center text-xs text-white/40 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((c, i) => {
              const isToday = c.day === now.getDate() && calMonth.month === now.getMonth() + 1 && calMonth.year === now.getFullYear();
              return (
                <div
                  key={i}
                  onClick={() => c.day && setDayDetail({ open: true, date: `${calMonth.year}-${String(calMonth.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}` })}
                  className={`min-h-[64px] p-1.5 rounded-lg border transition-colors ${
                    c.day
                      ? isToday
                        ? 'bg-cyan-500/20 border-cyan-500/40'
                        : 'bg-white/3 border-white/5 hover:bg-white/5 cursor-pointer'
                      : 'border-transparent'
                  }`}
                >
                  {c.day && (
                    <>
                      <p className={`text-xs ${isToday ? 'text-cyan-300 font-bold' : 'text-white/60'}`}>{c.day}</p>
                      {[...c.hots, ...c.events].slice(0, 2).map((x) => {
                        const isHot = 'category' in x;
                        return (
                          <p
                            key={x.id}
                            onClick={(evt) => {
                              evt.stopPropagation();
                              if (isHot) {
                                const h = x as HotspotItem;
                                setHotForm({ open: true, id: h.id, date: h.date, title: h.title, category: h.category, audience: h.audience, note: h.note });
                              } else {
                                const e = x as CalEvent;
                                setCalForm({ open: true, id: e.id, date: e.date, title: e.title, type: e.type });
                              }
                            }}
                            className={`text-[10px] truncate mt-0.5 cursor-pointer hover:underline ${isHot ? 'text-amber-300' : 'text-cyan-300'}`}
                          >
                            {x.title}
                          </p>
                        );
                      })}
                      {c.hots.length + c.events.length > 2 && (
                        <p className="text-[9px] text-white/30">+{c.hots.length + c.events.length - 2} 更多</p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 mb-1">
            <span className="flex items-center gap-1.5 text-[10px] text-white/40">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> 学校 / 行业热点
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-white/40">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> 团队日程
            </span>
            <span className="text-[10px] text-white/25 ml-auto">点任意一天查看当日合并详情</span>
          </div>
          {calEvents.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <h4 className="text-sm text-white/80 mb-2">全部日程（{calEvents.length}）</h4>
              <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin">
                {[...calEvents].sort((a, b) => a.date.localeCompare(b.date)).map((e) => (
                  <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
                    <span className="text-xs text-cyan-300 font-mono w-20 shrink-0">{e.date}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 shrink-0">{e.type}</span>
                    <span className="text-sm text-white flex-1">{e.title}</span>
                    <button onClick={() => setCalForm({ open: true, id: e.id, date: e.date, title: e.title, type: e.type })} className="text-white/40 hover:text-white/80">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { if (window.confirm('删除该日程？')) { removeCalEvent(e.id); setCalEvents(getCalEvents()); } }}
                      className="text-rose-300/40 hover:text-rose-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
        </>
      )}

      {/* 个人任务 */}
      {tab === 'personal' && (
        <GlassCard hoverable={false}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium text-sm flex items-center gap-2">
              <User className="w-4 h-4 text-cyan-400" /> 我的任务（{tasks.filter((t) => t.scope === 'personal' && t.assignee === currentStaff.name && !t.done).length} 待办）
            </h3>
            <button
              onClick={() => setTaskForm({ open: true, scope: 'personal', title: '', assignee: currentStaff.name, date: new Date().toISOString().slice(0, 10), priority: 'mid', visibility: 'member' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> 添加个人任务
            </button>
          </div>
          {renderTaskList('personal')}
        </GlassCard>
      )}

      {/* 团队任务 */}
      {tab === 'team' && (
        <GlassCard hoverable={false}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" /> 团队任务（{tasks.filter((t) => t.scope === 'team' && !t.done).length} 待办）
            </h3>
            <button
              onClick={() => setTaskForm({ open: true, scope: 'team', title: '', assignee: staffList[0]?.name || '', date: new Date().toISOString().slice(0, 10), priority: 'mid', visibility: 'all' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> 发布团队任务
            </button>
          </div>
          {renderTaskList('team')}
        </GlassCard>
      )}

      {/* 日程弹窗 */}
      <Modal open={calForm.open} onClose={() => setCalForm({ ...calForm, open: false })} title={calForm.id ? '编辑日程' : '添加日程'} maxWidth="max-w-sm">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1">日期</label>
            <input type="date" value={calForm.date} onChange={(e) => setCalForm({ ...calForm, date: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">类型</label>
            <select value={calForm.type} onChange={(e) => setCalForm({ ...calForm, type: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
              {CAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">标题</label>
            <input value={calForm.title} onChange={(e) => setCalForm({ ...calForm, title: e.target.value })} placeholder="例：六年级家长会" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setCalForm({ ...calForm, open: false })} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
            <button onClick={saveCalForm} className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium">保存</button>
          </div>
        </div>
      </Modal>

      {/* 任务弹窗 */}
      <Modal open={taskForm.open} onClose={() => setTaskForm({ ...taskForm, open: false })} title={taskForm.scope === 'personal' ? '添加个人任务' : '发布团队任务'} maxWidth="max-w-sm">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1">任务内容</label>
            <input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="例：整理本周社群活跃数据" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 block mb-1">负责人</label>
              {taskForm.scope === 'team' ? (
                <select value={taskForm.assignee} onChange={(e) => setTaskForm({ ...taskForm, assignee: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                  {staffList.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              ) : (
                <input value={taskForm.assignee} disabled className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white/50" />
              )}
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">计划日期</label>
              <input type="date" value={taskForm.date} onChange={(e) => setTaskForm({ ...taskForm, date: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">优先级</label>
              <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as OpTask['priority'] })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                <option value="high">高</option>
                <option value="mid">中</option>
                <option value="low">低</option>
              </select>
            </div>
            {taskForm.scope === 'team' && (
              <div>
                <label className="text-xs text-white/50 block mb-1">可见范围</label>
                <select value={taskForm.visibility} onChange={(e) => setTaskForm({ ...taskForm, visibility: e.target.value as OpTask['visibility'] })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                  <option value="all">全员可看</option>
                  <option value="member">仅组员（管理员）可看</option>
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setTaskForm({ ...taskForm, open: false })} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
            <button onClick={saveTask} className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium">保存</button>
          </div>
        </div>
      </Modal>

      {/* AI 热点预览弹窗 */}
      <Modal open={preview.open} onClose={() => setPreview({ open: false, items: [] })} title={`AI 热点预览（${preview.items.length} 条）`} maxWidth="max-w-2xl">
        <p className="text-[11px] text-white/40 mb-3">勾选要写入日历的热点，可直接在列表里改标题 / 日期 / 分类。写入时会自动跳过同日期同标题的重复项。</p>
        <div className="space-y-1.5 max-h-80 overflow-y-auto scrollbar-thin">
          {preview.items.map((it, i) => (
            <div key={i} className={`flex items-center gap-2.5 p-2 rounded-lg border ${checked[i] ? 'bg-white/5 border-amber-500/20' : 'bg-white/3 border-white/5 opacity-50'}`}>
              <button onClick={() => setChecked({ ...checked, [i]: !checked[i] })} className="shrink-0">
                {checked[i]
                  ? <Check className="w-4 h-4 text-amber-300" />
                  : <Circle className="w-4 h-4 text-white/25" />}
              </button>
              <input
                type="date"
                value={it.date}
                onChange={(e) => {
                  const next = [...preview.items];
                  next[i] = { ...next[i], date: e.target.value };
                  setPreview({ ...preview, items: next });
                }}
                className="w-[124px] h-8 px-2 rounded bg-white/5 border border-white/10 text-xs text-white font-mono"
              />
              <input
                value={it.title}
                onChange={(e) => {
                  const next = [...preview.items];
                  next[i] = { ...next[i], title: e.target.value };
                  setPreview({ ...preview, items: next });
                }}
                className="flex-1 min-w-0 h-8 px-2 rounded bg-white/5 border border-white/10 text-xs text-white"
              />
              <select
                value={it.category}
                onChange={(e) => {
                  const next = [...preview.items];
                  next[i] = { ...next[i], category: e.target.value as HotspotCategory };
                  setPreview({ ...preview, items: next });
                }}
                className="h-8 px-2 rounded bg-white/5 border border-white/10 text-xs text-white"
              >
                {HOTSPOT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={it.audience}
                onChange={(e) => {
                  const next = [...preview.items];
                  next[i] = { ...next[i], audience: e.target.value as HotspotAudience };
                  setPreview({ ...preview, items: next });
                }}
                className="h-8 px-2 rounded bg-white/5 border border-white/10 text-xs text-white"
              >
                {HOTSPOT_AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <button
                onClick={() => {
                  const next = preview.items.filter((_, idx) => idx !== i);
                  const nextChecked: Record<number, boolean> = {};
                  Object.keys(checked).forEach((k) => {
                    const ki = Number(k);
                    if (ki < i) nextChecked[ki] = checked[ki];
                    else if (ki > i) nextChecked[ki - 1] = checked[ki];
                  });
                  setPreview({ ...preview, items: next });
                  setChecked(nextChecked);
                }}
                className="text-rose-300/40 hover:text-rose-300 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-3 mt-1">
          <button
            onClick={() => setChecked(Object.fromEntries(preview.items.map((_, i) => [i, true])))}
            className="text-xs text-white/50 hover:text-white"
          >
            全选
          </button>
          <div className="flex gap-2">
            <button onClick={() => setPreview({ open: false, items: [] })} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
            <button onClick={confirmPreview} className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium">
              写入日历（{preview.items.filter((_, i) => checked[i]).length}）
            </button>
          </div>
        </div>
      </Modal>

      {/* 热点编辑弹窗 */}
      <Modal open={hotForm.open} onClose={() => setHotForm({ ...hotForm, open: false })} title={hotForm.id ? '编辑热点' : '添加热点'} maxWidth="max-w-sm">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1">日期</label>
            <input type="date" value={hotForm.date} onChange={(e) => setHotForm({ ...hotForm, date: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">标题</label>
            <input value={hotForm.title} onChange={(e) => setHotForm({ ...hotForm, title: e.target.value })} placeholder="例：六年级半期测" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 block mb-1">节点类型</label>
              <select value={hotForm.category} onChange={(e) => setHotForm({ ...hotForm, category: e.target.value as HotspotCategory })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                {HOTSPOT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">影响对象</label>
              <select value={hotForm.audience} onChange={(e) => setHotForm({ ...hotForm, audience: e.target.value as HotspotAudience })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                {HOTSPOT_AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">备注 / 应对建议</label>
            <textarea value={hotForm.note} onChange={(e) => setHotForm({ ...hotForm, note: e.target.value })} rows={3} placeholder="例：考前两周推诊断课，考后一周做试卷分析直播" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white resize-none" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setHotForm({ ...hotForm, open: false })} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
            <button onClick={saveHotForm} className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium">保存</button>
          </div>
        </div>
      </Modal>

      {/* 项目配置弹窗 */}
      <Modal open={projForm.open} onClose={() => setProjForm({ ...projForm, open: false })} title={projForm.id ? `编辑项目 · ${projForm.name}` : '新建项目'} maxWidth="max-w-lg">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1">项目名称</label>
            <input value={projForm.name} onChange={(e) => setProjForm({ ...projForm, name: e.target.value })} placeholder="例：南星教育" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 block mb-1">行业</label>
              <select value={projForm.industry} onChange={(e) => setProjForm({ ...projForm, industry: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                {HOTSPOT_INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">城市 / 区域</label>
              <input value={projForm.city} onChange={(e) => setProjForm({ ...projForm, city: e.target.value })} placeholder="例：重庆" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
            </div>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">目标人群 / 学段</label>
            <input value={projForm.audience} onChange={(e) => setProjForm({ ...projForm, audience: e.target.value })} placeholder="例：小学、初中家长（幼小至初三）" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">项目说明文档（可选，Word .docx）</label>
            {docState.text ? (
              <div className="rounded-lg bg-white/5 border border-white/10 p-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <FileText className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                  <span className="text-xs text-white flex-1 min-w-0 truncate">{docState.name}</span>
                  <span className="text-[10px] text-white/40 shrink-0">{docState.text.length} 字</span>
                  <button
                    onClick={() => setDocState({ name: '', text: '' })}
                    title="移除文档"
                    className="text-white/40 hover:text-rose-300 shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-white/35 leading-relaxed line-clamp-3 mb-2">
                  {docState.text.slice(0, 200)}{docState.text.length > 200 ? '…' : ''}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={extractProjectFromDoc}
                    disabled={docBusy}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-[11px] font-medium disabled:opacity-50"
                  >
                    {docBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    AI 读取文档并填充
                  </button>
                  <label className="px-2.5 py-1.5 rounded-lg bg-white/5 text-white/60 hover:text-white text-[11px] cursor-pointer">
                    换一个文档
                    <input type="file" accept=".docx" onChange={handleDocFile} className="hidden" />
                  </label>
                  <span className="text-[10px] text-white/25">生成热点时 AI 会一并参考这份文档</span>
                </div>
                {docBusy && docMsg && <p className="text-[10px] text-cyan-300 mt-1.5">{docMsg}</p>}
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-lg border border-dashed border-white/15 hover:border-cyan-500/40 cursor-pointer transition-colors">
                <Upload className="w-4 h-4 text-white/40" />
                <span className="text-xs text-white/50">点击上传 Word 文档，AI 自动读取并填好下面的字段</span>
                <span className="text-[10px] text-white/25">仅支持 .docx（Word 2007+），旧版 .doc 请另存为 .docx</span>
                <input type="file" accept=".docx" onChange={handleDocFile} className="hidden" />
              </label>
            )}
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1.5">关注节点类型（可多选，至少 1 个）</label>
            <div className="grid grid-cols-4 gap-1.5">
              {HOTSPOT_CATEGORIES.map((c) => {
                const on = projForm.nodes.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setProjForm({ ...projForm, nodes: on ? projForm.nodes.filter((n) => n !== c) : [...projForm.nodes, c] })}
                    className={`px-2 py-1.5 rounded-lg text-xs border transition-colors ${
                      on ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">补充要求</label>
            <textarea
              value={projForm.extra}
              onChange={(e) => setProjForm({ ...projForm, extra: e.target.value })}
              rows={3}
              placeholder="例：重点关注小升初点招与衔接班窗口、38 个账号矩阵的内容排期节点"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">生成时会用的需求描述</label>
            <p className="w-full px-3 py-2 rounded-lg bg-white/3 border border-white/5 text-[11px] text-white/50 leading-relaxed">
              {composeProjectPrompt({ id: '', name: projForm.name, industry: projForm.industry, city: projForm.city, audience: projForm.audience, nodes: projForm.nodes, extra: projForm.extra, createdAt: '' }) || '填写后自动生成'}
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setProjForm({ ...projForm, open: false })} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
            <button onClick={saveProjectForm} className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium">保存项目</button>
          </div>
        </div>
      </Modal>

      {/* 当日详情弹窗 */}
      <Modal open={dayDetail.open} onClose={() => setDayDetail({ open: false, date: '' })} title={`${dayDetail.date} · 当日详情`} maxWidth="max-w-lg">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs text-amber-300 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" /> 学校 / 行业热点（{dayHots.length}）
              </h4>
              <button
                onClick={() => setHotForm({ open: true, id: null, date: dayDetail.date, title: '', category: '开学', audience: '公立校', note: '' })}
                className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/60 hover:text-white"
              >
                + 加热点
              </button>
            </div>
            {dayHots.length === 0 ? (
              <p className="text-[11px] text-white/25 py-2">当天无热点</p>
            ) : (
              <div className="space-y-1">
                {dayHots.map((h) => (
                  <div key={h.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">{h.category}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white truncate">{h.title}</p>
                      {h.note && <p className="text-[10px] text-white/40 truncate">{h.note}</p>}
                    </div>
                    <span className="text-[10px] text-white/30 shrink-0">{h.audience}</span>
                    <button onClick={() => setHotForm({ open: true, id: h.id, date: h.date, title: h.title, category: h.category, audience: h.audience, note: h.note })} className="text-white/40 hover:text-white/80">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { if (window.confirm('删除该热点？')) { removeHotspot(h.id); setHotspots(getHotspots()); } }} className="text-rose-300/40 hover:text-rose-300">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs text-cyan-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> 团队日程（{dayEvents.length}）
              </h4>
              <button
                onClick={() => setCalForm({ open: true, id: null, date: dayDetail.date, title: '', type: '活动' })}
                className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/60 hover:text-white"
              >
                + 加日程
              </button>
            </div>
            {dayEvents.length === 0 ? (
              <p className="text-[11px] text-white/25 py-2">当天无团队日程</p>
            ) : (
              <div className="space-y-1">
                {dayEvents.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 shrink-0">{e.type}</span>
                    <span className="flex-1 min-w-0 text-xs text-white truncate">{e.title}</span>
                    <button onClick={() => setCalForm({ open: true, id: e.id, date: e.date, title: e.title, type: e.type })} className="text-white/40 hover:text-white/80">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { if (window.confirm('删除该日程？')) { removeCalEvent(e.id); setCalEvents(getCalEvents()); } }} className="text-rose-300/40 hover:text-rose-300">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {dayTaskList.length > 0 && (
            <div>
              <h4 className="text-xs text-white/60 mb-2 flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" /> 当日任务（{dayTaskList.length}）
              </h4>
              <div className="space-y-1">
                {dayTaskList.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                    {t.done ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Circle className="w-3.5 h-3.5 text-white/30" />}
                    <span className={`flex-1 min-w-0 text-xs truncate ${t.done ? 'text-white/40 line-through' : 'text-white'}`}>{t.title}</span>
                    <span className="text-[10px] text-white/30 shrink-0">{t.assignee}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Operations;
