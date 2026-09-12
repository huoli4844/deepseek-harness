import { http, publicHttp } from './http'
import type { LoginResponse } from '@/stores/session'

export interface LoginRequest {
  username: string
  password: string
  captcha_id?: string
  captcha_code?: string
}

export function login(data: LoginRequest) {
  return publicHttp.post<unknown, LoginResponse>('/login', {
    captcha_id: '',
    captcha_code: '',
    ...data,
  })
}

export function verifyTotpLogin(data: { challenge_id: string; code: string }) {
  return http.post<unknown, LoginResponse>('/login/2fa/verify', data)
}
