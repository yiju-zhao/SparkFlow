# GSD 开发使用说明

**GSD** (Get Shit Done) 创建层次化的项目计划，专为 Claude Code 的单人代理开发优化。

## 快速开始

1. `/gsd:new-project` - 初始化项目（包括研究、需求、路线图）
2. `/gsd:plan-phase 1` - 为第一阶段创建详细计划
3. `/gsd:execute-phase 1` - 执行该阶段

## 保持更新

GSD 发展很快，定期更新：

```bash
npx get-shit-done-cc@latest
```

## 核心工作流

```
/gsd:new-project → /gsd:plan-phase → /gsd:execute-phase → repeat
```

### 项目初始化

**`/gsd:new-project`**
通过统一流程初始化新项目。

一条命令从想法到准备规划：
- 深度提问了解你要构建什么
- 可选的领域研究（生成 4 个并行研究员代理）
- 需求定义，包含 v1/v2/范围外划分
- 路线图创建，包含阶段分解和成功标准

创建所有 `.planning/` 产物：
- `PROJECT.md` — 愿景和需求
- `config.json` — 工作流模式（interactive/yolo）
- `research/` — 领域研究（如果选择）
- `REQUIREMENTS.md` — 带有 REQ-ID 的范围需求
- `ROADMAP.md` — 映射到需求的阶段
- `STATE.md` — 项目记忆

用法: `/gsd:new-project`

**`/gsd:map-codebase`**
为棕地项目映射现有代码库。

- 使用并行 Explore 代理分析代码库
- 创建包含 7 个聚焦文档的 `.planning/codebase/`
- 涵盖技术栈、架构、结构、约定、测试、集成、关注点
- 在现有代码库上使用 `/gsd:new-project` 之前使用

用法: `/gsd:map-codebase`

### 阶段规划

**`/gsd:discuss-phase <number>`**
在规划前帮助表达你对阶段的愿景。

- 捕获你想象中这个阶段如何工作
- 创建包含你的愿景、要点和边界的 CONTEXT.md
- 当你对某事应该看起来/感觉如何有想法时使用

用法: `/gsd:discuss-phase 2`

**`/gsd:research-phase <number>`**
针对小众/复杂领域的全面生态系统研究。

- 发现标准技术栈、架构模式、陷阱
- 创建包含"专家如何构建这个"知识的 RESEARCH.md
- 用于 3D、游戏、音频、着色器、ML 和其他专业领域
- 超越"哪个库"到生态系统知识

用法: `/gsd:research-phase 3`

**`/gsd:list-phase-assumptions <number>`**
在 Claude 开始之前看看它计划做什么。

- 显示 Claude 对某个阶段的预期方法
- 如果 Claude 误解了你的愿景，让你纠正方向
- 不创建文件 - 仅对话输出

用法: `/gsd:list-phase-assumptions 3`

**`/gsd:plan-phase <number>`**
为特定阶段创建详细执行计划。

- 生成 `.planning/phases/XX-phase-name/XX-YY-PLAN.md`
- 将阶段分解为具体、可操作的任务
- 包含验证标准和成功度量
- 每个阶段支持多个计划（XX-01, XX-02 等）

用法: `/gsd:plan-phase 1`
结果: 创建 `.planning/phases/01-foundation/01-01-PLAN.md`

**PRD 快速通道:** 传递 `--prd path/to/requirements.md` 完全跳过 discuss-phase。你的 PRD 成为 CONTEXT.md 中的锁定决策。当你已经有明确的验收标准时很有用。

### 执行

**`/gsd:execute-phase <phase-number>`**
执行阶段中的所有计划。

- 按 wave（来自 frontmatter）分组计划，顺序执行 wave
- 每个 wave 内的计划通过 Task 工具并行运行
- 所有计划完成后验证阶段目标
- 更新 REQUIREMENTS.md, ROADMAP.md, STATE.md

用法: `/gsd:execute-phase 5`

### 快速模式

**`/gsd:quick`**
使用 GSD 保证执行小型、临时任务，但跳过可选代理。

快速模式使用相同的系统，路径更短：
- 生成 planner + executor（跳过 researcher, checker, verifier）
- 快速任务位于 `.planning/quick/`，与计划阶段分开
- 更新 STATE.md 跟踪（不是 ROADMAP.md）

当你确切知道要做什么，任务足够小不需要研究或验证时使用。

用法: `/gsd:quick`
结果: 创建 `.planning/quick/NNN-slug/PLAN.md`, `.planning/quick/NNN-slug/SUMMARY.md`

### 路线图管理

**`/gsd:add-phase <description>`**
在当前里程碑末尾添加新阶段。

- 追加到 ROADMAP.md
- 使用下一个序号
- 更新阶段目录结构

用法: `/gsd:add-phase "Add admin dashboard"`

**`/gsd:insert-phase <after> <description>`**
在现有阶段之间插入紧急工作作为小数阶段。

- 创建中间阶段（例如 7 和 8 之间的 7.1）
- 对必须在里程碑中间发生的发现工作有用
- 维护阶段顺序

用法: `/gsd:insert-phase 7 "Fix critical auth bug"`
结果: 创建阶段 7.1

**`/gsd:remove-phase <number>`**
删除未来阶段并重新编号后续阶段。

- 删除阶段目录和所有引用
- 重新编号所有后续阶段以填补空白
- 仅适用于未来（未开始）阶段
- Git commit 保留历史记录

用法: `/gsd:remove-phase 17`
结果: 阶段 17 被删除，阶段 18-20 变为 17-19

### 里程碑管理

**`/gsd:new-milestone <name>`**
通过统一流程开始新里程碑。

- 深度提问了解你接下来要构建什么
- 可选的领域研究（生成 4 个并行研究员代理）
- 带范围的需求定义
- 带阶段分解的路线图创建

镜像 `/gsd:new-project` 流程用于棕地项目（现有 PROJECT.md）。

用法: `/gsd:new-milestone "v2.0 Features"`

**`/gsd:complete-milestone <version>`**
归档已完成的里程碑并为下一版本做准备。

- 创建带有统计信息的 MILESTONES.md 条目
- 将完整详情归档到 milestones/ 目录
- 为发布创建 git tag
- 为下一版本准备工作区

用法: `/gsd:complete-milestone 1.0.0`

### 进度跟踪

**`/gsd:progress`**
检查项目状态并智能路由到下一个操作。

- 显示可视化进度条和完成百分比
- 从 SUMMARY 文件总结最近的工作
- 显示当前位置和下一步
- 列出关键决策和未解决问题
- 提供执行下一个计划或创建缺失计划
- 检测 100% 里程碑完成

用法: `/gsd:progress`

### 会话管理

**`/gsd:resume-work`**
从上一个会话恢复工作，完整恢复上下文。

- 读取 STATE.md 获取项目上下文
- 显示当前位置和最近进度
- 基于项目状态提供下一步操作

用法: `/gsd:resume-work`

**`/gsd:pause-work`**
在阶段中间暂停工作时创建上下文交接。

- 创建带有当前状态的 .continue-here 文件
- 更新 STATE.md 会话连续性部分
- 捕获进行中的工作上下文

用法: `/gsd:pause-work`

### 调试

**`/gsd:debug [issue description]`**
系统化调试，在上下文重置间保持状态。

- 通过自适应提问收集症状
- 创建 `.planning/debug/[slug].md` 跟踪调查
- 使用科学方法调查（证据 → 假设 → 测试）
- 在 `/clear` 后存活 — 运行 `/gsd:debug` 不带参数恢复
- 将已解决的问题归档到 `.planning/debug/resolved/`

用法: `/gsd:debug "login button doesn't work"`
用法: `/gsd:debug`（恢复活动会话）

### Todo 管理

**`/gsd:add-todo [description]`**
从当前对话捕获想法或任务作为 todo。

- 从对话提取上下文（或使用提供的描述）
- 在 `.planning/todos/pending/` 创建结构化 todo 文件
- 从文件路径推断区域进行分组
- 创建前检查重复
- 更新 STATE.md todo 计数

用法: `/gsd:add-todo`（从对话推断）
用法: `/gsd:add-todo Add auth token refresh`

**`/gsd:check-todos [area]`**
列出待处理 todo 并选择一个来工作。

- 列出所有待处理 todo，带标题、区域、年龄
- 可选区域过滤（例如 `/gsd:check-todos api`）
- 加载所选 todo 的完整上下文
- 路由到适当操作（现在工作、添加到阶段、头脑风暴）
- 工作开始时将 todo 移动到 done/

用法: `/gsd:check-todos`
用法: `/gsd:check-todos api`

### 用户验收测试

**`/gsd:verify-work [phase]`**
通过对话式 UAT 验证构建的功能。

- 从 SUMMARY.md 文件提取可测试交付物
- 一次呈现一个测试（是/否响应）
- 自动诊断失败并创建修复计划
- 如果发现问题，准备重新执行

用法: `/gsd:verify-work 3`

### 里程碑审计

**`/gsd:audit-milestone [version]`**
根据原始意图审计里程碑完成情况。

- 读取所有阶段 VERIFICATION.md 文件
- 检查需求覆盖
- 为跨阶段连接生成集成检查器
- 创建带有差距和技术债务的 MILESTONE-AUDIT.md

用法: `/gsd:audit-milestone`

**`/gsd:plan-milestone-gaps`**
创建阶段来填补审计发现的差距。

- 读取 MILESTONE-AUDIT.md 并将差距分组为阶段
- 按需求优先级排序（must/should/nice）
- 将差距填补阶段添加到 ROADMAP.md
- 准备在新阶段上使用 `/gsd:plan-phase`

用法: `/gsd:plan-milestone-gaps`

### 配置

**`/gsd:settings`**
交互式配置工作流开关和模型配置。

- 切换 researcher, plan checker, verifier 代理
- 选择模型配置（quality/balanced/budget）
- 更新 `.planning/config.json`

用法: `/gsd:settings`

**`/gsd:set-profile <profile>`**
快速切换 GSD 代理的模型配置。

- `quality` — 除验证外到处使用 Opus
- `balanced` — 规划用 Opus，执行用 Sonnet（默认）
- `budget` — 写作用 Sonnet，研究/验证用 Haiku

用法: `/gsd:set-profile budget`

### 实用命令

**`/gsd:cleanup`**
归档已完成里程碑的累积阶段目录。

- 识别仍在 `.planning/phases/` 中的已完成里程碑阶段
- 移动前显示 dry-run 摘要
- 将阶段目录移动到 `.planning/milestones/v{X.Y}-phases/`
- 在多个里程碑后使用以减少 `.planning/phases/` 混乱

用法: `/gsd:cleanup`

**`/gsd:help`**
显示此命令参考。

**`/gsd:update`**
更新 GSD 到最新版本，带 changelog 预览。

- 显示已安装 vs 最新版本比较
- 显示你错过的版本的 changelog 条目
- 高亮破坏性变更
- 安装前确认
- 比原始 `npx get-shit-done-cc` 更好

用法: `/gsd:update`

**`/gsd:join-discord`**
加入 GSD Discord 社区。

- 获取帮助，分享你正在构建的内容，保持更新
- 与其他 GSD 用户联系

用法: `/gsd:join-discord`

## 文件与结构

```
.planning/
├── PROJECT.md            # 项目愿景
├── ROADMAP.md            # 当前阶段分解
├── STATE.md              # 项目记忆与上下文
├── RETROSPECTIVE.md      # 活跃的回顾（每个里程碑更新）
├── config.json           # 工作流模式与门控
├── todos/                # 捕获的想法和任务
│   ├── pending/          # 等待处理的 todos
│   └── done/             # 已完成的 todos
├── debug/                # 活跃的调试会话
│   └── resolved/         # 归档的已解决问题
├── milestones/
│   ├── v1.0-ROADMAP.md       # 归档的路线图快照
│   ├── v1.0-REQUIREMENTS.md  # 归档的需求
│   └── v1.0-phases/          # 归档的阶段目录（通过 /gsd:cleanup 或 --archive-phases）
│       ├── 01-foundation/
│       └── 02-core-features/
├── codebase/             # 代码库映射（棕地项目）
│   ├── STACK.md          # 语言、框架、依赖
│   ├── ARCHITECTURE.md   # 模式、层次、数据流
│   ├── STRUCTURE.md      # 目录布局、关键文件
│   ├── CONVENTIONS.md    # 编码标准、命名
│   ├── TESTING.md        # 测试设置、模式
│   ├── INTEGRATIONS.md   # 外部服务、API
│   └── CONCERNS.md       # 技术债务、已知问题
└── phases/
    ├── 01-foundation/
    │   ├── 01-01-PLAN.md
    │   └── 01-01-SUMMARY.md
    └── 02-core-features/
        ├── 02-01-PLAN.md
        └── 02-01-SUMMARY.md
```

## 工作流模式

在 `/gsd:new-project` 期间设置：

**交互模式 (Interactive Mode)**

- 确认每个主要决策
- 在检查点暂停以获得批准
- 全程更多指导

**YOLO 模式**

- 自动批准大多数决策
- 无需确认执行计划
- 仅在关键检查点停止

随时通过编辑 `.planning/config.json` 更改

## 规划配置

在 `.planning/config.json` 中配置规划产物的管理方式：

**`planning.commit_docs`** (默认: `true`)
- `true`: 规划产物提交到 git（标准工作流）
- `false`: 规划产物仅本地保存，不提交

当 `commit_docs: false`:
- 将 `.planning/` 添加到你的 `.gitignore`
- 对 OSS 贡献、客户项目或保持规划私有有用
- 所有规划文件仍然正常工作，只是不在 git 中跟踪

**`planning.search_gitignored`** (默认: `false`)
- `true`: 在广泛的 ripgrep 搜索中添加 `--no-ignore`
- 仅在 `.planning/` 被 gitignore 且你希望项目范围搜索包含它时需要

示例配置:
```json
{
  "planning": {
    "commit_docs": false,
    "search_gitignored": true
  }
}
```

## 常见工作流

**开始新项目:**

```
/gsd:new-project        # 统一流程: 提问 → 研究 → 需求 → 路线图
/clear
/gsd:plan-phase 1       # 为第一阶段创建计划
/clear
/gsd:execute-phase 1    # 执行阶段中的所有计划
```

**休息后恢复工作:**

```
/gsd:progress  # 查看你离开的位置并继续
```

**添加里程碑中间的紧急工作:**

```
/gsd:insert-phase 5 "Critical security fix"
/gsd:plan-phase 5.1
/gsd:execute-phase 5.1
```

**完成里程碑:**

```
/gsd:complete-milestone 1.0.0
/clear
/gsd:new-milestone  # 开始下一个里程碑（提问 → 研究 → 需求 → 路线图）
```

**在工作中捕获想法:**

```
/gsd:add-todo                    # 从对话上下文捕获
/gsd:add-todo Fix modal z-index  # 带明确描述捕获
/gsd:check-todos                 # 审查并处理 todos
/gsd:check-todos api             # 按区域过滤
```

**调试问题:**

```
/gsd:debug "form submission fails silently"  # 开始调试会话
# ... 调查进行中，上下文填满 ...
/clear
/gsd:debug                                    # 从你离开的地方恢复
```

## 构建新功能

由于你有一个现有项目，你有 **三个选项**：

### 选项 1: 小型/临时功能 → `/gsd:quick`

```
/gsd:quick
```
- 用于你确切知道如何做的小任务
- 跳过研究和验证代理
- 在 `.planning/quick/` 创建计划，立即执行

### 选项 2: 中型功能 → 添加为新阶段

```
/gsd:add-phase "添加功能描述"
/gsd:plan-phase N    # N 是新阶段编号
/gsd:execute-phase N
```

### 选项 3: 大型功能集 → 新里程碑

```
/gsd:new-milestone "v2.0 Features"
```
- 完整流程: 提问 → 研究 → 需求 → 路线图
- 用于形成新版本的主要功能集

## 获取帮助

- 读取 `.planning/PROJECT.md` 获取项目愿景
- 读取 `.planning/STATE.md` 获取当前上下文
- 检查 `.planning/ROADMAP.md` 获取阶段状态
- 运行 `/gsd:progress` 检查你的进度
