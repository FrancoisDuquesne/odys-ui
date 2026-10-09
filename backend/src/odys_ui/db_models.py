"""SQLModel table definitions (persistence layer)."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Project(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    client: str
    color: str = "#16a34a"
    created_at: datetime = Field(default_factory=_utcnow)


class PortfolioVersion(SQLModel, table=True):
    """A saved snapshot of a project's asset portfolio."""

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True)
    name: str = "Core"
    version: int
    assets: list[dict[str, Any]] = Field(sa_column=Column(JSON), default_factory=list)
    created_at: datetime = Field(default_factory=_utcnow)


class ScenarioSetVersion(SQLModel, table=True):
    """A saved snapshot of a project's scenario set (deterministic or stochastic)."""

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True)
    name: str = "Forecast set"
    version: int
    mode: str = "deterministic"  # "deterministic" | "stochastic"
    number_of_steps: int = 24
    timestep_hours: float = 1.0
    scenarios: list[dict[str, Any]] = Field(sa_column=Column(JSON), default_factory=list)
    created_at: datetime = Field(default_factory=_utcnow)


class Run(SQLModel, table=True):
    """An immutable record of one optimization run."""

    id: int | None = Field(default=None, primary_key=True)
    display_id: str = Field(index=True)
    project_id: int = Field(foreign_key="project.id", index=True)
    portfolio_version_id: int = Field(foreign_key="portfolioversion.id")
    scenario_set_version_id: int = Field(foreign_key="scenariosetversion.id")

    objective: dict[str, Any] = Field(sa_column=Column(JSON))
    solver: dict[str, Any] = Field(sa_column=Column(JSON))

    status: str  # "optimal" | "time_limit" | "infeasible" | "error" | other termination_condition
    solver_status: str | None = None
    termination_condition: str | None = None
    objective_value: float | None = None
    solve_time_seconds: float | None = None
    error_message: str | None = None

    results: dict[str, Any] | None = Field(sa_column=Column(JSON), default=None)

    rerun_from_run_id: int | None = Field(default=None, foreign_key="run.id")
    created_at: datetime = Field(default_factory=_utcnow)


class Actuals(SQLModel, table=True):
    """A user-uploaded CSV of metered values matched to a run."""

    id: int | None = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="run.id", index=True)
    filename: str
    series: list[float] = Field(sa_column=Column(JSON))
    mae: float
    created_at: datetime = Field(default_factory=_utcnow)
