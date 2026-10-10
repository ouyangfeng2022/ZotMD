# 开发与测试

### 安装依赖（重要）

如果你的用户级 `~/.npmrc` 里设置了 `allow-scripts`，npm 11.17 会在准备 git 依赖时挂掉：

```
npm error code EALLOWSCRIPTS
npm error --allow-scripts is not allowed in project-scoped installs.
```

这是 npm 把用户级 `allow-scripts` 透传给 git 依赖的子安装进程导致的。项目里放了一个空的 `.npmrc.install` 用来绕开：

```bash
npm install --userconfig=.npmrc.install
```

一劳永逸的办法是把 `allow-scripts` 从 `~/.npmrc` 里去掉——它对 npm 来说本来也没意义（`allow-scripts` 期望的是包名列表，不是 `pnpm`）。

### 配置调试环境

```bash
cp .env.example .env
```

然后填 `.env`：

```
ZOTERO_PLUGIN_ZOTERO_BIN_PATH = D:\\Program Files\\Zotero\\zotero.exe
ZOTERO_PLUGIN_PROFILE_PATH = D:\\coding\\TypeScript\\ZotMD\\.scaffold\\profile
ZOTERO_PLUGIN_DATA_DIR = D:\\coding\\TypeScript\\ZotMD\\.scaffold\\data
```

> [!WARNING]
> `ZOTERO_PLUGIN_DATA_DIR` **必须填**。留空时脚手架不会传 `--dataDir`，Zotero 会退回默认数据目录（`~/Zotero`），调试实例就会直接写你的真实文献库。

### 常用命令

```bash
npm start        # 拉起带插件的 Zotero 调试实例，改代码热重载
npm run build    # 构建 + 类型检查，产物在 .scaffold/build（含 .xpi）
npm test         # 在真实 Zotero 里跑测试
npm run lint:fix # prettier + eslint
```

`npm test` 会用一个临时 profile 和数据目录启动 Zotero，跑完不会自动退出——需要手动关掉那个实例（只关 `.scaffold\test\profile` 的那个，别关你自己的 Zotero）。

## 代码结构

```
src/
  hooks.ts               启动/窗口生命周期，注册菜单与设置面板
  api.ts                 内部模块挂到 Zotero.ZotMD.api，方便控制台调试
  modules/
    mineru.ts            MinerU API 客户端（批量上传、轮询、下载、响应解析）
    ocrTask.ts           编排 + RunHandle 取消状态机
    attachment.ts        创建 Markdown 附件、图片链接改写、文件名清洗
    menu.ts              条目右键菜单
    preferenceScript.ts  设置面板逻辑（Token 校验）
  utils/
    http.ts              原生 XHR 封装
    notify.ts            系统通知（nsIAlertsService）
    xpcom.ts             防御式获取 Components
    zip.ts               用 nsIZipReader 解压
addon/
  manifest.json  prefs.js  bootstrap.js
  content/preferences.xhtml  设置面板界面
  locale/{en-US,zh-CN}/      界面文案
test/                    在 Zotero 内运行的 mocha 测试
```

### 几个值得记下的实现细节

- **不用 `Zotero.HTTP.request`**：只要请求带 body，它就会强制加上 `Content-Type: application/x-www-form-urlencoded`，而 MinerU 给的上传链接是阿里云 OSS 签名 URL，多一个 Content-Type 会让签名对不上。所以 `utils/http.ts` 直接用原生 XHR，上传时不带 Content-Type。
- **MinerU 的错误响应和文档不一致**：文档写的是 `code` / `trace_id`，但网关在鉴权失败时返回的是 `msgCode` / `traceId`（camelCase）加 HTTP 401。`parseResponse()` 两种都认。
- **取消靠拦截 ProgressWindow 的 `close`**：`close` 是每个 `Zotero.ProgressWindow` 实例的自有方法，`RunHandle.attach()` 把它包一层——运行中任何关闭（点击、主窗口关闭）都算取消请求，`settle()` 之后（任务已结束）的自动关闭不算。
- **系统通知走 XPCOM 合同 ID 而不是 `Services.alerts`**：插件沙箱里被注入的 `Services` 在 Zotero 10 上不含 `alerts`，直接 `Components.classes["@mozilla.org/system-alerts-service;1"]` 取才稳。

## 测试

`npm test` 在真实 Zotero 里跑，覆盖：

- 插件加载、右键菜单注册、设置面板注册、偏好默认值
- 图片链接改写（folder / base64 / none，以及外链、`data:` URI 不被误改）
- MinerU 响应解析（成功、网关鉴权错误、数字错误码、非 JSON 响应）
- ZIP 解压往返 + 路径穿越防护
- 真实创建 Markdown 附件，并验证图片确实写到了 `.md` 旁边
- 取消：关闭窗口 → 请求取消、settle 后关闭不算、检查点抛错、对真实 ProgressWindow 打补丁生效
- 通知：参数传递、无服务/服务抛错时静默降级、默认路径能真拿到平台通知服务

注意：跑测试会真的弹一条系统通知（验证默认路径用），通知名固定所以不会堆叠。
