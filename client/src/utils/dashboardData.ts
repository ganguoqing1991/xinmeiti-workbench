// 数据总览的数据聚合层：只读取各模块已录入的真实数据，不做任何编造
// 单独的模块便于页面复用与独立测试

import type { Platform } from '../types';
import { getSyncedAccounts } from './syncedPool';
import { getSessions, type LiveSession } from './liveStore';
import { getGroups, getActivities, getTasks, hasSeedData, clearSeedData } from './communityStore';
import { getHotspots } from './hotspotStore';
import { getReflection, getReports, periodRange, periodKeyOf } from './growthStore';

export const inRange = (d: string, r: { start: string; end: string }) => !!d && d >= r.start && d <= r.end;

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export interface TopPost {
  title: string;
  platform: string;
  likes: number;
  collects: number;
  date: string;
  total: number;
}

export interface PlatformSummary {
  count: number;
  followers: number;
  notes: number;
  weekPosts: number;
  weekViews: number;
  hitRate: number;      // 点赞超账号均值 2 倍的占比
  engagement: number;   // 平均互动率
  growth: number;       // 平均涨粉率
  series: { day: string; value: number }[]; // 近 7 天发布量
  top: TopPost[];       // 近 30 天互动 TOP5
}

/** 抖音 / 小红书平台盘：数据来自对标监控同步过来的账号 */
export function platformSummary(platform: Platform): PlatformSummary {
  const accs = getSyncedAccounts(platform).map((s) => s.account);
  const week = periodRange('weekly', 0);
  let weekPosts = 0;
  let weekViews = 0;
  let hit = 0;
  const byDay: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) byDay[daysAgo(i)] = 0;
  const posts: TopPost[] = [];

  for (const a of accs) {
    for (const p of a.recentPosts || []) {
      const d = String(p.publishTime || '').slice(0, 10);
      const total = (p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.collects || 0);
      if (d in byDay) byDay[d] += 1;
      if (inRange(d, week)) {
        weekPosts += 1;
        weekViews += p.views || 0;
        if ((a.avgLikes || 0) > 0 && (p.likes || 0) >= a.avgLikes * 2) hit += 1;
      }
      if (d >= daysAgo(29)) {
        posts.push({ title: p.title || '未命名', platform, likes: p.likes || 0, collects: p.collects || 0, date: d, total });
      }
    }
  }

  const engArr = accs.map((a) => a.engagementRate || 0).filter((n) => n > 0);
  const growArr = accs.map((a) => a.growthRate || 0).filter((n) => Number.isFinite(n));
  return {
    count: accs.length,
    followers: accs.reduce((s, a) => s + (a.followers || 0), 0),
    notes: accs.reduce((s, a) => s + (a.notes || 0), 0),
    weekPosts,
    weekViews,
    hitRate: weekPosts ? (hit / weekPosts) * 100 : 0,
    engagement: engArr.length ? engArr.reduce((a, b) => a + b, 0) / engArr.length : 0,
    growth: growArr.length ? growArr.reduce((a, b) => a + b, 0) / growArr.length : 0,
    series: Object.entries(byDay).map(([day, value]) => ({ day: day.slice(5), value })),
    top: posts.sort((a, b) => b.total - a.total).slice(0, 5),
  };
}

/** 直播盘：数据来自直播工作间导入的场次表 */
export function liveSummary() {
  const ss = getSessions();
  const week = periodRange('weekly', 0);
  const cur = ss.filter((s) => inRange(s.date, week));
  const recent: LiveSession[] = [...ss].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).reverse();
  return {
    count: ss.length,
    weekCount: cur.length,
    weekViewers: cur.reduce((s, x) => s + (x.viewers || 0), 0),
    weekAdds: cur.reduce((s, x) => s + (x.wechatAdds || 0), 0),
    weekFollowers: cur.reduce((s, x) => s + (x.newFollowers || 0), 0),
    weekGmv: cur.reduce((s, x) => s + (x.gmv || 0), 0),
    avgOnline: cur.length ? cur.reduce((s, x) => s + (x.avgOnline || 0), 0) / cur.length : 0,
    series: recent.map((s) => ({ day: s.date.slice(5), value: s.viewers || 0 })),
    list: [...recent].reverse().slice(0, 5),
  };
}

/** 私域盘：数据来自私域社群录入的群与活动 */
export function privateSummary() {
  const gs = getGroups();
  const acts = getActivities();
  const week = periodRange('weekly', 0);
  const cur = acts.filter((a) => inRange(a.date, week));
  let net = 0;
  for (const g of gs) {
    const h = g.memberHistory || [];
    if (h.length >= 2) net += h[h.length - 1].count - h[h.length - 2].count;
  }
  const byDay: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) byDay[daysAgo(i)] = 0;
  for (const a of acts) if (a.date in byDay) byDay[a.date] += 1;
  return {
    groupCount: gs.length,
    members: gs.reduce((s, g) => s + (g.members || 0), 0),
    net,
    weekActs: cur.length,
    weekDeals: cur.reduce((s, a) => s + (a.deals || 0), 0),
    weekRevenue: cur.reduce((s, a) => s + (a.revenue || 0), 0),
    series: Object.entries(byDay).map(([day, value]) => ({ day: day.slice(5), value })),
    seed: hasSeedData(), // 是否混有系统示例数据
  };
}

export { clearSeedData };

/** 团队盘（管理员）：成员、周报、任务、人效 */
export function teamSummary(names: string[]) {
  const week = periodRange('weekly', 0);
  const weekKey = periodKeyOf('weekly');
  const tasks = getTasks().filter((t) => names.includes(t.assignee) && inRange(t.date, week));
  const acts = getActivities().filter((a) => inRange(a.date, week));
  const gmv =
    acts.reduce((s, a) => s + (a.revenue || 0), 0) +
    getSessions().filter((s) => inRange(s.date, week)).reduce((s, x) => s + (x.gmv || 0), 0);
  const reports = getReports();
  return {
    headcount: names.length,
    done: tasks.filter((t) => t.done).length,
    total: tasks.length,
    rate: tasks.length ? (tasks.filter((t) => t.done).length / tasks.length) * 100 : 0,
    submitted: names.filter((n) => !!getReflection(n, 'weekly', weekKey)).length,
    reported: names.filter((n) => reports.some((r) => r.staffName === n && r.period === 'weekly' && r.periodKey === weekKey)).length,
    gmv,
    perCapita: names.length ? gmv / names.length : 0,
  };
}

/** 本月热点（来自运营管理录入的热点） */
export function hotspotSummary() {
  const r = periodRange('monthly', 0);
  const list = getHotspots()
    .filter((h) => inRange(h.date, r))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { count: list.length, list: list.slice(0, 6) };
}
