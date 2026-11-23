/**
 * Append-only file sink for MCP client lifecycle logging.
 *
 * Writes one line per lifecycle event (connect/disconnect/token refresh/tool
 * sync/give-up) to a dedicated log file so the connection progress stays
 * inspectable after the fact, independent of where the Host's stderr goes.
 * Writes are fire-and-forget: logging never blocks or fails a connection —
 * the first sink error disables the sink for the process lifetime.
 *
 * Default sink is `~/.dsh/logs/mcp-client.log` (5 MB, then rotate to `.1`).
 * Override the path with `DSH_MCP_FILELOG=<path>`, or turn the sink off with
 * `DSH_MCP_FILELOG=off`.
 *
 * @module
 */

import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/** Rotate the active file once it exceeds 5 MB; one rotated generation is kept. */
const MAX_LOG_BYTES = 5 * 1024 * 1024

const pid = process.pid

/** `undefined` = sink not probed yet, `null` = probe failed, sink disabled. */
let resolved: string | undefined | null

function sink(): string | undefined {
  if (resolved !== undefined) return resolved ?? undefined
  const override = process.env.DSH_MCP_FILELOG
  if (override === 'off') {
    resolved = null
    return undefined
  }
  resolved = override !== undefined && override !== '' && override !== 'on'
    ? override
    : join(homedir(), '.dsh', 'logs', 'mcp-client.log')
  return resolved
}

async function write(line: string): Promise<void> {
  const path = sink()
  if (path === undefined) return
  try {
    await mkdir(dirname(path), { recursive: true })
    try {
      const info = await stat(path)
      if (info.size > MAX_LOG_BYTES) await rename(path, `${path}.1`).catch(() => undefined)
    } catch { /* the active file does not exist yet */ }
    await appendFile(path, line, 'utf8')
  } catch {
    // A broken sink (bad path, full disk, permissions) must never take down
    // a connection: disable it instead of retrying forever.
    resolved = null
  }
}

/**
 * Record one MCP client lifecycle event to the file sink.
 * @param event - Short event tag, e.g. `connected` or `reconnect-scheduled`.
 * @param server - The plugin instance's server name.
 * @param detail - Optional single-line detail (no trailing newline).
 */
export function mcpFileLog(event: string, server: string, detail?: string): void {
  const time = new Date().toISOString()
  const suffix = detail === undefined ? '' : ` ${detail}`
  void write(`${time} pid=${pid} server=${server} ${event}${suffix}\n`)
}
