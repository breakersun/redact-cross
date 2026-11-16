// Test plumbing: a fresh session per call, the engine answers the mod needs, and
// a bottom prompt.submit hook that records what the model would receive.
import type { TestBody } from 'claude-code/testing'

export type Engine = Parameters<TestBody>[0]
export type On = Parameters<TestBody>[1]
export type Delivered = { text: string; context: readonly string[] }

let sessions = 0

export type Store = { secrets: Record<string, string>; counters: Record<string, number> }

// `store` fakes a redact.enc the session loads from: transcript folder, Keychain and openssl.
export function session(on: On, failing: { id?: boolean | 'hang'; messages?: boolean } = {}, store?: Store): Delivered[] {
  const id = `test-session-${++sessions}`
  const delivered: Delivered[] = []
  if (store) {
    on('env.get', async () => ({ value: '/home' }))
    on('fs.list', async () => ({ value: [{ name: 'project', kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false }] }))
    on('fs.exists', async () => ({ value: true }))
    on('fs.read', async () => ({ value: 'encrypted' }))
    on('fs.write', async () => ({ value: undefined }))
    on('process.run', async (_$, e) => {
      const stdout = e.argv[0] === 'security' ? 'a'.repeat(64) : e.argv.includes('-d') ? JSON.stringify({ id, ...store }) : 'encrypted'
      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
  }
  on('session.id', async () => {
    if (failing.id === 'hang') await new Promise(() => {})
    return failing.id ? { deny: 'session id unavailable' } : { value: id }
  })
  on('session.messages', async () => (failing.messages ? { deny: 'history read denied' } : { value: [] }))
  on('prompt.submit', async (_$, e) => {
    delivered.push({ text: e.text, context: e.context ?? [] })
    return { drop: 'captured' }
  })
  return delivered
}

export function submit($: Engine, text: string) {
  return $.prompt.submit({ text, wait: false, origin: { kind: 'sdk' } })
}
