<script setup lang="ts">
import type { Asset, AssetKind, PortfolioVersion } from "~/types";

const route = useRoute();
const router = useRouter();
const projectId = computed(() => Number(route.params.projectId));
const { currentProject } = useCurrentProject();
const { listPortfolioVersions, createPortfolioVersion } = usePortfolio();

const versions = ref<PortfolioVersion[]>([]);
const viewingId = ref<number | null>(null);
const loading = ref(true);
const draftAssets = ref<Asset[]>([]);
const saving = ref(false);

const loadError = ref<string | null>(null);
const toast = useToast();
async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    versions.value = await listPortfolioVersions(projectId.value);
    viewingId.value = null;
    const latest = latestVersion.value;
    draftAssets.value = latest ? JSON.parse(JSON.stringify(latest.assets)) : [];
  } catch {
    loadError.value = "Could not load the portfolio.";
  } finally {
    loading.value = false;
  }
}

// The portfolio shown is the most recently saved name; its versions form the browsable history.
const family = computed(() => groupVersions(versions.value).at(-1) ?? null);
const latestVersion = computed(() => family.value?.latest ?? null);
const history = computed(() =>
  [...(family.value?.versions ?? [])]
    .reverse()
    .map((v, i, arr) => ({ v, changes: arr[i + 1] ? diffAssets(arr[i + 1].assets, v.assets) : [] })),
);
const viewedVersion = computed(() => (viewingId.value === null ? null : (versions.value.find((v) => v.id === viewingId.value) ?? null)));
const viewingOld = computed(() => !!viewedVersion.value && viewedVersion.value.id !== latestVersion.value?.id);
const dirty = computed(() => !viewingOld.value && JSON.stringify(draftAssets.value) !== JSON.stringify(latestVersion.value?.assets ?? []));
const historyOpen = ref(false);

await load();

function viewVersion(v: PortfolioVersion) {
  if (dirty.value && !window.confirm("You have unsaved portfolio changes. Discard them to view another version?")) return;
  viewingId.value = v.id === latestVersion.value?.id ? null : v.id;
  draftAssets.value = JSON.parse(JSON.stringify(v.assets));
  historyOpen.value = false;
}

function backToLatest() {
  viewingId.value = null;
  discardChanges();
}

onBeforeRouteLeave(() => {
  if (dirty.value && !saving.value) return window.confirm("You have unsaved portfolio changes. Leave without saving?");
});

// Saving overwrites the latest version while nothing has run against it (it is still a draft).
const saveLabel = computed(() => {
  const l = latestVersion.value;
  if (!l) return "Save";
  return l.run_count === 0 && l.version > 1 ? "Save changes" : l.run_count === 0 ? "Save" : `Save as v${l.version + 1}`;
});

function discardChanges() {
  draftAssets.value = JSON.parse(JSON.stringify(latestVersion.value?.assets ?? []));
}

// ---- summary strip ---------------------------------------------------------
const summary = computed(() => {
  const generators = draftAssets.value.filter((a): a is Extract<Asset, { kind: "generator" }> => a.kind === "generator");
  const storages = draftAssets.value.filter((a): a is Extract<Asset, { kind: "storage" }> => a.kind === "storage");
  const markets = draftAssets.value.filter((a): a is Extract<Asset, { kind: "market" }> => a.kind === "market");
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const power = generators.reduce((s, g) => s + g.nominal_power, 0);
  const storageCap = storages.reduce((s, g) => s + g.capacity, 0);
  const storagePower = storages.reduce((s, g) => s + g.max_power, 0);
  const ucCount = generators.filter((g) => g.unit_commitment).length;
  const colors = assetColorMap(draftAssets.value);
  return {
    generation: {
      value: fmtMW(power),
      sub: `${plural(generators.length, "generator")}${ucCount ? ` · ${ucCount} with on/off scheduling` : ""}`,
      segments: generators.map((g) => ({ name: g.name, value: g.nominal_power, color: colors[g.name] })),
    },
    storage: {
      value: fmtMWh(storageCap),
      // Duration at full power: the number that actually characterises a battery.
      sub: storages.length ? `${fmtMW(storagePower)} max power${storagePower > 0 ? ` · ${fmtNum(storageCap / storagePower, 1)} h` : ""}` : "No storage",
    },
    market: {
      value: markets.length ? `±${fmtMW(markets.reduce((s, m) => s + m.max_trading_volume_per_step, 0))}` : "—",
      sub: markets.length ? `${plural(markets.length, "market")} · max per step` : "No market access",
    },
    milp: ucCount > 0,
  };
});

const maxGeneratorPower = computed(() =>
  Math.max(1, ...draftAssets.value.filter((a) => a.kind === "generator").map((a) => (a as any).nominal_power)),
);

// ---- filter / search --------------------------------------------------------
const filterKind = ref<"all" | AssetKind>("all");
const query = ref("");

const counts = computed(() => ({
  all: draftAssets.value.length,
  generator: draftAssets.value.filter((a) => a.kind === "generator").length,
  storage: draftAssets.value.filter((a) => a.kind === "storage").length,
  load: draftAssets.value.filter((a) => a.kind === "load").length,
  market: draftAssets.value.filter((a) => a.kind === "market").length,
}));

const filters = computed(() => [
  { value: "all" as const, label: "All", count: counts.value.all },
  { value: "generator" as const, label: "Generators", count: counts.value.generator },
  { value: "storage" as const, label: "Storage", count: counts.value.storage },
  { value: "load" as const, label: "Loads", count: counts.value.load },
  { value: "market" as const, label: "Markets", count: counts.value.market },
]);

const filteredAssets = computed(() => {
  let list = draftAssets.value;
  if (filterKind.value !== "all") list = list.filter((a) => a.kind === filterKind.value);
  const q = query.value.trim().toLowerCase();
  if (q) list = list.filter((a) => a.name.toLowerCase().includes(q));
  return list;
});

// ---- slideover ---------------------------------------------------------------
const slideoverOpen = ref(false);
const slideoverMode = ref<"new" | "edit">("new");
const slideoverKind = ref<AssetKind>("generator");
const slideoverAsset = ref<Asset | null>(null);
const slideoverIndex = ref<number | null>(null);
const addMenuOpen = ref(false);

function openAdd(kind: AssetKind) {
  if (viewingOld.value) return;
  slideoverMode.value = "new";
  slideoverKind.value = kind;
  slideoverAsset.value = null;
  slideoverIndex.value = null;
  slideoverOpen.value = true;
  addMenuOpen.value = false;
}

function openEdit(asset: Asset) {
  if (viewingOld.value) return;
  const idx = draftAssets.value.indexOf(asset);
  slideoverMode.value = "edit";
  slideoverKind.value = asset.kind;
  slideoverAsset.value = asset;
  slideoverIndex.value = idx;
  slideoverOpen.value = true;
}

function onSubmit(asset: Asset) {
  if (slideoverMode.value === "edit" && slideoverIndex.value !== null) {
    draftAssets.value.splice(slideoverIndex.value, 1, asset);
  } else {
    draftAssets.value.push(asset);
  }
  slideoverOpen.value = false;
}

function onRemove() {
  if (slideoverIndex.value !== null) draftAssets.value.splice(slideoverIndex.value, 1);
  slideoverOpen.value = false;
}

const addTypes: { kind: AssetKind; label: string; desc: string; icon: string }[] = [
  { kind: "generator", label: "Generator", desc: "Dispatchable or variable source", icon: "i-lucide-zap" },
  { kind: "storage", label: "Storage", desc: "Battery or pumped hydro", icon: "i-lucide-battery" },
  { kind: "load", label: "Load", desc: "Fixed or flexible demand", icon: "i-lucide-plug" },
  { kind: "market", label: "Energy market", desc: "Spot market to buy / sell", icon: "i-lucide-trending-up" },
];

const duplicating = ref(false);
const startingExample = ref(false);

function apiErrorText(e: any, fallback: string) {
  const d = e?.data?.detail;
  return Array.isArray(d) ? d.map((x: any) => `${(x.loc ?? []).slice(-1)[0]}: ${x.msg}`).join("; ") : typeof d === "string" ? d : fallback;
}

async function duplicatePortfolio() {
  if (!latestVersion.value) return;
  duplicating.value = true;
  try {
    const name = `${latestVersion.value.name} copy`;
    await createPortfolioVersion(projectId.value, name, JSON.parse(JSON.stringify(latestVersion.value.assets)));
    await load();
    toast.add({ title: `Duplicated as “${name}”`, description: "Edit the copy freely; the original and its runs are unchanged.", color: "success", icon: "i-lucide-copy" });
  } catch (e: any) {
    toast.add({ title: "Could not duplicate portfolio", description: apiErrorText(e, "The backend rejected the request."), color: "error" });
  } finally {
    duplicating.value = false;
  }
}

async function startFromExample() {
  startingExample.value = true;
  try {
    await createPortfolioVersion(projectId.value, latestVersion.value?.name ?? "Core", exampleAssets());
    await load();
    toast.add({ title: "Example portfolio added", description: "Wind, gas, a battery, site demand and a day-ahead market. Edit anything you like.", color: "success", icon: "i-lucide-circle-check" });
  } catch (e: any) {
    toast.add({ title: "Could not add the example", description: apiErrorText(e, "The backend rejected the portfolio."), color: "error" });
  } finally {
    startingExample.value = false;
  }
}

async function saveNewVersion() {
  saving.value = true;
  try {
    const restoredFrom = viewingOld.value ? viewedVersion.value : null;
    const created = await createPortfolioVersion(projectId.value, latestVersion.value?.name ?? "Core", draftAssets.value);
    await load();
    toast.add({
      title: restoredFrom ? `Restored v${restoredFrom.version} as v${created.version}` : `Saved as v${created.version}`,
      description: "New runs will use this version; existing runs are unchanged.",
      color: "success",
      icon: "i-lucide-circle-check",
    });
  } catch (e: any) {
    const d = e?.data?.detail;
    toast.add({
      title: "Could not save portfolio",
      description: Array.isArray(d) ? d.map((x: any) => `${(x.loc ?? []).slice(-1)[0]}: ${x.msg}`).join("; ") : typeof d === "string" ? d : "The backend rejected the portfolio.",
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <PageHeader :crumbs="[{ label: currentProject?.name ?? 'Project', to: `/p/${projectId}/runs` }, { label: `Portfolio · ${latestVersion?.name ?? 'Core'}` }]">
        <template #meta>
          <UPopover v-if="family" v-model:open="historyOpen" :content="{ align: 'start' }">
            <UButton
              color="neutral"
              variant="outline"
              size="xs"
              icon="i-lucide-history"
              trailing-icon="i-lucide-chevron-down"
              :label="`v${(viewedVersion ?? latestVersion)!.version} · ${fmtDate((viewedVersion ?? latestVersion)!.created_at)}`"
              aria-label="Version history"
            />
            <template #content>
              <div class="max-h-96 w-80 overflow-y-auto p-1.5">
                <p class="px-2 pb-1 pt-1.5 text-xs font-medium text-muted">Version history · {{ family.name }}</p>
                <button
                  v-for="{ v, changes } in history"
                  :key="v.id"
                  type="button"
                  class="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-elevated"
                  :class="(viewedVersion ?? latestVersion)?.id === v.id ? 'bg-elevated' : ''"
                  @click="viewVersion(v)"
                >
                  <span class="flex items-center gap-2 text-sm">
                    <span class="font-medium">v{{ v.version }}</span>
                    <UBadge v-if="v.id === latestVersion?.id" color="primary" variant="subtle" size="sm" label="Latest" />
                    <span class="ml-auto text-xs text-muted">{{ fmtDate(v.created_at) }}</span>
                  </span>
                  <span class="text-xs text-muted">{{ v.run_count }} {{ v.run_count === 1 ? "run" : "runs" }}<template v-if="changes.length"> · {{ changes.slice(0, 3).join(" · ") }}<template v-if="changes.length > 3"> · +{{ changes.length - 3 }} more</template></template><template v-else-if="v.version === 1"> · first version</template><template v-else> · no changes</template></span>
                </button>
              </div>
            </template>
          </UPopover>
          <UTooltip :text="summary.milp ? 'Some generators have on/off scheduling, so runs take longer to solve (odys: mixed-integer program, MILP).' : 'All assets are continuous, so runs solve quickly (odys: linear program, LP).'">
            <UBadge color="neutral" variant="subtle" size="sm" :label="summary.milp ? 'Includes on/off decisions' : 'Continuous only'" />
          </UTooltip>
          <UBadge v-if="dirty" color="warning" variant="subtle" size="sm" label="Unsaved changes" />
        </template>
        <template #actions>
          <UButton v-if="dirty" color="neutral" variant="ghost" label="Discard" @click="discardChanges" />
          <UButton v-if="viewingOld" color="neutral" variant="ghost" label="Back to latest" @click="backToLatest" />
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-play"
            label="Run"
            :disabled="!latestVersion"
            :title="dirty ? 'Runs use the last saved version' : undefined"
            @click="router.push(`/p/${projectId}/runs/new?portfolio=${(viewedVersion ?? latestVersion)?.id ?? ''}`)"
          />
          <UButton
            v-if="latestVersion && !dirty && !viewingOld"
            color="neutral"
            variant="ghost"
            icon="i-lucide-copy"
            label="Duplicate"
            :loading="duplicating"
            title="Save a copy of this portfolio under a new name to try variations"
            @click="duplicatePortfolio"
          />
          <UButton v-if="viewingOld" :loading="saving" icon="i-lucide-rotate-ccw" :label="`Restore v${viewedVersion?.version} as latest`" @click="saveNewVersion" />
          <UButton v-else :loading="saving" :disabled="!dirty" :label="saveLabel" @click="saveNewVersion" />
        </template>
      </PageHeader>
    </template>

    <template #body>
      <PageSkeleton v-if="loading" />
      <ErrorState v-else-if="loadError" :message="loadError" @retry="load" />
      <div v-else class="flex flex-col gap-5">
        <UAlert
          v-if="viewingOld"
          color="neutral"
          variant="subtle"
          icon="i-lucide-history"
          :title="`Viewing v${viewedVersion?.version} (read-only)`"
          :description="`Saved ${fmtDate(viewedVersion!.created_at)} · ${viewedVersion!.run_count} ${viewedVersion!.run_count === 1 ? 'run' : 'runs'} used it. Restore it to make it the latest version, or go back.`"
        />
        <div class="grid gap-3 md:grid-cols-3">
          <KpiCard label="Dispatchable capacity" :icon="ASSET_KIND_ICON.generator" :value="summary.generation.value" :sub="summary.generation.sub">
            <div v-if="summary.generation.segments.length" class="mt-2 flex h-1.5 gap-px overflow-hidden rounded-full">
              <UTooltip v-for="seg in summary.generation.segments" :key="seg.name" :text="`${seg.name} · ${fmtMW(seg.value)}`" class="min-w-0" :style="{ flex: `${seg.value} 1 0%` }">
                <div class="h-full w-full" :style="{ background: seg.color }" />
              </UTooltip>
            </div>
          </KpiCard>
          <KpiCard label="Storage energy" :icon="ASSET_KIND_ICON.storage" :value="summary.storage.value" :sub="summary.storage.sub" />
          <KpiCard label="Market access" :icon="ASSET_KIND_ICON.market" :value="summary.market.value" :sub="summary.market.sub" />
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <SegmentedControl v-model="filterKind" label="Filter assets by type" :items="filters" />
          <UInput v-model="query" icon="i-lucide-search" placeholder="Filter by name" aria-label="Filter assets by name" class="w-52" />
          <UDropdownMenu
            v-model:open="addMenuOpen"
            :items="[addTypes.map((t) => ({ label: t.label, description: t.desc, icon: t.icon, onSelect: () => openAdd(t.kind) }))]"
            :content="{ align: 'end' }"
            :ui="{ content: 'w-65' }"
          >
            <UButton v-if="!viewingOld" icon="i-lucide-plus" trailing-icon="i-lucide-chevron-down" label="Add asset" class="ml-auto" />
          </UDropdownMenu>
        </div>

        <div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          <AssetCard v-for="asset in filteredAssets" :key="asset.name" :asset="asset" :max-generator-power="maxGeneratorPower" @click="openEdit(asset)" />
        </div>
        <EmptyState
          v-if="filteredAssets.length === 0"
          icon="i-lucide-boxes"
          :title="draftAssets.length === 0 ? 'No assets yet' : 'No assets match this filter'"
          :description="draftAssets.length === 0 ? 'A portfolio is the set of plants, batteries, demand and markets you want to optimize. Start from a ready-made example or add your own.' : 'Try a different type or search term.'"
        >
          <div v-if="draftAssets.length === 0" class="flex flex-wrap justify-center gap-2">
            <UButton icon="i-lucide-sparkles" label="Start from example" :loading="startingExample" @click="startFromExample" />
            <UButton color="neutral" variant="outline" icon="i-lucide-plus" label="Add first asset" @click="openAdd('generator')" />
          </div>
        </EmptyState>
      </div>
    </template>
  </UDashboardPanel>

  <AssetSlideover
    v-model:open="slideoverOpen"
    :mode="slideoverMode"
    :kind="slideoverKind"
    :asset="slideoverAsset"
    :existing-names="draftAssets.map((a) => a.name)"
    @submit="onSubmit"
    @remove="onRemove"
  />
</template>
