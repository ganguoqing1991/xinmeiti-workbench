import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Bell,
  ChevronDown,
  Clock,
  Wifi,
  Settings,
  User,
  X,
  Users,
  FileText,
  MessageSquare,
  Quote,
  Camera,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle,
  LogOut,
} from 'lucide-react';
import { useWorkspace, useWorkspaceUpdate, persistStaff, type Staff, type StaffRole } from '@client/src/store/workspace';
import { logout as doLogout } from '../utils/authStore';
import { getMember, applyOwnApi } from '../utils/memberStore';
import { xhsBenchmarkAccounts, xhsNotesPool, dyBenchmarkAccounts, dyVideosPool } from '@client/src/data/mock';
import Modal from './Modal';
import {
  getNotifications,
  subscribeNotifications,
  markAllRead,
  clearNotifications,
  type AppNotification,
  type NoticeType,
} from '../utils/notificationStore';
import { timeAgo } from '../utils/format';

interface SearchResult {
  category: '对标账号' | '笔记' | '视频' | '直播话术' | '金句' | '私域话术';
  label: string;
  sub: string;
  href: string;
}

// 通知类型 → 圆点颜色
const NOTICE_DOT: Record<NoticeType, string> = {
  extract: 'bg-emerald-400',
  recreate: 'bg-purple-400',
  analyze: 'bg-cyan-400',
  error: 'bg-rose-400',
  info: 'bg-blue-400',
};

const TopBar: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => {
  const { currentStaff, staffList, updateTime } = useWorkspace();
  const setWorkspace = useWorkspaceUpdate();
  const [showMenu, setShowMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  // 通知中心：接真实通知库（引擎在原文提取完成 / 二创完成 / 分析完成 / 失败时推送）
  const [notifs, setNotifs] = useState<AppNotification[]>(() => getNotifications());
  useEffect(() => {
    setNotifs(getNotifications());
    return subscribeNotifications(() => setNotifs(getNotifications()));
  }, []);
  const unreadCount = notifs.filter((n) => !n.read).length;
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  // 个人信息 / 账户设置 / 切换身份
  // apiTick：提交接口申请后强制刷新状态显示
  const [apiTick, setApiTick] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<Staff>(currentStaff);
  const [avatarErr, setAvatarErr] = useState('');
  const [settingsMsg, setSettingsMsg] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // 保存当前身份（store + localStorage）；改名时同步 staffList 并迁移历史数据里的旧名引用
  const saveStaff = (next: Staff) => {
    const oldName = currentStaff.name;
    const renamed = oldName.trim() !== next.name.trim();
    // 先持久化（确保刷新后仍是新值），再更新内存 store（欢迎语 / 顶栏即时跟随，不再整页刷新）
    persistStaff(next);
    setWorkspace((prev) => ({
      ...prev,
      currentStaff: next,
      // staffList 里当前用户项的名字/角色同步更新（切换身份弹窗、负责人下拉等实时生效）
      staffList: prev.staffList.map((s) => (s.id === next.id ? { ...s, name: next.name, level: next.level } : s)),
    }));
    // 改名迁移：任务负责人 / 群主 / 管理员 / 活动负责人里的旧名全部替换（依赖 currentStaff.name 的视图会实时重算）
    if (renamed) {
      import('../utils/communityStore')
        .then(({ renameStaffReferences }) => {
          const r = renameStaffReferences(oldName, next.name);
          console.info(`[改名迁移] 任务${r.tasks} 社群${r.groups} 活动${r.activities}`);
        })
        .catch((e) => console.warn('改名迁移失败（不影响本次改名保存）', e));
    }
  };

  // 头像上传：压缩到 128px JPEG base64；环境禁用 canvas 时退回原始 dataURL，保证上传尽可能可用
  const handleAvatarFile = (file: File) => {
    setAvatarErr('');
    if (!file.type.startsWith('image/')) {
      setAvatarErr('请选择图片文件（如当前环境不支持图片上传，直接填写姓名即可，姓名支持中英文与字母）');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setAvatarErr('图片读取失败：当前环境可能不支持图片上传，请直接填写姓名即可（姓名支持中英文与字母）');
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onerror = () => setAvatarErr('图片读取失败，请换一张');
      img.onload = () => {
        try {
          const size = 128;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no-canvas');
          // 居中裁剪正方形
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          const base64 = canvas.toDataURL('image/jpeg', 0.85);
          setProfileForm((prev) => ({ ...prev, avatar: base64 }));
        } catch {
          // 沙箱/限制环境禁用 canvas 读取时，直接用原始 dataURL，上传仍可用
          setProfileForm((prev) => ({ ...prev, avatar: dataUrl }));
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // 数据备份：导出全部业务 localStorage 为 JSON
  const handleExportBackup = () => {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) data[k] = localStorage.getItem(k) || '';
    }
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `新媒体工作台_数据备份_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSettingsMsg('✓ 备份已导出到下载目录');
  };

  // 导入恢复
  const handleImportBackup = async (file: File) => {
    try {
      const text = await file.text();
      const j = JSON.parse(text);
      const data = j?.data;
      if (!data || typeof data !== 'object') throw new Error('格式不正确');
      const count = Object.keys(data).length;
      if (!window.confirm(`将导入 ${count} 项数据并覆盖同名配置，确定继续？（建议先导出当前备份）`)) return;
      Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, String(v)));
      window.alert('✓ 导入完成，页面将刷新以加载数据');
      window.location.reload();
    } catch (e: any) {
      setSettingsMsg(`导入失败：${e?.message || '文件格式不正确'}`);
    }
  };

  // 清空全部数据
  const handleClearAll = () => {
    if (!window.confirm('⚠️ 将清空本工作台全部本地数据（直播/社群/任务/配置），且不可恢复！\n\n建议先导出备份。确定继续？')) return;
    if (!window.confirm('最后确认：真的要清空全部数据吗？')) return;
    localStorage.clear();
    window.location.reload();
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 构建全局搜索数据源
  const searchData: SearchResult[] = useMemo(() => {
    const items: SearchResult[] = [];
    xhsBenchmarkAccounts.forEach((a) =>
      items.push({ category: '对标账号', label: a.name, sub: `XHS · 粉丝 ${a.followers.toLocaleString()}`, href: '/xiaohongshu' })
    );
    dyBenchmarkAccounts.forEach((a) =>
      items.push({ category: '对标账号', label: a.name, sub: `抖音 · 粉丝 ${a.followers.toLocaleString()}`, href: '/douyin' })
    );
    xhsNotesPool.forEach((n) =>
      items.push({ category: '笔记', label: n.title, sub: `XHS · ${n.accountName}`, href: '/xiaohongshu' })
    );
    dyVideosPool.forEach((v) =>
      items.push({ category: '视频', label: v.title, sub: `抖音 · ${v.accountName}`, href: '/douyin' })
    );
    return items;
  }, []);

  const results = useMemo(() => {
    if (!search.trim()) return [] as SearchResult[];
    const q = search.toLowerCase();
    return searchData.filter((it) => it.label.toLowerCase().includes(q) || it.sub.toLowerCase().includes(q)).slice(0, 12);
  }, [search, searchData]);

  // 关闭其它弹窗
  const toggleSearch = () => {
    setShowSearch(!showSearch);
    if (!showSearch) {
      setShowMenu(false);
      setShowNotifications(false);
    }
  };

  const roleLabels: Record<string, string> = {
    director: '总监',
    manager: '经理',
    staff: '专员',
  };

  const handleSelect = (r: SearchResult) => {
    setShowSearch(false);
    setSearch('');
    navigate(r.href);
  };

  return (
    <header className="relative z-40 h-16 flex items-center justify-between px-6 border-b border-white/5 bg-[hsl(230_40%_10%)/0.6] backdrop-blur-xl shrink-0">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-base font-semibold text-white">{title}</h1>
          {subtitle && <p className="text-xs text-white/50">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative w-72" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="搜索内容、账号、话术..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => {
              setShowSearch(true);
              setShowMenu(false);
              setShowNotifications(false);
            }}
            className="w-full h-9 pl-9 pr-9 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-white/40 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-12 w-[28rem] glass-card p-0 overflow-hidden z-50"
              >
                {results.length > 0 ? (
                  <>
                    <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between">
                      <span className="text-xs text-white/50">搜索结果（{results.length}）</span>
                      <span className="text-[10px] text-white/30">回车跳转</span>
                    </div>
                    <div className="max-h-80 overflow-y-auto scrollbar-thin">
                      {results.map((r, i) => {
                        const Icon = r.category === '对标账号' ? Users : r.category === '视频' ? FileText : r.category === '直播话术' ? MessageSquare : r.category === '金句' ? Quote : FileText;
                        const color = r.category === '对标账号' ? 'text-rose-300' : r.category === '视频' ? 'text-cyan-300' : r.category === '直播话术' ? 'text-orange-300' : r.category === '金句' ? 'text-amber-300' : 'text-emerald-300';
                        return (
                          <button
                            key={i}
                            onClick={() => handleSelect(r)}
                            className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
                          >
                            <Icon className={`w-4 h-4 ${color} shrink-0`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{r.label}</p>
                              <p className="text-xs text-white/40 truncate">{r.sub}</p>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/50 shrink-0">
                              {r.category}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : search.trim() ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm text-white/40">未找到与「{search}」相关的结果</p>
                    <p className="text-xs text-white/30 mt-1">试试搜索：芥舟语文 / 暑期复盘 / 直播话术</p>
                  </div>
                ) : (
                  <div className="px-4 py-3 text-xs text-white/40">
                    <p className="mb-2">快捷入口：</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['芥舟语文', '学霸笔记', '暑期', '直播话术', '金句'].map((s) => (
                        <button
                          key={s}
                          onClick={() => setSearch(s)}
                          className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse-glow" />
          <span className="text-xs text-emerald-400 font-medium">实时同步</span>
        </div>

        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10">
          <Clock className="w-3.5 h-3.5 text-white/50" />
          <span className="text-xs text-white/60">{updateTime}</span>
        </div>

        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowMenu(false);
              setShowSearch(false);
            }}
            className="relative w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
            )}
          </button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="absolute right-0 top-12 w-80 glass-card p-0 overflow-hidden z-50"
              >
                <div className="px-4 py-3 border-b border-white/10">
                  <h3 className="text-sm font-semibold text-white">通知中心</h3>
                  <p className="text-xs text-white/50">{unreadCount} 条未读 · 共 {notifs.length} 条</p>
                </div>
                <div className="max-h-72 overflow-y-auto scrollbar-thin">
                  {notifs.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-white/40">暂无通知</div>
                  ) : (
                    notifs.map((n) => (
                      <div key={n.id} className="px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer">
                        <div className="flex items-start gap-2">
                          <span className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${NOTICE_DOT[n.type]}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white/90 truncate">{n.title}</p>
                            <p className="text-xs text-white/50 truncate">{n.desc}</p>
                            <p className="text-xs text-white/30 mt-1 flex items-center gap-2">
                              <span>{timeAgo(n.time)}</span>
                              {n.actor && <span>· {n.actor}</span>}
                              {!n.read && <span className="text-[10px] px-1 rounded bg-blue-500/20 text-blue-300">未读</span>}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="px-4 py-2 border-t border-white/10 flex items-center justify-between">
                  <button onClick={markAllRead} className="text-xs text-purple-400 hover:text-purple-300">全部已读</button>
                  {notifs.length > 0 && (
                    <button onClick={clearNotifications} className="text-xs text-white/40 hover:text-rose-300">清空</button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <button
            onClick={() => {
              setShowMenu(!showMenu);
              setShowNotifications(false);
              setShowSearch(false);
            }}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            {currentStaff.avatar ? (
              <img src={currentStaff.avatar} alt={currentStaff.name} className="w-7 h-7 rounded-full object-cover border border-white/20" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-xs font-semibold text-white">
                {currentStaff.name.charAt(0)}
              </div>
            )}
            <div className="hidden md:block text-left">
              <div className="text-xs font-medium text-white leading-tight">{currentStaff.name}</div>
              <div className="text-[10px] text-white/50">{roleLabels[currentStaff.level]}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-white/50" />
          </button>

          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="absolute right-0 top-12 w-48 glass-card p-1 z-50"
              >
                <button
                  onClick={() => { setSwitchOpen(true); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Users className="w-4 h-4" /> 切换身份
                  <span className="ml-auto text-[10px] text-white/30">{staffList.length} 人</span>
                </button>
                <button
                  onClick={() => { setProfileForm(currentStaff); setAvatarErr(''); setProfileOpen(true); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <User className="w-4 h-4" /> 个人信息
                </button>
                <button
                  onClick={() => { setSettingsMsg(''); setSettingsOpen(true); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Settings className="w-4 h-4" /> 账户设置
                </button>
                <div className="my-1 border-t border-white/10" />
                <button
                  onClick={() => {
                    doLogout();
                    window.location.reload();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> 退出登录
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 个人信息弹窗（含头像自定义） */}
      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} title="个人信息" subtitle="头像、姓名与联系方式保存在本机" maxWidth="max-w-md">
        <div className="space-y-4">
          {/* 头像 */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {profileForm.avatar ? (
                <img src={profileForm.avatar} alt="头像" className="w-16 h-16 rounded-full object-cover border-2 border-purple-500/40" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-xl font-bold text-white">
                  {profileForm.name.charAt(0) || '头'}
                </div>
              )}
              <button
                onClick={() => avatarInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-purple-500 border border-white/20 flex items-center justify-center text-white hover:bg-purple-400"
                title="上传头像"
              >
                <Camera className="w-3 h-3" />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = ''; }}
              />
            </div>
            <div className="flex-1">
              <p className="text-xs text-white/60">点击相机上传自定义头像（自动裁剪压缩为 128px）。如当前环境不支持图片上传，直接填写姓名即可——姓名支持中英文与字母。</p>
              {profileForm.avatar && (
                <button
                  onClick={() => setProfileForm((p) => ({ ...p, avatar: undefined }))}
                  className="mt-1.5 flex items-center gap-1 text-[10px] text-rose-300/70 hover:text-rose-300"
                >
                  <Trash2 className="w-3 h-3" /> 移除头像，恢复首字显示
                </button>
              )}
              {avatarErr && <p className="mt-1 text-[10px] text-rose-300">{avatarErr}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 block mb-1">姓名</label>
              <input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">职级（由总监授权，本人不可改）</label>
              <input value={roleLabels[currentStaff.level] || '专员'} disabled className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white/50" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">手机号</label>
              <input value={profileForm.phone || ''} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="选填" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">微信号</label>
              <input value={profileForm.wechat || ''} onChange={(e) => setProfileForm({ ...profileForm, wechat: e.target.value })} placeholder="选填" className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
            </div>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">个人签名</label>
            <textarea value={profileForm.bio || ''} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} rows={2} placeholder="一句话介绍自己（选填）" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white resize-none" />
          </div>

          {/* AI 接口：默认共用团队接口，可申请使用自己的 */}
          {(() => {
            const me = getMember(currentStaff.name);
            if (!me || me.level === 'director') return null;
            const st = me.apiRequest;
            const usingOwn = me.apiMode === 'own' && st === 'approved';
            return (
              <div className="p-3 rounded-lg bg-white/5 border border-white/10" key={apiTick}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-xs text-white font-medium">AI 接口</p>
                    <p className="text-[10px] text-white/45 mt-0.5">
                      {usingOwn
                        ? '正在使用你自己的接口'
                        : st === 'pending'
                        ? '申请已提交，等待管理员审批'
                        : st === 'rejected'
                        ? `申请被驳回${me.apiRejectReason ? `：${me.apiRejectReason}` : ''}`
                        : '当前使用团队共用接口，AI 功能可直接调用'}
                    </p>
                  </div>
                  {usingOwn ? (
                    <span className="shrink-0 text-[10px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      已开通
                    </span>
                  ) : st === 'pending' ? (
                    <span className="shrink-0 text-[10px] px-2 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      待审批
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        const reason = window.prompt(
                          '申请使用自己的 AI 接口\n\n说明一下理由（选填），例如：已有自己的 DeepSeek 额度、需要单独计费等',
                          st === 'rejected' ? me.apiRequestNote : '',
                        );
                        if (reason === null) return;
                        const r = applyOwnApi(currentStaff.name, reason);
                        if (!r.ok) {
                          window.alert(r.reason || '提交失败');
                          return;
                        }
                        setApiTick((v) => v + 1);
                        window.alert('申请已提交，等管理员在「员工管理 → 接口申请」里同意后即可配置。');
                      }}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs hover:bg-white/10 hover:text-white"
                    >
                      {st === 'rejected' ? '重新申请' : '申请使用自己的接口'}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="flex justify-end gap-2">
            <button onClick={() => setProfileOpen(false)} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
            <button
              onClick={() => {
                if (!profileForm.name.trim()) return;
                saveStaff({ ...profileForm, name: profileForm.name.trim() });
                setProfileOpen(false);
              }}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium"
            >
              保存
            </button>
          </div>
        </div>
      </Modal>

      {/* 账户设置弹窗（数据管理） */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="账户设置" subtitle="数据备份与恢复 · 全部数据保存在本机浏览器" maxWidth="max-w-md">
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-white/5 border border-white/10">
            <p className="text-xs text-white/70 font-medium mb-1 flex items-center gap-1.5"><Download className="w-3.5 h-3.5 text-emerald-400" /> 导出数据备份</p>
            <p className="text-[10px] text-white/40 mb-2">把直播数据、社群、任务、话术、API 配置等全部本地数据打包为 JSON 下载</p>
            <button onClick={handleExportBackup} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 text-xs hover:bg-emerald-500/25">
              导出备份 JSON
            </button>
          </div>
          <div className="p-3 rounded-lg bg-white/5 border border-white/10">
            <p className="text-xs text-white/70 font-medium mb-1 flex items-center gap-1.5"><Upload className="w-3.5 h-3.5 text-cyan-400" /> 导入恢复</p>
            <p className="text-[10px] text-white/40 mb-2">选择之前导出的备份 JSON，覆盖恢复到本机（导入前会二次确认）</p>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportBackup(f); e.target.value = ''; }}
            />
            <button onClick={() => importInputRef.current?.click()} className="px-3 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-300 text-xs hover:bg-cyan-500/25">
              选择备份文件
            </button>
          </div>
          <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/20">
            <p className="text-xs text-rose-200 font-medium mb-1 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> 清空全部数据</p>
            <p className="text-[10px] text-white/40 mb-2">删除本机全部工作台数据（不可恢复，需两次确认）</p>
            <button onClick={handleClearAll} className="px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 text-xs hover:bg-rose-500/25">
              清空数据
            </button>
          </div>
          {settingsMsg && <p className="text-xs text-emerald-300">{settingsMsg}</p>}
          <p className="text-[10px] text-white/30">新媒体工作台 v1.0 · 数据仅存储于当前浏览器 localStorage，更换浏览器/设备前请导出备份</p>
        </div>
      </Modal>

      {/* 切换身份弹窗 */}
      <Modal open={switchOpen} onClose={() => setSwitchOpen(false)} title="切换身份" subtitle="不同角色看到的数据范围不同（如运营日报可见性）" maxWidth="max-w-sm">
        <div className="space-y-1.5">
          {staffList.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                saveStaff({ ...currentStaff, id: s.id, name: s.name, level: s.level });
                setSwitchOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                currentStaff.id === s.id
                  ? 'bg-purple-500/15 border-purple-500/40'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-sm font-bold text-white shrink-0">
                {s.name.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="text-sm text-white">{s.name}</p>
                <p className="text-[10px] text-white/40">{roleLabels[s.level]}</p>
              </div>
              {currentStaff.id === s.id && <span className="text-[10px] text-purple-300">当前</span>}
            </button>
          ))}
          <p className="text-[10px] text-white/30 pt-1">切换后头像/联系方式保留当前自定义内容，仅身份与角色变更</p>
        </div>
      </Modal>
    </header>
  );
};

export default TopBar;
