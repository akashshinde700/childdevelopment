'use client'
import { useEffect } from 'react'
import { useAppStore } from '@/store/app-store'

export default function AppointmentFormPage() {
  const navigate = useAppStore((s) => s.navigate)
  useEffect(() => { navigate('appointments') }, [navigate])
  return null
}
