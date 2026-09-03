# 新媒体运营工作台 · 设计与技术规范

## 一、设计风格

### 主题：深色科技 + 渐变霓虹 + 玻璃拟态

- **主背景**：深靛蓝渐变 `hsl(230, 40%, 8%)` → `hsl(240, 35%, 12%)`
- **强调色**：
  - 品牌主色：霓虹紫 `#A855F7` → 靛蓝 `#6366F1` 渐变
  - 数据绿：`#10B981`
  - 警告橙：`#F59E0B`
  - 错误红：`#EF4444`
  - 信息蓝：`#3B82F6`
- **玻璃拟态卡片**：`backdrop-blur-xl` + `bg-white/5` + `border border-white/10` + 内发光 `shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]`
- **文字层级**：主标题 `text-white`，副标题 `text-white/80`，正文 `text-white/70`，辅助 `text-white/50`

### 间距基线
- 全局间距基数：`gap-4`（16px）为默认区块间距
- 卡片内边距：`p-5`（20px）
- 小组件间距：`gap-3`（12px）
- 统一用 `gap` 管理并列元素间距，不给子元素逐个加 margin

### 动画规范
- 进场：`opacity 0→1` + `y 12→0`，时长 400ms，ease-out
- Hover 卡片：轻微上移 + 边框变亮 + 阴影增强
- 侧边栏折叠：宽度过渡 300ms
- 数字跳动：spring 动画
- 技术选型：列表增量用 AutoAnimate，整体页面/模态框用 Framer Motion

## 二、架构概览

### 模块清单（六大模块 + 总览页）
1. **总览 Dashboard** — `/` — 全平台数据总览
2. **小红书运营** — `/xiaohongshu` — 对标监控 / 数据统计 / 二创工坊
3. **抖音运营** — `/douyin` — 账号数据 / 对标监控
4. **直播工作间** — `/live` — 话术分析 / 节奏图谱 / 金句库 / 方法论
5. **私域社群** — `/community` — 预览看板 / 资产管理 / 员工管理 / 运营日历 / 转化追踪 / 复盘 / 话术库
6. **Skill 管理中心** — `/skills` — Skill 列表 / 增删改查

### 共享基础设施
- `client/src/store/workspace.ts` — 全局状态（员工、权限、在线状态、操作日志）
- `client/src/data/mock.ts` — 全部模块 mock 数据
- `client/src/components/` — 公共 UI 组件
  - `GlassCard.tsx` — 玻璃拟态卡片
  - `StatCard.tsx` — 指标卡
  - `Sidebar.tsx` — 侧边导航
  - `TopBar.tsx` — 顶部状态栏
  - `charts/` — 图表封装

### 员工权限体系
- 角色：管理员（admin） / 运营（operator） / 实习生（intern）
- 所有模块操作受权限控制，操作写入全局日志
- 日志包含：操作人、时间、模块、动作、详情

## 三、前端结构
```
client/src/
├── app.tsx
├── components/
│   ├── Layout.tsx
│   ├── Sidebar.tsx
│   ├── TopBar.tsx
│   ├── GlassCard.tsx
│   ├── StatCard.tsx
│   └── ui/
├── pages/
│   ├── Dashboard/
│   ├── Xiaohongshu/
│   ├── Douyin/
│   ├── Live/
│   ├── Community/
│   └── Skills/
├── store/
│   └── workspace.ts
├── data/
│   └── mock.ts
├── types/
│   └── index.ts
└── utils/
    └── format.ts
```
