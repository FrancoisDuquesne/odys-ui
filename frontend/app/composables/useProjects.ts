import type { Project } from "~/types";

export function useProjects() {
  const listProjects = () => apiFetch<Project[]>("/projects");
  const createProject = (body: { name: string; client: string; color?: string }) =>
    apiFetch<Project>("/projects", { method: "POST", body });

  return { listProjects, createProject };
}
