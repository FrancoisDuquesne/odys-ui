import type { Asset } from "~/types";

/** A small, realistic starter portfolio (mirrors the backend demo project). */
export function exampleAssets(): Asset[] {
  return [
    { kind: "generator", name: "Wind 1", nominal_power: 120, variable_cost: 2, unit_commitment: false, min_power: 0, ramp_up: null, ramp_down: null, min_up_time: 1, min_down_time: 1, startup_cost: 0, shutdown_cost: null, color: "#81b29a" },
    { kind: "generator", name: "CCGT 1", nominal_power: 300, variable_cost: 38, unit_commitment: true, min_power: 150, ramp_up: 100, ramp_down: 100, min_up_time: 4, min_down_time: 3, startup_cost: 12000, shutdown_cost: null, color: "#e9b45e" },
    { kind: "storage", name: "BESS 1", capacity: 200, max_power: 50, soc_start: 0.5, soc_end: 0.5, soc_min: 0.1, soc_max: 0.95, efficiency_charging: 0.95, efficiency_discharging: 0.95, degradation_cost: 3, self_discharge_rate: null, color: "#6a70a8" },
    { kind: "load", name: "Site demand", type: "fixed", variable_cost_to_increase: null, variable_cost_to_decrease: null, color: "#8d90a8" },
    { kind: "market", name: "Day Ahead", max_trading_volume_per_step: 150, trade_direction: "buy_and_sell", stage_fixed: true, color: "#b5b8d6" },
  ] as Asset[];
}
