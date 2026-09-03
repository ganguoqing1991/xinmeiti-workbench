// 浏览器取数指引：放在各平台数据导入区
//
// 说明：工作台是纯前端网页，网页里的 JS 不能启动本机程序（浏览器安全边界），
// 所以本页做不出「一键抓取」按钮。真正的链路是：AI 通过本机的 bsk 工具操作用户
// 已登录的浏览器取数，整理成表格后，再回到这里上传。
// 这块指引的作用就是把这个流程讲清楚，让团队知道有这条路。

import React, { useState } from 'react';
import { Globe, ChevronDown, ChevronUp, Copy, Check, AlertTriangle, Monitor } from 'lucide-react';
import GlassCard from './GlassCard';

type GuidePlatform = 'xiaohongshu' | 'douyin' | 'live';

const PLATFORM_NAME: Record<GuidePlatform, string> = {
  xiaohongshu: '小红书',
  douyin: '抖音',
  live: '直播',
};

/** 给 AI 的示例指令，用户可直接复制 */
const EXAMPLE_PROMPT: Record<GuidePlatform, string> = {
  xiaohongshu: '帮我用浏览器抓取「XX教育」小红书账号最近 30 篇笔记，整理成可以直接导入的表格，字段包含：标题、发布时间、点赞、收藏、评论、分享',
  douyin: '帮我用浏览器抓取「XX教育」抖音账号最近 30 条视频，整理成可以直接导入的表格，字段包含：标题、发布时间、播放、点赞、评论、收藏、分享',
  live: '帮我用浏览器抓取「XX教育」直播账号最近 8 场直播的数据，整理成可以直接导入的表格，字段包含：场次名称、日期、场观、平均在线、新增关注、加微数',
};

const EXTENSION_LINKS = [
  { name: 'Chrome', url: 'https://chromewebstore.google.com/detail/hhcmgoofomhgciiibhipgmgkgnoenaoi' },
  { name: 'Edge', url: 'https://microsoftedge.microsoft.com/addons/detail/browserskill/emacgiaaaiojkkpkddmmdfhmokgmnikg' },
];

const BrowserFetchGuide: React.FC<{
  platform: GuidePlatform;
  /** bare=true 时只渲染正文（不带头部按钮/卡片），由外层 CollapsibleSection 包裹 */
  bare?: boolean;
  defaultOpen?: boolean;
}> = ({ platform, bare = false, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(EXAMPLE_PROMPT[platform]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 复制失败时用户可手动选中 */
    }
  };

  const body = (
    <div className="space-y-3">
      {/* 为什么这里没有按钮 */}
      <div className="p-2.5 rounded-lg bg-white/5">
        <p className="text-[11px] text-white/60 leading-relaxed">
          这一页<b className="text-white">做不出「一键抓取」的按钮</b>——工作台是网页，网页不能启动你电脑上的程序（浏览器的安全限制）。
          实际做法是：让 AI 通过本机的取数工具操作你已登录的浏览器，把数据抓下来整理成表格，你再回到本页上传。
        </p>
      </div>

      {/* 前置条件 */}
      <div>
        <p className="text-[11px] text-white/70 font-medium mb-1.5 flex items-center gap-1.5">
          <Monitor className="w-3.5 h-3.5 text-cyan-400" /> 首次使用要准备的五样
        </p>
        <div className="space-y-1 text-[11px] text-white/50">
          <p>1. 能执行系统命令的 AI 客户端（WorkBuddy、Cursor、Claude Code、Codex 任意一个）</p>
          <p>2. 本机装一次取数命令行工具（<code className="font-mono text-white/60">bsk</code>），换电脑要重装</p>
          <p>
            3. 浏览器装一次扩展并保持启用：
            {EXTENSION_LINKS.map((b, i) => (
              <span key={b.name}>
                {i > 0 && ' / '}
                <a href={b.url} target="_blank" rel="noreferrer" className="text-cyan-300/80 hover:text-cyan-300 underline">{b.name}</a>
              </span>
            ))}
            ，装完点开弹窗等它变绿
          </p>
          <p>4. 浏览器里保持登录{PLATFORM_NAME[platform]}账号（复用你的登录态，不用额外测试账号）</p>
          <p>5. 取数时浏览器要开着——工具是借用你的标签页工作的</p>
        </div>
      </div>

      {/* 怎么开口 */}
      <div>
        <p className="text-[11px] text-white/70 font-medium mb-1.5">怎么跟 AI 说</p>
        <div className="flex items-start gap-2">
          <code className="flex-1 text-[11px] text-white/70 bg-black/25 rounded-lg px-2.5 py-2 leading-relaxed block">
            {EXAMPLE_PROMPT[platform]}
          </code>
          <button
            onClick={copyPrompt}
            className="shrink-0 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white flex items-center gap-1 text-[10px]"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? '已复制' : '复制'}
          </button>
        </div>
        <p className="text-[10px] text-white/30 mt-1.5">复制后粘给 AI，把账号名和条数改成你要的即可。</p>
      </div>

      {/* 注意事项 */}
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-[10px] text-amber-200/75 leading-relaxed">
          <p>遇到验证码、登录弹窗时，AI 会主动暂停叫你手动处理，不会硬闯。</p>
          <p>只抓自己的账号或公开数据；控制频率，别短时间大量抓取。</p>
          <p>取到的数据先落在本机，确认无误后再上传，避免脏数据进系统。</p>
        </div>
      </div>
    </div>
  );

  if (bare) return body;

  return (
    <GlassCard hoverable={false}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-left"
      >
        <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-white font-medium text-sm">让 AI 直接从网页取数（免手动导出）</p>
          <p className="text-[10px] text-white/40 mt-0.5 truncate">
            不想自己导表？可以让 AI 操作你已登录的浏览器抓取，整理好再回这里上传
          </p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-white/40 shrink-0" /> : <ChevronDown className="w-4 h-4 text-white/40 shrink-0" />}
      </button>
      {open && <div className="mt-3 pt-3 border-t border-white/5">{body}</div>}
    </GlassCard>
  );
};

export default BrowserFetchGuide;
