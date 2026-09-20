import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Video,
  BarChart3,
  Upload,
  Users,
  Play,
  Plus,
  Search,
  Film,
  Heart,
  MessageCircle,
  Share2,
  Database,
  ArrowUpDown,
  TrendingUp,
  ExternalLink,
  AlertCircle,
  Flame,
  Image as ImageIcon,
  Sparkles,
  Trash2,
  CheckSquare,
  Square,
  Wand2,
} from 'lucide-react';
import GlassCard from '../../components/GlassCard';
import BrowserFetchGuide from '../../components/BrowserFetchGuide';
import CollapsibleSection from '../../components/CollapsibleSection';
import StatCard from '../../components/StatCard';
import UploadTable from '../../components/UploadTable';
import BenchmarkMonitor from '../../components/BenchmarkMonitor';
import DataStatsPanel from '../../components/DataStatsPanel';
import CoverEditorModal from '../../components/CoverEditorModal';
import VideoPlayer from '../../components/VideoPlayer';
import Modal from '../../components/Modal';
import CoverWithFallback from '../../components/CoverWithFallback';
import { dyBenchmarkAccounts, dyVideosPool, type NoteItem } from '../../data/mock';
import type { BenchmarkAccount } from '../../types';
import { formatNumber } from '../../utils/format';
import {
  getImportedAccounts,
  getImportedPosts,
  hasRealAccounts,
  type ParsedAccount,
  type ParsedPost,
} from '../../utils/parseTable';
// 注意：本页已有同名 state setter `setImportedPosts`，不要再从 parseTable 导入同名函数
import AddContentModal from '../../components/AddContentModal';
import { getDeletedPostIds, deleteOnePost, deleteManyPosts, restoreAllDeletedPosts } from '../../utils/deletedPosts';
import { addReprocessTask } from '../../utils/reprocessQueue';
import { getActiveTab, setActiveTabPersistent } from '../../utils/tabPersistence';

type TabKey = 'monitor' | 'upload' | 'recreate' | 'stats';
type SortKeyDY = 'likes' | 'comments' | 'shares';

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'monitor', label: '对标监控', icon: <BarChart3 className="w-4 h-4" /> },
  { key: 'upload', label: '数据导入', icon: <Upload className="w-4 h-4" /> },
  { key: 'recreate', label: '内容展示', icon: <Film className="w-4 h-4" /> },
  { key: 'stats', label: '数据统计', icon: <TrendingUp className="w-4 h-4" /> },
];

// 多选过滤 chip：点赞/评论/分享 参与排序权重，账号做"按账号过滤"
type FilterKey = SortKeyDY | 'account';
const filterOptionsDY: { key: FilterKey; label: string; icon: React.ReactNode }[] = [
  { key: 'likes', label: '按点赞', icon: <Heart className="w-3.5 h-3.5" /> },
  { key: 'comments', label: '按评论', icon: <MessageCircle className="w-3.5 h-3.5" /> },
  { key: 'shares', label: '按分享', icon: <Share2 className="w-3.5 h-3.5" /> },
  { key: 'account', label: '按账号', icon: <Users className="w-3.5 h-3.5" /> },
];

const Douyin: React.FC = () => {
  // Tab 持久化：刷新后能恢复上次停留的 Tab（之前用 useState('monitor') 总是弹回对标监控）
  const [activeTab, setActiveTabRaw] = useState<TabKey>(() => getActiveTab<TabKey>('douyin', 'monitor'));
  const setActiveTab = (tab: TabKey) => {
    setActiveTabRaw(tab);
    setActiveTabPersistent('douyin', tab);
  };
  // 合并 mock + 已导入账号
  // 关键修复：有真实导入数据时**不再**追加 mock 账号
  const [accounts, setAccounts] = useState(() => {
    const imported = getImportedAccounts('douyin') as unknown as typeof dyBenchmarkAccounts;
    if (imported.length > 0) return imported;
    // 已录入池为空时，只有「从未录入过真实账号」才展示内置示例；
    // 若是用户导入后主动删空的，必须保持空列表，不能让示例账号又冒出来。
    return hasRealAccounts('douyin') ? [] : [...dyBenchmarkAccounts];
  });
  const [importedPosts, setImportedPosts] = useState<ParsedPost[]>(() => getImportedPosts('douyin'));

  // 调试态：用户能看到「内容展示为啥是空」的具体原因
  const [showDebug, setShowDebug] = useState(false);

  // 内容二创 — 用户删除池
  const [deletedPostIds, setDeletedPostIds] = useState<Set<string>>(() => getDeletedPostIds('douyin'));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 用户自定义封面覆盖
  const COVER_KEY = 'dy_cover_overrides_v1';
  const [coverOverrides, setCoverOverrides] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(COVER_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return {};
  });
  const saveCoverOverride = (postId: string, url: string | undefined) => {
    setCoverOverrides((prev) => {
      const next = { ...prev };
      if (url) next[postId] = url;
      else delete next[postId];
      try {
        localStorage.setItem(COVER_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // 编辑封面 state
  const [coverEditPost, setCoverEditPost] = useState<{ id: string; title: string; coverUrl?: string; coverColor?: string } | null>(null);

  // 添加对标账号 Modal
  const [showAddAccount, setShowAddAccount] = useState(false);
  // 手动录入一条内容 Modal（内容展示页「添加视频」按钮）
  const [showAddContent, setShowAddContent] = useState(false);
  const [newAccount, setNewAccount] = useState({
    name: '',
    followers: '',
    avgLikes: '',
    avgComments: '',
    avgCollects: '',
    avgShares: '',
  });
  const addAccount = () => {
    if (!newAccount.name.trim()) return;
    const now = new Date().toISOString();
    const followers = parseInt(newAccount.followers) || 0;
    const avgLikes = parseInt(newAccount.avgLikes) || 0;
    const avgComments = parseInt(newAccount.avgComments) || 0;
    const avgCollects = parseInt(newAccount.avgCollects) || 0;
    const avgShares = parseInt(newAccount.avgShares) || 0;
    const engRaw = ((avgLikes + avgComments + avgCollects + avgShares) / Math.max(followers, 1)) * 100;
    const acc: BenchmarkAccount = {
      id: `douyin-add-${Date.now()}`,
      platform: 'douyin',
      name: newAccount.name.trim(),
      avatar: newAccount.name.trim().charAt(0).toUpperCase().slice(0, 1) || '新',
      avatarColor: 'from-cyan-400 to-blue-500',
      followers,
      notes: 0,
      avgLikes,
      avgComments,
      avgShares,
      avgCollects,
      engagementRate: +Math.min(Math.max(engRaw, 1), 15).toFixed(1),
      growthRate: 0,
      lastSyncTime: now,
      syncStatus: 'synced',
      hasUpdate: true,
      tags: ['手动添加'],
      recentPosts: [],
      trendData: [],
    };
    setAccounts((prev) => [acc, ...prev]);
    setShowAddAccount(false);
    setNewAccount({ name: '', followers: '', avgLikes: '', avgComments: '', avgCollects: '', avgShares: '' });
  };

  // 多选过滤：点赞/评论/分享 参与排序权重，账号做"按账号过滤"
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(() => new Set(['likes']));
  const [search, setSearch] = useState('');
  // 内容展示 · 按发布日期筛选（YYYY-MM-DD）
  const [filterDate, setFilterDate] = useState('');
  // 多选账号过滤
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  // 内容详情 Modal
  const [detailPost, setDetailPost] = useState<any>(null);
  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2400);
  };
  const showAddToReprocessToast = (post: any) => {
    showToast('success', `已加入二创加工：${post.title?.slice(0, 16) || '未命名'}`);
  };
  const navigate = useNavigate();

  const handleConfirmImport = (result: { accounts: ParsedAccount[]; posts: ParsedPost[]; fileName: string }) => {
    // 注意：accounts/posts 已经由 UploadTable 的 mergeImportedAccounts 写入 imported 池
    // 这里**只负责**把 imported 池的"全部"账号同步到 accounts state（避免重复叠加）
    const importedAccs = getImportedAccounts('douyin');
    const importedPostsFresh = getImportedPosts('douyin');
    setAccounts(importedAccs);
    setImportedPosts(importedPostsFresh);
    // 之前固定跳 monitor → 用户看不到刚上传的视频，反复要点内容展示
    // 现在改：导入成功后**自动跳到内容展示**，让用户立刻看到数据
    setActiveTab('recreate');
    // 防复发保险：如果新导入为 0 条视频（表格里没有内容列），强制跳到数据统计提示
    if (importedPostsFresh.length === 0 && importedAccs.length === 0) {
      setActiveTab('upload');
    }
  };

  // 删文件时：从 accounts state 里删掉这些账号（imported 池+同步池已由 UploadTable 清掉）
  // 删文件时：从 accounts state 里删掉这些账号（imported 池+同步池已由 UploadTable 清掉）
  const handleDeleteFile = (result: { fileName: string; removedAccountNames: string[] }) => {
    const removedSet = new Set(result.removedAccountNames);
    setAccounts((prev) => prev.filter((a) => !removedSet.has(a.name)));
    setImportedPosts((prev) => prev.filter((p) => !removedSet.has((p as any).accountName)));
    // 完全清空（fileName='__all__'）→ 重新判断是否回退 mock
    if (result.fileName === '__all__') {
      const fresh = getImportedAccounts('douyin');
      if (fresh.length === 0) {
        setAccounts([...dyBenchmarkAccounts]);
      } else {
        setAccounts(fresh);
      }
    }
  };

  // 汇总数据
  const totalFollowers = accounts.reduce((s, a) => s + a.followers, 0);
  const avgEngagement = (accounts.reduce((s, a) => s + a.engagementRate, 0) / Math.max(accounts.length, 1)).toFixed(1);
  const importedCount = accounts.filter((a: any) => a.source === 'import').length;

// 内容二创数据源（去重 + 过滤已删除池 + 跳过 mock 数据）
// 防复发设计：
//   - 真实导入数据 (a.source === 'import') 才进
//   - 如果数据来源有 source 字段但被遗漏（如老数据导入），按"是不是 importedAccounts 里的成员"二次兜底
//   - console 打印诊断信息（开发态可看到具体哪一层断了）
const recreateItems = useMemo(() => {
    // 找出所有"真实导入"账号的 id（主备：source 字段 + 当前 accounts 列表与 importedAccounts 重叠）
    const importedAccList = getImportedAccounts('douyin');
    const importedIds = new Set(importedAccList.map((a) => a.id));
    const fromAccounts: (any & { accountName: string; accountAvatar: string; accountAvatarColor: string })[] = [];
    let skippedMock = 0;
    let skippedEmpty = 0;
    accounts.forEach((a) => {
      // 主判断：source === 'import'
      // 兜底判断：account.id 在 importedAccounts 列表里（防止老数据丢失 source 字段）
      const isImported = (a as any).source === 'import' || importedIds.has(a.id);
      if (!isImported) {
        skippedMock++;
        return;
      }
      if (!a.recentPosts || a.recentPosts.length === 0) {
        skippedEmpty++;
        return;
      }
      a.recentPosts.forEach((p) => {
        fromAccounts.push({
          ...p,
          accountName: a.name,
          accountAvatar: a.avatar,
          accountAvatarColor: a.avatarColor,
        });
      });
    });
    const importedFlat = importedPosts.map((p) => {
      const acc = importedAccList.find((a) => a.recentPosts.some((rp) => rp.id === p.id));
      return {
        ...p,
        // 手动录入的内容自带 accountName，优先用它，不用反查账号表
        accountName: p.accountName || acc?.name || (p.sourceFile ? p.sourceFile.replace(/\.[^.]+$/, '') : '导入账号'),
        accountAvatar: acc?.avatar || '导',
        accountAvatarColor: acc?.avatarColor || 'from-cyan-400 to-blue-500',
      };
    });
    const all = [...importedFlat, ...fromAccounts];
    const seen = new Set<string>();
    const deduped = all.filter((it) => {
      if (!it.id) return false;
      if (deletedPostIds.has(it.id)) return false;
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
    if (deduped.length === 0 && accounts.length === 0) {
      // 仅当 accounts 真的为空时才打诊断，避免刷屏
      console.info('[抖音·内容展示 诊断]', {
        accounts总: accounts.length,
        importedPosts数: importedPosts.length,
        importedAccounts数: importedAccList.length,
        deletedPost数: deletedPostIds.size,
        activeFilters: Array.from(activeFilters),
        selectedAccounts: Array.from(selectedAccounts),
        search关键词: search,
      });
    }
    return deduped;
  }, [accounts, importedPosts, deletedPostIds, activeFilters, selectedAccounts, search]);

  // 选/删 helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === sortedItems.length) return new Set();
      return new Set(sortedItems.map((it) => it.id));
    });
  };
  const handleDeleteOne = (id: string, title: string) => {
    if (!window.confirm(`确定删除「${title.slice(0, 20)}${title.length > 20 ? '...' : ''}」？\n\n此操作只影响内容二创列表，不会删除对标账号或导入数据本身。`)) return;
    const next = deleteOnePost('douyin', id);
    setDeletedPostIds(new Set(next));
    setSelectedIds((prev) => {
      const x = new Set(prev);
      x.delete(id);
      return x;
    });
  };
  const handleDeleteMany = () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`确定批量删除选中的 ${selectedIds.size} 条内容？\n\n此操作只影响内容二创列表。`)) return;
    const next = deleteManyPosts('douyin', Array.from(selectedIds));
    setDeletedPostIds(new Set(next));
    setSelectedIds(new Set());
  };
  const handleRestoreAll = () => {
    if (deletedPostIds.size === 0) return;
    if (!window.confirm(`确定恢复全部已删除的 ${deletedPostIds.size} 条内容？`)) return;
    setDeletedPostIds(restoreAllDeletedPosts('douyin'));
    setSelectedIds(new Set());
  };

  const sortedItems = useMemo(() => {
    let arr = recreateItems.filter((it) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return it.title.toLowerCase().includes(q) || (it.accountName || '').toLowerCase().includes(q);
    });
    // 按发布日期筛选（publishTime 为 YYYY-MM-DD）
    if (filterDate) {
      arr = arr.filter((it) => (it.publishTime || '').slice(0, 10) === filterDate);
    }
    // 按账号过滤
    if (activeFilters.has('account') && selectedAccounts.size > 0) {
      arr = arr.filter((it) => selectedAccounts.has(it.accountName || ''));
    }
    // 加权分
    return arr
      .map((it) => ({
        ...it,
        _sortScore:
          (activeFilters.has('likes') ? (it.likes || 0) * 3 : 0) +
          (activeFilters.has('comments') ? (it.comments || 0) * 2 : 0) +
          (activeFilters.has('shares') ? (it.shares || 0) : 0),
      }))
      .sort((a, b) => b._sortScore - a._sortScore);
  }, [recreateItems, activeFilters, selectedAccounts, search, filterDate]);

  // 全部可用的账号名（去重）
  const allAccountNames = useMemo(() => {
    const s = new Set<string>();
    recreateItems.forEach((it) => {
      if (it.accountName) s.add(it.accountName);
    });
    return Array.from(s);
  }, [recreateItems]);

  // 数据统计 - 合并 3 个数据源
  // 过滤 deletedPostIds 中的 post（与内容展示 Tab 同步）
  // 如果用户已上传过数据，不混入 mock 池，避免"胡编乱造"
  const allNotes = useMemo<NoteItem[]>(() => {
    const fromPool: NoteItem[] = importedPosts.length === 0
      ? dyVideosPool.map((n) => ({ ...n }))
      : [];
    const fromAccounts: NoteItem[] = accounts.flatMap((a) =>
      a.recentPosts
        .filter((p) => !deletedPostIds.has(p.id))
        .map((p) => ({
          ...p,
          accountName: a.name,
          accountAvatar: a.avatar,
          accountAvatarColor: a.avatarColor,
          type: (p as any).type || '其他',
        }))
    );
    const importedAccList = getImportedAccounts('douyin');
    const fromImport: NoteItem[] = importedPosts
      .filter((p) => !deletedPostIds.has(p.id))
      .map((p) => {
        const acc = importedAccList.find((a) => a.recentPosts.some((rp) => rp.id === p.id));
        return {
          ...p,
          // 手动录入的内容自带 accountName，优先用它，不用反查账号表
          accountName: p.accountName || acc?.name || (p.sourceFile ? p.sourceFile.replace(/\.[^.]+$/, '') : '导入账号'),
          accountAvatar: acc?.avatar || '导',
          accountAvatarColor: acc?.avatarColor || 'from-cyan-400 to-blue-500',
          type: (p as any).type || '导入',
        };
      });
    const seen = new Set<string>();
    const dedup: NoteItem[] = [];
    [...fromImport, ...fromPool, ...fromAccounts].forEach((n) => {
      if (n.id && !seen.has(n.id)) {
        seen.add(n.id);
        dedup.push(n);
      } else if (!n.id) {
        dedup.push(n);
      }
    });
    return dedup;
  }, [accounts, importedPosts, deletedPostIds]);

  return (
    <div className="space-y-6">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 right-6 z-[60]"
          >
            <div
              className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg backdrop-blur-md ${
                toast.type === 'success'
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-100'
                  : 'bg-rose-500/20 border border-rose-500/40 text-rose-100'
              }`}
            >
              {toast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* 汇总指标 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="对标账号总数"
          value={accounts.length}
          unit="个"
          icon={<Video className="w-5 h-5" />}
          color="cyan"
          delay={0}
        />
        <StatCard
          title="对标总粉丝"
          value={formatNumber(totalFollowers)}
          unit="人"
          change={6.5}
          changeLabel="本周"
          icon={<Users className="w-5 h-5" />}
          color="blue"
          delay={0.1}
        />
        <StatCard
          title="平均互动率"
          value={avgEngagement}
          unit="%"
          change={1.2}
          changeLabel="环比"
          icon={<BarChart3 className="w-5 h-5" />}
          color="green"
          delay={0.2}
        />
        <StatCard
          title="已导入账号"
          value={importedCount}
          unit="个"
          icon={<Database className="w-5 h-5" />}
          color="orange"
          delay={0.3}
        />
      </div>

      {/* Tab 切换 */}
      <div className="flex items-center gap-1 p-1 rounded-xl glass-card-dark w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key ? 'text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            {activeTab === tab.key && (
              <motion.div
                layoutId="dy-tab-active"
                className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-400/20 to-blue-500/20 border border-cyan-400/30"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {tab.icon}
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25 }}
        >
          {activeTab === 'monitor' && (
            <BenchmarkMonitor
              accounts={accounts}
              platform="douyin"
              onAccountsChange={setAccounts}
              onAddAccount={() => setShowAddAccount(true)}
              onPoolChanged={(_, nextPosts) => {
                setImportedPosts(nextPosts);
              }}
            />
          )}

          {activeTab === 'upload' && (
            <div className="space-y-3">
            <CollapsibleSection number={1} title="上传文件（手动导表）" defaultOpen>
              <UploadTable platform="douyin" onConfirmImport={handleConfirmImport} onDeleteFile={handleDeleteFile} />
              <div className="mt-3 space-y-2 text-xs text-white/55">
                <p>• 支持 CSV / Excel (.xlsx, .xls) 格式的抖音运营数据表格</p>
                <p>• 上传后文件自动存入应用默认文件夹 <code className="text-amber-400 font-mono">/app/uploads/douyin/</code></p>
                <p>• 系统自动识别表头字段：账号 / 播放 / 粉丝 / 点赞 / 评论 / 收藏 / 分享</p>
                <p>• 点击<strong className="text-white">「确认录入」</strong>后，对标账号自动进入「对标监控」，视频自动进入「内容展示」</p>
                <p>• 内容展示可按<strong className="text-white">点赞 / 评论 / 分享 / 账号</strong>多选排序+过滤</p>
              </div>
            </CollapsibleSection>

            <CollapsibleSection number={2} title="让 AI 直接从网页取数" defaultOpen={false} accent="cyan">
              <BrowserFetchGuide platform="douyin" bare />
            </CollapsibleSection>
            </div>
          )}

          {activeTab === 'recreate' && (
            <GlassCard hoverable={false}>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <Film className="w-5 h-5 text-cyan-400" /> 视频内容展示池
                  </h3>
                  <p className="text-xs text-white/40 mt-0.5">
                    共 {recreateItems.length} 条 · 已导入 {importedPosts.length} 条 · 对标账号 {accounts.length} 个
                    {deletedPostIds.size > 0 && (
                      <span className="ml-2 text-amber-300">· 已隐藏 {deletedPostIds.size} 条</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 text-xs text-white/50">
                    <ArrowUpDown className="w-3 h-3" /> 多选过滤：
                  </div>
                  {filterOptionsDY.map((opt) => {
                    const active = activeFilters.has(opt.key);
                    return (
                      <button
                        key={opt.key}
                        onClick={() => {
                          setActiveFilters((prev) => {
                            const next = new Set(prev);
                            if (next.has(opt.key)) next.delete(opt.key);
                            else next.add(opt.key);
                            if (next.size === 0) next.add('likes');
                            return next;
                          });
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          active
                            ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-md'
                            : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 按账号过滤 */}
              {activeFilters.has('account') && allAccountNames.length > 0 && (
                <div className="mb-3 p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-white/50">账号筛选：</span>
                    <button
                      onClick={() => {
                        if (selectedAccounts.size === allAccountNames.length) setSelectedAccounts(new Set());
                        else setSelectedAccounts(new Set(allAccountNames));
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded ${
                        selectedAccounts.size === allAccountNames.length
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'bg-white/5 text-white/60 border border-white/10'
                      }`}
                    >
                      {selectedAccounts.size === allAccountNames.length ? '已选全部' : '全选账号'}
                    </button>
                    {selectedAccounts.size > 0 && (
                      <button
                        onClick={() => setSelectedAccounts(new Set())}
                        className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/60 border border-white/10 hover:text-white"
                      >
                        清除
                      </button>
                    )}
                    {allAccountNames.map((name) => {
                      const active = selectedAccounts.has(name);
                      return (
                        <button
                          key={name}
                          onClick={() => {
                            setSelectedAccounts((prev) => {
                              const next = new Set(prev);
                              if (next.has(name)) next.delete(name);
                              else next.add(name);
                              return next;
                            });
                          }}
                          className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-all ${
                            active
                              ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                              : 'bg-white/5 text-white/50 border-white/10 hover:text-white'
                          }`}
                        >
                          {active ? '✓' : '+'} {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 搜索 + 批量操作 */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                {/* 按日期筛选 */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-white/50">按日期</span>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-cyan-500/50 [color-scheme:dark]"
                  />
                  {filterDate && (
                    <button
                      onClick={() => setFilterDate('')}
                      className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 text-white/60 hover:text-white"
                    >
                      全部
                    </button>
                  )}
                </div>
                <div className="flex-1 relative min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="text"
                    placeholder="搜索热门视频标题或作者..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-10 pl-9 pr-4 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-1.5 px-3 h-10 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                  title="全选/取消全选"
                >
                  {selectedIds.size === sortedItems.length && sortedItems.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  <span>全选 ({sortedItems.length})</span>
                </button>
                {selectedIds.size > 0 && (
                  <button
                    onClick={() => {
                      const selected = sortedItems.filter((p) => selectedIds.has(p.id));
                      selected.forEach((post) => {
                        addReprocessTask({
                          postId: post.id,
                          title: post.title,
                          content: (post as any).content || '',
                          accountName: post.accountName || '',
                          coverUrl: coverOverrides[post.id] || (post as any).coverUrl,
                          videoUrl: (post as any).videoUrl,
                          audioUrl: (post as any).audioUrl,
                          platform: 'douyin',
                          addedAt: new Date().toISOString(),
                        });
                      });
                      showToast('success', `已批量加入 ${selected.length} 条到二创加工`);
                      setSelectedIds(new Set());
                      navigate('/reprocess?platform=douyin');
                    }}
                    className="flex items-center gap-1.5 px-3 h-10 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-medium hover:opacity-90"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    加入二创 ({selectedIds.size})
                  </button>
                )}
                {selectedIds.size > 0 && (
                  <button
                    onClick={handleDeleteMany}
                    className="flex items-center gap-1.5 px-3 h-10 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-medium hover:bg-rose-500/30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    删除选中 ({selectedIds.size})
                  </button>
                )}
                {deletedPostIds.size > 0 && (
                  <button
                    onClick={handleRestoreAll}
                    className="flex items-center gap-1.5 px-3 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/20"
                    title="把已删除的全部恢复"
                  >
                    ↺ 恢复 {deletedPostIds.size}
                  </button>
                )}
                <button
                  onClick={() => setShowAddContent(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 text-white text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  <Plus className="w-4 h-4" /> 添加视频
                </button>
              </div>

              {/* 排序提示 */}
              <div className="mb-3 p-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 flex items-center justify-between flex-wrap gap-2">
                <span>
                  排序权重：
                  {(['likes', 'comments', 'shares'] as const)
                    .filter((k) => activeFilters.has(k))
                    .map((k) => (
                      <span key={k} className="ml-1 text-cyan-300 font-medium">
                        {k === 'likes' ? '点赞×3' : k === 'comments' ? '评论×2' : '分享×1'}
                      </span>
                    ))}
                  {activeFilters.has('account') && selectedAccounts.size > 0 && (
                    <span className="ml-1 text-amber-300">
                      · 账号 {selectedAccounts.size} 个
                    </span>
                  )}
                </span>
                <span className="text-white/40">
                  共 {sortedItems.length} 条结果
                  {selectedIds.size > 0 && <span className="ml-2 text-cyan-300">· 已选 {selectedIds.size}</span>}
                </span>
              </div>

              {/* 视频卡片列表 */}
              {sortedItems.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {sortedItems.map((post, i) => {
                    const isSelected = selectedIds.has(post.id);
                    return (
                    <motion.div
                      key={post.id + i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={`glass-card-dark p-3 transition-all relative ${
                        isSelected ? 'border-cyan-500/50 ring-1 ring-cyan-500/30' : 'hover:border-cyan-500/30'
                      }`}
                    >
                      {/* checkbox — 卡片左上 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(post.id);
                        }}
                        className={`absolute top-2 left-2 z-10 w-5 h-5 rounded flex items-center justify-center backdrop-blur-sm transition-all ${
                          isSelected ? 'bg-cyan-500/80 text-white' : 'bg-black/40 text-white/40 hover:text-white opacity-0 group-hover:opacity-100'
                        }`}
                        style={{ opacity: isSelected ? 1 : undefined }}
                        title={isSelected ? '取消选中' : '选中'}
                      >
                        {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      </button>
                      {/* 删除按钮 — 右上角 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteOne(post.id, post.title);
                        }}
                        className="absolute top-2 right-2 z-10 w-6 h-6 rounded-md flex items-center justify-center bg-black/60 text-white/40 hover:text-rose-400 hover:bg-rose-500/80 opacity-0 group-hover:opacity-100 backdrop-blur-sm transition-all"
                        title="删除此视频"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <div
                        onClick={() => setDetailPost(post)}
                        className="relative w-full aspect-[9/16] rounded-lg overflow-hidden mb-2 group/cover cursor-pointer"
                      >
                        {coverOverrides[post.id] || (post as any).coverUrl ? (
                          <CoverWithFallback
                            url={coverOverrides[post.id] || (post as any).coverUrl}
                            title={post.title}
                            coverColor={post.coverColor}
                          />
                        ) : (
                          <div
                            className={`w-full h-full bg-gradient-to-br ${post.coverColor} flex items-center justify-center`}
                          >
                            <Play className="w-8 h-8 text-white/50 fill-white/20" />
                          </div>
                        )}
                        {/* 视频播放按钮 — 有 videoUrl 时显示 */}
                        {(post as any).videoUrl && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/cover:bg-black/30 transition-colors">
                            <div className="w-10 h-10 rounded-full bg-cyan-500/80 flex items-center justify-center opacity-0 group-hover/cover:opacity-100 transition-opacity backdrop-blur-sm">
                              <Play className="w-5 h-5 text-white fill-white" />
                            </div>
                          </div>
                        )}
                        <span className="absolute bottom-1.5 right-1.5 text-[10px] text-white/80 bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm">
                          {formatNumber(post.views)} 播放
                        </span>
                        {post.source === 'import' && (
                          <span className="absolute top-1.5 left-9 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/30 text-white border border-emerald-500/40 flex items-center gap-0.5 backdrop-blur-sm">
                            <Database className="w-2.5 h-2.5" /> 导入
                          </span>
                        )}
                        {/* 编辑封面按钮 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCoverEditPost({
                              id: post.id,
                              title: post.title,
                              coverUrl: coverOverrides[post.id] || (post as any).coverUrl,
                              coverColor: post.coverColor,
                            });
                          }}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/cover:opacity-100 hover:bg-cyan-500/80 transition-all backdrop-blur-sm"
                          title="编辑封面"
                        >
                          <ImageIcon className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`w-4 h-4 rounded bg-gradient-to-br ${post.accountAvatarColor || 'from-cyan-400 to-blue-500'} text-[9px] text-white font-bold flex items-center justify-center shrink-0`}
                        >
                          {post.accountAvatar || (post.accountName ? post.accountName.charAt(0) : '导')}
                        </span>
                        <span className="text-[10px] text-white/40 truncate">{post.accountName}{post.publishTime ? ` · ${post.publishTime}` : ''}</span>
                      </div>
                      <h4 className="text-white font-medium text-xs mb-1 line-clamp-2 min-h-[2rem]">{post.title}</h4>
                      {(post as any).content && (
                        <p
                          onClick={() => setDetailPost(post)}
                          className="text-[10px] text-white/50 line-clamp-2 mb-2 cursor-pointer hover:text-white/80 transition-colors"
                          title="点击查看完整内容"
                        >
                          📝 {((post as any).content as string).slice(0, 60)}
                          {((post as any).content as string).length > 60 ? '...' : ''}
                        </p>
                      )}
                      <div className="grid grid-cols-3 gap-1 text-[10px]">
                        <div
                          className={`p-1.5 rounded text-center ${
                            activeFilters.has('likes')
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-white/5 text-white/50'
                          }`}
                        >
                          <Heart className="w-2.5 h-2.5 mx-auto mb-0.5" />
                          {formatNumber(post.likes)}
                        </div>
                        <div
                          className={`p-1.5 rounded text-center ${
                            activeFilters.has('comments')
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              : 'bg-white/5 text-white/50'
                          }`}
                        >
                          <MessageCircle className="w-2.5 h-2.5 mx-auto mb-0.5" />
                          {formatNumber(post.comments)}
                        </div>
                        <div
                          className={`p-1.5 rounded text-center ${
                            activeFilters.has('shares')
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-white/5 text-white/50'
                          }`}
                        >
                          <Share2 className="w-2.5 h-2.5 mx-auto mb-0.5" />
                          {formatNumber(post.shares)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                        <span className="text-[10px] text-white/30 flex items-center gap-0.5">
                          👁 {formatNumber(post.views)}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              addReprocessTask({
                                postId: post.id,
                                title: post.title,
                                content: (post as any).content || '',
                                accountName: post.accountName || '',
                                coverUrl: coverOverrides[post.id] || (post as any).coverUrl,
                                videoUrl: (post as any).videoUrl,
                                audioUrl: (post as any).audioUrl,
                                platform: 'douyin',
                                addedAt: new Date().toISOString(),
                              });
                              showAddToReprocessToast(post);
                              navigate('/reprocess?platform=douyin');
                            }}
                            className="text-[10px] px-2 py-0.5 rounded bg-gradient-to-r from-cyan-400 to-blue-500 text-white hover:opacity-90"
                            title="加入二创加工任务"
                          >
                            + 二创
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteOne(post.id, post.title);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/40 hover:bg-rose-500/20 hover:text-rose-300 flex items-center gap-0.5"
                            title="删除此视频"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <Film className="w-12 h-12 text-white/15" />
                  <p className="text-sm text-white/50">暂无视频内容</p>
                  <div className="text-xs text-white/40 max-w-lg leading-relaxed space-y-1">
                    {/* 诊断信息：根据数据状况给出针对性提示 */}
                    {accounts.filter((a) => (a as any).source === 'import').length === 0 ? (
                      <p className="text-amber-300/90">
                        ⚠️ 当前没有任何<strong>真实导入</strong>的抖音账号。
                      </p>
                    ) : null}
                    {importedPosts.length === 0 && accounts.filter((a) => (a as any).source === 'import').length > 0 ? (
                      <p className="text-amber-300/90">
                        ⚠️ 已导入 {accounts.filter((a) => (a as any).source === 'import').length} 个账号，但<strong>没有任何内容记录</strong>。
                        请确认表格里包含<strong>「笔记标题 / 标题 / title」</strong>列。
                      </p>
                    ) : null}
                    {deletedPostIds.size > 0 && sortedItems.length === 0 ? (
                      <p className="text-amber-300/90">
                        ⚠️ 全部 {deletedPostIds.size} 条内容都在「已删除」池里。
                        点上方「↺ 恢复」按钮即可重新显示。
                      </p>
                    ) : null}
                    <p className="pt-1">
                      排查建议：① 切换到「数据导入」Tab 重新上传；② 检查多选过滤（点赞 / 评论 / 分享 / 账号）；
                      ③ 清空搜索关键词；④ 点下面「重新拉取数据」刷新本地 state。
                    </p>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => {
                        // 强制从 localStorage 重新拉取
                        const importedAccs = getImportedAccounts('douyin');
                        const fresh = getImportedPosts('douyin');
                        setAccounts(importedAccs);
                        setImportedPosts(fresh);
                        setDeletedPostIds(new Set(getDeletedPostIds('douyin')));
                        setSelectedIds(new Set());
                        setSelectedAccounts(new Set());
                        setActiveFilters(new Set(['likes']));
                        setSearch('');
                        showToast('success', `已重新拉取：${importedAccs.length} 账号 / ${fresh.length} 内容`);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-200 text-xs font-medium hover:bg-cyan-500/30"
                    >
                      🔄 重新拉取数据
                    </button>
                    <button
                      onClick={() => setShowDebug((v) => !v)}
                      className="px-3 py-2 rounded-lg bg-white/5 text-white/40 text-xs hover:bg-white/10"
                    >
                      {showDebug ? '隐藏' : '显示'}诊断
                    </button>
                  </div>
                  {showDebug && (
                    <div className="mt-3 p-3 rounded-lg bg-black/40 border border-white/10 text-left text-[10px] text-white/60 font-mono max-w-md w-full">
                      <div>accounts 总数：{accounts.length}</div>
                      <div>其中 import 账号：{accounts.filter((a) => (a as any).source === 'import').length}</div>
                      <div>importedPosts：{importedPosts.length}</div>
                      <div>已删除：{deletedPostIds.size}</div>
                      <div>当前过滤：{Array.from(activeFilters).join(', ') || '无'}</div>
                      <div>账号筛选：{selectedAccounts.size > 0 ? Array.from(selectedAccounts).join(', ') : '无'}</div>
                      <div>搜索：{search || '无'}</div>
                    </div>
                  )}
                </div>
              )}
            </GlassCard>
          )}

          {activeTab === 'stats' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-white font-semibold text-base flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-cyan-400" /> 抖音数据统计看板
                </h3>
                <p className="text-xs text-white/40">多维组合分析与排行榜 · 洞察增长机会</p>
              </div>
              <DataStatsPanel platform="douyin" notes={allNotes} contentLabel="视频" />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* 添加对标账号 Modal */}
      {showAddAccount && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowAddAccount(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-white/10 p-6"
            style={{ background: 'linear-gradient(180deg, rgba(30,30,50,0.95), rgba(20,20,40,0.95))' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-lg">添加对标账号</h3>
              <button
                onClick={() => setShowAddAccount(false)}
                className="w-8 h-8 rounded-md flex items-center justify-center text-white/60 hover:bg-white/10"
              >
                ×
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/50 block mb-1">账号名称 *</label>
                <input
                  type="text"
                  value={newAccount.name}
                  onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
                  placeholder="例：竞品账号"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/50 block mb-1">粉丝数</label>
                  <input
                    type="number"
                    value={newAccount.followers}
                    onChange={(e) => setNewAccount({ ...newAccount, followers: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">平均点赞</label>
                  <input
                    type="number"
                    value={newAccount.avgLikes}
                    onChange={(e) => setNewAccount({ ...newAccount, avgLikes: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">平均评论</label>
                  <input
                    type="number"
                    value={newAccount.avgComments}
                    onChange={(e) => setNewAccount({ ...newAccount, avgComments: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">平均收藏</label>
                  <input
                    type="number"
                    value={newAccount.avgCollects}
                    onChange={(e) => setNewAccount({ ...newAccount, avgCollects: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-white/50 block mb-1">平均分享</label>
                  <input
                    type="number"
                    value={newAccount.avgShares}
                    onChange={(e) => setNewAccount({ ...newAccount, avgShares: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setShowAddAccount(false)}
                className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm hover:bg-white/10"
              >
                取消
              </button>
              <button
                onClick={addAccount}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 text-white text-sm font-medium hover:opacity-90"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 内容详情 Modal */}
      {detailPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setDetailPost(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
          >
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">{detailPost.title}</h3>
                <p className="text-xs text-white/50 mt-0.5">
                  {detailPost.accountName} · {detailPost.publishTime}
                </p>
              </div>
              <button
                onClick={() => setDetailPost(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            <div className="p-5 overflow-y-auto scrollbar-thin flex-1">
              {detailPost.coverUrl && (
                <div className="mb-4 rounded-lg overflow-hidden max-w-xs mx-auto">
                  <img
                    src={detailPost.coverUrl}
                    alt={detailPost.title}
                    className="w-full h-auto max-h-72 object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
              <div className="flex gap-2 mb-4 flex-wrap text-xs">
                <span className="px-2 py-1 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
                  ❤️ {formatNumber(detailPost.likes)}
                </span>
                <span className="px-2 py-1 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  💬 {formatNumber(detailPost.comments)}
                </span>
                <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  🔁 {formatNumber(detailPost.shares)}
                </span>
                <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  👁 {formatNumber(detailPost.views)}
                </span>
              </div>
              <h4 className="text-sm text-white/80 font-medium mb-2">📝 视频内容/脚本</h4>
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                {(detailPost as any).content || '（未提供正文内容，可手动输入或导入含"笔记内容"列的表格）'}
              </div>
            </div>
            <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  const txt = (detailPost as any).content || detailPost.title;
                  navigator.clipboard?.writeText(txt).then(() => {
                    showToast('success', '已复制到剪贴板');
                  });
                }}
                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-sm flex items-center gap-1.5"
              >
                📋 复制内容
              </button>
              <button
                onClick={() => {
                  addReprocessTask({
                    postId: detailPost.id,
                    title: detailPost.title,
                    content: (detailPost as any).content || '',
                    accountName: detailPost.accountName || '',
                    coverUrl: detailPost.coverUrl,
                    videoUrl: (detailPost as any).videoUrl,
                    audioUrl: (detailPost as any).audioUrl,
                    platform: 'douyin',
                    addedAt: new Date().toISOString(),
                  });
                  showAddToReprocessToast(detailPost);
                  setDetailPost(null);
                  navigate('/reprocess?platform=douyin');
                }}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 text-white text-sm font-medium hover:opacity-90 flex items-center gap-1.5"
              >
                ✨ 加入二创加工
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 编辑封面 Modal */}
      <CoverEditorModal
        open={!!coverEditPost}
        onClose={() => setCoverEditPost(null)}
        currentCoverUrl={coverEditPost?.coverUrl}
        currentCoverColor={coverEditPost?.coverColor}
        postTitle={coverEditPost?.title}
        onSave={(url) => {
          if (coverEditPost) saveCoverOverride(coverEditPost.id, url);
        }}
      />
      {/* 视频播放 Modal（点开视频卡片时弹出） */}
      <Modal
        open={!!detailPost}
        onClose={() => setDetailPost(null)}
        title={detailPost?.title || '视频详情'}
        subtitle={detailPost?.accountName || ''}
        maxWidth="max-w-3xl"
      >
        {detailPost && (
          <div className="space-y-4">
            {/* 视频播放区 */}
            <div className="w-full rounded-xl overflow-hidden bg-black border border-white/10">
              {detailPost.videoUrl ? (
                <VideoPlayer
                  src={detailPost.videoUrl}
                  poster={detailPost.coverUrl}
                  onError={() => {
                    // 已经在 VideoPlayer 内部 toast 提示过了
                  }}
                  onParsed={async (parsed) => {
                    // 解析成功：1) 写回 imported 池 2) 写回 accounts 池 3) 刷新 detailPost 让 Modal 重渲染
                    try {
                      const { updatePost, updateAccountPost } = await import('../../utils/parseTable');
                      // 写回 importedPosts
                      updatePost('douyin', detailPost.id, { videoUrl: parsed.url });
                      // 写回 importedAccounts（按 source 标记）
                      const accId = detailPost.id.split('-p')[0];
                      updateAccountPost('douyin', accId, detailPost.id, { videoUrl: parsed.url });
                      // 同步更新本地 state
                      setImportedPosts((prev) =>
                        prev.map((p) => (p.id === detailPost.id ? { ...p, videoUrl: parsed.url } : p))
                      );
                      setAccounts((prev) =>
                        prev.map((a) => ({
                          ...a,
                          recentPosts: a.recentPosts.map((p) =>
                            p.id === detailPost.id ? { ...p, videoUrl: parsed.url } : p
                          ),
                        }))
                      );
                      // 重置 detailPost 触发 Modal 重新渲染（用新 URL 重新打开）
                      setDetailPost({ ...detailPost, videoUrl: parsed.url });
                      showToast('success', '✓ 视频已自动解析并保存，下次打开直接播放');
                    } catch (e: any) {
                      console.error('[onParsed] 写回失败', e);
                      showToast('error', '视频解析成功但保存失败：' + e?.message);
                    }
                  }}
                />
              ) : (
                <div className="aspect-video flex flex-col items-center justify-center text-white/40 text-sm gap-2">
                  <Film className="w-12 h-12 text-white/20" />
                  <p>该视频没有可播放的链接（视频URL 字段为空）</p>
                  <p className="text-[10px] text-white/30">
                    上传表格时请加「视频链接 / video / play_url」列
                  </p>
                </div>
              )}
            </div>

            {/* 完整内容 */}
            {detailPost.content ? (
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <div className="text-[10px] text-white/40 mb-1.5">标题文案</div>
                <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                  {detailPost.content}
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-xs text-white/40 text-center">
                暂无文案（可能上传表格没有"内容/文案/正文"列）
              </div>
            )}

            {/* 互动数据 */}
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <div className="text-[10px] text-white/40 mb-0.5">点赞</div>
                <div className="text-xl font-bold text-rose-300">
                  {formatNumber(detailPost.likes)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <div className="text-[10px] text-white/40 mb-0.5">评论</div>
                <div className="text-xl font-bold text-cyan-300">
                  {formatNumber(detailPost.comments)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="text-[10px] text-white/40 mb-0.5">收藏</div>
                <div className="text-xl font-bold text-amber-300">
                  {formatNumber(detailPost.collects)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-[10px] text-white/40 mb-0.5">分享</div>
                <div className="text-xl font-bold text-emerald-300">
                  {formatNumber(detailPost.shares)}
                </div>
              </div>
            </div>

            {/* 播放 / 链接 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-[10px] text-white/40 mb-0.5">播放量</div>
                <div className="text-xl font-bold text-white">
                  {formatNumber(detailPost.views)}
                </div>
                <div className="text-[10px] text-white/30 mt-0.5">{detailPost.publishTime}</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-[10px] text-white/40 mb-0.5">视频链接</div>
                {detailPost.videoUrl ? (
                  <a
                    href={detailPost.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-cyan-300 hover:text-cyan-200 break-all line-clamp-2"
                  >
                    {detailPost.videoUrl}
                  </a>
                ) : (
                  <div className="text-xs text-white/30">未提供</div>
                )}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  if (detailPost?.content) {
                    navigator.clipboard?.writeText(detailPost.content);
                    showToast('success', '已复制标题文案到剪贴板');
                  } else {
                    showToast('info', '该视频没有文案可复制');
                  }
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 text-white text-sm font-medium hover:opacity-90"
              >
                📋 复制标题文案
              </button>
              <button
                onClick={() => setDetailPost(null)}
                className="px-4 py-2 rounded-lg bg-white/5 text-white/80 text-sm hover:bg-white/10"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* 手动录入一条视频（「添加视频」按钮） */}
      <AddContentModal
        open={showAddContent}
        onClose={() => setShowAddContent(false)}
        platform="douyin"
        onAdded={(title, enqueued) => {
          setImportedPosts(getImportedPosts('douyin'));
          showToast(
            'success',
            enqueued
              ? `已录入「${title.slice(0, 16)}」并加入二创加工`
              : `已录入「${title.slice(0, 16)}」`
          );
        }}
      />
    </div>
  );
};

export default Douyin;
