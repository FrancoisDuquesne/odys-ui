# Odys UI – Frontend

Nuxt 4 + [Nuxt UI](https://ui.nuxt.com) (dashboard components) + ECharts. Visualizes portfolios, runs and results from the Odys UI backend.

## Requirements

- Node.js 20+
- The backend running on http://localhost:8000 (see `../backend/README.md`)

## Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Other scripts: `npm run build` (production build), `npm run preview` (serve the build).

## How it talks to the backend

Browser requests go to `/backend-api/*`, which the dev server proxies to `http://localhost:8000/api/*` (`nuxt.config.ts`). Server-side rendering calls the backend directly (`app/composables/useApi.ts`). If the backend lives elsewhere, change both places.

`/api` is deliberately not used for the proxy: `@nuxt/icon` serves its bundle from `/api/_nuxt_icon`.

## Error handling

- `apiFetch` gives network failures a readable `data.detail`, so pages show "Cannot reach the backend…" instead of a generic message.
- If the project list can't load (typically: backend not running), the layout replaces the page with a "Backend not reachable" screen showing the start command and a **Try again** button. The sidebar stays usable.
- `app/error.vue` is the full-page fallback for anything uncaught (404s, render errors).
- Per-page load failures use `ErrorState` with a retry.

## Structure

```
app/
  layouts/default.vue   dashboard shell: sidebar, branding, project switcher, nav
  pages/                projects, runs, new run, run results, compare, portfolio
  components/           ui/ (Panel, MetricStrip, …), charts/ (ECharts wrappers)
  composables/          API access and shared state
  error.vue             global error page
```
