import { getCard } from '../data/cards'
import type { CardInstance } from '../types/game'
import { RARITY_LABELS } from '../types/game'
import { AtkIcon, CostBadge, FactionBadge } from './GameIcons'
import { FitText } from './FitText'
import './CardView.css'
import type { CSSProperties } from 'react'

export type CardSize = 'preview' | 'normal' | 'small' | 'tiny'

interface Props {
  instance?: CardInstance
  cardId?: string
  faceDown?: boolean
  /** Prefer `size` — kept for compatibility */
  small?: boolean
  tiny?: boolean
  preview?: boolean
  size?: CardSize
  selected?: boolean
  dimmed?: boolean
  showAtk?: boolean
  /** Hide card name on the banner (deck list) */
  hideName?: boolean
  /** Full-art evolved frame (more art, smaller overlays) */
  evolved?: boolean
  /** Slept / already attacked — rotate 90° */
  exhausted?: boolean
  /** Attack charge toward target / impact on target */
  fx?: 'lunge' | 'hit' | null
  /** Pixel offset for lunge (toward the target) */
  fxOffset?: { x: number; y: number }
  /** Override displayed ATK (e.g. field buffs) */
  atkDisplay?: number
  /** Override displayed cost (e.g. Dynogr 「คาถา」 discount) */
  costDisplay?: number
  className?: string
  onClick?: () => void
  onMouseEnter?: () => void
}

function resolveSize(props: Props): CardSize {
  if (props.size) return props.size
  if (props.preview) return 'preview'
  if (props.tiny) return 'tiny'
  if (props.small) return 'small'
  return 'normal'
}

export function CardView(props: Props) {
  const {
    instance,
    cardId,
    faceDown,
    selected,
    dimmed,
    hideName,
    evolved: evolvedProp,
    exhausted,
    fx,
    fxOffset,
    atkDisplay,
    costDisplay,
    className = '',
    onClick,
    onMouseEnter,
  } = props
  const id = cardId ?? instance?.cardId
  const evolved = evolvedProp ?? instance?.evolved ?? false
  const size = resolveSize(props)

  if (faceDown || !id) {
    return (
      <button
        type="button"
        className={`card-shell size-${size} ${selected ? 'selected' : ''} ${className}`}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
      >
        <div className="card-face face-down">
          <img src="/cards/card-back.png" alt="card back" draggable={false} />
        </div>
      </button>
    )
  }

  const def = getCard(id)
  const shownAtk = atkDisplay ?? def.atk
  const shownCost =
    costDisplay !== undefined
      ? costDisplay
      : instance?.tempCostOverride !== undefined
        ? instance.tempCostOverride
        : def.cost
  const typeClass =
    def.type === 'monster' ? 'monster' : def.type === 'spell' ? 'spell' : 'trap'
  const rarityClass = `rarity-${def.rarity}`
  const shine = def.rarity === 'SR' || def.rarity === 'UR'
  const effectText =
    def.type === 'monster'
      ? def.effectId
        ? def.description
        : 'ไม่มีเอฟเฟค'
      : def.description

  const fxStyle =
    fx === 'lunge' && fxOffset
      ? ({
          '--fx-x': `${fxOffset.x}px`,
          '--fx-y': `${fxOffset.y}px`,
        } as CSSProperties)
      : undefined

  return (
    <button
      type="button"
      className={`card-shell size-${size} ${rarityClass} ${selected ? 'selected' : ''} ${dimmed ? 'dimmed' : ''} ${hideName ? 'hide-name' : ''} ${evolved ? 'is-evo' : ''} ${exhausted ? 'exhausted' : ''} ${fx ? `fx-${fx}` : ''} ${className}`}
      style={fxStyle}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      title={`${def.nameTh} · ${RARITY_LABELS[def.rarity]}${evolved ? ' · Evo' : ''}`}
    >
      <div className={`card-face op-frame ${typeClass}`}>
        <div className="op-outer">
          <div className="op-inner">
            <div className="op-cost">
              <CostBadge
                cost={shownCost}
                size="md"
                variant={def.type}
              />
            </div>

            <div className="op-faction" title={def.tribe ?? def.type}>
              <FactionBadge tribe={def.tribe} type={def.type} size="md" />
            </div>

            <div className="op-art">
              <img src={def.image} alt={def.nameTh} draggable={false} />
              {shine && (
                <>
                  <span className="op-foil op-foil-base" aria-hidden />
                  <span className="op-foil op-foil-sweep" aria-hidden />
                  <span className="op-foil op-foil-sparkle" aria-hidden />
                </>
              )}
              {!evolved && (
                <>
                  <span
                    className={`op-rarity rarity-${def.rarity}`}
                    title={RARITY_LABELS[def.rarity]}
                  >
                    {def.rarity}
                  </span>
                  <span className="op-code">{def.id}</span>
                </>
              )}
            </div>

            <div className="op-textbox">
              <p>{effectText}</p>
            </div>

            <div className="op-banner">
              <div className="op-banner-row">
                {def.type === 'monster' && shownAtk !== undefined ? (
                  <div className="op-atk" title={`ATK ${shownAtk}`}>
                    <AtkIcon />
                    <span>{shownAtk}</span>
                  </div>
                ) : (
                  <div className="op-atk type-icon" title={def.type}>
                    <FactionBadge type={def.type} size="sm" />
                  </div>
                )}
                <div className="op-banner-mid">
                  {!hideName && (
                    <FitText
                      text={def.nameTh}
                      className="op-name"
                      maxPx={evolved ? 12 : 14}
                      minPx={6}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}
