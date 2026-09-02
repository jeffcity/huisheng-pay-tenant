# 维护规则

- 本项目是 React + Arco Design 重构后的租户端总 Demo。
- **可编辑源**：
  - React 壳：`src/App.jsx`、`src/embed.js`、`src/modules.js`、`src/shell.css`、`src/main.jsx`
  - 内页业务源：`public/legacy/sources/*.html`（5 个真实文件，原样保留口径，禁止 base64 化）
  - 页面注册表：`src/legacy/modules.json`（22 个页面 → 源文件 + hash）
- 修改内页时只改对应 `public/legacy/sources/<key>.html`；修改壳/导航/路由只改 React 源。
- 禁止把页面内容重新内联回单一 HTML 或编码为 base64——可检索性是本架构的核心收益。
- 修改 Demo 后必须依次执行 `npm run build` 和 `npm run check`；业务链路抽查用 `node scripts/dist-smoke.cjs "$(pwd)/dist/index.html"`。
- 推送 `main` 后由 `.github/workflows/pages.yml` 重新检查并发布 `dist/`，不得绕过检查直接上传生成文件。
- 不启动 Obsidian；读取和维护资料只使用文件系统。
