import { AmocrmProViewerSource } from "./amocrmPro";
import { FixtureSource } from "./fixtures/fixtureSource";
import { HybridSource } from "./hybridSource";
import type { ActivitySource, DataMode } from "./source";

export const DATA_MODE: DataMode = __DATA_MODE__;

export function createSource(viewKey: string, mode: DataMode = DATA_MODE): ActivitySource {
  if (mode === "fixtures") return new FixtureSource();
  if (mode === "hybrid") return new HybridSource(viewKey);
  return new AmocrmProViewerSource(viewKey);
}

export type { ActivitySource, DataMode } from "./source";
