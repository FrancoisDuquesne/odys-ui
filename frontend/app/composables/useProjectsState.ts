import type { Project } from "~/types";

// Shared across the sidebar (project switcher + nav counts) and every page.
export function useProjectsState() {
  const projects = useState<Project[]>("projects", () => []);
  const loaded = useState<boolean>("projects-loaded", () => false);

  // Set when the project list could not be fetched; the layout renders an
  // error state instead of the page so the app never hard-crashes.
  const error = useState<{ message: string; unreachable: boolean } | null>("projects-error", () => null);

  /** Never throws: failures land in `error`. Returns whether the load succeeded. */
  async function refresh() {
    const { listProjects } = useProjects();
    try {
      projects.value = await listProjects();
      loaded.value = true;
      error.value = null;
      return true;
    } catch (e: any) {
      error.value = {
        message: e?.data?.detail ? String(e.data.detail) : "Could not load projects.",
        unreachable: isBackendUnreachable(e),
      };
      return false;
    }
  }

  async function ensureLoaded() {
    if (!loaded.value) await refresh();
  }

  return { projects, loaded, error, refresh, ensureLoaded };
}

export function useCurrentProject() {
  const route = useRoute();
  const { projects } = useProjectsState();
  const currentProjectId = computed(() => Number(route.params.projectId));
  const currentProject = computed(() => projects.value.find((p) => p.id === currentProjectId.value) ?? null);
  return { currentProjectId, currentProject };
}
