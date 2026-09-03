// API 配置面板（模型 LLM + 语音转文字 ASR）—— 从 Reprocess 抽出的共享组件
// 供「API」独立栏目使用；二创加工页不再内嵌配置面板
import React, { useState } from 'react';
import GlassCard from '../GlassCard';
import Modal from '../Modal';
import {
  transcribeAudio,
  type LLMConfig,
  type ASRConfig,
} from '../../utils/llmConfig';
import { callLLMStream } from '../../utils/llmCall';
import {
  Settings,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Key,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Video,
  Mic,
  HelpCircle,
  RefreshCw,
  Bot,
  Zap,
} from 'lucide-react';

// ===== LLM 配置面板 =====
type TestStatus = 'idle' | 'testing' | 'success' | 'error' | 'warning';

// 把 HTTP 状态码 + body code 翻译成 friendly 错误
function friendlyLLMError(status: number, bodyText: string, fallbackMsg?: string): string {
  let body: any = {};
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = {};
  }
  const code: string = body?.error?.code || body?.code || '';
  const type: string = body?.error?.type || body?.type || '';
  const msg: string = body?.error?.message || body?.message || '';

  // 鉴权错误
  if (status === 401 || status === 403) {
    if (/api[_-]?key|api key|authentication/i.test(code + type + msg)) {
      return '✗ API Key 无效或权限不足，请检查 Key 是否正确（不要泄露给他人）';
    }
    return `✗ 鉴权失败 (HTTP ${status})，请检查 API Key 是否有效`;
  }
  // 模型 / 端点不存在
  if (
    status === 404 ||
    /InvalidEndpoint|ModelNotFound|model_not_found|endpoint.*not.*found/i.test(code + msg)
  ) {
    return `✗ 模型名或端点不存在 (HTTP ${status})。请检查：\n• Base URL 是否正确（如火山方舟应为 https://ark.cn-beijing.volces.com/api/v3）\n• 模型名是否与该 API 兼容（如方舟端点请用你开通的推理接入点 ID 而不是 deepseek-V4-PRO）`;
  }
  // 限流
  if (status === 429 || /rate.?limit|too.?many.?requests|quota/i.test(code + msg)) {
    return '✗ 请求过于频繁或配额已用完，请稍后再试';
  }
  // 服务端错误
  if (status >= 500) {
    return `✗ 服务端错误 (HTTP ${status})，请稍后重试`;
  }
  // 其他：截取原始信息
  const raw = (msg || bodyText || fallbackMsg || '').slice(0, 240);
  return `✗ HTTP ${status}${code ? ` · ${code}` : ''}${raw ? ` · ${raw}` : ''}`;
}

async function testLLMConnection(cfg: LLMConfig): Promise<{ ok: boolean; message: string; models?: string[]; status?: number; endpoint?: string }> {
  if (!cfg.apiKey) {
    return { ok: false, message: '⚠️ 请先填写 API Key' };
  }
  if (!cfg.baseUrl) {
    return { ok: false, message: '⚠️ 请先填写 Base URL' };
  }
  // 兼容用户填带 /chat/completions 或 /responses 的 Base URL
  // 提取真正的基础 URL
  let baseUrl = cfg.baseUrl.replace(/\/+$/, '');
  let explicitEndpoint: 'chat' | 'responses' | null = null;
  if (/\/chat\/completions$/.test(baseUrl)) {
    explicitEndpoint = 'chat';
    baseUrl = baseUrl.replace(/\/chat\/completions$/, '');
  } else if (/\/responses$/.test(baseUrl)) {
    explicitEndpoint = 'responses';
    baseUrl = baseUrl.replace(/\/responses$/, '');
  }
  // 第一步：尝试 ${baseUrl}/models
  try {
    const res = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // 404 /models 端点不存在：fallback 到端点探测
      if (res.status === 404) {
        return await probeEndpoint(cfg, baseUrl, explicitEndpoint);
      }
      return { ok: false, message: friendlyLLMError(res.status, text), status: res.status };
    }
    const j = await res.json();
    const models: string[] =
      j?.data?.map((m: any) => m.id).filter(Boolean) ||
      j?.models?.map((m: any) => m.id || m).filter(Boolean) ||
      [];
    if (models.length === 0) {
      return { ok: true, message: `✓ 已连接 · 未列出模型，请确认模型名输入正确` };
    }
    const modelOk = cfg.modelName && models.includes(cfg.modelName);
    return {
      ok: true,
      message: modelOk
        ? `✓ 已连接 · ${cfg.modelName} 模型可用`
        : `✓ 已连接 · 共 ${models.length} 个模型（请检查模型名是否在列表中）`,
      models,
    };
  } catch (e: any) {
    return await probeEndpoint(cfg, baseUrl, explicitEndpoint, e?.message);
  }
}

// 探测实际端点（chat/completions 或 responses）
// 优先尝试显式端点（如用户填了 /responses），否则两个都试
async function probeEndpoint(
  cfg: LLMConfig,
  baseUrl: string,
  preferred: 'chat' | 'responses' | null,
  networkErrMsg?: string
): Promise<{ ok: boolean; message: string; models?: string[]; status?: number; endpoint?: string }> {
  const endpoints: Array<'responses' | 'chat'> =
    preferred === 'responses'
      ? ['responses', 'chat']
      : preferred === 'chat'
      ? ['chat', 'responses']
      : ['chat', 'responses']; // 默认先试 chat，再试 responses

  const tried: string[] = [];
  for (const ep of endpoints) {
    tried.push(ep);
    const result = await probeSingle(cfg, baseUrl, ep);
    if (result.ok) {
      return { ...result, endpoint: ep };
    }
    // 401/403 表示鉴权失败：直接返回，不再试下一个端点
    if (result.status === 401 || result.status === 403) {
      return { ... result, endpoint: ep };
    }
    // 网络错误：继续尝试下一个
  }
  // 两个端点都失败：返回最后一个错误
  const lastResult = await probeSingle(cfg, baseUrl, endpoints[endpoints.length - 1]);
  return {
    ...lastResult,
    endpoint: tried.length > 1 ? tried.join(' / ') : tried[0],
    message:
      lastResult.ok || lastResult.status === 401 || lastResult.status === 403
        ? lastResult.message
        : `✗ 已尝试 ${tried.join(' / ')} 端点均失败。${lastResult.message}\n\n提示：火山方舟最新端点是 /api/v3/responses（不是 /chat/completions）。请检查你的 Base URL 是否正确。`,
  };
}

// 单个端点探测
async function probeSingle(
  cfg: LLMConfig,
  baseUrl: string,
  endpoint: 'chat' | 'responses'
): Promise<{ ok: boolean; message: string; status?: number }> {
  const url = `${baseUrl}/${endpoint === 'chat' ? 'chat/completions' : 'responses'}`;
  const body =
    endpoint === 'chat'
      ? {
          model: cfg.modelName || 'test',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 4,
          stream: false,
        }
      : {
          model: cfg.modelName || 'test',
          input: [{ role: 'user', content: [{ type: 'input_text', text: 'ping' }] }],
          max_output_tokens: 4,
        };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const text = await r.text().catch(() => '');
    if (r.ok) {
      return { ok: true, message: `✓ 已连接 · ${endpoint === 'chat' ? 'chat' : 'responses'} 端点探测通过`, status: r.status };
    }
    // 400 表示鉴权通过但模型/参数问题
    if (r.status === 400) {
      try {
        const j = JSON.parse(text);
        const code = j?.error?.code || '';
        if (/InvalidEndpoint|ModelNotFound|model_not_found|not.*found/i.test(code)) {
          return { ok: false, message: friendlyLLMError(404, text), status: 404 };
        }
      } catch {
        /* fallthrough */
      }
      return {
        ok: false,
        message: '⚠️ 鉴权通过但端点调用失败（400）。请检查模型名拼写（注意区分大小写）。',
        status: r.status,
      };
    }
    return { ok: false, message: friendlyLLMError(r.status, text), status: r.status };
  } catch (e: any) {
    return {
      ok: false,
      message: `网络错误 · ${e?.message || '未知'}`,
      status: 0,
    };
  }
}


// ===== ASR 配置面板（语音转文字）=====
const ASRConfigPanel: React.FC<{
  asr: ASRConfig;
  onChange: (next: ASRConfig) => void;
  onReset: () => void;
  platform: string;
  onTestSuccess?: () => void;
}> = ({ asr, onChange, onReset, platform, onTestSuccess }) => {
  const [showKey, setShowKey] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const [testing, setTesting] = useState(false);
  const [asrCollapsed, setAsrCollapsed] = useState(true); // 默认折叠：需要音频转写时再展开配置

  // 火山方舟 ASR 资源 ID 格式校验
// 有效格式：
//   ① 标准格式：volc.bigasr.auc_turbo（极速版）/ volc.seedasr.auc（标准版 2.0）
//   ② 自建应用：UUID 形式 8-4-4-4-12（如 807f61be-0750-4186-abeb-57ab85c26c50）
// 容易被误填的（控制台里其它字段）：
//   ✗ "api-key-..." / "API Key 名称"
//   ✗ "ark-xxxxxxxx..." / "Bearer xxx" — 这是 API Key
//   ✗ 平台用户名、access_token 等
function validateVolcResourceId(v: string): { ok: boolean; reason?: string; hint?: string } {
  const s = (v || '').trim();
  if (!s) return { ok: false, reason: '资源 ID 为空' };
  // 1. 误填 API Key 名称（"api-key-xxxx"）
  if (/^api-key-/i.test(s)) {
    return {
      ok: false,
      reason: '你填的是「API Key 名称」，不是资源 ID',
      hint: '资源 ID 是 "volc.bigasr.auc_turbo" 这样的格式，或一串 UUID',
    };
  }
  // 2. 误填 API Key（"ark-..."）
  if (/^ark-/i.test(s)) {
    return { ok: false, reason: '你填的是 API Key（ark-xxx），请填到上面「API Key」输入框' };
  }
  // 3. 误填 Bearer Token
  if (/^Bearer\s+/i.test(s)) {
    return { ok: false, reason: '不要带 "Bearer" 前缀，只需填纯 Token 字符串' };
  }
  // 4. 标准格式（极速版 / 标准版 2.0）
  if (/^volc\.(bigasr|seedasr)\.auc(_turbo)?$/i.test(s)) return { ok: true };
  // 5. UUID 格式（自建应用 / 在线 API 接入）
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return { ok: true };
  // 6. 长度异常（5 字符以下 / 50 字符以上）
  if (s.length < 5) return { ok: false, reason: '太短了，资源 ID 至少 5 字符' };
  if (s.length > 60) return { ok: false, reason: '太长了，资源 ID 通常不超过 60 字符' };
  // 7. 其他可疑格式
  if (/[\s'"`]/.test(s)) return { ok: false, reason: '包含空格或引号，请检查复制是否完整' };
  return { ok: true };
}

const testASRConnection = async () => {
    if (!asr.enabled) {
      setTestStatus('error');
      setTestMessage('请先启用 ASR 开关');
      return;
    }
    // 按 provider 分支：volc-asr 用 volcApiKey/volcResourceId；whisper 等用 apiKey/modelName
    if (asr.provider === 'volc-asr') {
      if (!asr.volcApiKey) {
        setTestStatus('error');
        setTestMessage('请先填写「火山方舟 API Key」（即 X-Api-Key）');
        return;
      }
      if (!asr.volcResourceId) {
        setTestStatus('error');
        setTestMessage('请先填写「资源 ID」（X-Api-Resource-Id）');
        return;
      }
      // 资源 ID 格式校验（在发起请求之前拦截，避免无意义的探测）
      const ridCheck = validateVolcResourceId(asr.volcResourceId);
      if (!ridCheck.ok) {
        setTestStatus('error');
        const hintLine = ridCheck.hint ? `\n💡 ${ridCheck.hint}` : '';
        setTestMessage(
          `资源 ID 格式不对：${ridCheck.reason}\n\n` +
            `你填的：${asr.volcResourceId}\n\n` +
            `正确格式（选一）：\n` +
            `  · 极速版：volc.bigasr.auc_turbo\n` +
            `  · 标准版 2.0：volc.seedasr.auc\n` +
            `  · 自建应用 UUID：807f61be-0750-4186-abeb-57ab85c26c50\n` +
            `${hintLine}\n\n` +
            `🔎 资源 ID 在哪找：火山方舟控制台 → 「在线 API 接入」或「我的应用」→ 找到「录音文件识别」→ "资源 ID" 列。`,
        );
        return;
      }
    } else {
      if (!asr.apiKey) {
        setTestStatus('error');
        setTestMessage('请先填写 API Key');
        return;
      }
      if (!asr.modelName) {
        setTestStatus('error');
        setTestMessage('请先填写模型名');
        return;
      }
    }
    setTesting(true);
    setTestStatus('testing');
    setTestMessage('正在测试 ASR 连接...');
    try {
      if (asr.provider === 'volc-asr') {
        // 火山极速版：只发一个空 body 探测认证是否通过，证书错就返 401/403
        const url = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash';
        const probeBody = JSON.stringify({
          audio: { url: 'https://example.com/__probe__.mp3' },
          request: { model_name: 'bigmodel' },
        });
        const probeHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Api-Key': asr.volcApiKey!,
          'X-Api-Resource-Id': asr.volcResourceId!,
        };
        let res: Response;
        try {
          res = await fetch(url, { method: 'POST', headers: probeHeaders, body: probeBody });
        } catch (corsErr: any) {
          // 浏览器直连火山 ASR 大概率撞 CORS（这是已知限制：火山 ASR 设计为后端调用）
          // 标记为 warning 而非 error，并给出 curl + CORS 代理两种验证途径
          const corsMsg = corsErr?.message || '';
          const isLikelyCors = /Failed to fetch|NetworkError|Load failed|CORS|TypeError/i.test(corsMsg);
          if (isLikelyCors) {
            // 兜底：尝试通过公共 CORS 代理再验证一次（仅作诊断，不动业务请求路径）
            try {
              const proxied = await fetch(
                'https://corsproxy.io/?' + encodeURIComponent(url),
                { method: 'POST', headers: probeHeaders, body: probeBody },
              );
              const ptext = await proxied.text().catch(() => '');
              if (proxied.status === 401 || proxied.status === 403) {
                setTestStatus('error');
                setTestMessage(`鉴权失败 HTTP ${proxied.status} · 请检查 X-Api-Key 与 资源 ID`);
              } else if (proxied.status === 400 || proxied.status === 422) {
                setTestStatus('success');
                setTestMessage('✓ 火山 ASR 鉴权通过（通过公共 CORS 代理验证 · 探测音频非真实音频，可正常使用）');
                onTestSuccess?.();
              } else if (proxied.ok) {
                setTestStatus('success');
                setTestMessage('✓ 火山 ASR 端点可达（通过 CORS 代理）');
                onTestSuccess?.();
} else {
              setTestStatus('warning');
              setTestMessage(
                `⚠️ 浏览器无法直连火山 ASR（已知 CORS 限制）\n\n` +
                  `已通过公共代理探测：HTTP ${proxied.status}\n${ptext.slice(0, 200)}\n\n` +
                  `说明：火山方舟 ASR 设计为后端 API，浏览器默认会被 CORS 拦截。\n` +
                  `⚠️ 浏览器侧无法直接验证鉴权，但你的 Key + 资源 ID 格式已校验通过（不为空、符合 volc.* 或 UUID 形式）。\n\n` +
                  `✅ 配置已保存，正式提取口播时仍会尝试直连（CORS 偶尔会放行）。\n` +
                  `💡 如需本地验证：curl -X POST '${url}' \\\n` +
                  `    -H 'X-Api-Key: <你的Key>' -H 'X-Api-Resource-Id: <你的资源ID>' \\\n` +
                  `    -H 'Content-Type: application/json' \\\n` +
                  `    -d '{"audio":{"url":"https://example.com/a.mp3"},"request":{"model_name":"bigmodel"}}'`,
              );
            }
          } catch (proxyErr: any) {
            setTestStatus('warning');
            setTestMessage(
              `⚠️ 浏览器无法直连火山 ASR（已知 CORS 限制）\n\n` +
                `公共 CORS 代理也连不上：${proxyErr?.message || '未知'}\n\n` +
                `这是已知问题：火山方舟 ASR 端点设计为后端调用，不支持浏览器 CORS。\n` +
                `⚠️ 浏览器侧无法直接验证鉴权；配置已保存，正式提取口播时会再尝试直连。\n\n` +
                `💡 本地验证：用 curl/Postman 打 ${url}`,
            );
          }
            return;
          }
          // 非 CORS 的网络错误
          setTestStatus('error');
          setTestMessage(`网络错误：${corsMsg || '未知'}`);
          return;
        }
        const text = await res.text().catch(() => '');
        // 401/403 = 鉴权失败；400/422 = 鉴权通过但参数错；其他 = 不可达
        if (res.status === 401 || res.status === 403) {
          setTestStatus('error');
          setTestMessage(`鉴权失败 HTTP ${res.status} · 请检查 X-Api-Key 与 资源 ID`);
        } else if (res.status === 400 || res.status === 422) {
          setTestStatus('success');
          setTestMessage('✓ 火山 ASR 鉴权通过（探测音频非真实音频，可正常使用）');
          onTestSuccess?.();
        } else if (res.ok) {
          setTestStatus('success');
          setTestMessage('✓ 火山 ASR 端点可达');
          onTestSuccess?.();
        } else {
          setTestStatus('warning');
          setTestMessage(`端点返回 HTTP ${res.status} · ${text.slice(0, 150)}\n（可能是参数格式问题，不一定是鉴权失败）`);
        }
        return;
      }
      // 探测 /audio/transcriptions 端点（OPTIONS 请求不允许发 body，用一个简单的 GET /models 探测）
      const baseUrl = asr.baseUrl.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${asr.apiKey}` },
      });
      if (res.ok) {
        setTestStatus('success');
        setTestMessage(`✓ ASR 已连接 · 模型 ${asr.modelName} 可用`);
        onTestSuccess?.();
      } else if (res.status === 404) {
        // /models 不存在 → 大部分 ASR 端点没有，连接是好的
        setTestStatus('success');
        setTestMessage(`✓ ASR 端点可达 · 模型 ${asr.modelName} 待验证`);
        onTestSuccess?.();
      } else {
        const text = await res.text().catch(() => '');
        setTestStatus('error');
        setTestMessage(`连接失败 HTTP ${res.status} · ${text.slice(0, 150) || '请检查 API Key 和 Base URL'}`);
      }
    } catch (e: any) {
      const msg = e?.message || '未知';
      const isLikelyCors = /Failed to fetch|NetworkError|Load failed|CORS|TypeError/i.test(msg);
      if (isLikelyCors) {
        setTestStatus('warning');
        setTestMessage(
          `⚠️ 浏览器无法直连该 ASR 端点（CORS 拦截）\n\n` +
            `错误详情：${msg}\n\n` +
            `✅ 配置已保存。OpenAI Whisper 兼容端点一般放行浏览器 CORS，但有些自建服务不支持。\n` +
            `💡 实际提取口播时会再试一次；如反复失败，请在 Base URL 配置里填支持 CORS 的端点。`,
        );
      } else {
        setTestStatus('error');
        setTestMessage(`网络错误：${msg}`);
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <GlassCard hoverable={false} className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setAsrCollapsed((v) => !v)}
          className="flex items-center gap-2 text-white font-semibold text-sm hover:text-white/90"
        >
          {asrCollapsed ? (
            <ChevronRight className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/40" />
          )}
          <Mic className="w-4 h-4 text-emerald-400" /> 语音转文字 ASR
          <span className="text-[10px] text-white/40">（全局共享 · 仅「音频文件链接」转写时需要 · 默认折叠）</span>
          {asr.enabled && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
              已启用
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            className="text-[10px] text-white/40 hover:text-white flex items-center gap-0.5"
            title="查看配置说明"
          >
            <HelpCircle className="w-3 h-3" /> 配置说明
          </button>
          <button onClick={onReset} className="text-[10px] text-white/40 hover:text-white">
            重置默认
          </button>
        </div>
      </div>

      {!asrCollapsed && (
        <>

      {/* 启用开关 */}
      <label className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-white/5 cursor-pointer">
        <input
          type="checkbox"
          checked={asr.enabled}
          onChange={(e) => onChange({ ...asr, enabled: e.target.checked })}
          className="w-4 h-4 accent-emerald-500"
        />
        <span className="text-sm text-white">启用语音转文字（任务有 audioUrl 时自动转写）</span>
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-white/50">服务类型</label>
          <select
            value={asr.provider}
            onChange={(e) => {
              const provider = e.target.value as ASRConfig['provider'];
              // 自动填默认 URL
              let baseUrl = asr.baseUrl;
              let modelName = asr.modelName;
              if (provider === 'whisper' && !asr.baseUrl.includes('groq')) {
                baseUrl = 'https://api.openai.com/v1';
                modelName = 'whisper-1';
              } else if (provider === 'volc-asr') {
                // 火山方舟录音文件识别：不需要 baseUrl/modelName
                baseUrl = '';
                modelName = '';
              } else if (provider === 'custom') {
                baseUrl = asr.baseUrl || 'https://your-asr-endpoint.com/v1';
                modelName = asr.modelName || 'your-model';
              }
              onChange({ ...asr, provider, baseUrl, modelName });
            }}
            className="w-full mt-1 h-9 px-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
          >
            <option value="whisper">OpenAI Whisper 兼容（含 Groq）</option>
            <option value="volc-asr">火山方舟「录音文件识别大模型」</option>
            <option value="custom">自定义 ASR 端点</option>
          </select>
        </div>

        {/* 火山方舟「录音文件识别极速版」专用字段（仅 provider='volc-asr' 显示） */}
        {asr.provider === 'volc-asr' && (
          <>
            <div>
              <label className="text-xs text-white/50">
                火山方舟 API Key <span className="text-rose-300/80 ml-1">*必填</span>
              </label>
              <input
                type="password"
                value={asr.volcApiKey || ''}
                onChange={(e) => onChange({ ...asr, volcApiKey: e.target.value })}
                placeholder="ark-xxxxxxxxxxxxxxxx"
                className="w-full mt-1 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white font-mono"
              />
              <p className="text-[10px] text-white/40 mt-1">
                路径：控制台 → API Key 管理 → 创建 API Key
              </p>
            </div>
            <div>
              <label className="text-xs text-white/50">
                资源 ID（X-Api-Resource-Id） <span className="text-rose-300/80 ml-1">*必填</span>
              </label>
              <input
                type="text"
                value={asr.volcResourceId || ''}
                onChange={(e) => onChange({ ...asr, volcResourceId: e.target.value })}
                placeholder="volc.bigasr.auc_turbo"
                className="w-full mt-1 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white font-mono"
              />
              <p className="text-[10px] text-white/40 mt-1">
                极速版（flash）填 <code className="bg-white/5 px-1 rounded">volc.bigasr.auc_turbo</code>；
                标准版 2.0 填 <code className="bg-white/5 px-1 rounded">volc.seedasr.auc</code>
              </p>
            </div>
            <div className="md:col-span-2 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-200">
              💡 <strong>对接说明</strong>：火山方舟「录音文件识别」是<strong>独立产品</strong>，端点固定为
              <code className="bg-white/5 px-1 rounded mx-1">https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash</code>
              （JSON 协议，不是 LLM 那套 OpenAI 兼容端点）。模型名（request.model_name）写死为
              <code className="bg-white/5 px-1 rounded mx-1">bigmodel</code>，所以只需填
              <strong>API Key</strong> + <strong>资源 ID</strong>。
            </div>
          </>
        )}

        <div>
          <label className="text-xs text-white/50">
            模型名
            {asr.provider === 'whisper' && <span className="text-rose-300/80 ml-1">⚠️ 必须是 ASR 模型名（不是 LLM 对话模型）</span>}
            {asr.provider === 'volc-asr' && <span className="text-white/30 ml-1">（火山方舟模式不需要）</span>}
          </label>
          <input
            type="text"
            value={asr.modelName || ''}
            onChange={(e) => onChange({ ...asr, modelName: e.target.value })}
            placeholder={asr.provider === 'volc-asr' ? '不需要' : 'whisper-1 / doubao-asr / paraformer-v2'}
            disabled={asr.provider === 'volc-asr'}
            className="w-full mt-1 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white font-mono disabled:opacity-50"
          />
        </div>
        {asr.provider !== 'volc-asr' && (
          <>
        <div className="md:col-span-2">
          <label className="text-xs text-white/50">Base URL（Whisper 兼容）</label>
          <input
            type="text"
            value={asr.baseUrl}
            onChange={(e) => onChange({ ...asr, baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
            className="w-full mt-1 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white font-mono"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-white/50 flex items-center justify-between">
            <span>API Key</span>
            <button
              onClick={() => setShowKey((v) => !v)}
              className="text-[10px] text-white/40 hover:text-white"
            >
              {showKey ? '隐藏' : '显示'}
            </button>
          </label>
          <input
            type={showKey ? 'text' : 'password'}
            value={asr.apiKey || ''}
            onChange={(e) => onChange({ ...asr, apiKey: e.target.value })}
            placeholder="sk-..."
            className="w-full mt-1 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white font-mono"
          />
        </div>
          </>
        )}
        <div>
          <label className="text-xs text-white/50">语言</label>
          <select
            value={asr.language || 'zh'}
            onChange={(e) => onChange({ ...asr, language: e.target.value })}
            className="w-full mt-1 h-9 px-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
          >
            <option value="zh">中文 (zh)</option>
            <option value="en">英文 (en)</option>
            <option value="auto">自动检测 (auto)</option>
          </select>
        </div>
      </div>

      {/* 测试连接按钮（统一只在下方出现） */}
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button
          onClick={testASRConnection}
          disabled={testing || !asr.enabled}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
        >
          {testing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> 正在连接...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" /> 测试连接
            </>
          )}
        </button>
      </div>

      {testMessage && (
        <p
          className={`mt-3 text-xs flex items-start gap-1 whitespace-pre-wrap max-w-2xl ${
            testStatus === 'success'
              ? 'text-emerald-300'
              : testStatus === 'warning'
              ? 'text-amber-200'
              : testStatus === 'error'
              ? 'text-rose-300'
              : 'text-white/50'
          }`}
        >
          {testMessage}
        </p>
      )}
      <p className="mt-2 text-[10px] text-white/40">
        💡 上传表格时加「音频链接 / audio / mp3 / voice_url」列就会被识别；二创时若任务有 audioUrl 且 ASR 启用，会先转写口播稿作为原文
      </p>
      </>
      )}
      <ApiHelpModal open={showHelp} onClose={() => setShowHelp(false)} kind="asr" />
    </GlassCard>
  );
};

// ===== API 配置说明 Modal（OpenAI / 火山方舟 / 豆包 ASR 等）=====

// API 配置说明卡片结构
interface ApiGuide {
  name: string;
  baseUrl: string;
  model: string;
  docUrl: string;
  consoleUrl: string;
  price: string;
  steps: string[];
  highlight?: boolean; // true = 高亮置顶卡片（推荐方案）
}

const ApiHelpModal: React.FC<{ open: boolean; onClose: () => void; kind: 'llm' | 'asr' }> = ({ open, onClose, kind }) => {
  const llmGuides: ApiGuide[] = [
    {
      name: '⭐ 方案 0：只对接一个大模型（改写 + 视频文案提取）',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'doubao-seed-1-6-250615（或 doubao-seed-1-6-vision）',
      docUrl: 'https://www.volcengine.com/docs/82379',
      consoleUrl: 'https://console.volcengine.com/ark',
      price: '推荐 · 视频免 ASR',
      highlight: true,
      steps: [
        '选一个支持视频的多模态模型：豆包 doubao-seed-1-6 / doubao-seed-1-6-vision / gpt-4o / gemini-1.5-pro',
        '在「模型 API 配置」填好 Base URL + API Key + 模型名',
        '勾选「启用视频理解（多模态 LLM）」',
        '大模型内容改写 / 内容分析 ✅ · 视频链接看视频拿文案 ✅ —— 全用这一个 API',
        '⚠️ 音频/语音链接（如表格「音频文件链接」列）仍需在下方 ASR 配置（LLM 的 chat 接口不支持音频 URL）',
      ],
    },
    {
      name: 'DeepSeek（推荐·便宜）',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      docUrl: 'https://platform.deepseek.com/api-docs/',
      consoleUrl: 'https://platform.deepseek.com/api_keys',
      price: '1元/百万 token（极便宜）',
      steps: [
        '打开「API Keys」控制台：' + 'https://platform.deepseek.com/api_keys',
        '点击「创建 API Key」 → 复制 sk- 开头的密钥',
        '粘贴到左侧「API Key」输入框',
        '模型名：deepseek-chat（默认）',
        '点击「测试连接」验证',
      ],
    },
    {
      name: '火山方舟（豆包 DeepSeek）',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'doubao-seed-1-6-250615（或你的接入点 ID）',
      docUrl: 'https://www.volcengine.com/docs/82379',
      consoleUrl: 'https://console.volcengine.com/ark',
      price: '按 token 计费，看控制台',
      steps: [
        '打开火山方舟控制台：' + 'https://console.volcengine.com/ark',
        '「在线推理」 → 开通 DeepSeek 系列 → 创建「接入点」',
        '复制「接入点 ID」（ep-xxxx 格式，**不是**模型名）',
        '「API Key 管理」 → 创建 API Key',
        '模型名填接入点 ID；点「测试连接」',
      ],
    },
    {
      name: 'OpenAI（GPT-4o-mini）',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      docUrl: 'https://platform.openai.com/docs',
      consoleUrl: 'https://platform.openai.com/api-keys',
      price: '$0.15/百万 token（输入）',
      steps: [
        '打开 OpenAI 控制台：' + 'https://platform.openai.com/api-keys',
        '「Create new secret key」 → 复制 sk- 开头的密钥',
        'Base URL：https://api.openai.com/v1',
        '模型名：gpt-4o-mini（性价比最高）',
        '需要海外网络 + 余额充足',
      ],
    },
    {
      name: 'Groq（Whisper 专用便宜）',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'llama-3.1-70b-versatile',
      docUrl: 'https://console.groq.com/docs',
      consoleUrl: 'https://console.groq.com/keys',
      price: '免费额度大',
      steps: [
        '打开 Groq Console：' + 'https://console.groq.com/keys',
        '「Create API Key」 → 复制 gsk_ 开头的密钥',
        'Base URL：https://api.groq.com/openai/v1',
        'Groq 主打 Llama 模型，速度极快',
      ],
    },
    {
      name: '通义千问（阿里）',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
      docUrl: 'https://help.aliyun.com/zh/model-studio',
      consoleUrl: 'https://bailian.console.aliyun.com/',
      price: '有免费额度',
      steps: [
        '阿里云百炼控制台：' + 'https://bailian.console.aliyun.com/',
        '「API-KEY 管理」 → 创建我的 API-KEY',
        'Base URL：https://dashscope.aliyuncs.com/compatible-mode/v1',
        '模型名：qwen-plus / qwen-turbo',
      ],
    },
  ];
  const asrGuides: ApiGuide[] = [
    {
      name: '⭐ 推荐：硅基流动 SenseVoice（国内·免费·OpenAI 兼容）',
      baseUrl: 'https://api.siliconflow.cn/v1',
      model: 'FunAudioLLM/SenseVoiceSmall',
      docUrl: 'https://docs.siliconflow.cn/',
      consoleUrl: 'https://cloud.siliconflow.cn/account/ak',
      price: '免费额度 · 中文准',
      highlight: true,
      steps: [
        '打开硅基流动：' + 'https://cloud.siliconflow.cn/account/ak',
        '「API 密钥」 → 新建密钥，复制 sk- 开头那串',
        'Base URL：https://api.siliconflow.cn/v1',
        '模型名：FunAudioLLM/SenseVoiceSmall（免费）',
        '音频文件链接（mp3 等直链）即可转写；如遇 CORS 走云端反代 /api/asr/openai',
        '💡 视频链接可免 ASR——到「模型配置」勾选「视频理解」用多模态 LLM 即可',
      ],
    },
    {
      name: 'OpenAI Whisper（推荐）',
      baseUrl: 'https://api.openai.com/v1',
      model: 'whisper-1',
      docUrl: 'https://platform.openai.com/docs/guides/speech-to-text',
      consoleUrl: 'https://platform.openai.com/api-keys',
      price: '$0.006/分钟音频',
      steps: [
        '打开 OpenAI 控制台：' + 'https://platform.openai.com/api-keys',
        '「Create new secret key」 → 复制 sk-',
        'Base URL：https://api.openai.com/v1',
        '模型名：whisper-1（默认）',
        '需要海外网络 + 余额充足',
      ],
    },
    {
      name: 'Groq Whisper（免费额度大）',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'whisper-large-v3',
      docUrl: 'https://console.groq.com/docs/speech-text',
      consoleUrl: 'https://console.groq.com/keys',
      price: '免费（限速）',
      steps: [
        '打开 Groq Console：' + 'https://console.groq.com/keys',
        '「Create API Key」 → 复制 gsk_',
        'Base URL：https://api.groq.com/openai/v1',
        '模型名：whisper-large-v3（最准）',
        '⚠️ 注意：Groq Whisper 文件大小限制 25MB（长音频需切片）',
      ],
    },
    {
      name: '火山方舟 doubao-asr',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'doubao-asr',
      docUrl: 'https://www.volcengine.com/docs/82379/1520757',
      consoleUrl: 'https://console.volcengine.com/ark',
      price: '中文识别准',
      steps: [
        '打开火山方舟：' + 'https://console.volcengine.com/ark',
        '「开通模型」 → 选中 doubao-asr',
        '「API Key 管理」 → 创建 API Key',
        'Base URL：https://ark.cn-beijing.volces.com/api/v3',
        '模型名：doubao-asr',
      ],
    },
  ];
  const guides = kind === 'llm' ? llmGuides : asrGuides;
  return (
    <Modal open={open} onClose={onClose} title={kind === 'llm' ? 'LLM API 配置说明' : 'ASR（语音转文字）配置说明'} subtitle="官方文档 + 申请路径" maxWidth="max-w-4xl">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto scrollbar-thin pr-1">
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
          ⚠️ 本工作台**不内置**任何模型/ASR 服务 — 全部由用户提供 API Key。<br />
          API Key 只保存在你浏览器 localStorage，不上传到任何服务器。
        </div>
        {guides.map((g) => (
          <div
            key={g.name}
            className={`p-4 rounded-xl border ${
              g.highlight ? 'bg-purple-500/10 border-purple-500/40' : 'bg-white/5 border-white/10'
            }`}
          >
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h4 className="text-white font-semibold text-sm flex items-center gap-2">
                {g.name}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-normal">{g.price}</span>
              </h4>
              <div className="flex items-center gap-1.5">
                <a
                  href={g.consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30"
                >
                  控制台 ↗
                </a>
                <a
                  href={g.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30"
                >
                  官方文档 ↗
                </a>
              </div>
            </div>
            <div className="text-[10px] text-white/40 mb-2 font-mono space-y-0.5">
              <div><span className="text-white/50">Base URL:</span> {g.baseUrl}</div>
              <div><span className="text-white/50">Model:</span> {g.model}</div>
            </div>
            <ol className="text-xs text-white/70 space-y-1 list-decimal list-inside">
              {g.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        ))}
        <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-200">
          💡 <strong>通用提示</strong>：<br />
          1. 任何 OpenAI 兼容 API 都可以用（本工作台支持 deepseek/豆包/openai/groq/通义）<br />
          2. 不在上面的服务（如 moonshot/minimax/自建）选「自定义 OpenAI 兼容」填 Base URL + 模型名即可<br />
          3. 配置后必须点「测试连接」才能用，避免生成时报 401
        </div>
      </div>
    </Modal>
  );
};


const LLMConfigPanel: React.FC<{
  llm: LLMConfig;
  onChange: (next: LLMConfig) => void;
  onReset: () => void;
  platform: string;
  onTestSuccess?: () => void;
}> = ({ llm, onChange, onReset, platform, onTestSuccess }) => {
  const [showKey, setShowKey] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const [testedModels, setTestedModels] = useState<string[]>([]);
  const [modelSuggestOpen, setModelSuggestOpen] = useState(false);
  const [llmCollapsed, setLlmCollapsed] = useState(false);

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMessage('正在连接...');
    setTestedModels([]);
    const result = await testLLMConnection(llm);
    if (result.ok) {
      setTestStatus('success');
      setTestMessage(result.message);
      setTestedModels(result.models || []);
      onTestSuccess?.();
    } else {
      setTestStatus('error');
      setTestMessage(result.message);
    }
  };

  // 状态徽章
  const statusBadge = (() => {
    switch (testStatus) {
      case 'testing':
        return (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <Loader2 className="w-3 h-3 animate-spin" /> 验证中
          </span>
        );
      case 'success':
        return (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> 已连接
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <AlertCircle className="w-3 h-3" /> 连接失败
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/40 border border-white/10">
            未验证
          </span>
        );
    }
  })();

  return (
    <GlassCard hoverable={false} className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setLlmCollapsed((v) => !v)}
          className="flex items-center gap-2 text-white font-semibold text-sm hover:text-white/90"
        >
          {llmCollapsed ? (
            <ChevronRight className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/40" />
          )}
          <Key className="w-4 h-4 text-purple-400" /> 模型 API 配置
          <span className="text-[10px] text-white/40">（全局共享 · 一次配置所有平台都能用）</span>
          {statusBadge}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            className="text-[10px] text-white/40 hover:text-white flex items-center gap-0.5"
            title="查看配置说明"
          >
            <HelpCircle className="w-3 h-3" /> 配置说明
          </button>
          <button onClick={onReset} className="text-[10px] text-white/40 hover:text-white">
            重置默认
          </button>
        </div>
      </div>

      {!llmCollapsed && (
        <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-white/50">提供商</label>
          <select
            value={llm.provider}
            onChange={(e) => {
              const newProvider = e.target.value;
              // 切换提供商时自动填 Base URL + 默认模型名 + 测试状态重置
              const presets: Record<string, { baseUrl: string; modelName: string }> = {
                deepseek: { baseUrl: 'https://api.deepseek.com/v1', modelName: 'deepseek-chat' },
                openai: { baseUrl: 'https://api.openai.com/v1', modelName: 'gpt-4o-mini' },
                doubao: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', modelName: 'doubao-seed-1-6-250615' },
                qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', modelName: 'qwen-plus' },
                custom: { baseUrl: llm.baseUrl || '', modelName: llm.modelName || '' },
              };
              const preset = presets[newProvider];
              onChange({
                ...llm,
                provider: newProvider,
                baseUrl: preset?.baseUrl ?? llm.baseUrl,
                modelName: preset?.modelName ?? llm.modelName,
              });
              setTestStatus('idle');
            }}
            className="w-full mt-1 h-9 px-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
          >
            <option value="deepseek">DeepSeek（推荐·便宜）</option>
            <option value="openai">OpenAI</option>
            <option value="doubao">豆包（火山引擎）</option>
            <option value="qwen">通义千问</option>
            <option value="custom">自定义 OpenAI 兼容（火山方舟/任意代理）</option>
          </select>
        </div>
        <div className="relative">
          <label className="text-xs text-white/50 flex items-center justify-between">
            <span>模型名</span>
            {testedModels.length > 0 && (
              <button
                onClick={() => setModelSuggestOpen((v) => !v)}
                className="text-[10px] text-emerald-300 hover:text-emerald-200"
              >
                {modelSuggestOpen ? '收起' : `查看 ${testedModels.length} 个可用模型`}
              </button>
            )}
          </label>
          <input
            type="text"
            value={llm.modelName}
            onChange={(e) => {
              onChange({ ...llm, modelName: e.target.value });
              setTestStatus('idle');
            }}
            placeholder="deepseek-chat / gpt-4o-mini / doubao-pro-32k ..."
            className="w-full mt-1 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
          />
          {modelSuggestOpen && testedModels.length > 0 && (
            <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-slate-900 border border-white/10 rounded-lg shadow-xl p-1 scrollbar-thin">
              {testedModels.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    onChange({ ...llm, modelName: m });
                    setModelSuggestOpen(false);
                  }}
                  className={`w-full text-left px-2 py-1 rounded text-xs hover:bg-purple-500/20 ${
                    llm.modelName === m ? 'bg-purple-500/15 text-purple-200' : 'text-white/70'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          {/* 常用模型 quick-pick（特别是多模态模型） */}
          {(() => {
            const quickPicks: Record<string, { name: string; vision?: boolean; hint?: string }[]> = {
              deepseek: [
                { name: 'deepseek-chat', hint: 'V3 平衡版' },
                { name: 'deepseek-reasoner', hint: 'R1 深度思考' },
              ],
              openai: [
                { name: 'gpt-4o-mini', hint: '便宜多模态' },
                { name: 'gpt-4o', vision: true, hint: '强多模态' },
                { name: 'gpt-4-vision-preview', vision: true, hint: '视觉版' },
              ],
              doubao: [
                { name: 'doubao-seed-1-6-250615', vision: true, hint: 'Seed 1.6（推荐·多模态极速版）' },
                { name: 'doubao-seed-1-6-vision-250615', vision: true, hint: 'Seed 1.6 视觉版' },
                { name: 'doubao-1-5-thinking-pro-250415', hint: '深度思考' },
                { name: 'doubao-pro-32k', hint: '文本 32K 上下文' },
              ],
              qwen: [
                { name: 'qwen-vl-max', vision: true, hint: '多模态旗舰' },
                { name: 'qwen2.5-vl-72b-instruct', vision: true, hint: '开源多模态 72B' },
                { name: 'qwen-plus', hint: '通用 Plus' },
                { name: 'qwen-turbo', hint: '便宜 Turbo' },
              ],
              custom: [],
            };
            const list = quickPicks[llm.provider] || [];
            if (list.length === 0) return null;
            return (
              <div className="mt-1.5 flex flex-wrap gap-1">
                <span className="text-[10px] text-white/40 self-center mr-1">📋 常用：</span>
                {list.map((m) => (
                  <button
                    key={m.name}
                    onClick={() => onChange({ ...llm, modelName: m.name })}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      llm.modelName === m.name
                        ? 'bg-purple-500/30 border-purple-500/50 text-purple-100'
                        : m.vision
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/20'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                    title={m.hint}
                  >
                    {m.vision && '👁️ '}
                    {m.name}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-white/50">Base URL（OpenAI 兼容）</label>
          <input
            type="text"
            value={llm.baseUrl}
            onChange={(e) => {
              onChange({ ...llm, baseUrl: e.target.value });
              setTestStatus('idle');
            }}
            placeholder="https://api.deepseek.com/v1"
            className="w-full mt-1 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white font-mono"
          />
          <p className="mt-1 text-[10px] text-white/30">
            💡 火山方舟：<span className="text-amber-300 font-mono">https://ark.cn-beijing.volces.com/api/v3</span>（不带 /chat/completions 或 /responses，自动探测）
            <br />
            ⚙️ 也支持 OpenAI / DeepSeek / 千问 / 自定义 OpenAI 兼容端点
          </p>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-white/50 flex items-center justify-between">
            <span>API Key</span>
            <button
              onClick={() => setShowKey((v) => !v)}
              className="text-[10px] text-white/40 hover:text-white"
            >
              {showKey ? '隐藏' : '显示'}
            </button>
          </label>
          <input
            type={showKey ? 'text' : 'password'}
            value={llm.apiKey}
            onChange={(e) => {
              onChange({ ...llm, apiKey: e.target.value });
              setTestStatus('idle');
            }}
            placeholder="sk-..."
            className="w-full mt-1 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white font-mono"
          />
        </div>
        <div>
          <label className="text-xs text-white/50">温度（0-1）</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={llm.temperature}
            onChange={(e) => onChange({ ...llm, temperature: parseFloat(e.target.value) || 0.7 })}
            className="w-full mt-1 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-xs text-white/50">最大输出 Token</label>
          <input
            type="number"
            min={256}
            max={8192}
            value={llm.maxTokens}
            onChange={(e) => onChange({ ...llm, maxTokens: parseInt(e.target.value) || 2048 })}
            className="w-full mt-1 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
          />
        </div>
      </div>

      {/* 多模态视频理解开关 */}
      <div className="mt-3 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!llm.useVideoUnderstanding}
            onChange={(e) => onChange({ ...llm, useVideoUnderstanding: e.target.checked })}
            className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
          />
          <div className="flex-1">
            <div className="text-sm text-white flex items-center gap-2">
              <Video className="w-3.5 h-3.5 text-purple-300" /> 启用视频理解（多模态 LLM）
            </div>
            <p className="text-[10px] text-white/50 mt-1 leading-relaxed">
              开启后，任务里的<strong>视频链接</strong>会直接喂给多模态 LLM 看视频拿文案，无需 ASR。
              <strong className="text-purple-300">音频/语音链接（如表格「音频文件链接」列）请用下方 ASR 转写</strong>——
              LLM 的 chat 接口不支持音频 URL 输入。
            </p>
            <p className="text-[10px] text-white/40 mt-1">
              ⚠️ 当前模型需支持视频输入：<code className="bg-white/10 px-1 rounded">doubao-seed-1-6</code> /{' '}
              <code className="bg-white/10 px-1 rounded">doubao-seed-1-6-vision</code> /{' '}
              <code className="bg-white/10 px-1 rounded">gpt-4o</code> /{' '}
              <code className="bg-white/10 px-1 rounded">gemini-1.5-pro</code> 等。
              DeepSeek <code className="bg-white/10 px-1 rounded">deepseek-chat</code> /{' '}
              <code className="bg-white/10 px-1 rounded">deepseek-reasoner</code> <strong>不支持</strong>视频输入。
            </p>
          </div>
        </label>
      </div>

      {/* 测试连接按钮 */}
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button
          onClick={handleTest}
          disabled={testStatus === 'testing' || !llm.apiKey || !llm.baseUrl}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
        >
          {testStatus === 'testing' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> 正在连接...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" /> 测试连接
            </>
          )}
        </button>
        {testMessage && (
          <span
            className={`text-xs flex items-start gap-1 whitespace-pre-wrap max-w-2xl ${
              testStatus === 'success'
                ? 'text-emerald-300'
                : testStatus === 'error'
                ? 'text-rose-300'
                : 'text-white/50'
            }`}
          >
            {testMessage}
          </span>
        )}
      </div>

      <p className="mt-3 text-[10px] text-white/40">
        💡 API Key 仅保存在你浏览器的 localStorage，不会上传到任何服务器。
        <br />
        ⚠️ 必须先「测试连接」成功后才能生成二创内容（确保 API 可用，避免 401/404 错误）
      </p>
      </>
      )}

      {/* 配置说明 Modal */}
      <ApiHelpModal open={showHelp} onClose={() => setShowHelp(false)} kind="llm" />
    </GlassCard>
  );
};

export { LLMConfigPanel, ASRConfigPanel, ApiHelpModal };

