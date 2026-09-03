// 二创加工 · 后台队列引擎（模块级单例）
// 与 React 组件生命周期解耦：点「批量开始」后，即使离开二创页 / 刷新页面也持续处理，
// 回来自动同步状态；每个任务完成时向通知中心推送「谁完成了什么」。
//
// 设计要点：
// - 顺序处理（一次一条），避免触发模型限流，符合「系统慢慢回复」的预期
// - 进度实时写回任务对象（localStorage），打开页面即见流式结果
// - 通过 subscribeEngine 让挂载中的页面 / 顶栏订阅刷新

import {
  getReprocessTasks,
  updateReprocessTask,
  type ReprocessTask,
} from './reprocessQueue';
import {
  getMyLLMConfig,
  getASRConfig,
  getSkills,
  getCurrentUserName,
  isUsingSharedApi,
} from './llmConfig';
import { callLLMStream } from './llmCall';
import { extractScriptViaLLM } from './llmConfig';
import { transcribeAudio } from './llmConfig';
import { addNotification } from './notificationStore';
import { archiveGeneration } from './reprocessHistory';

export type GenerationType = 'recreate' | 'analyze';

// ===== 系统提示词（二创 / 分析共用，mode 控制输出结构）=====
// 作为唯一来源，Reprocess 页也从这里 import，避免两份不一致
export const DEFAULT_SYS_PROMPTS: Record<GenerationType, string> = {
  recreate:
    '你是一位小红书/抖音爆款内容创作专家。请对用户提供的原文进行二创改写，保留核心观点但换一种表达风格。要求：\n1. 标题重新组织（小红书 18 字内、抖音 22 字内，吸睛有钩子）\n2. 正文分 3-5 段，每段 1-2 句，口语化、有节奏感\n3. 末尾加 3-5 个话题标签\n4. 输出格式：【新标题】\n\n【新正文】\n\n【标签】',
  analyze: `你是一位小红书/抖音爆款内容拆解专家。必须用以下结构对原文进行结构化分析，禁止凭印象作答，每一条结论都要带证据（原文摘录 + 位置）。

━━━━━━━━━━━━━━━━━━━━━━
【一、六维评分】（每项 0-10 分 + 理由 + 原文证据）
1. 结构分段：原文由几段/几节组成？每段承担什么功能（钩子/建立信任/举证/转化/收尾）？打分并说明分段的合理性
2. 爆点归因：文中哪一句/一段是真正的"高光时刻"？为什么这句能让人停手？摘录原文具体字句并解释触发机制
3. 情绪曲线：通读后情绪的起伏轨迹是什么（焦虑→好奇→释然→行动召唤）？标注每段对应的情绪峰值
4. 信息密度：每 100 字给读者多少"新认知/可执行步骤"？有没有废笔/口水话/重复表述？指出具体位置
5. 可迁移爆点：哪些元素（句式/结构/钩子）可以搬到其他选题继续用？列出 2-3 个具体可迁移的子结构
6. 合规风险：是否有夸大宣传/绝对化用词/医疗效果暗示/版权风险/平台违规词？如有，标注原文位置

━━━━━━━━━━━━━━━━━━━━━━
【二、骨（本质惊艳）】——挖到爆款的底层三问：

1. 底层开关：这条爆款激活了人的什么底层心理/身份/恐惧机制？
   - 它让人停手的原因是什么？让人对号入座的原因是什么？让人转发的冲动来自哪里？
   - 摘录原文中触发这些机制的 1-2 个关键句

2. 为何独此：为什么是「这个说法/这个时机」才火？
   - 反例证伪：如果换成另一种说法（比如用"焦虑型" vs "成长型"），还会火吗？为什么？
   - 这种独特性来自原文的哪个具体元素？

3. 可迁移原理：把这条爆款抽象成一句「跨赛道能用的底层框架」
   - 例如「你一直在犯错」框架、「我做了 X，结果 Y」框架、「圈外人告诉你真相」框架
   - 用一句话总结本质（不超过 30 字）

4. 公式从爆款段落归纳（禁止凭空造步骤）：
   - 步骤名必须沿用爆款段落的角色（如原文叫"建立信任"，不要换成"痛点"）
   - 爆款原文里没有的步骤，禁止当步骤名
   - 每步 d = 一句可迁移的操作手法（语气/结构/钩子方式 + 原文例证）

━━━━━━━━━━━━━━━━━━━━━━
【输出格式】（严格按这个排版）
# 六维评分
1. 结构分段：X/10 — [理由 + 原文摘录]
2. 爆点归因：X/10 — [理由 + 原文摘录]
3. 情绪曲线：X/10 — [理由 + 原文摘录]
4. 信息密度：X/10 — [理由 + 原文摘录]
5. 可迁移爆点：X/10 — [理由 + 原文摘录]
6. 合规风险：X/10 — [理由 + 原文摘录]

# 骨
## 底层开关
- 停手：[原文摘录] → [机制]
- 对号：[原文摘录] → [机制]
- 转发：[原文摘录] → [机制]

## 为何独此
[反例证伪 + 独特性来源]

## 可迁移原理
[一句话底层框架，不超过 30 字]

## 公式
步骤1：[角色名（沿用爆款段落）] = [操作手法 + 原文例证]
步骤2：[角色名] = [操作手法 + 原文例证]
步骤3：[角色名] = [操作手法 + 原文例证]
...`,
};

export const MODE_BOOSTERS: Record<GenerationType, string> = {
  analyze:
    '\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n【输出模式强约束 · 本次必须是「内容分析」模式】\n• 禁止把原文改写或重写，二创改写是另一个模式的事\n• 必须按上方定义的【六维评分】+【骨（本质惊艳）】4 问结构组织\n• 输出必须包含数字评分（0-10）和原文证据摘录\n• 不要输出【新标题】/【新正文】/【标签】等二创结构\n• 如果原文内容为空，请明确在「合规风险」中标出「原文内容缺失，无法做完整分析」',
  recreate:
    '\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n【输出模式强约束 · 本次必须是「二创改写」模式】\n• 禁止只做内容分析，必须产出一篇全新的改写稿\n• 必须包含【新标题】+【新正文】+【标签】3 个模块\n• 标题/正文/标签前必须有【新标题】/【新正文】/【标签】明确标记\n• 不要输出"X/10"评分或"骨"分析结构（那是分析模式）\n• 如果原文内容为空，请基于标题合理推测主体并补全改写',
};

// ===== 引擎运行时状态（模块级，不随组件卸载消失）=====
interface EngineState {
  running: boolean;
  paused: boolean;
  activeTaskId: string | null;
  progress: string;
  liveResult: string; // 当前正在流式生成的文本（仅进程在跑且页面打开时可见）
}
const engineState: EngineState = {
  running: false,
  paused: false,
  activeTaskId: null,
  progress: '',
  liveResult: '',
};

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

/** 订阅引擎状态变化；返回取消订阅函数 */
export function subscribeEngine(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function getEngineState(): EngineState {
  return engineState;
}
export function isEngineRunning(): boolean {
  return engineState.running;
}

function setProgress(taskId: string, msg: string) {
  engineState.activeTaskId = taskId;
  engineState.progress = msg;
  updateReprocessTask(taskId, { progress: msg });
  emit();
}

// ===== 批量入队 + 启动 =====
/** 把指定任务置为 pending 并启动引擎（status: idle→pending） */
export function enqueueTasks(ids: string[], mode: GenerationType, skillId: string) {
  ids.forEach((id) =>
    updateReprocessTask(id, {
      status: 'pending',
      mode,
      skillId,
      errorMsg: undefined,
      progress: '排队中',
    })
  );
  startEngine();
}

/** 把当前平台所有 idle 任务入队 */
export function enqueueAllPending(platform: string, mode: GenerationType, skillId: string) {
  const ids = getReprocessTasks()
    .filter((t) => t.platform === platform && (t.status === 'idle' || t.status === 'error'))
    .map((t) => t.id);
  if (ids.length) enqueueTasks(ids, mode, skillId);
  return ids.length;
}

export function startEngine() {
  if (engineState.running) return;
  engineState.running = true;
  engineState.paused = false;
  emit();
  void processLoop();
}

export function pauseEngine() {
  engineState.paused = true;
  emit();
}

// ===== 核心处理循环 =====
async function processLoop() {
  // 顺序处理，一次一条
  while (true) {
    if (engineState.paused) {
      engineState.running = false;
      emit();
      return;
    }
    const next = getReprocessTasks().find((t) => t.status === 'pending');
    if (!next) {
      engineState.running = false;
      emit();
      return;
    }
    await runOne(next);
  }
}

async function runOne(task: ReprocessTask) {
  const mode = task.mode || 'recreate';
  const modeLabel = mode === 'analyze' ? '分析' : '二创改写';
  const actor = getCurrentUserName() || '我';

  updateReprocessTask(task.id, {
    status: 'processing',
    progress: `正在${modeLabel}...`,
    actor,
    errorMsg: undefined,
  });
  engineState.activeTaskId = task.id;
  engineState.progress = `正在${modeLabel}...`;
  emit();

  const cfg = getMyLLMConfig(task.platform);
  if (!cfg.apiKey) {
    const reason = isUsingSharedApi() ? '团队共用接口尚未配置' : '个人 API 未配置';
    updateReprocessTask(task.id, { status: 'error', errorMsg: reason, progress: `✗ ${reason}` });
    addNotification({
      type: 'error',
      title: `${modeLabel}失败`,
      desc: task.title,
      actor,
      taskId: task.id,
      platform: task.platform,
    });
    engineState.liveResult = '';
    emit();
    return;
  }

  const asr = getASRConfig();

  let effectiveContent = task.content || '';
  const videoUrl = task.videoUrl;
  const audioUrl = task.audioUrl;
  let transcriptSource: 'video-llm' | 'asr' | 'original' = 'original';

  const existingContent = effectiveContent.trim();
  const looksPlaceholder =
    existingContent.length < 120 &&
    /(没有提供|未提供|请提供.*链接|无法访问|无法获取)/.test(existingContent);
  const contentUsable = existingContent.length >= 30 && !looksPlaceholder;
  if (contentUsable) {
    setProgress(task.id, `✓ 使用表格自带文案（${existingContent.length} 字），正在${modeLabel}...`);
  }

  // 路径 1：多模态 LLM 视频理解（仅视频链接）
  if (!contentUsable && cfg.useVideoUnderstanding && videoUrl) {
    try {
      setProgress(task.id, '正在用多模态 LLM 提取视频文案...');
      const transcript = await extractScriptViaLLM(cfg, videoUrl, (msg) => setProgress(task.id, msg));
      if (transcript) {
        effectiveContent = transcript;
        transcriptSource = 'video-llm';
        setProgress(
          task.id,
          `✓ 多模态 LLM 提取完成（${transcript.length} 字），正在${modeLabel}...`
        );
        addNotification({
          type: 'extract',
          title: '原文提取完成',
          desc: task.title,
          actor,
          taskId: task.id,
          platform: task.platform,
        });
      }
    } catch (e: any) {
      console.warn('LLM 提取失败，降级', e);
      setProgress(
        task.id,
        `⚠️ LLM 提取失败（${e?.message?.slice(0, 80) || '未知'}），降级到原文/ASR...`
      );
    }
  }

  // 路径 2：ASR 转写（仅当表格没带文案且路径 1 没成功）
  if (!contentUsable && transcriptSource === 'original' && asr.enabled && audioUrl) {
    try {
      setProgress(task.id, '正在用 ASR 提取口播稿（音频转文字）...');
      const transcript = await transcribeAudio(asr, audioUrl);
      if (transcript) {
        effectiveContent = transcript;
        transcriptSource = 'asr';
        setProgress(task.id, `ASR 转写成功（${transcript.length} 字），正在${modeLabel}...`);
        addNotification({
          type: 'extract',
          title: '原文提取完成',
          desc: task.title,
          actor,
          taskId: task.id,
          platform: task.platform,
        });
      }
    } catch (e: any) {
      console.warn('ASR 转写失败，使用原 content', e);
      setProgress(
        task.id,
        `ASR 失败（${e?.message?.slice(0, 80) || '未知'}），降级使用原内容...`
      );
    }
  }

  // 构造 system prompt
  const skills = getSkills(task.platform);
  const skill =
    task.skillId && task.skillId !== '__default__'
      ? skills.find((s) => s.id === task.skillId)
      : undefined;
  const sysPrompt = (skill?.prompt || DEFAULT_SYS_PROMPTS[mode]) + MODE_BOOSTERS[mode];

  const userMsg = `【任务模式】${modeLabel}

【原文标题】
${task.title}

【原文内容】${
    transcriptSource === 'video-llm'
      ? '（以下为多模态 LLM 直接提取的文案：视频/音频）'
      : transcriptSource === 'asr'
      ? '（以下为 ASR 从音频提取的口播稿）'
      : ''
  }
${effectiveContent || '（原文内容缺失，请仅基于标题分析/改写）'}

【原账号】
${task.accountName || '未知'}

【输出要求】
- 本次输出必须是「${modeLabel}」${
    mode === 'analyze'
      ? '，必须含六维评分（每项0-10 + 原文证据）+ 骨四问（底层开关 / 为何独此 / 可迁移原理 / 公式从爆款段落归纳）'
      : '，必须含【新标题】+【新正文】+【标签】3 个模块，且与原标题明显不同'
  }
- 禁止输出与模式不符的内容`;

  try {
    let live = '';
    const full = await callLLMStream(
      cfg,
      [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userMsg },
      ],
      (chunk) => {
        live += chunk;
        engineState.liveResult = live;
        emit();
      },
      (msg) => setProgress(task.id, msg)
    );

    if (!full || !full.trim()) {
      updateReprocessTask(task.id, {
        status: 'error',
        errorMsg: '模型未返回内容',
        progress: '✗ 生成失败：模型未返回内容',
      });
      addNotification({
        type: 'error',
        title: `${modeLabel}失败`,
        desc: task.title,
        actor,
        taskId: task.id,
        platform: task.platform,
      });
      engineState.liveResult = '';
      emit();
      return;
    }

    // 完成时刻同时用于任务字段与历史归档的幂等键，必须一致
    const finishedAt = new Date().toISOString();
    updateReprocessTask(task.id, {
      status: 'done',
      result: full,
      resultAt: finishedAt,
      progress: '生成完成',
    });

    // 【结果留存】生成成功即归档，改写 / 分析一视同仁，后续删除任务不会带走结果
    try {
      archiveGeneration({
        taskId: task.id,
        taskTitle: task.title,
        result: full,
        platform: task.platform,
        mode,
        skillId: task.skillId,
        skillLabel: skill?.label,
        accountName: task.accountName,
        coverUrl: task.coverUrl,
        actor,
        resultAt: finishedAt,
        source: 'engine',
      });
    } catch (e) {
      console.warn('归档生成结果失败', e);
    }

    addNotification({
      type: mode,
      title: `${modeLabel}完成`,
      desc: task.title,
      actor,
      taskId: task.id,
      platform: task.platform,
    });
    setProgress(task.id, `${modeLabel}完成`);
  } catch (e: any) {
    console.error(e);
    const reason = e?.message?.slice(0, 120) || '未知错误';
    updateReprocessTask(task.id, {
      status: 'error',
      errorMsg: reason,
      progress: `✗ 生成失败：${e?.message?.slice(0, 80) || '未知错误'}`,
    });
    addNotification({
      type: 'error',
      title: `${modeLabel}失败`,
      desc: task.title,
      actor,
      taskId: task.id,
      platform: task.platform,
    });
  } finally {
    engineState.liveResult = '';
    emit();
  }
}

// ===== 模块加载时自动恢复（不依赖 app.tsx 启动）=====
// 刷新 / 重开页面后，若队列里残留 pending、或上次被中断遗留的 processing 任务，
// 引擎会自动续跑，从而满足"切走页面 / 刷新后后台继续处理"的需求。
function autoResume() {
  getReprocessTasks().forEach((t) => {
    // 上次刷新/关闭页面时遗留的"处理中" → 重置为排队，等引擎重新跑
    if (t.status === 'processing') {
      updateReprocessTask(t.id, { status: 'pending', progress: '排队中（页面刷新后恢复）' });
    }
  });
  if (getReprocessTasks().some((t) => t.status === 'pending')) {
    startEngine();
  }
}
autoResume();
