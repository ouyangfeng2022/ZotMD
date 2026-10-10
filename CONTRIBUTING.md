# 参与贡献

欢迎通过 [Issues](https://github.com/ouyangfeng2022/ZotMD/issues) 报告问题或提出功能建议，通过 Pull Request 提交改进。

## 报告问题

请提供操作系统、Zotero 版本、ZotMD 版本、复现步骤、预期行为和实际结果。涉及文档解析时，说明文件格式、模型与图片模式，尽量使用可公开的最小样本。提交前删除 Token、签名下载链接和私人文献内容。

## 本地开发

1. Fork 并克隆仓库，创建工作分支。
2. 使用 Node.js 22.8.0 或更高版本，运行 `npm ci --userconfig=.npmrc.install`。
3. 按 [开发文档](docs/DEVELOPMENT.md) 配置专用 Zotero profile 和数据目录。
4. 提交前运行 `npm run lint:check` 和 `npm run build`；涉及插件行为时运行 `npm test`。
5. 在 PR 中说明问题、改动和验证结果；未执行的检查也请说明原因。

提交信息建议使用 Conventional Commits，例如 `fix: handle empty OCR results`。请勿提交 `.env`、API Token、个人数据库、`node_modules` 或 `.scaffold` 产物。

## 授权

本项目沿用 GNU Affero General Public License v3.0 or later（AGPL-3.0-or-later），完整文本见 [LICENSE](LICENSE)。贡献代码时请确认你有权按该许可证提交，并保留第三方代码的授权声明。
