import { cn } from '@/lib/utils'

const SIZES = {
  sm: 'size-9 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-20 text-xl',
} as const

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2)
  const value = parts.map((part) => part[0]?.toUpperCase() ?? '').join('')
  return value || 'HZ'
}

export function MemberAvatar({
  name,
  photoUrl,
  size = 'md',
  className,
}: {
  name: string
  photoUrl?: string | null
  size?: keyof typeof SIZES
  className?: string
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        draggable={false}
        className={cn('shrink-0 rounded-full object-cover', SIZES[size], className)}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand-black font-bold text-brand-yellow',
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
