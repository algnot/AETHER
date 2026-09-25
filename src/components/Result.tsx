import { useAppStore } from '../store/gameStore'
import './Result.css'

export function Result() {
  const game = useAppStore((s) => s.game)
  const tutorialMode = useAppStore((s) => s.tutorialMode)
  const startDuel = useAppStore((s) => s.startDuel)
  const startTutorialDuel = useAppStore((s) => s.startTutorialDuel)
  const leaveDuel = useAppStore((s) => s.leaveDuel)

  if (!game?.winner) return null

  const won = game.winner === 'player'
  const youHp = game.players.player.hp
  const oppHp = game.players.opponent.hp
  const oppName = tutorialMode ? 'บอทฝึก' : 'CPU'
  const maxHp = Math.max(youHp, oppHp, 1)

  return (
    <div className={`result-root ${won ? 'is-win' : 'is-lose'}`}>
      <div className="result-art" aria-hidden />
      <div className="result-veil" aria-hidden />
      <div className="result-rays" aria-hidden />
      <div className="result-sparkles" aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="result-stage">
        <p className="result-brand">AETHER DUEL</p>

        <div className={`result-banner ${won ? 'win' : 'lose'}`}>
          <span className="result-crest" aria-hidden />
          <p className="result-eyebrow">{won ? 'Victory' : 'Defeat'}</p>
          <h1 className="result-title">{won ? 'คุณชนะ!' : 'คุณแพ้'}</h1>
          <p className="result-tagline">
            {won
              ? tutorialMode
                ? 'จบบทฝึก — พร้อมดวลจริงแล้ว'
                : 'หัวใจอีกฝ่ายหมดแล้ว'
              : 'หัวใจคุณหมด — ลองจัดเด็คใหม่แล้วสู้ต่อ'}
          </p>
        </div>

        <div className="result-duel-stats">
          <div className="result-fighter you">
            <span className="rf-label">คุณ</span>
            <div className="rf-bar" aria-hidden>
              <i style={{ width: `${(youHp / maxHp) * 100}%` }} />
            </div>
            <span className="rf-hp">
              <b>{youHp}</b> HP
            </span>
          </div>
          <span className="result-vs" aria-hidden>
            VS
          </span>
          <div className="result-fighter opp">
            <span className="rf-label">{oppName}</span>
            <div className="rf-bar" aria-hidden>
              <i style={{ width: `${(oppHp / maxHp) * 100}%` }} />
            </div>
            <span className="rf-hp">
              <b>{oppHp}</b> HP
            </span>
          </div>
        </div>

        <div className="result-actions">
          <button
            type="button"
            className="result-btn primary"
            onClick={tutorialMode ? startTutorialDuel : startDuel}
          >
            เล่นอีกครั้ง
          </button>
          <button type="button" className="result-btn ghost" onClick={leaveDuel}>
            กลับเมนู
          </button>
        </div>
      </div>
    </div>
  )
}
