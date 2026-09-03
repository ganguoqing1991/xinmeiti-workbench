// 手动录入内容 —— 供小红书「添加二创」/ 抖音「添加视频」共用
// 场景：刷到一条好内容想直接做二创，不值得先整理成表格再上传。
// 录入后写进与表格导入同一个内容池，因此立刻出现在内容展示列表里，
// 可以像导入内容一样勾选、加入二创、删除。

import React, { useState, useEffect } from 'react';
import { FileText, User, Link2, Image as ImageIcon, Video, Mic, Sparkles } from 'lucide-react';
import Modal from './Modal';
import { addManualPost } from '../utils/parseTable';
import { addReprocessTask } from '../utils/reprocessQueue';
import type { Platform } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  platform: Platform;
  /** 录入完成回调：enqueued=true 表示同时加进了二创队列 */
  onAdded: (title: string, enqueued: boolean) => void;
}

const EMPTY = {
  title: '',
  accountName: '',
  content: '',
  videoUrl: '',
  audioUrl: '',
  coverUrl: '',
};

const AddContentModal: React.FC<Props> = ({ open, onClose, platform, onAdded }) => {
  const [form, setForm] = useState(EMPTY);
  const [enqueue, setEnqueue] = useState(true);
  const [err, setErr] = useState('');

  // 每次打开都从空白开始，避免上一条内容残留
  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setEnqueue(true);
      setErr('');
    }
  }, [open]);

  const isXhs = platform === 'xiaohongshu';
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const submit = () => {
    if (!form.title.trim()) {
      setErr('标题不能为空');
      return;
    }
    const post = addManualPost(platform, {
      title: form.title,
      accountName: form.accountName,
      content: form.content,
      coverUrl: form.coverUrl,
      videoUrl: form.videoUrl,
      audioUrl: form.audioUrl,
    });
    if (enqueue) {
      addReprocessTask({
        postId: post.id,
        title: post.title,
        content: post.content || '',
        accountName: post.accountName || '手动录入',
        coverUrl: post.coverUrl,
        videoUrl: post.videoUrl,
        audioUrl: post.audioUrl,
        platform,
      });
    }
    onAdded(post.title, enqueue);
    onClose();
  };

  const field = 'w-full text-sm px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none focus:border-purple-400/40';
  const label = (icon: React.ReactNode, text: string, hint?: string) => (
    <label className="flex items-center gap-1.5 text-xs text-white/60 mb-1.5">
      {icon}
      {text}
      {hint && <span className="text-white/25">（{hint}）</span>}
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isXhs ? '添加二创内容' : '添加视频'}
      subtitle={`手动录入一条${isXhs ? '笔记' : '视频'}，直接进内容展示列表，可立即加入二创加工`}
      maxWidth="max-w-lg"
    >
      <div className="space-y-3">
        <div>
          {label(<FileText className="w-3.5 h-3.5" />, '标题', '必填')}
          <input
            value={form.title}
            onChange={set('title')}
            placeholder={isXhs ? '粘贴笔记标题' : '粘贴视频标题'}
            className={field}
          />
        </div>

        <div>
          {label(<User className="w-3.5 h-3.5" />, '原账号', '选填')}
          <input
            value={form.accountName}
            onChange={set('accountName')}
            placeholder="内容来自哪个账号"
            className={field}
          />
        </div>

        <div>
          {label(<FileText className="w-3.5 h-3.5" />, '正文 / 文案', '选填，二创时作为原文')}
          <textarea
            value={form.content}
            onChange={set('content')}
            rows={4}
            placeholder="粘贴正文或口播稿；留空也能加进来，之后可用 ASR / 视频理解提取"
            className={`${field} resize-none leading-6`}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            {label(<Video className="w-3.5 h-3.5" />, '视频链接', '选填')}
            <input value={form.videoUrl} onChange={set('videoUrl')} placeholder="https://..." className={field} />
          </div>
          <div>
            {label(<Mic className="w-3.5 h-3.5" />, '音频链接', '选填')}
            <input value={form.audioUrl} onChange={set('audioUrl')} placeholder="https://...mp3" className={field} />
          </div>
        </div>

        <div>
          {label(<ImageIcon className="w-3.5 h-3.5" />, '封面链接', '选填')}
          <input value={form.coverUrl} onChange={set('coverUrl')} placeholder="https://...jpg" className={field} />
        </div>

        <label className="flex items-start gap-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/25 cursor-pointer">
          <input
            type="checkbox"
            checked={enqueue}
            onChange={(e) => setEnqueue(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-purple-500"
          />
          <span className="text-xs text-white/75 leading-5">
            <Sparkles className="w-3.5 h-3.5 inline mr-1 text-purple-300" />
            同时加入二创加工队列
            <span className="block text-white/35 mt-0.5">
              勾选后直接出现在「二创加工」任务栏，去那边选 Skill 就能跑
            </span>
          </span>
        </label>

        {err && <p className="text-xs text-rose-300">{err}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:text-white hover:bg-white/10"
          >
            取消
          </button>
          <button
            onClick={submit}
            className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium hover:opacity-90"
          >
            确认添加
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default AddContentModal;
