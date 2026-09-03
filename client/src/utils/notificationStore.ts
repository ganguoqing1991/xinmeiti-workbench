// 全局通知中心 store（localStorage 持久化）
// 与二创队列引擎联动：原文提取完成 / 二创完成 / 分析完成 / 失败 都会推一条通知
// 顶栏「通知中心」与二创页任务栏都从这里读取

import type { Platform } from '../types';

export type NoticeType = 'extract' | 'recreate' | 'analyze' | 'error' | 'info';

export interface AppNotification {
  id: string;
  type: NoticeType;
  title: string; // 例如「二创完成」「原文提取完成」
  desc: string; // 关联内容标题
  actor?: string; // 操作人（谁完成的）
  taskId?: string;
  platform?: Platform;
  time: string; // ISO
  read: boolean;
}

const KEY = 'app_notifications_v1';
const MAX = 200;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function read(): AppNotification[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AppNotification[];
  } catch {
    return [];
  }
}
function write(list: AppNotification[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore quota */
  }
  emit();
}

/** 订阅通知变化（组件 mount 时调用，返回取消订阅函数） */
export function subscribeNotifications(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getNotifications(): AppNotification[] {
  return read();
}

export function unreadCount(): number {
  return read().filter((n) => !n.read).length;
}

export function addNotification(
  n: Omit<AppNotification, 'id' | 'time' | 'read'> & { read?: boolean }
): AppNotification {
  const item: AppNotification = {
    id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    time: new Date().toISOString(),
    read: false,
    ...n,
  };
  const list = read();
  list.unshift(item);
  write(list);
  return item;
}

/** 把某条通知标记为已读（点击进入对应任务时调用） */
export function markRead(id: string) {
  const list = read();
  const t = list.find((n) => n.id === id);
  if (!t || t.read) return;
  t.read = true;
  write(list);
}

export function markAllRead() {
  const list = read();
  let changed = false;
  list.forEach((n) => {
    if (!n.read) {
      n.read = true;
      changed = true;
    }
  });
  if (changed) write(list);
}

export function clearNotifications() {
  write([]);
}
