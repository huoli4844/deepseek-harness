<template>
  <t-form
    ref="form"
    class="login-form"
    :data="formData"
    :rules="FORM_RULES"
    label-width="0"
    @submit="onSubmit"
  >
    <t-form-item name="account">
      <t-input v-model="formData.account" size="large" placeholder="请输入账号">
        <template #prefix-icon>
          <t-icon name="user" />
        </template>
      </t-input>
    </t-form-item>

    <t-form-item name="password">
      <t-input
        v-model="formData.password"
        size="large"
        :type="showPsw ? 'text' : 'password'"
        clearable
        placeholder="请输入登录密码"
      >
        <template #prefix-icon>
          <t-icon name="lock-on" />
        </template>
        <template #suffix-icon>
          <t-icon :name="showPsw ? 'browse' : 'browse-off'" @click="showPsw = !showPsw" />
        </template>
      </t-input>
    </t-form-item>

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
import { useRoute, useRouter } from 'vue-router'

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
const route = useRoute()

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

    // Download token file for CLI usage
    const blob = new Blob([token], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'yuanshu-token'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    MessagePlugin.success('登录成功，token 文件已下载。请将文件保存到 ~/.dsh/yuanshu-token/')
  }
  // Redirect back to DSH
  const redirect = route.query.redirect as string
  if (redirect && redirect.startsWith('/')) {
    window.location.href = redirect
  } else {
    window.location.href = '/'
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
  :deep(.t-form__controls) {
    flex-direction: column;
  }
}

.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;

  :deep(.t-checkbox) {
    font-size: 13px;
  }
}

.forgot-link {
  color: var(--td-brand-color, #2468f2);
  font-size: 13px;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }
}

.btn-container {
  margin-bottom: 0;
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
