'use client'

import { useEffect, useState } from 'react'
import { Download, Share } from 'lucide-react'

// Chrome's install prompt event (not in the TS DOM lib).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// The event fires once, early — often before the login page has mounted —
// so it's captured at module level and handed to whichever button mounts.
let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // No preventDefault(): that suppressed Chrome's own install banner on
    // every page without our button (e.g. /platform-admin) and logged
    // "Banner not shown". The saved event still powers our button.
    deferredPrompt = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    emit()
  })
}

// Registers the service worker that makes the app installable. Production
// only: in `next dev` a worker would serve stale chunks.
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('SW registration failed:', err))
  }, [])
  return null
}

// iPhone / iPad. iPadOS reports itself as a Mac ("MacIntel"), so a touch
// screen is what gives an iPad away.
function isAppleMobile() {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
}

// "Install App" button — shown only when Chrome says the app can be
// installed and it isn't already running as the installed app. Apple never
// offers an install prompt, so iPhone/iPad get the Share-menu steps instead.
export function InstallAppButton({ className = '' }: { className?: string }) {
  const [canInstall, setCanInstall] = useState(false)
  const [showAppleHint, setShowAppleHint] = useState(false)

  useEffect(() => {
    const update = () => {
      const installed = isInstalled()
      setCanInstall(!!deferredPrompt && !installed)
      setShowAppleHint(isAppleMobile() && !installed)
    }
    update()
    listeners.add(update)
    return () => { listeners.delete(update) }
  }, [])

  if (showAppleHint) {
    return (
      <div className={`rounded-xl border border-[#0F7A87]/30 bg-[#0F7A87]/5 px-4 py-3 text-xs text-[#0F7A87] ${className}`}>
        <p className="flex items-center gap-2 font-semibold text-sm">
          <Download className="h-4 w-4" />
          Install the app on this device
        </p>
        <p className="mt-1 text-gray-600">
          In Safari, tap <Share className="inline h-3.5 w-3.5 -mt-0.5" aria-label="Share" /> Share, then
          {' '}<span className="font-medium">Add to Home Screen</span>.
        </p>
      </div>
    )
  }

  if (!canInstall) return null

  const install = async () => {
    const prompt = deferredPrompt
    if (!prompt) return
    await prompt.prompt()
    await prompt.userChoice
    deferredPrompt = null // a prompt can only be used once
    emit()
  }

  return (
    <button
      type="button"
      onClick={install}
      className={`flex w-full items-center justify-center gap-2 rounded-full border border-[#0F7A87]/30 bg-[#0F7A87]/5 px-4 py-2.5 text-sm font-medium text-[#0F7A87] transition-colors hover:bg-[#0F7A87]/10 ${className}`}
    >
      <Download className="h-4 w-4" />
      Install App on this phone
    </button>
  )
}
