import axios, { type AxiosResponse } from 'axios'
import { useSessionStore } from '@/stores/session'

declare global {
  interface Window {
    __YUANSHU_API_URL__?: string
  }
}

const apiUrl = (typeof window !== 'undefined' && window.__YUANSHU_API_URL__)
  ? window.__YUANSHU_API_URL__
  : (import.meta.env.VITE_API_URL || 'http://localhost:8081')

const apiPrefix = import.meta.env.VITE_API_URL_PREFIX || '/api/v1'

export const http = axios.create({
  baseURL: `${apiUrl}${apiPrefix}`,
  timeout: 60_000,
})

export const publicHttp = axios.create({
  baseURL: `${apiUrl}${apiPrefix}`,
  timeout: 60_000,
})

function unwrapResponseData<T>(response: AxiosResponse<T>): AxiosResponse<T> {
  const data: unknown = response.data
  if (data !== null && typeof data === 'object' && 'code' in data && 'data' in data && (data.code === 200 || data.code === 0)) {
    response.data = data.data as T
  }
  return response
}

http.interceptors.request.use((config) => {
  const session = useSessionStore()
  if (session.token) {
    config.headers.Authorization = `Bearer ${session.token}`
  }
  return config
})

http.interceptors.response.use(
  unwrapResponseData,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const session = useSessionStore()
      session.logout()
      if (window.location.pathname !== '/login') {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`
      }
    }
    return Promise.reject(error instanceof Error ? error : new Error('YuanShu request failed', { cause: error }))
  },
)

publicHttp.interceptors.response.use(unwrapResponseData)
