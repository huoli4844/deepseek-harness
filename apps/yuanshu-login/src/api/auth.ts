import { isAxiosError } from 'axios'
import { http, publicHttp } from './http'
import type { LoginResponse } from '@/stores/session'

export interface LoginRequest {
  username: string
  password: string
  tenant_code?: string
  captcha_id?: string
  captcha_code?: string
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  try {
    const response = await publicHttp.post<LoginResponse>('/login', {
      captcha_id: '',
      captcha_code: '',
      ...data,
    })
    return response.data
  } catch (error) {
    const status = isAxiosError(error) ? error.response?.status : undefined
    if (status === 401) {
      throw new Error('登录失败，请确认所选租户以及该租户下的账号和密码。')
    }
    if (status === 429) {
      throw new Error('登录尝试次数过多，请稍后再试。')
    }
    throw error
  }
}

export async function verifyTotpLogin(data: { challenge_id: string; code: string }): Promise<LoginResponse> {
  const response = await http.post<LoginResponse>('/login/2fa/verify', data)
  return response.data
}
