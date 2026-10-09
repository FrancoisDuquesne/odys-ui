# Odys UI – Backend

FastAPI service that stores projects, portfolios, scenario sets and runs in SQLite and solves them with the [`odys`](https://github.com/ramirocrc/odys) optimization library.

## Requirements

- Python 3.11+
- [uv](https://docs.astral.sh/uv/)

## Run

```bash
cd backend
uv sync
uv run uvicorn --app-dir src odys_ui.main:app --reload --port 8000
```

- API: http://localhost:8000/api
- Interactive docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/health

On startup the app creates the SQLite database (`odys_ui.db`, git-ignored) and seeds demo data if it is empty. To reset, stop the server and delete `odys_ui.db`.

The frontend expects the backend on port **8000**. CORS allows `localhost:3000` and `localhost:5173`.

## Layout

| File | Purpose |
| --- | --- |
| `src/odys_ui/main.py` | FastAPI app and routes (projects, portfolios, scenario sets, runs, sweeps, actuals) |
| `src/odys_ui/db.py`, `db_models.py` | SQLModel engine and tables |
| `src/odys_ui/schemas.py` | Request/response models |
| `src/odys_ui/solver.py` | Builds an odys `EnergySystem` from stored data and solves it |
| `src/odys_ui/seed.py` | Demo data |

## Errors

Unhandled exceptions return `500` with `{"detail": "<message>"}`; validation and not-found errors use FastAPI's standard `detail` format. The frontend shows `detail` to the user.

## Notes

HiGHS (bundled with odys) is the default solver. Gurobi, CPLEX and SCIP need their own installation and license.
