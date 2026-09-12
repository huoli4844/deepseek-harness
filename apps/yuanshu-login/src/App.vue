<template>
  <t-config-provider :global-config="componentsLocale">
    <router-view :key="locale" :class="displayMode" />
  </t-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const displayMode = computed(() => {
  const mode = localStorage.getItem('yuanshu-login-theme-mode')
  return mode === 'dark' ? 'dark' : 'light'
})
const locale = computed(() => 'zh_CN')
const componentsLocale = computed(() => ({}))

onMounted(() => {
  // Apply theme from stored preference
  const mode = localStorage.getItem('yuanshu-login-theme-mode') || 'light'
  document.documentElement.setAttribute('theme-mode', mode === 'dark' ? 'dark' : '')
})
</script>
