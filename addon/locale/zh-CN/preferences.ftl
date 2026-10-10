pref-title = ZotMD — 用 MinerU OCR 生成 Markdown
pref-intro = 为每个选中条目添加一个 Markdown 子附件：先用 MinerU 对其 PDF（或其他附件文件）做 OCR，再把结果保存为 Markdown。API Token 请在 mineru.net 申请。

pref-section-account = MinerU 账号
pref-token = API Token
pref-api-base = API 地址
pref-check-token =
    .label = 校验 Token
pref-token-hint = Token 与其他插件设置一样，以明文保存在 Zotero 的偏好设置中。

pref-section-parsing = 解析选项
pref-model = 模型
pref-model-vlm =
    .label = vlm — 效果最好，推荐
pref-model-pipeline =
    .label = pipeline — 更快、更轻量
pref-model-html =
    .label = MinerU-HTML — 用于 HTML 来源
pref-language = 文档语言
pref-is-ocr =
    .label = 强制 OCR（扫描版无文字层的 PDF 需要勾选）
pref-enable-formula =
    .label = 识别公式
pref-enable-table =
    .label = 识别表格
pref-page-ranges = 页码范围
pref-page-ranges-hint = 可选，例如 "2,4-6" 或 "2--2"。留空表示解析全部页面。注意 MinerU 按文件缓存，对已解析过的文件页码范围可能不生效。

pref-section-output = 输出
pref-image-mode = 图片
pref-image-folder =
    .label = 与 .md 放在同一目录（相对链接，文件小）
pref-image-base64 =
    .label = 以 base64 内联（单文件自包含）
pref-image-none =
    .label = 丢弃图片引用（仅文本）
pref-notify =
    .label = 任务完成、失败或取消时发送系统通知
pref-image-mode-hint = "与 .md 放在同一目录"会把图片写入该附件在 Zotero 存储目录中的同一文件夹，Markdown 保持精简，但这些图片不会同步到其他设备。

pref-section-advanced = 高级
pref-poll-interval = 轮询间隔（秒）
pref-timeout = 任务超时（分钟）

pref-help = { $name } { $version } · 构建于 { $time }
