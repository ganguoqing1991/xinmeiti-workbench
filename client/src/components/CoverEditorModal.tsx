import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Image as ImageIcon, Link as LinkIcon, Upload, X, Check } from 'lucide-react';
import Modal from './Modal';

interface CoverEditorModalProps {
  open: boolean;
  onClose: () => void;
  currentCoverUrl?: string;
  currentCoverColor?: string;
  postTitle?: string;
  onSave: (coverUrl: string | undefined) => void;
}

const CoverEditorModal: React.FC<CoverEditorModalProps> = ({
  open,
  onClose,
  currentCoverUrl,
  currentCoverColor,
  postTitle,
  onSave,
}) => {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<string | undefined>(currentCoverUrl);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 打开时同步当前值
  useEffect(() => {
    if (open) {
      setUrl(currentCoverUrl || '');
      setPreview(currentCoverUrl);
      setError(null);
    }
  }, [open, currentCoverUrl]);

  // URL 改变时实时预览
  const handleUrlChange = (val: string) => {
    setUrl(val);
    setError(null);
    if (val.trim()) {
      setPreview(val.trim());
    } else {
      setPreview(currentCoverUrl);
    }
  };

  // 本地文件转 base64
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('图片大小不能超过 4MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setPreview(result);
      setUrl(result);
      setError(null);
    };
    reader.onerror = () => setError('文件读取失败');
    reader.readAsDataURL(file);
  };

  // 清除
  const handleClear = () => {
    setUrl('');
    setPreview(undefined);
    setError(null);
  };

  // 保存
  const handleSave = () => {
    onSave(url.trim() || undefined);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="编辑封面图"
      subtitle={postTitle ? `为「${postTitle.slice(0, 20)}${postTitle.length > 20 ? '...' : ''}」设置封面` : '粘贴图片链接或上传本地图片'}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* 预览区 */}
        <div className="relative w-full h-72 rounded-lg overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center">
          {preview ? (
            <>
              <img
                src={preview}
                alt="封面预览"
                className="w-full h-full object-cover"
                onError={() => setError('图片加载失败，请检查 URL 是否正确')}
                onLoad={() => setError(null)}
              />
              <button
                onClick={handleClear}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-rose-500/80 transition-colors"
                title="移除封面"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : currentCoverColor ? (
            <div className={`absolute inset-0 bg-gradient-to-br ${currentCoverColor}`}>
              <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">
                当前为渐变色块
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/30">
              <ImageIcon className="w-10 h-10" />
              <p className="text-sm">暂无封面</p>
            </div>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
            ⚠️ {error}
          </div>
        )}

        {/* URL 输入 */}
        <div>
          <label className="text-xs text-white/50 mb-1.5 flex items-center gap-1.5">
            <LinkIcon className="w-3.5 h-3.5" /> 图片 URL
          </label>
          <input
            type="text"
            value={url.startsWith('data:image/') ? '（已上传本地图片，base64 编码）' : url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://example.com/cover.jpg"
            disabled={url.startsWith('data:image/')}
            className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 disabled:opacity-50"
          />
          <p className="text-[10px] text-white/30 mt-1">
            支持 http(s):// 开头的图片链接（jpg/png/webp/gif），或下方上传本地图片
          </p>
        </div>

        {/* 分隔 */}
        <div className="flex items-center gap-3 text-xs text-white/30">
          <div className="flex-1 h-px bg-white/10" />
          <span>或</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* 上传本地 */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-12 rounded-lg border-2 border-dashed border-white/15 text-white/60 hover:border-purple-500/40 hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4" />
            <span className="text-sm">点击上传本地图片（≤ 4MB）</span>
          </button>
        </div>

        {/* 快捷示例 */}
        <div>
          <p className="text-[10px] text-white/40 mb-1.5">快捷示例：</p>
          <div className="flex gap-2 flex-wrap">
            {[
              'https://picsum.photos/seed/xhs/400/500',
              'https://picsum.photos/seed/dy/400/500',
              'https://picsum.photos/seed/jiaoyu/400/500',
            ].map((sample) => (
              <button
                key={sample}
                onClick={() => handleUrlChange(sample)}
                className="text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white/50 hover:text-white hover:border-white/30"
              >
                {sample.replace('https://picsum.photos/seed/', '').slice(0, 18)}...
              </button>
            ))}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:opacity-90 flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" /> 保存封面
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CoverEditorModal;
