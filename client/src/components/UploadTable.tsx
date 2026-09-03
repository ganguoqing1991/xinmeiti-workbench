import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Trash2,
  FolderOpen,
  Loader2,
  Inbox,
  Check,
  X as XIcon,
  Tag,
} from 'lucide-react';
import GlassCard from './GlassCard';
import type { Platform, UploadedFile } from '../types';
import { formatFileSize, formatTime, getNowISO } from '../utils/format';
import {
  readTableFile,
  parseTable,
  getImportedAccounts,
  setImportedAccounts,
  getImportedPosts,
  setImportedPosts,
  mergeImportedAccounts,
  removeImportedBySourceFile,
  type ParsedAccount,
  type ParsedPost,
} from '../utils/parseTable';
import { getSyncedAccounts, removeMany as removeManyFromPool } from '../utils/syncedPool';

interface UploadTableProps {
  platform: Platform;
  onConfirmImport?: (result: { accounts: ParsedAccount[]; posts: ParsedPost[]; fileName: string }) => void;
  // 删除文件时通知父组件（用于联动清掉 accounts state）
  onDeleteFile?: (result: { fileName: string; removedAccountNames: string[] }) => void;
}

const STORAGE_KEY = 'media_workbench_uploaded_files';
const DEFAULT_FOLDER = '/app/uploads';

function loadFiles(): UploadedFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFiles(files: UploadedFile[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch (e) {
    console.error('保存文件列表失败', e);
  }
}

const UploadTable: React.FC<UploadTableProps> = ({ platform, onConfirmImport, onDeleteFile }) => {
  const [files, setFiles] = useState<UploadedFile[]>(() =>
    loadFiles().filter((f) => f.platform === platform)
  );
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const platformLabel = platform === 'xiaohongshu' ? '小红书' : '抖音';
  const platformColor = platform === 'xiaohongshu' ? 'rose' : 'cyan';

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3000);
  };

  // 解析单个文件：返回 { accounts, posts }
  const parseOne = useCallback(
    async (file: File) => {
      const rows = await readTableFile(file);
      const result = parseTable(rows, platform, file.name);
      return result;
    },
    [platform]
  );

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setUploading(true);

      const newFiles: UploadedFile[] = [];
      for (const file of Array.from(fileList)) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'unknown';
        let rows = 0;
        let parsed: UploadedFile['parsed'] | undefined;
        let fullParsed: UploadedFile['fullParsed'] | undefined;
        try {
          const result = await parseOne(file);
          rows = result.rows.length - 1;
          parsed = {
            accounts: result.accounts.length,
            posts: result.posts.length,
            matchedFields: Object.keys(result.matchedFields),
            unrecognized: result.unrecognized,
          };
          fullParsed = { accounts: result.accounts, posts: result.posts };
        } catch (e) {
          console.error('解析失败', file.name, e);
        }

        const uploaded: UploadedFile = {
          id: `${platform}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          size: file.size,
          type: ext,
          uploadTime: getNowISO(),
          platform,
          rows: rows > 0 ? rows : 0,
          status: 'parsed',
          storedPath: `${DEFAULT_FOLDER}/${platform}/${file.name}`,
          parsed,
          fullParsed,
        };
        newFiles.push(uploaded);
      }

      const allFiles = loadFiles();
      const updated = [...newFiles, ...allFiles];
      saveFiles(updated);
      setFiles((prev) => [...newFiles, ...prev]);

      setTimeout(() => setUploading(false), 400);
    },
    [platform, parseOne]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDelete = useCallback(
    (id: string) => {
      const target = loadFiles().find((f) => f.id === id);
      // 1. 删文件记录
      setFiles((prev) => prev.filter((f) => f.id !== id));
      const allFiles = loadFiles().filter((f) => f.id !== id);
      saveFiles(allFiles);

      // 2. 联动删除 imported 池中归属该文件的账号 + 帖子
      if (target?.name) {
        const removed = removeImportedBySourceFile(platform, target.name);
        if (removed.removedAccounts.length > 0) {
          const removedNames = removed.removedAccounts.map((a) => a.name);
          // 3. 联动从同步池（对标监控）删除（按 name 匹配）
          const synced = getSyncedAccounts(platform);
          const syncedNames = synced
            .filter((s) => removedNames.includes(s.account?.name))
            .map((s) => s.account.name);
          if (syncedNames.length > 0) {
            removeManyFromPool(platform, syncedNames);
          }
          // 4. 通知父组件从 accounts state 删除
          onDeleteFile?.({ fileName: target.name, removedAccountNames: removedNames });
          showToast(
            'success',
            `已删除文件并联动清理 ${removed.removedAccounts.length} 个账号、${removed.removedPosts.length} 条内容`
          );
        } else {
          showToast('success', '已删除文件（无关联数据）');
        }
      }
    },
    [platform, onDeleteFile]
  );

  // 确认录入：合并到已录入池（同账号累加 + 增量 Δ），并通知父组件
  const handleConfirm = useCallback(
    async (file: UploadedFile) => {
      if (!file.parsed) {
        showToast('error', '该文件尚未解析完成，请重新上传');
        return;
      }
      setConfirmingId(file.id);
      try {
        const cached = file.fullParsed;
        if (!cached) {
          showToast('error', '该文件已过期（刷新页面后需重新上传），请重新上传后再确认');
          setConfirmingId(null);
          return;
        }
        // 合并到已录入池：同账号取最新值 + 计算增量 Δ + 追加 history
        const report = mergeImportedAccounts(platform, cached.accounts, cached.posts);

        // 统计合并/新增
        const mergedCount = report.mergedItems.filter((i) => i.action === 'merged').length;
        const newCount = report.mergedItems.filter((i) => i.action === 'new').length;

        // 更新文件状态（确认后清掉 fullParsed 节省内存）
        const updated: UploadedFile = {
          ...file,
          status: 'confirmed',
          confirmedAt: getNowISO(),
          confirmedAccounts: cached.accounts.length,
          confirmedPosts: cached.posts.length,
          mergedCount,
          newCount,
          mergeReport: report.mergedItems,
          fullParsed: undefined,
        };
        const allFiles = loadFiles().map((f) => (f.id === file.id ? updated : f));
        saveFiles(allFiles);
        setFiles((prev) => prev.map((f) => (f.id === file.id ? updated : f)));

        // 通知父组件
        onConfirmImport?.({
          accounts: cached.accounts,
          posts: cached.posts,
          fileName: file.name,
        });

        // 友好提示：合并 vs 新增
        if (mergedCount > 0 && newCount > 0) {
          showToast(
            'success',
            `合并 ${mergedCount} 个老账号 + 新增 ${newCount} 个账号（已计算增量 Δ）`
          );
        } else if (mergedCount > 0) {
          showToast(
            'success',
            `合并 ${mergedCount} 个老账号（已计算增量 Δ，可在详情查看趋势）`
          );
        } else {
          showToast(
            'success',
            `已录入 ${cached.accounts.length} 个新账号到对标监控 + 内容二创`
          );
        }
      } catch (e) {
        console.error(e);
        showToast('error', '确认录入失败，请重试');
      } finally {
        setConfirmingId(null);
      }
    },
    [platform, platformLabel, onConfirmImport]
  );

  const totalRows = files.reduce((sum, f) => sum + f.rows, 0);
  const confirmedCount = files.filter((f) => f.status === 'confirmed').length;
  const pendingConfirmCount = files.filter((f) => f.status === 'parsed' && f.parsed).length;

  // 已录入池数据预览
  const importedAccs = getImportedAccounts(platform);
  const importedPosts = getImportedPosts(platform);

  return (
    <div className="space-y-4">
      <GlassCard hoverable={false} glow={platformColor as any}>
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                platform === 'xiaohongshu' ? 'bg-rose-500/10 text-rose-400' : 'bg-cyan-500/10 text-cyan-400'
              }`}
            >
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-white font-semibold">{platformLabel}数据导入</h3>
              <p className="text-xs text-white/40">上传运营数据表格，解析字段后一键确认录入对标监控 + 内容二创</p>
            </div>
          </div>
          {/* 默认文件夹路径展示 */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-white/50 font-mono">
              {DEFAULT_FOLDER}/{platform}/
            </span>
          </div>
        </div>

        {/* 拖拽上传区 */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative rounded-xl border-2 border-dashed transition-all cursor-pointer p-8 text-center ${
            dragging ? 'border-purple-400 bg-purple-500/10' : 'border-white/10 hover:border-white/20 hover:bg-white/5'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <motion.div animate={{ y: dragging ? -4 : 0 }} className="flex flex-col items-center gap-3">
            {uploading ? (
              <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
            ) : (
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${dragging ? 'bg-purple-500/20' : 'bg-white/5'}`}>
                <UploadCloud className={`w-7 h-7 ${dragging ? 'text-purple-400' : 'text-white/40'}`} />
              </div>
            )}
            <div>
              <p className="text-sm text-white/70 font-medium">
                {uploading ? '正在解析...' : dragging ? '松开鼠标上传' : '点击或拖拽文件到此区域'}
              </p>
              <p className="text-xs text-white/30 mt-1">支持 CSV / Excel (.xlsx, .xls)，自动识别账号/点赞/评论/收藏/分享等字段</p>
            </div>
          </motion.div>
        </div>

        {/* 统计栏 */}
        {files.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mt-4 p-3 rounded-lg bg-white/5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-white/60">
                已上传 <span className="text-white font-medium">{files.length}</span> 个文件
              </span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/60">
                共 <span className="text-white font-medium">{totalRows.toLocaleString()}</span> 行数据
              </span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-white/60">
                已确认录入 <span className="text-emerald-400 font-medium">{confirmedCount}</span> 个
              </span>
            </div>
            {pendingConfirmCount > 0 && (
              <>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-white/60">
                    待确认 <span className="text-amber-400 font-medium">{pendingConfirmCount}</span> 个
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* 文件列表 */}
        {files.length > 0 ? (
          <div className="mt-3 space-y-2 max-h-[28rem] overflow-y-auto scrollbar-thin">
            <AnimatePresence>
              {files.map((file) => {
                const isConfirmed = file.status === 'confirmed';
                const isConfirming = confirmingId === file.id;
                return (
                  <motion.div
                    key={file.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className={`p-3 rounded-lg transition-colors group ${
                      isConfirmed ? 'bg-emerald-500/5 border border-emerald-500/20' : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          file.type === 'csv' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                        }`}
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/80 truncate font-medium">{file.name}</p>
                        <div className="flex items-center gap-2 text-xs text-white/30 flex-wrap">
                          <span>{formatFileSize(file.size)}</span>
                          <span>·</span>
                          <span>{file.rows.toLocaleString()} 行</span>
                          <span>·</span>
                          <span className="font-mono text-white/20">{file.storedPath}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isConfirmed ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <Check className="w-3 h-3" /> 已录入
                          </span>
                        ) : file.status === 'parsed' ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            待确认
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/40">处理中</span>
                        )}
                        <span className="text-xs text-white/30">{formatTime(file.uploadTime)}</span>
                        <button
                          onClick={() => handleDelete(file.id)}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 解析字段摘要 */}
                    {file.parsed && (
                      <div className="mt-2 ml-12 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <Tag className="w-3 h-3 text-white/30" />
                        {file.parsed.matchedFields.length > 0 ? (
                          file.parsed.matchedFields.map((f) => (
                            <span key={f} className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              {f}
                            </span>
                          ))
                        ) : (
                          <span className="text-white/30">未识别到字段</span>
                        )}
                        {file.parsed.unrecognized.length > 0 && (
                          <span className="ml-1 text-white/30">+ 未识别 {file.parsed.unrecognized.length} 列</span>
                        )}
                      </div>
                    )}

                    {/* 摘要 + 确认按钮 */}
                    <div className="mt-2 ml-12 flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-xs text-white/40">
                        {file.parsed ? (
                          <>
                            识别 <span className="text-white">{file.parsed.accounts}</span> 个账号 /{' '}
                            <span className="text-white">{file.parsed.posts}</span> 条内容
                          </>
                        ) : (
                          <span>未解析</span>
                        )}
                        {isConfirmed && file.confirmedAccounts !== undefined && (
                          <span className="ml-3 text-emerald-300">
                            ✓ 已录入 {file.confirmedAccounts} 账号 / {file.confirmedPosts} 内容
                          </span>
                        )}
                        {/* 合并 vs 新增徽章 */}
                        {isConfirmed && (file.mergedCount ?? 0) > 0 && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                            合并 {file.mergedCount}
                          </span>
                        )}
                        {isConfirmed && (file.newCount ?? 0) > 0 && (
                          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
                            新增 {file.newCount}
                          </span>
                        )}
                      </div>
                      {!isConfirmed && file.parsed && (
                        <button
                          onClick={() => handleConfirm(file)}
                          disabled={isConfirming}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            platform === 'xiaohongshu'
                              ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white hover:opacity-90'
                              : 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white hover:opacity-90'
                          } disabled:opacity-50`}
                        >
                          {isConfirming ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> 录入中...
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" /> 确认录入
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    {/* 合并增量明细（已确认且有合并项时显示） */}
                    {isConfirmed && file.mergeReport && file.mergeReport.length > 0 && (
                      <div className="mt-2 ml-12 flex flex-col gap-1">
                        {file.mergeReport.slice(0, 5).map((mr, i) => (
                          <div
                            key={i}
                            className="text-[11px] flex items-center gap-2 text-white/50"
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                mr.action === 'merged' ? 'bg-blue-400' : 'bg-violet-400'
                              }`}
                            />
                            <span className="text-white/80 truncate max-w-[120px]">{mr.name}</span>
                            <span
                              className={`text-[10px] px-1 py-0.5 rounded shrink-0 ${
                                mr.action === 'merged'
                                  ? 'bg-blue-500/10 text-blue-300'
                                  : 'bg-violet-500/10 text-violet-300'
                              }`}
                            >
                              {mr.action === 'merged' ? '合并' : '新增'}
                            </span>
                            {mr.action === 'merged' && mr.delta && (
                              <span className="flex items-center gap-2 text-[10px] flex-wrap">
                                <DeltaChip label="粉丝" value={mr.delta.followers} />
                                <DeltaChip label="点赞" value={mr.delta.avgLikes} />
                                <DeltaChip label="评论" value={mr.delta.avgComments} />
                                <DeltaChip label="互动" value={mr.delta.interScore} />
                              </span>
                            )}
                          </div>
                        ))}
                        {file.mergeReport.length > 5 && (
                          <span className="text-[10px] text-white/30">
                            还有 {file.mergeReport.length - 5} 个账号…
                          </span>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          <div className="mt-3 flex flex-col items-center gap-2 py-6 text-center">
            <Inbox className="w-8 h-8 text-white/20" />
            <p className="text-sm text-white/30">暂无上传文件</p>
          </div>
        )}

        {/* Toast 提示 */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className={`mt-3 p-3 rounded-lg flex items-center gap-2 text-sm ${
                toast.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
              }`}
            >
              {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* 已录入池预览 */}
      {(importedAccs.length > 0 || importedPosts.length > 0) && (
        <GlassCard hoverable={false}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 已录入池（{platformLabel}）
            </h3>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    `确认清空所有${platformLabel}已录入数据？\n\n将彻底清空：\n• 已导入的 ${importedAccs.length} 个对标账号\n• 已导入的 ${importedPosts.length} 条内容\n• 同步池中的所有账号\n• 对标监控 / 内容二创 / 数据统计 中的所有导入数据\n\n此操作不可恢复！`
                  )
                ) {
                  // 1. 清 imported 池
                  setImportedAccounts(platform, []);
                  setImportedPosts(platform, []);
                  // 2. 清同步池
                  removeManyFromPool(platform, getSyncedAccounts(platform).map((s) => s.account.name));
                  // 3. 通知父组件清 accounts state（之前漏了这一步，导致对标监控还残留账号）
                  onDeleteFile?.({
                    fileName: '__all__',
                    removedAccountNames: importedAccs.map((a) => a.name),
                  });
                  showToast('success', '已彻底清空所有对标账号 + 导入内容');
                }
              }}
              className="text-xs text-rose-300 hover:text-rose-400"
            >
              <XIcon className="w-3 h-3 inline mr-1" /> 清空所有对标账号
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="p-3 rounded-lg bg-white/5">
              <p className="text-xs text-white/40">对标账号</p>
              <p className="text-lg font-bold text-white">{importedAccs.length}</p>
            </div>
            <div className="p-3 rounded-lg bg-white/5">
              <p className="text-xs text-white/40">二创内容</p>
              <p className="text-lg font-bold text-white">{importedPosts.length}</p>
            </div>
            <div className="p-3 rounded-lg bg-white/5">
              <p className="text-xs text-white/40">平均点赞</p>
              <p className="text-lg font-bold text-white">
                {importedPosts.length
                  ? Math.round(importedPosts.reduce((s, p) => s + p.likes, 0) / importedPosts.length)
                  : 0}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-white/5">
              <p className="text-xs text-white/40">平均评论</p>
              <p className="text-lg font-bold text-white">
                {importedPosts.length
                  ? Math.round(importedPosts.reduce((s, p) => s + p.comments, 0) / importedPosts.length)
                  : 0}
              </p>
            </div>
          </div>
          {importedAccs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {importedAccs.slice(0, 8).map((a) => (
                <span key={a.id} className="text-xs px-2 py-1 rounded-md bg-white/5 text-white/60 flex items-center gap-1.5">
                  <span className={`w-4 h-4 rounded bg-gradient-to-br ${a.avatarColor} text-[10px] text-white font-bold flex items-center justify-center`}>
                    {a.avatar}
                  </span>
                  {a.name}
                </span>
              ))}
              {importedAccs.length > 8 && <span className="text-xs text-white/30">+{importedAccs.length - 8} 更多</span>}
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
};

// 增量数字 chip：正绿/负红/零灰
const DeltaChip: React.FC<{ label: string; value: number }> = ({ label, value }) => {
  if (value === 0) {
    return (
      <span className="text-white/30">
        {label} 0
      </span>
    );
  }
  const isPositive = value > 0;
  return (
    <span className={isPositive ? 'text-emerald-300' : 'text-rose-300'}>
      {label} {isPositive ? '+' : ''}
      {value.toLocaleString()}
      {isPositive ? '↑' : '↓'}
    </span>
  );
};

export default UploadTable;
