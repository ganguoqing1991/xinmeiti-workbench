// 登录门控：账号 + 密码登录，审批通过才能进入
//
// 三重兜底：
//   ① 名册为空时引导创建第一个总监（否则没人能审批，系统直接死锁）
//   ② 停用/删除最后一名总监会被拒绝（memberStore.guardLastDirector）
//   ③ 页面常驻「进不去怎么办」，说明找回路径
//
// 部署提醒：密码校验在浏览器端完成，防误操作够用，防不住改本地存储。
// 上公网多人用必须把校验搬到服务端（见 utils/authStore.ts 末尾说明）。

import React, { useEffect, useState } from 'react';
import {
  ShieldCheck, UserPlus, Clock, XCircle, ChevronDown, ChevronUp, Sparkles, Lock, LogOut, Eye, EyeOff, AlertTriangle,
  KeyRound,
} from 'lucide-react';
import { useWorkspace, persistStaff } from '../store/workspace';
import {
  getMembers, applyMember, approveMember, getMember, getActiveMembers, STATUS_META, LEVEL_META,
  ALL_MODULE_KEYS, type Member,
} from '../utils/memberStore';
import { POSITIONS, positionLabel, type Position } from '../utils/growthStore';
import {
  getSession, login as doLogin, logout as doLogout, setPassword, hasPassword,
  needsInitialSetup, markSetupDone, isSecureHashAvailable,
} from '../utils/authStore';
import GlassCard from './GlassCard';
import Modal from './Modal';

type Toast = { type: 'ok' | 'err'; msg: string } | null;

const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentStaff } = useWorkspace();
  const [tick, setTick] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  // 登录页补设密码入口的展开状态
  const [setupOpen, setSetupOpen] = useState(false);

  const [loginForm, setLoginForm] = useState({ name: '', password: '' });
  const [setupForm, setSetupForm] = useState({ name: '', password: '', confirm: '' });
  const [createForm, setCreateForm] = useState({ name: '', position: 'admin' as Position, password: '', confirm: '' });
  const [applyForm, setApplyForm] = useState({ name: '', phone: '', wechat: '', position: 'private' as Position, note: '' });

  const members = getMembers();
  const activeMembers = getActiveMembers();

  useEffect(() => {
    // 默认把账号预填成当前身份，少打一次字
    if (!loginForm.name && currentStaff.name) setLoginForm((f) => ({ ...f, name: currentStaff.name }));
  }, [currentStaff.name]);

  const flash = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 3000);
  };

  // ---- 已登录校验：会话存在 + 该成员仍在职 ----
  const session = getSession();
  const sessionMember = session ? getMember(session.name) : null;
  if (sessionMember && sessionMember.status === 'active') {
    // 会话与 workspace 的当前身份不同步时补一次（首次登录、换人登录后）
    if (currentStaff.name !== sessionMember.name) {
      persistStaff({ id: sessionMember.id, name: sessionMember.name, level: sessionMember.level });
    }
    return <>{children}</>;
  }

  // 没有有效会话 → 清掉残留，回到登录页
  if (session) doLogout();

  const enterAs = (m: Member) => {
    persistStaff({ id: m.id, name: m.name, level: m.level });
    window.location.reload();
  };

  const submitLogin = async () => {
    if (!loginForm.name) return flash('err', '请选择或填写账号');
    if (!loginForm.password) return flash('err', '请输入密码');
    setBusy(true);
    const r = await doLogin(loginForm.name, loginForm.password);
    setBusy(false);
    if (!r.ok) {
      flash('err', r.reason || '登录失败');
      return;
    }
    enterAs(getMember(loginForm.name)!);
  };

  const submitCreate = async () => {
    if (!createForm.name.trim()) return flash('err', '请填写姓名');
    if (createForm.password.length < 6) return flash('err', '密码至少 6 位');
    if (createForm.password !== createForm.confirm) return flash('err', '两次输入的密码不一致');
    setBusy(true);
    const m = applyMember({ name: createForm.name, position: createForm.position, applyNote: '系统初始化' });
    approveMember(m.id, { level: 'director', position: createForm.position, modules: [...ALL_MODULE_KEYS], skillIds: [] }, '系统初始化');
    await setPassword(m.name, createForm.password);
    markSetupDone();
    const r = await doLogin(m.name, createForm.password);
    setBusy(false);
    if (r.ok) enterAs(m);
  };

  /**
   * 只给成员设初始密码，不登录。
   * 用于登录页补设：总监审批了新人但没设密码时，不必回到员工管理页面。
   */
  const submitSetupOnly = async () => {
    const m = members.find((x) => x.name === setupForm.name);
    if (!m) return flash('err', '请选择账号');
    if (setupForm.password.length < 6) return flash('err', '密码至少 6 位');
    if (setupForm.password !== setupForm.confirm) return flash('err', '两次输入的密码不一致');
    setBusy(true);
    await setPassword(m.name, setupForm.password);
    setBusy(false);
    setSetupForm({ name: '', password: '', confirm: '' });
    setTick((v) => v + 1);
    flash('ok', `已为「${m.name}」设置密码，让他用新密码登录`);
  };

  const submitSetup = async () => {
    const m = members.find((x) => x.name === setupForm.name);
    if (!m) return flash('err', '请选择账号');
    if (setupForm.password.length < 6) return flash('err', '密码至少 6 位');
    if (setupForm.password !== setupForm.confirm) return flash('err', '两次输入的密码不一致');
    setBusy(true);
    await setPassword(m.name, setupForm.password);
    // 还有别的在职成员没密码就继续设置，否则结束初始化
    const rest = getActiveMembers().filter((x) => !hasPassword(x.name));
    markSetupDone();
    const r = await doLogin(m.name, setupForm.password);
    setBusy(false);
    if (r.ok) enterAs(m);
    else {
      setSetupForm((f) => ({ ...f, password: '', confirm: '' }));
      setTick((v) => v + 1);
      flash('ok', rest.length ? `已设置，还剩 ${rest.length} 人待设置` : '密码已设置，可以登录了');
    }
  };

  const submitApply = () => {
    if (!applyForm.name.trim()) return flash('err', '请填写姓名');
    if (members.some((m) => m.name === applyForm.name.trim() && m.status !== 'rejected')) {
      return flash('err', '已有同名成员在册或待审批');
    }
    applyMember({
      name: applyForm.name, phone: applyForm.phone, wechat: applyForm.wechat,
      position: applyForm.position, applyNote: applyForm.note,
    });
    setApplyOpen(false);
    setApplyForm({ name: '', phone: '', wechat: '', position: 'private', note: '' });
    setTick((v) => v + 1);
    flash('ok', '申请已提交，需要总监审批通过后才能登录');
  };

  const noPwMembers = activeMembers.filter((m) => !hasPassword(m.name));
  const needSetup = needsInitialSetup() && noPwMembers.length > 0;

  const shell = (inner: React.ReactNode) => (
    <div className="min-h-screen w-full flex items-center justify-center p-6" style={{ background: 'linear-gradient(135deg, hsl(230,40%,8%) 0%, hsl(240,35%,12%) 100%)' }}>
      {toast && (
        <div
          className="fixed top-6 right-6 z-50 px-4 py-2.5 rounded-lg text-sm border shadow-2xl"
          style={{
            background: toast.type === 'ok' ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)',
            borderColor: toast.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)',
            color: toast.type === 'ok' ? '#A7F3D0' : '#FECDD3',
          }}
        >{toast.msg}</div>
      )}
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-white text-xl font-bold">新媒体工作台</h1>
          <p className="text-xs text-white/45 mt-1">账号密码登录 · 注册申请需总监审批</p>
        </div>
        {inner}
        {/* 兜底说明 */}
        <GlassCard hoverable={false}>
          <button onClick={() => setHelpOpen((v) => !v)} className="w-full flex items-center gap-2 text-xs text-white/45 hover:text-white/70">
            <ShieldCheck className="w-3.5 h-3.5" /> 进不去怎么办
            {helpOpen ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
          </button>
          {helpOpen && (
            <div className="mt-3 space-y-2 text-[11px] text-white/50 leading-relaxed border-t border-white/5 pt-3">
              <p>1. 忘记密码：让总监用他自己的账号登录，到「员工管理 → 团队总览」点成员卡片上的「重置密码」。<b className="text-white/70">系统已内置保护：最后一名在职总监不能被停用或删除</b>，所以总监账号一定还在。</p>
              <p>2. 账号数据存在浏览器本地（localStorage），不是云端账号，换浏览器等于换一套账号。</p>
              <p>3. 如果以上都不可行，请联系对接工程师协助从 WorkBuddy 资料库重新部署或通过系统管理员恢复。</p>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );

  // ---------- 场景一：名册为空 → 创建第一个总监 ----------
  if (members.length === 0) {
    return shell(
      <GlassCard hoverable={false}>
        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center mx-auto mb-3">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <p className="text-white text-sm font-medium">初始化工作台</p>
          <p className="text-xs text-white/45 mt-1">名册里还没有人，先创建第一个账号（自动成为总监）</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1">姓名</label>
            <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="例：张三" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">岗位</label>
            <select value={createForm.position} onChange={(e) => setCreateForm({ ...createForm, position: e.target.value as Position })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
              {POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 block mb-1">登录密码</label>
              <input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} placeholder="至少 6 位" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">确认密码</label>
              <input type="password" value={createForm.confirm} onChange={(e) => setCreateForm({ ...createForm, confirm: e.target.value })} placeholder="再输一次" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
            </div>
          </div>
          <button onClick={submitCreate} disabled={busy} className="w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium disabled:opacity-50">
            {busy ? '创建中...' : '创建并进入'}
          </button>
        </div>
      </GlassCard>
    );
  }

  // ---------- 场景二：启用密码体系，为在职成员设置初始密码 ----------
  if (needSetup) {
    return shell(
      <>
        <GlassCard hoverable={false}>
          <div className="flex items-start gap-2.5 mb-4">
            <Lock className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
            <p className="text-xs text-white/70 leading-relaxed">
              系统已启用密码登录。还有 <b className="text-white">{noPwMembers.length}</b> 位在职成员没设密码，逐个设置后即可登录。
            </p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-white/50 block mb-1">选择账号</label>
              <select value={setupForm.name} onChange={(e) => setSetupForm({ ...setupForm, name: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                <option value="">— 请选择 —</option>
                {noPwMembers.map((m) => (
                  <option key={m.id} value={m.name}>{m.name}（{LEVEL_META[m.level].label}·{positionLabel(m.position)}）</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/50 block mb-1">设置密码</label>
                <input type="password" value={setupForm.password} onChange={(e) => setSetupForm({ ...setupForm, password: e.target.value })} placeholder="至少 6 位" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">确认密码</label>
                <input type="password" value={setupForm.confirm} onChange={(e) => setSetupForm({ ...setupForm, confirm: e.target.value })} placeholder="再输一次" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
              </div>
            </div>
            <button onClick={submitSetup} disabled={busy} className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium disabled:opacity-50">
              {busy ? '设置中...' : '设置并登录'}
            </button>
          </div>
        </GlassCard>
        {!isSecureHashAvailable() && (
          <GlassCard hoverable={false}>
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                当前环境不支持安全哈希（通常是用了 http 而非 https）。密码仍能登录，但保护强度下降。
                <b>部署到公网时务必走 HTTPS</b>。
              </p>
            </div>
          </GlassCard>
        )}
      </>
    );
  }

  // ---------- 场景三：登录 ----------
  return shell(
    <>
      <GlassCard hoverable={false}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1">账号</label>
            {activeMembers.length > 0 ? (
              <select
                value={loginForm.name}
                onChange={(e) => setLoginForm({ ...loginForm, name: e.target.value })}
                className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
              >
                <option value="">— 选择账号 —</option>
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}（{LEVEL_META[m.level].label}·{positionLabel(m.position)}）{hasPassword(m.name) ? '' : ' · 未设密码'}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={loginForm.name}
                onChange={(e) => setLoginForm({ ...loginForm, name: e.target.value })}
                placeholder="暂无在职成员，先提交注册申请"
                className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
              />
            )}
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">密码</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && submitLogin()}
                placeholder="输入密码"
                className="w-full h-10 pl-3 pr-10 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
              />
              <button onClick={() => setShowPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button onClick={submitLogin} disabled={busy} className="w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
            <LogOut className="w-4 h-4 rotate-180" /> {busy ? '登录中...' : '登录'}
          </button>
        </div>
      </GlassCard>

      <GlassCard hoverable={false}>
        <button onClick={() => setApplyOpen(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:text-white">
          <UserPlus className="w-4 h-4" /> 提交注册申请
        </button>
        <p className="text-[10px] text-white/30 mt-2 text-center">新成员提交后进入待审批，总监通过并授权后即可登录</p>
      </GlassCard>

      {/* 有在职成员没密码时，提供补设入口（不必回员工管理页） */}
      {noPwMembers.length > 0 && (
        <GlassCard hoverable={false}>
          <button
            onClick={() => setSetupOpen((v) => !v)}
            className="w-full flex items-center gap-2 text-left"
          >
            <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs text-white/70 flex-1">
              还有 <b className="text-white">{noPwMembers.length}</b> 位在职成员没设密码，无法登录
            </span>
            {setupOpen ? <ChevronUp className="w-4 h-4 text-white/40 shrink-0" /> : <ChevronDown className="w-4 h-4 text-white/40 shrink-0" />}
          </button>
          {setupOpen && (
            <div className="mt-3 pt-3 border-t border-white/5 space-y-3">
              <p className="text-[10px] text-white/40">总监审批新人后若没设密码，可在这里补设。设置后对方即可用该密码登录。</p>
              <div>
                <label className="text-xs text-white/50 block mb-1">选择账号</label>
                <select value={setupForm.name} onChange={(e) => setSetupForm({ ...setupForm, name: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                  <option value="">— 请选择 —</option>
                  {noPwMembers.map((m) => (
                    <option key={m.id} value={m.name}>{m.name}（{LEVEL_META[m.level].label}·{positionLabel(m.position)}）</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/50 block mb-1">设置密码</label>
                  <input type="password" value={setupForm.password} onChange={(e) => setSetupForm({ ...setupForm, password: e.target.value })} placeholder="至少 6 位" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">确认密码</label>
                  <input type="password" value={setupForm.confirm} onChange={(e) => setSetupForm({ ...setupForm, confirm: e.target.value })} placeholder="再输一次" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
                </div>
              </div>
              <button onClick={submitSetupOnly} disabled={busy} className="w-full py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium disabled:opacity-50">
                {busy ? '设置中...' : '设置密码（不登录）'}
              </button>
            </div>
          )}
        </GlassCard>
      )}

      {/* 申请状态提示（按当前填写的账号显示） */}
      {(() => {
        const m = members.find((x) => x.name === loginForm.name);
        if (!m || m.status === 'active') return null;
        return (
          <GlassCard hoverable={false}>
            <div className="flex items-start gap-3">
              {m.status === 'pending' ? <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className="text-white text-sm font-medium">
                  {m.name} · {STATUS_META[m.status].label}
                </p>
                <p className="text-xs text-white/50 mt-1 leading-relaxed">
                  {m.status === 'pending' && '申请已提交，等总监在「员工管理 → 注册审批」里通过并为你开通权限。'}
                  {m.status === 'rejected' && `申请被驳回${m.rejectReason ? `：${m.rejectReason}` : ''}。可让总监恢复待审后重新审批。`}
                  {m.status === 'disabled' && '账号已被停用，需要总监重新启用。'}
                </p>
              </div>
            </div>
          </GlassCard>
        );
      })()}

      {/* 注册申请弹窗 */}
      <Modal open={applyOpen} onClose={() => setApplyOpen(false)} title="注册申请" maxWidth="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1">姓名</label>
            <input value={applyForm.name} onChange={(e) => setApplyForm({ ...applyForm, name: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 block mb-1">手机号（可选）</label>
              <input value={applyForm.phone} onChange={(e) => setApplyForm({ ...applyForm, phone: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">微信号（可选）</label>
              <input value={applyForm.wechat} onChange={(e) => setApplyForm({ ...applyForm, wechat: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
            </div>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">申请岗位</label>
            <select value={applyForm.position} onChange={(e) => setApplyForm({ ...applyForm, position: e.target.value as Position })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
              {POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">申请说明</label>
            <textarea value={applyForm.note} onChange={(e) => setApplyForm({ ...applyForm, note: e.target.value })} rows={3} placeholder="例：负责六年级家长群，需要社群数据与活动管理权限" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setApplyOpen(false)} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
            <button onClick={submitApply} className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium">提交申请</button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default AuthGate;
