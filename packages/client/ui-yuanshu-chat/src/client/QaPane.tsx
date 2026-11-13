import { useCallback, useEffect, useRef, useState } from 'react'
import type { AskKnowledgeQuestionRequest, AskKnowledgeQuestionResponse, YuanShuSseEvent } from '@deepseek-ai/dsh-yuanshu-client'
import css from './ChatPanel.module.css'
import type { YuanShuChatKey } from './locales.ts'
import { failureKey } from './workbench.ts'
import {
  clearQaSession,
  qaStorageIdentity,
  loadQaSession,
  saveQaSession,
  type StoredQaCitation,
} from './storage.ts'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: readonly StoredQaCitation[]
  loading?: boolean
}

/** 知识问答工作区：流式回答、引用与会话恢复。 */
export interface QaPaneProps {
  readonly askQuestionStream: (request: AskKnowledgeQuestionRequest, signal?: AbortSignal) => AsyncIterable<YuanShuSseEvent>
  readonly t: (key: YuanShuChatKey, params?: Record<string, unknown>) => string
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 知识问答面板，供会话页签与工作台共用。 */
export function QaPane({ askQuestionStream, t }: QaPaneProps) {
  // 刷新恢复：会话 id 与已展示消息一起恢复，避免刷新后服务端另起会话。
  const owner = useRef(qaStorageIdentity())
  const [restored] = useState(loadQaSession)
  const [sessionId, setSessionId] = useState<string | undefined>(restored.sessionId)
  const [messages, setMessages] = useState<ChatMessage[]>(() => restored.messages.map(message => ({
    id: uid(),
    role: message.role,
    content: message.content,
    ...(message.citations === undefined ? {} : { citations: message.citations }),
  })))
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg])
  }, [])

  const updateLastMessage = useCallback((content: string, citations?: readonly StoredQaCitation[]) => {
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

  // 只持久化成型的消息；流式占位与空消息不进入恢复快照。
  useEffect(() => {
    if (owner.current !== qaStorageIdentity()) return
    saveQaSession({
      ...(sessionId === undefined ? {} : { sessionId }),
      messages: messages
        .filter(message => !message.loading && message.content.length > 0)
        .map(message => ({
          role: message.role,
          content: message.content,
          ...(message.citations === undefined ? {} : { citations: message.citations }),
        })),
    })
  }, [messages, sessionId])

  const handleSend = useCallback(async () => {
    const question = inputText.trim()
    if (!question || loading) return

    const identityChanged = owner.current !== qaStorageIdentity()
    if (identityChanged) {
      owner.current = qaStorageIdentity()
      setMessages([])
      setSessionId(undefined)
    }
    const userMsg: ChatMessage = { id: uid(), role: 'user', content: question }
    addMessage(userMsg)
    setInputText('')

    const assistantMsg: ChatMessage = { id: uid(), role: 'assistant', content: '', loading: true }
    addMessage(assistantMsg)
    setLoading(true)
    setError(null)

    try {
      const request: AskKnowledgeQuestionRequest = {
        question,
        ...(sessionId === undefined || identityChanged ? {} : { session_id: sessionId }),
      }
      abortRef.current = new AbortController()

      let completed = false
      for await (const event of askQuestionStream(request, abortRef.current.signal)) {
        if (event.event === 'complete' && typeof event.data === 'object' && event.data !== null) {
          const result = event.data as AskKnowledgeQuestionResponse
          updateLastMessage(result.answer, result.citations)
          if (typeof result.session_id === 'string' && result.session_id.length > 0) setSessionId(result.session_id)
          completed = true
          break
        }
      }
      if (!completed) {
        const message = t('requestFailed')
        updateLastMessage(message)
        setError(message)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        updateLastMessage(t('cancelled'))
        return
      }

      const message = t(failureKey(err))
      updateLastMessage(message)
      setError(message)
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [inputText, loading, sessionId, addMessage, updateLastMessage, t, askQuestionStream])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }, [handleSend])

  const handleNewConversation = useCallback(() => {
    abortRef.current?.abort()
    clearQaSession()
    setSessionId(undefined)
    setMessages([])
    setInputText('')
    setError(null)
  }, [])

  const renderCitations = (citations?: readonly StoredQaCitation[]) => {
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
    <div className={css.qaPane}>
      <div className={css.qaHeader}>
        <span className={css.qaTitle}>{t('qaCapability')}</span>
        <button className={css.linkButton} onClick={handleNewConversation}>{t('newConversation')}</button>
      </div>
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
            onChange={(e) => { setInputText(e.target.value) }}
            onKeyDown={handleKeyDown}
            placeholder={t('inputPlaceholder')}
            disabled={loading}
            rows={1}
          />
          <button
            className={css.sendButton}
            disabled={loading || !inputText.trim()}
            onClick={() => { void handleSend() }}
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
