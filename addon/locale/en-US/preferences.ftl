pref-title = ZotMD — MinerU OCR to Markdown
pref-intro = Adds a Markdown child attachment to each selected item, produced by OCR-ing its PDF (or other attached file) with MinerU. Get an API token at mineru.net.

pref-section-account = MinerU account
pref-token = API token
pref-api-base = API base URL
pref-check-token =
    .label = Check token
pref-token-hint = The token is stored unencrypted in Zotero's preferences, like any other plugin setting.

pref-section-parsing = Parsing
pref-model = Model
pref-model-vlm =
    .label = vlm — best quality, recommended
pref-model-pipeline =
    .label = pipeline — faster, lighter
pref-model-html =
    .label = MinerU-HTML — for HTML sources
pref-language = Document language
pref-is-ocr =
    .label = Force OCR (needed for scanned PDFs with no text layer)
pref-enable-formula =
    .label = Recognize formulas
pref-enable-table =
    .label = Recognize tables
pref-page-ranges = Page range
pref-page-ranges-hint = Optional, e.g. "2,4-6" or "2--2". Leave empty to parse every page. Note that MinerU caches by file, so a page range may be ignored for files it has seen before.

pref-section-output = Output
pref-image-mode = Images
pref-image-folder =
    .label = Keep them next to the .md (relative links, small file)
pref-image-base64 =
    .label = Inline them as base64 (one self-contained file)
pref-image-none =
    .label = Drop image references (text only)
pref-notify =
    .label = Show a system notification when a run finishes, fails or is cancelled
pref-image-mode-hint = "Next to the .md" writes the images into Zotero's storage folder for the attachment, so the Markdown stays small but the images are not synced to other devices.

pref-section-advanced = Advanced
pref-poll-interval = Poll interval (seconds)
pref-timeout = Task timeout (minutes)

pref-help = { $name } { $version } · built { $time }
