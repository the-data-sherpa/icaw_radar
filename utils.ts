import { createDefine } from "fresh";
import type { AppConfig } from "@/lib/config-loader.ts";

export interface State {
  config?: AppConfig;
}

export const define = createDefine<State>();
