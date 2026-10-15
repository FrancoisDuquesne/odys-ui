"""Seeds one example project so the app isn't empty on first run."""

from __future__ import annotations

import math

from sqlmodel import Session, select

from odys_ui.db_models import PortfolioVersion, Project, Run, ScenarioSetVersion
from odys_ui.solver import run_optimization

N = 24


def _load_profile(peak: float, trough: float) -> list[float]:
    return [round(trough + (peak - trough) * (0.5 - 0.5 * math.cos((h - 6) / 24 * 2 * math.pi)), 1) for h in range(N)]


def _wind_profile(nominal: float) -> list[float]:
    return [round(max(5.0, nominal * (0.35 + 0.3 * math.sin(h / 24 * 2 * math.pi + 1.2))), 1) for h in range(N)]


def _price_profile(base: float, peak_add: float) -> list[float]:
    return [round(base + peak_add * max(0.0, math.sin((h - 15) / 24 * 2 * math.pi + 0.3)), 2) for h in range(N)]


ASSETS = [
    {"kind": "generator", "name": "Wind 1", "nominal_power": 120.0, "variable_cost": 2.0, "color": "#81b29a"},
    {
        "kind": "generator",
        "name": "CCGT 1",
        "nominal_power": 300.0,
        "variable_cost": 38.0,
        "unit_commitment": True,
        "min_power": 150.0,
        "ramp_up": 100.0,
        "ramp_down": 100.0,
        "min_up_time": 4,
        "min_down_time": 3,
        "startup_cost": 12000.0,
        "color": "#e9b45e",
    },
    {
        "kind": "generator",
        "name": "GT 1",
        "nominal_power": 100.0,
        "variable_cost": 72.0,
        "unit_commitment": True,
        "min_power": 20.0,
        "min_up_time": 2,
        "min_down_time": 2,
        "startup_cost": 4000.0,
        "color": "#e07a5f",
    },
    {
        "kind": "storage",
        "name": "BESS 1",
        "capacity": 200.0,
        "max_power": 50.0,
        "soc_start": 0.5,
        "soc_end": 0.5,
        "soc_min": 0.1,
        "soc_max": 0.95,
        "efficiency_charging": 0.95,
        "efficiency_discharging": 0.95,
        "degradation_cost": 3.0,
        "color": "#6a70a8",
    },
    {"kind": "load", "name": "Site demand", "type": "fixed", "color": "#8d90a8"},
    {
        "kind": "market",
        "name": "Day Ahead",
        "max_trading_volume_per_step": 150.0,
        "trade_direction": "buy_and_sell",
        "stage_fixed": True,
        "color": "#b5b8d6",
    },
]


def run(session: Session) -> None:
    project = Project(name="Kestrel Ridge", client="Northbay Energy", color="#5f9a80")
    session.add(project)
    session.commit()
    session.refresh(project)

    portfolio = PortfolioVersion(project_id=project.id, name="Core", version=1, assets=ASSETS)
    session.add(portfolio)
    session.commit()
    session.refresh(portfolio)

    base_load = _load_profile(peak=260.0, trough=150.0)
    base_wind = _wind_profile(120.0)
    base_price = _price_profile(base=35.0, peak_add=40.0)

    deterministic_set = ScenarioSetVersion(
        project_id=project.id,
        name="Forecast set",
        version=1,
        mode="deterministic",
        number_of_steps=N,
        timestep_hours=1.0,
        scenarios=[
            {
                "name": "Base",
                "probability": 1.0,
                "load_profiles": {"Site demand": base_load},
                "available_capacity_profiles": {
                    "Wind 1": base_wind,
                    "CCGT 1": [300.0] * N,
                    "GT 1": [100.0] * N,
                },
                "market_prices": {"Day Ahead": base_price},
            },
        ],
    )
    session.add(deterministic_set)
    session.commit()
    session.refresh(deterministic_set)

    high_load = _load_profile(peak=300.0, trough=180.0)
    low_wind = _wind_profile(60.0)
    high_price = _price_profile(base=45.0, peak_add=70.0)

    stochastic_set = ScenarioSetVersion(
        project_id=project.id,
        name="Forecast set",
        version=2,
        mode="stochastic",
        number_of_steps=N,
        timestep_hours=1.0,
        scenarios=[
            {
                "name": "S1 Base",
                "probability": 0.5,
                "load_profiles": {"Site demand": base_load},
                "available_capacity_profiles": {
                    "Wind 1": base_wind,
                    "CCGT 1": [300.0] * N,
                    "GT 1": [100.0] * N,
                },
                "market_prices": {"Day Ahead": base_price},
            },
            {
                "name": "S2 High demand",
                "probability": 0.3,
                "load_profiles": {"Site demand": high_load},
                "available_capacity_profiles": {
                    "Wind 1": base_wind,
                    "CCGT 1": [300.0] * N,
                    "GT 1": [100.0] * N,
                },
                "market_prices": {"Day Ahead": high_price},
            },
            {
                "name": "S3 Low wind",
                "probability": 0.2,
                "load_profiles": {"Site demand": base_load},
                "available_capacity_profiles": {
                    "Wind 1": low_wind,
                    "CCGT 1": [300.0] * N,
                    "GT 1": [100.0] * N,
                },
                "market_prices": {"Day Ahead": high_price},
            },
        ],
    )
    session.add(stochastic_set)
    session.commit()
    session.refresh(stochastic_set)

    # Seed two runs so Runs/Results/Compare are not empty on first load.
    for scenario_set, objective in (
        (deterministic_set, {"profit_weight": 1.0, "cvar": None}),
        (stochastic_set, {"profit_weight": 1.0, "cvar": {"weight": 0.5, "confidence_level": 0.95}}),
    ):
        solver = {"solver_name": "highs", "time_limit": 60.0, "mip_rel_gap": 0.001, "presolve": True, "threads": 4}
        result = run_optimization(portfolio, scenario_set, objective, solver)
        existing = session.exec(select(Run).where(Run.project_id == project.id)).all()
        run_row = Run(
            display_id=f"R-{131 + len(existing):04d}",
            project_id=project.id,
            portfolio_version_id=portfolio.id,
            scenario_set_version_id=scenario_set.id,
            objective=objective,
            solver=solver,
            status=result.status,
            solver_status=result.solver_status,
            termination_condition=result.termination_condition,
            objective_value=result.objective_value,
            solve_time_seconds=result.solve_time_seconds,
            error_message=result.error_message,
            results=result.results,
        )
        session.add(run_row)
        session.commit()
