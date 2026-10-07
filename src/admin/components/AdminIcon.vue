<template>
  <svg class="ad-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <template v-if="name === 'moon'"><path d="M20.1 15.1A8.4 8.4 0 0 1 8.9 3.9 8.4 8.4 0 1 0 20.1 15.1Z"/><path d="M15.8 4.2v3.2M14.2 5.8h3.2"/></template>
    <template v-else-if="name === 'dashboard'"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="4" rx="1.5"/><rect x="13.5" y="10.5" width="7" height="10" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/></template>
    <template v-else-if="name === 'players'"><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"/><circle cx="9.5" cy="7.5" r="4"/><path d="M17 4a4 4 0 0 1 0 7.7M21 20v-1.5a4 4 0 0 0-3-3.87"/></template>
    <template v-else-if="name === 'factory'"><path d="M3 21V9l6 3V8l6 4V5h6v16H3Z"/><path d="M7 16h.01M12 16h.01M17 16h.01M17 9h.01"/></template>
    <template v-else-if="name === 'levels'"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></template>
    <template v-else-if="name === 'enemy'"><path d="M8 8.5a4 4 0 0 1 8 0v1.2a5.5 5.5 0 0 1 2.3 4.5V17H5.7v-2.8A5.5 5.5 0 0 1 8 9.7V8.5Z"/><path d="M8 5 5.5 3M16 5l2.5-2M9 13h.01M15 13h.01M9 17v2m6-2v2M5.7 14H3m15.3 0H21"/></template>
    <template v-else-if="name === 'publish'"><path d="M12 16V3m0 0L7.5 7.5M12 3l4.5 4.5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></template>
    <template v-else-if="name === 'broadcast'"><circle cx="12" cy="12" r="2.5"/><path d="M5.7 5.7a9 9 0 0 0 0 12.6M18.3 5.7a9 9 0 0 1 0 12.6M2.9 2.9a13 13 0 0 0 0 18.2M21.1 2.9a13 13 0 0 1 0 18.2"/></template>
    <template v-else-if="name === 'analytics'"><path d="M4 20V10m5 10V4m5 16v-7m5 7V7"/><path d="M2 20.5h20"/></template>
    <template v-else-if="name === 'settings'"><path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></template>
    <template v-else-if="name === 'refresh'"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.4-3"/></template>
    <template v-else-if="name === 'activity'"><path d="M3 12h4l3-8 4 16 3-8h4"/></template>
    <template v-else-if="name === 'coin'"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5c-.6-.8-1.7-1.3-3.2-1.3-1.7 0-2.8.8-2.8 2s1 1.8 2.8 2.2 2.9 1 2.9 2.2-1.2 2.1-3.1 2.1c-1.5 0-2.7-.5-3.5-1.4M12 5.5v13"/></template>
  </svg>
</template>

<script setup>
defineProps({ name: { type: String, required: true } })
</script>
