// Mirrors backend/src/odys_ui/schemas.py and db_models.py.

export type AssetKind = "generator" | "storage" | "load" | "market";

export interface GeneratorAsset {
  kind: "generator";
  name: string;
  nominal_power: number;
  variable_cost: number;
  unit_commitment: boolean;
  min_power: number;
  ramp_up: number | null;
  ramp_down: number | null;
  min_up_time: number;
  min_down_time: number;
  startup_cost: number;
  shutdown_cost: number | null;
  color: string | null;
}

export interface StorageAsset {
  kind: "storage";
  name: string;
  capacity: number;
  max_power: number;
  soc_start: number;
  soc_end: number | null;
  soc_min: number;
  soc_max: number;
  efficiency_charging: number;
  efficiency_discharging: number;
  degradation_cost: number | null;
  self_discharge_rate: number | null;
  color: string | null;
}

export interface LoadAsset {
  kind: "load";
  name: string;
  type: "fixed" | "flexible";
  variable_cost_to_increase: number | null;
  variable_cost_to_decrease: number | null;
  color: string | null;
}

export interface MarketAsset {
  kind: "market";
  name: string;
  max_trading_volume_per_step: number;
  trade_direction: "buy" | "sell" | "buy_and_sell";
  stage_fixed: boolean;
  color: string | null;
}

export type Asset = GeneratorAsset | StorageAsset | LoadAsset | MarketAsset;

export interface Project {
  id: number;
  name: string;
  client: string;
  color: string;
  created_at: string;
  asset_summary: string;
  portfolio_count: number;
  scenario_set_count: number;
  run_count: number;
  last_run_at: string | null;
  last_objective_value: number | null;
}

export interface PortfolioVersion {
  id: number;
  project_id: number;
  name: string;
  version: number;
  assets: Asset[];
  created_at: string;
  run_count: number;
}

export interface ScenarioDef {
  name: string;
  probability: number;
  load_profiles: Record<string, number[]>;
  available_capacity_profiles: Record<string, number[]>;
  market_prices: Record<string, number[]>;
}

export interface ScenarioSet {
  id: number;
  project_id: number;
  name: string;
  version: number;
  mode: "deterministic" | "stochastic";
  number_of_steps: number;
  timestep_hours: number;
  scenarios: ScenarioDef[];
  created_at: string;
}

export interface CVaRConfig {
  weight: number;
  confidence_level: number;
}

export interface ObjectiveConfig {
  profit_weight: number;
  cvar: CVaRConfig | null;
}

export interface SolverConfig {
  solver_name: "highs" | "gurobi" | "cplex" | "scip";
  time_limit: number | null;
  mip_rel_gap: number | null;
  threads: number | null;
  presolve: boolean;
}

export interface AssetDispatch {
  [variable: string]: number[];
}

export interface ScenarioResults {
  generators: Record<string, AssetDispatch>;
  storages: Record<string, AssetDispatch>;
  markets: Record<string, AssetDispatch>;
  profit: number;
  profit_breakdown: {
    rows: { label: string; formula: string; value: number; priced: boolean }[];
    total: number;
  };
}

export interface RunResults {
  number_of_steps: number;
  stochastic: boolean;
  scenarios: { name: string; probability: number }[];
  by_scenario: Record<string, ScenarioResults>;
  expected_profit: number;
  profit_by_scenario: Record<string, number>;
  probabilities: Record<string, number>;
  cvar: number | null;
}

export interface Run {
  id: number;
  display_id: string;
  project_id: number;
  portfolio_version_id: number;
  scenario_set_version_id: number;
  objective: ObjectiveConfig;
  solver: SolverConfig;
  status: string;
  solver_status: string | null;
  termination_condition: string | null;
  objective_value: number | null;
  solve_time_seconds: number | null;
  error_message: string | null;
  results: RunResults | null;
  rerun_from_run_id: number | null;
  created_at: string;
}
