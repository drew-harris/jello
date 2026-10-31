import { Plugin } from "@opencode/plugin/gui";
import { definition } from "./gui/definition";
import { setup } from "./gui/window";

// The "./gui-experimental" entry. Windows run `setup`; the Electron main process runs `main`.
export default Plugin.define({ ...definition, setup });
