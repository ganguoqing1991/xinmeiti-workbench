import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface CoverWithFallbackProps {
  url: string;
  title: string;
  coverColor: string;
}

// 封面渲染：img 加载失败时自动回退到渐变色 + 错误图标
const CoverWithFallback: React.FC<CoverWithFallbackProps> = ({ url, title, coverColor }) => {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div
        className={`w-full h-full bg-gradient-to-br ${coverColor} flex flex-col items-center justify-center`}
        title={`图片加载失败：${url.slice(0, 60)}${url.length > 60 ? '...' : ''}`}
      >
        <ImageOff className="w-6 h-6 text-white/40 mb-0.5" />
        <span className="text-[9px] text-white/40 px-1 truncate max-w-full">加载失败</span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={title}
      className="w-full h-full object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
    />
  );
};

export default CoverWithFallback;