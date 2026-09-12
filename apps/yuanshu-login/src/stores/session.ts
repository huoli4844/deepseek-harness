import { defineStore } from 'pinia'
import { login as loginApi, verifyTotpLogin } from '@/api/auth'

const TOKEN_KEY = 'yuanshu-login-token'

export interface LoginResponse {
  access_token?: string
  token?: string
  user?: {
    id?: number
    username?: string
    nickname?: string
  }
  requires_totp?: boolean
  totp_challenge_id?: string
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    username: '',
    nickname: '',
  }),
  getters: {
    isAuthenticated: state => !!state.token,
  },
  actions: {
    applyLogin(payload: LoginResponse) {
      const token = payload.access_token || payload.token || ''
      this.token = token
      this.username = payload.user?.username || ''
      this.nickname = payload.user?.nickname || payload.user?.username || ''
      if (token) {
        localStorage.setItem(TOKEN_KEY, token)
      }
    },
    async login(account: string, password: string, captcha_id = '', captcha_code = '') {
      const resp = await loginApi({
        username: account,
        password,
        captcha_id,
        captcha_code,
      })
      if (resp.requires_totp && resp.totp_challenge_id) {
        return { requires_totp: true, totp_challenge_id: resp.totp_challenge_id }
      }
      this.applyLogin(resp)
      return { requires_totp: false }
    },
    async verifyTotp(challenge_id: string, code: string) {
      const resp = await verifyTotpLogin({ challenge_id, code })
      this.applyLogin(resp)
      return true
    },
    logout() {
      this.token = ''
      this.username = ''
      this.nickname = ''
      localStorage.removeItem(TOKEN_KEY)
    },
  },
})
