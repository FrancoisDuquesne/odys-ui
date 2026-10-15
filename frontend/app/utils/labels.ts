// Human-readable labels for odys field names. Raw names belong in tooltips or
// "Advanced" disclosures only.

export const TRADE_DIRECTION_LABEL: Record<string, string> = {
  buy: "Buy only",
  sell: "Sell only",
  buy_and_sell: "Buy and sell",
};

export const LOAD_TYPE_LABEL: Record<string, string> = {
  fixed: "Fixed",
  flexible: "Flexible",
};

export const SOLVER_LABEL: Record<string, string> = {
  highs: "HiGHS",
  scip: "SCIP",
  gurobi: "Gurobi",
  cplex: "CPLEX",
};

/** Field name -> { label, tip } where tip carries the raw odys name. */
export const FIELD_LABEL: Record<string, { label: string; tip: string }> = {
  stage_fixed: { label: "Commit before scenarios are known", tip: "odys: stage_fixed" },
  min_power: { label: "Minimum output", tip: "odys: min_power" },
  nominal_power: { label: "Rated power", tip: "odys: nominal_power" },
  soc: { label: "Charge limits", tip: "odys: soc_min / soc_max" },
  cvar: { label: "Downside-risk weight", tip: "odys: CVaRTerm.weight" },
  unit_commitment: { label: "On/off scheduling", tip: "odys: unit_commitment" },
};

/** "Charge limits 10–95%" for a storage asset's soc window. */
export const fmtChargeLimits = (min: number, max: number) => `Charge limits ${Math.round(min * 100)}–${Math.round(max * 100)}%`;

export const tradeDirectionLabel = (d: string) => TRADE_DIRECTION_LABEL[d] ?? d;
