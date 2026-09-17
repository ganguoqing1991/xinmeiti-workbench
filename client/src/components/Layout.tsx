import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import GlassCard from './GlassCard';
import ErrorBoundary from './ErrorBoundary';
import { useWorkspace } from '../store/workspace';
import { canSee, moduleKeyOfPath, moduleLabelOf, MODULES } from '../utils/memberStore';
import { setCurrentUserResolver } from '../utils/llmConfig';
import { Lock, ArrowLeft } from 'lucide-react';

// 副标题：只在这里补充一句描述
const subtitles: Record<string, string> = {
  '/': '全平台运营数据实时概览',
  '/xiaohongshu': '对标监控 · 数据统计 · 内容二创',
  '/douyin': '账号数据 · 对标监控 · 粉丝画像',
  '/live': '话术分析 · 节奏图谱 · 方法论',
  '/community': '社群运营 · 转化追踪 · 员工管理',
  '/operations': '行业热点 · 运营日历 · 个人与团队任务',
  '/growth': '岗位指标 · 个人感悟 · AI 复盘报告',
  '/skills': 'AI 能力集成与自定义技能',
  '/staff': '团队协作 · 权限管理 · 操作日志',
  '/accounts': '为每个平台账号指派负责人',
  '/api': 'LLM / ASR 统一配置，配一次全局共享',
  '/reprocess': '任务栏 · 模型配置 · Skill 加工 · 历史记录',
};

// 标题统一以 memberStore.MODULES 为准：新增路由只要登记进 MODULES，
// 顶栏标题就不会再出现「有路由没标题、回落到数据总览」的老问题。
const titles: Record<string, { title: string; subtitle: string }> = Object.fromEntries(
  MODULES.map((m) => [m.path, { title: m.label, subtitle: subtitles[m.path] || '' }])
);

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentStaff } = useWorkspace();

  // 让密钥解析层知道当前是谁，从而决定用团队共用接口还是自带接口
  useEffect(() => {
    setCurrentUserResolver(() => currentStaff.name);
  }, [currentStaff.name]);

  const matchedKey = Object.keys(titles).find(
    (k) => k === '/' ? location.pathname === '/' : location.pathname.startsWith(k),
  ) ?? '/';

  const { title, subtitle } = titles[matchedKey];

  // 路由守卫：侧边栏隐藏只是第一层，这里拦住手输地址的情况
  const moduleKey = moduleKeyOfPath(location.pathname);
  const allowed = !moduleKey || canSee(currentStaff.name, moduleKey);

  if (!allowed) {
    return (
      <div className="flex h-screen w-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar title={title} subtitle={subtitle} />
          <main className="flex-1 overflow-y-auto scrollbar-thin p-6">
            <GlassCard hoverable={false}>
              <div className="py-16 text-center">
                <Lock className="w-12 h-12 text-white/15 mx-auto mb-4" />
                <p className="text-white text-base font-medium mb-1">没有「{moduleLabelOf(moduleKey!)}」的访问权限</p>
                <p className="text-xs text-white/40 mb-5">
                  当前身份 {currentStaff.name} 未被授予这个板块，需要管理员在「员工管理 → 团队总览」里开通。
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:text-white"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> 回到数据总览
                </button>
              </div>
            </GlassCard>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-y-auto scrollbar-thin p-6">
          {/* 页面级错误边界：单页崩溃只替换内容区，侧边栏/顶栏仍在，可直接切走。
              key 绑 pathname，切路由时自动清掉上一页的错误状态。 */}
          <ErrorBoundary scope="page" key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default Layout;
