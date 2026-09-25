/** Calendar day key in Asia/Bangkok (YYYY-MM-DD) */
export function bangkokDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Yesterday's Bangkok calendar date (YYYY-MM-DD) */
export function bangkokYesterdayKey(date: Date = new Date()): string {
  const today = bangkokDateKey(date)
  const [y, m, d] = today.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  utc.setUTCDate(utc.getUTCDate() - 1)
  const yy = utc.getUTCFullYear()
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(utc.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export const STARTING_COINS = 100
export const DAILY_BASE_REWARD = 100
export const DAILY_STREAK_BONUS = 10
export const DAILY_STREAK_CAP = 7

export function dailyRewardAmount(streakAfterClaim: number): number {
  const streak = Math.min(Math.max(streakAfterClaim, 1), DAILY_STREAK_CAP)
  return DAILY_BASE_REWARD + (streak - 1) * DAILY_STREAK_BONUS
}

/** Compute new streak given previous streak and last claim date */
export function computeNewStreak(
  previousStreak: number,
  lastClaimAt: Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!lastClaimAt) return 1
  const lastKey = bangkokDateKey(lastClaimAt)
  const today = bangkokDateKey(now)
  if (lastKey === today) return previousStreak
  const yesterday = bangkokYesterdayKey(now)
  if (lastKey === yesterday) {
    return Math.min(previousStreak + 1, DAILY_STREAK_CAP)
  }
  return 1
}

export function canClaimDaily(
  lastClaimAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastClaimAt) return true
  return bangkokDateKey(lastClaimAt) !== bangkokDateKey(now)
}
