// @vitest-environment jsdom
/** 验证「添加至对话」：合成 drop 复用附件入口。 */
import { afterEach, expect, it, vi } from 'vitest'
import { attachFilesToConversation } from '../src/client/attach-to-conversation.ts'

/** jsdom 没有 DataTransfer，用可添加 File 的最小实现代替。 */
class FakeTransfer {
  readonly files: File[] = []
  readonly types: readonly string[] = ['Files']
  readonly items = { add: (file: File): void => { this.files.push(file) } }
}

/** 携带 dataTransfer 的拖拽事件。 */
class FakeDragEvent extends Event {
  readonly dataTransfer: FakeTransfer
  constructor(type: string, init: { bubbles?: boolean; cancelable?: boolean; dataTransfer: FakeTransfer }) {
    super(type, init)
    this.dataTransfer = init.dataTransfer
  }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

/** 注入合成拖拽所需构造器。 */
function stubDragApi(): void {
  vi.stubGlobal('DataTransfer', FakeTransfer)
  vi.stubGlobal('DragEvent', FakeDragEvent)
}

it('没有打开的对话时返回 no-conversation', () => {
  stubDragApi()
  expect(attachFilesToConversation([new File(['x'], 'a.txt')])).toBe('no-conversation')
})

it('把文件通过 drop 事件交给对话输入框', () => {
  stubDragApi()
  const card = document.createElement('div')
  card.setAttribute('data-composer-card', '')
  document.body.append(card)
  const received: File[][] = []
  document.addEventListener('drop', (event) => {
    received.push([...(event as unknown as FakeDragEvent).dataTransfer.files])
  })

  const file = new File(['hello'], 'a.txt', { type: 'text/plain' })
  expect(attachFilesToConversation([file])).toBe('attached')
  expect(received).toEqual([[file]])
})

it('空文件列表返回 unsupported', () => {
  stubDragApi()
  expect(attachFilesToConversation([])).toBe('unsupported')
})
