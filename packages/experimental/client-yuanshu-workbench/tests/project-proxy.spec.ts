/** 校验项目同源路径映射和允许的方法，不依赖实际后台。 */
import { expect, it } from 'vitest'
import { projectProxyRoute } from '../src/project-proxy.ts'

it('项目与工时通过少仕接口，周报按用户每周走独立应用接口', () => {
  expect(projectProxyRoute('/yuanshu-workbench/projects')).toEqual({ path: '/api/v1/apps/shaoshi/projects', methods: ['GET'] })
  expect(projectProxyRoute('/yuanshu-workbench/projects/P-1/labor-hours/42/submit')).toEqual({
    path: '/api/v1/apps/shaoshi/projects/P-1/labor-hours/42/submit', methods: ['POST'],
  })
  expect(projectProxyRoute('/yuanshu-workbench/weekly-reports')).toEqual({
    path: '/api/v1/apps/deepseek-harness/weekly-reports', methods: ['GET', 'PUT'],
  })
  expect(projectProxyRoute('/yuanshu-workbench/weekly-reports/submit')).toEqual({
    path: '/api/v1/apps/deepseek-harness/weekly-reports/submit', methods: ['POST'],
  })
})

it('不映射未实现的项目路由、错误资源标识、编码路径分隔符和按项目的旧周报路径', () => {
  for (const path of ['P-1/weekly-reports', 'P-1/weekly-reports/2', 'P-1/labor-hours/0', 'P-1/labor-hours/submit', 'a%2Fb/labor-hours']) {
    expect(projectProxyRoute(`/yuanshu-workbench/projects/${path}`)).toBeUndefined()
  }
})
