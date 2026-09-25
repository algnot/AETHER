'use client'

import { useEffect } from 'react'
import { AuthScreen } from '@/components/AuthScreen'
import { DeckBuilder } from '@/components/DeckBuilder'
import { DuelBoard } from '@/components/DuelBoard'
import { GachaScreen } from '@/components/GachaScreen'
import { Menu } from '@/components/Menu'
import { Result } from '@/components/Result'
import { useAuthStore } from '@/store/authStore'
import { useAppStore } from '@/store/gameStore'

export function GameApp() {
  const screen = useAppStore((s) => s.screen)
  const status = useAuthStore((s) => s.status)
  const boot = useAuthStore((s) => s.boot)

  useEffect(() => {
    void boot()
  }, [boot])

  if (status === 'boot') {
    return (
      <div className="auth-boot">
        <p>กำลังโหลด…</p>
      </div>
    )
  }

  if (status === 'guest') return <AuthScreen />

  if (screen === 'deckbuilder') return <DeckBuilder />
  if (screen === 'gacha') return <GachaScreen />
  if (screen === 'duel') return <DuelBoard />
  if (screen === 'result') return <Result />
  return <Menu />
}
