<template>
  <main class="login-wrapper light">
    <login-star-field />

    <header class="login-topbar">
      <div class="login-topbar__brand">
        <span class="brand-mark">元</span>
        <span class="login-topbar__name">元枢业务工作台</span>
      </div>
      <div class="login-topbar__actions">
        <t-button theme="default" shape="square" variant="text" @click="toggleTheme">
          <template #icon><t-icon name="moon" /></template>
        </t-button>
      </div>
    </header>

    <section class="login-main">
      <div class="login-hero">
        <p class="login-hero__tag">数据 · 知识 · Agent · 流程协同</p>
        <h2>智能业务协作平台</h2>
      </div>

      <div class="login-card">
        <div class="login-card__divider" />

        <section class="login-panel" aria-labelledby="login-title">
          <div class="title-container">
            <p id="login-title" class="title-container__eyebrow">登录到</p>
            <h1>元枢平台</h1>
          </div>

          <login-form />
        </section>
      </div>
    </section>

    <footer class="copyright">© 元枢平台</footer>
  </main>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'

import LoginForm from './login/components/LoginForm.vue'
import LoginStarField from './login/components/LoginStarField.vue'

onMounted(() => {
  // Initialize theme
  const savedMode = localStorage.getItem('yuanshu-login-theme-mode')
  if (savedMode) {
    document.documentElement.setAttribute('theme-mode', savedMode)
  }
})

function toggleTheme() {
  const current = document.documentElement.getAttribute('theme-mode')
  const newMode = current === 'dark' ? 'light' : 'dark'
  localStorage.setItem('yuanshu-login-theme-mode', newMode)
  document.documentElement.setAttribute('theme-mode', newMode)
}
</script>

<style lang="less" scoped>
.login-wrapper {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #0a0e27 0%, #1a1f4e 50%, #0d1333 100%);
  color: #fff;
}

.login-topbar {
  position: relative;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 32px;
  &__brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  &__icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
  }
  &__name {
    font-size: 16px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }
  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--td-brand-color, #2468f2), #6366f1);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
}

.login-main {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 140px);
  padding: 0 24px;
}

.login-hero {
  display: none;
  &__tag {
    margin: 0 0 8px;
    color: var(--td-brand-color, #2468f2);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  h2 {
    margin: 0;
    color: #fff;
    font-size: 28px;
    font-weight: 700;
  }
}

.login-card {
  width: 420px;
  max-width: 100%;
  background: var(--td-bg-color-container, #fff);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  &__divider {
    height: 1px;
    background: var(--td-border-level-1-color, #e5e6eb);
  }
}

.login-panel {
  padding: 32px;
}

.title-container {
  text-align: center;
  margin-bottom: 24px;
  &__eyebrow {
    margin: 0;
    font-size: 14px;
    color: var(--td-text-color-secondary, #4e5969);
  }
  h1 {
    margin: 4px 0 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--td-text-color-primary, #1d2129);
  }
}

.copyright {
  position: relative;
  z-index: 10;
  text-align: center;
  padding: 16px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}
</style>
