"""Builds odys EnergySystem objects from stored configuration, solves them, and
serializes OptimalDisptachResults into plain JSON for storage/API responses.

Ground truth for everything in this file was read directly from the installed
odys 0.2.0 source (backend/.venv/.../site-packages/odys/), not guessed:
- odys.optimization.model.objectives._profit_expr: per-scenario profit is
  exactly (sell-buy)*price summed over markets, minus
  (power*variable_cost + startup*startup_cost) summed over generators.
  shutdown_cost, storage degradation_cost and flexible-load costs are NOT
  part of the objective in 0.2.0 even though the fields exist on the
  entities -- so the profit breakdown below only prices what odys actually
  prices, and reconciles exactly to the solved profit.
- odys.optimization.model.variables.ModelVariable: there is no per-load
  decision variable at all (no ModelDimension.Loads variable), so flexible
  load dispatch/deviation cannot be read back from OptimalDisptachResults.
"""

from __future__ import annotations

import time
from datetime import timedelta
from typing import Any

import pandas as pd

from odys import (
    AssetPortfolio,
    CVaRTerm,
    EnergyMarket,
    EnergySystem,
    Generator,
    Load,
    LoadType,
    Objective,
    ProfitTerm,
    Scenario,
    SolverConfig,
    SolverName,
    StochasticScenario,
    Storage,
    TradeDirection,
)
from odys.domain.exceptions import OdysError
from odys.results.optimization_results import OptimalDisptachResults

from odys_ui.db_models import PortfolioVersion, ScenarioSetVersion

# ---------------------------------------------------------------------------
# Building odys objects from stored JSON
# ---------------------------------------------------------------------------


def _build_generator(asset: dict[str, Any]) -> Generator:
    return Generator(
        name=asset["name"],
        nominal_power=float(asset["nominal_power"]),
        variable_cost=float(asset["variable_cost"]),
        min_power=float(asset.get("min_power") or 0.0),
        ramp_up=(float(asset["ramp_up"]) if asset.get("ramp_up") is not None else None),
        ramp_down=(float(asset["ramp_down"]) if asset.get("ramp_down") is not None else None),
        min_up_time=int(asset.get("min_up_time") or 1),
        min_down_time=int(asset.get("min_down_time") or 1),
        startup_cost=float(asset.get("startup_cost") or 0.0),
        shutdown_cost=(float(asset["shutdown_cost"]) if asset.get("shutdown_cost") is not None else None),
    )


def _build_storage(asset: dict[str, Any]) -> Storage:
    return Storage(
        name=asset["name"],
        capacity=float(asset["capacity"]),
        max_power=float(asset["max_power"]),
        soc_start=float(asset.get("soc_start", 0.5)),
        soc_end=(float(asset["soc_end"]) if asset.get("soc_end") is not None else None),
        soc_min=float(asset.get("soc_min", 0.0)),
        soc_max=float(asset.get("soc_max", 1.0)),
        efficiency_charging=float(asset.get("efficiency_charging", 1.0)),
        efficiency_discharging=float(asset.get("efficiency_discharging", 1.0)),
        degradation_cost=(float(asset["degradation_cost"]) if asset.get("degradation_cost") is not None else None),
        self_discharge_rate=(
            float(asset["self_discharge_rate"]) if asset.get("self_discharge_rate") is not None else None
        ),
    )


def _build_load(asset: dict[str, Any]) -> Load:
    load_type = LoadType.Flexible if asset.get("type") == "flexible" else LoadType.Fixed
    return Load(
        name=asset["name"],
        type=load_type,
        variable_cost_to_increase=(
            float(asset["variable_cost_to_increase"]) if asset.get("variable_cost_to_increase") is not None else None
        ),
        variable_cost_to_decrease=(
            float(asset["variable_cost_to_decrease"]) if asset.get("variable_cost_to_decrease") is not None else None
        ),
    )


_DIRECTION_MAP = {
    "buy": TradeDirection.BUY_ONLY,
    "sell": TradeDirection.SELL_ONLY,
    "buy_and_sell": TradeDirection.BUY_AND_SELL,
}


def _build_market(asset: dict[str, Any]) -> EnergyMarket:
    return EnergyMarket(
        name=asset["name"],
        max_trading_volume_per_step=float(asset["max_trading_volume_per_step"]),
        trade_direction=_DIRECTION_MAP[asset.get("trade_direction", "buy_and_sell")],
        stage_fixed=bool(asset.get("stage_fixed", False)),
    )


def build_portfolio_and_markets(assets: list[dict[str, Any]]) -> tuple[AssetPortfolio, list[EnergyMarket]]:
    portfolio_assets = []
    markets: list[EnergyMarket] = []
    for asset in assets:
        kind = asset["kind"]
        if kind == "generator":
            portfolio_assets.append(_build_generator(asset))
        elif kind == "storage":
            portfolio_assets.append(_build_storage(asset))
        elif kind == "load":
            portfolio_assets.append(_build_load(asset))
        elif kind == "market":
            markets.append(_build_market(asset))
        else:
            msg = f"Unknown asset kind: {kind}"
            raise ValueError(msg)
    return AssetPortfolio(assets=portfolio_assets), markets


def _profile_or_none(d: dict[str, list[float]] | None) -> dict[str, list[float]] | None:
    return d if d else None


def _build_scenario_obj(scenario: dict[str, Any], *, stochastic: bool) -> Scenario | StochasticScenario:
    kwargs: dict[str, Any] = {
        "available_capacity_profiles": _profile_or_none(scenario.get("available_capacity_profiles")),
        "load_profiles": _profile_or_none(scenario.get("load_profiles")),
        "market_prices": _profile_or_none(scenario.get("market_prices")),
    }
    if stochastic:
        return StochasticScenario(name=scenario["name"], probability=float(scenario["probability"]), **kwargs)
    return Scenario(**kwargs)


def build_scenarios(scenario_set: ScenarioSetVersion) -> Scenario | list[StochasticScenario]:
    stochastic = scenario_set.mode == "stochastic"
    built = [_build_scenario_obj(s, stochastic=stochastic) for s in scenario_set.scenarios]
    if not stochastic:
        return built[0] if built else Scenario()

    # Normalize tiny floating point drift so odys's exact-sum-to-1.0 check passes.
    total = sum(s.probability for s in built)
    if built and abs(total - 1.0) > 1e-9:
        last = built[-1]
        residual = round(1.0 - (total - last.probability), 10)
        built[-1] = last.model_copy(update={"probability": residual})
    return built


def build_objective(profit_weight: float, cvar: dict[str, Any] | None) -> Objective:
    cvar_term = None
    if cvar:
        cvar_term = CVaRTerm(weight=float(cvar["weight"]), confidence_level=float(cvar["confidence_level"]))
    return Objective(profit=ProfitTerm(weight=float(profit_weight)), cvar=cvar_term)


def build_solver_config(solver: dict[str, Any]) -> SolverConfig:
    return SolverConfig(
        solver_name=SolverName(solver.get("solver_name", "highs")),
        time_limit=solver.get("time_limit"),
        mip_rel_gap=solver.get("mip_rel_gap"),
        presolve=bool(solver.get("presolve", False)),
        threads=solver.get("threads"),
    )


# ---------------------------------------------------------------------------
# Serializing results back to plain JSON
# ---------------------------------------------------------------------------


def _asset_series(
    series: pd.Series,
    scenario_name: str | None,
    asset_dim: str,
    asset_name: str,
    number_of_steps: int,
) -> list[float]:
    s = series
    if scenario_name is not None and "scenario" in s.index.names:
        s = s.xs(scenario_name, level="scenario")
    s = s.xs(asset_name, level=asset_dim)
    s = s.reindex([str(i) for i in range(number_of_steps)])
    return [float(v) for v in s.to_numpy()]


def _generator_dispatch(results: OptimalDisptachResults) -> dict[str, pd.Series] | None:
    try:
        g = results.generators
    except Exception:  # noqa: BLE001 - OdysNoResultsError when no generators
        return None
    return {
        "power": g.power,
        "status": g.status,
        "startup": g.startup,
        "shutdown": g.shutdown,
    }


def _storage_dispatch(results: OptimalDisptachResults) -> dict[str, pd.Series] | None:
    try:
        s = results.storages
    except Exception:  # noqa: BLE001
        return None
    return {"net_power": s.net_power, "soc": s.soc, "charge_mode": s.charge_mode}


def _market_dispatch(results: OptimalDisptachResults) -> dict[str, pd.Series] | None:
    try:
        m = results.markets
    except Exception:  # noqa: BLE001
        return None
    return {"buy_volume": m.buy_volume, "sell_volume": m.sell_volume}


def compute_cvar(profit_by_scenario: dict[str, float], probabilities: dict[str, float], confidence_level: float) -> float:
    """Discrete CVaR of profit at the given confidence level (Rockafellar-Uryasev tail mean)."""
    pairs = sorted(
        ((profit_by_scenario[name], probabilities[name]) for name in profit_by_scenario),
        key=lambda pair: pair[0],
    )
    if not pairs:
        return 0.0
    tail_mass_target = 1 - confidence_level
    remaining = tail_mass_target
    weighted_sum = 0.0
    collected = 0.0
    for profit, prob in pairs:
        if remaining <= 1e-12:
            break
        take = min(prob, remaining)
        weighted_sum += profit * take
        collected += take
        remaining -= take
    if collected <= 1e-12:
        return pairs[0][0]
    return weighted_sum / collected


def serialize_results(
    results: OptimalDisptachResults,
    portfolio_version: PortfolioVersion,
    scenario_set: ScenarioSetVersion,
    markets: list[EnergyMarket],
) -> dict[str, Any]:
    n = scenario_set.number_of_steps
    stochastic = scenario_set.mode == "stochastic"
    scenario_names = [s["name"] for s in scenario_set.scenarios] or ["Base"]
    probabilities = {
        s["name"]: float(s.get("probability", 1.0)) for s in scenario_set.scenarios
    } or {"Base": 1.0}

    gen_assets = {a["name"]: a for a in portfolio_version.assets if a["kind"] == "generator"}
    market_assets = {m.name: m for m in markets}

    gen_d = _generator_dispatch(results)
    sto_d = _storage_dispatch(results)
    mkt_d = _market_dispatch(results)

    by_scenario: dict[str, Any] = {}
    profit_by_scenario: dict[str, float] = {}

    for scenario in scenario_set.scenarios or [{"name": "Base", "probability": 1.0}]:
        sname = scenario["name"]
        prices = scenario.get("market_prices") or {}

        generators: dict[str, dict[str, list[float]]] = {}
        if gen_d is not None:
            for gname in gen_assets:
                generators[gname] = {
                    var: _asset_series(series, sname, "generator", gname, n) for var, series in gen_d.items()
                }

        storages: dict[str, dict[str, list[float]]] = {}
        if sto_d is not None:
            storage_names = {a["name"] for a in portfolio_version.assets if a["kind"] == "storage"}
            for stname in storage_names:
                storages[stname] = {
                    var: _asset_series(series, sname, "storage", stname, n) for var, series in sto_d.items()
                }

        markets_out: dict[str, dict[str, list[float]]] = {}
        if mkt_d is not None:
            for mname in market_assets:
                markets_out[mname] = {
                    var: _asset_series(series, sname, "market", mname, n) for var, series in mkt_d.items()
                }

        # ---- profit breakdown: priced rows reconcile exactly to odys's own
        # per-scenario profit (see module docstring for the verified formula).
        rows: list[dict[str, Any]] = []
        market_sales = 0.0
        market_purchases = 0.0
        for mname, series in markets_out.items():
            price = prices.get(mname) or [0.0] * n
            sell = series["sell_volume"]
            buy = series["buy_volume"]
            sales = sum(v * p for v, p in zip(sell, price, strict=False))
            purchases = sum(v * p for v, p in zip(buy, price, strict=False))
            market_sales += sales
            market_purchases += purchases
            rows.append({"label": f"{mname} sales", "formula": "Σₜ sell_volume · price", "value": sales, "priced": True})
            rows.append(
                {"label": f"{mname} purchases", "formula": "Σₜ buy_volume · price", "value": -purchases, "priced": True},
            )

        fuel_total = 0.0
        startup_total = 0.0
        for gname, series in generators.items():
            cost = float(gen_assets[gname]["variable_cost"])
            fuel = sum(p * cost for p in series["power"])
            fuel_total += fuel
            rows.append(
                {"label": f"{gname} fuel", "formula": f"Σₜ power · {cost:g}", "value": -fuel, "priced": True},
            )
            startup_cost = float(gen_assets[gname].get("startup_cost") or 0.0)
            if startup_cost > 0:
                startups = sum(series["startup"])
                startup_val = startups * startup_cost
                startup_total += startup_val
                rows.append(
                    {
                        "label": f"{gname} startups",
                        "formula": f"Σ startup · {startup_cost:g}",
                        "value": -startup_val,
                        "priced": True,
                    },
                )

        profit = market_sales - market_purchases - fuel_total - startup_total

        # Informational-only rows: odys accepts these fields but does not
        # price them in the objective (verified against objectives.py).
        storage_assets = {a["name"]: a for a in portfolio_version.assets if a["kind"] == "storage"}
        for stname, series in storages.items():
            deg_cost = float(storage_assets[stname].get("degradation_cost") or 0.0)
            if deg_cost > 0:
                deg_value = sum(abs(v) for v in series["net_power"]) * deg_cost
                rows.append(
                    {
                        "label": f"{stname} degradation (not priced by solver)",
                        "formula": "Σₜ |net_power| · cost",
                        "value": -deg_value,
                        "priced": False,
                    },
                )

        profit_by_scenario[sname] = profit
        by_scenario[sname] = {
            "generators": generators,
            "storages": storages,
            "markets": markets_out,
            "profit": profit,
            "profit_breakdown": {"rows": rows, "total": profit},
        }

    expected_profit = sum(profit_by_scenario[s] * probabilities.get(s, 0.0) for s in profit_by_scenario)

    return {
        "number_of_steps": n,
        "stochastic": stochastic,
        "scenarios": [{"name": s, "probability": probabilities.get(s, 1.0)} for s in profit_by_scenario],
        "by_scenario": by_scenario,
        "expected_profit": expected_profit,
        "profit_by_scenario": profit_by_scenario,
        "probabilities": probabilities,
    }


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


class RunResult:
    def __init__(self) -> None:
        self.status: str = "error"
        self.solver_status: str | None = None
        self.termination_condition: str | None = None
        self.objective_value: float | None = None
        self.solve_time_seconds: float | None = None
        self.error_message: str | None = None
        self.results: dict[str, Any] | None = None


def run_optimization(
    portfolio_version: PortfolioVersion,
    scenario_set: ScenarioSetVersion,
    objective: dict[str, Any],
    solver: dict[str, Any],
) -> RunResult:
    out = RunResult()
    start = time.monotonic()
    try:
        portfolio, markets = build_portfolio_and_markets(portfolio_version.assets)
        scenarios = build_scenarios(scenario_set)
        system = EnergySystem(
            portfolio=portfolio,
            timestep=timedelta(hours=scenario_set.timestep_hours),
            number_of_steps=scenario_set.number_of_steps,
            objective=build_objective(objective.get("profit_weight", 1.0), objective.get("cvar")),
            markets=markets or None,
            scenarios=scenarios,
        )
        results = system.optimize(solver_config=build_solver_config(solver))
    except OdysError as exc:
        out.status = "infeasible"
        out.termination_condition = "infeasible"
        out.error_message = str(exc)
        out.solve_time_seconds = time.monotonic() - start
        return out
    except Exception as exc:  # noqa: BLE001
        out.status = "error"
        out.error_message = str(exc)
        out.solve_time_seconds = time.monotonic() - start
        return out

    out.solve_time_seconds = time.monotonic() - start
    out.solver_status = results.solver_status
    out.termination_condition = results.termination_condition
    out.status = results.termination_condition

    if results.solver_status != "ok":
        out.error_message = (
            f"Solver status: {results.solver_status}, termination condition: {results.termination_condition}."
        )
        return out

    out.objective_value = results.objective_value
    payload = serialize_results(results, portfolio_version, scenario_set, markets)

    cvar_cfg = objective.get("cvar")
    if cvar_cfg and payload["stochastic"] and len(payload["profit_by_scenario"]) > 1:
        payload["cvar"] = compute_cvar(
            payload["profit_by_scenario"],
            payload["probabilities"],
            float(cvar_cfg["confidence_level"]),
        )
    else:
        payload["cvar"] = None

    out.results = payload
    return out
