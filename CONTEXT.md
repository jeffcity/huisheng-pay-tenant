# 租户端总 Demo 项目状态

## 架构（2026-08 重构）

- 旧结构：`src/demo.html` 4MB 单体（base64 内嵌 4 个页面源），`scripts/build.mjs` 复制到根与 dist。
- 新结构：React + Arco Design 壳（与平台端同款），5 个内页以真实 HTML 文件存放，经 embed 管线注入 iframe srcdoc。
- 内页源：`public/legacy/sources/{overview,merchants,notifications,system,login}.html`；通知中心采用独立业务源，其余四页来自旧单体解码迁移。
- 页面注册表：`src/legacy/modules.json`，22 个页面 = 6 组导航 20 项 + 工具区 2 项（导出任务、登录页预览）。
- 通知中心：运营中心保留单一「通知中心」入口，页面内使用「发送的消息」「通知配置」两个一级页签。
- 旧壳 embed 口径逐条保留：login 页不注入桥接；其余页注入 headBridge（隐藏内页 sidebar/topbar + `__UNIFIED_DEMO_HASH` 引导）与 routeBridge（system 点 `[data-view]`、merchants 点 `.nav-button[data-page]`）。
- 跨页导航 API：内页 `parent.postMessage({ type: 'hs-unified-open-page', pageId })`，壳监听并路由；URL hash 同步（`#funds` 等页面 id）。

## 已知外部依赖（历史遗留，门禁豁免）

- `system.html` 引用 unpkg lucide 图标与 Google Fonts（Fira Code / Fira Sans）。迁移不改其运行时行为；门禁对该页豁免，本地化需先做视觉回归。

## 验证

- `npm run check`：vite build（base './'）+ node:test（注册表一致性、导航覆盖）+ `scripts/check.mjs`（相对资源、无本机路径、外部资源白名单）。
- `node scripts/dist-smoke.cjs "$(pwd)/dist/index.html"`：资金申请「确认已付款」→ 2FA + 二次确认 → 状态流转「待付款→待平台确认」+ 平台单号生成 + 审计写回。

## 边界

- 租户端业务需求、PRD、开发补充与待确认事项继续以 `../../三端需求管理/租户端/` 为准。
- 跨端业务规则以 `../../10-顶层业务设计/` 与 `../../20-技术契约/` 为准。
