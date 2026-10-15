<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

defineProps<{
  crumbs: { label: string; to?: string }[];
  /** Items shown in an overflow menu on small screens, in place of the actions slot. */
  menu?: DropdownMenuItem[][];
}>();
</script>

<template>
  <UDashboardNavbar :toggle="false" :ui="{ left: 'min-w-0', right: 'shrink-0' }" class="print:hidden">
    <template #leading>
      <div class="flex items-center gap-1">
        <UDashboardSidebarToggle class="lg:hidden" color="neutral" variant="ghost" />
        <UDashboardSidebarCollapse class="hidden lg:flex" color="neutral" variant="ghost" />
      </div>
      <USeparator orientation="vertical" class="mx-3 hidden h-5 sm:block" />
      <UBreadcrumb :items="crumbs" class="min-w-0" :ui="{ list: 'flex-nowrap', link: 'truncate' }" />
      <div class="ml-2 flex shrink-0 items-center gap-2">
        <slot name="meta" />
      </div>
    </template>
    <template #right>
      <template v-if="menu">
        <div class="hidden items-center gap-2 sm:flex"><slot name="actions" /></div>
        <UDropdownMenu :items="menu" :content="{ align: 'end' }">
          <UButton class="sm:hidden" color="neutral" variant="outline" icon="i-lucide-ellipsis" aria-label="Run actions" />
        </UDropdownMenu>
      </template>
      <slot v-else name="actions" />
    </template>
  </UDashboardNavbar>
</template>
