/** Browser-safe enterprise authorization request. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Explicit consent sent over an authenticated Session Remote invocation. */
export interface EnterpriseAuthorization {
  readonly sessionId: SessionId
  readonly consoleToken: string
  readonly tenant: string
  readonly scope: 'enterprise:read' | 'enterprise:read enterprise:execute'
}
