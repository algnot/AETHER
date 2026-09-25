import { create } from 'zustand'
import {
  apiClaimDaily,
  apiEvolveCard,
  apiLogin,
  apiMe,
  apiRegister,
  apiSalvageExcess,
  getStoredToken,
  setStoredToken,
  type AuthUser,
} from '../api/auth'

type AuthStatus = 'boot' | 'guest' | 'ready'

interface AuthStore {
  status: AuthStatus
  token: string | null
  user: AuthUser | null
  error: string | null
  dailyMessage: string | null
  claimingDaily: boolean
  salvaging: boolean
  evolving: boolean
  boot: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
  clearError: () => void
  clearDailyMessage: () => void
  claimDaily: () => Promise<void>
  salvageExcess: () => Promise<{ totalCards: number; totalGems: number }>
  evolveCard: (
    cardId: string,
    amount?: number,
  ) => Promise<{ totalCost: number; amount: number }>
  patchUser: (user: AuthUser) => void
  ownedCount: (cardId: string) => number
  evolvedCount: (cardId: string) => number
}

function normalizeUser(user: AuthUser): AuthUser {
  return {
    ...user,
    coins: user.coins ?? 0,
    gems: user.gems ?? 0,
    inventory: user.inventory ?? {},
    evolved: user.evolved ?? {},
    dailyStreak: user.dailyStreak ?? 0,
    canClaimDaily: user.canClaimDaily ?? false,
    isDev: user.isDev ?? false,
  }
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  status: 'boot',
  token: getStoredToken(),
  user: null,
  error: null,
  dailyMessage: null,
  claimingDaily: false,
  salvaging: false,
  evolving: false,

  boot: async () => {
    const token = getStoredToken()
    if (!token) {
      set({ status: 'guest', token: null, user: null })
      return
    }
    try {
      const { user } = await apiMe(token)
      set({ status: 'ready', token, user: normalizeUser(user), error: null })
    } catch {
      setStoredToken(null)
      set({ status: 'guest', token: null, user: null })
    }
  },

  login: async (username, password) => {
    set({ error: null })
    const { token, user } = await apiLogin(username, password)
    setStoredToken(token)
    set({ status: 'ready', token, user: normalizeUser(user), error: null })
  },

  register: async (username, password) => {
    set({ error: null })
    const { token, user } = await apiRegister(username, password)
    setStoredToken(token)
    set({ status: 'ready', token, user: normalizeUser(user), error: null })
  },

  logout: () => {
    setStoredToken(null)
    set({
      status: 'guest',
      token: null,
      user: null,
      error: null,
      dailyMessage: null,
    })
  },

  clearError: () => set({ error: null }),
  clearDailyMessage: () => set({ dailyMessage: null }),

  patchUser: (user) => set({ user: normalizeUser(user) }),

  claimDaily: async () => {
    const token = get().token
    if (!token || get().claimingDaily) return
    set({ claimingDaily: true, dailyMessage: null })
    try {
      const { rewarded, streak, user } = await apiClaimDaily(token)
      set({
        user: normalizeUser(user),
        claimingDaily: false,
        dailyMessage: `รับ ${rewarded} เหรียญแล้ว · สตรีค ${streak} วัน`,
      })
    } catch (err) {
      set({
        claimingDaily: false,
        dailyMessage:
          err instanceof Error ? err.message : 'รับรางวัลรายวันไม่สำเร็จ',
      })
    }
  },

  salvageExcess: async () => {
    const token = get().token
    if (!token || get().salvaging) {
      throw new Error('ยังไม่พร้อมย่อยการ์ด')
    }
    set({ salvaging: true, error: null })
    try {
      const res = await apiSalvageExcess(token)
      set({
        user: normalizeUser(res.user),
        salvaging: false,
      })
      return { totalCards: res.totalCards, totalGems: res.totalGems }
    } catch (err) {
      set({ salvaging: false })
      throw err
    }
  },

  evolveCard: async (cardId, amount = 1) => {
    const token = get().token
    if (!token || get().evolving) {
      throw new Error('ยังไม่พร้อมวิวัฒนาการ')
    }
    set({ evolving: true, error: null })
    try {
      const res = await apiEvolveCard(token, cardId, amount)
      set({
        user: normalizeUser(res.user),
        evolving: false,
      })
      return { totalCost: res.totalCost, amount: res.amount }
    } catch (err) {
      set({ evolving: false })
      throw err
    }
  },

  ownedCount: (cardId) => get().user?.inventory[cardId] ?? 0,
  evolvedCount: (cardId) => get().user?.evolved?.[cardId] ?? 0,
}))
