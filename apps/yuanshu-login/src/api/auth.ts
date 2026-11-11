import { http, publicHttp } from './http'
import type { LoginResponse } from '@/stores/session'

export interface LoginRequest {
  username: string
  password: string
  captcha_id?: string
  captcha_code?: string
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await publicHttp.post<LoginResponse>('/login', {
    captcha_id: '',
    captcha_code: '',
    ...data,
  })
  return response.data
}

export async function verifyTotpLogin(data: { challenge_id: string; code: string }): Promise<LoginResponse> {
  const response = await http.post<LoginResponse>('/login/2fa/verify', data)
  return response.data
}
