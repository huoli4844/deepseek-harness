import { useEffect, useState } from 'react'

/** 宿主当前配色。 */
type HostTheme = 'dark' | 'light'

/** 读取宿主（DeepSeek Harness）写到 body 上的配色标记。 */
function readHostTheme(): HostTheme {
  return document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
}

/**
 * 跟随宿主（DeepSeek Harness）的当前主题。
 * 宿主把解析后的配色写在 body[data-ds-dark-theme] 上，这里只观察该属性，
 * 因此用户在宿主设置里切换主题（含其自身的跟随系统）时，工作台立即同步。
 * @returns 宿主当前的 dark / light 配色。
 */
export function useHostTheme(): HostTheme {
  const [theme, setTheme] = useState<HostTheme>(readHostTheme)
  useEffect(() => {
    const observer = new MutationObserver(() => { setTheme(readHostTheme()) })
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    setTheme(readHostTheme())
    return () => { observer.disconnect() }
  }, [])
  return theme
}
