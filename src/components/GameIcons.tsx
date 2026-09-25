import type { LucideIcon } from 'lucide-react'
import {
  Bomb,
  BookOpen,
  Bot,
  Bug,
  Crown,
  Flame,
  Skull,
  Sword,
  Zap,
} from 'lucide-react'
import type { CardType, Tribe } from '../types/game'
import './GameIcons.css'

interface IconProps {
  className?: string
  title?: string
}

const LUCIDE = {
  size: 18,
  strokeWidth: 2,
  'aria-hidden': true as const,
}

function LucideWrap({
  Icon,
  className = '',
  title,
}: {
  Icon: LucideIcon
  className?: string
  title?: string
}) {
  return (
    <Icon
      className={`gicon lucide-gicon ${className}`.trim()}
      {...LUCIDE}
      aria-label={title}
    />
  )
}

export function EnergyIcon({ className = '', title = 'พลังงาน' }: IconProps) {
  return <LucideWrap Icon={Zap} className={className} title={title} />
}

export function AtkIcon({ className = '', title = 'พลังโจมตี' }: IconProps) {
  return (
    <LucideWrap Icon={Sword} className={`atk-icon ${className}`} title={title} />
  )
}

export function MonsterTypeIcon({ className = '', title = 'มอนสเตอร์' }: IconProps) {
  return <LucideWrap Icon={Skull} className={className} title={title} />
}

export function SpellTypeIcon({ className = '', title = 'เวทย์มนต์' }: IconProps) {
  return <LucideWrap Icon={BookOpen} className={className} title={title} />
}

export function TrapTypeIcon({ className = '', title = 'กับดัก' }: IconProps) {
  return <LucideWrap Icon={Bomb} className={className} title={title} />
}

const TRIBE_ICONS: Record<Tribe, LucideIcon> = {
  insect: Bug,
  dragon: Flame,
  warrior: Sword,
  robot: Bot,
  god: Crown,
}

export function TribeIcon({
  tribe,
  className = '',
}: {
  tribe: Tribe
  className?: string
}) {
  return (
    <LucideWrap
      Icon={TRIBE_ICONS[tribe]}
      className={`tribe-icon tribe-${tribe} ${className}`}
      title={tribe}
    />
  )
}

export function CardTypeIcon({
  type,
  className = '',
}: {
  type: CardType
  className?: string
}) {
  if (type === 'spell') return <SpellTypeIcon className={className} />
  if (type === 'trap') return <TrapTypeIcon className={className} />
  return <MonsterTypeIcon className={className} />
}

export function CostBadge({
  cost,
  size = 'md',
  variant: _variant,
}: {
  cost: number
  size?: 'sm' | 'md' | 'lg'
  variant?: CardType
}) {
  return (
    <div className={`cost-badge size-${size}`} title={`ค่าร่าย ${cost}`}>
      <EnergyIcon className="cost-bolt" />
      <span className="cost-num">{cost}</span>
    </div>
  )
}

export function FactionBadge({
  tribe,
  type,
  size = 'md',
}: {
  tribe?: Tribe
  type: CardType
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <div
      className={`faction-badge size-${size} type-${type} ${tribe ? `tribe-${tribe}` : ''}`}
      title={tribe ?? type}
    >
      {tribe ? <TribeIcon tribe={tribe} /> : <CardTypeIcon type={type} />}
    </div>
  )
}
