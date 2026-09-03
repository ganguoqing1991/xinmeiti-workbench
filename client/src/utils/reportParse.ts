// 复盘报告 JSON 容错解析（原在 components/GrowthReport.tsx，抽出以便「今日待办·个人板块」复用）
// 解析容错思路与 hotspotStore 同一套：去围栏 → 整段解析 → 截取 {...} → 逐个 {} 兜底

export interface ReportMetrics {
  label: string;
  value: string;
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
}
export interface ReportAction {
  title: string;
  priority?: 'high' | 'mid' | 'low';
  expect?: string;
}
export interface ReportData {
  headline: string;
  score: number | null;
  metrics: ReportMetrics[];
  highlights: string[];
  risks: string[];
  actions: ReportAction[];
  focus_progress: string;
  reflection_response: string;
  direction: string;
}

function stripFence(raw: string): string {
  let text = String(raw || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  return text;
}

function extractObj(raw: string): any | null {
  const text = stripFence(raw);
  try {
    const v = JSON.parse(text);
    if (Array.isArray(v)) return v[0] && typeof v[0] === 'object' ? v[0] : null;
    if (v && typeof v === 'object') return v;
  } catch {
    /* 落到兜底 */
  }
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s !== -1 && e > s) {
    try {
      return JSON.parse(text.slice(s, e + 1));
    } catch {
      /* 落到兜底 */
    }
  }
  const objs = text.match(/\{[^{}]*\}/g) || [];
  for (const o of objs) {
    try {
      return JSON.parse(o);
    } catch {
      /* 继续 */
    }
  }
  return null;
}

const str = (v: any) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const arr = (v: any) => (Array.isArray(v) ? v : []);

export function parseReport(raw: string): ReportData | null {
  const o = extractObj(raw);
  if (!o) return null;
  const scoreRaw = Number(o.score);
  const data: ReportData = {
    headline: str(o.headline),
    score: Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : null,
    metrics: arr(o.metrics)
      .map((m: any) => ({
        label: str(m?.label),
        value: str(m?.value),
        delta: str(m?.delta),
        trend: (['up', 'down', 'flat'].includes(str(m?.trend)) ? str(m?.trend) : 'flat') as ReportMetrics['trend'],
      }))
      .filter((m: ReportMetrics) => m.label || m.value),
    highlights: arr(o.highlights).map(str).filter(Boolean),
    risks: arr(o.risks).map(str).filter(Boolean),
    actions: arr(o.actions)
      .map((a: any) => ({
        title: str(a?.title),
        priority: (['high', 'mid', 'low'].includes(str(a?.priority)) ? str(a?.priority) : 'mid') as ReportAction['priority'],
        expect: str(a?.expect),
      }))
      .filter((a: ReportAction) => a.title),
    focus_progress: str(o.focus_progress),
    reflection_response: str(o.reflection_response),
    direction: str(o.direction),
  };
  // 至少要有一项可用内容才认作结构化报告
  const usable =
    !!data.headline || data.score !== null || data.metrics.length > 0 ||
    data.highlights.length > 0 || data.risks.length > 0 || data.actions.length > 0;
  return usable ? data : null;
}
