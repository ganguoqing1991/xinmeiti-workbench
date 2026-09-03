import type { BenchmarkAccount, TrendPoint, RecentPost, Platform } from '../types';

// ===== 内容数据：笔记/视频 =====
export interface NoteItem extends RecentPost {
  accountName: string;
  accountAvatar: string;
  accountAvatarColor: string;
  type: string; // 笔记类型：干货/经验/避坑/测评/资源/工具
}

// 小红书笔记类型分布
export const xhsNoteTypes = ['干货', '经验', '避坑', '测评', '资源', '工具'] as const;
// 抖音视频类型分布
export const dyVideoTypes = ['学习方法', '提分技巧', '家长辅导', '考试经验', '学科知识', '提分案例'] as const;

// 小红书 20 条模拟笔记（从对标账号+额外的扩展）
export const xhsNotesPool: NoteItem[] = [
  // 芥舟语文
  { id: 'xhs-note-1', accountName: '芥舟语文', accountAvatar: '芥', accountAvatarColor: 'from-rose-500 to-pink-500', type: '干货', title: '我家孩子从倒数到前三，全靠这3个习惯', likes: 6800, comments: 350, shares: 520, collects: 5500, views: 88000, publishTime: '2026-08-15', coverColor: 'from-rose-500 to-pink-500', coverUrl: 'https://picsum.photos/seed/jie1/400/500' },
  { id: 'xhs-note-2', accountName: '芥舟语文', accountAvatar: '芥', accountAvatarColor: 'from-rose-500 to-pink-500', type: '经验', title: '开学倒数6天！家长紧急收心', likes: 5200, comments: 280, shares: 410, collects: 4200, views: 72000, publishTime: '2026-08-10', coverColor: 'from-rose-500 to-pink-500' },
  { id: 'xhs-note-3', accountName: '芥舟语文', accountAvatar: '芥', accountAvatarColor: 'from-rose-500 to-pink-500', type: '资源', title: '小升初简历怎么写？模板直接拿', likes: 4500, comments: 310, shares: 680, collects: 5800, views: 95000, publishTime: '2026-08-05', coverColor: 'from-rose-500 to-pink-500', coverUrl: 'https://picsum.photos/seed/jie3/400/500' },
  // 重庆南星家长圈
  { id: 'xhs-note-4', accountName: '重庆南星家长圈', accountAvatar: '南', accountAvatarColor: 'from-purple-500 to-indigo-500', type: '避坑', title: '小升初择校，这5件事家长必须知道', likes: 4900, comments: 510, shares: 460, collects: 4200, views: 82000, publishTime: '2026-08-20', coverColor: 'from-purple-500 to-indigo-500' },
  { id: 'xhs-note-5', accountName: '重庆南星家长圈', accountAvatar: '南', accountAvatarColor: 'from-purple-500 to-indigo-500', type: '经验', title: '孩子写作业很慢？试试这3个方法亲测有效', likes: 5200, comments: 290, shares: 410, collects: 4400, views: 76000, publishTime: '2026-08-12', coverColor: 'from-purple-500 to-indigo-500', coverUrl: 'https://picsum.photos/seed/nan5/400/500' },
  { id: 'xhs-note-6', accountName: '重庆南星家长圈', accountAvatar: '南', accountAvatarColor: 'from-purple-500 to-indigo-500', type: '干货', title: '暑假弯道超车，这份计划表值得收藏', likes: 4600, comments: 230, shares: 390, collects: 4800, views: 70000, publishTime: '2026-08-08', coverColor: 'from-purple-500 to-indigo-500' },
  // 数学思维训练营
  { id: 'xhs-note-7', accountName: '数学思维训练营', accountAvatar: '数', accountAvatarColor: 'from-cyan-500 to-blue-500', type: '经验', title: '暑假最后一周，班主任不说的复习方法', likes: 4500, comments: 320, shares: 410, collects: 3800, views: 78000, publishTime: '2026-08-15', coverColor: 'from-cyan-500 to-blue-500' },
  { id: 'xhs-note-8', accountName: '数学思维训练营', accountAvatar: '数', accountAvatarColor: 'from-cyan-500 to-blue-500', type: '工具', title: '小学数学应用题万能解法模板', likes: 5400, comments: 360, shares: 590, collects: 5100, views: 96000, publishTime: '2026-08-09', coverColor: 'from-cyan-500 to-blue-500', coverUrl: 'https://picsum.photos/seed/shu8/400/500' },
  { id: 'xhs-note-9', accountName: '数学思维训练营', accountAvatar: '数', accountAvatarColor: 'from-cyan-500 to-blue-500', type: '干货', title: '5年级数学难点突破，家长这样辅导', likes: 4200, comments: 280, shares: 350, collects: 3600, views: 68000, publishTime: '2026-08-04', coverColor: 'from-cyan-500 to-blue-500' },
  // 小升初情报站
  { id: 'xhs-note-10', accountName: '小升初情报站', accountAvatar: '情', accountAvatarColor: 'from-amber-500 to-orange-500', type: '测评', title: '2026年重庆小升初政策全解读', likes: 3800, comments: 410, shares: 320, collects: 3300, views: 65000, publishTime: '2026-08-18', coverColor: 'from-amber-500 to-orange-500' },
  { id: 'xhs-note-11', accountName: '小升初情报站', accountAvatar: '情', accountAvatarColor: 'from-amber-500 to-orange-500', type: '资源', title: '六年级学习规划万能模板免费下载', likes: 4100, comments: 360, shares: 380, collects: 4400, views: 72000, publishTime: '2026-08-12', coverColor: 'from-amber-500 to-orange-500', coverUrl: 'https://picsum.photos/seed/qing11/400/500' },
  { id: 'xhs-note-12', accountName: '小升初情报站', accountAvatar: '情', accountAvatarColor: 'from-amber-500 to-orange-500', type: '经验', title: '小升初家长群运营50问，十年经验', likes: 3500, comments: 290, shares: 320, collects: 3100, views: 58000, publishTime: '2026-08-06', coverColor: 'from-amber-500 to-orange-500' },
];

// 抖音 20 条模拟视频
export const dyVideosPool: NoteItem[] = [
  { id: 'dy-video-1', accountName: '学霸笔记分享', accountAvatar: '学', accountAvatarColor: 'from-cyan-400 to-blue-500', type: '学习方法', title: '开学倒数6天！家长紧急收心', likes: 34500, comments: 1500, shares: 2300, collects: 1200, views: 345700, publishTime: '2026-08-21', coverColor: 'from-rose-500 to-pink-500', coverUrl: 'https://picsum.photos/seed/dy1/400/500' },
  { id: 'dy-video-2', accountName: '学霸笔记分享', accountAvatar: '学', accountAvatarColor: 'from-cyan-400 to-blue-500', type: '提分技巧', title: '孩子专注力差的4原因找到了', likes: 27800, comments: 1980, shares: 1200, collects: 980, views: 278000, publishTime: '2026-08-07', coverColor: 'from-cyan-500 to-blue-500', coverUrl: 'https://picsum.photos/seed/dy2/400/500' },
  { id: 'dy-video-3', accountName: '学霸笔记分享', accountAvatar: '学', accountAvatarColor: 'from-cyan-400 to-blue-500', type: '家长辅导', title: '为什么你的孩子做作业很慢？', likes: 25600, comments: 1100, shares: 950, collects: 850, views: 256000, publishTime: '2026-08-14', coverColor: 'from-purple-500 to-indigo-500' },
  { id: 'dy-video-4', accountName: '学霸笔记分享', accountAvatar: '学', accountAvatarColor: 'from-cyan-400 to-blue-500', type: '考试经验', title: '一道题秒杀所有应用题问题', likes: 23400, comments: 980, shares: 780, collects: 720, views: 234000, publishTime: '2026-08-12', coverColor: 'from-amber-500 to-orange-500', coverUrl: 'https://picsum.photos/seed/dy4/400/500' },
  { id: 'dy-video-5', accountName: '学霸笔记分享', accountAvatar: '学', accountAvatarColor: 'from-cyan-400 to-blue-500', type: '提分案例', title: '逆袭掌握技巧，家长一定要给孩子看', likes: 21000, comments: 880, shares: 720, collects: 680, views: 210000, publishTime: '2026-08-09', coverColor: 'from-emerald-500 to-teal-500' },
  { id: 'dy-video-6', accountName: '学霸笔记分享', accountAvatar: '学', accountAvatarColor: 'from-cyan-400 to-blue-500', type: '学科知识', title: '青春期孩子怎么沟通才不发火？', likes: 21000, comments: 760, shares: 680, collects: 540, views: 210000, publishTime: '2026-08-05', coverColor: 'from-rose-500 to-pink-500' },
  { id: 'dy-video-7', accountName: '教培老司机', accountAvatar: '教', accountAvatarColor: 'from-fuchsia-500 to-purple-500', type: '学习方法', title: '如何让孩子主动学习而不是被逼着学', likes: 19200, comments: 1200, shares: 540, collects: 410, views: 192000, publishTime: '2026-08-19', coverColor: 'from-fuchsia-500 to-purple-500' },
  { id: 'dy-video-8', accountName: '教培老司机', accountAvatar: '教', accountAvatarColor: 'from-fuchsia-500 to-purple-500', type: '提分技巧', title: '小学数学应用题解答思路', likes: 18500, comments: 690, shares: 320, collects: 480, views: 185000, publishTime: '2026-08-15', coverColor: 'from-cyan-500 to-blue-500' },
  { id: 'dy-video-9', accountName: '教培老司机', accountAvatar: '教', accountAvatarColor: 'from-fuchsia-500 to-purple-500', type: '家长辅导', title: '三年级现象如何平稳过渡？', likes: 16800, comments: 540, shares: 280, collects: 360, views: 168000, publishTime: '2026-08-11', coverColor: 'from-amber-500 to-orange-500' },
  { id: 'dy-video-10', accountName: '教培老司机', accountAvatar: '教', accountAvatarColor: 'from-fuchsia-500 to-purple-500', type: '考试经验', title: '中考体育拿满分的关键3点', likes: 15200, comments: 480, shares: 220, collects: 280, views: 152000, publishTime: '2026-08-03', coverColor: 'from-emerald-500 to-teal-500' },
  { id: 'dy-video-11', accountName: '重庆升学通', accountAvatar: '升', accountAvatarColor: 'from-amber-400 to-orange-500', type: '学习方法', title: '小学1-6年级书单推荐完整版', likes: 14600, comments: 690, shares: 580, collects: 1100, views: 146000, publishTime: '2026-08-20', coverColor: 'from-amber-500 to-orange-500' },
  { id: 'dy-video-12', accountName: '重庆升学通', accountAvatar: '升', accountAvatarColor: 'from-amber-400 to-orange-500', type: '提分技巧', title: '高考语文作文开头万能模板', likes: 12800, comments: 420, shares: 380, collects: 520, views: 128000, publishTime: '2026-08-13', coverColor: 'from-rose-500 to-pink-500' },
  { id: 'dy-video-13', accountName: '重庆升学通', accountAvatar: '升', accountAvatarColor: 'from-amber-400 to-orange-500', type: '家长辅导', title: '双减后家长应该怎么辅导孩子？', likes: 11500, comments: 380, shares: 240, collects: 360, views: 115000, publishTime: '2026-08-08', coverColor: 'from-purple-500 to-indigo-500' },
  { id: 'dy-video-14', accountName: '英语提分君', accountAvatar: '英', accountAvatarColor: 'from-emerald-400 to-teal-500', type: '学科知识', title: '英语语法口诀3分钟全记住', likes: 18900, comments: 720, shares: 480, collects: 1200, views: 189000, publishTime: '2026-08-22', coverColor: 'from-emerald-500 to-teal-500' },
  { id: 'dy-video-15', accountName: '英语提分君', accountAvatar: '英', accountAvatarColor: 'from-emerald-400 to-teal-500', type: '提分技巧', title: '中考英语高频词组100个', likes: 16800, comments: 580, shares: 420, collects: 980, views: 168000, publishTime: '2026-08-16', coverColor: 'from-cyan-500 to-blue-500' },
  { id: 'dy-video-16', accountName: '英语提分君', accountAvatar: '英', accountAvatarColor: 'from-emerald-400 to-teal-500', type: '考试经验', title: '高考英语作文拿高分的5个套路', likes: 14200, comments: 480, shares: 320, collects: 720, views: 142000, publishTime: '2026-08-10', coverColor: 'from-amber-500 to-orange-500' },
];

// 发布趋势 20 天数据（用于数据统计面板）
// 用确定性种子（index）避免 Math.random 导致的页面跳动 + "胡编"问题
export function genPublishTrend(platform: Platform, days = 20): { date: string; count: number; interactions: number }[] {
  const points: { date: string; count: number; interactions: number }[] = [];
  const now = new Date('2026-08-25');
  const seedBase = platform === 'xiaohongshu' ? 42 : 73;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const date = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // 用 sin 函数模拟真实波动（确定性，刷新不变）
    const wave = Math.sin((i + seedBase) * 0.7) * 0.5 + 0.5;
    const count = Math.round(wave * 4) + 1; // 1-5 篇/天
    const interactions = Math.round(wave * 60000) + 25000;
    points.push({ date, count, interactions });
  }
  return points;
}

// 类型分布数据
export function genTypeDistribution(items: NoteItem[]): { type: string; count: number; color: string }[] {
  const map = new Map<string, number>();
  items.forEach((it) => map.set(it.type, (map.get(it.type) || 0) + 1));
  const palette = ['#A855F7', '#06B6D4', '#F59E0B', '#10B981', '#F43F5E', '#3B82F6', '#8B5CF6'];
  return Array.from(map.entries()).map(([type, count], i) => ({ type, count, color: palette[i % palette.length] }));
}

// 热门话题标签（水平条形图数据）
export const hotTopicTags = [
  { tag: '学习方法', value: 95 },
  { tag: '升学规划', value: 88 },
  { tag: '亲子沟通', value: 75 },
  { tag: '开学季', value: 70 },
  { tag: '学霸养成', value: 60 },
  { tag: '高效学习', value: 50 },
  { tag: '家庭教育', value: 42 },
  { tag: '专注力', value: 32 },
  { tag: '时间管理', value: 28 },
  { tag: '错题本', value: 22 },
];

// ===== 小红书对标账号 =====
function genTrend(base: number, variance: number): TrendPoint[] {
  const points: TrendPoint[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    // 确定性种子：避免刷新页面数字跳动（让用户感觉"胡编"）
    const wave = Math.sin(i * 0.85) * 0.5 + 0.5;
    const followers = Math.round(base + wave * variance);
    const engagement = parseFloat((3 + wave * 4).toFixed(1));
    points.push({
      date: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      followers,
      engagement,
    });
  }
  return points;
}

function genPosts(platform: Platform): RecentPost[] {
  const xhsTitles = [
    '孩子写作业磨蹭？3个方法亲测有效',
    '小升初简历怎么写？模板直接拿',
    '五年级数学应用题专项突破',
    '暑假弯道超车：这份计划表值得收藏',
    '班主任不说的秘密：座位安排有讲究',
    '期末复习神器：思维导图法',
    '拼音总写错？这套方法绝了',
    '小学1-6年级书单推荐（完整版）',
  ];
  const dyTitles = [
    '数学不好怎么办？一招解决',
    '初中物理怎么学？学霸笔记分享',
    '英语语法口诀，3分钟全记住',
    '暑假逆袭计划：每天2小时',
    '作文高分秘诀：万能开头模板',
    '化学方程式记忆法',
    '小学计算能力训练方法',
    '中考体育满分攻略',
  ];
  const titles = platform === 'xiaohongshu' ? xhsTitles : dyTitles;
  const colors = ['from-rose-500 to-pink-500', 'from-purple-500 to-indigo-500', 'from-cyan-500 to-blue-500', 'from-amber-500 to-orange-500', 'from-emerald-500 to-teal-500', 'from-fuchsia-500 to-purple-500'];
  // 确定性数值：基于 index + 平台，避免刷新页面时数字跳动（用户感觉"胡编乱造"）
  return titles.slice(0, 6).map((title, i) => {
    const base = platform === 'xiaohongshu' ? 1200 : 8000;
    const seed = i + 1;
    return {
      id: `${platform}-post-${i}`,
      title,
      likes: base + seed * 450,
      comments: 80 + seed * 22,
      shares: 60 + seed * 18,
      collects: 500 + seed * 130,
      views: 12000 + seed * 4500,
      publishTime: `2026-08-${String(25 - i).padStart(2, '0')}`,
      coverColor: colors[i % colors.length],
    };
  });
}

export const xhsBenchmarkAccounts: BenchmarkAccount[] = [
  {
    id: 'xhs-1',
    platform: 'xiaohongshu',
    name: '芥舟语文',
    avatar: '芥',
    avatarColor: 'from-rose-500 to-pink-500',
    followers: 86500,
    notes: 342,
    avgLikes: 3200,
    avgComments: 280,
    avgShares: 150,
    avgCollects: 2800,
    engagementRate: 8.2,
    growthRate: 5.1,
    lastSyncTime: new Date(Date.now() - 3600000 * 2).toISOString(),
    syncStatus: 'synced',
    hasUpdate: false,
    tags: ['语文', 'K12', '爆款'],
    recentPosts: genPosts('xiaohongshu'),
    trendData: genTrend(86000, 500),
  },
  {
    id: 'xhs-2',
    platform: 'xiaohongshu',
    name: '重庆南星家长圈',
    avatar: '南',
    avatarColor: 'from-purple-500 to-indigo-500',
    followers: 42300,
    notes: 218,
    avgLikes: 1800,
    avgComments: 150,
    avgShares: 80,
    avgCollects: 1200,
    engagementRate: 6.5,
    growthRate: 3.2,
    lastSyncTime: new Date(Date.now() - 3600000 * 8).toISOString(),
    syncStatus: 'synced',
    hasUpdate: true,
    tags: ['家长社群', '本地', '引流'],
    recentPosts: genPosts('xiaohongshu'),
    trendData: genTrend(42000, 300),
  },
  {
    id: 'xhs-3',
    platform: 'xiaohongshu',
    name: '数学思维训练营',
    avatar: '数',
    avatarColor: 'from-cyan-500 to-blue-500',
    followers: 128000,
    notes: 567,
    avgLikes: 5600,
    avgComments: 420,
    avgShares: 230,
    avgCollects: 4500,
    engagementRate: 9.1,
    growthRate: 7.8,
    lastSyncTime: null,
    syncStatus: 'pending',
    hasUpdate: true,
    tags: ['数学', '思维', '头部账号'],
    recentPosts: genPosts('xiaohongshu'),
    trendData: genTrend(127000, 800),
  },
  {
    id: 'xhs-4',
    platform: 'xiaohongshu',
    name: '小升初情报站',
    avatar: '情',
    avatarColor: 'from-amber-500 to-orange-500',
    followers: 67800,
    notes: 289,
    avgLikes: 2400,
    avgComments: 310,
    avgShares: 120,
    avgCollects: 2100,
    engagementRate: 7.3,
    growthRate: 4.5,
    lastSyncTime: new Date(Date.now() - 3600000 * 24).toISOString(),
    syncStatus: 'synced',
    hasUpdate: false,
    tags: ['小升初', '信息差', '干货'],
    recentPosts: genPosts('xiaohongshu'),
    trendData: genTrend(67000, 400),
  },
];

export const dyBenchmarkAccounts: BenchmarkAccount[] = [
  {
    id: 'dy-1',
    platform: 'douyin',
    name: '学霸笔记分享',
    avatar: '学',
    avatarColor: 'from-cyan-400 to-blue-500',
    followers: 156000,
    notes: 423,
    avgLikes: 8900,
    avgComments: 670,
    avgShares: 1200,
    avgCollects: 3400,
    engagementRate: 10.2,
    growthRate: 6.5,
    lastSyncTime: new Date(Date.now() - 3600000 * 3).toISOString(),
    syncStatus: 'synced',
    hasUpdate: true,
    tags: ['学习分享', '头部', '知识区'],
    recentPosts: genPosts('douyin'),
    trendData: genTrend(155000, 1000),
  },
  {
    id: 'dy-2',
    platform: 'douyin',
    name: '教培老司机',
    avatar: '教',
    avatarColor: 'from-fuchsia-500 to-purple-500',
    followers: 89000,
    notes: 312,
    avgLikes: 4200,
    avgComments: 380,
    avgShares: 560,
    avgCollects: 1800,
    engagementRate: 7.8,
    growthRate: 4.2,
    lastSyncTime: null,
    syncStatus: 'pending',
    hasUpdate: true,
    tags: ['教培', '运营', '方法论'],
    recentPosts: genPosts('douyin'),
    trendData: genTrend(88000, 600),
  },
  {
    id: 'dy-3',
    platform: 'douyin',
    name: '重庆升学通',
    avatar: '升',
    avatarColor: 'from-amber-400 to-orange-500',
    followers: 56000,
    notes: 198,
    avgLikes: 2600,
    avgComments: 220,
    avgShares: 340,
    avgCollects: 900,
    engagementRate: 6.5,
    growthRate: 3.8,
    lastSyncTime: new Date(Date.now() - 3600000 * 5).toISOString(),
    syncStatus: 'synced',
    hasUpdate: false,
    tags: ['本地', '升学', '重庆'],
    recentPosts: genPosts('douyin'),
    trendData: genTrend(55000, 350),
  },
  {
    id: 'dy-4',
    platform: 'douyin',
    name: '英语提分君',
    avatar: '英',
    avatarColor: 'from-emerald-400 to-teal-500',
    followers: 203000,
    notes: 678,
    avgLikes: 12000,
    avgComments: 980,
    avgShares: 2300,
    avgCollects: 5600,
    engagementRate: 11.5,
    growthRate: 8.9,
    lastSyncTime: new Date(Date.now() - 3600000 * 1).toISOString(),
    syncStatus: 'synced',
    hasUpdate: true,
    tags: ['英语', '提分', '大V'],
    recentPosts: genPosts('douyin'),
    trendData: genTrend(200000, 1500),
  },
];

// ===== Dashboard 总览数据 =====
export const dashboardStats = {
  totalFollowers: { xhs: 324600, dy: 504000 },
  totalNotes: { xhs: 1416, dy: 1611 },
  totalEngagement: { xhs: 8.0, dy: 9.0 },
  weeklyNewFollowers: { xhs: 3200, dy: 5600 },
};

export const weeklyActivity = [
  { day: '周一', xhs: 12, dy: 8 },
  { day: '周二', xhs: 15, dy: 10 },
  { day: '周三', xhs: 8, dy: 6 },
  { day: '周四', xhs: 18, dy: 12 },
  { day: '周五', xhs: 22, dy: 15 },
  { day: '周六', xhs: 25, dy: 18 },
  { day: '周日', xhs: 10, dy: 7 },
];

// ===== 共享数据源（Dashboard / Community / Live 通用） =====

// 6 个私域社群
export const groupsData = [
  { id: 'g1', name: '已学习一周复盘', members: 486, weeklyActive: 72, engagement: 8.5, leader: '待定', color: 'from-cyan-500 to-blue-500' },
  { id: 'g2', name: '初三全一冲复盘', members: 512, weeklyActive: 68, engagement: 7.2, leader: '待定', color: 'from-amber-500 to-orange-500' },
  { id: 'g3', name: '五年级三升四暑假复盘', members: 634, weeklyActive: 85, engagement: 12.3, leader: '待定', color: 'from-emerald-500 to-teal-500' },
  { id: 'g4', name: '五年级三升四小升初衔接', members: 388, weeklyActive: 62, engagement: 6.8, leader: '待定', color: 'from-rose-500 to-pink-500' },
  { id: 'g5', name: '五年级三升四每周小打卡', members: 712, weeklyActive: 78, engagement: 15.2, leader: '待定', color: 'from-purple-500 to-indigo-500' },
  { id: 'g6', name: '五年级三升四小打卡', members: 856, weeklyActive: 90, engagement: 18.6, leader: '待定', color: 'from-amber-400 to-orange-500' },
];

// 视频号对标账号（用于首页平台粉丝分布 + 趋势图）
export const videoBenchmarkAccounts: BenchmarkAccount[] = [
  {
    id: 'shp-1', platform: 'xiaohongshu', name: '李老师讲数学', avatar: '李', avatarColor: 'from-amber-500 to-orange-500',
    followers: 38400, growthRate: 6.2, engagementRate: 7.8, avgLikes: 1820, avgComments: 158, avgShares: 240, avgCollects: 1250,
    notes: 86, tags: ['数学', '小升初'], lastSyncTime: '2026-08-25T08:30:00Z', syncStatus: 'synced', hasUpdate: false,
    trendData: [
      { date: '08-19', followers: 35500, engagement: 7.5 }, { date: '08-20', followers: 36100, engagement: 7.6 }, { date: '08-21', followers: 36800, engagement: 7.7 },
      { date: '08-22', followers: 37200, engagement: 7.8 }, { date: '08-23', followers: 37600, engagement: 7.7 }, { date: '08-24', followers: 38000, engagement: 7.8 },
      { date: '08-25', followers: 38400, engagement: 7.8 },
    ],
    recentPosts: [
      { id: 'shp-1-1', title: '小学数学应用题万能解法', likes: 3200, comments: 280, shares: 410, collects: 2100, views: 45000, publishTime: '2026-08-23', coverColor: 'from-amber-500 to-orange-500' },
    ],
  },
  {
    id: 'shp-2', platform: 'xiaohongshu', name: '语文启蒙园', avatar: '语', avatarColor: 'from-emerald-500 to-teal-500',
    followers: 26800, growthRate: 4.8, engagementRate: 9.2, avgLikes: 1280, avgComments: 220, avgShares: 180, avgCollects: 980,
    notes: 64, tags: ['语文', '启蒙'], lastSyncTime: '2026-08-25T08:30:00Z', syncStatus: 'synced', hasUpdate: false,
    trendData: [
      { date: '08-19', followers: 24800, engagement: 9.0 }, { date: '08-20', followers: 25200, engagement: 9.1 }, { date: '08-21', followers: 25600, engagement: 9.1 },
      { date: '08-22', followers: 25900, engagement: 9.2 }, { date: '08-23', followers: 26200, engagement: 9.2 }, { date: '08-24', followers: 26500, engagement: 9.2 },
      { date: '08-25', followers: 26800, engagement: 9.2 },
    ],
    recentPosts: [
      { id: 'shp-2-1', title: '一年级拼音速记口诀', likes: 1800, comments: 156, shares: 220, collects: 1340, views: 32000, publishTime: '2026-08-22', coverColor: 'from-emerald-500 to-teal-500' },
    ],
  },
];

// 直播配置（GMV、转化率）
export const liveConfig = {
  todayGMV: 28560, // 今日直播 GMV
  conversionRate: 4.2, // 转化率
  exposure: 12480, // 今日曝光
  addedWechat: 524, // 今日加微
  paidOrders: 31, // 付费订单
  liveViewers: 1820, // 在线观众
  liveStartTime: '19:00',
  liveDuration: 90, // 分钟
};

// 今日待办
export const todayTodos = [
  { id: 't1', text: '发布小红书暑期复盘笔记', done: false, priority: 'high' },
  { id: 't2', text: '回复社群家长加微申请（15条未读）', done: false, priority: 'high' },
  { id: 't3', text: '抖音本周热门视频二创排期', done: true, priority: 'medium' },
  { id: 't4', text: '品牌方达人寄样物流跟进', done: false, priority: 'medium' },
  { id: 't5', text: '自动同步对标账号新数据', done: false, priority: 'low' },
];

// 旗手纳重点（运营 / 直播 / 内容）
export const focusItems = [
  { id: 'f1', category: '直播', title: '新东方开学第一课', desc: '观看人数：1.2万人 飞书运营', time: '20:30', tag: '直播' },
  { id: 'f2', category: '内容', title: '创量公约', desc: '12小时前更新 学到新玩法', time: '15:30', tag: '内容' },
  { id: 'f3', category: '客情', title: '牌牌纪念日', desc: '观看 187 场 4 个跨年级家长', time: '08:30', tag: '客情' },
  { id: 'f4', category: '内部', title: '创量联会', desc: '创量三组 21 个账号的周复盘', time: '18:30', tag: '内部' },
  { id: 'f5', category: '教研', title: '夏令营出发', desc: '创量 1-6 年级 暑假高营', time: '16:00', tag: '教研' },
];

// 旗手纳 TOP 5 头部标题（用户自定义或 mock）
export const topFlagshipTitles = [
  '暑假最后 30 天，班主任不说的复习方法',
  '我拿孩子从倒数到第二，全靠这 3 个习惯',
  '开学前家长必看！5 件事让孩子少走 1 年弯路',
  '三年级数学学不会？99% 是因为没打好这个基础',
  '一年级拼音难？北师大学霸妈妈这样做',
];

// 计算首页"近 7 天平台总粉丝增长趋势"（3 平台聚合）
export function getWeeklyPlatformTrend() {
  const days = ['08-19', '08-20', '08-21', '08-22', '08-23', '08-24', '08-25'];
  // 初始基数 + 波动
  return days.map((date, i) => {
    const base = 80000 + i * 1800;
    return {
      date,
      xhs: base + Math.round(Math.sin(i * 0.6) * 3000 + i * 600),
      dy: base + 20000 + Math.round(Math.cos(i * 0.5) * 4000 + i * 800),
      video: base - 40000 + Math.round(Math.sin(i * 0.7) * 2000 + i * 300),
    };
  });
}

// 平台粉丝分布（用于环形图）
export function getPlatformDistribution() {
  return [
    { name: '小红书', value: 324600, color: '#EC4899' },
    { name: '抖音', value: 504000, color: '#06B6D4' },
    { name: '视频号', value: 65200, color: '#10B981' },
  ];
}
