import type { ObjectiveConfig, Run, SolverConfig } from "~/types";

export interface RunCreateBody {
  portfolio_version_id: number;
  scenario_set_version_id: number;
  objective: ObjectiveConfig;
  solver: SolverConfig;
  rerun_from_run_id?: number | null;
}

export function useRuns() {
  const listRuns = (projectId: number | string) => apiFetch<Run[]>(`/projects/${projectId}/runs`);
  const getRun = (id: number | string) => apiFetch<Run>(`/runs/${id}`);
  const createRun = (projectId: number | string, body: RunCreateBody, signal?: AbortSignal) =>
    apiFetch<Run>(`/projects/${projectId}/runs`, { method: "POST", body, signal });

  const createSweep = (
    projectId: number | string,
    body: {
      portfolio_version_id: number;
      scenario_set_version_id: number;
      solver: SolverConfig;
      profit_weight: number;
      confidence_level: number;
      cvar_weights: number[];
    },
  ) => apiFetch<Run[]>(`/projects/${projectId}/sweeps`, { method: "POST", body });

  const uploadActuals = (runId: number | string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch(`/runs/${runId}/actuals`, { method: "POST", body: form });
  };

  return { listRuns, getRun, createRun, createSweep, uploadActuals };
}
