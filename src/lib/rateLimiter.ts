const STORAGE_PREFIX = 'agentics_rl_'

interface AttemptRecord {
  count: number
  firstAttemptAt: number
  lockedUntil: number | null
  lockCount: number
}

interface RateLimiterConfig {
  key: string
  maxAttempts: number
  baseLockoutMs: number
  windowMs: number
  /** Multiply lockout duration by this factor for each successive lockout (default 2) */
  escalationFactor?: number
  maxLockoutMs?: number
}

function getRecord(key: string): AttemptRecord {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return { count: 0, firstAttemptAt: 0, lockedUntil: null, lockCount: 0 }
    return JSON.parse(raw)
  } catch {
    return { count: 0, firstAttemptAt: 0, lockedUntil: null, lockCount: 0 }
  }
}

function setRecord(key: string, record: AttemptRecord) {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(record))
}

export function isLocked(config: RateLimiterConfig): { locked: boolean; remainingMs: number; attempts: number; maxAttempts: number } {
  const rec = getRecord(config.key)
  const now = Date.now()

  if (rec.lockedUntil && now < rec.lockedUntil) {
    return { locked: true, remainingMs: rec.lockedUntil - now, attempts: rec.count, maxAttempts: config.maxAttempts }
  }

  if (rec.lockedUntil && now >= rec.lockedUntil) {
    setRecord(config.key, { count: 0, firstAttemptAt: 0, lockedUntil: null, lockCount: rec.lockCount })
    return { locked: false, remainingMs: 0, attempts: 0, maxAttempts: config.maxAttempts }
  }

  if (rec.firstAttemptAt && now - rec.firstAttemptAt > config.windowMs) {
    setRecord(config.key, { count: 0, firstAttemptAt: 0, lockedUntil: null, lockCount: rec.lockCount })
    return { locked: false, remainingMs: 0, attempts: 0, maxAttempts: config.maxAttempts }
  }

  return { locked: false, remainingMs: 0, attempts: rec.count, maxAttempts: config.maxAttempts }
}

export function recordFailedAttempt(config: RateLimiterConfig): { locked: boolean; remainingMs: number; attempts: number } {
  const rec = getRecord(config.key)
  const now = Date.now()
  const escalation = config.escalationFactor ?? 2
  const maxLock = config.maxLockoutMs ?? 60 * 60 * 1000

  if (rec.firstAttemptAt && now - rec.firstAttemptAt > config.windowMs) {
    rec.count = 0
    rec.firstAttemptAt = 0
  }

  rec.count += 1
  if (!rec.firstAttemptAt) rec.firstAttemptAt = now

  if (rec.count >= config.maxAttempts) {
    const lockDuration = Math.min(config.baseLockoutMs * Math.pow(escalation, rec.lockCount), maxLock)
    rec.lockedUntil = now + lockDuration
    rec.lockCount += 1
    setRecord(config.key, rec)
    return { locked: true, remainingMs: lockDuration, attempts: rec.count }
  }

  setRecord(config.key, rec)
  return { locked: false, remainingMs: 0, attempts: rec.count }
}

export function resetAttempts(key: string) {
  localStorage.removeItem(STORAGE_PREFIX + key)
}

export function formatLockoutTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, '0')}`
  return `${seconds}s`
}

export const LOGIN_LIMITER: RateLimiterConfig = {
  key: 'login',
  maxAttempts: 5,
  baseLockoutMs: 15 * 60 * 1000,   // 15 minuti
  windowMs: 30 * 60 * 1000,        // finestra 30 minuti
  escalationFactor: 2,              // 15min → 30min → 60min
  maxLockoutMs: 60 * 60 * 1000,    // max 1 ora
}

export const TOTP_LIMITER: RateLimiterConfig = {
  key: 'totp',
  maxAttempts: 5,
  baseLockoutMs: 5 * 60 * 1000,    // 5 minuti
  windowMs: 15 * 60 * 1000,        // finestra 15 minuti
  escalationFactor: 2,              // 5min → 10min → 20min
  maxLockoutMs: 30 * 60 * 1000,    // max 30 minuti
}
