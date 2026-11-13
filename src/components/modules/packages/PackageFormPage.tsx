'use client'
import { useEffect } from 'react'
import { useAppStore } from '@/store/app-store'

export default function PackageFormPage() {
  const navigate = useAppStore((s) => s.navigate)
  useEffect(() => { navigate('packages') }, [navigate])
  return null
}
