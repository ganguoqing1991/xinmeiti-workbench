// 二创加工 · 创作工作台（参考内容生产工作台版式重构）
// 流程：标题 → 提纲 → 分页 → 配图 → 成绩 五阶段，左侧原稿展示 + 右侧手机实时预览
// 数据全部存任务扩展字段 studio（localStorage），旧任务没有该字段也能正常打开

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Type,
  ListTree,
  Layers,
  Image as ImageIcon,
  BarChart3,
  Wand2,
  RefreshCw,
  UploadCloud,
  Trash2,
  Crown,
  Loader2,
  Copy,
  Download,
  CheckCircle2,
  AlertCircle,
  Bot,
  FileText,
  Heart,
  Star,
  MessageCircle,
  Share2,
  ChevronDown,
  ChevronUp,
  Plus,
  ExternalLink,
  Mic,
} from 'lucide-react';
import GlassCard from '../../components/GlassCard';
import type { LLMConfig } from '../../utils/llmConfig';
import { callImageGen, getImageGenConfig, setImageGenConfig } from '../../utils/llmConfig';
import { callLLMOnce } from '../../utils/llmCall';
import {
  updateReprocessTask,
  type ReprocessTask,
  type ReprocessStudio,
  type TaskImage,
} from '../../utils/reprocessQueue';
import { formatTime } from '../../utils/format';

// ===== 阶段定义 =====
// 小红书走图文五阶段（标题→提纲→分页→配图→成绩）；
// 抖音只做「出稿」，不碰配图与成绩：标题 → 二创口播稿。
const STAGES_XHS = [
  { key: 'title', label: '标题', icon: Type, desc: '选定发布标题' },
  { key: 'outline', label: '提纲', icon: ListTree, desc: '列出内容要点' },
  { key: 'sections', label: '分页', icon: Layers, desc: '逐页撰写正文' },
  { key: 'images', label: '配图', icon: ImageIcon, desc: 'AI 生成 / 上传图片' },
  { key: 'metrics', label: '成绩', icon: BarChart3, desc: '发布后数据回填' },
] as const;

const STAGES_DY = [
  { key: 'title', label: '标题', icon: Type, desc: 'AI 出 3 个方案' },
  { key: 'script', label: '二创口播稿', icon: Mic, desc: 'AI 出 3 个方案' },
] as const;

const EMPTY_STUDIO: ReprocessStudio = {
  stage: 0,
  titleOptions: [],
  scriptOptions: [],
  outline: [],
  sections: [],
  images: [],
};

// ===== 工具：从批量生成的结果解析标题/正文/标签 =====
export function parseRecreateResult(result: string): {
  titles: string[];
  body: string;
  tags: string[];
} {
  const titleM = result.match(/【新标题】\s*([\s\S]*?)(?=\n【新正文】|$)/);
  const bodyM = result.match(/【新正文】\s*([\s\S]*?)(?=\n【标签】|$)/);
  const tagM = result.match(/【标签】\s*([\s\S]*)$/);
  const titles = (titleM?.[1] || '')
    .split('\n')
    .map((s) => s.trim().replace(/^[0-9]+[.、]\s*/, ''))
    .filter(Boolean)
    .slice(0, 3);
  const body = (bodyM?.[1] || '').trim();
  const tagRaw = (tagM?.[1] || '').trim();
  const tags = tagRaw.match(/#[^\s#，。、]+/g) || tagRaw.split(/[，,、\s]+/).filter(Boolean);
  return { titles, body, tags };
}

// ===== 工具：上传图片压缩（控制 localStorage 体积）=====
async function compressImageFile(file: File, maxEdge = 1080, quality = 0.82): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('读取文件失败'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('图片解析失败'));
    im.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ============================================================
// 创作工作台主面板
// ============================================================
export const StudioPanel: React.FC<{
  task: ReprocessTask | null;
  effectiveLLM: LLMConfig;
  skillPrompt: string; // 当前选中 Skill 的系统提示词（创作依据）
  skillLabel: string;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
  onExtract: () => void;
  /** Skill 管理面板（含启用开关/上传/新增编辑删除），由父组件传入，点「管理（含启用）」时展开 */
  skillsSlot?: React.ReactNode;
}> = ({ task, effectiveLLM, skillPrompt, skillLabel, showToast, onExtract, skillsSlot }) => {
  const [studio, setStudio] = useState<ReprocessStudio>(() => ({ ...EMPTY_STUDIO, ...(task?.studio || {}) }));
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [aiProgress, setAiProgress] = useState('');
  // 创作依据区
  const [showSkills, setShowSkills] = useState(false);
  // 配图
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgPromptTouched, setImgPromptTouched] = useState(false);
  const uploadTargetRef = useRef<{ mode: 'add' | 'replace'; imageId?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 切换任务时重置工作台
  useEffect(() => {
    setStudio({ ...EMPTY_STUDIO, ...(task?.studio || {}) });
    setImgPromptTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // 生图提示词：默认按当前标题/提纲/正文自动拼一份，用户改过就不再覆盖
  const autoPrompt = useMemo(() => {
    const title = studio.chosenTitle || task?.title || '';
    const outline = studio.outline.slice(0, 2).join('；');
    const sec = (studio.sections[0] || task?.content || '').slice(0, 40);
    return `${title}${outline ? `，${outline}` : ''}${sec ? `，${sec}` : ''}。明亮简洁的小红书风格配图，画面干净，无文字水印`;
  }, [studio.chosenTitle, studio.outline, studio.sections, task?.title, task?.content]);
  useEffect(() => {
    if (!imgPromptTouched) setImgPrompt(autoPrompt);
  }, [autoPrompt, imgPromptTouched]);

  // 生图配置（sameAsLLM / 模型名 / 尺寸就地编辑，Key 与 BaseURL 在 API 配置页）
  const [imgCfg, setImgCfg] = useState(() => getImageGenConfig());
  useEffect(() => {
    const next: ReprocessStudio = { ...studio };
    let dirty = false;
    if (imgCfg.sameAsLLM !== next.imageSameAsLLM) {
      next.imageSameAsLLM = imgCfg.sameAsLLM;
      dirty = true;
    }
    if (dirty) setStudio(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgCfg.sameAsLLM]);

  const patchStudio = (patch: Partial<ReprocessStudio>) => {
    if (!task) return;
    const next = { ...studio, ...patch };
    setStudio(next);
    updateReprocessTask(task.id, { studio: next });
  };

  if (!task) {
    return (
      <GlassCard hoverable={false}>
        <div className="py-16 text-center">
          <Sparkles className="w-12 h-12 text-white/20 mx-auto mb-3" />
          <p className="text-base text-white/50">从左侧任务栏选择一个任务开始创作</p>
          <p className="text-xs text-white/30 mt-1.5">
            小红书：标题 → 提纲 → 分页 → 配图 → 成绩 · 抖音：标题 → 二创口播稿
          </p>
        </div>
      </GlassCard>
    );
  }

  const isDouyin = task.platform === 'douyin';
  const stages = isDouyin ? STAGES_DY : STAGES_XHS;
  const stage = Math.min(Math.max(studio.stage || 0, 0), stages.length - 1);
  const content = task.content || '';

  // ===== AI 动作 =====
  const runAI = async (key: string, fn: () => Promise<void>) => {
    if (!effectiveLLM.apiKey) {
      showToast('error', '请先配置文案模型 API（右上角「API 配置」）');
      return;
    }
    setAiBusy(key);
    try {
      await fn();
    } catch (e: any) {
      showToast('error', `${e?.message?.slice(0, 160) || '生成失败'}`);
    } finally {
      setAiBusy(null);
      setAiProgress('');
    }
  };

  const sysOf = (extra: string) =>
    [skillPrompt, extra].filter(Boolean).join('\n\n') ||
    '你是一位小红书/抖音爆款内容创作专家，输出简洁直接、不要多余解释。';

  // 1. 标题方案
  const genTitleOptions = () =>
    runAI('title', async () => {
      setAiProgress('正在生成标题方案...');
      const text = await callLLMOnce(
        effectiveLLM,
        [
          {
            role: 'system',
            content: sysOf(
              isDouyin
                ? '你只输出标题，不要解释。基于原稿产出 3 个风格不同的抖音标题（22 字内，口语化、有钩子、适合口播开头），每行一个、不加序号：第一个反差吸睛、第二个干货价值、第三个情绪共鸣。'
                : '你只输出标题，不要解释。基于原稿产出 3 个风格不同的备选标题（小红书 18 字内），每行一个、不加序号：第一个吸睛反差、第二个干货价值、第三个情绪共鸣。'
            ),
          },
          {
            role: 'user',
            content: `【原稿标题】${task.title}\n【原稿内容】\n${content.slice(0, 2000) || '（无正文，仅按标题发挥）'}`,
          },
        ],
        setAiProgress
      );
      const titles = text
        .split('\n')
        .map((s) => s.trim().replace(/^[0-9]+[.、]\s*/, '').replace(/^["「『]|["」』]$/g, ''))
        .filter(Boolean)
        .slice(0, 3);
      if (titles.length) patchStudio({ titleOptions: titles });
      showToast('success', `已生成 ${titles.length} 个标题方案`);
    });

  // 2（抖音）. 二创口播稿：一次出 3 个方案，方案之间用 === 分隔
  const genScriptOptions = () =>
    runAI('script', async () => {
      setAiProgress('正在生成口播稿方案...');
      const text = await callLLMOnce(
        effectiveLLM,
        [
          {
            role: 'system',
            content: sysOf(
              '你是抖音口播稿写手。基于标题与原稿，产出 3 个不同风格的二创口播稿方案，每个方案包含：\n' +
                '① Hook（前 3 秒，必须抓眼球）\n' +
                '② 痛点/冲突（5-10 秒）\n' +
                '③ 方法/干货（15-30 秒）\n' +
                '④ 行动号召（最后 5 秒）\n' +
                '要求：口语化、短句、能直接照着念；每篇 150-260 字；方案之间用单独一行 === 分隔；不要写序号、标题和任何解释。'
            ),
          },
          {
            role: 'user',
            content: `【标题】${studio.chosenTitle || task.title}\n【原稿】\n${content.slice(0, 2500)}`,
          },
        ],
        setAiProgress
      );
      const scripts = text
        .split(/^={3,}$/m)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3);
      if (scripts.length) patchStudio({ scriptOptions: scripts });
      showToast('success', `已生成 ${scripts.length} 个口播稿方案`);
    });

  // 2. 提纲（小红书）
  const genOutline = () =>
    runAI('outline', async () => {
      setAiProgress('正在生成提纲...');
      const text = await callLLMOnce(
        effectiveLLM,
        [
          {
            role: 'system',
            content: sysOf(
              '基于标题与原稿列内容提纲：输出 3-6 条要点，每行一条、不加序号，每条不超过 25 字，覆盖钩子/价值点/行动号召。'
            ),
          },
          {
            role: 'user',
            content: `【标题】${studio.chosenTitle || task.title}\n【原稿】\n${content.slice(0, 2000)}`,
          },
        ],
        setAiProgress
      );
      const outline = text.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6);
      if (outline.length) patchStudio({ outline });
      showToast('success', `已生成 ${outline.length} 条提纲要点`);
    });

  // 3. 分页正文
  const genSections = () =>
    runAI('sections', async () => {
      setAiProgress('正在按提纲分页撰写正文...');
      const text = await callLLMOnce(
        effectiveLLM,
        [
          {
            role: 'system',
            content: sysOf(
              '把内容改写成适合图文分页的正文：输出 3-6 页，每页一段（40-120 字），口语化有节奏。页与页之间用单独一行 --- 分隔，不要页码、不要其他解释。'
            ),
          },
          {
            role: 'user',
            content: `【标题】${studio.chosenTitle || task.title}\n【提纲】\n${studio.outline.join('\n') || '（无，按原稿安排）'}\n【原稿】\n${content.slice(0, 2500)}`,
          },
        ],
        setAiProgress
      );
      const sections = text
        .split(/^---+$/m)
        .map((s) => s.trim())
        .filter(Boolean);
      if (sections.length) patchStudio({ sections });
      showToast('success', `已分 ${sections.length} 页`);
    });

  // 4. 配图提示词（AI 拟写）
  const genImagePrompt = () =>
    runAI('imgPrompt', async () => {
      setAiProgress('正在拟写配图提示词...');
      const text = await callLLMOnce(
        effectiveLLM,
        [
          {
            role: 'system',
            content:
              '你是绘图提示词专家。为图文笔记拟 1 条中文生图提示词（40 字内）：描述画面主体、构图、风格、配色，适合做小红书封面，画面中不要出现文字。只输出提示词本身。',
          },
          {
            role: 'user',
            content: `【标题】${studio.chosenTitle || task.title}\n【提纲】\n${studio.outline.join('\n')}`,
          },
        ],
        setAiProgress
      );
      const p = text.trim().split('\n')[0]?.slice(0, 120) || '';
      if (p) {
        setImgPrompt(p);
        setImgPromptTouched(true);
        showToast('success', '配图提示词已更新，可直接生成或再修改');
      }
    });

  // 4. 生成图片（可一次多张）
  const genImages = async (count: number) =>
    runAI(`genImg-${count}`, async () => {
      const prompt = imgPrompt.trim();
      if (!prompt) {
        showToast('error', '请先填写配图提示词');
        return;
      }
      const imgs: TaskImage[] = [];
      for (let i = 0; i < count; i++) {
        setAiProgress(`正在生成第 ${i + 1}/${count} 张图片...`);
        const url = await callImageGen(effectiveLLM, imgCfg, prompt, setAiProgress);
        imgs.push({
          id: uid('img'),
          url,
          prompt,
          source: 'ai',
          isCover: studio.images.length === 0 && i === 0,
          createdAt: new Date().toISOString(),
        });
      }
      patchStudio({ images: [...studio.images, ...imgs] });
      showToast('success', `已生成 ${count} 张配图`);
    });

  // 4. 重新生成单张（沿用该图提示词）
  const regenImage = (img: TaskImage) =>
    runAI('regen', async () => {
      setAiProgress('正在重新生成这张图...');
      const url = await callImageGen(effectiveLLM, imgCfg, img.prompt, setAiProgress);
      patchStudio({
        images: studio.images.map((it) => (it.id === img.id ? { ...it, url, createdAt: new Date().toISOString() } : it)),
      });
      showToast('success', '已重新生成');
    });

  // 4. 上传图片（新增或替换某一张）
  const handleUploadFile = async (file: File | undefined | null) => {
    const target = uploadTargetRef.current;
    if (!file) return;
    if (!target) return;
    try {
      const dataUrl = await compressImageFile(file);
      if (target.mode === 'replace' && target.imageId) {
        patchStudio({
          images: studio.images.map((it) =>
            it.id === target.imageId ? { ...it, url: dataUrl, source: 'upload', createdAt: new Date().toISOString() } : it
          ),
        });
        showToast('success', '已替换图片');
      } else {
        patchStudio({
          images: [
            ...studio.images,
            { id: uid('img'), url: dataUrl, prompt: '', source: 'upload', isCover: studio.images.length === 0, createdAt: new Date().toISOString() },
          ],
        });
        showToast('success', '已添加上传图片');
      }
    } catch (e: any) {
      showToast('error', e?.message || '图片处理失败');
    } finally {
      uploadTargetRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 5. 成绩
  const metrics = studio.metrics || {};

  // 导入批量生成结果（一键把【新标题】等填进各阶段）
  const importFromResult = () => {
    const result = task.result || '';
    if (!result.trim()) {
      showToast('error', '当前任务还没有生成结果，先在下方加入批量队列生成一次');
      return;
    }
    const { titles, body } = parseRecreateResult(result);
    if (isDouyin) {
      // 抖音只要标题 + 整篇口播稿
      patchStudio({
        titleOptions: titles.length ? titles : studio.titleOptions,
        chosenTitle: titles[0] || studio.chosenTitle,
        scriptOptions: body ? [body, ...studio.scriptOptions.filter((s) => s !== body)] : studio.scriptOptions,
        chosenScript: body || studio.chosenScript,
        stage: 0,
      });
      showToast('success', '已导入生成结果：标题方案 + 口播稿（可继续改）');
      return;
    }
    const sections = body
      ? body.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
      : [];
    patchStudio({
      titleOptions: titles.length ? titles : studio.titleOptions,
      chosenTitle: titles[0] || studio.chosenTitle,
      outline: studio.outline.length ? studio.outline : sections.map((s) => s.slice(0, 25)),
      sections: sections.length ? sections : studio.sections,
      stage: 0,
    });
    showToast('success', '已导入生成结果：标题方案 + 分页正文（可在各步骤继续修改）');
  };

  // ===== 渲染 =====
  const busyIcon = (key: string) =>
    aiBusy === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />;

  return (
    <div className="space-y-5">
      {/* 原稿展示位（小红书/抖音通用：来源笔记原文） */}
      <GlassCard hoverable={false}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-400" />
            原稿 · {task.platform === 'xiaohongshu' ? '小红书' : '抖音'}
            <span className="text-[10px] text-white/40 font-normal">（创作依据的原始素材，不参与发布）</span>
          </h3>
          <div className="flex items-center gap-2">
            {(task.audioUrl || task.videoUrl) && (
              <button
                onClick={onExtract}
                className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 flex items-center gap-1"
              >
                <Mic className="w-3.5 h-3.5" />
                {task.transcripted ? '重新提取文案' : '提取口播文案'}
              </button>
            )}
            <button
              onClick={importFromResult}
              className="text-xs px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-200 hover:bg-purple-500/25 flex items-center gap-1"
              title="把批量生成的结果一键填进下方各阶段"
            >
              <Download className="w-3.5 h-3.5" /> 导入生成结果
            </button>
          </div>
        </div>
        <div className="flex gap-4">
          {task.coverUrl && (
            <img
              src={task.coverUrl}
              alt={task.title}
              className="w-20 h-20 rounded-xl object-cover shrink-0"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium leading-snug">{task.title}</p>
            <p className="text-xs text-white/40 mt-1">
              {task.accountName} · {formatTime(task.addedAt)}
            </p>
            <div className="mt-2 p-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 max-h-28 overflow-y-auto scrollbar-thin whitespace-pre-wrap leading-relaxed">
              {content || '（暂无原文内容 —— 可点「提取口播文案」或去内容展示池重新添加）'}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* 创作依据（模式 + Skill + 模型一致性） */}
      <GlassCard hoverable={false}>
        <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4 text-purple-400" /> 创作依据
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 使用 Skill */}
          <div className="p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-white/60">使用 Skill（创作依据提示词）</span>
              <button
                onClick={() => setShowSkills((v) => !v)}
                className="text-[11px] text-purple-300 hover:text-purple-200 flex items-center gap-0.5"
              >
                {showSkills ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                管理（含启用）
              </button>
            </div>
            <p className="text-sm text-white font-medium">
              {skillLabel || '默认系统提示词'}
            </p>
            <p className="text-[11px] text-white/40 mt-1">
              批量生成与下方各步骤的 AI 动作都会参考此 Skill；是否启用在「管理」列表里勾选。
            </p>
          </div>
          {/* 抖音：文案模型（不出图，只需文案模型） */}
          {isDouyin && (
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-white/60">文案模型</span>
                <Link
                  to="/api"
                  className="text-[11px] text-purple-300 hover:text-purple-200 flex items-center gap-0.5"
                >
                  去配置 <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <p className="text-sm text-white font-medium">{effectiveLLM.modelName || '未配置模型'}</p>
              <p className="text-[11px] text-white/40 mt-1">
                标题与二创口播稿都用这个模型生成；抖音走纯文案流程，不生成图片。
              </p>
            </div>
          )}

          {/* 生图模型（仅小红书需要配图） */}
          <div className={`p-3 rounded-lg bg-white/5 border border-white/10 ${isDouyin ? 'hidden' : ''}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-white/60">生图模型</span>
              <Link
                to="/api"
                className="text-[11px] text-purple-300 hover:text-purple-200 flex items-center gap-0.5"
                title="在 API 配置页填写独立 Key / Base URL"
              >
                独立 Key 去配置 <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
            <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={imgCfg.sameAsLLM}
                onChange={(e) => {
                  const next = { ...imgCfg, sameAsLLM: e.target.checked };
                  setImgCfg(next);
                  setImageGenConfig(next);
                  showToast('success', e.target.checked ? '生图将跟随文案模型的 Key' : '生图改用独立 Key（去 API 配置页填写）');
                }}
                className="w-3.5 h-3.5 accent-purple-500"
              />
              与文案模型共用 Key / 接口
            </label>
            {!imgCfg.sameAsLLM && (
              <p className="text-[11px] text-amber-300/80 mb-1.5">
                独立模式：生图会使用 API 配置页「生图模型」里单独填写的 Key 和接口地址。
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <input
                value={imgCfg.modelName}
                onChange={(e) => {
                  const next = { ...imgCfg, modelName: e.target.value };
                  setImgCfg(next);
                  setImageGenConfig(next);
                }}
                placeholder="生图模型名"
                className="flex-1 min-w-0 h-7 px-2 rounded bg-white/5 border border-white/10 text-xs text-white"
              />
              <select
                value={imgCfg.size}
                onChange={(e) => {
                  const next = { ...imgCfg, size: e.target.value };
                  setImgCfg(next);
                  setImageGenConfig(next);
                }}
                className="h-7 px-1.5 rounded bg-white/5 border border-white/10 text-xs text-white"
                style={{ colorScheme: 'dark' }}
                title="出图尺寸"
              >
                <option value="864x1152">3:4 竖版</option>
                <option value="1024x1024">1:1 方形</option>
                <option value="1152x864">4:3 横版</option>
                <option value="720x1280">9:16 竖屏</option>
              </select>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Skill 管理插槽：父组件传入的完整 SkillPanel（含启用开关/上传/新增/编辑/删除） */}
      {showSkills && skillsSlot}

      {/* 五阶段步骤条 */}
      <GlassCard hoverable={false}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" /> 创作流程
          </h3>
          <p className="text-[11px] text-white/35">每一步都可单独 AI 生成，也可手动修改，随时切步骤</p>
        </div>
        <div className={`grid gap-1.5 mb-5 ${isDouyin ? 'grid-cols-2' : 'grid-cols-5'}`}>
          {stages.map((s, i) => {
            const Icon = s.icon;
            const active = i === stage;
            const done =
              (s.key === 'title' && (studio.chosenTitle || studio.titleOptions.length > 0)) ||
              (s.key === 'outline' && studio.outline.length > 0) ||
              (s.key === 'sections' && studio.sections.length > 0) ||
              (s.key === 'images' && studio.images.length > 0) ||
              (s.key === 'metrics' && !!(studio.metrics?.likes || studio.metrics?.publishUrl)) ||
              (s.key === 'script' && (studio.chosenScript || studio.scriptOptions.length > 0));
            return (
              <button
                key={s.key}
                onClick={() => patchStudio({ stage: i })}
                className={`relative flex flex-col items-center gap-1 py-2.5 rounded-lg border text-xs transition-all ${
                  active
                    ? 'bg-purple-500/20 border-purple-400/50 text-white'
                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-purple-300' : 'text-white/40'}`} />
                <span className={active ? 'text-white font-medium' : ''}>{s.label}</span>
                <span className="text-[10px] text-white/30 hidden xl:block">{s.desc}</span>
                {done && !active && (
                  <CheckCircle2 className="absolute top-1 right-1 w-3 h-3 text-emerald-400" />
                )}
                {active && (
                  <span className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-[#1a1a2e] border-r border-b border-purple-400/50" />
                )}
              </button>
            );
          })}
        </div>

        {/* AI 进度条 */}
        {aiBusy && (
          <p className="mb-3 text-xs text-purple-200 flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {aiProgress || '处理中...'}
          </p>
        )}

        {/* ===== 步骤 1：标题 ===== */}
        {stage === 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-white/50">选定发布标题（AI 生成方案或手动输入，点击单选即选定）</p>
              <button
                onClick={genTitleOptions}
                disabled={!!aiBusy}
                className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
              >
                {busyIcon('title')} AI 生成 3 个方案
              </button>
            </div>
            {studio.titleOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-white/35 rounded-lg border border-dashed border-white/10">
                还没有标题方案 —— 点上方按钮生成，或在下方手动添加
              </div>
            ) : (
              <div className="space-y-2">
                {studio.titleOptions.map((t, i) => {
                  const chosen = studio.chosenTitle === t;
                  return (
                    <div
                      key={i}
                      onClick={() => patchStudio({ chosenTitle: t })}
                      className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-2 ${
                        chosen ? 'bg-purple-500/15 border-purple-500/40' : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                          chosen ? 'border-purple-400' : 'border-white/25'
                        }`}
                      >
                        {chosen && <span className="w-2 h-2 rounded-full bg-purple-400" />}
                      </span>
                      <span className="flex-1 text-sm text-white leading-snug">{t}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard?.writeText(t);
                          showToast('success', '标题已复制');
                        }}
                        className="text-white/40 hover:text-white"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          patchStudio({ titleOptions: studio.titleOptions.filter((_, j) => j !== i), chosenTitle: chosen ? undefined : studio.chosenTitle });
                        }}
                        className="text-rose-300/60 hover:text-rose-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <ManualAddRow
              placeholder="手动添加标题方案，回车确认"
              onAdd={(v) => patchStudio({ titleOptions: [...studio.titleOptions, v] })}
            />
          </div>
        )}

        {/* ===== 步骤 2（抖音）：二创口播稿 ===== */}
        {isDouyin && stage === 1 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-white/50">
                二创口播稿：AI 一次出 3 个方案，选一个直接用（可再改）
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => patchStudio({ scriptOptions: [...studio.scriptOptions, ''] })}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> 手动加一版
                </button>
                <button
                  onClick={genScriptOptions}
                  disabled={!!aiBusy}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {busyIcon('script')} AI 生成 3 个方案
                </button>
              </div>
            </div>
            {studio.scriptOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-white/35 rounded-lg border border-dashed border-white/10">
                还没有口播稿 —— 点上方按钮一次生成 3 个方案
              </div>
            ) : (
              <div className="space-y-2.5">
                {studio.scriptOptions.map((sc, i) => {
                  const chosen = studio.chosenScript === sc;
                  const seconds = Math.max(1, Math.round((sc.length || 0) / 4.5));
                  return (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border transition-all ${
                        chosen ? 'bg-purple-500/15 border-purple-500/40' : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            onClick={() => patchStudio({ chosenScript: sc })}
                            className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center cursor-pointer ${
                              chosen ? 'border-purple-400' : 'border-white/25'
                            }`}
                          >
                            {chosen && <span className="w-2 h-2 rounded-full bg-purple-400" />}
                          </span>
                          <span className="text-xs text-white font-medium">方案 {i + 1}</span>
                          <span className="text-[10px] text-white/35">
                            {sc.length} 字 · 约 {seconds} 秒
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              navigator.clipboard?.writeText(sc);
                              showToast('success', '口播稿已复制');
                            }}
                            className="text-white/40 hover:text-white"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              patchStudio({
                                scriptOptions: studio.scriptOptions.filter((_, j) => j !== i),
                                chosenScript: chosen ? undefined : studio.chosenScript,
                              })
                            }
                            className="text-rose-300/60 hover:text-rose-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={sc}
                        onChange={(e) =>
                          patchStudio({ scriptOptions: studio.scriptOptions.map((x, j) => (j === i ? e.target.value : x)) })
                        }
                        rows={5}
                        placeholder="这一版口播稿：Hook / 痛点 / 方法 / 行动号召..."
                        className="w-full px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white leading-relaxed resize-none"
                      />
                      {chosen && (
                        <p className="text-[10px] text-purple-200 mt-1">✓ 已选为最终口播稿</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== 步骤 2：提纲（小红书） ===== */}
        {!isDouyin && stage === 1 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-white/50">内容提纲（每条一个要点，按顺序组织钩子 → 价值 → 行动号召）</p>
              <button
                onClick={genOutline}
                disabled={!!aiBusy}
                className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
              >
                {busyIcon('outline')} AI 生成提纲
              </button>
            </div>
            {studio.outline.length === 0 ? (
              <div className="py-6 text-center text-sm text-white/35 rounded-lg border border-dashed border-white/10">
                还没有提纲要点 —— 点上方按钮生成，或在下方逐条添加
              </div>
            ) : (
              <div className="space-y-2">
                {studio.outline.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 h-6 shrink-0 rounded-full bg-purple-500/20 text-purple-200 text-[11px] flex items-center justify-center">
                      {i + 1}
                    </span>
                    <input
                      value={o}
                      onChange={(e) =>
                        patchStudio({ outline: studio.outline.map((x, j) => (j === i ? e.target.value : x)) })
                      }
                      className="flex-1 h-8 px-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
                    />
                    <button
                      onClick={() => patchStudio({ outline: studio.outline.filter((_, j) => j !== i) })}
                      className="text-rose-300/60 hover:text-rose-300 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <ManualAddRow
              placeholder="手动添加提纲要点，回车确认"
              onAdd={(v) => patchStudio({ outline: [...studio.outline, v] })}
            />
          </div>
        )}

        {/* ===== 步骤 3：分页（小红书） ===== */}
        {!isDouyin && stage === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-white/50">分页正文（每页即一张图文卡片，可直接编辑）</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => patchStudio({ sections: [...studio.sections, ''] })}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> 加一页
                </button>
                <button
                  onClick={genSections}
                  disabled={!!aiBusy}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {busyIcon('sections')} AI 按提纲分页
                </button>
              </div>
            </div>
            {studio.sections.length === 0 ? (
              <div className="py-6 text-center text-sm text-white/35 rounded-lg border border-dashed border-white/10">
                还没有分页内容 —— AI 按提纲分页，或点「加一页」手动写
              </div>
            ) : (
              <div className="space-y-2.5">
                {studio.sections.map((s, i) => (
                  <div key={i} className="p-3 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200">
                        第 {i + 1} 页
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/30">{s.length} 字</span>
                        <button
                          onClick={() => patchStudio({ sections: studio.sections.filter((_, j) => j !== i) })}
                          className="text-rose-300/60 hover:text-rose-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={s}
                      onChange={(e) =>
                        patchStudio({ sections: studio.sections.map((x, j) => (j === i ? e.target.value : x)) })
                      }
                      rows={3}
                      placeholder="这一页的文案..."
                      className="w-full px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white leading-relaxed resize-none"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== 步骤 4：配图（小红书） ===== */}
        {!isDouyin && stage === 3 && (
          <div className="space-y-3">
            <p className="text-xs text-white/50">
              配图：AI 生成或上传替换，每张都可单独重新生成 / 编辑提示词 / 设为封面
            </p>
            {/* 提示词 + 生成 */}
            <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/60">生图提示词（可让 AI 拟写后自行修改）</span>
                <button
                  onClick={genImagePrompt}
                  disabled={!!aiBusy}
                  className="text-[11px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 flex items-center gap-1 disabled:opacity-50"
                >
                  {busyIcon('imgPrompt')} AI 拟写
                </button>
              </div>
              <textarea
                value={imgPrompt}
                onChange={(e) => {
                  setImgPrompt(e.target.value);
                  setImgPromptTouched(true);
                }}
                rows={2}
                className="w-full px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white leading-relaxed resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => genImages(1)}
                  disabled={!!aiBusy}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {busyIcon('genImg-1')} 生成 1 张
                </button>
                <button
                  onClick={() => genImages(3)}
                  disabled={!!aiBusy}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {busyIcon('genImg-3')} 生成 3 张
                </button>
                <button
                  onClick={() => {
                    uploadTargetRef.current = { mode: 'add' };
                    fileInputRef.current?.click();
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 flex items-center gap-1.5"
                >
                  <UploadCloud className="w-3.5 h-3.5" /> 上传图片
                </button>
                <span className="text-[10px] text-white/30 ml-auto">
                  {imgCfg.size} · {imgCfg.sameAsLLM ? '跟随文案模型 Key' : '独立生图 Key'}
                </span>
              </div>
            </div>

            {/* 图片网格 */}
            {studio.images.length === 0 ? (
              <div className="py-8 text-center text-sm text-white/35 rounded-lg border border-dashed border-white/10">
                还没有配图 —— 填好提示词点「生成」，或直接上传已有图片
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {studio.images.map((img, idx) => (
                  <div key={img.id} className="rounded-xl overflow-hidden border border-white/10 bg-white/5 group">
                    <div className="relative">
                      <img
                        src={img.url}
                        alt={`配图 ${idx + 1}`}
                        className="w-full aspect-[3/4] object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                      {img.isCover && (
                        <span className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded bg-rose-500/90 text-white flex items-center gap-0.5">
                          <Crown className="w-3 h-3" /> 封面
                        </span>
                      )}
                      <span className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white/80">
                        {img.source === 'ai' ? 'AI' : '上传'}
                      </span>
                    </div>
                    <div className="p-2 grid grid-cols-2 gap-1">
                      <button
                        onClick={() => regenImage(img)}
                        disabled={!!aiBusy}
                        title="按这张图的提示词重新生成"
                        className="text-[10px] px-1.5 py-1 rounded bg-white/5 text-white/70 hover:bg-white/10 flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        {aiBusy === 'regen' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        重新生成
                      </button>
                      <button
                        onClick={() => {
                          uploadTargetRef.current = { mode: 'replace', imageId: img.id };
                          fileInputRef.current?.click();
                        }}
                        title="上传图片替换这一张"
                        className="text-[10px] px-1.5 py-1 rounded bg-white/5 text-white/70 hover:bg-white/10 flex items-center justify-center gap-1"
                      >
                        <UploadCloud className="w-3 h-3" /> 上传替换
                      </button>
                      <button
                        onClick={() => {
                          const next = window.prompt('修改这张图的生图提示词（重新生成时生效）：', img.prompt || imgPrompt);
                          if (next !== null) {
                            patchStudio({ images: studio.images.map((it) => (it.id === img.id ? { ...it, prompt: next } : it)) });
                          }
                        }}
                        title="单独编辑这张图的提示词"
                        className="text-[10px] px-1.5 py-1 rounded bg-white/5 text-white/70 hover:bg-white/10 flex items-center justify-center gap-1"
                      >
                        <Wand2 className="w-3 h-3" /> 改提示词
                      </button>
                      <button
                        onClick={() => patchStudio({ images: studio.images.map((it) => ({ ...it, isCover: it.id === img.id })) })}
                        title="设为封面（预览与发布用）"
                        className={`text-[10px] px-1.5 py-1 rounded flex items-center justify-center gap-1 ${
                          img.isCover ? 'bg-rose-500/20 text-rose-200' : 'bg-white/5 text-white/70 hover:bg-white/10'
                        }`}
                      >
                        <Crown className="w-3 h-3" /> {img.isCover ? '已封面' : '设为封面'}
                      </button>
                      <button
                        onClick={() => {
                          patchStudio({ images: studio.images.filter((it) => it.id !== img.id) });
                          showToast('info', '已删除这张配图');
                        }}
                        className="col-span-2 text-[10px] px-1.5 py-1 rounded bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 flex items-center justify-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> 删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-white/30">
              AI 生成的图片以链接/缓存形式保存，厂商外链可能过期，重要图片建议上传替换为本地图；上传图会压缩到 1080px 以节省本地存储。
            </p>
          </div>
        )}

        {/* ===== 步骤 5：成绩（小红书） ===== */}
        {!isDouyin && stage === 4 && (
          <div className="space-y-3">
            <p className="text-xs text-white/50">发布后把数据填回来，后续复盘可以直接对比（手动记录，随时修改）</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              <MetricInput
                label="发布时间"
                type="datetime-local"
                value={(metrics.publishedAt || '').slice(0, 16)}
                onChange={(v) => patchStudio({ metrics: { ...metrics, publishedAt: v ? new Date(v).toISOString() : undefined } })}
              />
              <MetricInput
                label="点赞"
                type="number"
                value={metrics.likes}
                onChange={(v) => patchStudio({ metrics: { ...metrics, likes: v === '' ? undefined : Number(v) } })}
              />
              <MetricInput
                label="收藏"
                type="number"
                value={metrics.collects}
                onChange={(v) => patchStudio({ metrics: { ...metrics, collects: v === '' ? undefined : Number(v) } })}
              />
              <MetricInput
                label="评论"
                type="number"
                value={metrics.comments}
                onChange={(v) => patchStudio({ metrics: { ...metrics, comments: v === '' ? undefined : Number(v) } })}
              />
              <MetricInput
                label="分享"
                type="number"
                value={metrics.shares}
                onChange={(v) => patchStudio({ metrics: { ...metrics, shares: v === '' ? undefined : Number(v) } })}
              />
            </div>
            <div>
              <label className="text-xs text-white/50">发布链接</label>
              <input
                value={metrics.publishUrl || ''}
                onChange={(e) => patchStudio({ metrics: { ...metrics, publishUrl: e.target.value || undefined } })}
                placeholder="粘贴发布后的笔记链接"
                className="mt-1 w-full h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
              />
            </div>
            {(metrics.likes || metrics.collects || metrics.comments || metrics.shares) ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-200 flex-wrap">
                <span>❤️ 赞 {metrics.likes || 0}</span>
                <span>⭐ 藏 {metrics.collects || 0}</span>
                <span>💬 评 {metrics.comments || 0}</span>
                <span>🔁 享 {metrics.shares || 0}</span>
                <span className="text-white/40">
                  互动量 = {(metrics.likes || 0) + (metrics.collects || 0) + (metrics.comments || 0) + (metrics.shares || 0)}
                </span>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-xs text-white/40 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-white/30" />
                还没有录入成绩 —— 发布后填回来即可
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* 隐藏的图片上传 input（生成/替换共用） */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleUploadFile(e.target.files?.[0])}
      />
    </div>
  );
};

// ===== 小组件：手动添加一行 =====
const ManualAddRow: React.FC<{ placeholder: string; onAdd: (v: string) => void }> = ({ placeholder, onAdd }) => {
  const [v, setV] = useState('');
  return (
    <div className="flex items-center gap-2">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && v.trim()) {
            onAdd(v.trim());
            setV('');
          }
        }}
        placeholder={placeholder}
        className="flex-1 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/30"
      />
      <button
        onClick={() => {
          if (v.trim()) {
            onAdd(v.trim());
            setV('');
          }
        }}
        className="shrink-0 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 text-xs flex items-center gap-1"
      >
        <Plus className="w-3.5 h-3.5" /> 添加
      </button>
    </div>
  );
};

// ===== 小组件：成绩输入 =====
const MetricInput: React.FC<{
  label: string;
  type: string;
  value?: string | number;
  onChange: (v: string) => void;
}> = ({ label, type, value, onChange }) => (
  <div>
    <label className="text-xs text-white/50">{label}</label>
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
      style={{ colorScheme: 'dark' }}
    />
  </div>
);

// ============================================================
// 手机实时预览（右侧）：按平台渲染小红书 / 抖音样式
// ============================================================
export const PhonePreview: React.FC<{ task: ReprocessTask | null }> = ({ task }) => {
  const studio = useMemo<ReprocessStudio>(() => ({ ...EMPTY_STUDIO, ...(task?.studio || {}) }), [task]);
  if (!task) {
    return (
      <GlassCard hoverable={false}>
        <div className="py-16 text-center">
          <ImageIcon className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-sm text-white/40">选择任务后在这里实时预览</p>
        </div>
      </GlassCard>
    );
  }

  const title = studio.chosenTitle || task.title;
  const body = studio.sections.length ? studio.sections.join('\n') : task.content || '';
  const tags = parseRecreateResult(task.result || '').tags;
  const cover = studio.images.find((i) => i.isCover)?.url || studio.images[0]?.url || task.coverUrl || '';
  const imgCount = studio.images.length;
  const m = studio.metrics || {};
  const hasMetrics = !!(m.likes || m.collects || m.comments || m.shares);
  const isXhs = task.platform === 'xiaohongshu';

  return (
    <GlassCard hoverable={false}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-pink-400" />
          {isXhs ? '小红书' : '抖音'}实时预览
        </h3>
        <span className="text-[10px] text-white/35">改哪步变哪步</span>
      </div>
      {/* 手机壳 */}
      <div className="mx-auto w-full max-w-[300px] rounded-[2.2rem] border-[6px] border-black/70 bg-white overflow-hidden shadow-xl">
        {/* 状态栏 */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-1 text-[10px] font-medium text-black/80 bg-white">
          <span>9:41</span>
          <span className="tracking-tight">●●●</span>
        </div>

        {isXhs ? (
          <div className="bg-white">
            {/* 作者行 */}
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                {(task.accountName || '号')[0]}
              </div>
              <span className="text-[11px] font-medium text-black/85 truncate flex-1">{task.accountName || '账号名'}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-rose-400 text-rose-500">关注</span>
            </div>
            {/* 图片区 */}
            <div className="relative mx-3 rounded-lg overflow-hidden bg-slate-100">
              {cover ? (
                <img src={cover} alt="封面" className="w-full aspect-[3/4] object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full aspect-[3/4] flex flex-col items-center justify-center text-slate-300 gap-1">
                  <ImageIcon className="w-8 h-8" />
                  <span className="text-[10px]">去「配图」步生成或上传</span>
                </div>
              )}
              {imgCount > 0 && (
                <span className="absolute bottom-1.5 right-1.5 text-[10px] px-1.5 rounded-full bg-black/50 text-white">
                  1/{imgCount}
                </span>
              )}
            </div>
            {/* 文案区 */}
            <div className="px-3 pt-2.5 pb-3">
              <p className="text-[13px] font-semibold text-black/90 leading-snug line-clamp-2">{title}</p>
              <p className="text-[11px] text-black/60 leading-relaxed mt-1 line-clamp-[6] whitespace-pre-wrap">{body}</p>
              {tags.length > 0 && (
                <p className="text-[10px] text-blue-500 mt-1.5 line-clamp-2">{tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')}</p>
              )}
              <div className="text-[9px] text-black/30 mt-2">{formatTime(task.resultAt || task.addedAt)}·发布</div>
            </div>
            {/* 互动栏 */}
            <div className="flex items-center gap-4 px-3 py-2 border-t border-black/5 text-[10px] text-black/60">
              <span className="flex items-center gap-1">
                <Heart className={`w-3.5 h-3.5 ${m.likes ? 'text-rose-500 fill-rose-500' : ''}`} />
                {m.likes ?? '赞'}
              </span>
              <span className="flex items-center gap-1">
                <Star className={`w-3.5 h-3.5 ${m.collects ? 'text-amber-400 fill-amber-400' : ''}`} />
                {m.collects ?? '藏'}
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5" />
                {m.comments ?? '评'}
              </span>
              <span className="ml-auto flex items-center gap-1">
                <Share2 className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        ) : (
          /* 抖音壳：竖屏视频风 */
          <div className="relative bg-black">
            <div className="relative w-full aspect-[9/16] max-h-[460px] overflow-hidden">
              {cover ? (
                <img src={cover} alt="封面" className="absolute inset-0 w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-slate-800 to-black flex items-center justify-center text-slate-600 text-xs">
                  去「配图」步生成或上传
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
              {/* 右侧互动列 */}
              <div className="absolute right-2 bottom-16 flex flex-col items-center gap-3 text-white">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 border-2 border-white flex items-center justify-center text-[10px] font-bold">
                  {(task.accountName || '号')[0]}
                </div>
                <span className="flex flex-col items-center gap-0.5 text-[9px]">
                  <Heart className={`w-5 h-5 ${m.likes ? 'fill-rose-500 text-rose-500' : ''}`} />
                  {m.likes ?? '赞'}
                </span>
                <span className="flex flex-col items-center gap-0.5 text-[9px]">
                  <MessageCircle className="w-5 h-5" />
                  {m.comments ?? '评'}
                </span>
                <span className="flex flex-col items-center gap-0.5 text-[9px]">
                  <Star className={`w-5 h-5 ${m.collects ? 'fill-amber-400 text-amber-400' : ''}`} />
                  {m.collects ?? '藏'}
                </span>
                <Share2 className="w-5 h-5" />
              </div>
              {/* 左下文案 */}
              <div className="absolute left-3 right-12 bottom-3 text-white">
                <p className="text-[11px] font-medium">@{task.accountName || '账号名'}</p>
                <p className="text-[11px] leading-snug mt-1 line-clamp-3">
                  {title}
                  {body ? `\n${body}` : ''}
                </p>
                {tags.length > 0 && (
                  <p className="text-[10px] text-cyan-300 mt-1 truncate">
                    {tags.slice(0, 3).map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')}
                  </p>
                )}
              </div>
              {hasMetrics && (
                <span className="absolute top-2 left-2 text-[9px] px-1.5 py-0.5 rounded-full bg-white/15 text-white/90">
                  已录成绩
                </span>
              )}
            </div>
          </div>
        )}
      </div>
      {imgCount === 0 && (
        <p className="mt-3 text-[11px] text-white/40 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          还没有配图 —— 在创作流程「配图」步生成或上传后，这里会实时更新。
        </p>
      )}
    </GlassCard>
  );
};

// ============================================================
// 抖音右列：当前口播稿预览（纯文案，不做手机壳 / 不做配图）
// ============================================================
export const ScriptPreview: React.FC<{ task: ReprocessTask | null }> = ({ task }) => {
  const studio = useMemo<ReprocessStudio>(() => ({ ...EMPTY_STUDIO, ...(task?.studio || {}) }), [task]);
  if (!task) {
    return (
      <GlassCard hoverable={false}>
        <div className="py-12 text-center">
          <Mic className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-sm text-white/40">选择任务后在这里查看口播稿</p>
        </div>
      </GlassCard>
    );
  }
  const title = studio.chosenTitle || task.title;
  const script = studio.chosenScript || studio.scriptOptions[0] || '';
  const seconds = script ? Math.max(1, Math.round(script.length / 4.5)) : 0;

  return (
    <GlassCard hoverable={false}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <Mic className="w-4 h-4 text-cyan-400" /> 当前口播稿
        </h3>
        {script && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(`${title}\n\n${script}`);
            }}
            className="text-[11px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white/60 hover:text-white flex items-center gap-1"
          >
            <Copy className="w-3 h-3" /> 复制
          </button>
        )}
      </div>
      <p className="text-sm text-white font-medium leading-snug">{title}</p>
      {script ? (
        <>
          <div className="mt-2 p-3 rounded-lg bg-white/5 border border-white/10 text-xs text-white/70 max-h-72 overflow-y-auto scrollbar-thin whitespace-pre-wrap leading-relaxed">
            {script}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-white/45 flex-wrap">
            <span>{script.length} 字</span>
            <span>约 {seconds} 秒口播</span>
            <span>{studio.scriptOptions.length} 个方案</span>
          </div>
        </>
      ) : (
        <div className="mt-2 p-4 rounded-lg bg-white/5 border border-dashed border-white/10 text-xs text-white/40">
          还没有口播稿 —— 在中间「二创口播稿」步点「AI 生成 3 个方案」
        </div>
      )}
    </GlassCard>
  );
};

export default StudioPanel;
