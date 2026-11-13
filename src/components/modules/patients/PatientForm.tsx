'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { differenceInYears, differenceInMonths, differenceInDays, format } from 'date-fns'
import {
  ArrowLeft,
  Save,
  Loader2,
  User,
  FileText,
  GraduationCap,
  Phone,
  MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
import { useToast } from '@/hooks/use-toast'

// Types
interface PatientFormData {
  childName: string
  gender: string
  dateOfBirth: string
  fatherName: string
  motherName: string
  parentName: string
  mobile: string
  alternateNumber: string
  email: string
  address: string
  city: string
  state: string
  pincode: string
  schoolName: string
  class: string
  referredBy: string

  photo: string
  aadhaar: string
  diagnosis: string
  diagnosisReport: string

  medicalHistory: string
  birthHistory: string
}

const initialFormData: PatientFormData = {
  childName: '',
  gender: '',
  dateOfBirth: '',
  fatherName: '',
  motherName: '',
  parentName: '',
  mobile: '',
  alternateNumber: '',
  email: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  schoolName: '',
  class: '',
  referredBy: '',
  photo: '',
  aadhaar: '',
  diagnosis: '',
  diagnosisReport: '',
  medicalHistory: '',
  birthHistory: '',
}

const referredByOptions = [
  { value: 'Doctor', label: 'Doctor' },
  { value: 'School', label: 'School' },
  { value: 'Parent Reference', label: 'Parent Reference' },
  { value: 'Social Media', label: 'Social Media' },
  { value: 'Advertisement', label: 'Advertisement' },
  { value: 'Website', label: 'Website' },
  { value: 'Walk-in', label: 'Walk-in' },
]

function calculateAge(dateOfBirth: string): string {
  if (!dateOfBirth) return ''
  try {
    const dob = new Date(dateOfBirth)
    const now = new Date()
    const years = differenceInYears(now, dob)
    const months = differenceInMonths(now, dob)
    const days = differenceInDays(now, dob)

    if (years > 0) return `${years} year${years > 1 ? 's' : ''}, ${months % 12} month${months % 12 > 1 ? 's' : ''}`
    if (months > 0) return `${months} month${months > 1 ? 's' : ''}, ${days % 30} day${days % 30 > 1 ? 's' : ''}`
    return `${days} day${days > 1 ? 's' : ''}`
  } catch {
    return ''
  }
}

export default function PatientForm() {
  const { navigate, currentPatientId } = useAppStore()
  const { toast } = useToast()
  const [formData, setFormData] = useState<PatientFormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof PatientFormData, string>>>({})

  const isEditing = !!currentPatientId

  // Fetch patient data when editing
  const fetchPatient = useCallback(async () => {
    if (!currentPatientId) return
    setLoading(true)
    try {
      const res = await authFetch(`/api/patients/${currentPatientId}`)
      if (res.ok) {
        const json = await res.json()
        const p = json.patient
        if (p) {
                setFormData({
          childName: p.childName || '',
          gender: p.gender || '',
          dateOfBirth: p.dateOfBirth
            ? format(new Date(p.dateOfBirth), 'yyyy-MM-dd')
            : '',
          fatherName: p.fatherName || '',
          motherName: p.motherName || '',
          parentName: p.parentName || '',
          mobile: p.mobile || '',
          alternateNumber: p.alternateNumber || '',
          email: p.email || '',
          address: p.address || '',
          city: p.city || '',
          state: p.state || '',
          pincode: p.pincode || '',
          schoolName: p.schoolName || '',
          class: p.class || '',
          referredBy: p.referredBy || '',
          
          medicalHistory: p.medicalHistory || '',
          birthHistory: p.birthHistory || '',
          diagnosis: p.diagnosis || '',
          diagnosisReport: p.diagnosisReport || '',
          photo: p.photo || '',
          aadhaar: p.aadhaar || '',
        })
        }
      }
    } catch (err) {
      console.error('Failed to fetch patient:', err)
      toast({
        title: 'Error',
        description: 'Failed to load patient data.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [currentPatientId, toast])

  useEffect(() => {
    if (isEditing) {
      fetchPatient()
    }
  }, [isEditing, fetchPatient])

  const updateField = (field: keyof PatientFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof PatientFormData, string>> = {}

    if (!formData.childName.trim()) newErrors.childName = 'Child name is required'
    if (!formData.gender) newErrors.gender = 'Gender is required'
    if (!formData.dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required'
    if (!formData.mobile.trim()) newErrors.mobile = 'Mobile number is required'
    else if (!/^\d{10}$/.test(formData.mobile.replace(/\s/g, ''))) newErrors.mobile = 'Enter a valid 10-digit mobile number'
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Enter a valid email address'
    if (formData.aadhaar && !/^\d{12}$/.test(formData.aadhaar)) newErrors.aadhaar = 'Aadhaar number must be 12 digits'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) {
      // Focus the first invalid field so the user notices the error even
      // when it's below the fold on this long, multi-section form.
      setTimeout(() => {
        const firstErrorField = document.querySelector('[aria-invalid="true"]') as HTMLElement | null
        firstErrorField?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        firstErrorField?.focus()
      }, 0)
      return
    }

    setSaving(true)

    try {
      const formDataToSend = new FormData()

      const payload = { ...formData, parentName: formData.parentName || formData.fatherName }
      Object.entries(payload).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formDataToSend.append(key, value as string)
        }
      })

      if (isEditing && currentPatientId) {
        formDataToSend.append('id', currentPatientId)
      }

      const res = await authFetch('/api/patients', {
        method: isEditing ? 'PUT' : 'POST',
        body: formDataToSend,
      })
      const json = await res.json()

      if (res.ok) {
        toast({
          title: isEditing ? 'Patient Updated' : 'Patient Registered',
          description: `${formData.childName} has been ${isEditing ? 'updated' : 'registered'} successfully.`,
        })

        navigate('patients')
      } else {
        toast({
          title: 'Error',
          description: json.error || 'Something went wrong.',
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to save patient. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate('patients')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isEditing ? 'Edit Patient' : 'Register New Patient'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isEditing ? 'Update patient information' : 'Fill in the details to register a new patient'}
            </p>
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-1.5" />
              {isEditing ? 'Update Patient' : 'Register Patient'}
            </>
          )}
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Row 1: Child Info */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Child Information
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="childName">
                  Child Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="childName"
                  placeholder="Enter child's full name"
                  value={formData.childName}
                  onChange={(e) => updateField('childName', e.target.value)}
                  aria-invalid={!!errors.childName}
                />
                {errors.childName && (
                  <p className="text-xs text-destructive">{errors.childName}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">
                  Gender <span className="text-destructive">*</span>
                </Label>
                <Select value={formData.gender} onValueChange={(v) => updateField('gender', v)}>
                  <SelectTrigger className="w-full" aria-invalid={!!errors.gender}>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {errors.gender && (
                  <p className="text-xs text-destructive">{errors.gender}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">
                  Date of Birth <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => updateField('dateOfBirth', e.target.value)}
                  aria-invalid={!!errors.dateOfBirth}
                />
                {errors.dateOfBirth && (
                  <p className="text-xs text-destructive">{errors.dateOfBirth}</p>
                )}
                {formData.dateOfBirth && (
                  <p className="text-xs text-muted-foreground">
                    Age: <span className="font-medium text-foreground">{calculateAge(formData.dateOfBirth)}</span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              Parent / Guardian Information
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="fatherName">Father&apos;s Name</Label>
              <Input
                id="fatherName"
                placeholder="Father's name"
                value={formData.fatherName}
                onChange={(e) => updateField('fatherName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="motherName">Mother&apos;s Name</Label>
              <Input
                id="motherName"
                placeholder="Mother's name"
                value={formData.motherName}
                onChange={(e) => updateField('motherName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobile">
                Mobile Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mobile"
                placeholder="10-digit mobile number"
                value={formData.mobile}
                onChange={(e) => updateField('mobile', e.target.value)}
                aria-invalid={!!errors.mobile}
              />
              {errors.mobile && (
                <p className="text-xs text-destructive">{errors.mobile}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="alternateNumber">Alternate Number</Label>
              <Input
                id="alternateNumber"
                placeholder="Alternate mobile number"
                value={formData.alternateNumber}
                onChange={(e) => updateField('alternateNumber', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@example.com"
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Row 3: Address */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Address
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                placeholder="Full address"
                value={formData.address}
                onChange={(e) => updateField('address', e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="City"
                value={formData.city}
                onChange={(e) => updateField('city', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                placeholder="State"
                value={formData.state}
                onChange={(e) => updateField('state', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pincode">Pincode</Label>
              <Input
                id="pincode"
                placeholder="6-digit pincode"
                value={formData.pincode}
                onChange={(e) => updateField('pincode', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              Education & Referral
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="schoolName">School Name</Label>
              <Input
                id="schoolName"
                placeholder="Name of school"
                value={formData.schoolName}
                onChange={(e) => updateField('schoolName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="class">Class / Grade</Label>
              <Input
                id="class"
                placeholder="e.g., Class 3, Pre-KG"
                value={formData.class}
                onChange={(e) => updateField('class', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="referredBy">Referred By</Label>
              <Select value={formData.referredBy} onValueChange={(v) => updateField('referredBy', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select referral source" />
                </SelectTrigger>
                <SelectContent>
                  {referredByOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Clinical Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="diagnosis">Diagnosis</Label>
              <Input
                id="diagnosis"
                placeholder="e.g., Autism, ADHD"
                value={formData.diagnosis}
                onChange={(e) => updateField('diagnosis', e.target.value)}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="medicalHistory">Medical History</Label>
              <Textarea
                id="medicalHistory"
                placeholder="Relevant medical history, medications, allergies, surgeries..."
                value={formData.medicalHistory}
                onChange={(e) => updateField('medicalHistory', e.target.value)}
                rows={3}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="birthHistory">Birth History</Label>
              <Textarea
                id="birthHistory"
                placeholder="Type of delivery, gestational age, birth weight, complications..."
                value={formData.birthHistory}
                onChange={(e) => updateField('birthHistory', e.target.value)}
                rows={3}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="aadhaar">Aadhaar Number</Label>
              <Input
                id="aadhaar"
                placeholder="12-digit Aadhaar number"
                maxLength={12}
                value={formData.aadhaar}
                onChange={(e) => updateField('aadhaar', e.target.value.replace(/\D/g, ''))}
                aria-invalid={!!errors.aadhaar}
              />
              {errors.aadhaar && (
                <p className="text-xs text-destructive">{errors.aadhaar}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate('patients')}>
            Cancel
          </Button>
          <Button type="submit" onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                {isEditing ? 'Updating...' : 'Registering...'}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1.5" />
                {isEditing ? 'Update Patient' : 'Register Patient'}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
