import type { ScenarioDef, ScenarioSet } from "~/types";

export interface ScenarioSetDraft {
  name: string;
  mode: ScenarioSet["mode"];
  number_of_steps: number;
  timestep_hours: number;
  scenarios: ScenarioDef[];
}

export function useScenarioSets() {
  const listScenarioSets = (projectId: number | string) =>
    apiFetch<ScenarioSet[]>(`/projects/${projectId}/scenario-sets`);

  const getScenarioSet = (id: number | string) => apiFetch<ScenarioSet>(`/scenario-sets/${id}`);

  const createScenarioSet = (projectId: number | string, body: ScenarioSetDraft) =>
    apiFetch<ScenarioSet>(`/projects/${projectId}/scenario-sets`, { method: "POST", body });

  const uploadScenarioCsv = (projectId: number | string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return apiFetch<ScenarioSet>(`/projects/${projectId}/scenario-sets/csv`, { method: "POST", body });
  };

  return { listScenarioSets, getScenarioSet, createScenarioSet, uploadScenarioCsv };
}
