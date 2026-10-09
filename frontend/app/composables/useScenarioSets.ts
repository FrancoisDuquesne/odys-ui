import type { ScenarioSet } from "~/types";

export function useScenarioSets() {
  const listScenarioSets = (projectId: number | string) =>
    apiFetch<ScenarioSet[]>(`/projects/${projectId}/scenario-sets`);

  const getScenarioSet = (id: number | string) => apiFetch<ScenarioSet>(`/scenario-sets/${id}`);

  return { listScenarioSets, getScenarioSet };
}
