"""API request/response schemas.

Field names and constraints mirror the real odys 0.2.0 entities (see
odys.domain.entities.*) so that validation happens at the API boundary,
before anything reaches odys itself. In particular storage SoC fields are
fractions of capacity in [0, 1] -- not absolute MWh -- matching
odys.domain.entities.storage.Storage exactly (this is the fix for the
known SoC bug described in PLATFORM_BRIEF.md section 8).

Asset/market names are restricted to letters, digits, spaces and
underscores. This isn't an odys requirement on paper, but empirically a
name containing a hyphen (e.g. "Wind-1", the design handoff's own example
name) silently breaks the HiGHS solve: it returns solver_status="ok" with
termination_condition="unknown" and objective_value=0.0 -- no exception,
no infeasibility, just a garbage empty solution. Verified directly against
the installed odys 0.2.0 + linopy + HiGHS stack by bisecting on asset name
alone (every other field held constant). Blocking hyphens (and other
punctuation) at the API boundary is cheaper and safer than chasing this
through linopy/HiGHS internals in a pinned third-party dependency.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

AssetName = Annotated[
    str,
    Field(
        min_length=1,
        pattern=r"^[A-Za-z0-9 _]+$",
        description="Letters, digits, spaces and underscores only -- see module docstring.",
    ),
]

# ---------------------------------------------------------------------------
# Assets
# ---------------------------------------------------------------------------


class GeneratorAsset(BaseModel):
    kind: Literal["generator"] = "generator"
    name: AssetName
    nominal_power: float = Field(gt=0)
    variable_cost: float = Field(ge=0)
    unit_commitment: bool = False
    min_power: float = Field(ge=0, default=0.0)
    ramp_up: float | None = Field(ge=0, default=None)
    ramp_down: float | None = Field(ge=0, default=None)
    min_up_time: int = Field(ge=1, default=1)
    min_down_time: int = Field(ge=1, default=1)
    startup_cost: float = Field(ge=0, default=0.0)
    shutdown_cost: float | None = Field(ge=0, default=None)
    color: str | None = None


class StorageAsset(BaseModel):
    kind: Literal["storage"] = "storage"
    name: AssetName
    capacity: float = Field(gt=0, description="MWh")
    max_power: float = Field(gt=0, description="MW")
    soc_start: float = Field(ge=0, le=1, default=0.5, description="Fraction of capacity, not MWh.")
    soc_end: float | None = Field(ge=0, le=1, default=None, description="Fraction of capacity, not MWh.")
    soc_min: float = Field(ge=0, le=1, default=0.0)
    soc_max: float = Field(ge=0, le=1, default=1.0)
    efficiency_charging: float = Field(gt=0, le=1, default=1.0)
    efficiency_discharging: float = Field(gt=0, le=1, default=1.0)
    degradation_cost: float | None = Field(ge=0, default=None)
    self_discharge_rate: float | None = Field(ge=0, le=1, default=None)
    color: str | None = None


class LoadAsset(BaseModel):
    kind: Literal["load"] = "load"
    name: AssetName
    type: Literal["fixed", "flexible"] = "fixed"
    variable_cost_to_increase: float | None = None
    variable_cost_to_decrease: float | None = None
    color: str | None = None


class MarketAsset(BaseModel):
    kind: Literal["market"] = "market"
    name: AssetName
    max_trading_volume_per_step: float = Field(gt=0)
    trade_direction: Literal["buy", "sell", "buy_and_sell"] = "buy_and_sell"
    stage_fixed: bool = False
    color: str | None = None


Asset = Annotated[
    GeneratorAsset | StorageAsset | LoadAsset | MarketAsset,
    Field(discriminator="kind"),
]


class PortfolioVersionCreate(BaseModel):
    name: str = "Core"
    assets: list[Asset]


class PortfolioVersionOut(BaseModel):
    id: int
    project_id: int
    name: str
    version: int
    assets: list[dict[str, Any]]
    created_at: datetime
    run_count: int = 0


# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------


class ScenarioIn(BaseModel):
    name: AssetName = "Base"
    probability: float = Field(ge=0, le=1, default=1.0)
    load_profiles: dict[str, list[float]] = Field(default_factory=dict)
    available_capacity_profiles: dict[str, list[float]] = Field(default_factory=dict)
    market_prices: dict[str, list[float]] = Field(default_factory=dict)


class ScenarioSetCreate(BaseModel):
    name: str = "Forecast set"
    mode: Literal["deterministic", "stochastic"] = "deterministic"
    number_of_steps: int = Field(gt=0, default=24)
    timestep_hours: float = Field(gt=0, default=1.0)
    scenarios: list[ScenarioIn]


class ScenarioSetOut(BaseModel):
    id: int
    project_id: int
    name: str
    version: int
    mode: str
    number_of_steps: int
    timestep_hours: float
    scenarios: list[dict[str, Any]]
    created_at: datetime


# ---------------------------------------------------------------------------
# Objective / solver / run
# ---------------------------------------------------------------------------


class CVaRIn(BaseModel):
    weight: float = Field(ge=0, default=0.5)
    confidence_level: float = Field(gt=0, lt=1, default=0.95)


class ObjectiveIn(BaseModel):
    profit_weight: float = Field(ge=0, default=1.0)
    cvar: CVaRIn | None = None


class SolverConfigIn(BaseModel):
    solver_name: Literal["highs", "gurobi", "cplex", "scip"] = "highs"
    time_limit: float | None = Field(gt=0, default=60.0)
    mip_rel_gap: float | None = Field(ge=0, le=1, default=0.001)
    threads: int | None = Field(gt=0, default=4)
    presolve: bool = True


class RunCreateRequest(BaseModel):
    portfolio_version_id: int
    scenario_set_version_id: int
    objective: ObjectiveIn
    solver: SolverConfigIn
    rerun_from_run_id: int | None = None


class SweepCreateRequest(BaseModel):
    portfolio_version_id: int
    scenario_set_version_id: int
    solver: SolverConfigIn
    profit_weight: float = Field(ge=0, default=1.0)
    confidence_level: float = Field(gt=0, lt=1, default=0.95)
    cvar_weights: list[float] = Field(default_factory=lambda: [0, 0.25, 0.5, 1, 2, 4])


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


class ProjectCreate(BaseModel):
    name: str
    client: str
    color: str = "#5f9a80"


class ProjectOut(BaseModel):
    id: int
    name: str
    client: str
    color: str
    created_at: datetime


class ActualsOut(BaseModel):
    id: int
    run_id: int
    filename: str
    series: list[float]
    mae: float
    created_at: datetime
