import { useState, useRef, useCallback } from 'react'
import { YuanShuClient, type AskKnowledgeQuestionRequest, type AskKnowledgeQuestionResponse } from '@deepseek-ai/dsh-yuanshu-client'
import css from './ChatPanel.module.css'

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

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export interface ChatPanelProps {
  yuanshuClient: YuanShuClient
  t: (key: string) => string
}

export function ChatPanel({ yuanshuClient, t }: ChatPanelProps): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const updated = [...prev, msg]
      setTimeout(scrollToBottom, 0)
      return updated
    })
  }, [scrollToBottom])

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

      for await (const event of yuanshuClient.askQuestionStream(request, abortRef.current.signal)) {
        if (event.event === 'complete' && typeof event.data === 'object') {
          const result = event.data as AskKnowledgeQuestionResponse
          updateLastMessage(result.answer, result.citations)
          break
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        updateLastMessage('User cancelled', [])
        return
      }

      const message = err instanceof Error ? err.message : t('requestFailed')
      updateLastMessage(message, [])
      setError(message)
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [inputText, loading, addMessage, updateLastMessage, t, yuanshuClient])

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
              {cite.title || `Document ${cite.document_id}`}
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
            ref={inputRef}
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
