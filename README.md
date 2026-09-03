# 新媒体团队工作台

教培行业新媒体矩阵运营工作台 —— 团队内部的多平台运营中台，覆盖 **小红书 / 抖音 / 直播 / 私域社群** 四大业务线，内置账号管理、对标监控、数据复盘、二创工坊、话术库、Skill 管理等模块，让新媒体团队在一个工作台里完成「选题 → 生产 → 发布 → 复盘 → 转化」的全链路。

## 模块一览

| 模块 | 路由 | 能力 |
| --- | --- | --- |
| 总览 Dashboard | `/` | 全平台数据总览 |
| 小红书运营 | `/xiaohongshu` | 对标监控 / 数据统计 / 二创工坊 |
| 抖音运营 | `/douyin` | 账号数据 / 对标监控 |
| 直播工作间 | `/live` | 话术分析 / 节奏图谱 / 金句库 / 方法论 |
| 私域社群 | `/community` | 预览看板 / 资产管理 / 员工管理 / 运营日历 / 转化追踪 / 复盘 / 话术库 |
| Skill 管理中心 | `/skills` | Skill 列表 / 增删改查 |

### 员工权限体系

- 角色：管理员（admin）/ 运营（operator）/ 实习生（intern）
- 所有模块操作受权限控制，操作写入全局日志
- 日志包含：操作人、时间、模块、动作、详情

## 技术栈

- **React 18 + TypeScript + Vite 5**
- **Tailwind CSS**（深色科技 + 渐变霓虹 + 玻璃拟态）
- **framer-motion**（动效）+ **recharts**（图表）+ **xlsx**（表格解析）
- 数据持久化：LocalStorage（零后端依赖，可离线运行）

## 本地运行

```bash
# 安装依赖
npm install

# 启动开发服务器（固定 5173 端口）
npm run dev

# 构建生产版本
npm run build
```

## 目录结构

```
client/src/
├── app.tsx
├── components/        # 公共 UI 组件（GlassCard / StatCard / Sidebar / TopBar ...）
├── pages/             # 各业务模块页面
│   ├── Dashboard/
│   ├── Xiaohongshu/
│   ├── Douyin/
│   ├── Live/
│   ├── Community/
│   └── Skills/
├── store/             # 全局状态（员工、权限、在线状态、操作日志）
├── data/              # mock 数据
├── types/             # 类型定义
└── utils/             # 工具函数（LLM 调用 / 表格解析 / 二创引擎 ...）
```

> 设计规范与架构细节见 [AGENTS.md](./AGENTS.md)。
