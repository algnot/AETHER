const TOKEN_KEY = 'aether_auth_token'

export type AuthUser = {
  id: string
  username: string
  inventory: Record<string, number>
  evolved: Record<string, number>
  coins: number
  gems: number
  dailyStreak: number
  canClaimDaily: boolean
  isDev: boolean
}

type AuthResponse = { token: string; user: AuthUser }
type MeResponse = { user: AuthUser }
type DailyClaimResponse = {
  rewarded: number
  streak: number
  user: AuthUser
}
type SalvageResponse = {
  salvaged: {
    cardId: string
    nameTh: string
    rarity: string
    qty: number
    gems: number
  }[]
  totalCards: number
  totalGems: number
  byRarity: Record<string, { cards: number; gems: number }>
  user: AuthUser
}
type ErrorBody = { error?: string }

export function authHeaders(token?: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & ErrorBody
  if (!res.ok) {
    throw new Error(data.error || `คำขอไม่สำเร็จ (${res.status})`)
  }
  return data
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export async function apiRegister(
  username: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ username, password }),
  })
  return parseJson<AuthResponse>(res)
}

export async function apiLogin(
  username: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ username, password }),
  })
  return parseJson<AuthResponse>(res)
}

export async function apiMe(token: string): Promise<MeResponse> {
  const res = await fetch('/api/auth/me', {
    headers: authHeaders(token),
  })
  return parseJson<MeResponse>(res)
}

export async function apiClaimDaily(token: string): Promise<DailyClaimResponse> {
  const res = await fetch('/api/economy/daily', {
    method: 'POST',
    headers: authHeaders(token),
  })
  return parseJson<DailyClaimResponse>(res)
}

export async function apiSalvageExcess(token: string): Promise<SalvageResponse> {
  const res = await fetch('/api/economy/salvage', {
    method: 'POST',
    headers: authHeaders(token),
  })
  return parseJson<SalvageResponse>(res)
}

type EvolveResponse = {
  cardId: string
  amount: number
  costEach: number
  totalCost: number
  rarity: string
  user: AuthUser
}

export async function apiEvolveCard(
  token: string,
  cardId: string,
  amount = 1,
): Promise<EvolveResponse> {
  const res = await fetch('/api/economy/evolve', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ cardId, amount }),
  })
  return parseJson<EvolveResponse>(res)
}
