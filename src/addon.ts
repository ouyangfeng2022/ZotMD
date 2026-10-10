import { config } from "../package.json";
import { DialogHelper } from "zotero-plugin-toolkit";
import { createApi, AddonApi } from "./api";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    // Build-time environment, injected by the scaffold's esbuild `define`.
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    dialog?: DialogHelper;
  };
  // Lifecycle hooks
  public hooks: typeof hooks;
  // Internal modules, reachable from the console as Zotero.ZotMD.api
  public api: AddonApi;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
    };
    this.hooks = hooks;
    this.api = createApi();
  }
}

export default Addon;
