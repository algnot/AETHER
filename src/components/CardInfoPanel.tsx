import { getCard } from '../data/cards'
import { getAtkBreakdown } from '../engine/gameEngine'
import { useAppStore } from '../store/gameStore'
import { CARD_TYPE_LABELS, RARITY_LABELS, TRIBE_LABELS } from '../types/game'
import { CardView } from './CardView'
import {
  AtkIcon,
  CardTypeIcon,
  CostBadge,
  FactionBadge,
  TribeIcon,
} from './GameIcons'
import './CardInfoPanel.css'

interface Props {
  cardId: string | null
  /** Slim layout for duel — essentials only */
  compact?: boolean
}

export function CardInfoPanel({ cardId, compact }: Props) {
  const game = useAppStore((s) => s.game)

  if (!cardId) {
    return (
      <aside className={`info-panel empty ${compact ? 'compact' : ''}`}>
        <div className="info-placeholder">เลือกการ์ด</div>
      </aside>
    )
  }

  const card = getCard(cardId)
  const baseAtk = card.type === 'monster' ? card.atk : undefined

  const breakdown =
    game && baseAtk !== undefined
      ? (() => {
          const onPlayer = game.players.player.field.find((m) => m?.cardId === card.id)
          const onOpp = game.players.opponent.field.find((m) => m?.cardId === card.id)
          if (onPlayer) {
            return getAtkBreakdown(game, 'player', card.id, onPlayer.instanceId)
          }
          if (onOpp) {
            return getAtkBreakdown(game, 'opponent', card.id, onOpp.instanceId)
          }
          return null
        })()
      : null

  const modParts = breakdown?.parts.filter((p) => p.value !== 0) ?? []

  return (
    <aside className={`info-panel type-${card.type} ${compact ? 'compact' : ''}`}>
      <div className="info-card-preview">
        <CardView cardId={card.id} size="preview" />
      </div>

      <div className="info-body">
        <p className="info-code">{card.id}</p>
        <h2 className="info-name">{card.nameTh}</h2>
        <p className="info-name-en">{card.name}</p>
        <p className={`info-rarity rarity-${card.rarity}`}>
          {card.rarity} · {RARITY_LABELS[card.rarity]}
        </p>

        <div className="info-icon-row">
          <div className="icon-stat" title="ค่าร่าย">
            <CostBadge cost={card.cost} size="lg" />
            <span className="icon-label">ค่าร่าย</span>
          </div>

          <div className="icon-stat" title={CARD_TYPE_LABELS[card.type]}>
            <FactionBadge tribe={card.tribe} type={card.type} size="lg" />
            <span className="icon-label">
              {card.tribe ? TRIBE_LABELS[card.tribe] : CARD_TYPE_LABELS[card.type]}
            </span>
          </div>

          {baseAtk !== undefined && (
            <div className="icon-stat atk" title="พลังโจมตีตั้งต้น">
              <div className="atk-big">
                <AtkIcon />
                <span>{baseAtk}</span>
              </div>
              <span className="icon-label">ATK</span>
            </div>
          )}
        </div>

        {modParts.length > 0 && (
          <div className="info-atk-mods">
            <p className="info-atk-mods-title">ปรับพลังบนสนาม</p>
            <ul>
              {modParts.map((p) => (
                <li key={p.label} className={p.value > 0 ? 'buff' : 'debuff'}>
                  <span>{p.label}</span>
                  <b>
                    {p.value > 0 ? '+' : ''}
                    {p.value}
                  </b>
                </li>
              ))}
            </ul>
            {breakdown && (
              <p className="info-atk-total">
                รวมบนสนาม <strong>{breakdown.effective}</strong>
              </p>
            )}
          </div>
        )}

        <div className="info-type-line">
          <CardTypeIcon type={card.type} />
          <span>{CARD_TYPE_LABELS[card.type]}</span>
          {card.tribe && (
            <>
              <span className="dot">·</span>
              <TribeIcon tribe={card.tribe} />
              <span>{TRIBE_LABELS[card.tribe]}</span>
            </>
          )}
        </div>

        <div className="info-desc">
          <h3>เอฟเฟค</h3>
          <p>
            {card.type === 'monster' && !card.effectId
              ? 'ไม่มีเอฟเฟค'
              : card.description}
          </p>
        </div>
      </div>
    </aside>
  )
}
