// LLM 调用（流式 + 降级）—— 从 Reprocess 抽出的共享模块，供二创生成与 API 测试共用
import type { LLMConfig } from './llmConfig';

// ===== LLM 调用（流式 + 降级）=====
// 自动选择端点：baseUrl 显式 /responses → responses；显式 /chat/completions → chat；否则先 chat 后 responses
async function callLLMStream(
  cfg: LLMConfig,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  onChunk: (chunk: string) => void,
  onProgress: (msg: string) => void
): Promise<string> {
  onProgress('正在请求模型...');
  let baseUrl = cfg.baseUrl.replace(/\/+$/, '');
  let preferred: 'chat' | 'responses' | null = null;
  if (/\/chat\/completions$/.test(baseUrl)) {
    preferred = 'chat';
    baseUrl = baseUrl.replace(/\/chat\/completions$/, '');
  } else if (/\/responses$/.test(baseUrl)) {
    preferred = 'responses';
    baseUrl = baseUrl.replace(/\/responses$/, '');
  }
  const endpoints: Array<'responses' | 'chat'> =
    preferred === 'chat' ? ['chat', 'responses'] : ['responses', 'chat'];

  for (const ep of endpoints) {
    try {
      const result = await callSingle(cfg, baseUrl, ep, messages, onChunk, onProgress);
      return result;
    } catch (e: any) {
      // 网络/401 → 不再尝试下一个
      if (/HTTP 401|HTTP 403|TypeError|Failed to fetch/i.test(String(e?.message))) {
        throw e;
      }
      // 否则继续尝试下一个端点
      onProgress(`${ep} 端点失败：${e?.message?.slice(0, 120)} · 尝试下一个`);
    }
  }
  throw new Error('所有端点都失败，请检查 Base URL + 模型名 + API Key');
}

// 单端点调用（流式 + 降级到非流式）
async function callSingle(
  cfg: LLMConfig,
  baseUrl: string,
  endpoint: 'chat' | 'responses',
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  onChunk: (chunk: string) => void,
  onProgress: (msg: string) => void
): Promise<string> {
  const url = `${baseUrl}/${endpoint === 'chat' ? 'chat/completions' : 'responses'}`;
  // Responses API 接受 system + user 一起作为 input 数组
  const body =
    endpoint === 'chat'
      ? {
          model: cfg.modelName,
          messages,
          temperature: cfg.temperature,
          max_tokens: cfg.maxTokens,
          stream: true,
        }
      : {
          model: cfg.modelName,
          input: messages
            .filter((m) => m.role !== 'assistant')
            .map((m) => ({
              role: m.role,
              content: [{ type: 'input_text', text: m.content }],
            })),
          temperature: cfg.temperature,
          max_output_tokens: cfg.maxTokens,
          stream: true,
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
    throw new Error(`网络错误：${e?.message || '未知'}`);
  }
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} · ${errText.slice(0, 200)}`);
  }
  onProgress(`正在接收 ${endpoint} 流式响应...`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // 处理 SSE：可能格式是 "data: {...}" 或 "event: xxx\ndata: {...}\n\n"
    // 火山方舟 Responses API 也会发 "event: response.output_text.delta" 之类
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      // 跳过 event: / 空行 / 注释
      if (!trimmed || trimmed.startsWith('event:') || trimmed.startsWith(':')) continue;
      const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
      if (payload === '[DONE]') break;
      try {
        const obj = JSON.parse(payload);
        // 只认「增量事件」，否则全文快照会被再追加一次 → 输出重复两遍
        // 1. Chat API 流：{ choices: [{ delta: { content: "..." } }] }（增量）
        // 2. Responses API 流：{ type: "response.output_text.delta", delta: "..." }（增量）
        let delta = '';
        if (typeof obj?.choices?.[0]?.delta?.content === 'string') {
          delta = obj.choices[0].delta.content;
        } else if (obj?.type === 'response.output_text.delta' && typeof obj?.delta === 'string') {
          delta = obj.delta;
        } else if (typeof obj?.delta?.text === 'string' && obj?.type && /delta/i.test(obj.type)) {
          delta = obj.delta.text;
        }
        if (delta) {
          full += delta;
          onChunk(delta);
          continue;
        }
        // 完整快照事件（不作为增量追加，仅在之前完全没收到增量时兜底用一次）：
        // - Chat 非流：choices[0].message.content
        // - Responses 完成：response.completed / output_text.done → output_text / output[].content[].text / text
        const snapshot: string =
          (typeof obj?.choices?.[0]?.message?.content === 'string' ? obj.choices[0].message.content : '') ||
          (typeof obj?.output_text === 'string' ? obj.output_text : '') ||
          (typeof obj?.output?.[0]?.content?.[0]?.text === 'string' ? obj.output[0].content[0].text : '') ||
          (typeof obj?.text === 'string' && obj?.type && /done|completed/i.test(String(obj.type)) ? obj.text : '') ||
          '';
        if (snapshot && !full) {
          full = snapshot;
          onChunk(snapshot);
        }
      } catch {
        /* ignore partial */
      }
    }
  }
  if (!full) {
    // 非流式 fallback
    onProgress(`${endpoint} 端点尝试非流式调用...`);
    const body2 =
      endpoint === 'chat'
        ? { model: cfg.modelName, messages, temperature: cfg.temperature, max_tokens: cfg.maxTokens, stream: false }
        : {
            model: cfg.modelName,
            input: messages
              .filter((m) => m.role !== 'assistant')
              .map((m) => ({
                role: m.role,
                content: [{ type: 'input_text', text: m.content }],
              })),
            temperature: cfg.temperature,
            max_output_tokens: cfg.maxTokens,
          };
    const r2 = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body2),
    });
    if (!r2.ok) {
      const t = await r2.text().catch(() => '');
      throw new Error(`HTTP ${r2.status} · ${t.slice(0, 200)}`);
    }
    const j = await r2.json();
    full =
      j.choices?.[0]?.message?.content ||
      j.output?.[0]?.content?.[0]?.text ||
      '';
    onChunk(full);
  }
  return full;
}

export { callLLMStream };

