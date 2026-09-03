// 账号密码登录：密码加盐哈希存储、会话管理、退出登录
//
// 存储说明（部署前必须知道）：
//   密码哈希与会话都存在 localStorage，校验发生在浏览器端。
//   这意味着「防误操作 / 防同一个人乱点」够用，但**防不住懂技术的人直接改本地存储**。
//   真要部署到公网给多人用，必须把校验搬到服务端（见文件末尾说明）。

const K = {
  cred: 'auth_credentials_v1',
  session: 'auth_session_v1',
  migrated: 'auth_migrated_v1',
};

const enc = new TextEncoder();

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function write(key: string, val: any) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error('[authStore] 写入失败', key, e);
  }
}

/** 生成随机盐 */
function randomSalt(): string {
  const arr = new Uint8Array(16);
  (globalThis.crypto || (globalThis as any).msCrypto)?.getRandomValues?.(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 加盐哈希。优先用 WebCrypto 的 SHA-256；
 * 非安全上下文（http 且非 localhost）下 crypto.subtle 不可用，退回简单哈希并记录警告——
 * 这种情况下部署到公网是不安全的，页面会提示。
 */
export async function hashPassword(pw: string, salt: string): Promise<string> {
  const data = enc.encode(`${salt}:${pw}`);
  const subtle = globalThis.crypto?.subtle;
  if (subtle?.digest) {
    try {
      return toHex(await subtle.digest('SHA-256', data));
    } catch {
      /* 落到兜底 */
    }
  }
  // 兜底：非加密强度，仅用于本地环境能跑通
  let h1 = 0x811c9dc5;
  for (const b of data) {
    h1 ^= b;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return `weak-${h1.toString(16)}`;
}

/** 当前环境是否支持强哈希（决定是否提示部署风险） */
export function isSecureHashAvailable(): boolean {
  return !!(globalThis.crypto?.subtle?.digest);
}

export interface CredRecord {
  salt: string;
  hash: string;
  updatedAt: string;
}

export function getCredentials(): Record<string, CredRecord> {
  return read<Record<string, CredRecord>>(K.cred, {});
}

export function hasPassword(name: string): boolean {
  return !!getCredentials()[name]?.hash;
}

/** 设置 / 重置密码 */
export async function setPassword(name: string, pw: string): Promise<void> {
  const salt = randomSalt();
  const hash = await hashPassword(pw, salt);
  write(K.cred, { ...getCredentials(), [name]: { salt, hash, updatedAt: new Date().toISOString() } });
}

export async function verifyPassword(name: string, pw: string): Promise<boolean> {
  const rec = getCredentials()[name];
  if (!rec?.hash) return false;
  const hash = await hashPassword(pw, rec.salt);
  return hash === rec.hash;
}

export function removeCredentials(name: string) {
  const all = { ...getCredentials() };
  delete all[name];
  write(K.cred, all);
}

// ===== 会话 =====
export interface Session {
  name: string;
  loginAt: string;
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(K.session);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.name ? (s as Session) : null;
  } catch {
    return null;
  }
}

export async function login(name: string, pw: string): Promise<{ ok: boolean; reason?: string }> {
  if (!hasPassword(name)) return { ok: false, reason: '这个账号还没设置密码' };
  const ok = await verifyPassword(name, pw);
  if (!ok) return { ok: false, reason: '密码不对' };
  write(K.session, { name, loginAt: new Date().toISOString() } as Session);
  return { ok: true };
}

export function logout() {
  try {
    localStorage.removeItem(K.session);
  } catch {
    /* ignore */
  }
}

// ===== 迁移：启用密码体系时，允许为尚无密码的成员设置初始密码 =====
export function needsInitialSetup(): boolean {
  try {
    return !localStorage.getItem(K.migrated);
  } catch {
    return false;
  }
}
export function markSetupDone() {
  try {
    localStorage.setItem(K.migrated, '1');
  } catch {
    /* ignore */
  }
}

/*
 * 部署到服务器时的改造要点（留给后端）：
 *   1. 把 K.cred 的哈希存到服务端数据库，校验接口只接收「账号 + 密码」，返回签名 token；
 *   2. 会话改为 httpOnly Cookie，避免 XSS 直接读走；
 *   3. 所有业务数据（社群/任务/技能/成员）同样搬到服务端 API，
 *      否则每个人打开浏览器看到的都是自己那份 localStorage，团队数据无法共享；
 *   4. 密码传输必须走 HTTPS。
 */
