import { useState, useRef, useCallback, useEffect } from 'react'
import type { AskKnowledgeQuestionRequest, AskKnowledgeQuestionResponse, YuanShuSseEvent } from '@deepseek-ai/dsh-yuanshu-client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ChatPanel.module.css'
import type { NS } from './locales.ts'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Array<{
    evidence_id: string
    document_id: string
    title?: string
    content_preview?: string
  }>
  loading?: boolean
}

export interface YuanShuChatInjected {
  readonly askQuestionStream: (request: AskKnowledgeQuestionRequest, signal?: AbortSignal) => AsyncIterable<YuanShuSseEvent>
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function ChatPanel({ askQuestionStream, t }: InjectFace<YuanShuChatInjected> & PropsLocale<typeof NS>): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg])
  }, [])

  const updateLastMessage = useCallback((content: string, citations?: ChatMessage['citations']) => {
    setMessages((prev) => {
      const updated = [...prev]
      if (updated.length === 0) return updated
      const last = updated[updated.length - 1]
      if (last !== undefined && last.role === 'assistant') {
        const newMsg: ChatMessage = { ...last, content, loading: false }
        if (citations !== undefined) {
          newMsg.citations = citations
        }
        updated[updated.length - 1] = newMsg
      }
      return updated
    })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => () => abortRef.current?.abort(), [])

  const handleSend = useCallback(async () => {
    const question = inputText.trim()
    if (!question || loading) return

    const userMsg: ChatMessage = { id: uid(), role: 'user', content: question }
    addMessage(userMsg)
    setInputText('')

    const assistantMsg: ChatMessage = { id: uid(), role: 'assistant', content: '', loading: true }
    addMessage(assistantMsg)
    setLoading(true)
    setError(null)

    try {
      const request: AskKnowledgeQuestionRequest = { question }
      abortRef.current = new AbortController()

      let completed = false
      for await (const event of askQuestionStream(request, abortRef.current.signal)) {
        if (event.event === 'complete' && typeof event.data === 'object' && event.data !== null) {
          const result = event.data as AskKnowledgeQuestionResponse
          updateLastMessage(result.answer, result.citations)
          completed = true
          break
        }
      }
      if (!completed) {
        const message = t('requestFailed')
        updateLastMessage(message, [])
        setError(message)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        updateLastMessage(t('cancelled'), [])
        return
      }

      const message = t('requestFailed')
      updateLastMessage(message, [])
      setError(message)
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [inputText, loading, addMessage, updateLastMessage, t, askQuestionStream])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const renderCitations = (citations?: ChatMessage['citations']) => {
    if (!citations || citations.length === 0) return null
    return (
      <div className={css.citations}>
        <div className={css.citationsLabel}>{t('citations')}:</div>
        {citations.map((cite, idx) => (
          <div key={idx} className={css.citationItem}>
            <span className={css.citationNum}>[{idx + 1}]</span>
            <span className={css.citationTitle}>
              {cite.title || t('documentTitle', { id: cite.document_id })}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={css.container}>
      <div className={css.messages}>
        {messages.length === 0 ? (
          <div className={css.empty}>
            <div className={css.emptyIcon}>💬</div>
            <p className={css.emptyText}>{t('emptyState')}</p>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={`${css.message} ${msg.role === 'user' ? css.messageUser : css.messageAssistant}`}
            >
              <div className={css.messageContent}>
                <div className={css.messageText}>{msg.content}</div>
                {renderCitations(msg.citations)}
              </div>
              {msg.loading && (
                <div className={css.thinking}>
                  <div className={css.dots}>
                    <span className={css.dot} />
                    <span className={css.dot} />
                    <span className={css.dot} />
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={css.input}>
        <div className={css.inputWrap}>
          <textarea
            className={css.textarea}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('inputPlaceholder')}
            disabled={loading}
            rows={1}
          />
          <button
            className={css.sendButton}
            disabled={loading || !inputText.trim()}
            onClick={handleSend}
            aria-label={t('send')}
          >
            ↑
          </button>
        </div>
        {error && <div className={css.error}>{error}</div>}
      </div>
    </div>
  )
}
