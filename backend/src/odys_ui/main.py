"""FastAPI app for the Odys UI platform backend."""

from __future__ import annotations

import csv
import io
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlmodel import Session, select

from odys_ui import schemas
from odys_ui.db import engine, get_session, init_db
from odys_ui.db_models import Actuals, PortfolioVersion, Project, Run, ScenarioSetVersion, _utcnow
from odys_ui.solver import run_optimization

app = FastAPI(title="Odys UI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)

SessionDep = Annotated[Session, Depends(get_session)]


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    _seed_if_empty()


@app.exception_handler(Exception)
def unhandled_exception_handler(_request: object, exc: Exception) -> Any:
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=500, content={"detail": str(exc)})


def _iso(dt: object) -> str:
    return dt.isoformat() if hasattr(dt, "isoformat") else str(dt)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


@app.get("/api/projects")
def list_projects(session: SessionDep) -> list[dict[str, Any]]:
    projects = session.exec(select(Project)).all()
    out = []
    for p in projects:
        portfolios = session.exec(select(PortfolioVersion).where(PortfolioVersion.project_id == p.id)).all()
        scenario_sets = session.exec(select(ScenarioSetVersion).where(ScenarioSetVersion.project_id == p.id)).all()
        runs = session.exec(
            select(Run).where(Run.project_id == p.id).order_by(Run.created_at.desc()),  # type: ignore[union-attr]
        ).all()
        portfolio_names = {pv.name for pv in portfolios}
        last_run = runs[0] if runs else None
        latest_portfolio = max(portfolios, key=lambda pv: pv.created_at) if portfolios else None
        asset_summary = ""
        if latest_portfolio:
            kinds = [a["kind"] for a in latest_portfolio.assets]
            asset_summary = (
                f"{kinds.count('generator')} gen · {kinds.count('storage')} storage · "
                f"{kinds.count('load')} load · {kinds.count('market')} market"
            )
        out.append(
            {
                "id": p.id,
                "name": p.name,
                "client": p.client,
                "color": p.color,
                "created_at": _iso(p.created_at),
                "asset_summary": asset_summary,
                "portfolio_count": len(portfolio_names),
                "scenario_set_count": len(scenario_sets),
                "run_count": len(runs),
                "last_run_at": _iso(last_run.created_at) if last_run else None,
                "last_objective_value": last_run.objective_value if last_run else None,
            },
        )
    return out


@app.post("/api/projects", response_model=schemas.ProjectOut)
def create_project(body: schemas.ProjectCreate, session: SessionDep) -> Project:
    project = Project(name=body.name, client=body.client, color=body.color)
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@app.get("/api/projects/{project_id}", response_model=schemas.ProjectOut)
def get_project(project_id: int, session: SessionDep) -> Project:
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


# ---------------------------------------------------------------------------
# Portfolio versions
# ---------------------------------------------------------------------------


def _portfolio_out(session: Session, pv: PortfolioVersion) -> schemas.PortfolioVersionOut:
    run_count = session.exec(select(func.count()).select_from(Run).where(Run.portfolio_version_id == pv.id)).one()
    return schemas.PortfolioVersionOut(**pv.model_dump(), run_count=run_count)


@app.get("/api/projects/{project_id}/portfolios", response_model=list[schemas.PortfolioVersionOut])
def list_portfolio_versions(project_id: int, session: SessionDep) -> list[schemas.PortfolioVersionOut]:
    rows = session.exec(
        select(PortfolioVersion)
        .where(PortfolioVersion.project_id == project_id)
        .order_by(PortfolioVersion.version),  # type: ignore[arg-type]
    ).all()
    return [_portfolio_out(session, pv) for pv in rows]


@app.post("/api/projects/{project_id}/portfolios", response_model=schemas.PortfolioVersionOut)
def create_portfolio_version(
    project_id: int,
    body: schemas.PortfolioVersionCreate,
    session: SessionDep,
) -> schemas.PortfolioVersionOut:
    """Save a portfolio. A version nobody has run against is still a draft, so it is updated in place."""
    if not session.get(Project, project_id):
        raise HTTPException(404, "Project not found")
    existing = session.exec(
        select(PortfolioVersion).where(
            PortfolioVersion.project_id == project_id,
            PortfolioVersion.name == body.name,
        ),
    ).all()
    assets = [a.model_dump() for a in body.assets]
    latest = max(existing, key=lambda pv: pv.version, default=None)
    if latest is not None and _portfolio_out(session, latest).run_count == 0:
        latest.assets = assets
        latest.created_at = _utcnow()
        session.add(latest)
        session.commit()
        session.refresh(latest)
        return _portfolio_out(session, latest)
    pv = PortfolioVersion(
        project_id=project_id,
        name=body.name,
        version=(latest.version if latest else 0) + 1,
        assets=assets,
    )
    session.add(pv)
    session.commit()
    session.refresh(pv)
    return _portfolio_out(session, pv)


@app.get("/api/portfolio-versions/{version_id}", response_model=schemas.PortfolioVersionOut)
def get_portfolio_version(version_id: int, session: SessionDep) -> schemas.PortfolioVersionOut:
    pv = session.get(PortfolioVersion, version_id)
    if not pv:
        raise HTTPException(404, "Portfolio version not found")
    return _portfolio_out(session, pv)


# ---------------------------------------------------------------------------
# Scenario sets
# ---------------------------------------------------------------------------


def _next_scenario_set_version(session: Session, project_id: int, name: str) -> int:
    """Versions count per set name, like portfolios: saving "Winter" again makes v2 of "Winter"."""
    existing = session.exec(
        select(ScenarioSetVersion).where(ScenarioSetVersion.project_id == project_id, ScenarioSetVersion.name == name),
    ).all()
    return max((s.version for s in existing), default=0) + 1


@app.get("/api/projects/{project_id}/scenario-sets", response_model=list[schemas.ScenarioSetOut])
def list_scenario_sets(project_id: int, session: SessionDep) -> list[ScenarioSetVersion]:
    return session.exec(
        select(ScenarioSetVersion)
        .where(ScenarioSetVersion.project_id == project_id)
        .order_by(ScenarioSetVersion.version),  # type: ignore[arg-type]
    ).all()


@app.post("/api/projects/{project_id}/scenario-sets", response_model=schemas.ScenarioSetOut)
def create_scenario_set(
    project_id: int,
    body: schemas.ScenarioSetCreate,
    session: SessionDep,
) -> ScenarioSetVersion:
    if not session.get(Project, project_id):
        raise HTTPException(404, "Project not found")
    next_version = _next_scenario_set_version(session, project_id, body.name)
    ss = ScenarioSetVersion(
        project_id=project_id,
        name=body.name,
        version=next_version,
        mode=body.mode,
        number_of_steps=body.number_of_steps,
        timestep_hours=body.timestep_hours,
        scenarios=[s.model_dump() for s in body.scenarios],
    )
    session.add(ss)
    session.commit()
    session.refresh(ss)
    return ss


@app.get("/api/scenario-sets/{version_id}", response_model=schemas.ScenarioSetOut)
def get_scenario_set(version_id: int, session: SessionDep) -> ScenarioSetVersion:
    ss = session.get(ScenarioSetVersion, version_id)
    if not ss:
        raise HTTPException(404, "Scenario set not found")
    return ss


@app.post("/api/projects/{project_id}/scenario-sets/csv", response_model=schemas.ScenarioSetOut)
async def upload_scenario_csv(project_id: int, session: SessionDep, file: UploadFile) -> ScenarioSetVersion:
    """Upload a deterministic scenario from a CSV.

    Expected columns: `step`, then one column per profile named
    `load:<LoadName>`, `cap:<GeneratorName>`, or `price:<MarketName>`.
    """
    if not session.get(Project, project_id):
        raise HTTPException(404, "Project not found")
    raw = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    fieldnames = reader.fieldnames or []
    load_profiles: dict[str, list[float]] = {}
    capacity_profiles: dict[str, list[float]] = {}
    market_prices: dict[str, list[float]] = {}
    rows = list(reader)
    for col in fieldnames:
        if col == "step":
            continue
        values = [float(r[col]) for r in rows if r.get(col) not in (None, "")]
        if col.startswith("load:"):
            load_profiles[col[5:]] = values
        elif col.startswith("cap:"):
            capacity_profiles[col[4:]] = values
        elif col.startswith("price:"):
            market_prices[col[6:]] = values

    set_name = file.filename or "Uploaded set"
    ss = ScenarioSetVersion(
        project_id=project_id,
        name=set_name,
        version=_next_scenario_set_version(session, project_id, set_name),
        mode="deterministic",
        number_of_steps=len(rows),
        timestep_hours=1.0,
        scenarios=[
            {
                "name": "Base",
                "probability": 1.0,
                "load_profiles": load_profiles,
                "available_capacity_profiles": capacity_profiles,
                "market_prices": market_prices,
            },
        ],
    )
    session.add(ss)
    session.commit()
    session.refresh(ss)
    return ss


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------


def _run_to_dict(run: Run) -> dict[str, Any]:
    return {
        "id": run.id,
        "display_id": run.display_id,
        "project_id": run.project_id,
        "portfolio_version_id": run.portfolio_version_id,
        "scenario_set_version_id": run.scenario_set_version_id,
        "objective": run.objective,
        "solver": run.solver,
        "status": run.status,
        "solver_status": run.solver_status,
        "termination_condition": run.termination_condition,
        "objective_value": run.objective_value,
        "solve_time_seconds": run.solve_time_seconds,
        "error_message": run.error_message,
        "results": run.results,
        "rerun_from_run_id": run.rerun_from_run_id,
        "created_at": _iso(run.created_at),
    }


@app.get("/api/projects/{project_id}/runs")
def list_runs(project_id: int, session: SessionDep) -> list[dict[str, Any]]:
    runs = session.exec(
        select(Run).where(Run.project_id == project_id).order_by(Run.created_at.desc()),  # type: ignore[union-attr]
    ).all()
    return [_run_to_dict(r) for r in runs]


@app.post("/api/projects/{project_id}/runs")
def create_run(project_id: int, body: schemas.RunCreateRequest, session: SessionDep) -> dict[str, Any]:
    if not session.get(Project, project_id):
        raise HTTPException(404, "Project not found")
    portfolio_version = session.get(PortfolioVersion, body.portfolio_version_id)
    scenario_set = session.get(ScenarioSetVersion, body.scenario_set_version_id)
    if not portfolio_version or not scenario_set:
        raise HTTPException(404, "Portfolio version or scenario set not found")

    result = run_optimization(
        portfolio_version,
        scenario_set,
        body.objective.model_dump(),
        body.solver.model_dump(),
    )

    existing = session.exec(select(Run).where(Run.project_id == project_id)).all()
    next_seq = 131 + len(existing)
    run = Run(
        display_id=f"R-{next_seq:04d}",
        project_id=project_id,
        portfolio_version_id=body.portfolio_version_id,
        scenario_set_version_id=body.scenario_set_version_id,
        objective=body.objective.model_dump(),
        solver=body.solver.model_dump(),
        status=result.status,
        solver_status=result.solver_status,
        termination_condition=result.termination_condition,
        objective_value=result.objective_value,
        solve_time_seconds=result.solve_time_seconds,
        error_message=result.error_message,
        results=result.results,
        rerun_from_run_id=body.rerun_from_run_id,
    )
    session.add(run)
    session.commit()
    session.refresh(run)
    return _run_to_dict(run)


@app.get("/api/runs/{run_id}")
def get_run(run_id: int, session: SessionDep) -> dict[str, Any]:
    run = session.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return _run_to_dict(run)


@app.post("/api/projects/{project_id}/sweeps")
def create_sweep(project_id: int, body: schemas.SweepCreateRequest, session: SessionDep) -> list[dict[str, Any]]:
    if not session.get(Project, project_id):
        raise HTTPException(404, "Project not found")
    portfolio_version = session.get(PortfolioVersion, body.portfolio_version_id)
    scenario_set = session.get(ScenarioSetVersion, body.scenario_set_version_id)
    if not portfolio_version or not scenario_set:
        raise HTTPException(404, "Portfolio version or scenario set not found")

    created: list[dict[str, Any]] = []
    for weight in body.cvar_weights:
        objective = {
            "profit_weight": body.profit_weight,
            "cvar": {"weight": weight, "confidence_level": body.confidence_level},
        }
        result = run_optimization(portfolio_version, scenario_set, objective, body.solver.model_dump())
        existing = session.exec(select(Run).where(Run.project_id == project_id)).all()
        run = Run(
            display_id=f"R-{131 + len(existing):04d}",
            project_id=project_id,
            portfolio_version_id=body.portfolio_version_id,
            scenario_set_version_id=body.scenario_set_version_id,
            objective=objective,
            solver=body.solver.model_dump(),
            status=result.status,
            solver_status=result.solver_status,
            termination_condition=result.termination_condition,
            objective_value=result.objective_value,
            solve_time_seconds=result.solve_time_seconds,
            error_message=result.error_message,
            results=result.results,
        )
        session.add(run)
        session.commit()
        session.refresh(run)
        created.append(_run_to_dict(run))
    return created


@app.post("/api/runs/{run_id}/actuals", response_model=schemas.ActualsOut)
async def upload_actuals(run_id: int, session: SessionDep, file: UploadFile) -> Actuals:
    """Upload a metered CSV (single `value` column = net market position per step) matched to a run."""
    run = session.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")

    raw = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    col = "value" if reader.fieldnames and "value" in reader.fieldnames else (reader.fieldnames or [None])[0]
    series = [float(r[col]) for r in reader if r.get(col) not in (None, "")]

    planned: list[float] = []
    if run.results:
        first_scenario = run.results["scenarios"][0]["name"]
        scen_data = run.results["by_scenario"].get(first_scenario, {})
        markets = scen_data.get("markets", {})
        n = run.results["number_of_steps"]
        planned = [0.0] * n
        for m in markets.values():
            for i in range(n):
                planned[i] += m["sell_volume"][i] - m["buy_volume"][i]

    length = min(len(series), len(planned)) or len(series)
    mae = (
        sum(abs(series[i] - planned[i]) for i in range(length)) / length
        if length
        else 0.0
    )

    actuals = Actuals(run_id=run_id, filename=file.filename or "actuals.csv", series=series, mae=mae)
    session.add(actuals)
    session.commit()
    session.refresh(actuals)
    return actuals


def _seed_if_empty() -> None:
    from odys_ui import seed

    with Session(engine) as session:
        if session.exec(select(Project)).first() is None:
            seed.run(session)
