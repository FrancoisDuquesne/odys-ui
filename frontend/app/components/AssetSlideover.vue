<script setup lang="ts">
import type { Asset, AssetKind, GeneratorAsset, LoadAsset, MarketAsset, StorageAsset } from "~/types";

const props = defineProps<{
  open: boolean;
  mode: "new" | "edit";
  kind: AssetKind;
  asset: Asset | null;
  existingNames?: string[];
}>();

const emit = defineEmits<{
  "update:open": [boolean];
  submit: [Asset];
  remove: [];
}>();

function blankGenerator(): GeneratorAsset {
  return {
    kind: "generator",
    name: "",
    nominal_power: 100,
    variable_cost: 30,
    unit_commitment: false,
    min_power: 0,
    ramp_up: null,
    ramp_down: null,
    min_up_time: 1,
    min_down_time: 1,
    startup_cost: 0,
    shutdown_cost: null,
    color: null,
  };
}
function blankStorage(): StorageAsset {
  return {
    kind: "storage",
    name: "",
    capacity: 100,
    max_power: 25,
    soc_start: 0.5,
    soc_end: 0.5,
    soc_min: 0,
    soc_max: 1,
    efficiency_charging: 1,
    efficiency_discharging: 1,
    degradation_cost: null,
    self_discharge_rate: null,
    color: null,
  };
}
function blankLoad(): LoadAsset {
  return { kind: "load", name: "", type: "fixed", variable_cost_to_increase: null, variable_cost_to_decrease: null, color: null };
}
function blankMarket(): MarketAsset {
  return { kind: "market", name: "", max_trading_volume_per_step: 50, trade_direction: "buy_and_sell", stage_fixed: false, color: null };
}

function blankFor(kind: AssetKind): Asset {
  if (kind === "generator") return blankGenerator();
  if (kind === "storage") return blankStorage();
  if (kind === "load") return blankLoad();
  return blankMarket();
}

const draft = ref<Asset>(blankFor(props.kind));

watch(
  () => [props.open, props.asset, props.kind] as const,
  ([open, asset, kind]) => {
    if (!open) return;
    draft.value = asset ? (JSON.parse(JSON.stringify(asset)) as Asset) : blankFor(kind);
  },
  { immediate: true },
);

const title = computed(() => (props.mode === "edit" ? `Edit ${draft.value.name || "asset"}` : `Add ${KIND_LABEL[props.kind].toLowerCase()}`));
const className: Record<AssetKind, string> = { generator: "Generator", storage: "Storage", load: "Load", market: "Market" };
const KIND_LABEL = ASSET_KIND_LABEL;

// ---- validation -----------------------------------------------------------
const socFields = computed(() => {
  if (draft.value.kind !== "storage") return [];
  const s = draft.value;
  return [
    { key: "soc_start", v: s.soc_start },
    { key: "soc_end", v: s.soc_end },
    { key: "soc_min", v: s.soc_min },
    { key: "soc_max", v: s.soc_max },
    { key: "efficiency_charging", v: s.efficiency_charging },
    { key: "efficiency_discharging", v: s.efficiency_discharging },
  ];
});

const socOutOfUnitRange = computed(() => socFields.value.some((f) => f.v !== null && f.v !== undefined && (f.v < 0 || f.v > 1)));

const socOutOfBand = computed(() => {
  if (draft.value.kind !== "storage") return false;
  const s = draft.value;
  const checks = [s.soc_start, s.soc_end].filter((v): v is number => v !== null && v !== undefined);
  return checks.some((v) => v < s.soc_min || v > s.soc_max);
});

const nameFormatValid = computed(() => /^[A-Za-z0-9 _]+$/.test(draft.value.name.trim()) && draft.value.name.trim().length > 0);
const nameTaken = computed(() => {
  const mine = props.mode === "edit" ? props.asset?.name : null;
  const name = draft.value.name.trim().toLowerCase();
  return (props.existingNames ?? []).some((n) => n !== mine && n.toLowerCase() === name);
});
const nameError = computed(() => {
  if (!draft.value.name) return undefined; // don't nag before the user types
  if (!nameFormatValid.value) return "Letters, digits, spaces and underscores only.";
  if (nameTaken.value) return "Another asset already uses this name.";
  return undefined;
});
const nameValid = computed(() => nameFormatValid.value && !nameTaken.value);

const socWindowInvalid = computed(() => draft.value.kind === "storage" && draft.value.soc_min > draft.value.soc_max);

const canSave = computed(() => nameValid.value && !socOutOfUnitRange.value && !socOutOfBand.value && !socWindowInvalid.value);

function submit() {
  if (!canSave.value) return;
  emit("submit", draft.value);
}
</script>

<template>
  <USlideover :open="open" side="right" :ui="{ content: 'max-w-[540px]' }" @update:open="(v) => $emit('update:open', v)">
    <template #content>
      <div class="flex h-full flex-col">
        <div class="flex h-16 shrink-0 items-center gap-3 border-b border-default px-5">
          <span class="text-base font-semibold text-highlighted">{{ title }}</span>
          <span class="text-xs text-muted">{{ className[kind] }}</span>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" class="ml-auto" aria-label="Close" @click="$emit('update:open', false)" />
        </div>

        <div class="flex-1 overflow-auto p-5">
          <div class="flex flex-col gap-4">
            <UFormField label="Name" required :error="nameError">
              <UInput v-model="draft.name" class="w-full" placeholder="e.g. CCGT 1" />
            </UFormField>

            <UAlert
              v-if="socOutOfUnitRange"
              color="error"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="A charge value is above 100%."
              description="These are fractions of capacity: 0.5 means half full, not 0.5 MWh. Did you mean to divide by 100?"
            />
            <UAlert
              v-else-if="socWindowInvalid"
              color="error"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="Minimum charge must not exceed maximum charge"
            />
            <UAlert
              v-else-if="socOutOfBand"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="Starting and ending charge must sit within the charge limits"
              description="Otherwise the run will be infeasible."
            />

            <!-- Generator -->
            <template v-if="draft.kind === 'generator'">
              <div class="rounded-lg border border-default p-3.5">
                <div class="grid grid-cols-2 gap-3">
                  <UFormField label="Rated power" description="MW" title="odys: nominal_power">
                    <UInputNumber v-model="draft.nominal_power" class="w-full" :min="0" />
                  </UFormField>
                  <UFormField label="Variable cost" description="$/MWh" title="odys: variable_cost">
                    <UInputNumber v-model="draft.variable_cost" class="w-full" :min="0" />
                  </UFormField>
                </div>
              </div>

              <div class="rounded-lg border border-default p-3.5">
                <div class="mb-3 flex items-center justify-between">
                  <div class="flex flex-col">
                    <span class="text-sm font-medium text-highlighted">Unit commitment</span>
                    <span class="text-xs text-muted">Model minimum output, ramping and startup costs (slower to solve)</span>
                  </div>
                  <USwitch v-model="draft.unit_commitment" />
                </div>
                <p v-if="!draft.unit_commitment" class="text-xs text-muted">
                  Off — modelled as a continuous source. Turn on for thermal constraints like minimum run time and startup cost.
                </p>
                <div v-else class="grid grid-cols-2 gap-3">
                  <UFormField label="Minimum output" description="MW" title="odys: min_power">
                    <UInputNumber v-model="draft.min_power" class="w-full" :min="0" />
                  </UFormField>
                  <UFormField label="Max ramp up" description="MW/step" title="odys: ramp_up">
                    <UInputNumber v-model="draft.ramp_up" class="w-full" :min="0" />
                  </UFormField>
                  <UFormField label="Max ramp down" description="MW/step" title="odys: ramp_down">
                    <UInputNumber v-model="draft.ramp_down" class="w-full" :min="0" />
                  </UFormField>
                  <UFormField label="Minimum on time" description="steps" title="odys: min_up_time">
                    <UInputNumber v-model="draft.min_up_time" class="w-full" :min="1" />
                  </UFormField>
                  <UFormField label="Minimum off time" description="steps" title="odys: min_down_time">
                    <UInputNumber v-model="draft.min_down_time" class="w-full" :min="1" />
                  </UFormField>
                  <UFormField label="Startup cost" description="$" title="odys: startup_cost">
                    <UInputNumber v-model="draft.startup_cost" class="w-full" :min="0" />
                  </UFormField>
                </div>
              </div>
            </template>

            <!-- Storage -->
            <template v-else-if="draft.kind === 'storage'">
              <div class="rounded-lg border border-default p-3.5">
                <div class="grid grid-cols-2 gap-3">
                  <UFormField label="Capacity" description="MWh" title="odys: capacity">
                    <UInputNumber v-model="draft.capacity" class="w-full" :min="0" />
                  </UFormField>
                  <UFormField label="Max charge / discharge rate" description="MW" title="odys: max_power">
                    <UInputNumber v-model="draft.max_power" class="w-full" :min="0" />
                  </UFormField>
                </div>
              </div>

              <div class="rounded-lg border border-default p-3.5">
                <div class="mb-3 text-xs text-muted">Charge level, as a fraction of capacity (0.5 = half full)</div>
                <div class="grid grid-cols-2 gap-3">
                  <UFormField :label="`Starts at = ${(draft.soc_start * draft.capacity).toFixed(0)} MWh`">
                    <UInputNumber v-model="draft.soc_start" class="w-full" :step="0.05" :min="0" :max="1" />
                  </UFormField>
                  <UFormField :label="`Ends at = ${draft.soc_end !== null ? (draft.soc_end * draft.capacity).toFixed(0) : '—'} MWh`">
                    <UInputNumber v-model="draft.soc_end" class="w-full" :step="0.05" :min="0" :max="1" />
                  </UFormField>
                  <UFormField :label="`Minimum charge = ${(draft.soc_min * draft.capacity).toFixed(0)} MWh`">
                    <UInputNumber v-model="draft.soc_min" class="w-full" :step="0.05" :min="0" :max="1" />
                  </UFormField>
                  <UFormField :label="`Maximum charge = ${(draft.soc_max * draft.capacity).toFixed(0)} MWh`">
                    <UInputNumber v-model="draft.soc_max" class="w-full" :step="0.05" :min="0" :max="1" />
                  </UFormField>
                </div>
                <div class="relative mt-3 h-6 overflow-hidden rounded bg-elevated">
                  <div
                    class="absolute inset-y-0 bg-fuchsia-200 dark:bg-fuchsia-900"
                    :style="{ left: `${draft.soc_min * 100}%`, width: `${Math.max(0, (draft.soc_max - draft.soc_min) * 100)}%` }"
                  />
                  <div class="absolute -top-0.5 -bottom-0.5 w-0.5 bg-fuchsia-600" :style="{ left: `${draft.soc_start * 100}%` }" />
                </div>
                <div class="mt-1 flex justify-between font-mono text-xs text-muted">
                  <span>0 MWh</span>
                  <span>{{ draft.capacity }} MWh</span>
                </div>
              </div>

              <div class="rounded-lg border border-default p-3.5">
                <div class="mb-3 text-sm font-medium text-highlighted">Efficiency &amp; losses</div>
                <div class="grid grid-cols-2 gap-3">
                  <UFormField label="Charging efficiency" description="0–1" title="odys: efficiency_charging">
                    <UInputNumber v-model="draft.efficiency_charging" class="w-full" :step="0.01" :min="0" :max="1" />
                  </UFormField>
                  <UFormField label="Discharging efficiency" description="0–1" title="odys: efficiency_discharging">
                    <UInputNumber v-model="draft.efficiency_discharging" class="w-full" :step="0.01" :min="0" :max="1" />
                  </UFormField>
                  <UFormField label="Degradation cost" description="$/MWh" title="odys: degradation_cost">
                    <UInputNumber v-model="draft.degradation_cost" class="w-full" :min="0" />
                  </UFormField>
                  <UFormField label="Self-discharge" description="0–1" title="odys: self_discharge_rate">
                    <UInputNumber v-model="draft.self_discharge_rate" class="w-full" :step="0.01" :min="0" :max="1" />
                  </UFormField>
                </div>
              </div>
            </template>

            <!-- Load -->
            <template v-else-if="draft.kind === 'load'">
              <div class="rounded-lg border border-default p-3.5">
                <div class="mb-3 text-sm font-medium text-highlighted">Behaviour</div>
                <SegmentedControl
                  v-model="draft.type"
                  label="Load behaviour"
                  :items="[{ value: 'fixed', label: 'Fixed', hint: 'Always met in full, every time step' }, { value: 'flexible', label: 'Flexible', hint: 'Can shift at a cost' }]"
                  class="mb-3"
                />
                <div v-if="draft.type === 'flexible'" class="grid grid-cols-2 gap-3">
                  <UFormField label="Cost to increase" description="$/MWh" title="odys: variable_cost_to_increase">
                    <UInputNumber v-model="draft.variable_cost_to_increase" class="w-full" :min="0" />
                  </UFormField>
                  <UFormField label="Cost to decrease" description="$/MWh" title="odys: variable_cost_to_decrease">
                    <UInputNumber v-model="draft.variable_cost_to_decrease" class="w-full" :min="0" />
                  </UFormField>
                </div>
              </div>
            </template>

            <!-- Market -->
            <template v-else-if="draft.kind === 'market'">
              <div class="rounded-lg border border-default p-3.5">
                <div class="mb-3 text-sm font-medium text-highlighted">Trading</div>
                <div class="flex flex-col gap-3">
                  <UFormField label="Max trading volume" description="MW" title="odys: max_trading_volume_per_step">
                    <UInputNumber v-model="draft.max_trading_volume_per_step" class="w-full" :min="0" />
                  </UFormField>
                  <UFormField label="Trade direction">
                    <SegmentedControl
                      v-model="draft.trade_direction"
                      label="Trade direction"
                      :items="[
                        { value: 'buy', label: 'Buy only' },
                        { value: 'sell', label: 'Sell only' },
                        { value: 'buy_and_sell', label: 'Buy and sell' },
                      ]"
                    />
                  </UFormField>
                  <div class="flex items-center justify-between">
                    <div class="flex flex-col">
                      <span class="text-sm text-highlighted" title="odys: stage_fixed">Commit before scenarios are known</span>
                      <span class="text-xs text-muted">
                        {{ draft.stage_fixed ? "One trade schedule shared by all scenarios, decided up front." : "Trades may differ per scenario." }}
                      </span>
                    </div>
                    <USwitch v-model="draft.stage_fixed" />
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-2 border-t border-default p-4">
          <UButton v-if="mode === 'edit'" color="error" variant="ghost" icon="i-lucide-trash-2" label="Remove" @click="$emit('remove')" />
          <div class="ml-auto flex gap-2">
            <UButton color="neutral" variant="ghost" label="Cancel" @click="$emit('update:open', false)" />
            <UButton :disabled="!canSave" :label="mode === 'edit' ? 'Save changes' : 'Add to portfolio'" @click="submit" />
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
