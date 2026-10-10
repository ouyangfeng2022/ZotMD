// MinerU API credentials
pref("apiToken", "");
pref("apiBase", "https://mineru.net");

// Parsing options (see https://mineru.net/apiManage/docs)
// modelVersion: "pipeline" | "vlm" | "MinerU-HTML"
pref("modelVersion", "vlm");
// language: "ch" | "ch_server" | "en" | "japan" | "korean" | "chinese_cht" | ...
pref("language", "ch");
pref("isOcr", true);
pref("enableFormula", true);
pref("enableTable", true);
// Optional page range, e.g. "2,4-6" or "2--2". Empty means all pages.
pref("pageRanges", "");

// How images referenced by the Markdown are stored.
// "folder" = keep them next to the .md inside Zotero storage, linked relatively
// "base64" = inline them into the .md as data: URIs (self-contained, larger)
// "none"   = drop image references
pref("mdImageMode", "folder");

// Desktop notification when a run finishes, fails or is cancelled.
pref("notifyOnComplete", true);

// Polling / timeout. Kept as strings because Zotero's preference pane binding
// writes every non-checkbox value as a string.
pref("pollIntervalSec", "5");
pref("taskTimeoutMin", "30");
