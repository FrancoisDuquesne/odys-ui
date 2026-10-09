# Platform Brief: Odys UI

Context document for designing a platform that lets users visualize, simulate, monitor, and test configurations of energy infrastructure, built on top of the `odys` Python library.

---

## 1. What Odys Is

`odys` (installed version: **0.2.0**, pinned in `backend/pyproject.toml`) is a Python library for **energy portfolio optimization under uncertainty**. Given a portfolio of energy assets and one or more possible futures ("scenarios"), it solves a mixed-integer linear program (MILP) for the lowest-cost (or highest-profit) dispatch schedule across a planning horizon. Stochastic, multi-scenario optimization is a first-class mode, not a bolt-on feature.

The library belongs to a third-party author (github: `ramirocrc/odys`), not this project. It is a dependency, not something this platform controls the roadmap of.

**Core flow:**
```
build assets → bundle into an AssetPortfolio → attach a Scenario (or list of
StochasticScenario) → wrap in an EnergySystem → .optimize() → read an
OptimizationResults object
```

## 2. The Asset Model

### Generator — a dispatchable power source
Required: `name`, `nominal_power` (MW), `variable_cost` ($/MWh).
Optional unit-commitment parameters: `ramp_up`, `ramp_down`, `min_up_time`, `min_down_time`, `min_power`, `startup_cost`, `shutdown_cost`.

These unit-commitment fields mean odys can model real thermal-plant constraints — minimum run/off times, startup costs — not just a simple capacity-and-cost curve. Results expose per-timestep binary `status` (on/off), `startup`, and `shutdown` indicators per generator.

### Storage — battery or pumped hydro
Absolute: `capacity` (MWh), `max_power` (MW).
**Fractional (0–1 of capacity)**: `soc_start`, `soc_end`, `soc_min`, `soc_max`. This is easy to get wrong — they are *not* absolute MWh values.
Also available: `efficiency_charging`, `efficiency_discharging`, `degradation_cost`, `self_discharge_rate`.
Results expose `net_power`, `soc`, and `charge_mode` per timestep.

### Load — electricity demand
`type`: `LoadType.Fixed` (must be met exactly every timestep) or `LoadType.Flexible` (can flex, at a cost) via `variable_cost_to_increase` / `variable_cost_to_decrease`. This supports real demand-response / curtailment modeling, not just a static profile.

### EnergyMarket — an external spot market the portfolio can trade with
`max_trading_volume_per_step`, `trade_direction` (`BUY_ONLY` / `SELL_ONLY` / `BUY_AND_SELL`), `stage_fixed` (whether the trade decision is a shared first-stage commitment across stochastic scenarios, or free to vary per scenario). Results expose `buy_volume` and `sell_volume` per timestep.

## 3. Scenarios and Uncertainty

- **`Scenario`** (deterministic): a single set of time-indexed `load_profiles`, `available_capacity_profiles`, and `market_prices`, each a dict keyed by asset name.
- **`StochasticScenario`**: same shape, plus `name` and `probability`. Pass a list of these to `EnergySystem` and odys solves one MILP that is jointly optimal across all of them, weighted by probability.

## 4. Objective and Risk

`Objective(profit=ProfitTerm(weight), cvar=CVaRTerm(weight, confidence_level) | None)`.

`CVaRTerm` trades expected profit against downside risk exposure — `confidence_level` controls how much of the worst-case tail is penalized. It only has an effect when paired with stochastic scenarios (with a single deterministic scenario there's no distribution to be risk-averse about).

## 5. Solving

`SolverConfig(solver_name, time_limit, mip_rel_gap, presolve, threads, log_output, solver_options)`.

`SolverName`: `HIGHS` (open-source, default), `GUROBI`, `CPLEX`, `SCIP`.

Because generators can carry unit-commitment binaries, problems with those fields populated are true MILPs rather than pure LPs — solve time and `mip_rel_gap` tuning matter more as problem size grows. Commercial solvers (Gurobi, CPLEX) require their own licenses and are not viable on shared cloud infrastructure without a proper license-server setup.

## 6. Results — What Can Be Visualized

`OptimizationResults`, time-indexed (xarray-backed internally), exposes:

| Asset | Fields |
|---|---|
| Generators | `power`, `status` (on/off), `startup`, `shutdown` |
| Storages | `net_power`, `soc`, `charge_mode` |
| Markets | `buy_volume`, `sell_volume` |
| System | `objective_value`, `solver_status`, `termination_condition` |

This is the full set of signals available for dashboards: dispatch stacks, on/off state timelines (useful for a Gantt-style unit-commitment view), SoC curves, market buy/sell flow, and solver diagnostics for debugging infeasible or slow runs.

## 7. Scope Boundaries — What Odys Does Not Do

This matters directly for the "monitor" part of the product brief: **odys is a batch optimizer over a static input, not a live system.** It has no concept of real-time telemetry, streaming data, alerting, or a connection to actual physical infrastructure. Any "monitoring" capability — comparing a past optimized dispatch against what a site actually did, re-running a scenario against updated forecasts, tracking a history of runs over time — has to be designed and built at the platform layer. It is not something odys provides or can be asked to provide.

Also not supported by the library itself:
- AC/DC power flow (network constraints, line limits, voltage)
- Multi-period stochastic trees with recourse (branching decisions across time)
- Real-time data connectors (users bring their own time series)
- Any built-in visualization

## 8. Current Implementation State (this repo)

The v1 single-page proof of concept has been replaced by a persistent, multi-project platform: `backend/` (FastAPI + SQLModel/SQLite) and `frontend/` (Nuxt / Vue, ECharts). See `backend/README.md` for run instructions.

### Backend
- **Persistence:** `Project` (name, client, colour), versioned `PortfolioVersion` and `ScenarioSetVersion` snapshots, immutable `Run` records (objective, solver config, status, results JSON, solve time, optional `rerun_from_run_id`), and `Actuals` (uploaded metered series with MAE vs. a run). Demo data is seeded on first start (`seed.py`).
- **API:** projects, portfolio versions, scenario-set versions (including CSV upload), runs (create / list / get), parameter **sweeps** (`/projects/{id}/sweeps`), and actuals upload (`/runs/{id}/actuals`).
- **Odys coverage (`solver.py`):** all four asset types — `Generator` (including unit-commitment: min power, ramps, min up/down time, startup/shutdown cost), `Storage` (efficiencies, SoC bounds, degradation, self-discharge), `Load` (fixed and flexible), `EnergyMarket` (all trade directions, `stage_fixed`) — plus deterministic and `StochasticScenario` sets, `Objective` with optional `CVaRTerm`, and `SolverConfig` (solver, time limit, MIP gap, presolve, threads).
- **Fixed:** the earlier SoC bug is gone. `soc_start`/`soc_end`/`soc_min`/`soc_max` are validated as fractions in `[0, 1]` in `schemas.py` and passed to odys unchanged.
- **Results serialization:** per-scenario dispatch for generators, storages and markets; per-scenario profit with a breakdown that reconciles to the solved profit; expected profit across scenarios; and CVaR computed platform-side from per-scenario profits.

### Odys 0.2.0 quirks discovered (read from the installed source)
- The objective prices only market sales/purchases, generator `variable_cost`, and generator `startup_cost`. **`shutdown_cost`, storage `degradation_cost`, and flexible-load increase/decrease costs are accepted but not part of the objective.** The UI therefore labels degradation as "not priced by solver".
- There is no per-load decision variable, so flexible-load dispatch/deviation **cannot be read back** from the results.
- Infeasible models raise `OdysError`; these are recorded as runs with status `infeasible` rather than failing the request.

### Frontend (Nuxt)
- Project switcher and a projects index; per-project pages: **portfolio** editor (asset cards + slide-over form), **new run** (portfolio/scenario/objective/solver selection), **runs** list, **run detail**, and **compare**.
- Charts: dispatch stack, energy balance, unit-commitment grid, storage SoC, market flows, profit breakdown, scenario spread, risk frontier (expected profit vs. CVaR), run trend over time, and plan-vs-actual.
- Handles backend-down, loading, empty and error states.

### Not yet built
- Accounts / authentication and multi-user access (projects are not user-scoped).
- Real-time telemetry or automated data ingestion — actuals are manual CSV uploads.
- Alerting or scheduled re-runs against updated forecasts.
- Commercial solver licensing for cloud use (Gurobi / CPLEX).
- Production database (currently SQLite) and background job execution for long MILP solves (runs are synchronous).

## 9. Product Direction

The goal is a platform — not just the current single-run tool — where users can:

- **Configure** a portfolio of energy assets (generators, storage, loads, markets) and save/reuse those configurations
- **Simulate** dispatch under a scenario, or a set of stochastic scenarios with risk preferences (CVaR)
- **Visualize** results: dispatch stacks, unit on/off timelines, SoC curves, market flows, cost/profit breakdowns, and — for stochastic runs — the spread of outcomes across scenarios and the expected-profit/CVaR frontier
- **Test configurations** — run "what if" comparisons between portfolio variants or scenario assumptions, not just a single one-off run
- **Monitor** — in the sense of tracking runs over time, comparing a planned/optimized dispatch to later reality, and revisiting saved projects per client/site — understanding this is a platform-layer concept built around odys's outputs, not a live-telemetry feature of odys itself

Configure, simulate, visualize, compare and plan-vs-actual tracking exist in first form today (Section 8). The main remaining gaps are multi-user accounts, automated actuals ingestion and alerting, scheduled re-runs, and scaling solves beyond synchronous requests.

Related reading in this repo: `RESEARCH.md` covers market segmentation and competitive landscape; some of its library-scope claims (e.g. "no unit commitment") predate this brief and are superseded by Sections 2 and 7 above.
