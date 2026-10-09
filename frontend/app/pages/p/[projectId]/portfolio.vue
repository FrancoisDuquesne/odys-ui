<script setup lang="ts">
import type { Asset, AssetKind, PortfolioVersion } from "~/types";

const route = useRoute();
const router = useRouter();
const projectId = computed(() => Number(route.params.projectId));
const { currentProject } = useCurrentProject();
const { listPortfolioVersions, createPortfolioVersion } = usePortfolio();

const versions = ref<PortfolioVersion[]>([]);
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
    const latest = versions.value.at(-1);
    draftAssets.value = latest ? JSON.parse(JSON.stringify(latest.assets)) : [];
  } catch {
    loadError.value = "Could not load the portfolio.";
  } finally {
    loading.value = false;
  }
}
await load();

const latestVersion = computed(() => versions.value.at(-1) ?? null);
const dirty = computed(() => JSON.stringify(draftAssets.value) !== JSON.stringify(latestVersion.value?.assets ?? []));

onBeforeRouteLeave(() => {
  if (dirty.value && !saving.value) return window.confirm("You have unsaved portfolio changes. Leave without saving?");
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
      sub: `${plural(generators.length, "generator")}${ucCount ? ` · ${ucCount} with unit commitment` : ""}`,
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
  slideoverMode.value = "new";
  slideoverKind.value = kind;
  slideoverAsset.value = null;
  slideoverIndex.value = null;
  slideoverOpen.value = true;
  addMenuOpen.value = false;
}

function openEdit(asset: Asset) {
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

async function saveNewVersion() {
  saving.value = true;
  try {
    const created = await createPortfolioVersion(projectId.value, latestVersion.value?.name ?? "Core", draftAssets.value);
    await load();
    toast.add({ title: `Saved as v${created.version}`, description: "New runs will use this version; existing runs are unchanged.", color: "success", icon: "i-lucide-circle-check" });
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
          <UBadge v-if="latestVersion" color="neutral" variant="outline" size="sm" :label="`v${latestVersion.version} · saved ${fmtDate(latestVersion.created_at)}`" />
          <UTooltip :text="summary.milp ? 'Unit-commitment generators add binary variables, so this is a mixed-integer problem (slower to solve).' : 'No binary variables, so this solves as a linear program.'">
            <UBadge color="neutral" variant="subtle" size="sm" :label="summary.milp ? 'MILP' : 'LP'" />
          </UTooltip>
          <UBadge v-if="dirty" color="warning" variant="subtle" size="sm" label="Unsaved changes" />
        </template>
        <template #actions>
          <UButton v-if="dirty" color="neutral" variant="ghost" label="Discard" @click="discardChanges" />
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-play"
            label="Run"
            :disabled="!latestVersion"
            :title="dirty ? 'Runs use the last saved version' : undefined"
            @click="router.push(`/p/${projectId}/runs/new?portfolio=${latestVersion?.id ?? ''}`)"
          />
          <UButton :loading="saving" :disabled="!dirty" :label="`Save as v${(latestVersion?.version ?? 0) + 1}`" @click="saveNewVersion" />
        </template>
      </PageHeader>
    </template>

    <template #body>
      <PageSkeleton v-if="loading" />
      <ErrorState v-else-if="loadError" :message="loadError" @retry="load" />
      <div v-else class="flex flex-col gap-5">
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
            <UButton icon="i-lucide-plus" trailing-icon="i-lucide-chevron-down" label="Add asset" class="ml-auto" />
          </UDropdownMenu>
        </div>

        <div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          <AssetCard v-for="asset in filteredAssets" :key="asset.name" :asset="asset" :max-generator-power="maxGeneratorPower" @click="openEdit(asset)" />
        </div>
        <EmptyState
          v-if="filteredAssets.length === 0"
          icon="i-lucide-boxes"
          :title="draftAssets.length === 0 ? 'No assets yet' : 'No assets match this filter'"
          :description="draftAssets.length === 0 ? 'Add generators, storage, loads and markets to build a portfolio.' : 'Try a different type or search term.'"
        />
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
