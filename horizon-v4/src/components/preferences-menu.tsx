import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Download, Languages, Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LANGS, useI18n, type Lang } from '@/lib/i18n'
import { usePwa } from '@/lib/pwa'

const ORDER = ['light', 'dark', 'system'] as const

export function PreferencesMenu() {
  const { t, lang, setLang } = useI18n()
  const { theme, setTheme } = useTheme()
  const { installed, install } = usePwa()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Render a stable value until mounted so server and client HTML match.
  const current = mounted && theme ? theme : 'system'
  const next = ORDER[(ORDER.indexOf(current as (typeof ORDER)[number]) + 1) % ORDER.length]
  const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : Monitor
  const label =
    current === 'light'
      ? t('theme.light')
      : current === 'dark'
        ? t('theme.dark')
        : t('theme.system')

  return (
    <div className="flex items-center gap-1">
      {mounted && !installed ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => void install()}
          aria-label={t('pwa.install')}
          title={t('pwa.install')}
        >
          <Download />
        </Button>
      ) : null}
      <label className="relative inline-flex items-center">
        <span className="sr-only">{t('common.language')}</span>
        <Languages
          aria-hidden
          className="pointer-events-none absolute left-2 size-4 text-muted-foreground"
        />
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          className="h-9 appearance-none rounded-md border border-input bg-background pl-8 pr-2 text-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setTheme(next)}
        aria-label={`${t('common.theme')}: ${label}`}
        title={`${t('common.theme')}: ${label}`}
      >
        <Icon />
      </Button>
    </div>
  )
}
