// 通用折叠段：带编号 + 标题 + 折叠箭头
// 给"多种方式"页面用：方式一 / 方式二 这种并列展示
import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  number: number;            // 编号（1 / 2 / 3...）
  title: string;             // 段标题
  defaultOpen?: boolean;     // 默认展开
  accent?: 'purple' | 'cyan'; // 角标渐变
  children: React.ReactNode;
}

const ACCENT_BG: Record<NonNullable<Props['accent']>, string> = {
  purple: 'from-purple-500 to-indigo-500',
  cyan: 'from-cyan-500 to-blue-500',
};

// 中文数字 1-10，避免"方式1"在窄圆里折行
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const CollapsibleSection: React.FC<Props> = ({
  number,
  title,
  defaultOpen = true,
  accent = 'purple',
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <span
          className={`shrink-0 w-7 h-7 rounded-full bg-gradient-to-br ${ACCENT_BG[accent]} text-white text-sm font-semibold flex items-center justify-center`}
        >
          {CN_NUM[number - 1] || number}
        </span>
        <span className="text-white text-sm font-medium flex-1 truncate">{title}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-white/40 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/40 shrink-0" />
        )}
      </button>
      {open && <div className="px-4 pb-4 pt-3 border-t border-white/5">{children}</div>}
    </div>
  );
};

export default CollapsibleSection;
