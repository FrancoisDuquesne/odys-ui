# Contributing to Odys UI

Thanks for your interest in improving Odys UI! Bug reports, ideas and pull requests are all welcome.

## Before you start

- **Bugs and ideas:** open an [issue](https://github.com/FrancoisDuquesne/odys-ui/issues) using one of the templates.
- **Larger changes:** open an issue first to discuss the approach, so your work doesn't clash with something already in progress.
- **Optimization behavior:** the solver itself is the [`odys`](https://github.com/ramirocrc/odys) library, a separate project. Problems with the optimization model or results belong in that repository; problems with how Odys UI sets up runs or displays results belong here.

## Development setup

You need Node.js 20+, Python 3.11+ and [uv](https://docs.astral.sh/uv/).

```bash
# backend: http://localhost:8000
cd backend
uv sync
uv run uvicorn --app-dir src odys_ui.main:app --reload --port 8000

# frontend: http://localhost:3000 (in a second terminal)
cd frontend
npm install
npm run dev
```

The backend creates a SQLite database (`backend/odys_ui.db`) and seeds demo data on first start. Delete the file to reset it. See [`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md) for how the pieces fit together.

## Making a change

1. Fork the repository and create a branch from `main` (for example `fix/run-compare-chart`).
2. Keep each pull request focused on one change.
3. Match the style of the surrounding code: Vue 3 `<script setup>` with TypeScript and Nuxt UI components in the frontend; typed FastAPI routes with SQLModel in the backend.
4. Check your change by hand. There is no automated test suite yet:
   - `npm run build` in `frontend/` succeeds.
   - The backend starts and http://localhost:8000/docs loads.
   - The pages you touched work with the seeded demo project, in both light and dark mode.
5. Write clear commit messages in the imperative mood ("Add storage chart", not "Added storage chart").
6. Open a pull request and fill in the template. Add screenshots for any UI change.

Contributions that add tests or linting are very welcome.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
