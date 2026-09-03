// 二创加工任务队列 + 持久化
// 任务来源：内容展示/对标监控中点"+ 二创"按钮添加
// 任务形态：{ postId, title, content, accountName, coverUrl, platform, addedAt }

import type { Platform } from '../types';
import { archiveTaskResult } from './reprocessHistory';

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
