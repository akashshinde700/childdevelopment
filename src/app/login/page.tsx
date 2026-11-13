'use client'

// Dedicated /login route. The public marketing landing page at / is the
// site's front door; staff reach this page via its Login button. Once
// authenticated, the app shell at / takes over.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store/app-store'
import { LoginPage } from '@/components/layout/LoginPage'

export default function LoginRoute() {
  const router = useRouter()
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (isAuthenticated) router.replace('/')
  }, [isAuthenticated, router])

  return <LoginPage />
}
