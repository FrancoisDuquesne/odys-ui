import Plot from 'react-plotly.js';
import type { OptimizeResponse } from '../types';

interface Props {
  result: OptimizeResponse;
}

const GEN_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const STORAGE_COLOR = '#6b7280';

export function ResultsPanel({ result }: Props) {
  if (result.status !== 'optimal') {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-5">
        <h3 className="text-sm font-semibold text-red-500 uppercase tracking-wide mb-2">
          {result.status === 'infeasible' ? 'No Feasible Solution' : 'Error'}
        </h3>
        <p className="text-sm text-gray-600">{result.message ?? 'An unknown error occurred.'}</p>
      </div>
    );
  }

  const hours = result.timesteps;

  // Dispatch chart traces — one per generator (stacked area)
  const genTraces: Plotly.Data[] = result.generators.map((gen, i) => ({
    x: hours,
    y: gen.power,
    name: gen.name,
    type: 'scatter',
    mode: 'lines',
    fill: i === 0 ? 'tozeroy' : 'tonexty',
    line: { color: GEN_COLORS[i % GEN_COLORS.length], width: 1.5 },
    fillcolor: GEN_COLORS[i % GEN_COLORS.length] + '55',
    hovertemplate: `%{y:.1f} MW<extra>${gen.name}</extra>`,
  }));

  // Storage net power as a separate line (positive = discharge, negative = charge)
  const storageTraces: Plotly.Data[] = result.storages.map(st => ({
    x: hours,
    y: st.net_power,
    name: `${st.name} (net)`,
    type: 'scatter',
    mode: 'lines',
    line: { color: STORAGE_COLOR, width: 2, dash: 'dot' },
    hovertemplate: `%{y:.1f} MW<extra>${st.name}</extra>`,
    yaxis: 'y',
  }));

  // SoC chart for storage
  const socTraces: Plotly.Data[] = result.storages.map(st => ({
    x: hours,
    y: st.soc,
    name: `${st.name} SoC`,
    type: 'scatter',
    mode: 'lines',
    line: { color: STORAGE_COLOR, width: 2 },
    hovertemplate: `%{y:.1f} MWh<extra>${st.name} SoC</extra>`,
  }));

  const dispatchLayout: Partial<Plotly.Layout> = {
    title: { text: 'Dispatch Schedule', font: { size: 14 } },
    xaxis: { title: 'Time step (h)', tickmode: 'linear', dtick: Math.ceil(hours.length / 12) },
    yaxis: { title: 'Power (MW)' },
    legend: { orientation: 'h', y: -0.25 },
    margin: { t: 40, b: 60, l: 50, r: 20 },
    hovermode: 'x unified',
    paper_bgcolor: 'transparent',
    plot_bgcolor: '#f9fafb',
    height: 320,
  };

  const socLayout: Partial<Plotly.Layout> = {
    title: { text: 'State of Charge', font: { size: 14 } },
    xaxis: { title: 'Time step (h)', tickmode: 'linear', dtick: Math.ceil(hours.length / 12) },
    yaxis: { title: 'SoC (MWh)' },
    legend: { orientation: 'h', y: -0.25 },
    margin: { t: 40, b: 60, l: 50, r: 20 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: '#f9fafb',
    height: 240,
  };

  const config: Partial<Plotly.Config> = { displayModeBar: false, responsive: true };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Status</div>
          <div className="text-sm font-semibold text-green-600">Optimal</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Total Cost</div>
          <div className="text-sm font-semibold text-gray-800">
            ${result.objective_value?.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Time Steps</div>
          <div className="text-sm font-semibold text-gray-800">{hours.length}</div>
        </div>
      </div>

      {/* Dispatch chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <Plot
          data={[...genTraces, ...storageTraces]}
          layout={dispatchLayout}
          config={config}
          style={{ width: '100%' }}
        />
      </div>

      {/* SoC chart (only if storage present) */}
      {result.storages.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <Plot
            data={socTraces}
            layout={socLayout}
            config={config}
            style={{ width: '100%' }}
          />
        </div>
      )}

      {/* Dispatch table */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-x-auto">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Dispatch Detail (MW)</h4>
        <table className="text-xs w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-1.5 pr-4 text-gray-500 font-medium">Step</th>
              {result.generators.map(g => (
                <th key={g.name} className="text-right py-1.5 px-3 text-gray-500 font-medium">{g.name}</th>
              ))}
              {result.storages.map(s => (
                <th key={s.name} className="text-right py-1.5 px-3 text-gray-500 font-medium">{s.name} net</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map(h => (
              <tr key={h} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-1 pr-4 text-gray-400">h{h}</td>
                {result.generators.map(g => (
                  <td key={g.name} className="text-right py-1 px-3 text-gray-700 font-mono">
                    {g.power[h]?.toFixed(1)}
                  </td>
                ))}
                {result.storages.map(s => (
                  <td key={s.name} className="text-right py-1 px-3 text-gray-700 font-mono">
                    {s.net_power[h]?.toFixed(1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
