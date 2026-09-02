# 汇盛支付租户端统一 Demo

租户端独立项目，用于统一维护、版本管理和发布租户端总 Demo。2026-08 已从 base64 单体重构为 React + Arco Design 壳 + 真实内页源文件（与平台端同款架构）。

## 结构

- React 壳：`src/App.jsx`、`src/embed.js`、`src/modules.js`、`src/shell.css`、`src/main.jsx`
- 内页业务源（唯一界面事实源，禁止 base64 化）：`public/legacy/sources/{overview,merchants,notifications,system,login}.html`
- 页面注册表（22 页）：`src/legacy/modules.json`
- 本地开发：`npm run dev`；评审入口：`npm run build` 后打开 `dist/index.html`
- GitHub Pages 产物：`dist/`

## 门禁

```sh
npm test          # 注册表一致性、导航覆盖
npm run build     # vite build（base './'）
npm run check     # build + test + scripts/check.mjs
node scripts/dist-smoke.cjs "$(pwd)/dist/index.html"   # headless 业务链路冒烟
```

- 租户端需求资料：`../../三端需求管理/租户端/`
- `.github/workflows/pages.yml` 在推送 `main` 后重新检查并发布 `dist/`。
