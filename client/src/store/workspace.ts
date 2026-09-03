import { create } from './context';
import { getActiveStaff, getMember } from '../utils/memberStore';
import type { Level } from '../utils/memberStore';

// 职级：专员 → 经理 → 总监（原 admin/operator/intern 已废弃）
export type StaffRole = Level;

export interface Staff {
  id: string;
  name: string;
  level: StaffRole;
  avatar?: string;   // base64 自定义头像（128px 压缩）
  phone?: string;    // 手机号
  wechat?: string;   // 微信号
  bio?: string;      // 个人签名
}

export interface OperationLog {
  id: string;
  staffId: string;
  staffName: string;
  module: string;
  action: string;
  detail: string;
  time: string;
}

interface WorkspaceState {
  currentStaff: Staff;
  staffList: Staff[];
  updateTime: string;
  logs: OperationLog[];
}

function getTimeStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 当前身份持久化（含自定义头像/联系方式）
const STAFF_KEY = 'workspace_current_staff_v1';
const DEFAULT_STAFF: Staff = { id: 's1', name: '待创建', level: 'staff' };
function loadStaff(): Staff {
  try {
    const raw = localStorage.getItem(STAFF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id && parsed.name) {
        // 兼容旧数据：v2 之前存的是 role（admin/operator/intern），这里补成 level
        if (!parsed.level) {
          const m = getMember(parsed.name);
          parsed.level = m?.level || (parsed.role === 'admin' ? 'director' : 'staff');
        }
        return parsed as Staff;
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_STAFF;
}
export function persistStaff(s: Staff) {
  try { localStorage.setItem(STAFF_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// 员工主数据统一到 memberStore（注册/审批/授权都在那儿）。
// 这里只取「在职」成员，未审批、已驳回、已停用的人不会出现在身份切换里。
const { Provider, useStore, useStoreUpdate } = create<WorkspaceState>({
  currentStaff: loadStaff(),
  staffList: getActiveStaff(),
  updateTime: getTimeStr(),
  logs: [],
});

export const WorkspaceProvider = Provider;
export const useWorkspace = useStore;
export const useWorkspaceUpdate = useStoreUpdate;
