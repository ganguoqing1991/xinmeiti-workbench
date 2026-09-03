// 二创加工 · 生成结果留存库
//
// 目标（用户明确要求）：
//   二创之后，不管是「二创改写」还是「内容分析」的结果，都要保留，不能直接删除，方便随时调取。
//
// 设计要点：
//   1. 引擎每次生成成功 → 自动归档一条（engine 来源），无论用户当时在不在二创页；
//   2. 删除任务 / 清空队列 → 先把任务上已有的 result 抢救归档（delete 来源），再从队列移除；
//      归档 id 由 taskId + mode + resultAt 决定，因此重复归档不会写入第二条；
//   3. 留存上限默认 200 条，写满后淘汰最旧的；
//   4. 写入遇到 localStorage 配额溢出 → 自动丢弃最旧的一半后重试，保证新结果一定留得下。

export interface GenerationHistory {
  id: string;
  taskId: string;
  taskTitle: string;
  skillId: string;
  skillLabel: string;
  result: string;
  platform: string;
  createdAt: string;
  // 区分二创改写 vs 内容分析
  mode?: 'recreate' | 'analyze';
  // 上下文信息，便于回查时确认来源
  accountName?: string;
  coverUrl?: string;
  actor?: string;
  // engine = 生成完成时自动归档；delete = 删除任务时抢救归档；manual = 手动保存
  source?: 'engine' | 'delete' | 'manual';
}

const STORAGE_KEY_HISTORY = 'reprocess_history_v1';
const MAX_KEEP = 200;

export function getHistory(): GenerationHistory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// 写入并对抗配额溢出：失败就丢掉最旧的一半再试，直到能写进去
function saveHistory(list: GenerationHistory[]) {
  let next = list.slice(0, MAX_KEEP);
  for (let guard = 0; guard < 6; guard++) {
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(next));
      return;
    } catch (e) {
      if (next.length <= 1) {
        console.error('生成历史写入失败（配额不足）', e);
        return;
      }
      // 淘汰最旧的一半，优先保住新结果
      next = next.slice(0, Math.floor(next.length / 2));
    }
  }
}

/**
 * 写入一条生成结果。id 相同视为同一条，不会重复累积。
 * @returns true = 新增了一条；false = 已存在，未重复写入
 */
export function addHistory(item: GenerationHistory): boolean {
  const list = getHistory();
  if (list.some((h) => h.id === item.id)) return false;
  list.unshift(item);
  saveHistory(list);
  return true;
}

// 归档一条生成结果（幂等）。返回 true 表示这次真的新增了记录。
export function archiveGeneration(input: {
  taskId: string;
  taskTitle: string;
  result: string;
  platform: string;
  mode?: 'recreate' | 'analyze';
  skillId?: string;
  skillLabel?: string;
  accountName?: string;
  coverUrl?: string;
  actor?: string;
  resultAt?: string;
  source?: GenerationHistory['source'];
}): boolean {
  const result = (input.result || '').trim();
  if (!result) return false;

  const mode = input.mode || 'recreate';
  const createdAt = input.resultAt || new Date().toISOString();
  const skillId = input.skillId || '__default__';
  const skillLabel = input.skillLabel || (skillId === '__default__' ? '默认系统提示词' : '已删除的 Skill');

  return addHistory({
    // 幂等键：同一任务 + 同一模式 + 同一完成时刻 = 同一条
    id: `gen-${input.taskId}-${mode}-${createdAt}`,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    skillId,
    skillLabel,
    result,
    platform: input.platform,
    createdAt,
    mode,
    accountName: input.accountName,
    coverUrl: input.coverUrl,
    actor: input.actor,
    source: input.source || 'manual',
  });
}

// 把任务对象上已有的 result 抢救归档（删除 / 清空前调用）
export function archiveTaskResult(
  task: {
    id: string;
    title: string;
    result?: string;
    resultAt?: string;
    mode?: 'recreate' | 'analyze';
    skillId?: string;
    platform: string;
    accountName?: string;
    coverUrl?: string;
    actor?: string;
  },
  source: GenerationHistory['source'] = 'delete'
): boolean {
  if (!task.result || !task.result.trim()) return false;
  return archiveGeneration({
    taskId: task.id,
    taskTitle: task.title,
    result: task.result,
    platform: task.platform,
    mode: task.mode,
    skillId: task.skillId,
    accountName: task.accountName,
    coverUrl: task.coverUrl,
    actor: task.actor,
    resultAt: task.resultAt,
    source,
  });
}

// 批量抢救归档，返回实际新增的条数
export function archiveManyTaskResults(
  tasks: Array<Parameters<typeof archiveTaskResult>[0]>,
  source: GenerationHistory['source'] = 'delete'
): number {
  let n = 0;
  tasks.forEach((t) => {
    if (archiveTaskResult(t, source)) n++;
  });
  return n;
}

export function removeHistory(id: string) {
  const list = getHistory().filter((h) => h.id !== id);
  saveHistory(list);
}

export function clearHistory() {
  try {
    localStorage.setItem(STORAGE_KEY_HISTORY, '[]');
  } catch {
    /* ignore */
  }
}

export function getHistoryByTask(taskId: string): GenerationHistory[] {
  return getHistory().filter((h) => h.taskId === taskId);
}
