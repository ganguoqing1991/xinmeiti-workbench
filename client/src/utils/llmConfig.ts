// LLM API 配置 + Skill 列表（用户自定义）
// 持久化到 localStorage，按平台隔离

import type { Platform } from '../types';
import { getMember } from './memberStore';

export interface LLMConfig {
  provider: string; // 提供商标识
  apiKey: string; // 用户填的 API key
  baseUrl: string; // OpenAI 兼容 base url
  modelName: string; // 模型名（gpt-4o-mini / deepseek-chat / doubao-pro...）
  temperature: number; // 0-1
  maxTokens: number; // 输出上限
  // 多模态能力开关：开启后，遇到有 videoUrl 的任务会直接给 LLM 喂视频 URL，
  // 让模型自己看视频拿文案（无需 ASR）。
  // 适用模型：doubao-seed-1-6 / doubao-seed-1-6-vision / gpt-4o / gpt-4-vision / gemini-1.5-pro 等
  useVideoUnderstanding?: boolean;
}

// ASR（语音转文字）配置
// 支持 3 种服务：
//  1. whisper：OpenAI Whisper 兼容（OpenAI Whisper / Groq Whisper）
//  2. volc-asr：火山方舟「录音文件识别大模型」专用（APP ID + Access Token + 实例ID）
//  3. custom：自定义 ASR 端点（Whisper 兼容）
export interface ASRConfig {
  provider: 'whisper' | 'volc-asr' | 'custom';
  apiKey: string; // Whisper 模式：OpenAI/Groq API Key
  baseUrl: string; // Whisper 模式：OpenAI 兼容 base url
  modelName: string; // Whisper 模式：whisper-1 / whisper-large-v3
  // 火山方舟 ASR「录音文件识别极速版」专用字段（走 openspeech.bytedance.com 自定义 JSON 协议）
  volcApiKey?: string; // API Key（控制台 → API Key 管理里创建的 ark- 密钥）
  volcResourceId?: string; // 资源 ID（如 volc.bigasr.auc_turbo 极速版 / volc.seedasr.auc 标准版 2.0）
  language?: string; // zh / en / auto
  enabled: boolean;
}

export interface ReprocessSkill {
  id: string;
  label: string; // 用户起的名字
  prompt: string; // 系统提示词
  enabled: boolean;
  createdAt: string;
  scope?: 'shared' | 'personal'; // 云端模式才有：shared=共享库 / personal=个人库
}

const STORAGE_KEY_LLM = (platform: Platform) => `reprocess_llm_config_${platform}_v1`;
const STORAGE_KEY_SKILLS = (platform: Platform) => `reprocess_skills_${platform}_v1`;
// ASR 配置改为**全局**（不按平台隔离）—— 一次配置，所有平台共用
const STORAGE_KEY_ASR_GLOBAL = 'reprocess_asr_global_v1';

// 默认配置（OpenAI 兼容）
const DEFAULT_LLM: LLMConfig = {
  provider: 'deepseek',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/v1',
  modelName: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 4096,
  useVideoUnderstanding: false, // 默认关闭，需要用户主动开启（且用多模态模型）
};

// 默认 ASR 配置：OpenAI Whisper 兼容（用 Groq / OpenAI 都可）
const DEFAULT_ASR: ASRConfig = {
  provider: 'whisper',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1', // 也可填 Groq: https://api.groq.com/openai/v1
  modelName: 'whisper-1',
  language: 'zh',
  enabled: false, // 默认关闭，需用户主动开启
};

const DEFAULT_SKILLS: ReprocessSkill[] = [
  {
    id: 'skill-default-rewrite',
    label: '基础改写',
    prompt: '请对以下小红书/抖音笔记进行二创改写，保留原意但换一种表达风格。要求：\n1. 标题重新组织（10-25 字内，吸睛）\n2. 正文分 3-5 段，每段 1-2 句\n3. 末尾加 3-5 个话题标签\n4. 保留原账号的"真实感"，不要硬广\n5. 输出格式：标题 / 正文 / 标签，三段分明',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'skill-default-parent',
    label: '家长视角改写',
    prompt: '以小学/初中家长视角，对以下内容做二创。要求：\n1. 用第一人称"我家孩子..."开头\n2. 加入具体场景（辅导作业、考试前后、开学）\n3. 提供 1-2 个可操作建议\n4. 结尾呼吁家长收藏、评论、转发\n5. 标题控制在 18 字以内',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'skill-default-shortvideo',
    label: '短视频脚本',
    prompt: '把以下内容改编为抖音/小红书短视频脚本（30-60 秒）：\n1. Hook（前 3 秒，必须抓眼球）\n2. 冲突/痛点（5-10 秒）\n3. 解决/方法（15-30 秒）\n4. 行动号召（最后 5 秒）\n5. 字幕文案（每屏 8-15 字）\n6. BGM 建议',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, val: any) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error('写入配置失败', e, key);
  }
}

// ===== LLM 配置（全局共享：一次配置，所有平台通用，与 ASR 一致）=====
// 配合「多模态 LLM 理解」：只填一次、只对接一个 API，同时搞定改写 + 语音转文字
const STORAGE_KEY_LLM_GLOBAL = 'reprocess_llm_config_global_v1';
const LEGACY_LLM_PLATFORMS: Platform[] = ['xiaohongshu', 'douyin'];

export function getLLMConfig(platform: Platform): LLMConfig {
  const global = readJSON<LLMConfig | null>(STORAGE_KEY_LLM_GLOBAL, null);
  if (global) return global;
  // 一次性迁移：读旧的按平台 key（优先当前平台），迁移到全局 key
  const candidates = [platform, ...LEGACY_LLM_PLATFORMS.filter((p) => p !== platform)];
  for (const p of candidates) {
    const legacy = readJSON<LLMConfig | null>(STORAGE_KEY_LLM(p), null);
    if (legacy) {
      writeJSON(STORAGE_KEY_LLM_GLOBAL, legacy);
      return legacy;
    }
  }
  return DEFAULT_LLM;
}

export function setLLMConfig(_platform: Platform, cfg: LLMConfig) {
  writeJSON(STORAGE_KEY_LLM_GLOBAL, cfg);
}

export function resetLLMConfig(_platform: Platform) {
  writeJSON(STORAGE_KEY_LLM_GLOBAL, DEFAULT_LLM);
}

// ===== 团队共用接口（管理员配置，成员默认使用）=====
// 说明：共用配置存在浏览器本地，成员机器上需要通过「团队配置码」导入一次。
// 若日后接入云端（资料库 / 后端），只需替换 getSharedLLMConfig 的取数来源，上层逻辑不用动。
const STORAGE_KEY_LLM_SHARED = 'shared_llm_config_v1';

export function getSharedLLMConfig(): LLMConfig | null {
  return readJSON<LLMConfig | null>(STORAGE_KEY_LLM_SHARED, null);
}
export function setSharedLLMConfig(cfg: LLMConfig) {
  writeJSON(STORAGE_KEY_LLM_SHARED, cfg);
}
export function clearSharedLLMConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY_LLM_SHARED);
  } catch {
    /* ignore */
  }
}

/** 个人是否已配置了接口（以 apiKey 非空为准） */
export function hasPersonalLLMConfig(): boolean {
  return !!readJSON<LLMConfig | null>(STORAGE_KEY_LLM_GLOBAL, null)?.apiKey;
}

/**
 * 按使用模式解析实际生效的配置。
 * - own 且本机已配个人接口 → 用个人的
 * - 其余情况 → 用团队共用接口（没有则回落默认空配置）
 */
export function resolveLLMConfig(platform: Platform, mode: 'shared' | 'own'): LLMConfig {
  if (mode === 'own') {
    const personal = readJSON<LLMConfig | null>(STORAGE_KEY_LLM_GLOBAL, null);
    if (personal?.apiKey) return personal;
  }
  const shared = getSharedLLMConfig();
  if (shared?.apiKey) return shared;
  // 共用配置也没有时，仍回落到个人配置（避免管理员本机反而读不到）
  return getLLMConfig(platform);
}

/**
 * 按「当前登录用户」自动解析生效配置。
 *
 * 当前用户名由应用层注入（见 setCurrentUserResolver），避免本模块反向依赖 workspace
 * 造成循环引用。未注入时按共用模式处理。
 */
let currentUserResolver: () => string = () => '';
export function setCurrentUserResolver(fn: () => string) {
  currentUserResolver = fn;
}

export function getMyLLMConfig(platform: Platform): LLMConfig {
  const name = currentUserResolver();
  const mode: 'shared' | 'own' = name && getMember(name)?.apiMode === 'own' ? 'own' : 'shared';
  return resolveLLMConfig(platform, mode);
}

/** 返回当前登录用户名（供引擎/通知记录"谁操作"）。未注入时返回空串。 */
export function getCurrentUserName(): string {
  return currentUserResolver();
}

/** 当前是否为「共用团队接口」模式 */
export function isUsingSharedApi(): boolean {
  const name = currentUserResolver();
  const m = name ? getMember(name) : null;
  if (!m) return true;
  // 总监始终能进 API 配置页（canSee 对总监恒开），视为可自行配置
  if (m.level === 'director') return false;
  return m.apiMode !== 'own';
}

/**
 * 缺少可用接口时的统一提示语。
 * 共用模式下成员进不去 API 配置页（路由守卫拦着），
 * 不能再让他"去 API 栏目配置"，应指向管理员。
 */
export function apiMissingHint(): string {
  return isUsingSharedApi()
    ? '团队共用接口尚未配置，请联系管理员在「API 配置 → 团队共用接口」中设置'
    : '请先到左侧「API」栏目配置模型 API Key';
}
// 仅做编码混淆，不是加密——目的是让成员看不到明文、不会误改，安全级别与前端密码校验一致。
const SHARED_CODE_PREFIX = 'MWB1:';

export function exportSharedCode(): string {
  const cfg = getSharedLLMConfig();
  if (!cfg?.apiKey) return '';
  const json = JSON.stringify(cfg);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return SHARED_CODE_PREFIX + btoa(binary);
}

export function importSharedCode(code: string): { ok: boolean; reason?: string } {
  const raw = (code || '').trim();
  if (!raw) return { ok: false, reason: '请粘贴团队配置码' };
  if (!raw.startsWith(SHARED_CODE_PREFIX)) {
    return { ok: false, reason: '配置码格式不对，应以 MWB1: 开头' };
  }
  try {
    const binary = atob(raw.slice(SHARED_CODE_PREFIX.length));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const cfg = JSON.parse(new TextDecoder().decode(bytes)) as LLMConfig;
    if (!cfg || typeof cfg.apiKey !== 'string' || !cfg.apiKey) {
      return { ok: false, reason: '配置码内容不完整，请重新生成' };
    }
    setSharedLLMConfig(cfg);
    return { ok: true };
  } catch {
    return { ok: false, reason: '配置码解析失败，请确认复制完整' };
  }
}

// ===== ASR 配置（全局共享）=====
export function getASRConfig(): ASRConfig {
  return readJSON<ASRConfig>(STORAGE_KEY_ASR_GLOBAL, DEFAULT_ASR);
}

export function setASRConfig(cfg: ASRConfig) {
  writeJSON(STORAGE_KEY_ASR_GLOBAL, cfg);
}

export function resetASRConfig() {
  writeJSON(STORAGE_KEY_ASR_GLOBAL, DEFAULT_ASR);
}

/**
 * ASR 转写（OpenAI Whisper 兼容协议）
 * - 输入：audioUrl（公网可访问的音频 URL）
 * - 输出：转写文本
 * - 支持服务：OpenAI Whisper / Groq Whisper / 火山方舟 doubao-asr / 自定义
 */
// 云端反代地址（与 Skill 云端同一个 VITE_SKILL_API_BASE），配置后 ASR 走服务端转发解 CORS
const ASR_PROXY_BASE = ((import.meta as any).env?.VITE_SKILL_API_BASE as string | undefined)?.trim() || '';
export const ASR_PROXY_ENABLED = !!ASR_PROXY_BASE;

// 通过云端 Worker 反代：火山专用协议（/api/asr）
async function transcribeVolcViaProxy(cfg: ASRConfig, audioUrl: string): Promise<string> {
  const res = await fetch(`${ASR_PROXY_BASE}/api/asr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioUrl, volcApiKey: cfg.volcApiKey, volcResourceId: cfg.volcResourceId }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) throw new Error(j?.error || `代理转写失败 HTTP ${res.status}`);
  return j.text;
}

// 通过云端 Worker 反代：OpenAI 兼容（/api/asr/openai）
async function transcribeOpenAIViaProxy(cfg: ASRConfig, audioUrl: string): Promise<string> {
  const res = await fetch(`${ASR_PROXY_BASE}/api/asr/openai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      modelName: cfg.modelName,
      language: cfg.language,
      audioUrl,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) throw new Error(j?.error || `代理转写失败 HTTP ${res.status}`);
  return j.text;
}

export async function transcribeAudio(cfg: ASRConfig, audioUrl: string): Promise<string> {
  if (!cfg.enabled) {
    throw new Error('ASR 未启用，请在模型配置中开启「语音转文字」');
  }
  if (!audioUrl) {
    throw new Error('音频链接为空');
  }

  // ===== 火山方舟「录音文件识别极速版」专用分支 =====
  if (cfg.provider === 'volc-asr') {
    if (!cfg.volcApiKey) throw new Error('请填写火山方舟 API Key（控制台 → API Key 管理）');
    if (!cfg.volcResourceId) throw new Error('请填写「资源 ID」(X-Api-Resource-Id) · 极速版填 volc.bigasr.auc_turbo');
    // 配置了云端反代 → 走服务端转发（解浏览器 CORS）
    if (ASR_PROXY_ENABLED) return await transcribeVolcViaProxy(cfg, audioUrl);
    return await transcribeVolcASR(cfg, audioUrl);
  }

  // ===== Whisper / Custom（OpenAI 兼容）分支 =====
  if (!cfg.apiKey) {
    throw new Error('请先填写 ASR API Key');
  }
  // 配置了云端反代 → 走服务端转发（解浏览器 CORS：下载音频 + 调服务商都在服务端完成）
  if (ASR_PROXY_ENABLED) return await transcribeOpenAIViaProxy(cfg, audioUrl);
  const baseUrl = cfg.baseUrl.replace(/\/+$/, '');
  // 优先尝试 /audio/transcriptions（Whisper 标准）
  const url = `${baseUrl}/audio/transcriptions`;

  // 1. 先下载音频，转成 FormData 二进制上传（Whisper 接受 url + file 两种）
  let blob: Blob;
  try {
    const r = await fetch(audioUrl);
    if (!r.ok) throw new Error(`下载音频失败 HTTP ${r.status}`);
    blob = await r.blob();
  } catch (e: any) {
    throw new Error(`下载音频失败：${e?.message || '网络错误'}（CORS 或链接不可访问）`);
  }

  // 推断文件名
  const ext = (audioUrl.match(/\.(mp3|m4a|wav|ogg|webm|flac|aac)$/i)?.[1] || 'mp3').toLowerCase();
  const file = new File([blob], `audio.${ext}`, { type: blob.type || 'audio/mpeg' });

  const form = new FormData();
  form.append('file', file);
  form.append('model', cfg.modelName);
  if (cfg.language && cfg.language !== 'auto') {
    form.append('language', cfg.language);
  }
  form.append('response_format', 'json');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ASR 调用失败 HTTP ${res.status} · ${text.slice(0, 200)}`);
  }

  const j = await res.json();
  // OpenAI Whisper 标准响应: { text: "..." }
  // 火山方舟 doubao-asr: { result: { text: "..." } } 或 { text: "..." }
  const text: string = j.text || j?.result?.text || j?.transcript || '';
  if (!text) {
    throw new Error(`ASR 返回为空：${JSON.stringify(j).slice(0, 200)}`);
  }
  return text;
}

/**
 * 多模态 LLM 视频理解：从视频中提取口播文案
 * - 适用模型：doubao-seed-1-6 / doubao-seed-1-6-vision / gpt-4o / gpt-4-vision / gemini-1.5-pro / gemini-2.0-flash
 * - 不依赖 ASR，绕开浏览器 CORS 拦截（火山 ASR 服务端 API 浏览器直连会失败）
 * - 实现原理：
 *   1. 构造 OpenAI 兼容 multimodal message（content 数组，含 text + image_url/video_url）
 *   2. 让 LLM 看视频并直接输出口播稿
 *   3. 部分厂商（豆包）接受 video_url；部分（GPT-4o）只接受 image_url 但 video 也可作为 image
 */
// 已知**不支持**多模态视频输入的模型前缀
// 这些模型收到 multimodal content 数组会返 400 或直接 HTML 错误页
const TEXT_ONLY_MODEL_PREFIXES = [
  /^deepseek-(chat|reasoner|coder|vl)/i, // deepseek-chat / deepseek-reasoner / deepseek-coder / deepseek-vl（注：deepseek-vl 已废弃）
  /^gpt-3\.5/i,
  /^gpt-4(-turbo)?$/i, // gpt-4 / gpt-4-turbo 文本版；多模态要 gpt-4o / gpt-4-vision
  /^claude-(instant|3-(opus|sonnet|haiku))/i, // Claude 3 原生不接 image_url content 数组
  /^text-embedding/i,
  /^llama.*-text/i,
];

// 检测模型是否支持多模态（粗略启发式；最终看 API 是否接受 multimodal content）
function checkMultimodalSupport(modelName: string, baseUrl: string): { ok: boolean; reason?: string } {
  const m = (modelName || '').trim();
  if (!m) return { ok: false, reason: '模型名为空' };

  // 1. 黑名单：已知纯文本模型
  for (const re of TEXT_ONLY_MODEL_PREFIXES) {
    if (re.test(m)) {
      return {
        ok: false,
        reason: `模型 "${m}" 已知是纯文本模型，不支持视频/图片输入`,
      };
    }
  }

  // 2. 白名单（强信号）：包含 vision / multimodal 关键词
  if (/vision|multimodal|vl\b|seed-1-[56]|seed-2|gemini|gpt-4o|gpt-4-vision|qvq|qwen-vl|qwen2-vl|qwen2\.5-vl|qwen3-omni|omni|internvl|yi-vl|claude-3\.[5-9]/i.test(m)) {
    return { ok: true };
  }

  // 3. 看 Base URL：豆包/OpenAI 兼容的视觉模型可能在自定义路径
  // 例如 https://ark.cn-beijing.volces.com/api/v3 → 多半是豆包
  if (/ark\.cn-beijing|volces\.com/i.test(baseUrl)) {
    return { ok: true };
  }

  // 4. 其他情况：不确定，让请求去探测
  return { ok: true };
}

// 防污染校验：模型无法访问媒体链接时会返回"您没有提供视频 URL / 无法访问 / 请提供链接"等
// 拒绝/占位文本，绝不能当作转写结果写回任务（否则「查看原文内容」会显示这些占位文本）
function assertNotRefusal(text: string) {
  const t = text.trim();
  const REFUSAL_RE = /(没有提供|未提供|请提供|无法访问|无法获取|无法播放|无法读取|无法识别|抱歉|cannot|unable|not\s+provide|no\s+video|no\s+audio|未能获取)/i;
  if (t.length < 120 && REFUSAL_RE.test(t)) {
    throw new Error(
      `模型无法读取该媒体链接（返回了占位/拒绝文本）："${t.slice(0, 120)}"\n\n` +
        `可能原因：\n` +
        `  ① 链接不是可直接访问的音/视频文件直链（需 .mp3/.mp4 等直链，不是分享页/短链）\n` +
        `  ② 链接已过期或需要登录权限\n` +
        `  ③ 音频输入需多模态模型（doubao-seed-1-6 / qwen3-omni）`,
    );
  }
}

export async function extractScriptViaLLM(
  cfg: LLMConfig,
  mediaUrl: string,
  onProgress?: (msg: string) => void,
): Promise<string> {
  if (!cfg.apiKey) {
    throw new Error('请先在「模型 API 配置」中填写 API Key');
  }
  if (!cfg.modelName) {
    throw new Error('请先填写模型名（需要多模态模型，如 doubao-seed-1-6 / gpt-4o / qwen3-omni）');
  }
  if (!mediaUrl) {
    throw new Error('媒体链接为空');
  }

  // 判断是音频还是视频（按扩展名，忽略 query 参数）
  const path = mediaUrl.split('?')[0];
  const isAudio = /\.(mp3|m4a|wav|ogg|webm|flac|aac)$/i.test(path);

  // 预检：模型是否支持多模态（粗略）
  const support = checkMultimodalSupport(cfg.modelName, cfg.baseUrl || '');
  if (!support.ok) {
    throw new Error(
      `${support.reason}\n\n` +
        `📌 当前模型：${cfg.modelName}\n` +
        `📌 Base URL：${cfg.baseUrl || '(空)'}\n\n` +
        `✅ 请切换到以下任一多模态模型：\n` +
        `  · 火山方舟：doubao-seed-1-6-250615 / doubao-seed-1-6-vision-250615\n` +
        `  · OpenAI：gpt-4o / gpt-4o-mini / gpt-4-vision-preview\n` +
        `  · Google：gemini-1.5-pro / gemini-2.0-flash\n` +
        `  · 通义千问：qwen-vl-max / qwen2-vl-72b\n` +
        `  · DeepSeek：deepseek-vl（已停产，建议换豆包）`,
    );
  }

  onProgress?.(isAudio ? '正在用多模态 LLM 转写音频...' : '正在用多模态 LLM 提取视频文案...');

  const baseUrl = (cfg.baseUrl || '').replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('请先填写 Base URL');
  }

  // 自动判断是 OpenAI Chat Completions 兼容 API（火山方舟 doubao / OpenAI / DeepSeek）
  // Doubao Responses API 暂不支持 multimodal content 数组 → 只走 chat/completions
  const url = `${baseUrl}/chat/completions`;

  // 构造 multimodal user message（音频 → input_audio；视频 → image_url + video_url）
  const messages = [
    {
      role: 'system' as const,
      content: isAudio
        ? '你是一个语音转文字助手。用户会给你一段音频 URL，你需要：\n' +
          '1. 完整转写音频里的所有语音内容\n' +
          '2. 只输出转写文字，不要加任何分析/总结/标题\n' +
          '3. 如果音频无语音，输出"[无语音]"'
        : '你是一个视频口播文案提取助手。用户会给你一段视频 URL，你需要：\n' +
          '1. 观看视频内容\n' +
          '2. 完整提取视频里的口播文字（脚本）\n' +
          '3. 按时间顺序整理\n' +
          '4. 只输出提取到的口播文字，不要加任何分析/总结/标题\n' +
          '5. 如果视频无口播或无字幕，输出"[无口播]"',
    },
    {
      role: 'user' as const,
      content: isAudio
        ? [
            {
              type: 'text',
              text: '请转写这段音频里的完整语音内容：',
            },
            {
              type: 'input_audio',
              input_audio: { audio_url: mediaUrl },
            },
          ]
        : [
            {
              type: 'text',
              text: '请提取这段视频里的完整口播文字：',
            },
            {
              type: 'image_url',
              image_url: { url: mediaUrl },
            },
            {
              type: 'video_url',
              video_url: { url: mediaUrl },
            },
          ],
    },
  ];

  const body = {
    model: cfg.modelName,
    messages,
    temperature: 0.2,
    max_tokens: cfg.maxTokens || 4096,
    stream: false,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    const msg = e?.message || '';
    if (/Failed to fetch|NetworkError|CORS/i.test(msg)) {
      throw new Error(
        `网络/CORS 错误：${msg}\n\n` +
          `多模态 LLM 通常放行浏览器 CORS，但部分自建服务不支持。\n` +
          `💡 可尝试换成火山方舟豆包（ark.cn-beijing.volces.com）或 OpenAI 官方端点。`,
      );
    }
    throw new Error(`网络错误：${msg || '未知'}`);
  }

  // 读取响应：先按 text 读，避免直接 .json() 在 HTML 错误页上崩
  const rawText = await res.text().catch(() => '');
  const contentType = res.headers.get('content-type') || '';
  const looksLikeHtml = /<\s*(!doctype|html|body|head)\b/i.test(rawText);
  const looksLikeJson = contentType.includes('json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('[');

  if (!res.ok) {
    // 服务器返回错误（4xx/5xx）
    if (looksLikeHtml) {
      throw new Error(
        `HTTP ${res.status} · 服务器返回 HTML 页面而非 JSON\n\n` +
          `可能原因：\n` +
          `  ① 模型 "${cfg.modelName}" 不支持多模态输入，被服务端中间件拦截并返回 HTML 错误页\n` +
          `  ② Base URL 拼错了（确认 "${url}" 是正确的 chat completions 端点）\n` +
          `  ③ API Key 无效，被反向代理拦截返回登录页\n\n` +
          `响应片段（前 200 字）：${rawText.slice(0, 200)}\n\n` +
          `💡 建议：换成 doubao-seed-1-6-250615（火山方舟）`,
      );
    }
    if (/not support|multimodal|vision|invalid.*content|does not support|unrecognized|bad request/i.test(rawText)) {
      throw new Error(
        `HTTP ${res.status} · 当前模型 "${cfg.modelName}" 不是多模态模型\n\n` +
          `请切换到 doubao-seed-1-6 / gpt-4o / gemini-1.5-pro 等视觉模型。\n\n` +
          `响应片段：${rawText.slice(0, 200)}`,
      );
    }
    throw new Error(`HTTP ${res.status} · ${rawText.slice(0, 250)}`);
  }

  if (looksLikeHtml) {
    // 2xx 但内容是 HTML → 极少见，但可能：网关代理把 API 错误包成 HTML 返回
    throw new Error(
      `服务器返回 HTML（HTTP ${res.status}）\n\n` +
        `响应片段：${rawText.slice(0, 250)}\n\n` +
        `可能原因：Base URL 指向了非 API 端点（如网页控制台）。\n` +
        `当前 URL：${url}\n` +
        `请检查 Base URL 是否正确（豆包：https://ark.cn-beijing.volces.com/api/v3）`,
    );
  }

  if (!looksLikeJson) {
    throw new Error(
      `服务器返回非 JSON 响应（content-type: ${contentType || '未知'}）\n\n` +
        `响应片段：${rawText.slice(0, 250)}\n\n` +
        `可能原因：API 端点配置错误或服务商临时故障。`,
    );
  }

  // 解析 JSON
  let j: any;
  try {
    j = JSON.parse(rawText);
  } catch (e: any) {
    throw new Error(`服务器返回的 JSON 解析失败：${e?.message || '未知'}\n\n原始响应：${rawText.slice(0, 250)}`);
  }

  // OpenAI / Doubao 标准响应: { choices: [{ message: { content: "..." } }] }
  const text: string = j?.choices?.[0]?.message?.content || j?.choices?.[0]?.text || '';
  if (!text) {
    // 部分厂商把 content 放在 content_array 里（流式聚合）
    const contentArr = j?.choices?.[0]?.message?.content;
    if (Array.isArray(contentArr)) {
      const joined = contentArr.map((c: any) => c?.text || '').join('');
      if (joined) {
        assertNotRefusal(joined);
        onProgress?.(`✓ LLM 已提取 ${joined.length} 字口播文案`);
        return joined;
      }
    }
    // 错误码在 body 里
    const errMsg = j?.error?.message || j?.message || '';
    throw new Error(
      `LLM 返回为空${errMsg ? ` · 服务端提示：${errMsg}` : ''}\n\n` +
        `完整响应：${JSON.stringify(j).slice(0, 300)}`,
    );
  }
  assertNotRefusal(text);
  onProgress?.(`✓ LLM 已提取 ${text.length} 字口播文案`);
  return text;
}

// ===== 火山方舟「录音文件识别大模型」API 适配（新版 OpenAI 兼容）=====
// 端点：POST {baseUrl}/audio/transcriptions
// 鉴权：Authorization: Bearer {API_KEY}
// 请求：multipart/form-data { file, model: '模块名称', response_format: 'json' }
// ===== 火山方舟「录音文件识别极速版」API 适配 =====
// 官方文档：https://docs.volcengine.com/docs/6561/2608628
// 端点：POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash
// 鉴权（新版控制台）：
//   X-Api-Key: 在控制台「API Key 管理」里创建的密钥
//   X-Api-Resource-Id: 资源 ID（极速版 = volc.bigasr.auc_turbo）
// 请求体（JSON）：
//   {
//     "audio": { "url": "..." },
//     "request": {
//       "model_name": "bigmodel",
//       "enable_itn": true,
//       "enable_punc": true,
//       "enable_ddc": true,
//       "show_utterances": true
//     }
//   }
// 响应：
//   { "headers": {...}, "body": { "result": { "text": "口播稿" } } }
async function transcribeVolcASR(cfg: ASRConfig, audioUrl: string): Promise<string> {
  const url = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash';
  const body = {
    audio: { url: audioUrl },
    request: {
      model_name: 'bigmodel',
      enable_itn: true,
      enable_punc: true,
      enable_ddc: true,
      enable_speaker_info: false,
      show_utterances: false,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': cfg.volcApiKey!,
      'X-Api-Resource-Id': cfg.volcResourceId!,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    let msg = t.slice(0, 200) || 'HTTP ' + res.status;
    // 智能识别"请填写模块名称"类错误（X-Api-Resource-Id 缺失）
    if (/resource.?id|resource_id|模块名|module/i.test(t) && /required|missing|empty|缺少|不能为空/i.test(t)) {
      msg = '「资源 ID」(X-Api-Resource-Id) 为空或不正确 — 极速版应填 volc.bigasr.auc_turbo';
    } else if (/api.?key|鉴权|auth/i.test(t) && /required|invalid|denied|缺少|错误|401|403/i.test(t)) {
      msg = 'API Key 无效或被拒 — 请检查控制台「API Key 管理」里创建的密钥';
    }
    throw new Error('火山方舟 ASR 调用失败 · ' + msg);
  }

  const j = await res.json();
  // 多种响应路径兼容
  const text: string =
    j?.body?.result?.text ||
    j?.result?.text ||
    j?.text ||
    (Array.isArray(j?.body?.result?.utterances) &&
      j.body.result.utterances.map((u: any) => u.text).join(' ')) ||
    (Array.isArray(j?.result?.utterances) &&
      j.result.utterances.map((u: any) => u.text).join(' ')) ||
    '';
  if (!text) {
    throw new Error('火山方舟 ASR 返回为空：' + JSON.stringify(j).slice(0, 300));
  }
  return text;
}

// ===== Skills =====
export function getSkills(platform: Platform): ReprocessSkill[] {
  const list = readJSON<ReprocessSkill[] | null>(STORAGE_KEY_SKILLS(platform), null);
  if (!list || list.length === 0) {
    // 首次写入默认技能
    writeJSON(STORAGE_KEY_SKILLS(platform), DEFAULT_SKILLS);
    return DEFAULT_SKILLS;
  }
  return list;
}

export function setSkills(platform: Platform, list: ReprocessSkill[]) {
  writeJSON(STORAGE_KEY_SKILLS(platform), list);
}

export function addSkill(platform: Platform, skill: Omit<ReprocessSkill, 'id' | 'createdAt'>): ReprocessSkill {
  const list = getSkills(platform);
  const newSkill: ReprocessSkill = {
    ...skill,
    id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  list.unshift(newSkill);
  setSkills(platform, list);
  return newSkill;
}

export function updateSkill(platform: Platform, id: string, patch: Partial<ReprocessSkill>) {
  const list = getSkills(platform);
  const idx = list.findIndex((s) => s.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], ...patch };
  setSkills(platform, list);
}

export function removeSkill(platform: Platform, id: string) {
  setSkills(
    platform,
    getSkills(platform).filter((s) => s.id !== id)
  );
}
