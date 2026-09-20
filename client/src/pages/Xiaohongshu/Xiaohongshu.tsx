import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  BarChart3,
  Upload,
  Sparkles,
  Users,
  Plus,
  Search,
  Edit3,
  Heart,
  MessageCircle,
  MessageSquare,
  Bookmark,
  Eye,
  Database,
  ArrowUpDown,
  TrendingUp,
  Image as ImageIcon,
  Trash2,
  CheckSquare,
  Square,
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
import CoverWithFallback from '../../components/CoverWithFallback';
import { xhsBenchmarkAccounts, xhsNotesPool, type NoteItem } from '../../data/mock';
import type { BenchmarkAccount } from '../../types';
import { formatNumber } from '../../utils/format';
import {
  getImportedAccounts,
  getImportedPosts,
  hasRealAccounts,
  type ParsedAccount,
  type ParsedPost,
} from '../../utils/parseTable';
import { getDeletedPostIds, deleteOnePost, deleteManyPosts, restoreAllDeletedPosts } from '../../utils/deletedPosts';
import { addReprocessTask } from '../../utils/reprocessQueue';
import { getActiveTab, setActiveTabPersistent } from '../../utils/tabPersistence';
import AddContentModal from '../../components/AddContentModal';

type TabKey = 'monitor' | 'upload' | 'recreate' | 'stats';
type SortKeyXHS = 'comments' | 'collects' | 'messages';

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'monitor', label: '对标监控', icon: <BarChart3 className="w-4 h-4" /> },
  { key: 'upload', label: '数据导入', icon: <Upload className="w-4 h-4" /> },
  { key: 'recreate', label: '内容展示', icon: <Edit3 className="w-4 h-4" /> },
  { key: 'stats', label: '数据统计', icon: <TrendingUp className="w-4 h-4" /> },
];

// 内容展示多选 chip：评论/收藏/留言参与排序权重，账号做"按账号过滤"
type FilterKey = SortKeyXHS | 'account';
const filterOptionsXHS: { key: FilterKey; label: string; icon: React.ReactNode }[] = [
  { key: 'comments', label: '按评论', icon: <MessageCircle className="w-3.5 h-3.5" /> },
  { key: 'collects', label: '按收藏', icon: <Bookmark className="w-3.5 h-3.5" /> },
  { key: 'messages', label: '按留言', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { key: 'account', label: '按账号', icon: <Users className="w-3.5 h-3.5" /> },
];

const Xiaohongshu: React.FC = () => {
  // Tab 持久化：刷新后能恢复上次停留的 Tab
  const [activeTab, setActiveTabRaw] = useState<TabKey>(() => getActiveTab<TabKey>('xiaohongshu', 'monitor'));
  const setActiveTab = (tab: TabKey) => {
    setActiveTabRaw(tab);
    setActiveTabPersistent('xiaohongshu', tab);
  };
  // 合并 mock + 已导入账号
  // 关键修复：有真实导入数据时**不再**追加 mock 账号（否则清空已录入池后 4 个 mock 仍残留）
  const [accounts, setAccounts] = useState(() => {
    const imported = getImportedAccounts('xiaohongshu') as unknown as typeof xhsBenchmarkAccounts;
    if (imported.length > 0) return imported;
    // 已录入池为空时，只有「从未录入过真实账号」才展示内置示例；
    // 若是用户导入后主动删空的，必须保持空列表，不能让示例账号又冒出来。
    return hasRealAccounts('xiaohongshu') ? [] : [...xhsBenchmarkAccounts];
  });
  // 已导入的内容（id → post 的 map）
  const [importedPosts, setImportedPosts] = useState<ParsedPost[]>(() => getImportedPosts('xiaohongshu'));

  // 手动录入一条内容（内容展示页「添加二创」按钮）
  const [showAddContent, setShowAddContent] = useState(false);

  // 内容二创 — 用户删除池（按 postId 存）
  const [deletedPostIds, setDeletedPostIds] = useState<Set<string>>(() => getDeletedPostIds('xiaohongshu'));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 多选账号过滤（仅 activeFilters 包含 'account' 时生效）
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

  // 用户自定义封面覆盖（按 postId 存到 localStorage）
  const COVER_KEY = 'xhs_cover_overrides_v1';
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
      id: `xhs-add-${Date.now()}`,
      platform: 'xiaohongshu',
      name: newAccount.name.trim(),
      avatar: newAccount.name.trim().charAt(0).toUpperCase().slice(0, 1) || '新',
      avatarColor: 'from-rose-500 to-pink-500',
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

  // 多选过滤：评论/收藏/留言参与排序权重（score=对应值），账号做"按账号过滤"
  // 默认：只勾选"按评论"，相当于按评论降序
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(() => new Set(['comments']));
  const [search, setSearch] = useState('');
  // 内容展示 · 按发布日期筛选（YYYY-MM-DD）
  const [filterDate, setFilterDate] = useState('');
  // 内容详情 Modal
  const [detailPost, setDetailPost] = useState<any>(null);
  // 加入二创的 Toast 反馈
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2400);
  };
  const showAddToReprocessToast = (post: any) => {
    showToast('success', `已加入二创加工：${post.title?.slice(0, 16) || '未命名'}`);
  };

  const handleConfirmImport = (result: { accounts: ParsedAccount[]; posts: ParsedPost[]; fileName: string }) => {
    // 注意：accounts/posts 已经由 UploadTable 的 mergeImportedAccounts 写入 imported 池
    // 这里**只负责**把 imported 池的"全部"账号同步到 accounts state（避免重复叠加）
    const importedAccs = getImportedAccounts('xiaohongshu');
    const importedPostsFresh = getImportedPosts('xiaohongshu');
    setAccounts(importedAccs);
    setImportedPosts(importedPostsFresh);
    // 之前固定跳 monitor → 用户看不到刚上传的笔记，反复要点内容展示
    // 现在改：导入成功后**自动跳到内容展示**，让用户立刻看到数据
    setActiveTab('recreate');
    if (importedPostsFresh.length === 0 && importedAccs.length === 0) {
      setActiveTab('upload');
    }
  };

  // 删文件时：从 accounts state 里删掉这些账号（imported 池+同步池已由 UploadTable 清掉）
  // 删文件时：从 accounts state 里删掉这些账号（imported 池+同步池已由 UploadTable 清掉）
  // 关键：删除后重新读取 imported 池，**如果空了**就回到 mock 兜底（避免视觉上账号"消失"得太突兀）
  const handleDeleteFile = (result: { fileName: string; removedAccountNames: string[] }) => {
    const removedSet = new Set(result.removedAccountNames);
    setAccounts((prev) => prev.filter((a) => !removedSet.has(a.name)));
    setImportedPosts((prev) => prev.filter((p) => !removedSet.has((p as any).accountName)));
    // 完全清空（fileName='__all__' 或 imported 池已空）→ 重新判断是否回退 mock
    if (result.fileName === '__all__') {
      const fresh = getImportedAccounts('xiaohongshu');
      if (fresh.length === 0) {
        // imported 池已空 → 回到 mock 兜底（用户首次进入可看示例数据）
        setAccounts([...xhsBenchmarkAccounts]);
      } else {
        setAccounts(fresh);
      }
    }
  };

  // 内容二创 → 路由到加工页
  const navigate = useNavigate();

  // 汇总数据
  const totalFollowers = accounts.reduce((s, a) => s + a.followers, 0);
  const avgEngagement = (accounts.reduce((s, a) => s + a.engagementRate, 0) / Math.max(accounts.length, 1)).toFixed(1);
  const pendingSync = accounts.filter((a) => a.syncStatus === 'pending' || a.hasUpdate).length;
  const importedCount = accounts.filter((a: any) => a.source === 'import').length;

  // 内容二创数据源：mock 账号的 recentPosts + 导入池
  // 去重规则：按 id 去重（mock 笔记池 / 对标账号池 / 导入池可能同 id 重复）
  // 过滤规则：剔除用户已删除池中的 id
  // 防复发设计：source 字段 + importedAccounts 重叠双重判定，避免老数据丢 source 导致空列表
  const recreateItems = useMemo(() => {
    const importedAccList = getImportedAccounts('xiaohongshu');
    const importedIds = new Set(importedAccList.map((a) => a.id));
    const fromAccounts: (any & { accountName: string; accountAvatar: string; accountAvatarColor: string })[] = [];
    accounts.forEach((a) => {
      const isImported = (a as any).source === 'import' || importedIds.has(a.id);
      if (!isImported) return; // 跳过 mock 账号
      if (!a.recentPosts || a.recentPosts.length === 0) return;
      a.recentPosts.forEach((p) => {
        fromAccounts.push({
          ...p,
          accountName: a.name,
          accountAvatar: a.avatar,
          accountAvatarColor: a.avatarColor,
        });
      });
    });
    // 给导入内容也补 accountName（优先用 fileName 解析；找不到时用 defaultAccount）
    const importedFlat = importedPosts.map((p) => {
      const acc = importedAccList.find((a) => a.recentPosts.some((rp) => rp.id === p.id));
      return {
        ...p,
        accountName: p.accountName || acc?.name || (p.sourceFile ? p.sourceFile.replace(/\.[^.]+$/, '') : '导入账号'),
        accountAvatar: acc?.avatar || '导',
        accountAvatarColor: acc?.avatarColor || 'from-rose-500 to-pink-500',
      };
    });
    // 合并 + 去重（按 id） + 过滤已删除池
    const all = [...importedFlat, ...fromAccounts];
    const seen = new Set<string>();
    return all.filter((it) => {
      if (!it.id) return false;
      if (deletedPostIds.has(it.id)) return false;
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
  }, [accounts, importedPosts, deletedPostIds]);

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

    // "按账号" 过滤（仅在 activeFilters 包含 'account' 且有选中账号时生效）
    if (activeFilters.has('account') && selectedAccounts.size > 0) {
      arr = arr.filter((it) => selectedAccounts.has(it.accountName || ''));
    }

    // 计算排序权重分
    const sortKeys = ['comments', 'collects', 'messages'].filter((k) =>
      activeFilters.has(k as FilterKey)
    );
    // 如果没选任何排序键，默认按评论
    const effectiveSortKeys = sortKeys.length > 0 ? sortKeys : ['comments'];

    return arr
      .map((it) => ({
        ...it,
        // 加权分：评论×3（最直观）+ 收藏×2 + 留言（用评论数代替）×1
        _sortScore:
          (activeFilters.has('comments') ? (it.comments || 0) * 3 : 0) +
          (activeFilters.has('collects') ? (it.collects || 0) * 2 : 0) +
          (activeFilters.has('messages') ? (it.comments || 0) : 0), // 留言=评论（无独立字段）
      }))
      .sort((a, b) => b._sortScore - a._sortScore);
  }, [recreateItems, activeFilters, selectedAccounts, search, filterDate]);

  // 全部可用的账号名（去重），用于"按账号" chip 下拉
  const allAccountNames = useMemo(() => {
    const s = new Set<string>();
    recreateItems.forEach((it) => {
      if (it.accountName) s.add(it.accountName);
    });
    return Array.from(s);
  }, [recreateItems]);

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
    const next = deleteOnePost('xiaohongshu', id);
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
    const next = deleteManyPosts('xiaohongshu', Array.from(selectedIds));
    setDeletedPostIds(new Set(next));
    setSelectedIds(new Set());
  };
  const handleRestoreAll = () => {
    if (deletedPostIds.size === 0) return;
    if (!window.confirm(`确定恢复全部已删除的 ${deletedPostIds.size} 条内容？`)) return;
    setDeletedPostIds(restoreAllDeletedPosts('xiaohongshu'));
    setSelectedIds(new Set());
  };

  // 数据统计 - 合并 3 个数据源：xhsNotesPool + accounts.recentPosts + 已导入池
  // 注意：过滤掉 deletedPostIds 中的 post（与内容展示 Tab 同步）
  // 如果用户已上传过数据（importedPosts.length > 0），不再混入 mock 池，避免"胡编乱造"
  const allNotes = useMemo<NoteItem[]>(() => {
    const fromPool: NoteItem[] = importedPosts.length === 0
      ? xhsNotesPool.map((n) => ({ ...n }))
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
    const importedAccList = getImportedAccounts('xiaohongshu');
    const fromImport: NoteItem[] = importedPosts
      .filter((p) => !deletedPostIds.has(p.id))
      .map((p) => {
        const acc = importedAccList.find((a) => a.recentPosts.some((rp) => rp.id === p.id));
        return {
          ...p,
          accountName: p.accountName || acc?.name || (p.sourceFile ? p.sourceFile.replace(/\.[^.]+$/, '') : '导入账号'),
          accountAvatar: acc?.avatar || '导',
          accountAvatarColor: acc?.avatarColor || 'from-rose-500 to-pink-500',
          type: (p as any).type || '导入',
        };
      });
    // 去重：按 id 优先保留 imported
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
          icon={<BookOpen className="w-5 h-5" />}
          color="pink"
          delay={0}
        />
        <StatCard
          title="对标总粉丝"
          value={formatNumber(totalFollowers)}
          unit="人"
          change={4.2}
          changeLabel="本周"
          icon={<BarChart3 className="w-5 h-5" />}
          color="purple"
          delay={0.1}
        />
        <StatCard
          title="平均互动率"
          value={avgEngagement}
          unit="%"
          change={0.8}
          changeLabel="环比"
          icon={<Sparkles className="w-5 h-5" />}
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
                layoutId="xhs-tab-active"
                className="absolute inset-0 rounded-lg bg-gradient-to-r from-rose-500/20 to-pink-500/20 border border-rose-500/30"
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
              platform="xiaohongshu"
              onAccountsChange={setAccounts}
              onAddAccount={() => setShowAddAccount(true)}
              onPoolChanged={(nextAccs, nextPosts) => {
                // 同步更新本地 state，让内容二创/数据统计立即响应
                setImportedPosts(nextPosts);
              }}
            />
          )}

          {activeTab === 'upload' && (
            <div className="space-y-3">
            <CollapsibleSection number={1} title="上传文件（手动导表）" defaultOpen>
              <UploadTable platform="xiaohongshu" onConfirmImport={handleConfirmImport} onDeleteFile={handleDeleteFile} />
              <div className="mt-3 space-y-2 text-xs text-white/55">
                <p>• 支持 CSV / Excel (.xlsx, .xls) 格式的小红书运营数据表格</p>
                <p>• 上传后文件自动存入应用默认文件夹 <code className="text-amber-400 font-mono">/app/uploads/xiaohongshu/</code></p>
                <p>• 系统自动识别表头字段：账号 / 粉丝 / 点赞 / 评论 / 收藏 / 分享 / 标题</p>
                <p>• 点击<strong className="text-white">「确认录入」</strong>后，对标账号自动进入「对标监控」，笔记自动进入「内容展示」</p>
                <p>• 内容展示可按<strong className="text-white">评论 / 收藏 / 留言 / 账号</strong>多选排序+过滤，点卡片看笔记内容</p>
              </div>
            </CollapsibleSection>

            <CollapsibleSection number={2} title="让 AI 直接从网页取数" defaultOpen={false} accent="cyan">
              <BrowserFetchGuide platform="xiaohongshu" bare />
            </CollapsibleSection>
            </div>
          )}

          {activeTab === 'recreate' && (
            <GlassCard hoverable={false}>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <Edit3 className="w-5 h-5 text-rose-400" /> 内容展示池
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
                  {filterOptionsXHS.map((opt) => {
                    const active = activeFilters.has(opt.key);
                    return (
                      <button
                        key={opt.key}
                        onClick={() => {
                          setActiveFilters((prev) => {
                            const next = new Set(prev);
                            if (next.has(opt.key)) next.delete(opt.key);
                            else next.add(opt.key);
                            // 至少保留一个（避免空排序）
                            if (next.size === 0) next.add('comments');
                            return next;
                          });
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          active
                            ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md'
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

              {/* 按账号过滤（仅在 activeFilters 包含 'account' 时显示） */}
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
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
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
                              ? 'bg-rose-500/20 text-rose-200 border-rose-500/40'
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
                    className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-rose-500/50 [color-scheme:dark]"
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
                    placeholder="搜索爆款笔记标题或账号名..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-10 pl-9 pr-4 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-rose-500/50"
                  />
                </div>
                {/* 全选 checkbox */}
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-1.5 px-3 h-10 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                  title="全选/取消全选"
                >
                  {selectedIds.size === sortedItems.length && sortedItems.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  <span>全选 ({sortedItems.length})</span>
                </button>
                {/* 批量加入二创 */}
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
                          platform: 'xiaohongshu',
                          addedAt: new Date().toISOString(),
                        });
                      });
                      showToast('success', `已批量加入 ${selected.length} 篇到二创加工`);
                      setSelectedIds(new Set());
                      navigate('/reprocess?platform=xiaohongshu');
                    }}
                    className="flex items-center gap-1.5 px-3 h-10 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-medium hover:opacity-90"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    加入二创 ({selectedIds.size})
                  </button>
                )}
                {/* 批量删除 */}
                {selectedIds.size > 0 && (
                  <button
                    onClick={handleDeleteMany}
                    className="flex items-center gap-1.5 px-3 h-10 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-medium hover:bg-rose-500/30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    删除选中 ({selectedIds.size})
                  </button>
                )}
                {/* 恢复所有已删除 */}
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
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  <Plus className="w-4 h-4" /> 添加二创
                </button>
              </div>

              {/* 排序提示 */}
              <div className="mb-3 p-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 flex items-center justify-between flex-wrap gap-2">
                <span>
                  排序权重：
                  {(['comments', 'collects', 'messages'] as const)
                    .filter((k) => activeFilters.has(k))
                    .map((k) => (
                      <span key={k} className="ml-1 text-rose-300 font-medium">
                        {k === 'comments' ? '评论×3' : k === 'collects' ? '收藏×2' : '留言×1'}
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
                  {selectedIds.size > 0 && <span className="ml-2 text-rose-300">· 已选 {selectedIds.size}</span>}
                </span>
              </div>

              {/* 列表 */}
              {sortedItems.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {sortedItems.map((post, i) => {
                    const isSelected = selectedIds.has(post.id);
                    return (
                    <motion.div
                      key={post.id + i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={`glass-card-dark p-3 transition-all relative ${
                        isSelected
                          ? 'border-rose-500/50 ring-1 ring-rose-500/30'
                          : 'hover:border-rose-500/30'
                      }`}
                    >
                      {/* checkbox — 卡片左上角 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(post.id);
                        }}
                        className={`absolute top-2 left-2 z-10 w-5 h-5 rounded flex items-center justify-center backdrop-blur-sm transition-all ${
                          isSelected
                            ? 'bg-rose-500/80 text-white'
                            : 'bg-black/40 text-white/40 hover:text-white opacity-0 group-hover:opacity-100'
                        }`}
                        style={{ opacity: isSelected ? 1 : undefined }}
                        title={isSelected ? '取消选中' : '选中'}
                      >
                        {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      </button>
                      {/* 删除按钮 — 卡片右上角（hover 显示） */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteOne(post.id, post.title);
                        }}
                        className="absolute top-2 right-2 z-10 w-6 h-6 rounded-md flex items-center justify-center bg-black/60 text-white/40 hover:text-rose-400 hover:bg-rose-500/80 opacity-0 group-hover:opacity-100 backdrop-blur-sm transition-all"
                        title="删除此内容"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <div className="relative w-full h-32 rounded-lg overflow-hidden mb-2 group/cover">
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
                            <Edit3 className="w-8 h-8 text-white/40" />
                          </div>
                        )}
                        {post.source === 'import' && (
                          <span className="absolute top-1.5 left-9 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/30 text-white border border-emerald-500/40 flex items-center gap-0.5 backdrop-blur-sm">
                            <Database className="w-2.5 h-2.5" /> 导入
                          </span>
                        )}
                        {/* 编辑封面按钮（hover 显示） */}
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
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/cover:opacity-100 hover:bg-purple-500/80 transition-all backdrop-blur-sm"
                          title="编辑封面"
                        >
                          <ImageIcon className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span
                          className={`w-4 h-4 rounded bg-gradient-to-br ${post.accountAvatarColor || 'from-rose-500 to-pink-500'} text-[9px] text-white font-bold flex items-center justify-center shrink-0`}
                        >
                          {post.accountAvatar || (post.accountName ? post.accountName.charAt(0) : '导')}
                        </span>
                        <span className="text-[10px] text-white/40 truncate">{post.accountName}{post.publishTime ? ` · ${post.publishTime}` : ''}</span>
                      </div>
                      <h4 className="text-white font-medium text-xs mb-1 line-clamp-2 min-h-[2rem]">{post.title}</h4>
                      {/* 笔记内容摘要（点击打开 Modal） */}
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
                            activeFilters.has('collects')
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-white/5 text-white/50'
                          }`}
                        >
                          <Bookmark className="w-2.5 h-2.5 mx-auto mb-0.5" />
                          {formatNumber(post.collects)}
                        </div>
                        <div
                          className={`p-1.5 rounded text-center ${
                            activeFilters.has('messages')
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-white/5 text-white/50'
                          }`}
                        >
                          <MessageSquare className="w-2.5 h-2.5 mx-auto mb-0.5" />
                          {formatNumber((post as any).messages ?? post.comments)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                        <div className="flex gap-2 text-[10px] text-white/30">
                          <span className="flex items-center gap-0.5">
                            <Heart className="w-2.5 h-2.5" /> {formatNumber(post.likes)}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Eye className="w-2.5 h-2.5" /> {formatNumber(post.views)}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // 加入二创加工队列 + 跳转
                              addReprocessTask({
                                postId: post.id,
                                title: post.title,
                                content: (post as any).content || '',
                                accountName: post.accountName || '',
                                coverUrl: coverOverrides[post.id] || (post as any).coverUrl,
                                videoUrl: (post as any).videoUrl,
                                audioUrl: (post as any).audioUrl,
                                platform: 'xiaohongshu',
                                addedAt: new Date().toISOString(),
                              });
                              showAddToReprocessToast(post);
                              navigate('/reprocess?platform=xiaohongshu');
                            }}
                            className="text-[10px] px-2 py-0.5 rounded bg-gradient-to-r from-rose-500 to-pink-500 text-white hover:opacity-90"
                            title="加入二创加工任务"
                          >
                            + 二创
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteOne(post.id, post.title);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/40 hover:bg-rose-500/20 hover:text-rose-300"
                            title="删除此内容"
                          >
                            <Trash2 className="w-3 h-3 inline" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <Edit3 className="w-12 h-12 text-white/15" />
                  <p className="text-sm text-white/50">暂无笔记内容</p>
                  <div className="text-xs text-white/40 max-w-lg leading-relaxed space-y-1">
                    {accounts.filter((a) => (a as any).source === 'import').length === 0 ? (
                      <p className="text-amber-300/90">⚠️ 当前没有任何<strong>真实导入</strong>的小红书账号。</p>
                    ) : null}
                    {importedPosts.length === 0 && accounts.filter((a) => (a as any).source === 'import').length > 0 ? (
                      <p className="text-amber-300/90">
                        ⚠️ 已导入 {accounts.filter((a) => (a as any).source === 'import').length} 个账号，但<strong>没有任何笔记</strong>。
                        请确认表格里包含<strong>「笔记标题 / 标题 / title」</strong>列。
                      </p>
                    ) : null}
                    {deletedPostIds.size > 0 ? (
                      <p className="text-amber-300/90">
                        ⚠️ {deletedPostIds.size} 条笔记在「已删除」池里，点「↺ 恢复」按钮重新显示。
                      </p>
                    ) : null}
                    <p className="pt-1">
                      排查建议：① 切换到「数据导入」Tab 重新上传；② 检查多选过滤（评论 / 收藏 / 留言 / 账号）；
                      ③ 清空搜索关键词；④ 点「重新拉取数据」按钮。
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const importedAccs = getImportedAccounts('xiaohongshu');
                      const fresh = getImportedPosts('xiaohongshu');
                      setAccounts(importedAccs);
                      setImportedPosts(fresh);
                      setDeletedPostIds(new Set(getDeletedPostIds('xiaohongshu')));
                      setSelectedIds(new Set());
                      setSelectedAccounts(new Set());
                      setActiveFilters(new Set(['comments']));
                      setSearch('');
                      showToast('success', `已重新拉取：${importedAccs.length} 账号 / ${fresh.length} 笔记`);
                    }}
                    className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs font-medium hover:bg-rose-500/30"
                  >
                    🔄 重新拉取数据
                  </button>
                </div>
              )}
            </GlassCard>
          )}

          {activeTab === 'stats' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-white font-semibold text-base flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-rose-400" /> 数据统计看板
                </h3>
                <p className="text-xs text-white/40">多维组合分析与排行榜 · 洞察增长机会</p>
              </div>
              <DataStatsPanel platform="xiaohongshu" notes={allNotes} contentLabel="笔记" />
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
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">平均点赞</label>
                  <input
                    type="number"
                    value={newAccount.avgLikes}
                    onChange={(e) => setNewAccount({ ...newAccount, avgLikes: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">平均评论</label>
                  <input
                    type="number"
                    value={newAccount.avgComments}
                    onChange={(e) => setNewAccount({ ...newAccount, avgComments: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">平均收藏</label>
                  <input
                    type="number"
                    value={newAccount.avgCollects}
                    onChange={(e) => setNewAccount({ ...newAccount, avgCollects: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
                    placeholder="0"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-white/50 block mb-1">平均分享</label>
                  <input
                    type="number"
                    value={newAccount.avgShares}
                    onChange={(e) => setNewAccount({ ...newAccount, avgShares: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
                    placeholder="0"
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
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm font-medium hover:opacity-90"
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
              {detailPost.videoUrl ? (
                <div className="mb-4 rounded-lg overflow-hidden">
                  <VideoPlayer
                    src={detailPost.videoUrl}
                    poster={detailPost.coverUrl}
                    onParsed={async (parsed) => {
                      // 写回 imported 池
                      try {
                        const { updatePost, updateAccountPost } = await import('../../utils/parseTable');
                        updatePost('xiaohongshu', detailPost.id, { videoUrl: parsed.url });
                        const accId = detailPost.id.split('-p')[0];
                        updateAccountPost('xiaohongshu', accId, detailPost.id, { videoUrl: parsed.url });
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
                        setDetailPost({ ...detailPost, videoUrl: parsed.url });
                        showToast('success', '✓ 视频已自动解析并保存');
                      } catch (e: any) {
                        showToast('error', '保存失败：' + e?.message);
                      }
                    }}
                    onCopy={(msg) => showToast('success', msg)}
                  />
                </div>
              ) : detailPost.coverUrl ? (
                <div className="mb-4 rounded-lg overflow-hidden">
                  <img
                    src={detailPost.coverUrl}
                    alt={detailPost.title}
                    className="w-full h-auto max-h-64 object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : null}
              <div className="flex gap-2 mb-4 flex-wrap text-xs">
                <span className="px-2 py-1 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
                  ❤️ {formatNumber(detailPost.likes)}
                </span>
                <span className="px-2 py-1 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  💬 {formatNumber(detailPost.comments)}
                </span>
                <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  ⭐ {formatNumber(detailPost.collects)}
                </span>
                <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  🔁 {formatNumber(detailPost.shares)}
                </span>
                <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  👁 {formatNumber(detailPost.views)}
                </span>
              </div>
              <h4 className="text-sm text-white/80 font-medium mb-2">📝 笔记内容</h4>
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
                    platform: 'xiaohongshu',
                    addedAt: new Date().toISOString(),
                  });
                  showAddToReprocessToast(detailPost);
                  setDetailPost(null);
                  navigate('/reprocess?platform=xiaohongshu');
                }}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm font-medium hover:opacity-90 flex items-center gap-1.5"
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

      {/* 手动录入一条笔记（「添加二创」按钮） */}
      <AddContentModal
        open={showAddContent}
        onClose={() => setShowAddContent(false)}
        platform="xiaohongshu"
        onAdded={(title, enqueued) => {
          setImportedPosts(getImportedPosts('xiaohongshu'));
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

export default Xiaohongshu;
