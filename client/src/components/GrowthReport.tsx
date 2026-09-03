// 复盘报告渲染：AI 输出结构化 JSON → 卡片流；解析失败自动降级为纯文本
// 解析容错与 hotspotStore 同一套思路：去围栏 → 整段解析 → 截取 {...} → 逐个 {} 兜底

import React, { useState } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle2, Target, MessageSquareQuote, Compass, Copy, FileText } from 'lucide-react';
import { parseReport } from '../utils/reportParse';

const TREND_CLS: Record<string, string> = {
  up: 'text-emerald-400',
  down: 'text-rose-400',
  flat: 'text-white/40',
};
const PRIORITY: Record<string, { label: string; cls: string }> = {
  high: { label: '高', cls: 'bg-rose-500/20 text-rose-300' },
  mid: { label: '中', cls: 'bg-amber-500/20 text-amber-300' },
  low: { label: '低', cls: 'bg-white/10 text-white/50' },
};

function ScoreRing({ score }: { score: number }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg width="56" height="56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5" />
        <circle
          cx="28" cy="28" r={r} fill="none" stroke="#10B981" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm">{score}</span>
    </div>
  );
}

const GrowthReport: React.FC<{
  raw: string;
  streaming: boolean;
  title: string;
  onToast?: (msg: string) => void;
}> = ({ raw, streaming, title, onToast }) => {
  const [showRaw, setShowRaw] = useState(false);
  const data = streaming ? null : parseReport(raw);

  if (!data) {
    return (
      <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
        {raw}
        {streaming && <span className="inline-block w-2 h-4 ml-0.5 bg-fuchsia-400 animate-pulse align-middle" />}
        {!streaming && raw.trim() && (
          <p className="mt-3 text-[10px] text-white/30">
            AI 这次没有返回结构化数据，已按原文展示。点「重新生成」通常能拿到卡片版。
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 总评 */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
        {data.score !== null && <ScoreRing score={data.score} />}
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm mb-1">{title}</p>
          {data.headline && <p className="text-sm text-white/70 leading-relaxed">{data.headline}</p>}
        </div>
      </div>

      {/* 指标 */}
      {data.metrics.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {data.metrics.map((m, i) => (
            <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/10">
              <p className="text-[10px] text-white/50 mb-1 truncate">{m.label}</p>
              <p className="text-white font-bold text-lg leading-none">{m.value}</p>
              {m.delta && (
                <p className={`text-[10px] mt-1.5 ${TREND_CLS[m.trend || 'flat']}`}>
                  {m.trend === 'up' ? '↑ ' : m.trend === 'down' ? '↓ ' : ''}{m.delta}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 亮点 / 风险 */}
      {(data.highlights.length > 0 || data.risks.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.highlights.length > 0 && (
            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
              <p className="text-xs font-medium text-emerald-300 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> 做得好的
              </p>
              <div className="space-y-1.5">
                {data.highlights.map((h, i) => (
                  <p key={i} className="text-xs text-white/75 leading-relaxed">· {h}</p>
                ))}
              </div>
            </div>
          )}
          {data.risks.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <p className="text-xs font-medium text-amber-300 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> 要注意的
              </p>
              <div className="space-y-1.5">
                {data.risks.map((h, i) => (
                  <p key={i} className="text-xs text-white/75 leading-relaxed">· {h}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 行动清单 */}
      {data.actions.length > 0 && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <p className="text-white font-medium text-xs mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-fuchsia-400" /> 下一步行动
          </p>
          <div className="space-y-2.5">
            {data.actions.map((a, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${PRIORITY[a.priority || 'mid'].cls}`}>
                  {PRIORITY[a.priority || 'mid'].label}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-white">{a.title}</p>
                  {a.expect && <p className="text-[10px] text-white/40 mt-0.5">{a.expect}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 攻坚进度 */}
      {data.focus_progress && (
        <div className="p-3.5 rounded-xl bg-cyan-500/5 border border-cyan-500/20 flex items-start gap-2.5">
          <Target className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] text-cyan-300/70 mb-0.5">攻坚项进度</p>
            <p className="text-xs text-white/80 leading-relaxed">{data.focus_progress}</p>
          </div>
        </div>
      )}

      {/* 回你的感悟 */}
      {data.reflection_response && (
        <div className="p-4 rounded-xl bg-fuchsia-500/5 border border-fuchsia-500/20">
          <p className="text-xs font-medium text-fuchsia-300 mb-2 flex items-center gap-1.5">
            <MessageSquareQuote className="w-3.5 h-3.5" /> 回你的感悟
          </p>
          <p className="text-xs text-white/75 leading-relaxed">{data.reflection_response}</p>
        </div>
      )}

      {/* 团队方向（管理员） */}
      {data.direction && (
        <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20">
          <p className="text-xs font-medium text-purple-300 mb-2 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5" /> 团队该补的方向
          </p>
          <p className="text-xs text-white/75 leading-relaxed whitespace-pre-wrap">{data.direction}</p>
        </div>
      )}

      {/* 原文 / 复制 */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="text-[10px] text-white/40 hover:text-white/70 flex items-center gap-1"
        >
          <FileText className="w-3 h-3" /> {showRaw ? '收起原文' : '查看原文'}
        </button>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(raw).then(
              () => onToast?.('报告已复制'),
              () => onToast?.('复制失败，请手动选中复制')
            );
          }}
          className="text-[10px] text-white/40 hover:text-white/70 flex items-center gap-1"
        >
          <Copy className="w-3 h-3" /> 复制全文
        </button>
      </div>
      {showRaw && (
        <pre className="text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap p-3 rounded-lg bg-black/20 border border-white/5 max-h-64 overflow-y-auto scrollbar-thin">
          {raw}
        </pre>
      )}
    </div>
  );
};

export default GrowthReport;
