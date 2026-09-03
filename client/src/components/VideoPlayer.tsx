// 视频播放器（共享组件）
// 智能识别链接类型：
//   - 网页链接（douyin/xiaohongshu/bilibili/kuaishou）→ 友好提示 + 自动解析按钮
//   - HLS 流（.m3u8）→ 提示 + 跳原网页
//   - 真实直链（.mp4）→ HTML5 video 直接播放
//   - 加载失败 → 错误状态 + 跳原网页
//
// 集成自动解析：网页链接可一键调公共解析服务（corsproxy.io + douyin.wtf）提取 mp4 直链

import React, { useState } from 'react';
import {
  Film,
  AlertCircle,
  Loader2,
  Wand2,
  CheckCircle2,
  Copy,
  ExternalLink,
} from 'lucide-react';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  onError?: () => void;
  // 自动解析成功回调（让父组件把视频直链写回到笔记的 videoUrl 字段）
  onParsed?: (parsed: { url: string; cover?: string; title?: string }) => void;
  // 复制提示回调（让父组件统一弹 toast）
  onCopy?: (text: string) => void;
  // 解析失败提示回调
  onParseError?: (msg: string) => void;
}

const isWebPageLink = (url: string) => {
  if (/douyin\.com\/video\//i.test(url)) return 'douyin';
  if (/xiaohongshu\.com\/discovery\/item/i.test(url)) return 'xiaohongshu';
  if (/xiaohongshu\.com\/explore/i.test(url)) return 'xiaohongshu';
  if (/xhslink\.com\//i.test(url)) return 'xiaohongshu';
  if (/bilibili\.com\/video\//i.test(url)) return 'bilibili';
  if (/kuaishou\.com\//i.test(url)) return 'kuaishou';
  return null;
};

const isHls = (url: string) => /\.m3u8(\?|$)/i.test(url);

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, poster, onError, onParsed, onCopy, onParseError }) => {
  const [loadFailed, setLoadFailed] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsedUrl, setParsedUrl] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const pageType = isWebPageLink(src);
  const hlsUrl = isHls(src);

  const handleAutoParse = async () => {
    setParsing(true);
    setParseError(null);
    try {
      const { parseVideoUrl } = await import('../utils/videoParser');
      const result = await parseVideoUrl(src);
      setParsedUrl(result.url);
      onParsed?.(result);
    } catch (e: any) {
      const msg = e?.message || '解析失败';
      setParseError(msg);
      onParseError?.(msg);
    } finally {
      setParsing(false);
    }
  };

  // 网页链接：友好提示 + 自动解析按钮
  if (pageType) {
    const platformName: Record<string, string> = {
      douyin: '抖音',
      xiaohongshu: '小红书',
      bilibili: 'B 站',
      kuaishou: '快手',
    };
    return (
      <div className="aspect-video flex flex-col items-center justify-center text-white/70 text-sm gap-3 bg-gradient-to-br from-slate-800 to-slate-900 p-6">
        <Film className="w-14 h-14 text-white/30" />
        <p className="text-base font-medium text-white">
          {platformName[pageType]}网页链接无法直接播放
        </p>
        <p className="text-xs text-white/40 max-w-md text-center leading-relaxed">
          该 URL 是 {platformName[pageType]}的网页链接（含防盗链/签名），HTML5 视频标签无法直接播放。<br />
          点击下方「自动解析」按钮，工作台会调公共解析服务提取真实 .mp4 视频直链。
        </p>

        {parsedUrl && (
          <div className="w-full max-w-lg p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-2">
            <div className="text-xs text-emerald-300 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> 解析成功
            </div>
            <div className="text-[10px] text-white/40 break-all font-mono max-h-16 overflow-y-auto scrollbar-thin">
              {parsedUrl}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(parsedUrl);
                  onCopy?.('已复制真实视频直链');
                }}
                className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/80 hover:bg-white/20 flex items-center gap-0.5"
              >
                <Copy className="w-3 h-3" /> 复制 URL
              </button>
              {onParsed && (
                <span className="text-[10px] text-emerald-300">✓ 已自动回填到笔记的「视频链接」字段</span>
              )}
            </div>
          </div>
        )}

        {parseError && (
          <div className="w-full max-w-lg p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
            <div className="text-xs text-rose-300 font-medium flex items-center gap-1.5 mb-1">
              <AlertCircle className="w-3.5 h-3.5" /> 解析失败
            </div>
            <pre className="text-[10px] text-white/60 whitespace-pre-wrap text-left">{parseError}</pre>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap justify-center">
          <button
            onClick={handleAutoParse}
            disabled={parsing}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {parsing ? '正在解析...' : parsedUrl ? '重新解析' : '自动解析为 mp4'}
          </button>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-sm font-medium flex items-center gap-1.5"
          >
            <ExternalLink className="w-4 h-4" /> 在浏览器打开原网页
          </a>
        </div>
        <p className="text-[10px] text-white/30 mt-2">
          💡 解析服务：<code className="bg-white/5 px-1 rounded">corsproxy.io</code> +
          <code className="bg-white/5 px-1 rounded">douyin.wtf</code> /
          <code className="bg-white/5 px-1 rounded">iesdouyin</code>（失败可手动去
          <a href="https://douyin.wtf" target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:underline ml-1">douyin.wtf</a> 解析）
        </p>
      </div>
    );
  }

  // HLS 流
  if (hlsUrl) {
    return (
      <div className="aspect-video flex flex-col items-center justify-center text-white/70 text-sm gap-3 bg-slate-900 p-6">
        <Film className="w-14 h-14 text-white/30" />
        <p className="text-base font-medium text-white">该链接是 HLS 流（.m3u8）</p>
        <p className="text-xs text-white/40 max-w-md text-center">
          浏览器原生 video 不支持 HLS，需要集成 hls.js。本工作台暂未启用 HLS 支持。
        </p>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-medium flex items-center gap-1.5"
        >
          <ExternalLink className="w-4 h-4" /> 在浏览器打开源链接
        </a>
      </div>
    );
  }

  // 真实直链
  return (
    <>
      {loadFailed ? (
        <div className="aspect-video flex flex-col items-center justify-center text-white/70 text-sm gap-2 bg-slate-900 p-6">
          <AlertCircle className="w-14 h-14 text-rose-400" />
          <p className="text-base font-medium text-white">视频加载失败</p>
          <p className="text-xs text-white/40 max-w-md text-center">
            该链接可能不是直链，或者服务器拒绝访问（防盗链/CORS）。
          </p>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-medium flex items-center gap-1.5"
          >
            <ExternalLink className="w-4 h-4" /> 尝试在浏览器打开
          </a>
        </div>
      ) : (
        <video
          src={src}
          controls
          autoPlay
          playsInline
          preload="metadata"
          poster={poster}
          className="w-full max-h-[60vh] object-contain bg-black"
          onError={() => {
            console.error('[VideoPlayer] 加载失败', src);
            setLoadFailed(true);
            onError?.();
          }}
        />
      )}
    </>
  );
};

export default VideoPlayer;
