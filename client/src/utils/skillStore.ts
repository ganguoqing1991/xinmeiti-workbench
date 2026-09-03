// Skill 存储抽象层：本地 localStorage（默认）↔ 云端 D1（配置后启用）
// 通过 .env 的 VITE_SKILL_API_BASE 切换，未配置则完全走本地，不破坏现有行为。
//
// 本地数据源已统一到 skillHub：二创工坊的提示词技能与 Skill 中心的技能共用同一份台账，
// 在 Skill 中心里改名字/内容/启停，二创工坊这边立刻同步，反之亦然。
// 云端链路保持不变（配置了 VITE_SKILL_API_BASE 才启用）。
import type { Platform } from '../types';
import type { ReprocessSkill } from './llmConfig';
import { getPromptSkills, addPromptSkill, updateEntry, removeEntry } from './skillHub';

const API_BASE = ((import.meta as any).env?.VITE_SKILL_API_BASE as string | undefined)?.trim() || '';
export const SKILL_CLOUD_ENABLED = !!API_BASE;

const USER_ID_KEY = 'wb_user_id';
const ADMIN_KEY_KEY = 'wb_skill_admin_key';

export function getUserId(): string {
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;
  const id =
    (globalThis as any).crypto?.randomUUID?.() ||
    'u-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem(USER_ID_KEY, id);
  return id;
}

export function getAdminKey(): string {
  return localStorage.getItem(ADMIN_KEY_KEY) || '';
}
export function setAdminKey(k: string) {
  if (k) localStorage.setItem(ADMIN_KEY_KEY, k);
  else localStorage.removeItem(ADMIN_KEY_KEY);
}

interface RemoteSkill {
  id: string;
  scope?: 'shared' | 'personal';
  owner?: string | null;
  platform: string;
  label: string;
  prompt: string;
  enabled: number | boolean;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
}

function norm(r: RemoteSkill): ReprocessSkill {
  return {
    id: r.id,
    label: r.label,
    prompt: r.prompt,
    enabled: !!r.enabled,
    createdAt: r.created_at || r.createdAt || new Date().toISOString(),
    scope: r.scope,
  };
}

async function api<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': getUserId(),
  };
  const admin = getAdminKey();
  if (admin) headers['x-admin-key'] = admin;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function loadSkills(platform: Platform): Promise<ReprocessSkill[]> {
  if (!SKILL_CLOUD_ENABLED) return getPromptSkills(platform);
  try {
    const data = await api<RemoteSkill[]>(`/api/skills?platform=${encodeURIComponent(platform)}`);
    return (data || []).map(norm);
  } catch {
    // 云端失败降级到本地，避免界面空白
    return getPromptSkills(platform);
  }
}

export async function addSkill(
  platform: Platform,
  skill: { label: string; prompt: string },
  scope: 'shared' | 'personal' = 'personal'
): Promise<ReprocessSkill> {
  if (!SKILL_CLOUD_ENABLED) {
    const e = addPromptSkill(platform, skill.label, skill.prompt);
    return { id: e.id, label: e.name, prompt: e.content, enabled: e.enabled, createdAt: e.createdAt };
  }
  const data = await api<RemoteSkill>('/api/skills', {
    method: 'POST',
    body: JSON.stringify({ ...skill, platform, scope }),
  });
  return norm(data);
}

export async function updateSkill(
  platform: Platform,
  id: string,
  patch: Partial<ReprocessSkill>
): Promise<void> {
  if (!SKILL_CLOUD_ENABLED) {
    // label → name，prompt → content（同步更新简介）
    const p: any = {};
    if (patch.label !== undefined) p.name = patch.label;
    if (patch.prompt !== undefined) {
      p.content = patch.prompt;
      p.desc = String(patch.prompt).slice(0, 80).replace(/\s+/g, ' ');
    }
    if (patch.enabled !== undefined) p.enabled = patch.enabled;
    return updateEntry(id, p);
  }
  await api(`/api/skills/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export async function removeSkill(platform: Platform, id: string): Promise<void> {
  if (!SKILL_CLOUD_ENABLED) return removeEntry(id);
  await api(`/api/skills/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// 把当前浏览器里的本地 Skill 一键迁移到云端（自选目标库）
export async function migrateLocalSkills(
  platform: Platform,
  targetScope: 'shared' | 'personal'
): Promise<number> {
  const local = getPromptSkills(platform).filter((s) => !s.id.startsWith('skill-default-'));
  const data = await api<{ imported: number }>('/api/migrate', {
    method: 'POST',
    body: JSON.stringify({ platform, scope: targetScope, items: local.map((s) => ({ label: s.label, prompt: s.prompt })) }),
  });
  return data.imported || 0;
}
