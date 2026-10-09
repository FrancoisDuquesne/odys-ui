import type { Asset } from "~/types";

// Default colour per asset kind, used when an asset has no colour of its own.
export const ASSET_DEFAULT_COLOR: Record<Asset["kind"], string> = {
  generator: "#0d9488",
  storage: "#a855f7",
  load: "#475569",
  market: "#4f46e5",
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
  storageDischarge: "#a855f7",
  storageCharge: "#e9b3f7",
  marketBuy: "#6366f1",
  marketSell: "#b4bcfa",
  price: "#6b7280",
  tail: "#ef4444",
  neutral: "#94a3b8",
  good: "#16a34a",
  planned: "#6366f1",
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
