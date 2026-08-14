import { useState } from 'react';
import type { AssetsState, GeneratorInput, LoadInput, StorageInput } from '../types';

interface Props {
  assets: AssetsState;
  onChange: (assets: AssetsState) => void;
}

let idCounter = 0;
const uid = () => `id-${++idCounter}`;

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{title}</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-4">{description}</p>
      {children}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
    >
      <span className="text-lg leading-none">+</span> {label}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-gray-400 hover:text-red-500 text-lg leading-none"
      title="Remove"
    >
      ×
    </button>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-28 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
    />
  );
}

function NumberInput({ value, onChange, min, step }: { value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min ?? 0}
      step={step ?? 1}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
    />
  );
}

export function AssetPanel({ assets, onChange }: Props) {
  const updateGenerators = (generators: GeneratorInput[]) => onChange({ ...assets, generators });
  const updateLoads = (loads: LoadInput[]) => onChange({ ...assets, loads });
  const updateStorage = (storage: StorageInput[]) => onChange({ ...assets, storage });

  return (
    <div className="space-y-4">
      {/* Generators */}
      <SectionCard title="Generators" description="Dispatchable power sources. Cheaper generators (lower variable cost) are dispatched first.">
        <div className="space-y-4">
          {assets.generators.map((gen, i) => (
            <div key={gen.id} className="space-y-2 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Generator {i + 1}</span>
                <RemoveButton onClick={() => updateGenerators(assets.generators.filter(g => g.id !== gen.id))} />
              </div>
              <FieldRow label="Name">
                <TextInput
                  value={gen.name}
                  onChange={v => updateGenerators(assets.generators.map(g => g.id === gen.id ? { ...g, name: v } : g))}
                  placeholder="e.g. ccgt"
                />
              </FieldRow>
              <FieldRow label="Capacity (MW)">
                <NumberInput
                  value={gen.nominal_power}
                  onChange={v => updateGenerators(assets.generators.map(g => g.id === gen.id ? { ...g, nominal_power: v } : g))}
                  min={0}
                />
              </FieldRow>
              <FieldRow label="Variable cost ($/MWh)">
                <div className="flex-1">
                  <NumberInput
                    value={gen.variable_cost}
                    onChange={v => updateGenerators(assets.generators.map(g => g.id === gen.id ? { ...g, variable_cost: v } : g))}
                    min={0}
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Set to 0 for zero-marginal-cost sources (solar, wind)</p>
                </div>
              </FieldRow>
            </div>
          ))}
        </div>
        <AddButton
          label="Add generator"
          onClick={() => updateGenerators([...assets.generators, { id: uid(), name: '', nominal_power: 100, variable_cost: 50 }])}
        />
      </SectionCard>

      {/* Loads */}
      <SectionCard title="Loads" description="Fixed electricity demand that must be met at every time step. Load profile is set in the Scenario section.">
        <div className="space-y-3">
          {assets.loads.map((load, i) => (
            <div key={load.id} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-28 shrink-0">Load {i + 1} name</span>
              <TextInput
                value={load.name}
                onChange={v => updateLoads(assets.loads.map(l => l.id === load.id ? { ...l, name: v } : l))}
                placeholder="e.g. demand"
              />
              <RemoveButton onClick={() => updateLoads(assets.loads.filter(l => l.id !== load.id))} />
            </div>
          ))}
        </div>
        <AddButton
          label="Add load"
          onClick={() => updateLoads([...assets.loads, { id: uid(), name: '' }])}
        />
      </SectionCard>

      {/* Storage */}
      <SectionCard title="Storage" description="Batteries or pumped hydro. Charges when excess generation is available; discharges when demand exceeds generation.">
        <div className="space-y-4">
          {assets.storage.map((st, i) => (
            <div key={st.id} className="space-y-2 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Storage {i + 1}</span>
                <RemoveButton onClick={() => updateStorage(assets.storage.filter(s => s.id !== st.id))} />
              </div>
              <FieldRow label="Name">
                <TextInput
                  value={st.name}
                  onChange={v => updateStorage(assets.storage.map(s => s.id === st.id ? { ...s, name: v } : s))}
                  placeholder="e.g. battery"
                />
              </FieldRow>
              <FieldRow label="Capacity (MWh)">
                <NumberInput
                  value={st.capacity}
                  onChange={v => updateStorage(assets.storage.map(s => s.id === st.id ? { ...s, capacity: v } : s))}
                />
              </FieldRow>
              <FieldRow label="Max power (MW)">
                <NumberInput
                  value={st.max_power}
                  onChange={v => updateStorage(assets.storage.map(s => s.id === st.id ? { ...s, max_power: v } : s))}
                />
              </FieldRow>
              <FieldRow label="Initial SoC (MWh)">
                <div className="flex-1">
                  <NumberInput
                    value={st.soc_start}
                    step={0.1}
                    onChange={v => updateStorage(assets.storage.map(s => s.id === st.id ? { ...s, soc_start: v } : s))}
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">State of charge at the start of the planning horizon</p>
                </div>
              </FieldRow>
              <FieldRow label="Final SoC (MWh)">
                <div className="flex-1">
                  <NumberInput
                    value={st.soc_end}
                    step={0.1}
                    onChange={v => updateStorage(assets.storage.map(s => s.id === st.id ? { ...s, soc_end: v } : s))}
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Required charge at end (0 = optimizer chooses freely)</p>
                </div>
              </FieldRow>
            </div>
          ))}
        </div>
        <AddButton
          label="Add storage"
          onClick={() => updateStorage([...assets.storage, { id: uid(), name: '', capacity: 100, max_power: 50, soc_start: 0, soc_end: 0 }])}
        />
      </SectionCard>
    </div>
  );
}
