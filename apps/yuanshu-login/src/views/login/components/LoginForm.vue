<template>
  <t-form
    ref="form"
    class="login-form"
    :data="formData"
    :rules="FORM_RULES"
    label-width="0"
    @submit="onSubmit"
  >
    <div class="login-field">
      <label class="login-field__label" for="login-account">账号</label>
      <t-form-item name="account">
        <t-input
          id="login-account"
          v-model="formData.account"
          size="large"
          autocomplete="username"
          placeholder="请输入账号"
        >
          <template #prefix-icon>
            <t-icon name="user" />
          </template>
        </t-input>
      </t-form-item>
    </div>

    <div class="login-field">
      <label class="login-field__label" for="login-password">密码</label>
      <t-form-item name="password">
        <t-input
          id="login-password"
          v-model="formData.password"
          size="large"
          autocomplete="current-password"
          :type="showPsw ? 'text' : 'password'"
          placeholder="请输入登录密码"
        >
          <template #prefix-icon>
            <t-icon name="lock-on" />
          </template>
          <template #suffix-icon>
            <button
              type="button"
              class="password-toggle"
              :aria-label="showPsw ? '隐藏密码' : '显示密码'"
              @click="showPsw = !showPsw"
            >
              <t-icon :name="showPsw ? 'browse' : 'browse-off'" />
            </button>
          </template>
        </t-input>
      </t-form-item>
    </div>

    <div class="form-options">
      <t-checkbox v-model="formData.remember">记住账号</t-checkbox>
      <span class="forgot-link">忘记密码?</span>
    </div>

    <t-form-item class="btn-container">
      <t-button block size="large" type="submit" :loading="submitting">登录</t-button>
    </t-form-item>
  </t-form>

  <t-dialog
    v-model:visible="showTotpDialog"
    header="二次验证"
    width="420px"
    :close-on-overlay-click="false"
    :close-btn="false"
    :footer="false"
  >
    <div class="totp-dialog">
      <t-input v-model="totpCode" size="large" maxlength="20" placeholder="请输入 6 位动态码或恢复码">
        <template #prefix-icon>
          <t-icon name="secured" />
        </template>
      </t-input>
      <div class="totp-actions">
        <t-button variant="outline" :disabled="totpLoading" @click="handleTotpCancel">取消</t-button>
        <t-button theme="primary" :loading="totpLoading" @click="handleTotpSubmit">验证</t-button>
      </div>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import type { FormInstanceFunctions, FormRule, SubmitContext } from 'tdesign-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

const INITIAL_DATA = {
  account: '',
  password: '',
  remember: false,
}

const FORM_RULES: Record<string, FormRule[]> = {
  account: [{ required: true, message: '请输入账号', type: 'error' }],
  password: [{ required: true, message: '请输入密码', type: 'error' }],
}

const form = ref<FormInstanceFunctions>()
const formData = ref({ ...INITIAL_DATA })
const showPsw = ref(false)
const showTotpDialog = ref(false)
const totpLoading = ref(false)
const totpCode = ref('')
const pendingTotpChallengeId = ref('')
const submitting = ref(false)

const router = useRouter()

const onSubmit = async (ctx: SubmitContext) => {
  if (ctx.validateResult !== true) return
  submitting.value = true
  try {
    const result = await session.login(
      formData.value.account,
      formData.value.password,
      '', // captcha_id
      '', // captcha_code
    )
    if (result.requires_totp && result.totp_challenge_id) {
      pendingTotpChallengeId.value = result.totp_challenge_id
      showTotpDialog.value = true
      return
    }
    await finishLogin()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '登录失败，请检查用户名和密码')
  } finally {
    submitting.value = false
  }
}

const finishLogin = async () => {
  const token = session.token
  if (token) {
    // Save token to localStorage for browser-side use
    localStorage.setItem('workbench-client-token', token)
    localStorage.setItem('yuanshu-token', token)
    // Cache the account profile so the Harness sidebar can render the signed-in
    // identity immediately; the server remains the source of truth.
    localStorage.setItem('yuanshu-user', JSON.stringify({
      username: session.username,
      nickname: session.nickname,
    }))

    MessagePlugin.success('登录成功')
  }

  try {
    const response = await fetch('/yuanshu-token', {
      credentials: 'same-origin',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
    if (response.status === 401) throw new Error('元枢凭据未被 Harness 接受，请重新登录')
    if (!response.ok) throw new Error(`Harness authentication handoff failed: ${response.status}`)
    const result: unknown = await response.json()
    if (typeof result !== 'object' || result === null || !('url' in result) || typeof result.url !== 'string') {
      throw new Error('Harness authentication handoff returned an invalid URL')
    }
    window.location.href = result.url
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '登录成功，但无法返回 Harness，请重新打开应用后重试')
  }
}

const handleTotpSubmit = async () => {
  if (!pendingTotpChallengeId.value || !totpCode.value) return
  totpLoading.value = true
  try {
    await session.verifyTotp(pendingTotpChallengeId.value, totpCode.value)
    showTotpDialog.value = false
    pendingTotpChallengeId.value = ''
    totpCode.value = ''
    await finishLogin()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '二次验证失败')
  } finally {
    totpLoading.value = false
  }
}

const handleTotpCancel = () => {
  pendingTotpChallengeId.value = ''
  totpCode.value = ''
  showTotpDialog.value = false
}
</script>

<style lang="less" scoped>
.login-form {
  width: 100%;
}

.login-field {
  margin-bottom: 16px;

  &__label {
    display: block;
    margin-bottom: 8px;
    color: var(--td-text-color-primary);
    font-size: 13px;
    font-weight: 600;
    line-height: 20px;
  }
}

.login-form :deep(.t-form__item) {
  margin-bottom: 0;
}

.login-form :deep(.t-form__controls) {
  flex-direction: column;
}

.login-form :deep(.t-input) {
  min-height: 44px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 10px;
  background: #f7faf8;
  font-size: 14px;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease;
}

.login-form :deep(.t-input:hover) {
  border-color: var(--td-brand-color);
  background: var(--td-bg-color-container);
}

.login-form :deep(.t-input.t-is-focused) {
  border-color: var(--td-brand-color);
  background: var(--td-bg-color-container);
  box-shadow: 0 0 0 3px var(--td-brand-color-focus);
}

.password-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--td-text-color-placeholder);
  cursor: pointer;
  transition: color 0.18s ease;

  &:hover {
    color: var(--td-brand-color);
  }
}

.form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 2px 0 22px;

  :deep(.t-checkbox) {
    color: var(--td-text-color-secondary);
    font-size: 13px;
  }
}

.forgot-link {
  color: var(--td-text-color-placeholder);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.18s ease;

  &:hover {
    color: var(--td-brand-color);
  }
}

.btn-container {
  margin-bottom: 0;
}

.btn-container :deep(.t-button) {
  min-height: 44px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.04em;
  box-shadow: 0 10px 22px rgb(36 104 242 / 22%);
}

.totp-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.totp-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
