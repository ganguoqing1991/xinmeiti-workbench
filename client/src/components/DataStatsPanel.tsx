// 数据统计面板组件（含发布趋势 + 类型分布 + 互动排行榜 TOP10 + 热门话题标签）
// 通用：小红书用"笔记"、抖音用"视频"

import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  BarChart3,
  FileText,
  Heart,
  Bookmark,
  MessageCircle,
  Share2,
  Eye,
  Play,
  TrendingUp,
  Hash,
  Trophy,
} from 'lucide-react';
import GlassCard from './GlassCard';
import StatCard from './StatCard';
import type { NoteItem } from '../data/mock';
import { formatNumber } from '../utils/format';

export type SortKey = 'all' | 'likes' | 'collects' | 'comments' | 'shares';
export type RangeKey = '7d' | '30d' | 'all';

interface DataStatsPanelProps {
  platform: 'xiaohongshu' | 'douyin';
  notes: NoteItem[]; // 全部录取数据（mock + 导入 + 对标账号 recentPosts 合并）
  contentLabel?: string;
}

const sortOptionsXHS: { key: SortKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'collects', label: '收藏' },
  { key: 'comments', label: '评论' },
  { key: 'shares', label: '分享' },
];

const sortOptionsDY: { key: SortKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'likes', label: '点赞' },
  { key: 'collects', label: '收藏' },
  { key: 'comments', label: '评论' },
];

const rangeOptions: { key: RangeKey; label: string; days: number }[] = [
  { key: '7d', label: '近7天', days: 7 },
  { key: '30d', label: '近30天', days: 30 },
  { key: 'all', label: '全部', days: 9999 },
];

// 真实数据按日期聚合发布趋势（严格按上传数据的真实发布日期）
function aggregateByDate(notes: NoteItem[], range: RangeKey) {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 20;
  const result: { date: string; count: number; interactions: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const day = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    result.push({ date: day, count: 0, interactions: 0 });
  }
  // 把笔记按真实 publishTime 归类到对应日期
  const dateIndex = new Map(result.map((r, i) => [r.date, i]));
  notes.forEach((n) => {
    if (!n.publishTime) return;
    const d = new Date(n.publishTime);
    if (isNaN(d.getTime())) return;
    const day = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const idx = dateIndex.get(day);
    if (idx !== undefined) {
      result[idx].count += 1;
      result[idx].interactions += n.likes + n.comments + n.collects + n.shares;
    }
  });
  // 严格按上传数据，不填充假数据
  return result;
}

// 从上传数据中聚合话题标签热度（按 tag 出现次数）
// 数据源 = tags 字段 + 笔记内容里的 #xxx hashtag，每次从当前 notes 实时统计
// （删除帖子后自动减少，不存 localStorage 累计）
function aggregateHotTags(notes: NoteItem[]): { tag: string; value: number }[] {
  const map = new Map<string, number>();
  // 匹配 #xxx hashtag（中文/字母/数字/下划线都可），全局多次匹配
  const HASHTAG_RE = /#([\u4e00-\u9fa5A-Za-z0-9_]+)/g;
  const bump = (raw: string) => {
    const tag = raw.replace(/^#/, '').trim();
    if (!tag) return;
    // 不计入"导入数据"等平台默认 tag
    if (tag === '导入数据' || tag === '小红书' || tag === '抖音') return;
    map.set(tag, (map.get(tag) || 0) + 1);
  };
  notes.forEach((n: any) => {
    // 来源 1：tags 字段
    if (Array.isArray(n.tags)) {
      n.tags.forEach((t: any) => bump(String(t)));
    }
    // 来源 2：笔记内容里的 #xxx（重点：用户上传表格正文里包含的 hashtag）
    if (typeof n.content === 'string' && n.content) {
      const matches = n.content.matchAll(HASHTAG_RE);
      for (const m of matches) bump(m[1]);
    }
    // 来源 3：标题里的 #xxx（部分用户把标签放在标题里）
    if (typeof n.title === 'string' && n.title) {
      const matches = n.title.matchAll(HASHTAG_RE);
      for (const m of matches) bump(m[1]);
    }
  });
  return Array.from(map.entries())
    .map(([tag, value]) => ({ tag, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

const DataStatsPanel: React.FC<DataStatsPanelProps> = ({ platform, notes, contentLabel = '笔记' }) => {
  const isXhs = platform === 'xiaohongshu';
  const sortOptions = isXhs ? sortOptionsXHS : sortOptionsDY;
  const [range, setRange] = useState<RangeKey>('7d');
  const [sortKey, setSortKey] = useState<SortKey>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // 全部类型（去重）
  const allTypes = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => set.add(n.type || '其他'));
    return ['all', ...Array.from(set)];
  }, [notes]);

  // 时间 + 类型筛选
  const filtered = useMemo(() => {
    const now = new Date();
    return notes.filter((n) => {
      if (!n.publishTime) return range === 'all';
      const d = new Date(n.publishTime);
      if (isNaN(d.getTime())) return range === 'all';
      const diffDays = (now.getTime() - d.getTime()) / 86400000;
      if (range === '7d' && diffDays > 7) return false;
      if (range === '30d' && diffDays > 30) return false;
      if (typeFilter !== 'all' && (n.type || '其他') !== typeFilter) return false;
      return true;
    });
  }, [notes, range, typeFilter]);

  // 4 统计卡（基于筛选后的数据）
  const totals = useMemo(() => {
    return {
      count: filtered.length,
      likes: filtered.reduce((s, n) => s + (n.likes || 0), 0),
      collects: filtered.reduce((s, n) => s + (n.collects || 0), 0),
      comments: filtered.reduce((s, n) => s + (n.comments || 0), 0),
      shares: filtered.reduce((s, n) => s + (n.shares || 0), 0),
      views: filtered.reduce((s, n) => s + (n.views || 0), 0),
    };
  }, [filtered]);

  // 真实数据驱动的发布趋势
  const publishTrend = useMemo(() => aggregateByDate(filtered, range), [filtered, range]);

  // 类型分布
  const typeDistribution = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((it) => {
      const t = it.type || '其他';
      map.set(t, (map.get(t) || 0) + 1);
    });
    const palette = ['#A855F7', '#06B6D4', '#F59E0B', '#10B981', '#F43F5E', '#3B82F6', '#8B5CF6', '#EC4899'];
    return Array.from(map.entries()).map(([type, count], i) => ({ type, count, color: palette[i % palette.length] }));
  }, [filtered]);

  // 排行榜 TOP 10（去重：同 title 只保留互动量最高的 1 条）
  const score = (n: NoteItem) => {
    if (sortKey === 'all') return n.likes + n.collects * 2 + n.comments * 3 + n.shares * 2;
    return n[sortKey as 'likes' | 'collects' | 'comments' | 'shares'] || 0;
  };
  const deduped = useMemo(() => {
    const map = new Map<string, NoteItem>();
    filtered.forEach((n) => {
      const key = n.title?.trim() || n.id;
      const existing = map.get(key);
      if (!existing || score(n) > score(existing)) {
        map.set(key, n);
      }
    });
    return Array.from(map.values());
  }, [filtered, sortKey]);
  const leaderboard = useMemo(() => {
    return [...deduped].sort((a, b) => score(b) - score(a)).slice(0, 10);
  }, [deduped, sortKey]);
  const maxLeaderboard = useMemo(() => {
    if (leaderboard.length === 0) return 1;
    return Math.max(...leaderboard.map(score), 1);
  }, [leaderboard, sortKey]);

  // 热门话题标签（从上传数据的 tags 字段聚合，不再用 mock）
  const hotTags = useMemo(() => aggregateHotTags(filtered), [filtered]);

  return (
    <div className="space-y-4">
      {/* 顶部筛选条 */}
      <GlassCard hoverable={false}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {rangeOptions.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  range === r.key
                    ? isXhs
                      ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white'
                      : 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Hash className="w-3.5 h-3.5 text-white/40" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/70 focus:outline-none focus:border-purple-500/50"
            >
              <option value="all">全部类型</option>
              {allTypes.filter((t) => t !== 'all').map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <span className="text-xs text-white/40">
              命中 <span className={`font-medium ${isXhs ? 'text-rose-300' : 'text-cyan-300'}`}>{filtered.length}</span> 条
            </span>
          </div>
        </div>
      </GlassCard>

      {/* 4 统计卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isXhs ? (
          <>
            <StatCard title="总笔记数" value={totals.count} unit="篇" change={12.5} changeLabel="环比" icon={<FileText className="w-5 h-5" />} color="purple" delay={0} />
            <StatCard title="总点赞" value={formatNumber(totals.likes)} unit="" change={8.7} changeLabel="环比" icon={<Heart className="w-5 h-5" />} color="pink" delay={0.1} />
            <StatCard title="总收藏" value={formatNumber(totals.collects)} unit="" change={6.2} changeLabel="环比" icon={<Bookmark className="w-5 h-5" />} color="orange" delay={0.2} />
            <StatCard title="总评论" value={formatNumber(totals.comments)} unit="" change={4.1} changeLabel="环比" icon={<MessageCircle className="w-5 h-5" />} color="cyan" delay={0.3} />
          </>
        ) : (
          <>
            <StatCard title="总视频数" value={totals.count} unit="个" change={18.2} changeLabel="环比" icon={<FileText className="w-5 h-5" />} color="cyan" delay={0} />
            <StatCard title="总播放量" value={formatNumber(totals.views)} unit="" change={11.5} changeLabel="环比" icon={<Play className="w-5 h-5" />} color="purple" delay={0.1} />
            <StatCard title="总点赞" value={formatNumber(totals.likes)} unit="" change={15.7} changeLabel="环比" icon={<Heart className="w-5 h-5" />} color="pink" delay={0.2} />
            <StatCard title="总评论" value={formatNumber(totals.comments)} unit="" change={9.3} changeLabel="环比" icon={<MessageCircle className="w-5 h-5" />} color="blue" delay={0.3} />
          </>
        )}
      </div>

      {/* 趋势 + 类型分布 + 热门话题 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard hoverable={false} className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" /> 发布趋势
            </h3>
            <div className="flex items-center gap-3 text-xs text-white/50">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-cyan-400" /> 发布数
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400" /> 互动量
              </span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={publishTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="barColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#A855F7" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(20,20,30,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color: '#fff',
                    fontSize: 12,
                  }}
                />
                <Bar yAxisId="left" dataKey="count" fill="url(#barColor)" name="发布数" radius={[4, 4, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="interactions"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#F59E0B' }}
                  name="互动量"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard hoverable={false}>
          <h3 className="text-white font-medium text-sm flex items-center gap-2 mb-3">
            <Hash className="w-4 h-4 text-purple-400" /> {contentLabel}类型分布
          </h3>
          {typeDistribution.length > 0 ? (
            <>
              <div className="h-44 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={typeDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="type"
                      label={(e: any) => (e.percent > 0.05 ? `${(e.percent * 100).toFixed(0)}%` : '')}
                      labelLine={false}
                    >
                      {typeDistribution.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(20,20,30,0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        color: '#fff',
                        fontSize: 12,
                      }}
                      itemStyle={{ color: '#fff' }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(v: number, name: string) => [`${name}: ${v}`, '类型']}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="square"
                      wrapperStyle={{ color: '#fff', fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {typeDistribution.map((d) => (
                  <span key={d.type} className="flex items-center gap-1 text-xs text-white">
                    <span className="w-2 h-2 rounded-sm" style={{ background: d.color }} />
                    {d.type} {d.count}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="h-44 flex items-center justify-center text-white/30 text-sm">暂无数据</div>
          )}
        </GlassCard>
      </div>

      {/* 热门话题标签（水平条形图）·从上传数据的 tags 字段 + 笔记内容 #xxx 提取 */}
      <GlassCard hoverable={false}>
        <h3 className="text-white font-medium text-sm flex items-center gap-2 mb-3">
          <Hash className="w-4 h-4 text-rose-400" /> 热门话题标签
          <span className="text-xs text-white/40 font-normal ml-1">
            按热度强度大小排序 · 来源：tags 列 + 笔记内容 #xxx · 删除笔记自动减{hotTags.length === 0 && ' · 暂无标签'}
          </span>
        </h3>
        {hotTags.length > 0 ? (
          <div className="space-y-1.5">
            {hotTags.map((t) => {
              const max = Math.max(...hotTags.map((x) => x.value));
              return (
                <div key={t.tag} className="flex items-center gap-2">
                  <span className="w-16 text-xs text-white truncate text-right">#{t.tag}</span>
                  <div className="flex-1 h-4 rounded-full bg-white/5 overflow-hidden relative">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-500 via-purple-500 to-indigo-500 transition-all duration-700"
                      style={{ width: `${(t.value / max) * 100}%` }}
                    />
                    {t.value === max && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white font-bold">
                        爆
                      </span>
                    )}
                  </div>
                  <span className="w-10 text-xs text-rose-300 font-mono text-right">{t.value}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-white/30 text-sm">
            <Hash className="w-10 h-10 mx-auto mb-2 text-white/15" />
            <p>暂无话题标签数据。请上传包含 tags/标签/话题 列的表格，</p>
            <p className="mt-1">或在笔记内容里写 <code className="text-rose-300 bg-white/5 px-1.5 py-0.5 rounded">#幼升小 #干货</code> 这类话题标签。</p>
          </div>
        )}
      </GlassCard>

      {/* 笔记互动排行榜 TOP 10 */}
      <GlassCard hoverable={false}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-white font-medium text-sm flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" /> {contentLabel}互动排行榜 TOP 10
            </h3>
            <p className="text-xs text-white/40 mt-0.5">
              从 <span className={isXhs ? 'text-rose-300' : 'text-cyan-300'}>{filtered.length}</span> 条命中数据中按
              {sortKey === 'all' ? '综合互动' : isXhs ? sortKey : sortKey}降序取前 10
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {sortOptions.map((s) => (
              <button
                key={s.key}
                onClick={() => setSortKey(s.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  sortKey === s.key
                    ? isXhs
                      ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white'
                      : 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {leaderboard.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {leaderboard.map((n, i) => {
              const cur = score(n);
              const pct = (cur / maxLeaderboard) * 100;
              const rank = i + 1;
              const rankColor = rank === 1 ? 'from-amber-400 to-orange-500' : rank === 2 ? 'from-slate-300 to-slate-500' : rank === 3 ? 'from-orange-400 to-amber-600' : 'from-purple-500 to-indigo-500';
              return (
                <div
                  key={n.id}
                  className="p-3 rounded-lg bg-white/5 border border-white/5 hover:border-rose-500/30 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${rankColor} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                      {rank}
                    </div>
                    <div
                      className={`w-9 h-9 rounded-lg bg-gradient-to-br ${n.accountAvatarColor || (isXhs ? 'from-rose-500 to-pink-500' : 'from-cyan-400 to-blue-500')} flex items-center justify-center text-white font-bold text-sm shrink-0`}
                    >
                      {n.accountAvatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium line-clamp-1">{n.title}</p>
                      <div className="flex items-center gap-2 text-[10px] text-white/40">
                        <span>{n.accountName}</span>
                        <span>·</span>
                        <span>{n.publishTime}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-white/50 mb-1">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-0.5">
                        <Heart className="w-3 h-3" /> {formatNumber(n.likes)}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <MessageCircle className="w-3 h-3" /> {formatNumber(n.comments)}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Share2 className="w-3 h-3" /> {formatNumber(n.shares)}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Bookmark className="w-3 h-3" /> {formatNumber(n.collects)}
                      </span>
                    </div>
                    <span className={isXhs ? 'text-rose-300 font-medium' : 'text-cyan-300 font-medium'}>
                      {sortKey === 'all' ? '综合' : ''}{formatNumber(cur)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${isXhs ? 'from-rose-500 to-pink-500' : 'from-cyan-400 to-blue-500'} rounded-full transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-white/30 text-sm">
            <BarChart3 className="w-10 h-10 mx-auto mb-2 text-white/15" />
            <p>该条件下暂无{contentLabel}。试试切换时间范围或清空类型筛选。</p>
          </div>
        )}
      </GlassCard>
    </div>
  );
};

export default DataStatsPanel;
