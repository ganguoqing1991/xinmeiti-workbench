// ===== 平台类型 =====
export type Platform = 'xiaohongshu' | 'douyin';

// ===== 对标账号 =====
export interface BenchmarkAccount {
  id: string;
  platform: Platform;
  name: string;
  homeUrl?: string; // 博主主页链接（来自上传表格「主页链接」等列，用于提取博主信息）
  avatar: string; // emoji or URL
  avatarColor: string; // gradient class
  followers: number;
  notes: number; // 笔记/视频数
  avgLikes: number;
  avgComments: number;
  avgShares: number;
  avgCollects: number;
  engagementRate: number;
  growthRate: number;
  lastSyncTime: string | null;
  syncStatus: 'synced' | 'syncing' | 'pending' | 'failed';
  hasUpdate: boolean;
  tags: string[];
  recentPosts: RecentPost[];
  trendData: TrendPoint[];
}

export interface RecentPost {
  id: string;
  title: string;
  likes: number;
  comments: number;
  shares: number;
  collects: number;
  views: number;
  publishTime: string;
  coverColor: string;
  coverUrl?: string; // 封面图片（URL 或 base64），优先于 coverColor 显示
  // 二创详情用：完整正文（来自上传表的"笔记内容/正文/文案/详情"列）
  content?: string;
  // 类型/标签：用于热门话题标签聚合 + 类型分布
  type?: string;
  tags?: string[];
  // 视频文件链接（抖音用，HTML5 video 播放）
  videoUrl?: string;
  // 音频文件链接（ASR 提取口播文字用）
  audioUrl?: string;
}

export interface TrendPoint {
  date: string;
  followers: number;
  engagement: number;
}

// ===== 上传文件 =====
export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadTime: string;
  platform: Platform;
  rows: number;
  status: 'parsed' | 'pending' | 'error' | 'confirmed';
  storedPath: string;
  // 解析后缓存：确认时直接使用，避免重读文件
  parsed?: {
    accounts: number; // 识别到的对标账号数
    posts: number; // 识别到的二创内容数
    matchedFields: string[]; // 识别到的字段名
    unrecognized: string[]; // 未识别的列
  };
  // 内存中的完整解析结果（不入 localStorage），确认时用
  fullParsed?: {
    accounts: import('../utils/parseTable').ParsedAccount[];
    posts: import('../utils/parseTable').ParsedPost[];
  };
  confirmedAt?: string;
  confirmedAccounts?: number;
  confirmedPosts?: number;
  // 合并/新增统计
  mergedCount?: number;
  newCount?: number;
  mergeReport?: {
    name: string;
    action: 'merged' | 'new';
    delta?: {
      followers: number;
      avgLikes: number;
      avgComments: number;
      avgCollects: number;
      avgShares: number;
      interScore: number;
    };
  }[];
}

// ===== 通用 =====
export interface StatItem {
  label: string;
  value: number | string;
  unit?: string;
  change?: number;
  icon?: string;
}
