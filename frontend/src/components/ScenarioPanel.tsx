import { useState } from 'react';
import type { AssetsState, ScenarioState } from '../types';

interface Props {
  assets: AssetsState;
  scenario: ScenarioState;
  onChange: (scenario: ScenarioState) => void;
}

function ProfileGrid({
  label,
  assetName,
  values,
  onChange,
  steps,
}: {
  label: string;
  assetName: string;
  values: number[];
  onChange: (values: number[]) => void;
  steps: number;
}) {
  const filled = Array.from({ length: steps }, (_, i) => values[i] ?? 0);
  const [fillVal, setFillVal] = useState('');

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-xs text-gray-400">— {assetName}</span>
        <span className="ml-auto flex items-center gap-1">
          <span className="text-[10px] text-gray-400">Fill all:</span>
          <input
            type="number"
            value={fillVal}
            onChange={e => setFillVal(e.target.value)}
            placeholder="value"
            className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={() => {
              if (fillVal !== '') {
                onChange(Array(steps).fill(parseFloat(fillVal) || 0));
                setFillVal('');
              }
            }}
            className="text-[10px] px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 transition-colors"
          >
            Apply
          </button>
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {filled.map((v, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-gray-400">h{i}</span>
            <input
              type="number"
              value={v}
              min={0}
              step={1}
              onChange={e => {
                const next = [...filled];
                next[i] = parseFloat(e.target.value) || 0;
                onChange(next);
              }}
              className="w-14 border border-gray-200 rounded px-1 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScenarioPanel({ assets, scenario, onChange }: Props) {
  const updateLoadProfile = (name: string, values: number[]) => {
    onChange({ ...scenario, load_profiles: { ...scenario.load_profiles, [name]: values } });
  };

  const updateCapacityProfile = (name: string, values: number[]) => {
    onChange({ ...scenario, available_capacity_profiles: { ...scenario.available_capacity_profiles, [name]: values } });
  };

  const steps = scenario.number_of_steps;
  const namedLoads = assets.loads.filter(l => l.name);
  const namedGens = assets.generators.filter(g => g.name);
  const namedStorage = assets.storage.filter(s => s.name);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Scenario</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-4">
        Time-series data for this optimization run. All profiles must have exactly {steps} values.
      </p>

      <div className="flex gap-4 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Time steps</label>
          <input
            type="number"
            value={steps}
            min={1}
            max={168}
            onChange={e => onChange({ ...scenario, number_of_steps: parseInt(e.target.value) || 1 })}
            className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <p className="text-[10px] text-gray-400 mt-0.5">max 168 (1 week)</p>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Step duration (hours)</label>
          <input
            type="number"
            value={scenario.timestep_hours}
            min={0.25}
            step={0.25}
            onChange={e => onChange({ ...scenario, timestep_hours: parseFloat(e.target.value) || 1 })}
            className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <p className="text-[10px] text-gray-400 mt-0.5">e.g. 1 = hourly, 0.5 = 30 min</p>
        </div>
      </div>

      {namedLoads.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Load profiles (MW)</h4>
          <p className="text-[11px] text-gray-400 mb-3">
            Electricity demand at each time step. This is what the optimizer must always satisfy.
          </p>
          {namedLoads.map(load => (
            <ProfileGrid
              key={load.id}
              label="Demand"
              assetName={load.name}
              values={scenario.load_profiles[load.name] ?? []}
              onChange={v => updateLoadProfile(load.name, v)}
              steps={steps}
            />
          ))}
        </div>
      )}

      {namedGens.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Available capacity profiles (MW)</h4>
          <p className="text-[11px] text-gray-400 mb-3">
            Maximum output each generator can produce at each step. For solar/wind, enter the generation curve.
            For always-available assets (gas, hydro), set to nominal power.
            Storage availability is determined by its charge state — no profile needed.
          </p>
          {namedGens.map(gen => (
            <ProfileGrid
              key={gen.id}
              label="Capacity"
              assetName={gen.name}
              values={scenario.available_capacity_profiles[gen.name] ?? Array(steps).fill(gen.nominal_power)}
              onChange={v => updateCapacityProfile(gen.name, v)}
              steps={steps}
            />
          ))}
        </div>
      )}

      {namedLoads.length === 0 && namedGens.length === 0 && (
        <p className="text-sm text-gray-400 italic">Add and name assets above to configure time-series data here.</p>
      )}
    </div>
  );
}
