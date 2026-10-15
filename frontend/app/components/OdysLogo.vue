<script setup lang="ts">
// The odys mark: four pieces of a hexagon (sun, field, wind, and the bolt). `animated` builds it piece by
// piece: each outline draws itself, its fill fades in, then the bolt lands with a short flash.
withDefaults(defineProps<{ animated?: boolean }>(), { animated: false });
</script>

<template>
  <svg
    viewBox="0 0 100 100"
    fill="none"
    stroke-width="3.2"
    stroke-linejoin="round"
    stroke-linecap="round"
    role="img"
    aria-label="odys"
    class="odys-logo"
    :class="{ 'odys-logo--animated': animated }"
  >
    <path class="piece p1" pathLength="1" fill="#F2CC8F" d="M13 28 L49 7 L63 15 L44 46 L13 35 Z" />
    <path class="piece p2" pathLength="1" fill="#81B29A" d="M12 42 L42 57 L42 88 L14 70 Z" />
    <path class="piece p3" pathLength="1" fill="#E07A5F" d="M71 19 L87 28 L87 70 L52 92 L58 56 Z" />
    <path class="piece p4" pathLength="1" fill="#3D405B" d="M69 21 L47 54 L59 54 L50 92 L78 48 L66 48 Z" />
  </svg>
</template>

<style scoped>
.odys-logo {
  --outline: #2a2c42;
  stroke: var(--outline);
  overflow: visible;
}
:global(.dark) .odys-logo {
  --outline: #f4f1de;
}

.odys-logo--animated .piece {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  fill-opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation:
    odys-draw 0.7s cubic-bezier(0.65, 0, 0.35, 1) forwards,
    odys-fill 0.45s ease-out forwards,
    odys-settle 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.p1 { --d: 0s; --dx: -10px; --dy: -10px; }
.p2 { --d: 0.25s; --dx: -12px; --dy: 8px; }
.p3 { --d: 0.5s; --dx: 12px; --dy: 4px; }
.p4 { --d: 0.85s; --dx: 0px; --dy: -14px; }
.odys-logo--animated .piece {
  animation-delay: var(--d), calc(var(--d) + 0.45s), var(--d);
}
.odys-logo--animated .p4 {
  animation:
    odys-draw 0.6s cubic-bezier(0.65, 0, 0.35, 1) var(--d) forwards,
    odys-fill 0.35s ease-out calc(var(--d) + 0.4s) forwards,
    odys-drop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) var(--d) both,
    odys-flash 0.5s ease-out calc(var(--d) + 0.75s);
}

@keyframes odys-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes odys-fill {
  to { fill-opacity: 1; }
}
@keyframes odys-settle {
  from { transform: translate(var(--dx), var(--dy)) scale(0.9); }
  to { transform: none; }
}
@keyframes odys-drop {
  from { transform: translate(var(--dx), var(--dy)) scale(0.8); }
  to { transform: none; }
}
@keyframes odys-flash {
  50% { filter: drop-shadow(0 0 5px #f2cc8f); }
}

@media (prefers-reduced-motion: reduce) {
  .odys-logo--animated .piece {
    animation: none;
    stroke-dashoffset: 0;
    fill-opacity: 1;
  }
}
</style>
