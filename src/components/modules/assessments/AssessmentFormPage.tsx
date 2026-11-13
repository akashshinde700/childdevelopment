'use client'
import { useEffect } from 'react'
import { useAppStore } from '@/store/app-store'

export default function AssessmentFormPage() {
  const navigate = useAppStore((s) => s.navigate)
  useEffect(() => { navigate('assessments') }, [navigate])
  return null
}
