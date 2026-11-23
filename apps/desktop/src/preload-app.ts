import type { FileSaveResult } from '@deepseek-ai/dsh-client-ui-file-actions/types'
/** Origin-scoped boot, native directory selection, host paths of picked files, and update presentation with native confirmation actions. */

import type { DesktopChannelState, DesktopChannelChangeResult } from '@deepseek-ai/dsh-client-ui-settings-general/types'
import type { DesktopShortcutInput, ShortcutConfigSnapshot, ShortcutSaveResult } from '@deepseek-ai/dsh-client-shortcuts/protocol'
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { DESKTOP_IPC, SCHEME, type DshDesktopProductApi, type DesktopUpdatePresentation } from './ipc.ts'
import { PLATFORM_IPC } from './platform-ipc.ts'
import { markDocumentPlatform, syncWindowFullscreen } from './preload-platform.ts'
import { syncNativeTheme } from './preload-theme.ts'
import { syncWindowsAppearance } from './preload-windows.ts'
import { installMandatoryUpdateOverlay } from './preload-mandatory-overlay.ts'
import { createDesktopBrowserBridge } from './preload-browser.ts'
import type { FileDragHandle } from '@deepseek-ai/dsh-util-file-drag'

/**
 * Web-login mode (`DSH_DESKTOP_WEB_LOGIN=1`): the shell passes a static flag
 * through `webPreferences.additionalArguments`. The primary window's http
 * documents are then the trusted workspace pages of the desktop shell, so they
 * receive the full desktop treatment (platform mark, drag regions, vibrancy,
 * product bridges) exactly like the dsh-app document. Trust rests on two
 * checks: the main-frame navigation guard admits only the Host origin, and
 * every IPC call re-verifies the sender frame against the registered origin
 * (`allowWebLoginSender`). Guests (webviews/iframes) never run this preload,
 * so external content cannot reach these bridges.
 */
const isDshAppDocument = location.protocol === `${SCHEME}:` && location.hostname === 'app'
const isWebLoginDocument = process.argv.includes('--dsh-web-login')
  && (location.protocol === 'https:' || location.protocol === 'http:')
const isDesktopDocument = isDshAppDocument || isWebLoginDocument

function createProductApi(): DshDesktopProductApi {
  return {
    protocolVersion: 1,
    fileActions: {
      save: request => ipcRenderer.invoke(DESKTOP_IPC.fileSave, request) as Promise<FileSaveResult>,
      readClipboardImage: url => ipcRenderer.invoke(DESKTOP_IPC.clipboardImageRead, url) as
        Promise<{ bytes: Uint8Array; mediaType: string }>,
    },
    browser: createDesktopBrowserBridge(),
    fileDrag: {
      prepare: (source, requestId) => ipcRenderer.invoke(DESKTOP_IPC.fileDragPrepare, source, requestId) as
        Promise<FileDragHandle | undefined>,
      cancel: (requestId) => { void ipcRenderer.invoke(DESKTOP_IPC.fileDragCancel, requestId).catch((_error: unknown) => {
        // Main-process shutdown cancels any remaining preparations.
      }) },
      start: handle => ipcRenderer.invoke(DESKTOP_IPC.fileDragStart, handle) as Promise<boolean>,
      release: (handle) => { void ipcRenderer.invoke(DESKTOP_IPC.fileDragRelease, handle).catch((_error: unknown) => {
        // Main-process shutdown also releases every prepared file.
      }) },
    },
    deviceInfo: () => ipcRenderer.invoke(DESKTOP_IPC.deviceInfo) as Promise<string>,
    keyboard: {
      closeWindow: revision => ipcRenderer.invoke(DESKTOP_IPC.shortcutsCloseWindow, revision) as Promise<void>,
      subscribe: (listener) => {
        const handle = (_event: Electron.IpcRendererEvent, input: DesktopShortcutInput): void => {
          if (input.kind === 'iframe') {
            const element = document.activeElement
            if (!(element instanceof HTMLIFrameElement) || !element.isConnected
              || !element.matches('iframe[data-sidebar-browser-frame], iframe[data-html-preview]')) return
            if (input.frameName === '' || element.name !== input.frameName) return
          }
          if (input.kind === 'webview') {
            const element = document.activeElement
            if (element?.matches('webview[data-sidebar-browser-frame]') !== true || !element.isConnected
              || input.frameName === '' || element.getAttribute('name') !== input.frameName) return
          }
          listener(input)
        }
        ipcRenderer.on(DESKTOP_IPC.shortcutsInput, handle)
        return () => { ipcRenderer.off(DESKTOP_IPC.shortcutsInput, handle) }
      },
    },
    shortcuts: {
      get: definitions => ipcRenderer.invoke(DESKTOP_IPC.shortcutsGet, definitions) as Promise<ShortcutConfigSnapshot>,
      edit: (edit, revision) => ipcRenderer.invoke(DESKTOP_IPC.shortcutsEdit, edit, revision) as Promise<ShortcutSaveResult>,
      recording: active => ipcRenderer.invoke(DESKTOP_IPC.shortcutsRecording, active) as Promise<void>,
      subscribe(listener) {
        const handle = (_event: Electron.IpcRendererEvent, snapshot: ShortcutConfigSnapshot): void => { listener(snapshot) }
        ipcRenderer.on(DESKTOP_IPC.shortcutsChanged, handle)
        return () => { ipcRenderer.off(DESKTOP_IPC.shortcutsChanged, handle) }
      },
    },
    updates: {
      channels: {
        get: () => ipcRenderer.invoke(DESKTOP_IPC.updatesChannelGet) as Promise<DesktopChannelState>,
        set: channel => ipcRenderer.invoke(DESKTOP_IPC.updatesChannelSet, channel) as Promise<DesktopChannelChangeResult>,
        subscribe(listener) {
          const handle = (_event: Electron.IpcRendererEvent, state: DesktopChannelState): void => { listener(state) }
          ipcRenderer.on(DESKTOP_IPC.updatesChannelChanged, handle)
          return () => { ipcRenderer.off(DESKTOP_IPC.updatesChannelChanged, handle) }
        },
      },
      status: () => ipcRenderer.invoke(DESKTOP_IPC.updatesStatus) as Promise<DesktopUpdatePresentation>,
      open: () => ipcRenderer.invoke(DESKTOP_IPC.updatesOpen) as Promise<void>,
      subscribe(listener) {
        const handle = (_event: Electron.IpcRendererEvent, state: DesktopUpdatePresentation): void => { listener(state) }
        ipcRenderer.on(DESKTOP_IPC.updatesPresentation, handle)
        return () => { ipcRenderer.off(DESKTOP_IPC.updatesPresentation, handle) }
      },
    },
  }
}

if (isDesktopDocument) {
  contextBridge.exposeInMainWorld('dshOnboarding', {
    hasApiKey: () => ipcRenderer.invoke(DESKTOP_IPC.onboardingApiKey) as Promise<boolean>,
    setActive: (active: boolean) => { ipcRenderer.send(DESKTOP_IPC.onboardingActive, active) },
  })
  ipcRenderer.on(DESKTOP_IPC.enterWorkspace, () => {
    const body = document.body
    const previous = body.getAttribute('tabindex')
    body.tabIndex = -1
    body.focus({ preventScroll: true })
    if (previous === null) body.removeAttribute('tabindex')
    else body.setAttribute('tabindex', previous)
  })
  syncWindowsAppearance()
  if (process.platform === 'win32') installMandatoryUpdateOverlay()
  contextBridge.exposeInMainWorld('__DSH_DIRECTORY_PICKER__', {
    pick: () => ipcRenderer.invoke(DESKTOP_IPC.directoryPick) as Promise<string | null>,
  })
  // The composer cites dropped, picked, and pasted files and folders that
  // have a real path as `@path` references instead of uploading them; a
  // File without one (pasted bytes) answers '' and uploads as before.
  contextBridge.exposeInMainWorld('__DSH_HOST_PATHS__', {
    pathFor: (file: File) => webUtils.getPathForFile(file),
  })
  contextBridge.exposeInMainWorld('dshPlatform', {
    open: (page: 'usage' | 'top-up', bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke(PLATFORM_IPC.open, page, bounds),
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke(PLATFORM_IPC.bounds, bounds),
    close: () => ipcRenderer.invoke(PLATFORM_IPC.close),
  })
}
// The desktop boot handoff belongs to the dsh-app shell only. A web-login page
// is already bootstrapped by the Host's served index (its `__DSH_BOOT_READY__`
// gate resolves inline), so re-applying the boot injection table there would
// execute bundles the served bootstrap also loads — duplicate registrations
// abort the batch scripts. The page boots through its web graph instead; the
// product bridge below still gives it every native capability.
if (isDshAppDocument) {
  contextBridge.exposeInMainWorld('dshDesktopBoot', {
    ready: () => ipcRenderer.invoke(DESKTOP_IPC.boot) as Promise<unknown>,
    failed: (message: string) => ipcRenderer.invoke(DESKTOP_IPC.bootFailed, message) as Promise<void>,
  })
}

// Platform marking and native mirrors apply to every desktop document: the
// dsh-app shell and, in web-login mode, the Host-origin workspace page. A page
// without the mark presents as a plain browser (`detectEnvironment` reads
// `data-platform` to decide whether desktop bridges are required).
if (isDesktopDocument) {
  markDocumentPlatform()
  syncWindowFullscreen()
  syncNativeTheme()
}
// Every desktop document receives the product bridge: native window chrome
// (drag regions, traffic-light clearance, vibrancy), shortcuts, file actions,
// and update presentation — while the module boot stays on the document's own
// bootstrap path.
if (isDesktopDocument && process.isMainFrame) {
  contextBridge.exposeInMainWorld('dshDesktop', createProductApi())
}

if (isDesktopDocument) {
  contextBridge.exposeInMainWorld('__DSH_LOCALE__', {
    read: () => ipcRenderer.invoke(DESKTOP_IPC.localeBootstrap),
    onChange: (locale: string) => { ipcRenderer.send(DESKTOP_IPC.localeChanged, locale) },
  })
}
