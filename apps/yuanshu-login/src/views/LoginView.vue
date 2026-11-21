<template>
  <main class="login-wrapper" :class="themeClass">
    <login-star-field />

    <div class="login-topbar">
      <div class="login-topbar__brand">
        <span class="login-topbar__mark">元</span>
        <span class="login-topbar__name">元枢业务工作台</span>
      </div>
      <div class="login-topbar__actions">
        <t-button theme="default" shape="square" variant="text" :aria-label="isDark ? '切换浅色主题' : '切换深色主题'" @click="toggleTheme">
          <template #icon><t-icon :name="isDark ? 'sunny' : 'moon'" /></template>
        </t-button>
      </div>
    </div>

    <main class="login-main">
      <div class="login-hero">
        <p class="login-hero__tag">数据 · 知识 · Agent · 流程协同</p>
        <h2>智能业务协作平台</h2>
      </div>

      <div class="login-card">
        <div class="login-card__visual">
          <div class="login-card__visual-label">元枢 · YUANSHU</div>
          <div class="login-visual">
            <p class="login-visual__title">让业务角色<br />带着证据完成工作</p>
            <p class="login-visual__desc">项目、采购与客户关系共用一套工作台，每一次结论都能追溯到知识来源。</p>
            <ul class="login-visual__list">
              <li>项目 · 采购 · 客户关系一体协同</li>
              <li>知识引用与执行留痕可审计</li>
              <li>Agent、算法与流程按角色编排</li>
            </ul>
          </div>
          <div class="login-visual__foot">少仕科技 · 元枢平台</div>
        </div>

        <section class="login-panel" aria-labelledby="login-title">
          <div class="title-container">
            <p id="login-title" class="title-container__eyebrow">登录</p>
            <div class="sub-title">使用元枢账号进入业务工作台</div>
          </div>

          <login-form />
        </section>
      </div>
    </main>

    <footer class="login-footer">
      <div class="copyright">© 元枢平台</div>
    </footer>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import LoginForm from './login/components/LoginForm.vue'
import LoginStarField from './login/components/LoginStarField.vue'

const THEME_KEY = 'yuanshu-login-theme-mode'

const themeMode = ref<'light' | 'dark'>(
  localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light',
)
const isDark = computed(() => themeMode.value === 'dark')
const themeClass = computed(() => themeMode.value)

document.documentElement.setAttribute('theme-mode', themeMode.value === 'dark' ? 'dark' : '')

function toggleTheme() {
  themeMode.value = themeMode.value === 'dark' ? 'light' : 'dark'
  localStorage.setItem(THEME_KEY, themeMode.value)
  document.documentElement.setAttribute('theme-mode', themeMode.value === 'dark' ? 'dark' : '')
}
</script>

<style lang="less" scoped>
.login-wrapper {
  --login-rail: #173d34;
  --login-rail-ink: #f4f7f2;
  --login-rail-muted: rgb(244 247 242 / 66%);
  --login-rule: rgb(31 61 51 / 13%);

  position: relative;
  display: flex;
  min-height: 100dvh;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  background: #eef3ef;
  color: var(--td-text-color-primary);

  &.dark {
    --login-rail: #0a1d18;
    --login-rule: rgb(255 255 255 / 10%);

    background: #0d211c;

    .login-card,
    .login-panel {
      background: #152d27;
    }

    .login-card {
      border-color: rgb(255 255 255 / 10%);
      box-shadow: 0 24px 56px rgb(0 0 0 / 45%);
    }

    :deep(.t-input) {
      background: #102b24;
    }

    :deep(.login-field__label) {
      color: var(--td-text-color-primary);
    }
  }
}

.login-topbar {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: min(calc(100% - 96px), 1240px);
  margin: 0 auto;
  padding-top: 24px;
}

.login-topbar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.login-topbar__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--login-rail);
  color: var(--login-rail-ink);
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
}

.login-topbar__name {
  color: var(--td-text-color-primary);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.5px;
  line-height: 1;
}

.login-topbar__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.login-main {
  position: relative;
  z-index: 3;
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: min(calc(100% - 96px), 1120px);
  gap: 18px;
  margin: 0 auto;
  padding: 16px 0 48px;
}

.login-hero {
  width: 100%;
  text-align: left;

  &__tag {
    display: inline-block;
    margin: 0 0 8px;
    color: var(--td-brand-color);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    line-height: 20px;
  }

  h2 {
    margin: 0;
    color: var(--td-text-color-primary);
    font-size: 28px;
    font-weight: 800;
    letter-spacing: 0.02em;
    line-height: 38px;
  }
}

.login-card {
  display: flex;
  width: 100%;
  min-height: 560px;
  align-items: stretch;
  border: 1px solid var(--login-rule);
  border-radius: 18px;
  background: var(--td-bg-color-container);
  overflow: hidden;
  box-shadow: 0 24px 56px rgb(23 61 52 / 13%);
}

.login-card__visual {
  position: relative;
  display: flex;
  width: 52%;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  padding: 56px 48px;
  background: var(--login-rail);
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    border: 1px solid rgb(255 255 255 / 10%);
    border-radius: inherit;
  }
}

.login-card__visual-label {
  position: absolute;
  z-index: 2;
  top: 26px;
  left: 40px;
  color: rgb(244 247 242 / 52%);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
}

.login-visual {
  position: relative;
  z-index: 1;
  max-width: 380px;

  &__title {
    margin: 0;
    color: var(--login-rail-ink);
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.01em;
    line-height: 38px;
  }

  &__desc {
    margin: 16px 0 0;
    color: var(--login-rail-muted);
    font-size: 13px;
    line-height: 22px;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 28px 0 0;
    padding: 0;
    list-style: none;

    li {
      position: relative;
      padding-left: 16px;
      color: rgb(244 247 242 / 82%);
      font-size: 13px;
      line-height: 20px;

      &::before {
        content: '';
        position: absolute;
        top: 7px;
        left: 0;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #85fabf;
      }
    }
  }
}

.login-visual__foot {
  position: absolute;
  bottom: 26px;
  left: 40px;
  color: rgb(244 247 242 / 40%);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.login-panel {
  display: flex;
  width: 48%;
  flex-direction: column;
  justify-content: center;
  padding: 40px 56px 32px;
  background: var(--td-bg-color-container);
}

.title-container {
  margin-bottom: 24px;

  &__eyebrow {
    margin: 0;
    color: var(--td-text-color-primary);
    font-size: 30px;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 40px;
  }

  .sub-title {
    margin-top: 8px;
    color: var(--td-text-color-secondary);
    font-size: 14px;
    line-height: 22px;
  }
}

.login-footer {
  position: relative;
  z-index: 3;
  flex: 0 0 auto;
  width: min(calc(100% - 96px), 1120px);
  margin: 0 auto;
  text-align: center;
}

.copyright {
  width: 100%;
  padding: 2px 0 6px;
  color: var(--td-text-color-secondary);
  font-size: 14px;
  line-height: 22px;
  text-align: center;
}

@media screen and (max-height: 720px) {
  .login-card {
    min-height: 480px;
  }

  .login-main {
    padding-bottom: 24px;
  }

  .copyright {
    display: none;
  }
}

@media screen and (max-height: 720px) and (max-width: 1080px) {
  .login-card__visual {
    display: none;
  }
}

@media (width <= 1080px) {
  .login-card {
    flex-direction: column;
    max-width: 440px;
    min-height: 0;
  }

  .login-hero {
    max-width: 440px;
  }

  .login-card__visual {
    width: 100%;
    min-height: 200px;
    padding: 40px 32px;
  }

  .login-visual__title {
    font-size: 22px;
    line-height: 32px;
  }

  .login-visual__list,
  .login-visual__desc,
  .login-visual__foot {
    display: none;
  }

  .login-card__visual-label {
    left: 32px;
  }

  .login-panel {
    width: 100%;
    padding: 28px 24px;
  }
}

@media (width <= 900px) {
  .login-topbar,
  .login-main,
  .login-footer {
    width: calc(100% - 48px);
  }

  .login-panel {
    padding: 24px 20px;
  }
}

@media (width <= 760px) {
  .login-hero h2 {
    font-size: 24px;
    line-height: 32px;
  }

  .title-container__eyebrow {
    font-size: 24px;
    line-height: 32px;
  }
}
</style>
