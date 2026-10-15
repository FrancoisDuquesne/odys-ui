import type { Asset } from "~/types";

// Default colour per asset kind, used when an asset has no colour of its own.
export const ASSET_DEFAULT_COLOR: Record<Asset["kind"], string> = {
  generator: "#5f9a80",
  storage: "#e07a5f",
  load: "#676a82",
  market: "#e9b45e",
};

export const ASSET_KIND_LABEL: Record<Asset["kind"], string> = {
  generator: "Generator",
  storage: "Storage",
  load: "Load",
  market: "Market",
};

export const ASSET_KIND_ICON: Record<Asset["kind"], string> = {
  generator: "i-lucide-zap",
  storage: "i-lucide-battery",
  load: "i-lucide-plug",
  market: "i-lucide-trending-up",
};

// Derived dispatch series have fixed semantics everywhere in the app.
export const SERIES = {
  // Each role has its own hue (above-zero pair: green/blue, below-zero pair: pink/amber) so pairs stay distinguishable
  // for colour-blind readers and on both light and dark surfaces.
  storageDischarge: "#5f9a80", // green
  storageCharge: "#e07a5f", // pink
  marketBuy: "#6a70a8", // blue
  marketSell: "#e9b45e", // amber
  price: "#8a94a6",
  tail: "#ef4444",
  neutral: "#94a3b8",
  good: "#16a34a",
  planned: "#6a70a8",
} as const;

export function assetColorMap(assets: Asset[] | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of assets ?? []) out[a.name] = a.color || ASSET_DEFAULT_COLOR[a.kind];
  return out;
}

export type StatusMeta = { label: string; color: "success" | "warning" | "error" | "neutral"; icon: string };

export const RUN_STATUS: Record<string, StatusMeta> = {
  optimal: { label: "Optimal", color: "success", icon: "i-lucide-circle-check" },
  time_limit: { label: "Time limit", color: "warning", icon: "i-lucide-timer" },
  infeasible: { label: "Infeasible", color: "error", icon: "i-lucide-circle-x" },
  error: { label: "Error", color: "error", icon: "i-lucide-circle-alert" },
};

export const runStatus = (s: string): StatusMeta => RUN_STATUS[s] ?? { label: s, color: "neutral", icon: "i-lucide-circle-dashed" };
export const hasResults = (status: string) => status === "optimal" || status === "time_limit";
