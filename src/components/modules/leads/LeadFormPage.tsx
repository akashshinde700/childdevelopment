'use client'
import { useEffect } from 'react'
import { useAppStore } from '@/store/app-store'

export default function LeadFormPage() {
  const navigate = useAppStore((s) => s.navigate)
  useEffect(() => { navigate('leads') }, [navigate])
  return null
}
