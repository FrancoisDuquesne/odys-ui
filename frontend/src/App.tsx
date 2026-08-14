import { useState } from 'react';
import { AssetPanel } from './components/AssetPanel';
import { ScenarioPanel } from './components/ScenarioPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { runOptimization } from './api';
import type { AssetsState, ScenarioState, OptimizeResponse } from './types';

// ─── Example presets ──────────────────────────────────────────────────────────

const EXAMPLE_BASIC: { assets: AssetsState; scenario: ScenarioState } = {
  assets: {
    generators: [
      { id: 'ex-solar', name: 'solar_pv', nominal_power: 150, variable_cost: 0 },
      { id: 'ex-ccgt', name: 'ccgt', nominal_power: 100, variable_cost: 50 },
    ],
    loads: [{ id: 'ex-load', name: 'load' }],
    storage: [],
  },
  scenario: {
    number_of_steps: 24,
    timestep_hours: 1,
    load_profiles: { load: Array(24).fill(70) },
    available_capacity_profiles: {
      ccgt: Array(24).fill(100),
      solar_pv: [0, 0, 0, 0, 0, 0, 10, 30, 60, 90, 110, 120, 125, 120, 110, 90, 60, 30, 10, 0, 0, 0, 0, 0],
    },
  },
};

const EXAMPLE_BATTERY: { assets: AssetsState; scenario: ScenarioState } = {
  assets: {
    generators: [
      { id: 'ex-solar', name: 'solar_pv', nominal_power: 150, variable_cost: 0 },
      { id: 'ex-ccgt', name: 'ccgt', nominal_power: 100, variable_cost: 50 },
    ],
    loads: [{ id: 'ex-load', name: 'load' }],
    storage: [{ id: 'ex-battery', name: 'battery', capacity: 300, max_power: 200, soc_start: 0, soc_end: 0 }],
  },
  scenario: {
    number_of_steps: 24,
    timestep_hours: 1,
    load_profiles: { load: Array(24).fill(70) },
    available_capacity_profiles: {
      ccgt: Array(24).fill(100),
      solar_pv: [0, 0, 0, 0, 0, 0, 10, 30, 60, 90, 110, 120, 125, 120, 110, 90, 60, 30, 10, 0, 0, 0, 0, 0],
    },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRunnable(assets: AssetsState): boolean {
  const hasGenerator = assets.generators.some(g => g.name.trim());
  const hasLoad = assets.loads.some(l => l.name.trim());
  return hasGenerator && hasLoad;
}

// Rename keys in scenario profiles when an asset is renamed
function propagateRenames(
  prev: AssetsState,
  next: AssetsState,
  scenario: ScenarioState,
): ScenarioState {
  const renames = new Map<string, string>();
  for (const p of prev.generators) {
    const n = next.generators.find(g => g.id === p.id);
    if (n && p.name && n.name && p.name !== n.name) renames.set(p.name, n.name);
  }
  for (const p of prev.loads) {
    const n = next.loads.find(l => l.id === p.id);
    if (n && p.name && n.name && p.name !== n.name) renames.set(p.name, n.name);
  }
  for (const p of prev.storage) {
    const n = next.storage.find(s => s.id === p.id);
    if (n && p.name && n.name && p.name !== n.name) renames.set(p.name, n.name);
  }
  if (renames.size === 0) return scenario;
  const rename = (obj: Record<string, number[]>) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [renames.get(k) ?? k, v]));
  return {
    ...scenario,
    load_profiles: rename(scenario.load_profiles),
    available_capacity_profiles: rename(scenario.available_capacity_profiles),
  };
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-8">
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">⚡</div>
        <h2 className="text-base font-semibold text-gray-700 mb-1">How it works</h2>
        <p className="text-sm text-gray-400 max-w-xs mx-auto">
          Find the least-cost dispatch schedule for a portfolio of energy assets.
        </p>
      </div>
      <ol className="space-y-4">
        {[
          {
            n: '1',
            label: 'Define assets',
            desc: 'Add generators (gas, solar, wind), storage (batteries), and electricity loads.',
          },
          {
            n: '2',
            label: 'Set the scenario',
            desc: 'Enter hourly profiles for load demand and available capacity per asset.',
          },
          {
            n: '3',
            label: 'Run optimization',
            desc: 'The solver finds the cheapest dispatch that meets load at every time step.',
          },
          {
            n: '4',
            label: 'Read results',
            desc: 'See the dispatch chart, total cost, and per-hour breakdown.',
          },
        ].map(({ n, label, desc }) => (
          <li key={n} className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              {n}
            </span>
            <div>
              <div className="text-sm font-medium text-gray-700">{label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400 text-center">
        Try the <span className="font-medium text-gray-500">Basic dispatch</span> or{' '}
        <span className="font-medium text-gray-500">Battery dispatch</span> examples above to get started.
      </p>
    </div>
  );
}

// ─── Error panel ──────────────────────────────────────────────────────────────

function ErrorPanel({ error }: { error: string }) {
  return (
    <div className="bg-white rounded-xl border border-red-200 p-6">
      <h3 className="text-sm font-semibold text-red-500 mb-2">Optimization failed</h3>
      <p className="text-sm text-gray-700">{error}</p>
      <div className="mt-4 p-3 bg-red-50 rounded-lg">
        <p className="text-xs font-medium text-red-600 mb-1">Common causes</p>
        <ul className="text-xs text-red-500 space-y-1 list-disc list-inside">
          <li>Total generator capacity is too low to meet load at some time step</li>
          <li>A load asset has no load profile defined in the Scenario section</li>
          <li>A capacity profile references an asset name that no longer exists</li>
        </ul>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [assets, setAssets] = useState<AssetsState>({ generators: [], loads: [], storage: [] });
  const [scenario, setScenario] = useState<ScenarioState>({
    number_of_steps: 24,
    timestep_hours: 1,
    load_profiles: {},
    available_capacity_profiles: {},
  });
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAssetsChange(nextAssets: AssetsState) {
    const nextScenario = propagateRenames(assets, nextAssets, scenario);
    setAssets(nextAssets);
    setScenario(nextScenario);
  }

  function loadExample(preset: { assets: AssetsState; scenario: ScenarioState }) {
    setAssets(preset.assets);
    setScenario(preset.scenario);
    setResult(null);
    setError(null);
  }

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const req = {
        assets: {
          generators: assets.generators.map(({ id: _id, ...rest }) => rest),
          loads: assets.loads.map(({ id: _id, ...rest }) => rest),
          storage: assets.storage.map(({ id: _id, ...rest }) => rest),
        },
        scenario,
      };
      const res = await runOptimization(req);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setRunning(false);
    }
  }

  const canRun = isRunnable(assets) && !running;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="shrink-0">
            <h1 className="text-lg font-semibold text-gray-900">Odys UI</h1>
            <p className="text-xs text-gray-400">Energy portfolio optimization</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className="text-xs text-gray-400 hidden sm:block">Examples:</span>
            <button
              onClick={() => loadExample(EXAMPLE_BASIC)}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
            >
              Basic dispatch
            </button>
            <button
              onClick={() => loadExample(EXAMPLE_BATTERY)}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
            >
              Battery dispatch
            </button>
            <div className="w-px h-5 bg-gray-200 mx-1 hidden sm:block" />
            <button
              onClick={handleRun}
              disabled={!canRun}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                canRun
                  ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {running ? (
                <span className="flex items-center gap-1.5">
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Running…
                </span>
              ) : (
                '▶ Run'
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Validation hint below header */}
        {!isRunnable(assets) && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-4">
            Add at least one generator and one load to enable the Run button.
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left column: configuration */}
          <div className="space-y-4">
            <AssetPanel assets={assets} onChange={handleAssetsChange} />
            <ScenarioPanel assets={assets} scenario={scenario} onChange={setScenario} />
          </div>

          {/* Right column: results — sticky so it stays visible while scrolling config */}
          <div className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto space-y-0">
            {result ? (
              <ResultsPanel result={result} />
            ) : error ? (
              <ErrorPanel error={error} />
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
