# 维护规则

- `src/demo.html` 是本端总 Demo 的唯一可编辑界面源文件。
- 禁止手改根目录 `index.html` 或 `dist/index.html`；两者均由构建生成。
- 现有需求目录、PRD、开发说明和待确认事项继续作为业务资料，不因项目化迁移改变口径。
- 修改 Demo 后必须依次执行 `npm run build` 和 `npm run check`。
- 推送 `main` 后由 `.github/workflows/pages.yml` 重新检查并发布 `dist/`，不得绕过检查直接上传生成文件。
- 不启动 Obsidian；读取和维护资料只使用文件系统。
