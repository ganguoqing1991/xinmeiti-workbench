// 账号管理：给每个平台账号指派负责人
// 权限：总监可指派全部账号；经理只能指派给本组（同岗位）成员；专员只读

import React, { useMemo, useState } from 'react';
import { AtSign, Search, Users, UserCheck, Filter, Info } from 'lucide-react';
import GlassCard from '../../components/GlassCard';
import { useWorkspace } from '../../store/workspace';
import {
  getMembers, setOwner, removeOwner, ownerOf, canAssignAccount, LEVEL_META,
  type OwnerScope,
} from '../../utils/memberStore';
import { listAssignable, positionLabel } from '../../utils/growthStore';
import { getSyncedAccounts } from '../../utils/syncedPool';
import { getSessions } from '../../utils/liveStore';
import { formatNumber } from '../../utils/format';

type Toast = { type: 'success' | 'error'; msg: string } | null;

const SCOPES: { key: OwnerScope; label: string }[] = [
  { key: 'xiaohongshu', label: '小红书' },
  { key: 'douyin', label: '抖音' },
  { key: 'live', label: '直播' },
];

const Accounts: React.FC = () => {
  const { currentStaff } = useWorkspace();
  const [scope, setScope] = useState<OwnerScope>('xiaohongshu');
  const [q, setQ] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState<Toast>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 2600);
  };

  const members = useMemo(() => getMembers(), [tick]);
  const active = members.filter((m) => m.status === 'active');

  // 可指派给的候选人：总监全部，经理只能本组
  const candidates = useMemo(
    () => active.filter((m) => canAssignAccount(currentStaff.name, m.name)),
    [active, currentStaff.name, tick]
  );
  const canEdit = candidates.length > 0;

  const rows = useMemo(() => {
    const list = listAssignable(scope).map((a) => {
      let extra = '';
      if (scope === 'live') {
        const ss = getSessions().filter((s) => s.account === a.name);
        extra = ss.length ? `${ss.length} 场 · 场观 ${formatNumber(ss.reduce((s, x) => s + (x.viewers || 0), 0))}` : '';
      } else {
        const acc = getSyncedAccounts(scope === 'douyin' ? 'douyin' : 'xiaohongshu').find((s) => s.account.name === a.name);
        if (acc) extra = `${formatNumber(acc.account.followers)} 粉丝 · ${acc.account.notes} 篇`;
      }
      return { ...a, extra };
    });
    const kw = q.trim().toLowerCase();
    return list.filter((a) => {
      if (onlyUnassigned && a.owner) return false;
      if (!kw) return true;
      return a.name.toLowerCase().includes(kw) || (a.owner || '').toLowerCase().includes(kw);
    });
  }, [scope, q, onlyUnassigned, tick]);

  const unassignedCount = listAssignable(scope).filter((a) => !a.owner).length;

  const assign = (accountName: string, who: string) => {
    if (who) {
      if (!canAssignAccount(currentStaff.name, who)) {
        showToast('error', '你没有权限把账号指派给这个人（经理只能指派给本组成员）');
        return;
      }
      setOwner(scope, accountName, who);
      showToast('success', `「${accountName}」负责人设为 ${who}`);
    } else {
      removeOwner(scope, accountName);
      showToast('success', `已取消「${accountName}」的负责人`);
    }
    setTick((v) => v + 1);
  };

  const bulkAssign = () => {
    if (!candidates.length) return;
    const who = window.prompt(`把当前筛选出的 ${rows.length} 个账号统一指派给谁？\n可选项：${candidates.map((c) => c.name).join('、')}`);
    if (!who) return;
    const target = candidates.find((c) => c.name === who.trim());
    if (!target) {
      showToast('error', '只能指派给你有权限管理的人');
      return;
    }
    rows.forEach((r) => setOwner(scope, r.name, target.name));
    setTick((v) => v + 1);
    showToast('success', `已把 ${rows.length} 个账号指派给 ${target.name}`);
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-20 right-6 z-50">
          <div className={`px-4 py-2.5 rounded-lg shadow-2xl text-sm border ${
            toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
            : 'bg-rose-500/20 text-rose-200 border-rose-500/30'
          }`}>{toast.msg}</div>
        </div>
      )}

      <div>
        <h2 className="text-white text-2xl font-bold flex items-center gap-2">
          <AtSign className="w-7 h-7 text-amber-400" /> 账号管理
        </h2>
        <p className="text-xs text-white/50 mt-1">
          给每个账号指定负责人 · 当前身份 {currentStaff.name}
          {canEdit ? ' · 可指派' : ' · 只读（需要总监或经理权限）'}
        </p>
      </div>

      <GlassCard hoverable={false}>
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
          <p className="text-xs text-white/70 leading-relaxed">
            抖音 / 小红书 / 直播的数据本身没有负责人字段，这里指派之后，对应专员在总览、成长小助手里才算得出自己的数。
            权限规则：<span className="text-purple-300">总监</span>可指派全部账号，
            <span className="text-cyan-300">经理</span>只能指派给本组（同岗位）成员，
            <span className="text-emerald-300">专员</span>只能查看。
          </p>
        </div>
      </GlassCard>

      {/* 筛选 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                scope === s.key ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white' : 'text-white/60 hover:text-white'
              }`}
            >{s.label}</button>
          ))}
        </div>
        <div className="flex-1 min-w-[180px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜账号名或负责人"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30"
          />
        </div>
        <button
          onClick={() => setOnlyUnassigned((v) => !v)}
          className={`h-9 px-3 rounded-lg text-xs border flex items-center gap-1.5 ${
            onlyUnassigned ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' : 'bg-white/5 border-white/10 text-white/50'
          }`}
        >
          <Filter className="w-3.5 h-3.5" /> 只看未指派（{unassignedCount}）
        </button>
        {canEdit && rows.length > 0 && (
          <button onClick={bulkAssign} className="h-9 px-3 rounded-lg text-xs bg-white/5 border border-white/10 text-white/60 hover:text-white flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5" /> 批量指派
          </button>
        )}
      </div>

      {/* 账号列表 */}
      <GlassCard hoverable={false}>
        {rows.length === 0 ? (
          <div className="py-14 text-center">
            <Users className="w-10 h-10 text-white/15 mx-auto mb-3" />
            <p className="text-sm text-white/40">
              {listAssignable(scope).length === 0
                ? '这个平台还没有账号，先去对应页面同步或导入'
                : '没有符合条件的账号'}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((a) => {
              const ownerMember = active.find((m) => m.name === a.owner);
              const editable = canEdit && (!a.owner || canAssignAccount(currentStaff.name, a.owner));
              return (
                <div key={a.name} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm truncate">{a.name}</p>
                    {a.extra && <p className="text-[10px] text-white/35 mt-0.5">{a.extra}</p>}
                  </div>
                  {a.owner ? (
                    <span className="flex items-center gap-1.5 text-[11px]">
                      <span className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-[9px] text-white shrink-0">
                        {a.owner.slice(0, 1)}
                      </span>
                      <span className="text-white/70">{a.owner}</span>
                      {ownerMember && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${LEVEL_META[ownerMember.level].cls}`}>
                          {LEVEL_META[ownerMember.level].label}
                        </span>
                      )}
                      {ownerMember && <span className="text-[10px] text-white/30">{positionLabel(ownerMember.position)}</span>}
                    </span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">未指派</span>
                  )}
                  {editable ? (
                    <select
                      value={a.owner}
                      onChange={(e) => assign(a.name, e.target.value)}
                      className="h-8 px-2 rounded-lg bg-white/5 border border-white/10 text-[11px] text-white max-w-[160px]"
                    >
                      <option value="">— 取消指派 —</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}（{LEVEL_META[c.level].label}·{positionLabel(c.position)}）
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[10px] text-white/25">只读</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
};

export default Accounts;
