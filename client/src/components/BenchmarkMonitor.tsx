import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Eye,
  Users,
  Zap,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Bell,
  Database,
  Plus,
  X,
  ListChecks,
  Trash2,
  Search,
  Filter,
  CheckSquare,
  Square,
  HardDrive,
  Calendar,
  ChevronDown,
  ChevronUp,
  Link2,
  Copy,
  UserCheck,
  PencilLine,
} from 'lucide-react';
import GlassCard from './GlassCard';
import { useWorkspace } from '../store/workspace';
import {
  getMembers, setOwner, removeOwner, ownerOf, canAssignAccount, LEVEL_META,
  isManagerOrAbove, viewableNames, type OwnerScope,
} from '../utils/memberStore';
import Modal from './Modal';
import type { BenchmarkAccount, Platform } from '../types';
import { formatNumber, timeAgo, formatFileSize as formatBytes } from '../utils/format';
import { getImportedPosts, setImportedPosts, getImportedAccounts, setImportedAccounts } from '../utils/parseTable';
import {
  getSyncedAccounts,
  syncOne as syncOneToPool,
  syncMany as syncManyToPool,
  removeOne as removeOneFromPool,
  removeMany as removeManyFromPool,
  clearPool as clearPoolAction,
  getPoolStats,
  type SyncedAccountSnapshot,
} from '../utils/syncedPool';

interface BenchmarkMonitorProps {
  accounts: BenchmarkAccount[];
  platform: Platform;
  onAccountsChange: (next: BenchmarkAccount[]) => void;
  onAddAccount?: () => void;
  // 同步池删除时，通知父组件联动更新 imported 池
  onPoolChanged?: (accounts: import('../utils/parseTable').ParsedAccount[], posts: import('../utils/parseTable').ParsedPost[]) => void;
}

const TrendChart: React.FC<{ data: { date: string; followers: number }[] }> = ({ data }) => {
  if (!data || data.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center text-white/30 text-xs">暂无趋势数据</div>
    );
  }
  const max = Math.max(...data.map((d) => d.followers));
  const min = Math.min(...data.map((d) => d.followers));
  const range = max - min || 1;
  const width = 100;
  const height = 100;
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((d.followers - min) / range) * height * 0.8 - 10,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A855F7" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#A855F7" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#trendArea)" />
      <path d={pathD} fill="none" stroke="#A855F7" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="0.8" fill="#A855F7" />
      ))}
    </svg>
  );
};

const syncStatusConfig = {
  synced: { label: '已同步', icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  syncing: { label: '同步中', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  pending: { label: '待同步', icon: <AlertCircle className="w-3.5 h-3.5" />, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
  failed: { label: '同步失败', icon: <AlertCircle className="w-3.5 h-3.5" />, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
};

// 同步时为没有封面图的内容从已导入数据池中匹配"笔记封面链接"
// 匹配规则：按标题完全相同 > 标题包含关系 > 账号名包含关系 顺序回退
// 已手动编辑过 coverUrl 的会保留
const syncCoversFromImport = (
  account: BenchmarkAccount,
  importedPool: { title: string; coverUrl?: string; accountName?: string; sourceFile?: string }[]
): BenchmarkAccount => {
  if (importedPool.length === 0) return account;
  return {
    ...account,
    recentPosts: account.recentPosts.map((p) => {
      if (p.coverUrl) return p;
      // 1. 标题完全相同
      let match = importedPool.find(
        (ip) => ip.coverUrl && (ip.title || '').trim() === (p.title || '').trim()
      );
      // 2. 标题包含
      if (!match) {
        match = importedPool.find(
          (ip) =>
            ip.coverUrl &&
            (ip.title || '').trim() &&
            (p.title || '').includes((ip.title || '').trim())
        );
      }
      // 3. 账号名相同（导入池的 sourceFile 名或 accountName 包含此账号名）
      if (!match) {
        const accName = account.name || '';
        match = importedPool.find(
          (ip) =>
            ip.coverUrl &&
            ((ip.accountName || '').includes(accName) ||
              (ip.sourceFile || '').includes(accName))
        );
      }
      return match ? { ...p, coverUrl: match.coverUrl } : p;
    }),
  };
};

type SyncStep = 'idle' | 'fetch' | 'verify' | 'save' | 'done';

const BenchmarkMonitor: React.FC<BenchmarkMonitorProps> = ({ accounts, platform, onAccountsChange, onAddAccount, onPoolChanged }) => {
  const [detailAccount, setDetailAccount] = useState<BenchmarkAccount | null>(null);
  // 详情弹窗的多指标趋势：粉丝/点赞/评论/分享/收藏/互动率（多选）
  // 账号负责人：总监可指派全部，经理只能指派给本组，专员只读
  const { currentStaff } = useWorkspace();
  const ownerScope: OwnerScope = platform === 'douyin' ? 'douyin' : 'xiaohongshu';
  const ownerCandidates = getMembers().filter((m) => m.status === 'active' && canAssignAccount(currentStaff.name, m.name));
  const canEditOwner = ownerCandidates.length > 0;

  // ===== 「只看负责的账号」筛选 =====
  // 可见范围由职级决定：总监=全员，经理=本组（同岗位），专员=仅本人
  const activeNames = getMembers().filter((m) => m.status === 'active').map((m) => m.name);
  const visibleNames = viewableNames(currentStaff.name, activeNames);
  // 总监/经理可切换查看不同成员；专员锁定自己
  const canFilterOthers = isManagerOrAbove(currentStaff.name) && visibleNames.length > 1;
  const [onlyOwn, setOnlyOwn] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string>(currentStaff.name);
  // 卡片上正在编辑负责人的账号（平时只显示名字，点击后才展开下拉）
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);

  // 开关打开时的目标人：能筛别人就用下拉的值，否则锁定自己
  const ownerTarget = canFilterOthers ? ownerFilter : currentStaff.name;
  const displayedAccounts = useMemo(
    () => (onlyOwn ? accounts.filter((a) => ownerOf(ownerScope, a.name) === ownerTarget) : accounts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, onlyOwn, ownerTarget, ownerScope]
  );
  // 当前筛选人名下的账号数（用于下拉里显示数量）
  const ownedCountOf = (name: string) => accounts.filter((a) => ownerOf(ownerScope, a.name) === name).length;
  const [trendMetrics, setTrendMetrics] = useState<Set<string>>(() => new Set(['followers', 'avgLikes']));
  // 近期爆款筛选：天/排序
  const [hotRange, setHotRange] = useState<7 | 15 | 30>(7);
  const [hotSortBy, setHotSortBy] = useState<'likes' | 'comments' | 'collects' | 'shares' | 'interScore'>('likes');
  // 爆款内容点开的详情（与 Xiaohongshu/Douyin 内容展示 Modal 行为一致）
  const [hotDetailPost, setHotDetailPost] = useState<any>(null);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [poolOpen, setPoolOpen] = useState(false);
  const [syncedPool, setSyncedPool] = useState<SyncedAccountSnapshot[]>(() => getSyncedAccounts(platform));
  const [poolStats, setPoolStats] = useState(() => getPoolStats(platform));
  const [globalSyncStep, setGlobalSyncStep] = useState<{ step: SyncStep; total: number; done: number }>({
    step: 'idle',
    total: 0,
    done: 0,
  });
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // ===== 提取博主信息：主页链接整理 + 去重 + 一键复制 =====
  const [bloggerOpen, setBloggerOpen] = useState(false);
  const bloggerList = useMemo(() => {
    const map = new Map<string, { name: string; homeUrl?: string }>();
    for (const a of accounts) {
      const homeUrl = (a as any).homeUrl as string | undefined;
      const key = (homeUrl || a.name).trim().toLowerCase();
      if (!map.has(key)) map.set(key, { name: a.name, homeUrl });
    }
    return Array.from(map.values());
  }, [accounts]);
  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('success', okMsg);
    } catch {
      showToast('error', '复制失败，请长按文本手动全选复制');
    }
  };

  const accountsRef = useRef(accounts);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  // 详情弹窗跟随 accounts 变化（同步后立即看到新数据）
  useEffect(() => {
    if (!detailAccount) return;
    const fresh = accounts.find((a) => a.id === detailAccount.id);
    if (fresh && fresh !== detailAccount) {
      setDetailAccount(fresh);
    }
  }, [accounts, detailAccount]);

  const platformLabel = platform === 'xiaohongshu' ? '小红书' : '抖音';

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2600);
  };

  // 真实同步：拉取 → 校验 → 写入池子
  const performSync = useCallback(
    async (accountIds: string[]): Promise<{ ok: boolean; message: string; count: number }> => {
      if (accountIds.length === 0) {
        return { ok: false, message: '没有可同步的账号', count: 0 };
      }
      const targets = accountsRef.current.filter((a) => accountIds.includes(a.id));
      if (targets.length === 0) {
        return { ok: false, message: '账号不存在', count: 0 };
      }

      setGlobalSyncStep({ step: 'fetch', total: targets.length, done: 0 });
      // 1. 拉取
      await new Promise((r) => setTimeout(r, 600));
      setGlobalSyncStep({ step: 'verify', total: targets.length, done: 0 });
      // 2. 校验
      for (let i = 0; i < targets.length; i++) {
        await new Promise((r) => setTimeout(r, 200));
        setGlobalSyncStep({ step: 'verify', total: targets.length, done: i + 1 });
      }
      // 3. 写入池子 — 同步时从已导入数据池中匹配"笔记封面链接"覆盖
      setGlobalSyncStep({ step: 'save', total: targets.length, done: 0 });
      const isBatch = targets.length > 1;
      const importedPool = getImportedPosts(platform);
      const withCovers = targets.map((a) => syncCoversFromImport(a, importedPool));
      const next = isBatch
        ? syncManyToPool(platform, withCovers)
        : syncOneToPool(platform, withCovers[0]);
      setGlobalSyncStep({ step: 'done', total: targets.length, done: targets.length });

      // 更新 accounts 状态（让原账号列表也带 coverUrl，下次渲染直接显示图片）
      const now = new Date().toISOString();
      onAccountsChange(
        accountsRef.current.map((a) => {
          if (!accountIds.includes(a.id)) return a;
          return {
            ...syncCoversFromImport(a, importedPool),
            syncStatus: 'synced' as const,
            lastSyncTime: now,
            hasUpdate: false,
          };
        })
      );

      setSyncedPool(next);
      setPoolStats(getPoolStats(platform));

      // 清空进度
      window.setTimeout(() => setGlobalSyncStep({ step: 'idle', total: 0, done: 0 }), 1200);
      return { ok: true, message: '', count: targets.length };
    },
    [platform, onAccountsChange]
  );

  const handleSync = useCallback(
    async (accountId: string) => {
      if (globalSyncStep.step !== 'idle') return;
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.add(accountId);
        return next;
      });
      const res = await performSync([accountId]);
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
      if (res.ok) {
        showToast('success', `已同步「${accountsRef.current.find((a) => a.id === accountId)?.name}」到已同步数据池`);
      } else {
        showToast('error', res.message);
      }
    },
    [performSync, globalSyncStep.step]
  );

  const handleSyncAll = useCallback(async () => {
    if (globalSyncStep.step !== 'idle') return;
    const allIds = accountsRef.current.map((a) => a.id);
    if (allIds.length === 0) {
      showToast('info', '暂无对标账号可同步');
      return;
    }
    setSyncingIds(new Set(allIds));
    const res = await performSync(allIds);
    setSyncingIds(new Set());
    if (res.ok) {
      showToast('success', `已同步全部 ${res.count} 个对标账号到已同步数据池`);
    }
  }, [performSync, globalSyncStep.step]);

  // 删减：单条 — 同步删除对标监控列表 + 联动删除内容二创中该账号的内容
  const handlePoolRemove = useCallback(
    (accountId: string, accountName: string) => {
      if (
        window.confirm(
          `确定彻底删除「${accountName}」？\n\n此操作将：\n• 从已同步数据池中移除\n• 从对标监控列表中移除该账号\n• 内容二创中该账号的所有内容也一并删减\n• Dashboard 数据统计 / 旗手纳 TOP 5 等不再包含此账号\n\n此操作不可恢复。`
        )
      ) {
        const next = removeOneFromPool(platform, accountId);
        setSyncedPool(next);
        setPoolStats(getPoolStats(platform));
        // 同步从对标监控 accounts 中删除
        onAccountsChange(accountsRef.current.filter((a) => a.id !== accountId));
        // 联动：删除内容二创中该账号的所有 post（从 imported 池 + 全部 setImportedPosts）
        const impPosts = getImportedPosts(platform);
        const impAccs = getImportedAccounts(platform);
        const removedAccountIds = new Set<string>([accountId]);
        const nextImportedPosts = impPosts.filter((p) => {
          // 该 post 是否属于被删的账号
          const belongsToRemoved = (() => {
            const acc = impAccs.find((a) => a.recentPosts.some((rp) => rp.id === p.id));
            if (acc) return removedAccountIds.has(acc.id);
            // 通过 sourceFile 找
            const accByName = impAccs.find((a) => a.name.trim().toLowerCase() === accountName.trim().toLowerCase());
            return !!accByName;
          })();
          return !belongsToRemoved;
        });
        // 同步：把 import 池里该账号的 recentPosts 也清空
        const nextImportedAccs = impAccs.map((a) =>
          removedAccountIds.has(a.id) ? { ...a, recentPosts: [] } : a
        );
        setImportedPosts(platform, nextImportedPosts);
        setImportedAccounts(platform, nextImportedAccs);
        // 通知父组件
        onPoolChanged?.(nextImportedAccs, nextImportedPosts);
        showToast('success', `已彻底删除「${accountName}」及其内容`);
      }
    },
    [platform, onAccountsChange, onPoolChanged]
  );

  // 删减：批量 — 同步从对标监控列表删除 + 联动删除内容
  const handlePoolRemoveMany = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      if (
        window.confirm(
          `确定彻底删减选中的 ${ids.length} 个账号？\n\n此操作将：\n• 从已同步数据池中移除\n• 从对标监控列表中移除这些账号\n• 内容二创中这些账号的所有内容也一并删减`
        )
      ) {
        const next = removeManyFromPool(platform, ids);
        setSyncedPool(next);
        setPoolStats(getPoolStats(platform));
        // 取要删的账号名（联动用）
        const removedNames = new Set(
          accountsRef.current.filter((a) => idSet.has(a.id)).map((a) => a.name.trim().toLowerCase())
        );
        onAccountsChange(accountsRef.current.filter((a) => !idSet.has(a.id)));
        // 联动
        const impPosts = getImportedPosts(platform);
        const impAccs = getImportedAccounts(platform);
        const nextImportedPosts = impPosts.filter((p) => {
          const acc = impAccs.find((a) => a.recentPosts.some((rp) => rp.id === p.id));
          if (acc) return !idSet.has(acc.id);
          const byName = impAccs.find((a) => removedNames.has(a.name.trim().toLowerCase()));
          return !byName;
        });
        const nextImportedAccs = impAccs.map((a) =>
          idSet.has(a.id) ? { ...a, recentPosts: [] } : a
        );
        setImportedPosts(platform, nextImportedPosts);
        setImportedAccounts(platform, nextImportedAccs);
        onPoolChanged?.(nextImportedAccs, nextImportedPosts);
        showToast('success', `已彻底删减 ${ids.length} 个账号及其内容`);
      }
    },
    [platform, onAccountsChange, onPoolChanged]
  );

  // 清空 — 同步清空对标监控列表
  const handlePoolClear = useCallback(() => {
    if (syncedPool.length === 0) return;
    if (
      window.confirm(
        `确定清空${platformLabel}的已同步数据池并彻底删除所有导入账号？\n\n共 ${syncedPool.length} 个账号将从对标监控 + 内容二创中删除，此操作不可恢复。`
      )
    ) {
      clearPoolAction(platform);
      // 彻底清空 importedAccounts / importedPosts（之前是只清空 recentPosts，账号还在池里 → 修复）
      setImportedAccounts(platform, []);
      setImportedPosts(platform, []);
      onPoolChanged?.([], []);
      // accounts state 只保留非 import 来源（用户手动添加的）
      onAccountsChange(accountsRef.current.filter((a: any) => a.source !== 'import'));
      setSyncedPool([]);
      setPoolStats(getPoolStats(platform));
      showToast('success', '已彻底清空所有导入账号，对标监控 + 内容二创已清空');
    }
  }, [platform, platformLabel, syncedPool.length, onAccountsChange, onPoolChanged]);

  const pendingCount = accounts.filter((a) => a.syncStatus === 'pending' || a.hasUpdate).length;
  const syncedCount = accounts.filter((a) => a.syncStatus === 'synced').length;
  const importedCount = accounts.filter((a: any) => a.source === 'import').length;
  const isGlobalSyncing = globalSyncStep.step !== 'idle';

  return (
    <>
      <GlassCard hoverable={false} glow="purple">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-white font-semibold">{platformLabel}对标监控</h3>
              <p className="text-xs text-white/40">
                监控竞品账号数据，支持详情查看与一键同步
                {importedCount > 0 && (
                  <span className="ml-2 text-emerald-300">· 含 {importedCount} 个已导入账号</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* 同步状态统计 */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <span className="text-xs text-white/50">
                已同步 <span className="text-emerald-400 font-medium">{syncedCount}</span>
              </span>
              <span className="text-white/10">/</span>
              <span className="text-xs text-white/50">
                待同步 <span className="text-amber-400 font-medium">{pendingCount}</span>
              </span>
            </div>

            {/* 只看负责的账号：专员看自己，经理/总监可切换成员 */}
            <button
              onClick={() => {
                const next = !onlyOwn;
                setOnlyOwn(next);
                // 打开时若当前筛选人不在可见范围内（如换身份后），回落到自己
                if (next && !visibleNames.includes(ownerFilter)) setOwnerFilter(currentStaff.name);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                onlyOwn
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-200'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10'
              }`}
              title={
                canFilterOthers
                  ? '按负责人筛选账号：可切换查看不同成员的账号'
                  : '只看自己负责的账号'
              }
            >
              <UserCheck className="w-3.5 h-3.5" />
              {onlyOwn ? '只看负责的账号' : '显示负责的账号'}
              {onlyOwn && (
                <span className="px-1.5 py-0.5 rounded bg-purple-500/30 text-[10px]">{displayedAccounts.length}</span>
              )}
            </button>

            {/* 成员筛选下拉：仅经理/总监可见（开关打开时才出现） */}
            {onlyOwn && canFilterOthers && (
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white max-w-[160px]"
                title="切换查看不同成员负责的账号"
              >
                {visibleNames.map((n) => (
                  <option key={n} value={n}>
                    {n}（{ownedCountOf(n)}）
                  </option>
                ))}
              </select>
            )}

            {/* 已同步数据池入口 */}
            <button
              onClick={() => setPoolOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-medium hover:bg-cyan-500/20 transition-colors"
            >
              <ListChecks className="w-3.5 h-3.5" />
              已同步数据
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/30 text-[10px]">{poolStats.count}</span>
            </button>

            {/* 全部同步按钮 */}
            <button
              onClick={handleSyncAll}
              disabled={isGlobalSyncing || accounts.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGlobalSyncing ? 'animate-spin' : ''}`} />
              {isGlobalSyncing ? '同步中' : '同步全部'}
            </button>

            {/* 提取博主信息 */}
            <button
              onClick={() => setBloggerOpen(true)}
              disabled={accounts.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              title="从已上传文件整理博主主页链接（自动去重，一键复制）"
            >
              <Link2 className="w-3.5 h-3.5" /> 提取博主信息
            </button>

            {onAddAccount && (
              <button
                onClick={onAddAccount}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs font-medium hover:bg-white/10 hover:text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> 添加对标
              </button>
            )}
          </div>
        </div>

        {/* 全局同步进度条 */}
        <AnimatePresence>
          {isGlobalSyncing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-500/20 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2 text-xs">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                  <span className="text-white/80">
                    {globalSyncStep.step === 'fetch' && `正在拉取 ${globalSyncStep.total} 个账号数据...`}
                    {globalSyncStep.step === 'verify' && `正在校验数据完整性 (${globalSyncStep.done}/${globalSyncStep.total})`}
                    {globalSyncStep.step === 'save' && `正在写入已同步数据池...`}
                    {globalSyncStep.step === 'done' && `同步完成！`}
                  </span>
                </div>
                <span className="text-purple-300 font-medium">
                  {globalSyncStep.step === 'fetch' && '0%'}
                  {globalSyncStep.step === 'verify' && `${Math.round((globalSyncStep.done / globalSyncStep.total) * 100)}%`}
                  {globalSyncStep.step === 'save' && '99%'}
                  {globalSyncStep.step === 'done' && '100%'}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500"
                  initial={{ width: '0%' }}
                  animate={{
                    width:
                      globalSyncStep.step === 'fetch'
                        ? '20%'
                        : globalSyncStep.step === 'verify'
                        ? `${20 + (globalSyncStep.done / globalSyncStep.total) * 60}%`
                        : globalSyncStep.step === 'save'
                        ? '90%'
                        : '100%',
                  }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 筛选后为空的提示 */}
        {onlyOwn && displayedAccounts.length === 0 && accounts.length > 0 && (
          <div className="mb-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-center">
            <p className="text-xs text-amber-200/80">
              {ownerTarget} 名下还没有{platform === 'douyin' ? '抖音' : '小红书'}账号
              {canFilterOthers ? '，可切换上方成员查看，或到「账号管理」指派' : '，请联系总监或经理在「账号管理」里指派'}
            </p>
          </div>
        )}

        {/* 对标账号卡片网格 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedAccounts.map((account, i) => {
            const syncCfg = syncStatusConfig[account.syncStatus];
            const isSyncing = account.syncStatus === 'syncing' || syncingIds.has(account.id);
            const isImported = (account as any).source === 'import';
            const inPool = syncedPool.some((s) => s.account.id === account.id);
            return (
              <motion.div
                key={account.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.08 }}
                className={`glass-card-dark p-4 transition-all duration-300 group ${
                  isImported ? 'border-emerald-500/30 hover:border-emerald-500/50' : 'hover:border-white/20'
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="relative shrink-0">
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${account.avatarColor} flex items-center justify-center text-lg font-bold text-white shadow-lg`}
                    >
                      {account.avatar}
                    </div>
                    {account.hasUpdate && (
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-[hsl(230_40%_10%)] flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="text-white font-medium text-sm truncate">{account.name}</h4>
                      {isImported && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-0.5 shrink-0">
                          <Database className="w-2.5 h-2.5" /> 已导入
                        </span>
                      )}
                      {inPool && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-0.5 shrink-0">
                          <HardDrive className="w-2.5 h-2.5" /> 已同步
                        </span>
                      )}
                      {(() => {
                        const who = ownerOf(ownerScope, account.name);
                        const editable = canEditOwner && (!who || canAssignAccount(currentStaff.name, who));
                        // 主页默认只显示负责人名字；有权限者点击后才展开下拉修改
                        const editing = editingOwnerId === account.id;
                        if (editable && editing) {
                          return (
                            <select
                              autoFocus
                              value={who}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                if (e.target.value) setOwner(ownerScope, account.name, e.target.value);
                                else removeOwner(ownerScope, account.name);
                                setEditingOwnerId(null);
                                onAccountsChange(accounts);
                              }}
                              onBlur={() => setEditingOwnerId(null)}
                              className="text-[10px] h-6 px-1.5 rounded bg-white/5 border border-white/15 text-white/70 max-w-[130px] shrink-0"
                            >
                              <option value="">取消指派</option>
                              {ownerCandidates.map((m) => (
                                <option key={m.id} value={m.name}>{m.name}（{LEVEL_META[m.level].label}）</option>
                              ))}
                            </select>
                          );
                        }
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (editable) setEditingOwnerId(account.id);
                            }}
                            title={editable ? '点击可修改负责人' : undefined}
                            className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-0.5 shrink-0 ${
                              who
                                ? 'bg-white/5 text-white/60 border-white/10'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            } ${editable ? 'cursor-pointer hover:border-white/25 hover:text-white/80' : 'cursor-default'}`}
                          >
                            <UserCheck className="w-2.5 h-2.5" />
                            {who ? `负责人 ${who}` : '未指派'}
                            {editable && <PencilLine className="w-2.5 h-2.5 opacity-40" />}
                          </button>
                        );
                      })()}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {account.tags.slice(0, 2).map((tag, ti) => (
                        <span key={ti} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] ${syncCfg.bg} ${syncCfg.color}`}
                    >
                      {syncCfg.icon}
                      <span>{syncCfg.label}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`确定删除对标账号「${account.name}」？此操作不可恢复。`)) {
                          onAccountsChange(accounts.filter((a) => a.id !== account.id));
                        }
                      }}
                      className="w-5 h-5 rounded-md flex items-center justify-center text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="删除对标账号"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-2 rounded-lg bg-white/5">
                    <p className="text-[10px] text-white/40">粉丝</p>
                    <p className="text-sm text-white font-bold">{formatNumber(account.followers)}</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white/5">
                    <p className="text-[10px] text-white/40">平均点赞</p>
                    <p className="text-sm text-white font-bold">{formatNumber(account.avgLikes)}</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white/5">
                    <p className="text-[10px] text-white/40">互动率</p>
                    <p className="text-sm text-white font-bold">{account.engagementRate}%</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs mb-3">
                  <div className="flex items-center gap-1">
                    {account.growthRate >= 0 ? (
                      <TrendingUp className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-rose-400" />
                    )}
                    <span className={account.growthRate >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {account.growthRate >= 0 ? '+' : ''}
                      {account.growthRate}%
                    </span>
                    <span className="text-white/30">周增长</span>
                  </div>
                  <div className="flex items-center gap-1 text-white/30">
                    <Clock className="w-3 h-3" />
                    <span>{timeAgo(account.lastSyncTime)}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setDetailAccount(account)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/70 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
                  >
                    详情 <ChevronRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleSync(account.id)}
                    disabled={isSyncing || isGlobalSyncing}
                    className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      isSyncing
                        ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                        : inPool
                        ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20'
                        : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                    }`}
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? '同步中' : inPool ? '已同步' : '同步'}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {accounts.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="w-10 h-10 text-white/20" />
            <p className="text-white/30">暂无对标账号，点击右上角添加</p>
          </div>
        )}
      </GlassCard>

      {/* 详情弹窗 */}
      <Modal
        open={!!detailAccount}
        onClose={() => setDetailAccount(null)}
        title={detailAccount ? detailAccount.name : ''}
        subtitle="对标账号详细数据分析"
        maxWidth="max-w-4xl"
      >
        {detailAccount && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div
                className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${detailAccount.avatarColor} flex items-center justify-center text-2xl font-bold text-white shadow-xl shrink-0`}
              >
                {detailAccount.avatar}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xl font-bold text-white">{detailAccount.name}</h3>
                  {(detailAccount as any).source === 'import' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <Database className="w-3 h-3" /> 已导入数据
                    </span>
                  )}
                  {detailAccount.hasUpdate && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400">
                      <Bell className="w-3 h-3" /> 有新更新
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {detailAccount.tags.map((tag, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-white/40 flex-wrap">
                  <span>粉丝 {formatNumber(detailAccount.followers)}</span>
                  <span>·</span>
                  <span>
                    {detailAccount.notes > 0 && (
                      <>
                        {platformLabel === '小红书' ? '笔记' : '视频'} {detailAccount.notes}
                      </>
                    )}
                  </span>
                  <span>·</span>
                  <span>最近同步 {timeAgo(detailAccount.lastSyncTime)}</span>
                </div>
              </div>
              <button
                onClick={() => handleSync(detailAccount.id)}
                disabled={detailAccount.syncStatus === 'syncing' || isGlobalSyncing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${detailAccount.syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                {detailAccount.syncStatus === 'syncing' ? '同步中...' : '同步数据'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: '平均点赞', value: formatNumber(detailAccount.avgLikes), icon: <Heart className="w-4 h-4" />, color: 'text-rose-400' },
                { label: '平均评论', value: formatNumber(detailAccount.avgComments), icon: <MessageCircle className="w-4 h-4" />, color: 'text-cyan-400' },
                { label: '平均分享', value: formatNumber(detailAccount.avgShares), icon: <Share2 className="w-4 h-4" />, color: 'text-blue-400' },
                { label: '平均收藏', value: formatNumber(detailAccount.avgCollects), icon: <Bookmark className="w-4 h-4" />, color: 'text-amber-400' },
                { label: '互动率', value: detailAccount.engagementRate + '%', icon: <Zap className="w-4 h-4" />, color: 'text-emerald-400' },
                { label: '周增长率', value: (detailAccount.growthRate >= 0 ? '+' : '') + detailAccount.growthRate + '%', icon: <TrendingUp className="w-4 h-4" />, color: 'text-purple-400' },
              ].map((stat, i) => (
                <div key={i} className="glass-card-dark p-3 text-center">
                  <div className={`flex justify-center mb-1 ${stat.color}`}>{stat.icon}</div>
                  <p className="text-lg font-bold text-white">{stat.value}</p>
                  <p className="text-[10px] text-white/40">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="glass-card-dark p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <h4 className="text-white font-medium text-sm">增长趋势（多指标）</h4>
                  <p className="text-[10px] text-white/40 mt-0.5">
                    {((detailAccount as any).history?.length ?? 0) > 0
                      ? `基于 ${(detailAccount as any).history.length} 次抓取历史`
                      : '尚无历史快照，请点击「同步数据」生成'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { key: 'followers', label: '粉丝', color: 'bg-purple-500/20 text-purple-200 border-purple-500/40' },
                    { key: 'avgLikes', label: '点赞', color: 'bg-rose-500/20 text-rose-200 border-rose-500/40' },
                    { key: 'avgComments', label: '评论', color: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40' },
                    { key: 'avgShares', label: '分享', color: 'bg-blue-500/20 text-blue-200 border-blue-500/40' },
                    { key: 'avgCollects', label: '收藏', color: 'bg-amber-500/20 text-amber-200 border-amber-500/40' },
                    { key: 'engagementRate', label: '互动率', color: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40' },
                  ].map((opt) => {
                    const active = trendMetrics.has(opt.key);
                    return (
                      <button
                        key={opt.key}
                        onClick={() => {
                          setTrendMetrics((prev) => {
                            const next = new Set(prev);
                            if (next.has(opt.key)) next.delete(opt.key);
                            else next.add(opt.key);
                            if (next.size === 0) next.add('followers');
                            return next;
                          });
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-all ${
                          active ? opt.color : 'bg-white/5 text-white/40 border-white/10'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <MultiMetricTrendChart
                history={(detailAccount as any).history || []}
                metrics={trendMetrics}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <h4 className="text-white font-medium text-sm">近期爆款内容</h4>
                  <p className="text-[10px] text-white/40 mt-0.5">
                    {detailAccount.recentPosts.length > 0
                      ? `共 ${detailAccount.recentPosts.length} 条，按发布时间筛选，按 ${hotSortBy === 'interScore' ? '互动率' : hotSortBy === 'collects' ? '收藏' : hotSortBy === 'shares' ? '分享' : hotSortBy === 'comments' ? '评论' : '点赞'} 排序`
                      : '暂无内容'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* 时间筛选 */}
                  <div className="flex bg-white/5 rounded-md p-0.5 border border-white/10">
                    {[7, 15, 30].map((d) => (
                      <button
                        key={d}
                        onClick={() => setHotRange(d as 7 | 15 | 30)}
                        className={`text-[10px] px-2 py-0.5 rounded transition-all ${
                          hotRange === d
                            ? 'bg-purple-500/30 text-purple-200'
                            : 'text-white/50 hover:text-white'
                        }`}
                      >
                        {d}天
                      </button>
                    ))}
                  </div>
                  {/* 排序 */}
                  <select
                    value={hotSortBy}
                    onChange={(e) => setHotSortBy(e.target.value as any)}
                    className="text-[10px] px-2 h-6 rounded-md bg-white/5 border border-white/10 text-white/80"
                  >
                    <option value="likes">按点赞</option>
                    <option value="comments">按评论</option>
                    <option value="collects">按收藏</option>
                    <option value="shares">按分享</option>
                    <option value="interScore">按互动量</option>
                  </select>
                </div>
              </div>
              {detailAccount.recentPosts.length > 0 ? (
                <div className="space-y-2">
                  {(() => {
                    const cutoff = new Date();
                    cutoff.setDate(cutoff.getDate() - hotRange);
                    // 先按时间筛选
                    const filtered = detailAccount.recentPosts.filter((p) => {
                      const d = new Date(p.publishTime);
                      return d >= cutoff;
                    });
                    // 按 title 去重（保留互动量最高的）；无 title 时用 id
                    const dedupMap = new Map<string, typeof filtered[0]>();
                    filtered.forEach((p) => {
                      const key = (p.title || '').trim() || p.id;
                      const existing = dedupMap.get(key);
                      if (!existing) {
                        dedupMap.set(key, p);
                        return;
                      }
                      const scoreOf = (x: typeof p) =>
                        x.likes + x.comments * 3 + x.collects * 2 + x.shares * 2;
                      if (scoreOf(p) > scoreOf(existing)) dedupMap.set(key, p);
                    });
                    const deduped = Array.from(dedupMap.values());
                    const sorted = [...deduped].sort((a, b) => {
                      if (hotSortBy === 'interScore') {
                        const ai = a.likes + a.comments * 3 + a.collects * 2 + a.shares * 2;
                        const bi = b.likes + b.comments * 3 + b.collects * 2 + b.shares * 2;
                        return bi - ai;
                      }
                      return (b as any)[hotSortBy] - (a as any)[hotSortBy];
                    });
                    const top10 = sorted.slice(0, 10);
                    if (top10.length === 0) {
                      return (
                        <div className="text-center py-6 text-white/30 text-sm">
                          最近 {hotRange} 天内无内容
                        </div>
                      );
                    }
                    return top10.map((post, idx) => (
                      <div
                        key={post.id}
                        onClick={() => setHotDetailPost(post)}
                        className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer border border-transparent hover:border-amber-500/30"
                        title="点击查看笔记详情"
                      >
                        <span
                          className={`shrink-0 w-7 h-7 rounded-md text-[10px] font-bold flex items-center justify-center ${
                            idx === 0
                              ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                              : idx === 1
                              ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white'
                              : idx === 2
                              ? 'bg-gradient-to-br from-orange-300 to-orange-500 text-white'
                              : 'bg-white/10 text-white/60'
                          }`}
                        >
                          #{idx + 1}
                        </span>
                        <div
                          className={`w-12 h-12 rounded-lg bg-gradient-to-br ${post.coverColor} flex items-center justify-center shrink-0 overflow-hidden`}
                        >
                          {post.coverUrl ? (
                            <img src={post.coverUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Eye className="w-5 h-5 text-white/60" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/80 truncate font-medium">{post.title}</p>
                          <div className="flex items-center gap-3 text-xs text-white/30 mt-1 flex-wrap">
                            <span className="flex items-center gap-0.5">
                              <Heart className="w-3 h-3" /> {formatNumber(post.likes)}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <MessageCircle className="w-3 h-3" /> {formatNumber(post.comments)}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <Share2 className="w-3 h-3" /> {formatNumber(post.shares)}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <Bookmark className="w-3 h-3" /> {formatNumber(post.collects)}
                            </span>
                            <span className="text-white/20">{post.publishTime}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-white/30">播放</p>
                          <p className="text-sm text-white font-bold">{formatNumber(post.views)}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <div className="text-center py-6 text-white/30 text-sm">暂无内容</div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 爆款内容详情 Modal（点开爆款内容时弹出） */}
      <Modal
        open={!!hotDetailPost}
        onClose={() => setHotDetailPost(null)}
        title={hotDetailPost?.title || '笔记详情'}
        subtitle={`${detailAccount?.name || ''} · ${hotDetailPost?.publishTime || ''}`}
        maxWidth="max-w-3xl"
      >
        {hotDetailPost && (
          <div className="space-y-4">
            {/* 封面 */}
            <div
              className={`w-full h-56 rounded-xl overflow-hidden bg-gradient-to-br ${hotDetailPost.coverColor} relative`}
            >
              {hotDetailPost.coverUrl ? (
                <img src={hotDetailPost.coverUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/40 text-sm">
                  无封面
                </div>
              )}
              <div className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-black/50 text-[10px] text-white">
                {platformLabel} · 爆款详情
              </div>
            </div>

            {/* 完整内容 */}
            {hotDetailPost.content ? (
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <div className="text-[10px] text-white/40 mb-1.5">笔记内容</div>
                <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                  {hotDetailPost.content}
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-xs text-white/40 text-center">
                暂无正文（可能上传表格没有"笔记内容/正文/详情"列）
              </div>
            )}

            {/* 互动数据 4 卡 */}
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <div className="text-[10px] text-white/40 mb-0.5">点赞</div>
                <div className="text-xl font-bold text-rose-300">{formatNumber(hotDetailPost.likes)}</div>
              </div>
              <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <div className="text-[10px] text-white/40 mb-0.5">评论</div>
                <div className="text-xl font-bold text-cyan-300">{formatNumber(hotDetailPost.comments)}</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="text-[10px] text-white/40 mb-0.5">收藏</div>
                <div className="text-xl font-bold text-amber-300">{formatNumber(hotDetailPost.collects)}</div>
              </div>
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-[10px] text-white/40 mb-0.5">分享</div>
                <div className="text-xl font-bold text-emerald-300">{formatNumber(hotDetailPost.shares)}</div>
              </div>
            </div>

            {/* 互动率 / 播放 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-[10px] text-white/40 mb-0.5">互动量（加权）</div>
                <div className="text-xl font-bold text-white">
                  {formatNumber(
                    hotDetailPost.likes +
                      hotDetailPost.comments * 3 +
                      hotDetailPost.collects * 2 +
                      hotDetailPost.shares * 2
                  )}
                </div>
                <div className="text-[10px] text-white/30 mt-0.5">
                  点赞×1 + 评论×3 + 收藏×2 + 分享×2
                </div>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-[10px] text-white/40 mb-0.5">播放</div>
                <div className="text-xl font-bold text-white">{formatNumber(hotDetailPost.views)}</div>
                <div className="text-[10px] text-white/30 mt-0.5">{hotDetailPost.publishTime}</div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  if (hotDetailPost?.content) {
                    navigator.clipboard?.writeText(hotDetailPost.content);
                    showToast('success', '已复制笔记内容到剪贴板');
                  } else {
                    showToast('info', '该笔记没有正文可复制');
                  }
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm font-medium hover:opacity-90"
              >
                📋 复制笔记内容
              </button>
              <button
                onClick={() => setHotDetailPost(null)}
                className="px-4 py-2 rounded-lg bg-white/5 text-white/80 text-sm hover:bg-white/10"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* 已同步数据池 Modal */}
      <SyncedPoolModal
        open={poolOpen}
        onClose={() => setPoolOpen(false)}
        platform={platform}
        platformLabel={platformLabel}
        pool={syncedPool}
        stats={poolStats}
        onRemoveOne={handlePoolRemove}
        onRemoveMany={handlePoolRemoveMany}
        onClear={handlePoolClear}
        accountsMap={Object.fromEntries(accounts.map((a) => [a.id, a]))}
      />

      {/* 提取博主信息 Modal：主页链接整理 + 去重 + 一键复制 */}
      <Modal
        open={bloggerOpen}
        onClose={() => setBloggerOpen(false)}
        title="博主主页链接"
        subtitle={`共 ${bloggerList.length} 个博主 · 已按链接/名称自动去重`}
        maxWidth="max-w-2xl"
      >
        {bloggerList.length === 0 ? (
          <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60">
            暂无博主数据，请先上传对标表格。
          </div>
        ) : (
          <div className="space-y-3">
            {!bloggerList.some((b) => b.homeUrl) && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                ⚠️ 未在表格中识别到「主页链接」列。支持的列名：主页链接 / 主页地址 / 博主主页 / 账号主页 /
                达人主页 / 个人主页 / homepage / profile 等。在表格中加一列后重新上传即可。
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  copyText(
                    bloggerList.map((b) => b.homeUrl || b.name).join('\n'),
                    `✓ 已复制全部 ${bloggerList.length} 条`
                  )
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-medium hover:opacity-90"
              >
                <Copy className="w-3.5 h-3.5" /> 全选复制（一行一个）
              </button>
              <span className="text-[10px] text-white/40">点单行「复制」可单独复制某个链接</span>
            </div>
            <div className="space-y-1.5 max-h-[40vh] overflow-y-auto scrollbar-thin pr-1">
              {bloggerList.map((b, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10"
                >
                  <span className="text-xs text-white/80 w-28 truncate shrink-0" title={b.name}>
                    {b.name}
                  </span>
                  <span
                    className={`text-xs flex-1 truncate font-mono ${b.homeUrl ? 'text-cyan-300' : 'text-white/30'}`}
                    title={b.homeUrl || '无链接'}
                  >
                    {b.homeUrl || '（表格中无主页链接）'}
                  </span>
                  <button
                    onClick={() => copyText(b.homeUrl || b.name, `✓ 已复制「${b.name}」的链接`)}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-white/5 text-white/60 hover:text-white hover:bg-white/10 text-[10px]"
                  >
                    <Copy className="w-3 h-3" /> 复制
                  </button>
                </div>
              ))}
            </div>
            <div>
              <p className="text-[10px] text-white/40 mb-1">纯链接文本（点进去 Ctrl+A 全选复制）：</p>
              <textarea
                readOnly
                value={bloggerList.map((b) => b.homeUrl || b.name).join('\n')}
                onFocus={(e) => e.target.select()}
                rows={Math.min(bloggerList.length, 10)}
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-xs text-cyan-200 font-mono resize-none scrollbar-thin"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-2xl border backdrop-blur-md ${
              toast.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                : toast.type === 'error'
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-200'
                : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-200'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// ===== 已同步数据池 Modal =====
interface SyncedPoolModalProps {
  open: boolean;
  onClose: () => void;
  platform: Platform;
  platformLabel: string;
  pool: SyncedAccountSnapshot[];
  stats: { count: number; totalSize: number; lastSyncAt: string | null };
  onRemoveOne: (accountId: string, accountName: string) => void;
  onRemoveMany: (ids: string[]) => void;
  onClear: () => void;
  accountsMap: Record<string, BenchmarkAccount>;
}

const SyncedPoolModal: React.FC<SyncedPoolModalProps> = ({
  open,
  onClose,
  platformLabel,
  pool,
  stats,
  onRemoveOne,
  onRemoveMany,
  onClear,
  accountsMap,
}) => {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'top10' | 'updated'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'time' | 'followers' | 'engagement'>('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // 每次打开时重置
  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setSearch('');
      setExpanded(new Set());
    }
  }, [open]);

  const filtered = pool.filter((s) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!s.account.name.toLowerCase().includes(q)) return false;
    }
    if (filterMode === 'top10') {
      return s.account.followers >= 30000;
    }
    if (filterMode === 'updated') {
      return s.account.hasUpdate;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let diff = 0;
    if (sortBy === 'time') {
      diff = new Date(a.syncedAt).getTime() - new Date(b.syncedAt).getTime();
    } else if (sortBy === 'followers') {
      diff = a.account.followers - b.account.followers;
    } else {
      diff = a.account.engagementRate - b.account.engagementRate;
    }
    return sortDir === 'desc' ? -diff : diff;
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map((s) => s.account.id)));
  };
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={`${platformLabel}·已同步数据池`} subtitle="管理已同步的对标账号数据，支持删减" maxWidth="max-w-5xl">
      <div className="space-y-4">
        {/* 顶部统计 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
            <p className="text-[10px] text-white/40 mb-0.5">已同步账号</p>
            <p className="text-2xl font-bold text-cyan-300">{stats.count}</p>
          </div>
          <div className="p-3 rounded-lg bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-purple-500/20">
            <p className="text-[10px] text-white/40 mb-0.5">数据大小</p>
            <p className="text-2xl font-bold text-purple-300">{formatBytes(stats.totalSize)}</p>
          </div>
          <div className="p-3 rounded-lg bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
            <p className="text-[10px] text-white/40 mb-0.5">最近同步</p>
            <p className="text-sm font-medium text-emerald-300 mt-1.5">
              {stats.lastSyncAt ? timeAgo(stats.lastSyncAt) : '—'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20">
            <p className="text-[10px] text-white/40 mb-0.5">命中率</p>
            <p className="text-2xl font-bold text-amber-300">
              {pool.length > 0 ? Math.round((pool.length / Math.max(pool.length, 1)) * 100) : 0}%
            </p>
          </div>
        </div>

        {/* 工具栏 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              placeholder="搜索已同步账号名..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          {/* 筛选 */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
            {[
              { key: 'all', label: '全部' },
              { key: 'top10', label: '头部' },
              { key: 'updated', label: '有更新' },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setFilterMode(opt.key as any)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  filterMode === opt.key ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/50 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 排序 */}
          <select
            value={`${sortBy}_${sortDir}`}
            onChange={(e) => {
              const [b, d] = e.target.value.split('_');
              setSortBy(b as any);
              setSortDir(d as any);
            }}
            className="h-9 px-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/70 focus:outline-none"
          >
            <option value="time_desc">同步时间 ↓</option>
            <option value="time_asc">同步时间 ↑</option>
            <option value="followers_desc">粉丝 ↓</option>
            <option value="followers_asc">粉丝 ↑</option>
            <option value="engagement_desc">互动率 ↓</option>
            <option value="engagement_asc">互动率 ↑</option>
          </select>

          {/* 批量操作 */}
          {selected.size > 0 && (
            <button
              onClick={() => {
                onRemoveMany(Array.from(selected));
                setSelected(new Set());
              }}
              className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-medium hover:bg-rose-500/30"
            >
              <Trash2 className="w-3.5 h-3.5" />
              删减选中 ({selected.size})
            </button>
          )}

          {/* 清空 */}
          <button
            onClick={onClear}
            disabled={pool.length === 0}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs hover:bg-rose-500/10 hover:text-rose-300 hover:border-rose-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" /> 清空
          </button>
        </div>

        {/* 列表 */}
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <HardDrive className="w-10 h-10 text-white/20" />
            <p className="text-sm text-white/30">
              {pool.length === 0 ? '已同步数据池为空，去对标监控点「同步全部」把账号数据同步进来' : '没有匹配的账号'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
            {/* 全选 */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 sticky top-0 z-10 backdrop-blur-md">
              <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
                {selected.size === sorted.length && sorted.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-cyan-400" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                <span>全选 ({sorted.length})</span>
              </button>
              <span className="text-[10px] text-white/30">已选 {selected.size} 条 · 命中 {sorted.length}/{pool.length}</span>
            </div>

            {sorted.map((s) => {
              const a = s.account;
              const isSelected = selected.has(a.id);
              const isExpanded = expanded.has(a.id);
              return (
                <div
                  key={s.account.id}
                  className={`rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-cyan-500/5 border-cyan-500/30'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-3 p-3">
                    <button onClick={() => toggleSelect(a.id)} className="shrink-0">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <Square className="w-4 h-4 text-white/30" />
                      )}
                    </button>
                    <div
                      className={`w-10 h-10 rounded-lg bg-gradient-to-br ${a.avatarColor} flex items-center justify-center text-white font-bold shrink-0`}
                    >
                      {a.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm text-white font-medium">{a.name}</h4>
                        {a.hasUpdate && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400">有更新</span>
                        )}
                        <span className="text-[10px] text-cyan-300">{timeAgo(s.syncedAt)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-white/40 mt-1 flex-wrap">
                        <span>粉丝 {formatNumber(a.followers)}</span>
                        <span>·</span>
                        <span>点赞 {formatNumber(a.avgLikes)}</span>
                        <span>·</span>
                        <span>评论 {formatNumber(a.avgComments)}</span>
                        <span>·</span>
                        <span>互动率 {a.engagementRate}%</span>
                        <span>·</span>
                        <span>大小 {formatBytes(s.dataSize)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleExpand(a.id)}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10"
                        title={isExpanded ? '收起详情' : '展开详情'}
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => onRemoveOne(a.id, a.name)}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-white/40 hover:text-rose-400 hover:bg-rose-500/10"
                        title="删减此账号"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 展开详情 */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden border-t border-white/5"
                      >
                        <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                          <div className="p-2 rounded bg-white/3">
                            <p className="text-white/40">平均分享</p>
                            <p className="text-white font-bold">{formatNumber(a.avgShares)}</p>
                          </div>
                          <div className="p-2 rounded bg-white/3">
                            <p className="text-white/40">平均收藏</p>
                            <p className="text-white font-bold">{formatNumber(a.avgCollects)}</p>
                          </div>
                          <div className="p-2 rounded bg-white/3">
                            <p className="text-white/40">增长率</p>
                            <p className={a.growthRate >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                              {a.growthRate >= 0 ? '+' : ''}
                              {a.growthRate}%
                            </p>
                          </div>
                          <div className="p-2 rounded bg-white/3">
                            <p className="text-white/40">同步ID</p>
                            <p className="text-white/70 font-mono text-[10px] truncate">{s.syncId}</p>
                          </div>
                          <div className="p-2 rounded bg-white/3 col-span-2">
                            <p className="text-white/40">同步时间</p>
                            <p className="text-white font-medium">{new Date(s.syncedAt).toLocaleString('zh-CN')}</p>
                          </div>
                          <div className="p-2 rounded bg-white/3 col-span-2">
                            <p className="text-white/40">标签</p>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {a.tags.map((t, i) => (
                                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300">
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                          {a.recentPosts.length > 0 && (
                            <div className="col-span-2 sm:col-span-4 p-2 rounded bg-white/3">
                              <p className="text-white/40 mb-1">近期爆款 ({a.recentPosts.length})</p>
                              <div className="space-y-1">
                                {a.recentPosts.slice(0, 3).map((p) => (
                                  <div key={p.id} className="flex items-center gap-2 text-[10px] text-white/60">
                                    <span className="truncate flex-1">{p.title}</span>
                                    <span>♥ {formatNumber(p.likes)}</span>
                                    <span>💬 {formatNumber(p.comments)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}

        {/* 底部说明 */}
        <div className="text-[10px] text-white/30 flex items-start gap-1.5 pt-2 border-t border-white/5">
          <Filter className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            「删减」只影响已同步数据池，不会删除对标监控列表中的原账号；
            删减后如需再次同步该账号，重新点击单账号「同步」按钮即可。
          </span>
        </div>
      </div>
    </Modal>
  );
};

// ===== 多指标趋势图 =====
// 基于 history 快照渲染多条线，支持粉丝/点赞/评论/分享/收藏/互动率
const METRIC_META: Record<string, { label: string; color: string }> = {
  followers: { label: '粉丝', color: '#A855F7' },
  avgLikes: { label: '点赞', color: '#F43F5E' },
  avgComments: { label: '评论', color: '#06B6D4' },
  avgShares: { label: '分享', color: '#3B82F6' },
  avgCollects: { label: '收藏', color: '#F59E0B' },
  engagementRate: { label: '互动率(%)', color: '#10B981' },
};

const MultiMetricTrendChart: React.FC<{
  history: { uploadedAt: string; followers: number; avgLikes: number; avgComments: number; avgShares: number; avgCollects: number; engagementRate: number }[];
  metrics: Set<string>;
}> = ({ history, metrics }) => {
  if (!history || history.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center text-white/30 text-xs">
        {history.length === 0
          ? '尚无历史快照 · 请点击「同步数据」生成'
          : '至少需要 2 次快照才能绘制趋势'}
      </div>
    );
  }
  const sorted = [...history].sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());
  const width = 100;
  const height = 40;
  const metricArr = Array.from(metrics);

  // 计算每条线的 max（独立缩放）
  const series = metricArr.map((m) => {
    const vals = sorted.map((s) => (s as any)[m] || 0);
    return { key: m, vals };
  });

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40" preserveAspectRatio="none">
        {/* 网格线 */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line key={p} x1={0} y1={height * p} x2={width} y2={height * p} stroke="rgba(255,255,255,0.06)" strokeWidth={0.2} />
        ))}
        {series.map(({ key, vals }) => {
          const max = Math.max(...vals, 1);
          const min = Math.min(...vals, 0);
          const range = max - min || 1;
          const points = vals.map((v, i) => ({
            x: (i / (vals.length - 1)) * width,
            y: height - ((v - min) / range) * (height - 4) - 2,
          }));
          const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
          const color = METRIC_META[key]?.color || '#A855F7';
          return (
            <g key={key}>
              <path d={pathD} fill="none" stroke={color} strokeWidth={0.5} strokeLinecap="round" strokeLinejoin="round" />
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={0.6} fill={color} />
              ))}
            </g>
          );
        })}
      </svg>
      {/* X 轴标签 */}
      <div className="flex justify-between text-[10px] text-white/30 px-1">
        {sorted.filter((_, i) => i % Math.max(1, Math.ceil(sorted.length / 6)) === 0).map((s, i) => (
          <span key={i}>{s.uploadedAt.slice(5, 10)}</span>
        ))}
      </div>
      {/* 图例 */}
      <div className="flex items-center gap-3 flex-wrap text-[10px]">
        {metricArr.map((m) => {
          const meta = METRIC_META[m];
          if (!meta) return null;
          return (
            <span key={m} className="flex items-center gap-1 text-white/60">
              <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
              {meta.label}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default BenchmarkMonitor;
