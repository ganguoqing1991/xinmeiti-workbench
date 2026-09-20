// 二创加工页面
// 功能：模型配置 + 任务栏 + 生成区 + 历史记录

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Play,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mic,
  Zap,
  HelpCircle,
  Plus,
  Pencil,
  UploadCloud,
  BarChart3,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Bot,
  Video,
  Cpu,
  ClipboardList,
  History,
  FileText,
  Image as ImageIcon,
  ExternalLink,
} from 'lucide-react';
import GlassCard from '../../components/GlassCard';
import Modal from '../../components/Modal';
import { StudioPanel, PhonePreview } from './ReprocessStudio';
import { getReprocessTasks, removeReprocessTask, removeManyReprocessTasks, clearReprocessQueue, updateReprocessTask, type ReprocessTask } from '../../utils/reprocessQueue';
import {
  getMyLLMConfig,
  getASRConfig,
  transcribeAudio,
  extractScriptViaLLM,
  type ReprocessSkill,
} from '../../utils/llmConfig';
import { useWorkspace } from '../../store/workspace';
import { getMember, type Member } from '../../utils/memberStore';
import {
  loadSkills,
  addSkill as addSkillRemote,
  updateSkill as updateSkillRemote,
  removeSkill as removeSkillRemote,
  migrateLocalSkills,
  SKILL_CLOUD_ENABLED,
} from '../../utils/skillStore';
import { formatTime } from '../../utils/format';
import { subscribeNotifications } from '../../utils/notificationStore';
import {
  subscribeEngine,
  getEngineState,
  enqueueTasks,
  enqueueAllPending,
  pauseEngine,
  type GenerationType,
} from '../../utils/reprocessEngine';

import {
  getHistory,
  clearHistory,
  removeHistory,
  archiveTaskResult,
  archiveManyTaskResults,
  type GenerationHistory,
} from '../../utils/reprocessHistory';

// 二创改写 / 内容分析 的视觉元数据（用于结果卡片与历史卡片的按模式高亮）
const MODE_META: Record<'recreate' | 'analyze', {
  label: string;
  icon: string;
  badge: string;
  box: string;
  headText: string;
  headIcon: string;
}> = {
  recreate: {
    label: '二创改写',
    icon: '✨',
    badge: 'bg-purple-500/20 text-purple-200 border border-purple-400/30',
    box: 'bg-purple-500/5 border-purple-500/30 text-white/85',
    headText: 'text-purple-200',
    headIcon: 'text-purple-400',
  },
  analyze: {
    label: '内容分析',
    icon: '📊',
    badge: 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30',
    box: 'bg-cyan-500/5 border-cyan-500/30 text-white/85',
    headText: 'text-cyan-200',
    headIcon: 'text-cyan-400',
  },
};

const Reprocess: React.FC = () => {
  const [platform, setPlatform] = useState<'xiaohongshu' | 'douyin'>(() => {
    const search = window.location.search;
    if (search.includes('platform=douyin')) return 'douyin';
    if (search.includes('platform=xiaohongshu')) return 'xiaohongshu';
    try {
      const last = localStorage.getItem('reprocess_last_platform');
      if (last === 'douyin' || last === 'xiaohongshu') return last;
    } catch {}
    return 'xiaohongshu';
  });
  useEffect(() => {
    try { localStorage.setItem('reprocess_last_platform', platform); } catch {}
  }, [platform]);

  // 任务列表（实时跟随后台引擎刷新）
  const [tasks, setTasks] = useState<ReprocessTask[]>(() => getReprocessTasks());
  const platformTasks = useMemo(
    () => tasks.filter((t) => t.platform === platform),
    [tasks, platform]
  );

  // 当前查看的任务（点击行查看结果）
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // 批量勾选集合
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 批量加工模式
  const [batchMode, setBatchMode] = useState<GenerationType>('recreate');
  // 批量使用的 Skill
  const [batchSkillId, setBatchSkillId] = useState<string>('__default__');

  const [history, setHistory] = useState<GenerationHistory[]>(() => getHistory());
  // 历史检索：模式筛选 + 关键词 + 全部展开
  const [historyFilter, setHistoryFilter] = useState<'all' | 'recreate' | 'analyze'>('all');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyExpand, setHistoryExpand] = useState(false);
  const [skills, setSkillsState] = useState<ReprocessSkill[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2400);
  };
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [editingSkill, setEditingSkill] = useState<ReprocessSkill | null>(null);

  const { currentStaff } = useWorkspace();
  const me: Member | null = getMember(currentStaff.name);
  const effectiveLLM = useMemo(
    () => getMyLLMConfig(platform),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [platform, currentStaff.name, me?.apiMode, me?.apiRequest]
  );
  const usingShared = me?.apiMode !== 'own';

  const engine = getEngineState();

  // 订阅引擎 + 通知：任务状态/进度变化时刷新本页
  useEffect(() => {
    // 引擎 / 通知有变化就同步任务与历史（历史由引擎在生成成功时自动归档）
    const handler = () => {
      setTasks(getReprocessTasks());
      setHistory(getHistory());
    };
    const unE = subscribeEngine(handler);
    const unN = subscribeNotifications(handler);
    return () => { unE(); unN(); };
  }, []);

  // 首次挂载：回填老版本里已生成、但从未进过历史的结果（幂等，重复打开不会翻倍）
  useEffect(() => {
    try {
      const rescued = archiveManyTaskResults(
        getReprocessTasks().filter((t) => t.status === 'done' && t.result && t.result.trim()),
        'manual'
      );
      if (rescued > 0) {
        setHistory(getHistory());
        showToast('info', `已回填 ${rescued} 条历史生成结果，可在下方「生成历史」调取`);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切平台时清掉查看/勾选，避免错位
  useEffect(() => {
    setSelectedTaskId(null);
    setSelectedIds(new Set());
  }, [platform]);

  // Skills 加载
  useEffect(() => {
    let cancelled = false;
    loadSkills(platform).then((sks) => {
      if (cancelled) return;
      setSkillsState(sks);
      setBatchSkillId((prev) =>
        prev === '__default__' ? sks.find((s) => s.enabled)?.id || '__default__' : prev
      );
    });
    return () => { cancelled = true; };
  }, [platform]);
  const refreshSkills = useCallback(() => {
    loadSkills(platform).then(setSkillsState);
  }, [platform]);

  // 首次挂载默认选中第一个
  useEffect(() => {
    if (!selectedTaskId && platformTasks.length > 0) setSelectedTaskId(platformTasks[0].id);
  }, [platformTasks, selectedTaskId]);

  const selectedTask = useMemo(
    () => platformTasks.find((t) => t.id === selectedTaskId) || null,
    [platformTasks, selectedTaskId]
  );
  const batchSkill = useMemo(
    () => (batchSkillId && batchSkillId !== '__default__' ? skills.find((s) => s.id === batchSkillId) : undefined),
    [skills, batchSkillId]
  );

  // 历史检索：按平台 + 模式 + 关键词过滤
  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return history.filter((h) => {
      if (h.platform !== platform) return false;
      if (historyFilter !== 'all' && (h.mode || 'recreate') !== historyFilter) return false;
      if (!q) return true;
      return (
        h.taskTitle.toLowerCase().includes(q) ||
        h.skillLabel.toLowerCase().includes(q) ||
        (h.accountName || '').toLowerCase().includes(q) ||
        h.result.toLowerCase().includes(q)
      );
    });
  }, [history, historyFilter, historyQuery, platform]);
  const HISTORY_PREVIEW = 12;
  const shownHistory = historyExpand ? filteredHistory : filteredHistory.slice(0, HISTORY_PREVIEW);

  // ===== 批量勾选 =====
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(platformTasks.map((t) => t.id)));
  const clearSelect = () => setSelectedIds(new Set());

  const handleEnqueueSelected = () => {
    if (selectedIds.size === 0) {
      showToast('error', '请先在左侧勾选要加工的任务');
      return;
    }
    enqueueTasks([...selectedIds], batchMode, batchSkillId);
    showToast('success', `已加入队列（${selectedIds.size} 条），后台自动处理中，可切走页面`);
  };
  const handleEnqueueAll = () => {
    const n = enqueueAllPending(platform, batchMode, batchSkillId);
    if (n === 0) {
      showToast('info', '当前没有可加入的任务（都已处理或为空）');
      return;
    }
    showToast('success', `已加入队列（${n} 条），后台自动处理中`);
  };
  const handlePause = () => {
    pauseEngine();
    showToast('info', '已暂停，完成当前这条后停止');
  };

  // 任务编辑（重命名）
  const commitRename = (id: string) => {
    if (editingTaskTitle.trim()) {
      updateReprocessTask(id, { title: editingTaskTitle.trim() });
      setTasks(getReprocessTasks());
    }
    setEditingTaskId(null);
  };

  // 删除任务：先抢救归档结果，再移除任务 —— 结果永远不跟着任务一起消失
  const handleDeleteTask = (id: string) => {
    const target = tasks.find((t) => t.id === id);
    const hasResult = !!(target && target.result && target.result.trim());
    const tip = hasResult
      ? '确定从任务栏移除此任务？\n\n✓ 已生成的改写/分析结果会自动保留在下方「生成历史」，不会一起删掉。'
      : '确定从任务栏移除此任务？';
    if (!window.confirm(tip)) return;
    // 抢救归档（幂等：引擎已归档过就不会重复写）
    let kept = false;
    if (target) kept = archiveTaskResult(target, 'delete');
    removeReprocessTask(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setTasks(getReprocessTasks());
    setHistory(getHistory());
    if (selectedTaskId === id) setSelectedTaskId(null);
    showToast('success', kept ? '已移除任务 · 生成结果已存入历史' : '已从任务栏移除');
  };

  // 清空当前平台任务：同样先把有结果的全部归档
  const handleClearAll = () => {
    if (platformTasks.length === 0) return;
    const withResult = platformTasks.filter((t) => t.result && t.result.trim()).length;
    const tip =
      `确定清空${platform === 'xiaohongshu' ? '小红书' : '抖音'}平台的 ${platformTasks.length} 个任务？\n\n` +
      (withResult > 0
        ? `✓ 其中 ${withResult} 个已有生成结果，会先存入「生成历史」再清空，不会被删除。\n`
        : '') +
      '其他平台的任务不会被影响。';
    if (!window.confirm(tip)) return;
    const kept = archiveManyTaskResults(platformTasks, 'delete');
    const next = tasks.filter((t) => t.platform !== platform);
    try { localStorage.setItem('reprocess_queue_v1', JSON.stringify(next)); } catch (e) { /* ignore */ }
    setTasks(next);
    setSelectedTaskId(null);
    setSelectedIds(new Set());
    setHistory(getHistory());
    showToast(
      'success',
      kept > 0
        ? `已清空任务 · ${kept} 条生成结果已保留在历史`
        : `已清空${platform === 'xiaohongshu' ? '小红书' : '抖音'}平台任务`
    );
  };

  // 复制结果
  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => showToast('success', '已复制到剪贴板'));
  };

  // 手动提取口播文案（选中任务），写回原内容与对标池
  const handleExtract = async () => {
    const task = selectedTask;
    if (!task) return;
    const audioUrl = task.audioUrl;
    const videoUrl = task.videoUrl;
    const llmReady = effectiveLLM.useVideoUnderstanding && effectiveLLM.apiKey && effectiveLLM.modelName;
    if (videoUrl && llmReady) {
      showToast('info', '🎬 正在用多模态 LLM 看视频提取文案...');
      try {
        const transcript = await extractScriptViaLLM(effectiveLLM, videoUrl);
        updateReprocessTask(task.id, { content: transcript, transcripted: true });
        setTasks(getReprocessTasks());
        try {
          const { updatePost, updateAccountPost } = await import('../../utils/parseTable');
          updatePost(task.platform, task.postId, { content: transcript });
          const accId = task.postId.split('-p')[0];
          updateAccountPost(task.platform, accId, task.postId, { content: transcript });
        } catch (e) { /* ignore */ }
        showToast('success', `✓ LLM 提取成功（${transcript.length} 字）`);
      } catch (e: any) {
        showToast('error', `LLM 提取失败：${e?.message?.slice(0, 120) || '未知'} · 请确认模型为多模态`);
      }
      return;
    }
    if (!audioUrl) {
      showToast('error', '当前任务没有「音频文件链接」；若有视频链接可开启「视频理解」用 LLM 提取');
      return;
    }
    const asr = getASRConfig();
    if (!asr.enabled) {
      showToast('error', '请先到左侧「API」栏目，在「语音转文字 ASR」中启用');
      return;
    }
    const ready = asr.provider === 'volc-asr'
      ? !!(asr.volcApiKey && asr.volcResourceId)
      : !!(asr.apiKey && asr.modelName);
    if (!ready) {
      showToast('error', '请先到左侧「API」栏目，把「语音转文字 ASR」凭证填完整');
      return;
    }
    showToast('info', '🎙️ 正在用 ASR 提取口播文案...');
    try {
      const transcript = await transcribeAudio(asr, audioUrl);
      updateReprocessTask(task.id, { content: transcript, transcripted: true });
      setTasks(getReprocessTasks());
      try {
        const { updatePost, updateAccountPost } = await import('../../utils/parseTable');
        updatePost(task.platform, task.postId, { content: transcript });
        const accId = task.postId.split('-p')[0];
        updateAccountPost(task.platform, accId, task.postId, { content: transcript });
      } catch (e) { /* ignore */ }
      showToast('success', `✓ 提取成功（${transcript.length} 字），可加入批量队列`);
    } catch (e: any) {
      showToast('error', `提取失败：${e?.message?.slice(0, 120) || '未知错误'}`);
    }
  };

  // 状态徽章
  const StatusBadge = ({ status, progress }: { status: ReprocessTask['status']; progress?: string }) => {
    const map: Record<ReprocessTask['status'], { label: string; cls: string; spin?: boolean }> = {
      idle: { label: '待处理', cls: 'bg-white/10 text-white/50' },
      pending: { label: '排队中', cls: 'bg-amber-500/15 text-amber-300' },
      processing: { label: '处理中', cls: 'bg-blue-500/15 text-blue-300', spin: true },
      done: { label: '已完成', cls: 'bg-emerald-500/15 text-emerald-300' },
      error: { label: '失败', cls: 'bg-rose-500/15 text-rose-300' },
    };
    const m = map[status];
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${m.cls}`}>
        {m.spin && <Loader2 className="w-3 h-3 animate-spin" />}
        {m.label}
      </span>
    );
  };

  // 当前查看任务的实时结果（处理中看引擎流式，否则看已存结果）
  const liveResult =
    selectedTask && selectedTask.status === 'processing' && engine.activeTaskId === selectedTask.id
      ? engine.liveResult
      : selectedTask?.result || '';
  const liveProgress =
    selectedTask && selectedTask.status === 'processing' && engine.activeTaskId === selectedTask.id
      ? engine.progress
      : selectedTask?.progress || '';
  // 结果卡片按当前任务的模式高亮（缺省回退二创）
  const resultMode = selectedTask?.mode || 'recreate';

  return (
    <div className="space-y-6">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 right-6 z-[60]"
          >
            <div
              className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg backdrop-blur-md ${
                toast.type === 'success'
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-100'
                  : toast.type === 'error'
                  ? 'bg-rose-500/20 border border-rose-500/40 text-rose-100'
                  : 'bg-blue-500/20 border border-blue-500/40 text-blue-100'
              }`}
            >
              {toast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 顶部 Header + 平台切换 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-white text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-purple-400" /> 二创加工
          </h2>
          <p className="text-sm text-white/50 mt-1">
            内容展示池点「+ 二创」加入任务栏 · 勾选多条 → 设置模式 → 一键批量后台生成
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
            <button
              onClick={() => setPlatform('xiaohongshu')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                platform === 'xiaohongshu'
                  ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              小红书
            </button>
            <button
              onClick={() => setPlatform('douyin')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                platform === 'douyin'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              抖音
            </button>
          </div>
          <Link
            to="/api"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            API 配置
          </Link>
        </div>
      </div>

      {/* API 全局提示：按模式分流 */}
      {!effectiveLLM.apiKey && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5" />
          <div className="flex-1 text-sm text-amber-200 leading-relaxed">
            {usingShared
              ? '当前使用团队共用接口，但管理员尚未配置。请联系管理员在「API 配置 → 团队共用接口」中设置后即可使用。'
              : '请先配置模型 API：统一配置 LLM 与 ASR，完成后所有调用 API 的模块都会从这里读取。'}
          </div>
          <Link
            to="/api"
            className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500 text-amber-950 hover:bg-amber-400 transition-colors"
          >
            去配置
          </Link>
        </div>
      )}

      {/* Skill 管理面板已移入「创作依据」工作台（StudioPanel 的 skillsSlot），点「管理（含启用）」展开 */}

      {/* 主体：左任务栏（多选+状态） + 中创作工作台（五阶段） + 右实时预览/结果 */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* 左列：任务栏 */}
        <div className="xl:col-span-3 space-y-5">
          <GlassCard hoverable={false}>
            {/* 任务栏头部：全选 + 开始全部 + 运行状态 */}
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h3 className="text-white font-semibold text-base flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-purple-400" /> 任务栏
                <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-200">
                  {platformTasks.length}
                </span>
                <span className="text-xs text-white/40">
                  ({platform === 'xiaohongshu' ? '小红书' : '抖音'})
                </span>
              </h3>
              <div className="flex items-center gap-2">
                {platformTasks.length > 0 && (
                  <>
                    <button
                      onClick={selectAll}
                      className="text-xs text-white/60 hover:text-white"
                    >
                      全选
                    </button>
                    <button
                      onClick={clearSelect}
                      className="text-xs text-white/60 hover:text-white"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleEnqueueAll}
                      className="text-xs px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-medium hover:opacity-90"
                    >
                      开始全部
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 运行状态条 */}
            <div className="mb-3 flex items-center gap-2 text-xs">
              {engine.running ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-300">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 后台处理中（可切走页面）
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-white/5 text-white/40">空闲</span>
              )}
              {engine.running && (
                <button
                  onClick={handlePause}
                  className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
                >
                  暂停
                </button>
              )}
            </div>

            {platformTasks.length === 0 ? (
              <div className="py-14 text-center">
                <ClipboardList className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-base text-white/40">{platform === 'xiaohongshu' ? '小红书' : '抖音'}任务栏为空</p>
                <p className="text-sm text-white/30 mt-2">
                  去「{platform === 'xiaohongshu' ? '小红书' : '抖音'}运营 → 内容展示」点「+ 二创」
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[640px] overflow-y-auto scrollbar-thin pr-1">
                {platformTasks.map((t, i) => {
                  const isViewing = t.id === selectedTaskId;
                  const isChecked = selectedIds.has(t.id);
                  const isProcessing = t.status === 'processing' && engine.activeTaskId === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTaskId(t.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isViewing
                          ? 'bg-purple-500/15 border-purple-500/40'
                          : isChecked
                          ? 'bg-white/10 border-white/20'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* 批量勾选 */}
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleSelect(t.id)}
                          className="mt-1 w-4 h-4 accent-purple-500 shrink-0 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          {editingTaskId === t.id ? (
                            <input
                              autoFocus
                              value={editingTaskTitle}
                              onChange={(e) => setEditingTaskTitle(e.target.value)}
                              onBlur={() => commitRename(t.id)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename(t.id);
                                if (e.key === 'Escape') setEditingTaskId(null);
                              }}
                              className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-sm text-white"
                            />
                          ) : (
                            <p
                              className="text-sm text-white font-medium leading-snug line-clamp-2"
                              title={t.title}
                            >
                              {t.title}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <StatusBadge status={t.status} />
                            <span className="text-xs text-white/40 truncate">
                              {t.accountName}
                            </span>
                            <span className="text-xs text-white/30">
                              {formatTime(t.addedAt)}
                            </span>
                          </div>
                          {(isProcessing || t.status === 'pending') && t.progress && (
                            <p className="text-xs text-white/50 mt-1.5 flex items-center gap-1.5">
                              {isProcessing && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                              {t.progress}
                            </p>
                          )}
                          {t.status === 'error' && t.errorMsg && (
                            <p className="text-xs text-rose-300 mt-1.5">✗ {t.errorMsg}</p>
                          )}
                        </div>
                      </div>
                      {/* 行内操作 */}
                      <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-white/5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTaskId(t.id);
                            setEditingTaskTitle(t.title);
                          }}
                          className="text-xs px-2 py-1 rounded bg-white/5 text-white/50 hover:text-white"
                          title="重命名"
                        >
                          <Pencil className="w-3.5 h-3.5 inline" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTask(t.id);
                          }}
                          className="ml-auto text-xs px-2 py-1 rounded bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {platformTasks.length > 0 && (
              <button
                onClick={handleClearAll}
                className="mt-3 text-xs text-rose-300 hover:text-rose-200 w-full text-center"
              >
                清空{platform === 'xiaohongshu' ? '小红书' : '抖音'}任务栏
              </button>
            )}
          </GlassCard>

          {/* 加工设置：模式 + Skill + 开始选中 */}
          <GlassCard hoverable={false}>
            <h3 className="text-white font-semibold text-base mb-4 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-purple-400" /> 批量加工设置
            </h3>
            {/* 模式切换 */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-white/60 w-16 shrink-0">加工模式</span>
              <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
                <button
                  onClick={() => setBatchMode('recreate')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    batchMode === 'recreate'
                      ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  ✨ 二创改写
                </button>
                <button
                  onClick={() => setBatchMode('analyze')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    batchMode === 'analyze'
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-md'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  📊 内容分析
                </button>
              </div>
            </div>
            {/* Skill 选择 */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white/60">使用 Skill</span>
                <span className="text-xs text-white/40">
                  {batchSkill ? `已选：${batchSkill.label}` : '默认系统提示词'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={() => setBatchSkillId('__default__')}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    batchSkillId === '__default__'
                      ? 'bg-purple-500/15 border-purple-500/40'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <span className="text-sm text-white font-medium">默认提示词</span>
                  <p className="text-xs text-white/40 mt-0.5">按系统内置框架产出</p>
                </button>
                {skills
                  .filter((s) => s.enabled)
                  .map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setBatchSkillId(s.id)}
                      className={`text-left p-3 rounded-lg border transition-all ${
                        batchSkillId === s.id
                          ? 'bg-purple-500/15 border-purple-500/40'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <CheckCircle2 className="w-4 h-4 text-purple-400" />
                        <span className="text-sm text-white font-medium">{s.label}</span>
                      </div>
                      <p className="text-xs text-white/40 line-clamp-2">{s.prompt.slice(0, 60)}...</p>
                    </button>
                  ))}
              </div>
            </div>
            {/* 开始按钮 */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleEnqueueSelected}
                disabled={selectedIds.size === 0}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-semibold text-base hover:opacity-90 disabled:opacity-50 transition-all"
              >
                <Play className="w-5 h-5" />
                开始选中（{selectedIds.size}）
              </button>
            </div>
            <p className="mt-2.5 text-xs text-white/40 flex items-center gap-1">
              💡 勾选左侧多条任务后点「开始选中」，系统会按队列在后台依次处理（顺序处理，不触发限流）；
              处理中可切走页面，回来自动同步，完成的任务会推送到右上角通知中心。
            </p>
          </GlassCard>
        </div>

        {/* 中列：创作工作台（原稿展示 + 创作依据 + 标题/提纲/分页/配图/成绩五阶段） */}
        <div className="xl:col-span-6">
          <StudioPanel
            task={selectedTask}
            effectiveLLM={effectiveLLM}
            skillPrompt={batchSkill?.prompt || ''}
            skillLabel={batchSkill ? batchSkill.label : ''}
            showToast={showToast}
            onExtract={handleExtract}
            skillsSlot={
              <SkillPanel
                platform={platform}
                skills={skills}
                cloudEnabled={SKILL_CLOUD_ENABLED}
                onAdd={() => setShowAddSkill(true)}
                onUpload={async (newSkills) => {
                  await Promise.all(
                    newSkills.map((s) => addSkillRemote(platform, { label: s.label, prompt: s.prompt }, 'personal'))
                  );
                  refreshSkills();
                  showToast('success', `✓ 已上传 ${newSkills.length} 个 Skill`);
                }}
                onEdit={(s) => setEditingSkill(s)}
                onDelete={async (id) => {
                  if (window.confirm('确定删除此 Skill？')) {
                    await removeSkillRemote(platform, id);
                    refreshSkills();
                    showToast('success', '已删除 Skill');
                  }
                }}
                onToggle={async (id, enabled) => {
                  await updateSkillRemote(platform, id, { enabled });
                  refreshSkills();
                }}
                onMigrate={async (scope) => {
                  const n = await migrateLocalSkills(platform, scope);
                  refreshSkills();
                  showToast('success', `✓ 已迁移 ${n} 个本地 Skill 到云端`);
                }}
              />
            }
          />
        </div>

        {/* 右列：手机实时预览 + 结果 + 历史 */}
        <div className="xl:col-span-3 space-y-5">
          <PhonePreview task={selectedTask} />

          {/* 实时结果 / 已存结果（按模式高亮） */}
          {liveResult && (() => {
            const m = MODE_META[resultMode];
            const isLive = selectedTask?.status === 'processing';
            return (
              <GlassCard hoverable={false}>
                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                  <h3 className={`text-white font-semibold text-base flex items-center gap-2 ${m.headText}`}>
                    <FileText className={`w-5 h-5 ${m.headIcon}`} />
                    {isLive ? `生成中（实时）· ${m.label}` : `${m.icon} ${m.label}结果`}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${m.badge}`}>{m.label}</span>
                    <span className="text-xs text-white/40">{liveResult.length} 字</span>
                    <button
                      onClick={() => handleCopy(liveResult)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" /> 复制
                    </button>
                  </div>
                </div>
                {isLive && liveProgress && (
                  <p className="mb-2 text-sm text-white/50 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> {liveProgress}
                  </p>
                )}
                <div className={`p-4 rounded-xl border leading-7 text-[13px] whitespace-pre-wrap max-h-[60vh] overflow-y-auto scrollbar-thin ${m.box}`}>
                  {liveResult}
                </div>
              </GlassCard>
            );
          })()}

          {/* 生成历史（常驻：改写 / 分析结果自动留存，删除任务不会带走） */}
          <GlassCard hoverable={false}>
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h3 className="text-white font-semibold text-base flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" /> 生成历史
                <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-200">
                  {filteredHistory.length}
                </span>
              </h3>
              <button
                onClick={() => {
                  if (!history.length) return;
                  if (window.confirm('确定清空全部历史？（已留存的改写/分析结果都会被删除，且无法恢复）')) {
                    clearHistory();
                    setHistory([]);
                  }
                }}
                className="text-xs text-rose-300 hover:text-rose-200"
              >
                清空历史
              </button>
            </div>

            {/* 检索区：模式筛选 + 关键词 */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/5 border border-white/10">
                {([
                  { key: 'all', label: '全部' },
                  { key: 'recreate', label: '✨ 二创改写' },
                  { key: 'analyze', label: '📊 内容分析' },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setHistoryFilter(opt.key)}
                    className={`text-xs px-2.5 py-1 rounded-md transition-all ${
                      historyFilter === opt.key
                        ? 'bg-white/15 text-white'
                        : 'text-white/50 hover:text-white/80'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <input
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder="搜标题 / 账号 / Skill / 正文内容"
                className="flex-1 min-w-[180px] text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none focus:border-purple-400/40"
              />
            </div>

            {shownHistory.length === 0 ? (
              <div className="py-8 text-center">
                <History className="w-8 h-8 text-white/15 mx-auto mb-2" />
                <p className="text-sm text-white/40">
                  {history.length === 0
                    ? '还没有留存的结果 · 生成一次二创改写或内容分析后会自动存档'
                    : '当前筛选条件下没有记录'}
                </p>
                {history.length > 0 && filteredHistory.length === 0 && (
                  <p className="mt-1 text-xs text-white/30">
                    已留存 {history.length} 条（含另一平台/其它模式），试着切换上方筛选或平台查看
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-[26rem] overflow-y-auto scrollbar-thin">
                {shownHistory.map((h) => {
                  const m = MODE_META[h.mode || 'recreate'];
                  const accent = h.mode === 'analyze' ? 'border-l-cyan-400/50' : 'border-l-purple-400/50';
                  return (
                    <details
                      key={h.id}
                      className={`p-3 rounded-lg bg-white/5 border border-white/10 border-l-2 ${accent} hover:bg-white/10`}
                    >
                      <summary className="cursor-pointer">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${m.badge}`}>
                            {m.icon} {m.label}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-white/60 border border-white/10 shrink-0">
                            {h.skillLabel}
                          </span>
                          <span className="text-xs text-white/30 shrink-0">{formatTime(h.createdAt)}</span>
                          <span className="text-xs text-white/40 truncate">· 来源: {h.taskTitle}</span>
                          {h.source === 'delete' && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200/80 border border-amber-400/20"
                              title="该结果在任务被删除/清空时抢救留存"
                            >
                              任务已删·结果保留
                            </span>
                          )}
                        </div>
                        <div className={`mt-2 p-2 rounded ${m.box} line-clamp-2`}>
                          {h.result ? h.result : <span className="text-rose-300">⚠️ 生成结果为空（请重新生成）</span>}
                        </div>
                      </summary>
                      <div className={`mt-2 p-3 rounded border text-sm max-h-40 overflow-y-auto scrollbar-thin whitespace-pre-wrap ${m.box}`}>
                        {h.result}
                      </div>
                      <div className="mt-2 flex items-center gap-1 flex-wrap">
                        <button
                          onClick={() => handleCopy(h.result)}
                          className="text-xs px-2 py-0.5 rounded bg-white/5 text-white/60 hover:text-white"
                        >
                          <Copy className="w-3.5 h-3.5 inline mr-0.5" /> 复制
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(
                              `【${m.label}】${h.taskTitle}\n${h.result}`
                            );
                            showToast('success', '已复制（含来源标题）');
                          }}
                          className="text-xs px-2 py-0.5 rounded bg-white/5 text-white/60 hover:text-white"
                        >
                          <ClipboardList className="w-3.5 h-3.5 inline mr-0.5" /> 带来源复制
                        </button>
                        {h.accountName && (
                          <span className="text-xs text-white/30 ml-1">原账号：{h.accountName}</span>
                        )}
                        <button
                          onClick={() => {
                            if (!window.confirm('确定删除这条留存结果？删除后无法恢复。')) return;
                            removeHistory(h.id);
                            setHistory(getHistory());
                            showToast('success', '已删除该条留存');
                          }}
                          className="text-xs px-2 py-0.5 rounded bg-white/5 text-rose-300/80 hover:text-rose-200 ml-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline mr-0.5" /> 删除
                        </button>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}

            {filteredHistory.length > HISTORY_PREVIEW && (
              <button
                onClick={() => setHistoryExpand((v) => !v)}
                className="mt-2 w-full text-xs py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center gap-1"
              >
                {historyExpand ? (
                  <><ChevronUp className="w-3.5 h-3.5" /> 收起（共 {filteredHistory.length} 条）</>
                ) : (
                  <><ChevronDown className="w-3.5 h-3.5" /> 展开全部 {filteredHistory.length} 条</>
                )}
              </button>
            )}
            <p className="mt-2 text-xs text-white/35">
              💡 每次生成成功都会自动存档（含二创改写与内容分析）；删除任务或清空队列时，已有结果会先存进这里再移除。
            </p>
          </GlassCard>
        </div>
      </div>

      {/* Skill 编辑 Modal */}
      {editingSkill && (
        <SkillEditModal
          skill={editingSkill}
          onClose={() => setEditingSkill(null)}
          onSave={(patch) => {
            updateSkillRemote(platform, editingSkill.id, patch);
            refreshSkills();
            setEditingSkill(null);
            showToast('success', '已更新 Skill');
          }}
        />
      )}

      {/* 新增 Skill Modal */}
      {showAddSkill && (
        <SkillEditModal
          skill={null}
          cloudEnabled={SKILL_CLOUD_ENABLED}
          onClose={() => setShowAddSkill(false)}
          onSave={(patch) => {
            addSkillRemote(platform, { label: patch.label, prompt: patch.prompt }, patch.scope || 'personal');
            refreshSkills();
            setShowAddSkill(false);
            showToast('success', '已添加 Skill');
          }}
        />
      )}
    </div>
  );
};
// ===== Skill 面板 =====
const SkillPanel: React.FC<{
  platform: string;
  skills: ReprocessSkill[];
  cloudEnabled: boolean;
  onAdd: () => void;
  onUpload: (skills: { label: string; prompt: string }[]) => void;
  onEdit: (s: ReprocessSkill) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onMigrate: (scope: 'shared' | 'personal') => void;
}> = ({ platform, skills, cloudEnabled, onAdd, onUpload, onEdit, onDelete, onToggle, onMigrate }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [skillCollapsed, setSkillCollapsed] = useState(false);
  const [tab, setTab] = useState<'shared' | 'personal'>('personal');

  const visibleSkills = cloudEnabled
    ? skills.filter((s) => (tab === 'shared' ? s.scope === 'shared' : (s.scope || 'personal') === 'personal'))
    : skills;

  // 解析上传文件：支持 .json / .md / .txt
  const parseSkillFile = async (file: File): Promise<{ label: string; prompt: string }[]> => {
    const text = await file.text();
    const ext = file.name.toLowerCase().split('.').pop() || '';
    // 1. JSON 格式（可批量）
    if (ext === 'json') {
      try {
        const j = JSON.parse(text);
        if (Array.isArray(j)) {
          return j
            .filter((it: any) => it && (it.label || it.name) && it.prompt)
            .map((it: any) => ({
              label: String(it.label || it.name).trim(),
              prompt: String(it.prompt).trim(),
            }));
        }
        // 单个对象
        if (j.label && j.prompt) {
          return [{ label: String(j.label).trim(), prompt: String(j.prompt).trim() }];
        }
        throw new Error('JSON 中未找到 label/prompt 字段');
      } catch (e: any) {
        throw new Error(`JSON 解析失败：${e?.message || '未知'}`);
      }
    }
    // 2. Markdown / TXT：首行作为 label（去掉 # 前缀），其余作为 prompt
    const lines = text.split('\n');
    let label = '';
    let prompt = '';
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      label = firstLine.replace(/^#+\s*/, '').trim() || file.name.replace(/\.[^.]+$/, '');
      prompt = lines.slice(1).join('\n').trim() || firstLine;
    }
    if (!label || !prompt) throw new Error('文件内容为空');
    return [{ label, prompt }];
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setImporting(true);
    try {
      const all: { label: string; prompt: string }[] = [];
      const errors: string[] = [];
      for (const f of Array.from(fileList)) {
        try {
          const parsed = await parseSkillFile(f);
          all.push(...parsed);
        } catch (e: any) {
          errors.push(`${f.name}: ${e?.message || '解析失败'}`);
        }
      }
      if (all.length > 0) {
        onUpload(all);
      }
      if (errors.length > 0) {
        window.alert(`部分文件解析失败：\n${errors.join('\n')}`);
      }
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <GlassCard hoverable={false} className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setSkillCollapsed(!skillCollapsed)}
          className="flex items-center gap-1.5 text-left"
          title={skillCollapsed ? '展开 Skill 列表' : '收起 Skill 列表'}
        >
          {skillCollapsed ? (
            <ChevronRight className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/40" />
          )}
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <Bot className="w-4 h-4 text-purple-400" /> Skill 列表
            <span className="text-[10px] text-white/40">（{platform} · 选中后参与生成）</span>
          </h3>
        </button>
        {cloudEnabled && (
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
            <button
              onClick={() => setTab('personal')}
              className={`px-2 py-1 rounded-md text-xs ${
                tab === 'personal' ? 'bg-purple-500 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              我的
            </button>
            <button
              onClick={() => setTab('shared')}
              className={`px-2 py-1 rounded-md text-xs ${
                tab === 'shared' ? 'bg-purple-500 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              共享库
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.md,.txt"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 text-xs disabled:opacity-50"
            title="支持 .json（批量）/ .md / .txt 格式"
          >
            {importing ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> 解析中
              </>
            ) : (
              <>
                <UploadCloud className="w-3 h-3" /> 上传 Skill
              </>
            )}
          </button>
          <button
            onClick={onAdd}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs"
          >
            <Plus className="w-3 h-3" /> 新增 Skill
          </button>
          {cloudEnabled && (
            <button
              onClick={() => {
                if (window.confirm('把当前浏览器里的本地 Skill 上传到云端「我的」库？（默认技能除外）')) {
                  onMigrate('personal');
                }
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 text-xs"
              title="将 localStorage 里的技能一键上传到云端"
            >
              <UploadCloud className="w-3 h-3" /> 迁移到云端
            </button>
          )}
        </div>
      </div>
      {!skillCollapsed && (
        <>
          <p className="text-[10px] text-white/40 mb-2">
            💡 支持 <code className="text-emerald-300 font-mono">.json</code>（批量多 skill）/ <code className="text-emerald-300 font-mono">.md</code> / <code className="text-emerald-300 font-mono">.txt</code>（首行作为名称，其余作为提示词）
          </p>
          {cloudEnabled && visibleSkills.length === 0 && (
            <p className="text-xs text-white/40 mb-2">
              {tab === 'shared' ? '共享库暂无技能（由管理员添加）' : '你还没有云端技能，可点「新增 Skill」或「上传」'}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {visibleSkills.map((s) => (
              <div
                key={s.id}
                className={`p-3 rounded-lg border ${
                  s.enabled ? 'bg-white/5 border-white/10' : 'bg-white/3 border-white/5 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-white font-medium flex items-center gap-1.5">
                    {s.label}
                    {cloudEnabled && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                          s.scope === 'shared'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-indigo-500/15 text-indigo-300'
                        }`}
                      >
                        {s.scope === 'shared' ? '共享' : '我的'}
                      </span>
                    )}
                  </span>
                  <label className="cursor-pointer flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={(e) => onToggle(s.id, e.target.checked)}
                      className="w-3.5 h-3.5 accent-purple-500"
                    />
                    <span className="text-[10px] text-white/50">启用</span>
                  </label>
                </div>
                <p className="text-[10px] text-white/50 line-clamp-3 mb-2">{s.prompt}</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => onEdit(s)}
                    className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/60 hover:text-white"
                  >
                    <Pencil className="w-3 h-3 inline mr-0.5" /> 编辑
                  </button>
                  <button
                    onClick={() => onDelete(s.id)}
                    className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 ml-auto"
                  >
                    <Trash2 className="w-3 h-3 inline" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  );
};

// ===== Skill 编辑 Modal =====
const SkillEditModal: React.FC<{
  skill: ReprocessSkill | null;
  cloudEnabled?: boolean;
  onClose: () => void;
  onSave: (patch: { label: string; prompt: string; scope?: 'shared' | 'personal' }) => void;
}> = ({ skill, cloudEnabled, onClose, onSave }) => {
  const [label, setLabel] = useState(skill?.label || '');
  const [prompt, setPrompt] = useState(skill?.prompt || '');
  const [scope, setScope] = useState<'shared' | 'personal'>('personal');
  const isNew = !skill;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-2xl max-w-2xl w-full overflow-hidden"
      >
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-white font-semibold">{skill ? '编辑 Skill' : '新增 Skill'}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center"
          >
            ✕
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs text-white/50">名称</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="如：基础改写 / 家长视角改写 / 短视频脚本"
              className="w-full mt-1 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
            />
          </div>
          {cloudEnabled && isNew && (
            <div>
              <label className="text-xs text-white/50">保存位置</label>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => setScope('personal')}
                  className={`px-3 py-1.5 rounded-lg text-xs ${
                    scope === 'personal'
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  我的（私人）
                </button>
                <button
                  onClick={() => setScope('shared')}
                  className={`px-3 py-1.5 rounded-lg text-xs ${
                    scope === 'shared'
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                  title="共享库需要管理员口令才生效"
                >
                  共享库（团队）
                </button>
              </div>
              <p className="text-[10px] text-white/40 mt-1">
                共享库对所有人可见；写入需要管理员口令（在「模型配置」里设置）
              </p>
            </div>
          )}
          <div>
            <label className="text-xs text-white/50">提示词（系统提示词，会拼到任务前）</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={10}
              placeholder="请对以下小红书笔记进行二创改写..."
              className="w-full mt-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white font-mono resize-none"
            />
          </div>
        </div>
        <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-sm"
          >
            取消
          </button>
          <button
            onClick={() => {
              if (!label.trim() || !prompt.trim()) {
                window.alert('名称和提示词不能为空');
                return;
              }
              onSave({ label: label.trim(), prompt: prompt.trim(), scope });
            }}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium hover:opacity-90"
          >
            保存
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Reprocess;

