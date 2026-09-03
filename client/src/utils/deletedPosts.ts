import type { Platform } from '../types';

const STORAGE_PREFIX = 'deleted_posts_v1';
const key = (platform: Platform) => `${STORAGE_PREFIX}_${platform}`;

function readIds(platform: Platform): Set<string> {
  try {
    const raw = localStorage.getItem(key(platform));
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {
    /* ignore */
  }
  return new Set();
}

function writeIds(platform: Platform, ids: Set<string>): void {
  try {
    localStorage.setItem(key(platform), JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore */
  }
}

export function getDeletedPostIds(platform: Platform): Set<string> {
  return readIds(platform);
}

export function deleteOnePost(platform: Platform, postId: string): Set<string> {
  const ids = readIds(platform);
  ids.add(postId);
  writeIds(platform, ids);
  return ids;
}

export function deleteManyPosts(platform: Platform, postIds: string[]): Set<string> {
  const ids = readIds(platform);
  for (const id of postIds) ids.add(id);
  writeIds(platform, ids);
  return ids;
}

export function restoreAllDeletedPosts(platform: Platform): Set<string> {
  writeIds(platform, new Set());
  return new Set();
}