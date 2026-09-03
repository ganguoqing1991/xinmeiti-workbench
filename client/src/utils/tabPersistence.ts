// 平台 Tab 持久化：刷新页面后能记住当前所在 Tab
// 解决「刷新抖音页面弹回到对标监控」的复发问题

const PREFIX = 'wb_active_tab_v1_';

export function getActiveTab<T extends string>(platform: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + platform);
    if (raw) return raw as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function setActiveTabPersistent(platform: string, tab: string): void {
  try {
    localStorage.setItem(PREFIX + platform, tab);
  } catch {
    /* ignore */
  }
}

export function clearActiveTab(platform: string): void {
  try {
    localStorage.removeItem(PREFIX + platform);
  } catch {
    /* ignore */
  }
}
