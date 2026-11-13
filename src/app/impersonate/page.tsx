'use client'

// Impersonation handoff page (support access).
// The Platform Admin portal writes { token, user } to localStorage under a
// one-shot key and opens this page in a new tab. This page consumes the key
// (removing it immediately), logs the app store in with the minted
// short-lived session, and enters the app — exactly as if the Org Admin had
// logged in, except the session expires in 1 hour and the access is already
// recorded in the ActionLog audit trail.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store/app-store'

const HANDOFF_KEY = 'platform-impersonation-handoff'

export default function ImpersonatePage() {
  const router = useRouter()
  const login = useAppStore((s) => s.login)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HANDOFF_KEY)
      localStorage.removeItem(HANDOFF_KEY) // one-shot: consume immediately
      if (!raw) { setFailed(true); return }
      const { token, user } = JSON.parse(raw)
      if (!token || !user) { setFailed(true); return }
      login(user, token)
      router.replace('/')
    } catch {
      setFailed(true)
    }
  }, [login, router])

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
      {failed ? 'No impersonation handoff found — start again from the Platform Admin portal.' : 'Opening support session…'}
    </div>
  )
}
