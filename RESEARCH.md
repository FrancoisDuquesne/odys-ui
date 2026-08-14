# Odys UI Platform — Research & Market Analysis

## 1. What Is Odys?

Odys is a Python library for **energy portfolio optimization under uncertainty**. It lets users model a portfolio of energy assets — generators, batteries, loads, and electricity markets — then find the optimal dispatch schedule that minimizes cost or maximizes profit across one or many possible futures (scenarios).

The key differentiator is that **stochastic optimization is the default**, not an add-on. Most tools treat uncertainty as an advanced feature; Odys treats it as the baseline.

---

## 2. Core Capabilities

### Asset Types

| Asset | What it models |
|---|---|
| `Generator` | Any dispatchable power source (gas turbine, diesel, hydro). Parameterized by nominal power (MW) and variable cost ($/MWh). |
| `Storage` | Battery or pumped hydro. Parameterized by capacity (MWh), max charge/discharge rate (MW), and state-of-charge bounds. |
| `Load` | Fixed or flexible electricity demand. Load profiles are time-varying. |
| `EnergyMarket` | An external spot market where the portfolio can buy and/or sell energy. Can be buy-only, sell-only, or bidirectional. |

### Scenario Handling

Two modes:

- **Deterministic** (`Scenario`): single set of time-series for load profiles, capacity availability, and market prices. Fast and simple.
- **Stochastic** (`StochasticScenario` list): multiple futures, each with a probability weight. Solves a single optimization that is optimal across all scenarios simultaneously.

Scenarios carry all time-varying data: load profiles, capacity availability per asset, and market prices.

### Risk Management

The objective function is configurable. Out of the box:

- **`ProfitTerm`** — maximize expected profit across scenarios.
- **`CVaRTerm`** — penalize downside risk (Conditional Value at Risk). Controls the trade-off between expected return and exposure to bad outcomes. Parameterized by confidence level (e.g. 0.6 = care about the worst 40% of scenarios).

### Solver Backends

HiGHS (open-source, fast) is the default. Gurobi, CPLEX, and SCIP are also supported — swapped with a single config change.

### The API in One Paragraph

Define assets → bundle them into an `AssetPortfolio` → attach scenarios → instantiate `EnergySystem` → call `.optimize()` → read results from `OptimizationResults` (`.generators`, `.storages`, `.markets`). No config files, no boilerplate.

---

## 3. What Problems Does Odys Solve Well?

### Problem 1 — Least-Cost Dispatch
> "I have a gas plant, a solar farm, and fixed demand. Which asset should produce at each hour to minimize total cost?"

Odys solves this in ~10 lines. It automatically prioritizes zero-cost solar and uses gas only when solar falls short. Curtailment is handled implicitly.

### Problem 2 — Storage Arbitrage / Temporal Shifting
> "I have a battery. When should I charge it (store cheap solar) and when should I discharge it (avoid buying expensive gas)?"

Adding a `Storage` object gives the optimizer a temporal dimension. It naturally finds charge/discharge schedules that shift free energy to expensive hours.

### Problem 3 — Buy vs. Generate Decisions
> "Should I run my gas plant or buy from the spot market?"

With an `EnergyMarket` added to the system, the optimizer compares the asset's variable cost against real-time market prices and picks the cheaper option hour by hour.

### Problem 4 — Risk-Aware Portfolio Allocation
> "I can sell to two markets. One has higher expected price but high variance. How much should I commit to each?"

With stochastic scenarios and `CVaRTerm`, the optimizer finds a dispatch/allocation that balances expected profit against downside exposure. The CVaR weight is the risk-appetite dial.

---

## 4. What Odys Is NOT (Yet)

- No AC/DC power flow (network constraints, line limits, voltage)
- No unit commitment (start-up costs, minimum on/off times for thermal plants)
- No multi-period stochastic with recourse (scenario-tree branching across time)
- No real-time data connectors (users bring their own time-series)
- No built-in visualization

These are important scope boundaries for the UI — they define what we can promise.

---

## 5. Market Analysis: Who Needs a UI for This?

### The Core Problem the UI Solves

Odys currently requires writing Python. Its target users — energy professionals, traders, consultants — are domain experts, not necessarily developers. A UI removes the coding barrier while preserving the mathematical rigor underneath.

---

### Segment 1 — Independent Power Producers (IPPs) and Asset Owners

**Who:** Companies that own and operate power plants, solar farms, wind farms, or batteries.

**Pain today:** Dispatch and bidding decisions are made in spreadsheets or with expensive, opaque commercial tools (PLEXOS, Aurora, Antares). These tools cost $50K–$200K/year per seat and require weeks of training.

**What they need:**
- Upload hourly asset parameters and market price forecasts
- Run dispatch optimization for the next day / week
- Compare "expected profit" vs "risk-managed" outcomes side by side
- Export dispatch schedules for submission to grid operators

**Fit with Odys:** Strong. The `Generator` + `EnergyMarket` + `StochasticScenario` workflow maps directly to their core planning problem.

**Size:** The global energy trading software market is ~$2B and growing. Even a niche targeting mid-size IPPs (10–500 MW portfolios) is large.

---

### Segment 2 — Industrial Energy Consumers (C&I)

**Who:** Large factories, data centers, cold chains, mining operations with their own generation (solar + diesel backup + battery) and flexible loads.

**Pain today:** Their energy manager is not a data scientist. Decisions about when to self-generate, when to buy from the grid, and when to charge/discharge the battery are made intuitively or not at all.

**What they need:**
- Simple UI to define their assets and tariff/price schedules
- "What's cheapest?" answer for the coming week
- Scenario comparison: "What if grid prices spike?"
- Optionally: automated schedule output to their SCADA system

**Fit with Odys:** Strong. The `Generator` + `Storage` + `Load` + `EnergyMarket` pattern covers their use case exactly.

**Size:** Industrial energy management software is a $5B+ market. The battery + solar + grid-tariff optimization slice is fast-growing with the renewable buildout.

---

### Segment 3 — Energy Traders and Portfolio Managers

**Who:** Traders at utilities, commodity desks, or energy retailers managing a portfolio of generation assets and market positions.

**Pain today:** Stochastic optimization tooling is either academic (hard to use) or enterprise (expensive and locked-in). Fast scenario re-runs and risk sensitivity analysis are time-consuming.

**What they need:**
- Load a scenario set (e.g. 50 market price paths)
- Run optimization and see CVaR frontier (expected profit vs. risk)
- Sensitivity analysis: "What happens if I change the CVaR weight from 0 to 1?"
- Audit trail of decisions (which scenario drove which constraint)

**Fit with Odys:** Very strong. The `CVaRTerm` + `StochasticScenario` API is exactly this workflow. The transparent math (Odys's stated feature) is a compliance advantage.

**Size:** Smaller, more technical audience, but high willingness to pay. Energy trading desks at mid-size utilities are the sweet spot.

---

### Segment 4 — Energy Consultants

**Who:** Boutique consulting firms doing feasibility studies for solar + storage projects, grid-scale battery valuations, or market entry analysis for new power plants.

**Pain today:** They build custom Python or Excel models per engagement. Rebuilding from scratch every project is slow and error-prone.

**What they need:**
- A tool they can white-label or at least parameterize quickly per client
- Export-quality charts and tables for reports (dispatch curves, cost breakdowns, risk profiles)
- Ability to run 10–20 scenarios and compare results

**Fit with Odys:** Good. Consultants have Python skills but need speed. A UI with "save/load scenario sets" would slash their time-per-engagement.

**Size:** Fragmented but large aggregate. Thousands of small energy consulting firms globally.

---

### Segment 5 — Academics and Students

**Who:** MSc/PhD students in energy systems, power engineering, or operations research. Professors teaching energy optimization courses.

**Pain today:** Tools like PLEXOS are too expensive for academic use. Writing LP solvers from scratch is a full project, not a teaching aid.

**What they need:**
- A free or low-cost tier
- Clear visualization of what the optimizer is doing (dispatch curves, scenario fans)
- Ability to see the underlying math (Odys's "transparent math" feature fits perfectly)
- Notebook-friendly or shareable results

**Fit with Odys:** Excellent. Odys's design philosophy ("focus on the problem, not the math") was explicitly built for this audience. The UI extends that to non-coders.

**Size:** Lower revenue potential per user but high volume and strong word-of-mouth (today's students are tomorrow's IPP analysts).

---

## 6. Competitive Landscape

| Tool | Price | Stochastic | Open math | Audience |
|---|---|---|---|---|
| PLEXOS | $50K–$200K/yr | Yes | No | Large utilities |
| Aurora | $30K–$100K/yr | Partial | No | Utilities, IPPs |
| Antares | Free (open-source) | Yes | Yes | Researchers |
| PyPSA | Free (open-source) | Partial | Yes | Researchers |
| **Odys UI** | TBD | Yes (native) | Yes | Mid-market |

The gap in the market is **affordable, transparent, stochastic-first** tooling for mid-size IPPs, C&I consumers, and consultants. Enterprise tools are too expensive and opaque. Pure open-source tools require Python expertise and have no UI.

---

## 7. Recommended Starting Point for the UI

Based on the library's current feature set and the market analysis, the highest-leverage first product is:

**A scenario builder + dispatch optimizer + results dashboard for single-day / single-week energy portfolio optimization.**

Core flows:
1. **Asset builder** — add generators, storage, loads with form inputs
2. **Scenario editor** — paste or upload hourly time-series (load, capacity, prices); add multiple stochastic scenarios with probability sliders
3. **Run optimization** — single button, progress indicator, show solver status
4. **Results dashboard** — dispatch timeline chart per asset, cost/profit summary, CVaR frontier if stochastic

This covers the basic dispatch, battery dispatch, market arbitrage, and CVaR examples directly — meaning every documented feature of the library becomes a UI workflow.

---

## 8. Open Questions to Decide Early

1. **Deployment model**: web app (SaaS) vs. local desktop app vs. Jupyter widget?
2. **Data ingestion**: manual form entry vs. CSV upload vs. API connectors to market data feeds?
3. **Business model**: freemium (free for academics, paid for commercial use) vs. open-source with consulting upsell?
4. **Solver**: HiGHS only for now (free), or support Gurobi/CPLEX paywalls?
5. **Export formats**: CSV, Excel, JSON, direct SCADA integration?

---

## 9. Implementation Concerns and Architecture Questions

This section raises every hard question that must be answered before building anything. These are not features — they are architectural decisions that, once made, are expensive to reverse.

---

### 9.1 — The Central Question: Where Does Computation Happen?

When a user clicks "Run Optimization," odys needs to execute Python code and an LP solver. There are four fundamentally different places this can happen, each with very different tradeoffs.

#### Option A — In the User's Browser (WebAssembly / Pyodide)

Run odys directly in the browser by compiling Python to WebAssembly via [Pyodide](https://pyodide.org/).

**Pros:**
- Zero server compute cost
- Data never leaves the user's machine (solves privacy entirely)
- No backend to maintain for the compute layer
- Works offline

**Cons:**
- Pyodide itself is a ~15–30 MB download before the page does anything
- The full odys dependency stack (pydantic, linopy, xarray, pandas, HiGHS) all needs to work in Pyodide. HiGHS has a WASM port but the full stack integration is unproven.
- No Gurobi or CPLEX (they require native OS libraries with license files)
- Browser sandbox limits memory and CPU; large stochastic problems will be very slow or crash the tab
- Single-threaded (Web Workers help but add complexity)

**Verdict:** Viable for tutorial-size problems. Not viable as the primary architecture for commercial users.

---

#### Option B — Local Desktop App

An Electron app or a local FastAPI server that users install on their machine.

**Pros:**
- Full machine resources (RAM, CPU cores)
- User can plug in their own Gurobi license
- Data stays entirely local
- Offline capable

**Cons:**
- Installation friction: Python version management, pip, PATH, OS compatibility
- Must ship signed installers for Mac, Windows, and Linux separately
- Need an auto-update mechanism
- "It doesn't work on my machine" support burden is high
- No collaboration features (sharing results across a team requires manual export)

**Verdict:** Attractive for the self-hosted / data-sensitive enterprise use case, but high maintenance cost and bad first-run experience.

---

#### Option C — Our Cloud Backend (SaaS)

Users submit optimization jobs via a browser UI; a backend API runs odys on our servers and returns results.

**Pros:**
- Works from any browser, no install
- We control compute resources and can scale up/down
- Full observability: we see job failures, solver errors, usage patterns
- Easiest path to a polished product experience

**Cons:**
- **We pay for every optimization run.** Compute cost per job needs to be modeled carefully.
- **Data privacy is a hard problem.** Energy portfolio parameters and market positions are commercially sensitive. A European IPP may be legally prohibited from sending asset data to a US cloud. Some regulated markets have explicit data sharing restrictions.
- Large jobs (annual stochastic with 100+ scenarios) can take minutes; need async job handling infrastructure.
- If we go down, users' workflows stop. SLA expectations from commercial customers are high.

**Verdict:** Best developer experience and easiest to iterate on. Data privacy is the primary risk — needs mitigation from day one.

---

#### Option D — User-Provided Compute ("Bring Your Own Runner")

We ship the UI as SaaS but let users deploy the computation backend themselves (a Docker container or a pip-installable local server). The UI calls their backend via a configured URL.

**Pros:**
- Solves data privacy: data never leaves the user's infrastructure
- User pays their own cloud bill for compute
- Users with Gurobi licenses can use them
- We maintain only the UI layer

**Cons:**
- Complex onboarding: user must deploy Docker + configure networking
- We lose visibility into job failures and usage
- "My local runner isn't responding" becomes a support ticket about their infrastructure
- Collaboration is hard: two teammates need to share the same runner

**Verdict:** Best fit for large enterprise customers. Too high-friction for the SMB and academic segments.

---

#### Option E — Hybrid (Recommended for v1)

- **Default path**: cloud backend (Option C) — used by most users
- **Enterprise / data-sensitive path**: self-hosted runner (Option D) — offered as an enterprise tier

This is the model used by Metabase, Grafana, Airbyte, and most modern open-core SaaS tools. It lets us serve the academic and SMB segments quickly while offering a compliance-friendly option for large IPPs.

The key risk to mitigate from day one: **never let raw asset or market data get stored in plaintext on our servers longer than the duration of the job.** Inputs and outputs should be transient in the worker, with results stored in user-controlled object storage or encrypted at rest.

---

### 9.2 — Problem Size and Compute Reality

Not all optimization jobs are equal. The LP problem size (variables × constraints) determines how long a job takes and how much compute it needs. Rough estimates:

| Problem Type | Assets | Time Steps | Scenarios | ~Variables | ~Constraints | Estimated HiGHS Time |
|---|---|---|---|---|---|---|
| Tutorial | 2 | 4 | 1 | ~20 | ~40 | < 1 ms |
| Day-ahead dispatch | 5 | 24 | 1 | ~600 | ~1,200 | < 1 s |
| Week-ahead dispatch | 5 | 168 | 1 | ~4,200 | ~8,400 | seconds |
| Stochastic day-ahead | 5 | 24 | 50 | ~30,000 | ~60,000 | seconds–minutes |
| Annual stochastic | 10 | 8,760 | 100 | ~8.7 M | ~17 M | minutes–hours |

**Implications:**
- Tutorial and day-ahead jobs can run synchronously (respond in-request). Everything larger needs an async job queue.
- Annual stochastic problems are expensive. Do we want to support them in v1? Is there a size limit?
- We need a timeout policy: what happens if HiGHS runs for 20 minutes on a pathological problem? Kill it? Alert the user?
- Pricing (if usage-based) needs to reflect problem size, not just "per run."

---

### 9.3 — The Async Job Queue

For any job over ~5 seconds, a blocking HTTP request is unacceptable. This means we need:

1. **Job submission**: POST returns a job ID immediately, not a result.
2. **Status polling or push**: frontend needs to know when the job finishes. Options:
   - Polling (simplest, slightly wasteful)
   - Server-Sent Events / WebSocket (real-time, more complex)
3. **Result storage**: where do finished results live until the user fetches them? S3? Database? For how long?
4. **Worker infrastructure**: what runs the jobs?
   - Celery workers on EC2/VMs (predictable cost, always-on)
   - Serverless (AWS Lambda, Google Cloud Run) — cold start latency is a problem for Python + heavy deps
   - Kubernetes jobs — most flexible but most complex
5. **Job cancellation**: users will submit large jobs by mistake and want to cancel them.
6. **Retry policy**: if a worker crashes mid-job, does the job retry? Optimization is deterministic, so retrying is safe.
7. **Concurrency**: what if 50 users all submit large jobs at the same time? Need a queue depth limit or auto-scaling.

This is a non-trivial infrastructure component. Using a managed queue (AWS SQS + Fargate, or Modal.com) is worth considering over building from scratch.

---

### 9.4 — The Serialization Problem

odys takes Python objects as input and returns pandas DataFrames. A web UI speaks JSON. The translation layer between them is a critical piece that must be:

- **Correct**: every odys parameter exposed in the UI must map to the right Python object
- **Validated**: bad user input (negative nominal_power, probabilities that don't sum to 1) must be caught before hitting odys, not returned as a cryptic Python traceback
- **Versioned**: when odys changes its API, what happens to saved scenarios?

Concretely:

**Input side**: convert JSON `{"name": "ccgt", "nominal_power": 100, "variable_cost": 50}` → `Generator(name="ccgt", nominal_power=100, variable_cost=50)`. For stochastic scenarios, a user's uploaded CSV must map to the right `StochasticScenario` fields with the right time indexing.

**Output side**: `result.generators.power` returns a pandas Series with a MultiIndex `(time, generator)`. This must become a clean JSON structure the frontend can plot. xarray outputs from stochastic results add another dimension (scenario). These serializers need to be thorough and tested.

**The odys version lock problem**: the UI's serialization layer is tightly coupled to odys's internal API. When your friend releases odys v0.2 with a changed parameter name or new asset type, the UI backend breaks. We need:
- A pinned odys version in the backend's dependency lock file
- A clear process for upgrading: test serialization layer → upgrade → re-test → deploy
- Stored results should record which odys version produced them, so they remain interpretable after upgrades

---

### 9.5 — Solver Licensing

HiGHS is open-source and runs freely on our cloud. The commercial solvers are different:

- **Gurobi**: requires a license file tied to a specific machine or a Gurobi Web License Service (WLS) token. Commercial price: ~$10K–$50K/year. Academic licenses are free but institution-locked and cannot be used for commercial SaaS.
- **CPLEX**: IBM enterprise license, similarly expensive and restrictive.

**Implications:**
- For the cloud backend: use HiGHS only. Do not attempt to run Gurobi on shared cloud infrastructure without a proper WLS setup, and even then the cost per license would need to be priced into the product.
- For the self-hosted runner: users can bring their own Gurobi license. The runner needs a configuration option to point to their license.
- Communication to users: be transparent that the cloud tier uses HiGHS. For most dispatch problems at the scale odys targets, HiGHS is fast enough. Only very large or specialized problems need Gurobi.

---

### 9.6 — Data Privacy and Sensitivity

This deserves its own section because it can be a dealbreaker for the most valuable customers.

Energy portfolio data is commercially sensitive:
- Asset parameters (nominal capacity, variable cost, ramp rates) reveal operational economics and competitive position.
- Market positions and bidding strategies can be market-moving information in thin markets.
- Load profiles can reveal production schedules at industrial facilities.
- Some electricity markets have regulatory requirements about where trading data can be processed.
- EU customers face GDPR; data residency (EU-region cloud) may be required.

**Mitigations to consider from day one:**
1. Minimize data retention: don't store input parameters longer than necessary. Delete job inputs after results are delivered.
2. Offer EU-region deployment (AWS eu-west-1, GCP europe-west) from launch.
3. Have a Data Processing Agreement (DPA) ready for commercial customers.
4. The self-hosted runner option (9.1 Option D) is the complete solution for the most sensitive customers.
5. Do not log asset parameters or market prices in application logs.

---

### 9.7 — Data Ingestion: Getting Time-Series In

The UI's value depends on users being able to get their data in efficiently. The options:

| Method | Effort to build | User effort | Feasible for 168-step weekly? | Feasible for 8760-step annual? |
|---|---|---|---|---|
| Manual number entry | Low | Very high | No | No |
| CSV/Excel upload | Medium | Low | Yes | Yes |
| Spreadsheet paste (copy from Excel) | Medium | Very low | Yes | Maybe |
| Market data API connectors (ENTSO-E, EIA) | High | Very low | Yes | Yes |
| Bundled example datasets | Low | Zero (just select) | Yes | Yes |

**Recommendations for v1:**
- CSV upload is the minimum viable ingestion path. Users always have their data in Excel.
- A spreadsheet-paste widget (user copies a range from Excel, pastes into the UI) would dramatically lower friction. Energy analysts live in Excel.
- Bundled example datasets (e.g., typical solar profiles for southern Europe, historical EPEX day-ahead prices) let users start exploring without any data preparation.
- Market data API connectors are high-value but out of scope for v1.

**Validation at ingestion is critical**: if a user uploads a CSV with 23 rows for a 24-step problem, or with the wrong column name, this needs to surface as a clear, friendly error at upload time — not as a Python traceback from odys.

---

### 9.8 — Frontend Architecture Concerns

The UI is not a simple form. It has several genuinely hard frontend problems:

**Time-series editing**: editing 24 × 50 numbers (24 hours × 50 stochastic scenarios) is a spreadsheet-like problem. A plain `<input>` grid will not work at this scale. Options:
- A data-grid component (AG Grid, TanStack Table with editable cells)
- A chart-first editor (draw a curve, it generates the numbers)
- Upload-only (no in-browser editing of large time-series)

**Charting requirements**:
- Dispatch timeline: stacked area chart (each asset's output stacked, showing how they combine to meet load)
- Scenario fan: many lines on one chart showing the range of outcomes across stochastic scenarios
- CVaR frontier: scatter/line chart of expected profit vs. CVaR at varying risk weights
- State-of-charge timeline for storage

These are non-standard chart types. Standard chart libraries (Chart.js, Recharts) handle them but require custom configuration. Plotly handles all of them natively.

**Real-time job status**: if a job takes 30 seconds, the UI must show a progress indicator that updates without the user manually refreshing. Requires WebSocket or Server-Sent Events from the backend.

**State management**: the asset list + scenario data + run configuration is complex structured state. A form update in "asset editor" must propagate correctly to the "run" screen. Needs a proper state management approach (Zustand, Redux Toolkit, or server-state via React Query) — not ad-hoc component state.

---

### 9.9 — Multi-Tenancy and Collaboration

If this is a SaaS product with multiple users:

- **Isolation**: user A must never see user B's portfolios or results
- **Organizations/teams**: a consulting firm needs to share portfolios across team members for the same client engagement
- **Roles**: who can run an optimization? Who can only view results? Who can edit assets?
- **Projects**: a consultant likely wants to group "portfolio + scenarios + results" into a named project per client
- **Sharing**: read-only share links to results (useful for presenting to clients who don't have accounts)

These are not complex to build individually, but must be designed before the first line of database schema is written. Adding multi-tenancy to an existing schema is painful.

---

### 9.10 — Reproducibility and Audit Trail

Energy trading decisions have financial and sometimes regulatory consequences. Users will need to answer "what optimization did we run on Tuesday that produced this dispatch schedule?"

Every optimization result should store:
- Full input snapshot (asset parameters, scenario data)
- odys version used
- Solver backend and version
- Solver configuration (time limit, tolerances)
- Timestamp
- Run duration and solver statistics (iterations, objective value)

This is essentially an immutable event log for every run. It also means results are always reproducible: re-running the exact same job with the same odys version should produce the same result.

**Question**: how long do we retain results? Storage is cheap, but there are GDPR implications if results contain personal or commercially sensitive data. Policy needed from day one.

---

### 9.11 — The Odys Dependency Risk

The entire platform depends on a library maintained by one person. This is a real risk:

- What if odys development stalls or changes direction?
- What if a breaking change in odys breaks the UI's serialization layer?
- What if a bug in odys produces incorrect optimization results — and users act on them?

**Mitigations:**
- Pin a specific odys version in production; upgrade deliberately, not automatically
- Maintain a regression test suite that runs the four documented examples and checks results against known-good outputs
- Consider contributing to odys (adding the missing features the UI needs) rather than working around them
- Discuss governance openly with the library author: if this becomes a commercial product, what is the relationship? Revenue sharing? Paid maintenance contract? Fork rights?
- Document clearly to users that results depend on odys, and odys should be validated against their specific use case

---

### 9.12 — Technology Stack Decisions

Decisions that should be made before writing code:

**Backend:**
- Language: Python (FastAPI) is the natural choice since odys is Python. No impedance mismatch.
- Async task queue: Celery + Redis (mature, well-documented) vs. ARQ (async, lighter) vs. managed (Modal.com, AWS SQS + Fargate, Inngest)
- Database: PostgreSQL for structured data (users, portfolios, run metadata). JSON columns for flexible scenario data.
- Large data (uploaded CSVs, serialized results): S3 or equivalent object storage
- ORM: SQLAlchemy + Alembic for migrations

**Frontend:**
- Framework: React (largest ecosystem, most energy-adjacent tooling) vs. Svelte (simpler, faster) vs. Vue
- Type safety: TypeScript — yes, non-negotiable for a data-heavy app
- Charting: Plotly.js (handles all required chart types, Python-familiar to energy analysts) vs. Recharts (React-native, lighter)
- Component library: shadcn/ui (unstyled primitives, full control) vs. Ant Design (data-dense, good for dashboards)
- State: Zustand + React Query (async server state)

**Infrastructure:**
- Cloud: AWS (most mature managed services) or Hetzner (much cheaper for EU, good for keeping costs low early)
- Containers: Docker Compose for development, ECS Fargate or Fly.io for production
- CI/CD: GitHub Actions
- Monitoring: Sentry (errors) + Grafana + Prometheus (metrics) or a managed observability stack

---

### 9.13 — Summary: Decisions That Must Come First

Before writing UI code or backend code, these questions must have answers:

| Decision | Options | Stakes |
|---|---|---|
| Where does compute run? | Cloud / local / hybrid | Determines entire architecture |
| Data privacy approach | Store transiently / self-hosted option / encryption | Determines whether commercial customers will use it |
| Sync vs. async jobs | Sync for small, async for large | Determines backend complexity |
| Solver support | HiGHS only / + Gurobi (how?) | Determines licensing cost and complexity |
| Data ingestion | CSV upload / paste / API | Determines who can realistically use v1 |
| Multi-tenancy model | Personal / teams / orgs / projects | Must be in the DB schema from day one |
| Odys governance | Use as-is / contribute / fork | Determines long-term platform risk |
| Open source strategy | Fully open / open core / closed | Determines go-to-market and monetization |
