import type { Run, ScenarioSet, RunResults } from "~/types";

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Long-format dispatch table: one row per scenario x timestep x asset x variable. */
export function dispatchCsv(results: RunResults, stepHours: number): string {
  const rows: (string | number)[][] = [["scenario", "step", "time", "asset_type", "asset", "variable", "value"]];
  for (const [scenario, res] of Object.entries(results.by_scenario)) {
    const groups = [
      ["generator", res.generators],
      ["storage", res.storages],
      ["market", res.markets],
    ] as const;
    for (const [type, assets] of groups) {
      for (const [asset, vars] of Object.entries(assets)) {
        for (const [variable, series] of Object.entries(vars)) {
          series.forEach((value, i) => rows.push([scenario, i, stepTimeLabel(i, stepHours), type, asset, variable, +value.toFixed(6)]));
        }
      }
    }
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface Verdict {
  /** Short headline, e.g. "Meets demand". */
  headline: string;
  /** Plain-language sentence for the whole run. */
  sentence: string;
  isCost: boolean;
  /** Net result as a positive magnitude plus its label. */
  resultLabel: string;
  importShare: number | null;
  startups: number;
}

/** Probability-weighted figures across scenarios. */
export function buildVerdict(run: Run, set: ScenarioSet | null): Verdict | null {
  const res = run.results;
  if (!res) return null;
  const h = set?.timestep_hours ?? 1;
  const names = Object.keys(res.by_scenario);
  let imports = 0;
  let supply = 0;
  let startups = 0;
  for (const n of names) {
    const p = res.probabilities?.[n] ?? 1 / names.length;
    const s = res.by_scenario[n]!;
    const gen = Object.values(s.generators).reduce((a, g) => a + sum(g.power) * h, 0);
    const dis = Object.values(s.storages).reduce((a, g) => a + sum(g.net_power.map((v) => Math.max(0, v))) * h, 0);
    const buy = Object.values(s.markets).reduce((a, g) => a + sum(g.buy_volume) * h, 0);
    imports += p * buy;
    supply += p * (gen + dis + buy);
    startups += p * Object.values(s.generators).reduce((a, g) => a + g.startup.filter((v) => v > 0.5).length, 0);
  }
  const importShare = supply > 0 ? imports / supply : null;
  const startupN = Math.round(startups);
  const profit = res.expected_profit;
  const isCost = profit < 0;
  const money = fmtMoney(Math.abs(profit));
  const parts = [
    isCost ? `Meets demand for ${money} net cost` : `Meets demand with ${money} net profit`,
    importShare !== null && importShare > 0.005 ? `buys ${fmtPct(importShare)} of its energy from the market` : "needs no market purchases",
    startupN === 0 ? "no generator starts" : `${startupN} generator start${startupN === 1 ? "" : "s"}`,
  ];
  const sentence = `${res.stochastic ? "On average, " : ""}${res.stochastic ? parts[0]!.replace(/^M/, "m") : parts[0]}; ${parts[1]}; ${parts[2]}.`;
  return {
    headline: parts[0]!,
    sentence,
    isCost,
    resultLabel: isCost ? "Net cost" : "Profit",
    importShare,
    startups: startupN,
  };
}
