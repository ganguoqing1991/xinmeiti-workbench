// 二创加工任务队列 + 持久化
// 任务来源：内容展示/对标监控中点"+ 二创"按钮添加
// 任务形态：{ postId, title, content, accountName, coverUrl, platform, addedAt }

import type { Platform } from '../types';
import { archiveTaskResult } from './reprocessHistory';

// ===== 创作工作台数据（标题 → 提纲 → 分页 → 配图 → 成绩 五阶段）=====
/** 配图阶段的一张图：AI 生成或手动上传，可整体替换 */
export interface TaskImage {
  id: string;
  url: string; // http(s) url 或 dataURL
  prompt: string; // 生图提示词（重新生成时使用）
  source: 'ai' | 'upload';
  isCover: boolean;
  createdAt: string;
}

/** 成绩阶段：发布后的数据记录 */
export interface TaskMetrics {
  publishedAt?: string;
  publishUrl?: string;
  likes?: number;
  collects?: number;
  comments?: number;
  shares?: number;
}

/** 五阶段工作台数据，全部可选（旧任务没有这些字段也能正常打开） */
export interface ReprocessStudio {
  stage: number; // 当前所在步骤 0 标题 / 1 提纲 / 2 分页 / 3 配图 / 4 成绩
  titleOptions: string[]; // 标题方案（AI 生成或手动添加）
  chosenTitle?: string;
  outline: string[]; // 提纲要点
  sections: string[]; // 分页正文（每页一段）
  images: TaskImage[];
  metrics?: TaskMetrics;
  /** 生图是否跟随文案模型（共用 Key/BaseURL），缺省 true */
  imageSameAsLLM?: boolean;
  /** 生图模型名（独立于文案模型） */
  imageModelName?: string;
  /** 出图尺寸 */
  imageSize?: string;
}

export interface ReprocessTask {
  id: string; // 任务 ID（生成时给）
  postId: string; // 原始内容 ID
  title: string;
  content: string;
  accountName: string;
  coverUrl?: string;
  videoUrl?: string; // 视频文件链接（解析后）
  audioUrl?: string; // 音频文件链接（用于 ASR 提取口播）
  platform: Platform;
  addedAt: string; // ISO
  // 状态机：idle=已加入未触发 / pending=在批量队列中等待 / processing=处理中 / done=完成 / error=失败
  status: 'idle' | 'pending' | 'processing' | 'done' | 'error';
  // 批量模式：二创改写 / 内容分析（引擎按此决定输出结构）
  mode?: 'recreate' | 'analyze';
  // 关联技能 id（可选）
  skillId?: string;
  // 处理进度文案（引擎实时写回）
  progress?: string;
  // 失败原因
  errorMsg?: string;
  // 操作人（谁触发/完成，用于通知中心）
  actor?: string;
  result?: string; // 生成的二创内容
  resultAt?: string;
  // ASR 提取标记：true 表示 content 已被 ASR 转写填充
  transcripted?: boolean;
  // 五阶段创作工作台数据（标题/提纲/分页/配图/成绩），可选
  studio?: ReprocessStudio;
}

const STORAGE_KEY = 'reprocess_queue_v1';

function readQueue(): ReprocessTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ReprocessTask[];
  } catch {
    return [];
  }
}

function writeQueue(list: ReprocessTask[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('写入任务队列失败', e);
  }
}

export function getReprocessTasks(): ReprocessTask[] {
  return readQueue();
}

export function addReprocessTask(
  payload: Omit<ReprocessTask, 'id' | 'status' | 'addedAt'> & { addedAt?: string }
): ReprocessTask {
  const list = readQueue();
  // 同一 postId 多次添加视为更新
  const existingIdx = list.findIndex((t) => t.postId === payload.postId);
  const task: ReprocessTask = {
    id: existingIdx >= 0 ? list[existingIdx].id : `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    status: 'idle',
    addedAt: payload.addedAt || new Date().toISOString(),
    ...payload,
  };
  if (existingIdx >= 0) {
    // 【结果留存】重复添加同一条内容会覆盖原任务，覆盖前先把已生成的结果存档，避免静默丢失
    try {
      archiveTaskResult(list[existingIdx], 'delete');
    } catch (e) {
      console.warn('归档旧结果失败', e);
    }
    list[existingIdx] = task;
  } else list.unshift(task);
  writeQueue(list);
  return task;
}

export function removeReprocessTask(id: string) {
  const list = readQueue().filter((t) => t.id !== id);
  writeQueue(list);
}

export function removeManyReprocessTasks(ids: string[]) {
  const idSet = new Set(ids);
  const list = readQueue().filter((t) => !idSet.has(t.id));
  writeQueue(list);
}

export function clearReprocessQueue() {
  // 【结果留存】全量清空前先把已有结果全部存档
  try {
    readQueue().forEach((t) => archiveTaskResult(t, 'delete'));
  } catch (e) {
    console.warn('归档结果失败', e);
  }
  writeQueue([]);
}

export function reorderReprocessTasks(orderedIds: string[]) {
  const list = readQueue();
  const byId = new Map(list.map((t) => [t.id, t]));
  const next: ReprocessTask[] = [];
  orderedIds.forEach((id) => {
    const t = byId.get(id);
    if (t) next.push(t);
    byId.delete(id);
  });
  // 没在 orderedIds 中的（异常情况）追加到末尾
  byId.forEach((t) => next.push(t));
  writeQueue(next);
}

export function updateReprocessTask(id: string, patch: Partial<ReprocessTask>) {
  const list = readQueue();
  const idx = list.findIndex((t) => t.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], ...patch };
  writeQueue(list);
}
