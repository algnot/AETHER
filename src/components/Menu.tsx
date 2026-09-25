import { useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { useDeckStore } from '../store/deckStore'
import { useAppStore } from '../store/gameStore'
import { DuelDeckPicker } from './DuelDeckPicker'
import './Menu.css'

export function Menu() {
  const setScreen = useAppStore((s) => s.setScreen)
  const startDuel = useAppStore((s) => s.startDuel)
  const startTutorialDuel = useAppStore((s) => s.startTutorialDuel)
  const deckValid = useDeckStore((s) => s.isDeckValid(s.activeDeckId).valid)
  const username = useAuthStore((s) => s.user?.username)
  const coins = useAuthStore((s) => s.user?.coins ?? 0)
  const gems = useAuthStore((s) => s.user?.gems ?? 0)
  const canClaimDaily = useAuthStore((s) => s.user?.canClaimDaily ?? false)
  const dailyStreak = useAuthStore((s) => s.user?.dailyStreak ?? 0)
  const claimDaily = useAuthStore((s) => s.claimDaily)
  const claimingDaily = useAuthStore((s) => s.claimingDaily)
  const dailyMessage = useAuthStore((s) => s.dailyMessage)
  const clearDailyMessage = useAuthStore((s) => s.clearDailyMessage)
  const logout = useAuthStore((s) => s.logout)

  useEffect(() => {
    if (!dailyMessage) return
    const t = window.setTimeout(() => clearDailyMessage(), 4200)
    return () => window.clearTimeout(t)
  }, [dailyMessage, clearDailyMessage])

  return (
    <div className="menu-root">
      <div className="menu-hero-art" aria-hidden />
      <div className="menu-hero-veil" aria-hidden />
      <div className="menu-hero-grain" aria-hidden />

      <div className="menu-account">
        <div className="menu-coins" title="เหรียญ">
          <span className="menu-coin-icon" aria-hidden />
          <span className="menu-coin-amount">{coins.toLocaleString('th-TH')}</span>
        </div>
        <div className="menu-gems" title="เพชร">
          <span className="menu-gem-icon" aria-hidden />
          <span className="menu-gem-amount">{gems.toLocaleString('th-TH')}</span>
        </div>
        {canClaimDaily ? (
          <button
            type="button"
            className="menu-daily-btn"
            disabled={claimingDaily}
            onClick={() => void claimDaily()}
          >
            {claimingDaily ? 'กำลังรับ…' : 'ล็อกอินรายวัน'}
          </button>
        ) : (
          <span className="menu-daily-done" title={`สตรีค ${dailyStreak} วัน`}>
            สตรีค {dailyStreak} วัน
          </span>
        )}
        <span className="menu-account-name">{username}</span>
        <button type="button" className="menu-account-logout" onClick={logout}>
          ออกจากระบบ
        </button>
      </div>

      {dailyMessage && (
        <p className="menu-daily-toast" role="status">
          {dailyMessage}
        </p>
      )}

      <div className="menu-hero-content">
        <h1 className="menu-brand">
          <span className="menu-brand-aether">AETHER</span>
          <span className="menu-brand-duel">DUEL</span>
        </h1>

        <nav className="menu-actions" aria-label="เมนูหลัก">
          <button
            type="button"
            className="menu-btn menu-btn-primary"
            disabled={!deckValid}
            onClick={startDuel}
          >
            เริ่มดูเอล vs CPU
          </button>
          <button
            type="button"
            className="menu-btn menu-btn-ghost"
            onClick={startTutorialDuel}
          >
            สอนเล่น
          </button>
          <button
            type="button"
            className="menu-btn menu-btn-ghost"
            onClick={() => setScreen('gacha')}
          >
            กาชา
          </button>
          <button
            type="button"
            className="menu-btn menu-btn-ghost"
            onClick={() => setScreen('deckbuilder')}
          >
            จัดเด็ค
          </button>
        </nav>
      </div>

      <footer className="menu-deck-footer">
        <DuelDeckPicker />
      </footer>
    </div>
  )
}
