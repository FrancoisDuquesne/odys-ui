<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

const router = useRouter();
const { projects } = useProjectsState();
const { currentProject } = useCurrentProject();
const { createProject } = useProjects();
const { refresh } = useProjectsState();
const toast = useToast();

const showNewProject = ref(false);
const newName = ref("");
const newClient = ref("");
const creating = ref(false);

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const groups = computed(() => {
  const byClient = new Map<string, typeof projects.value>();
  for (const p of projects.value) {
    if (!byClient.has(p.client)) byClient.set(p.client, []);
    byClient.get(p.client)!.push(p);
  }
  return [...byClient.entries()];
});

const items = computed<DropdownMenuItem[][]>(() => {
  const groupItems: DropdownMenuItem[] = [];
  for (const [client, projs] of groups.value) {
    groupItems.push({ type: "label", label: client });
    for (const p of projs) {
      groupItems.push({
        label: p.name,
        description: `${p.run_count} runs`,
        icon: p.id === currentProject.value?.id ? "i-lucide-check" : undefined,
        onSelect: () => router.push(`/p/${p.id}/runs`),
      });
    }
  }
  return [
    groupItems,
    [
      { label: "All projects", icon: "i-lucide-layout-grid", onSelect: () => router.push("/projects?all=1") },
      { label: "New project", icon: "i-lucide-plus", onSelect: () => (showNewProject.value = true) },
    ],
  ];
});

async function submitNewProject() {
  if (!newName.value || !newClient.value) return;
  creating.value = true;
  try {
    const project = await createProject({ name: newName.value, client: newClient.value });
    await refresh();
    showNewProject.value = false;
    newName.value = "";
    newClient.value = "";
    toast.add({ title: `Created ${project.name}`, color: "success", icon: "i-lucide-circle-check" });
    router.push(`/p/${project.id}/runs`);
  } catch {
    toast.add({ title: "Could not create project", description: "Check that the backend is running.", color: "error" });
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'start', side: 'bottom' }" :ui="{ content: 'w-68' }">
    <button
      class="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-elevated"
      type="button"
      aria-label="Switch project"
    >
      <span
        class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md text-xs font-bold"
        :class="currentProject ? 'text-inverted' : 'bg-elevated text-muted'"
        :style="currentProject ? { background: currentProject.color } : undefined"
      >
        <template v-if="currentProject">{{ initials(currentProject.name) }}</template>
        <UIcon v-else name="i-lucide-layout-grid" class="size-4" />
      </span>
      <span class="flex min-w-0 flex-col leading-tight">
        <span class="truncate text-sm font-semibold text-highlighted">
          {{ currentProject?.name ?? "All projects" }}
        </span>
        <span class="truncate text-xs text-muted">{{ currentProject?.client ?? "" }}</span>
      </span>
      <UIcon name="i-lucide-chevrons-up-down" class="ml-auto size-4 shrink-0 text-muted" />
    </button>
  </UDropdownMenu>

  <UModal v-model:open="showNewProject" title="New project">
    <template #body>
      <div class="flex flex-col gap-3">
        <UFormField label="Project / site name">
          <UInput v-model="newName" placeholder="e.g. Kestrel Ridge" class="w-full" />
        </UFormField>
        <UFormField label="Client">
          <UInput v-model="newClient" placeholder="e.g. Northbay Energy" class="w-full" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" label="Cancel" @click="showNewProject = false" />
      <UButton label="Create project" :loading="creating" :disabled="!newName || !newClient" @click="submitNewProject" />
    </template>
  </UModal>
</template>
