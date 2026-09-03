// 今日待办数据层
// 1) 团队待办：管理员 / 经理（level=manager|director）撰写后「下放」给具体成员，成员只看得到指派给自己的
// 2) 个人板块：内容不落库，直接由本人最近一期「周度复盘报告」的 actions（下周要做）/ risks（注意事项）罗列
//    只单独持久化「勾选完成」状态，key 里带 reportId，换一份新周报后自动重置
// 存储范式与 growthStore / communityStore 一致：localStorage + 容错读写

import { getReports } from './growthStore';
import { parseReport } from './reportParse';

const K = {
  team: 'dashboard_team_todos_v1',
  personalDone: 'dashboard_personal_done_v1',
};

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
    console.error('[todoStore] 写入失败', key, e);
  }
}
const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ===== 团队待办 =====
export type TodoPriority = 'high' | 'mid' | 'low';

export interface TeamTodo {
  id: string;
  text: string;
  assignee: string;    // 被下放的成员姓名
  priority: TodoPriority;
  done: boolean;
  author: string;      // 撰写（下放）人
  createdAt: string;
}

export function getTeamTodos(): TeamTodo[] {
  return read<TeamTodo[]>(K.team, []);
}

export function addTeamTodo(input: {
  text: string;
  assignee: string;
  priority?: TodoPriority;
  author: string;
}): TeamTodo {
  const item: TeamTodo = {
    id: uid('tt'),
    text: input.text.trim(),
    assignee: input.assignee,
    priority: input.priority || 'mid',
    done: false,
    author: input.author,
    createdAt: new Date().toISOString(),
  };
  write(K.team, [item, ...getTeamTodos()]);
  return item;
}

export function updateTeamTodo(id: string, patch: Partial<TeamTodo>) {
  write(K.team, getTeamTodos().map((t) => (t.id === id ? { ...t, ...patch } : t)));
}

export function removeTeamTodo(id: string) {
  write(K.team, getTeamTodos().filter((t) => t.id !== id));
}

// ===== 个人板块（数据来自周报）=====
export interface PersonalItem {
  key: string;                    // `${reportId}::action|risk::index`
  type: 'action' | 'risk';
  title: string;
  priority?: TodoPriority;
  expect?: string;
}
export interface PersonalBoard {
  reportId: string;
  periodKey: string;
  createdAt: string;
  actions: PersonalItem[];
  risks: PersonalItem[];
}

/** 取本人最近一期周度复盘报告，拆成「下周要做的事情」与「需要注意的」两组 */
export function getPersonalBoard(staffName: string): PersonalBoard | null {
  const list = getReports()
    .filter((r) => r.staffName === staffName && r.period === 'weekly')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const r = list[0];
  if (!r) return null;
  const data = parseReport(r.raw);
  if (!data) return null;

  const actions: PersonalItem[] = data.actions.map((a, i) => ({
    key: `${r.id}::action::${i}`,
    type: 'action',
    title: a.title,
    priority: a.priority,
    expect: a.expect,
  }));
  const risks: PersonalItem[] = data.risks.map((x, i) => ({
    key: `${r.id}::risk::${i}`,
    type: 'risk',
    title: x,
  }));
  if (!actions.length && !risks.length) return null;
  return { reportId: r.id, periodKey: r.periodKey, createdAt: r.createdAt, actions, risks };
}

// ===== 个人板块勾选态（按报告 id 隔离，换周报自动重置）=====
export function getPersonalDone(): Record<string, boolean> {
  return read<Record<string, boolean>>(K.personalDone, {});
}
export function setPersonalDone(key: string, done: boolean) {
  const map = getPersonalDone();
  if (done) map[key] = true;
  else delete map[key];
  write(K.personalDone, map);
}
