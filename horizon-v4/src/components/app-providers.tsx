import { useEffect, type ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'
import AppConvexProvider from '@/components/convex-client-provider'
import { UpdateBanner } from '@/components/update-banner'
import { I18nProvider } from '@/lib/i18n'
import { UpdateProvider } from '@/lib/app-update'
import { PwaProvider } from '@/lib/pwa'
import { Toaster } from '@/components/ui/sonner'

export function AppProviders({ children }: { children: ReactNode }) {
  // Marks the app as mounted so the boot watchdog never shows its fallback.
  useEffect(() => {
    document.documentElement.dataset.appReady = '1'
  }, [])

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <I18nProvider>
        <AppConvexProvider>
          <UpdateProvider>
            <PwaProvider>{children}</PwaProvider>
            <UpdateBanner />
          </UpdateProvider>
        </AppConvexProvider>
        <Toaster position="top-center" />
      </I18nProvider>
    </ThemeProvider>
  )
}
