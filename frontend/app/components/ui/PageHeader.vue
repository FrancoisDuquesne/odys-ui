<script setup lang="ts">
defineProps<{ crumbs: { label: string; to?: string }[] }>();
</script>

<template>
  <UDashboardNavbar :toggle="false">
    <template #leading>
      <div class="flex items-center gap-1">
        <UDashboardSidebarToggle class="lg:hidden" color="neutral" variant="ghost" />
        <UDashboardSidebarCollapse class="hidden lg:flex" color="neutral" variant="ghost" />
      </div>
      <USeparator orientation="vertical" class="mx-3 h-5" />
      <UBreadcrumb :items="crumbs" />
      <div class="ml-2 flex min-w-0 items-center gap-2">
        <slot name="meta" />
      </div>
    </template>
    <template #right>
      <slot name="actions" />
    </template>
  </UDashboardNavbar>
</template>
