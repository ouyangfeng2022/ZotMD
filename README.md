<p align="center">
  <img src="addon/content/icons/favicon.png" width="96" alt="ZotMD 图标" />
</p>

# ZotMD

在 Zotero 中调用 [MinerU](https://mineru.net) 解析文档，将 Markdown 和图片保存为文献条目的子附件，方便阅读、编辑和后续 AI 分析。

[![CI](https://github.com/ouyangfeng2022/ZotMD/actions/workflows/ci.yml/badge.svg)](https://github.com/ouyangfeng2022/ZotMD/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

## 功能

- 右键选中一个或多个文献条目，批量提交本地文件，无需提供公网下载地址。
- 优先选择 PDF，也支持 DOC、DOCX、PPT、PPTX、PNG、JPG 和 JPEG；实际解析能力取决于 MinerU 模型。
- 提供模型、文档语言、OCR、公式、表格和页码范围设置。
- 自动下载解析结果，创建 Markdown 子附件；图片支持同目录、Base64 内联和移除引用三种方式。
- 后台显示任务进度，支持取消本地处理和系统通知。
- 提供中文和英文界面。

## 环境要求

- Zotero 7 及以上。插件清单兼容范围为 6.999–10.\*；现有项目记录在 Zotero 10.0.3 上通过实测。
- [MinerU API Token](https://mineru.net/apiManage)。
- 从源码构建需要 Node.js 22.8.0 或更高版本和 npm。

## 安装

如果 [Releases](https://github.com/ouyangfeng2022/ZotMD/releases) 中已有版本，下载其中的 `zotmd.xpi`。首次推送源码不会自动创建 Release，也可以按下列步骤自行构建：

```bash
git clone https://github.com/ouyangfeng2022/ZotMD.git
cd ZotMD
npm ci --userconfig=.npmrc.install
npm run build
```

产物位于 `.scaffold/build/zotmd.xpi`。在 Zotero 中打开 **工具 → 插件**，点击右上角齿轮，选择 **Install Plugin From File…（从文件安装插件）**，打开该 XPI 文件。

> [!NOTE]
> `npm test` 会重新生成测试构建。安装或分发插件前，请最后运行一次 `npm run build`。

## 使用

1. 打开 Zotero **设置 → ZotMD**，填入 API Token，点击「校验 Token」。
2. 选中带有本地文档附件的文献条目，右键选择 **用 MinerU OCR（生成 Markdown）**。
3. 在进度窗口查看解析状态。完成后，Markdown 会作为子附件出现在原条目下。
4. 任务进行中点击进度窗口即可请求取消；已经保存的附件会保留。

> [!IMPORTANT]
> 解析会将所选文件上传到 MinerU。请确认文件适合交给该服务处理。API Token 以明文保存在本机 Zotero 偏好设置中，请勿分享包含 Token 的日志、配置或截图。

## 设置

| 设置                   | 默认值 / 说明                               |
| ---------------------- | ------------------------------------------- |
| API 地址               | `https://mineru.net`                        |
| 模型                   | `vlm`；也可选择 `pipeline` 或 `MinerU-HTML` |
| 文档语言               | `ch`；也支持英文、日文、韩文等              |
| 强制 OCR / 公式 / 表格 | 默认开启                                    |
| 页码范围               | 留空解析全文，例如 `2,4-6`                  |
| 图片处理               | 默认与 Markdown 放在同一目录                |
| 系统通知               | 默认开启                                    |
| 轮询间隔 / 任务超时    | 5 秒 / 30 分钟                              |

### 图片处理

| 模式        | 适用场景                                                           |
| ----------- | ------------------------------------------------------------------ |
| 同目录      | 图片保存在 Markdown 附件所在目录，使用相对链接；便于本地阅读和编辑 |
| Base64 内联 | 图片写入 Markdown 的 data URI，文件更大，但便于单文件转移          |
| 移除引用    | 只保留文本                                                         |

> [!NOTE]
> 同目录模式会在 Zotero 存储目录中写入额外图片文件，不能依赖 Zotero 附件同步来同步这些图片。需要跨设备使用时，可选择 Base64 内联。

## 开发

```bash
npm start           # 启动 Zotero 调试实例并热重载
npm run build       # 生产构建和 TypeScript 类型检查
npm run lint:check  # Prettier 和 ESLint 检查
npm test            # 在 Zotero 中运行集成测试
```

调试前复制 `.env.example` 为 `.env`，设置 Zotero 可执行文件、独立 profile 和独立数据目录。完整说明见 [开发文档](docs/DEVELOPMENT.md)。

> [!WARNING]
> 必须配置 `ZOTERO_PLUGIN_DATA_DIR` 为专用测试目录，避免调试实例使用真实文献库。

## 已知限制

- 每个条目只处理一个文档，优先 PDF；没有父条目的独立附件会被跳过。
- 取消会停止本地后续处理，无法撤销 MinerU 已接收的任务，相关配额仍可能消耗。
- 没有自动重试或断点续传。
- MinerU 可能缓存同一文件的解析结果，页码范围效果需要以实际输出为准。
- 自动更新依赖维护者发布 Release 及更新清单；仅推送源码不会生成这些文件。

## 致谢

项目基于 [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template)，使用 [zotero-plugin-scaffold](https://github.com/zotero-plugin-dev/zotero-plugin-scaffold) 和 [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit)，文档解析由 MinerU 提供。
