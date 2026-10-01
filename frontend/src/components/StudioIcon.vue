<script setup lang="ts">
const paths = {
  copy: 'M8 8h13v13H8zM16 8V3H3v13h5',
  play: 'm8 4 13 8-13 8V4Z',
  pause: 'M7 4v16M17 4v16',
  download: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
  volume: 'm11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  chevron: 'm6 9 6 6 6-6',
  edit: 'm16 3 5 5M4 20l5-1L21 7a2 2 0 0 0-5-4L4 15v5Z',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  sound: 'M4 10v4m4-8v12m4-15v18m4-15v12m4-8v4',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  sliders: 'M4 4v6m0 4v6m8-16v10m0 4v2m8-16v2m0 4v10M1 10h6m2 8h6m2-12h6',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  folder: 'M3 7V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  monitor: 'M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM8 21h8m-4-4v4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  note: 'M9 18V5l12-2v13M9 9l12-2M9 18c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2Zm12-2c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2Z',
  refresh: 'M20 7v5h-5m-11 5v-5h5m-4-4a8 8 0 0 1 13-4l2 3M4 17l2 3a8 8 0 0 0 13-4',
  lock: 'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4',
} as const;
defineProps<{ name: keyof typeof paths }>();
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="studio-icon">
    <path :d="paths[name]" />
  </svg>
</template>
