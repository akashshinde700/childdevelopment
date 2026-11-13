'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store/app-store'

export default function PatientHistoryRoute() {
  const router = useRouter()
  const isAuthenticated = useAppStore((state) => state.isAuthenticated)
  const navigate = useAppStore((state) => state.navigate)
  const setSelectedPatient = useAppStore((state) => state.setSelectedPatient)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }
    setSelectedPatient(null)
    navigate('patient-history')
    router.push('/')
  }, [isAuthenticated, navigate, router, setSelectedPatient])

  return null
}
