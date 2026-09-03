import React, { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  BookOpen,
  Video,
  Radio,
  Users,
  Sparkles,
  UserCog,
  AtSign,
  Wand2,
  Key,
  ClipboardList,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Lock,
} from 'lucide-react';
import { useWorkspace } from '../store/workspace';
import { MODULES, canSee, type ModuleKey } from '../utils/memberStore';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  gradient: string;
}

// 板块清单与顺序统一从 memberStore 取，图标/配色属于展示层留在组件里
const MODULE_ICON: Record<ModuleKey, React.ReactNode> = {
  dashboard: <LayoutDashboard className="w-5 h-5" />,
  xiaohongshu: <BookOpen className="w-5 h-5" />,
  douyin: <Video className="w-5 h-5" />,
  live: <Radio className="w-5 h-5" />,
  community: <Users className="w-5 h-5" />,
  operations: <ClipboardList className="w-5 h-5" />,
  growth: <TrendingUp className="w-5 h-5" />,
  skills: <Sparkles className="w-5 h-5" />,
  staff: <UserCog className="w-5 h-5" />,
  accounts: <AtSign className="w-5 h-5" />,
  api: <Key className="w-5 h-5" />,
  reprocess: <Wand2 className="w-5 h-5" />,
};

const MODULE_GRADIENT: Record<ModuleKey, string> = {
  dashboard: 'from-purple-500 to-indigo-500',
  xiaohongshu: 'from-rose-500 to-pink-500',
  douyin: 'from-cyan-400 to-blue-500',
  live: 'from-amber-400 to-orange-500',
  community: 'from-emerald-400 to-teal-500',
  operations: 'from-cyan-500 to-blue-500',
  growth: 'from-fuchsia-500 to-purple-500',
  skills: 'from-fuchsia-500 to-purple-500',
  staff: 'from-blue-500 to-cyan-500',
  accounts: 'from-amber-500 to-orange-500',
  api: 'from-amber-400 to-orange-500',
  reprocess: 'from-violet-500 to-fuchsia-500',
};

const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { currentStaff } = useWorkspace();

  // 只显示当前身份被授权的板块
  const navItems: NavItem[] = useMemo(
    () =>
      MODULES.filter((m) => canSee(currentStaff.name, m.key)).map((m) => ({
        path: m.path,
        label: m.label,
        icon: MODULE_ICON[m.key],
        gradient: MODULE_GRADIENT[m.key],
      })),
    [currentStaff.name]
  );

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="h-screen flex flex-col bg-[hsl(230_40%_10%)/0.8] backdrop-blur-xl border-r border-white/5 shrink-0 relative"
    >
      <div className="h-16 flex items-center px-4 border-b border-white/5">
        <AnimatePresence mode="wait">
          {!collapsed ? (
            <motion.div
              key="full"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-bold text-white leading-tight">新媒体工作台</div>
                <div className="text-[10px] text-white/40">Media Operation OS</div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="mini"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="w-full flex justify-center"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto scrollbar-thin">
        {navItems.map((item, i) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <NavLink key={item.path} to={item.path}>
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 group ${
                  isActive
                    ? 'text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className={`absolute inset-0 rounded-lg bg-gradient-to-r ${item.gradient} opacity-20`}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                {isActive && (
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-gradient-to-b ${item.gradient}`} />
                )}
                <span className="relative z-10 shrink-0">{item.icon}</span>
                <AnimatePresence mode="wait">
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.2 }}
                      className="relative z-10 text-sm font-medium whitespace-nowrap overflow-hidden"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-2 border-t border-white/5 space-y-1">
        {!collapsed && navItems.length < MODULES.length && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-white/30" title="未授权的板块不会显示，手输地址也会被拦截">
            <Lock className="w-3 h-3 shrink-0" />
            <span className="truncate">{MODULES.length - navItems.length} 个板块未授权</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs">收起侧栏</span>
            </>
          )}
        </button>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
