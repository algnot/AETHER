import { useState, type FormEvent } from 'react'
import { useAuthStore } from '../store/authStore'
import './AuthScreen.css'

type Mode = 'login' | 'register'

export function AuthScreen() {
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)

  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const switchMode = (next: Mode) => {
    setMode(next)
    clearError()
    setLocalError(null)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    clearError()
    setBusy(true)
    try {
      if (mode === 'login') await login(username, password)
      else await register(username, password)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setBusy(false)
    }
  }

  const message = localError || error

  return (
    <div className="auth-root">
      <div className="auth-hero-art" aria-hidden />
      <div className="auth-hero-veil" aria-hidden />
      <div className="auth-panel">
        <h1 className="auth-brand">
          <span className="auth-brand-aether">AETHER</span>
          <span className="auth-brand-duel">DUEL</span>
        </h1>
        <p className="auth-lead">
          {mode === 'login'
            ? 'เข้าสู่ระบบเพื่อใช้คลังการ์ดของคุณ'
            : 'สมัครใหม่ — ได้การ์ดจากเด็คเริ่มต้นทันที'}
        </p>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'on' : ''}
            onClick={() => switchMode('login')}
          >
            เข้าสู่ระบบ
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'on' : ''}
            onClick={() => switchMode('register')}
          >
            สมัครสมาชิก
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            <span>ชื่อผู้ใช้</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="เช่น player_01"
              minLength={3}
              maxLength={24}
              required
            />
          </label>
          <label>
            <span>รหัสผ่าน</span>
            <input
              type="password"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="อย่างน้อย 6 ตัวอักษร"
              minLength={6}
              required
            />
          </label>
          {message && <p className="auth-error">{message}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy
              ? 'กำลังดำเนินการ…'
              : mode === 'login'
                ? 'เข้าสู่ระบบ'
                : 'สมัครและเริ่มเล่น'}
          </button>
        </form>
      </div>
    </div>
  )
}
