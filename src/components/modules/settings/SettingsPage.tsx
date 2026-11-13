'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Settings,
  Building2,
  Phone,
  Mail,
  MapPin,
  Save,
  Upload,
  Globe,
  FileText,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  X,
  User,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import PrintBrandingCard from './PrintBrandingCard'
import PayrollSettingsCard from './PayrollSettingsCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import { authFetch, authUpload } from '@/lib/api-client'

// Types
interface CenterSettingsData {
  id: string
  centerName: string
  address: string | null
  phone: string | null
  email: string | null
  gstNumber: string | null
  hasCenterPassword: boolean
  logo: string | null
  allowHistoricalEntry?: boolean
  loginEmail: string
  loginPassword: string
  loginName: string
  createdAt: string
  updatedAt: string
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const day = String(d.getDate()).padStart(2, '0')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const month = months[d.getMonth()]
    const year = d.getFullYear()
    let hours = d.getHours()
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12 || 12
    return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`
  } catch {
    return dateStr
  }
}

export default function SettingsPage() {
  const user = useAppStore((s) => s.user)
  const logout = useAppStore((s) => s.logout)
  const navigate = useAppStore((s) => s.navigate)
  const updateUser = useAppStore((s) => s.updateUser)
  const [settings, setSettings] = useState<CenterSettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Center form state
  const [formData, setFormData] = useState({
    centerName: 'Your Clinic Name',
    address: '',
    phone: '',
    email: '',
    gstNumber: '',
    gstEnabled: false,
    password: '',
    allowHistoricalEntry: false,
    loginOtpEnabled: false,
  })

  // Login credentials form state
  const [loginData, setLoginData] = useState({
    loginEmail: '',
    loginPassword: '',
    loginName: '',
  })

  // Logo preview state
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  // Fetch settings
  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await authFetch('/api/settings')
        if (res.ok) {
          const json = await res.json()
          setSettings(json)
          setFormData({
            centerName: json.centerName || 'Your Clinic Name',
            address: json.address || '',
            phone: json.phone || '',
            email: json.email || '',
            gstNumber: json.gstNumber || '',
            gstEnabled: !!json.gstNumber,
            password: json.hasCenterPassword ? '••••••••' : '',
            allowHistoricalEntry: !!json.allowHistoricalEntry,
            loginOtpEnabled: !!json.loginOtpEnabled,
          })
          setLoginData({
            loginEmail: json.loginEmail || user?.email || '',
            loginPassword: json.loginPassword || '',
            loginName: json.loginName || user?.name || '',
          })
          setLogoPreview(json.logo || null)

          // Sync user name in the store if it differs from the database
          if (json.loginName && json.loginName !== user?.name) {
            updateUser({ name: json.loginName })
          }
        } else {
          toast.error('Failed to load settings')
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err)
        toast.error('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [user, updateUser])

  // Handle logo upload
  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Client-side validation
    const blockedExtensions = ['.exe', '.zip', '.bat', '.cmd', '.sh', '.dll', '.msi']
    const fileName = file.name.toLowerCase()
    if (blockedExtensions.some(ext => fileName.endsWith(ext))) {
      toast.error('Blocked file type. Only images allowed.')
      return
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only image files (JPG, PNG, WebP) are allowed')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size must be under 2MB')
      return
    }

    setUploading(true)
    try {
      const uploadForm = new FormData()
      uploadForm.append('logo', file)

      // Use authUpload to avoid Content-Type header interference with FormData
      const res = await authUpload('/api/settings/upload-logo', {
        method: 'POST',
        body: uploadForm,
      })

      if (res.ok) {
        const json = await res.json()
        setLogoPreview(json.logo)
        if (json.settings) setSettings(json.settings)
        toast.success('Logo uploaded successfully')
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to upload logo' }))
        toast.error(err.error || 'Failed to upload logo')
      }
    } catch (err) {
      console.error('Logo upload error:', err)
      toast.error('Failed to upload logo')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [])

  // Remove logo
  const handleRemoveLogo = useCallback(async () => {
    setSaving(true)
    try {
      const res = await authFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo: '' }),
      })
      if (res.ok) {
        const json = await res.json()
        setSettings(json)
        setLogoPreview(null)
        toast.success('Logo removed')
      } else {
        toast.error('Failed to remove logo')
      }
    } catch {
      toast.error('Failed to remove logo')
    } finally {
      setSaving(false)
    }
  }, [])

  // Save settings
  const handleSave = useCallback(async () => {
    if (!formData.centerName.trim()) {
      toast.error('Center name is required')
      return
    }

    if (!loginData.loginName.trim()) {
      toast.error('Account name is required')
      return
    }

    if (!loginData.loginEmail.trim()) {
      toast.error('Login email is required')
      return
    }

    setSaving(true)
    setSaveSuccess(false)
    try {
      const payload: Record<string, unknown> = {
        centerName: formData.centerName,
        address: formData.address,
        phone: formData.phone,
        email: formData.email,
        gstNumber: formData.gstEnabled ? formData.gstNumber : '',
        allowHistoricalEntry: formData.allowHistoricalEntry,
        loginOtpEnabled: formData.loginOtpEnabled,
        loginName: loginData.loginName,
        loginEmail: loginData.loginEmail,
      }

      // Only send password if it's not the masked placeholder
      if (formData.password && formData.password !== '••••••••') {
        payload.password = formData.password
      }
      if (loginData.loginPassword && loginData.loginPassword !== '••••••••') {
        payload.loginPassword = loginData.loginPassword
      }

      const res = await authFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const json = await res.json()
        setSettings(json)

        // Update center form from response
        setFormData(prev => ({
          ...prev,
          centerName: json.centerName || prev.centerName,
          address: json.address || '',
          phone: json.phone || '',
          email: json.email || '',
          gstNumber: json.gstNumber || '',
          gstEnabled: !!json.gstNumber,
          password: json.hasCenterPassword ? '••••••••' : '',
        }))

        // Update login credentials in local state
        setLoginData(prev => ({
          ...prev,
          loginName: json.loginName || prev.loginName,
          loginEmail: json.loginEmail || prev.loginEmail,
          loginPassword: json.loginPassword || prev.loginPassword,
        }))

        // Update logo preview from response (in case it was part of save)
        if (json.logo !== undefined) {
          setLogoPreview(json.logo || null)
        }

        // Update user name in the app store so header reflects the change
        if (json.loginName && json.loginName !== user?.name) {
          updateUser({ name: json.loginName })
        }

        // Show success
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)

        // If credentials were updated, show special message
        if (json.credentialsUpdated) {
          toast.success('Settings saved! Login credentials updated. Please login again with new credentials.', {
            duration: 5000,
          })
          // Auto logout after a short delay so user can login with new credentials
          setTimeout(() => {
            logout()
            navigate('login')
          }, 2500)
        } else {
          toast.success('Settings saved successfully')
        }
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to save settings' }))
        toast.error(err.error || 'Failed to save settings')
      }
    } catch (err) {
      const isNetwork = err instanceof TypeError && err.message.toLowerCase().includes('failed to fetch')
      if (isNetwork) {
        console.warn('Settings: network unavailable (dev server may be restarting).')
        toast.error('Network error. Please try again.')
      } else {
        console.error('Save settings error:', err)
        toast.error('Failed to save settings')
      }
    } finally {
      setSaving(false)
    }
  }, [formData, loginData, user, logout, navigate, updateUser])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
          <Skeleton className="h-[500px]" />
          <Skeleton className="h-[500px] lg:col-span-2" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">Manage your center information and login credentials</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || uploading}
          className="bg-gradient-to-r from-[#0F7A87] to-[#0B5A64] hover:from-[#0B5A64] hover:to-[#073E45] shadow-lg shadow-[#0F7A87]/20"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : saveSuccess ? (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Saved!
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Left Column - Logo & Quick Info */}
        <div className="space-y-6">
          {/* Logo Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Center Logo</CardTitle>
              <CardDescription>Upload your center logo</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-4">
                <div
                  className="h-32 w-32 rounded-2xl border-2 border-dashed flex items-center justify-center bg-muted/30 relative overflow-hidden cursor-pointer group"
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  title="Click to update logo"
                >
                  {logoPreview ? (
                    <>
                      <img
                        src={logoPreview}
                        alt="Center Logo"
                        className="h-full w-full rounded-2xl object-contain"
                      />
                      {/* Dark circle overlay button for updating logo */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-2xl flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 hover:bg-black/90 rounded-full p-2 shadow-lg">
                          <Upload className="h-4 w-4 text-white" />
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveLogo(); }}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors shadow-md z-10"
                        title="Remove logo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Building2 className="h-12 w-12 text-muted-foreground/50" />
                      <span className="text-xs text-muted-foreground/70">Click to upload</span>
                    </div>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-white" />
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" />
                      Upload Logo
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">PNG, JPG or WebP. Max 2MB.</p>
              </div>
            </CardContent>
          </Card>

          {/* Quick Info */}
          <Card className="p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Center Name</p>
                  <p className="text-sm font-medium truncate">{formData.centerName || 'Not set'}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                  <Phone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium">{formData.phone || 'Not set'}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
                  <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium truncate">{formData.email || 'Not set'}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                  <User className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Account Name</p>
                  <p className="text-sm font-medium truncate">{loginData.loginName || 'Not set'}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-900/40">
                  <Lock className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Login Email</p>
                  <p className="text-sm font-medium truncate">{loginData.loginEmail || 'Not set'}</p>
                </div>
              </div>
              {formData.gstEnabled && formData.gstNumber && (
                <>
                  <Separator />
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/40">
                      <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">GST Number</p>
                      <p className="text-sm font-medium">{formData.gstNumber}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column - Settings Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Login Account Card */}
          <Card className="border-amber-200 dark:border-amber-800/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                  <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Login Account</CardTitle>
                  <CardDescription>Your current login credentials for accessing the system</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-900/10 p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <strong>Note:</strong> Changing email or password will update your login. You will need to sign in again with the new credentials.
                </p>
              </div>

              {/* Login Name */}
              <div className="space-y-2">
                <Label htmlFor="loginName">Account Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="loginName"
                    value={loginData.loginName}
                    onChange={(e) => setLoginData((prev) => ({ ...prev, loginName: e.target.value }))}
                    placeholder="Enter your name"
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Login Email */}
              <div className="space-y-2">
                <Label htmlFor="loginEmail">Login Email Address *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="loginEmail"
                    type="email"
                    value={loginData.loginEmail}
                    onChange={(e) => setLoginData((prev) => ({ ...prev, loginEmail: e.target.value }))}
                    placeholder="your@email.com"
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Login Password */}
              <div className="space-y-2">
                <Label htmlFor="loginPassword">Login Password *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="loginPassword"
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginData.loginPassword}
                    onChange={(e) => setLoginData((prev) => ({ ...prev, loginPassword: e.target.value }))}
                    placeholder="Enter new password"
                    className="pl-9 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                  >
                    {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Current password is shown. Change it to update your login credentials.</p>
              </div>
            </CardContent>
          </Card>

          {/* Center Information Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Center Information</CardTitle>
              <CardDescription>Update your center details below</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Center Name */}
              <div className="space-y-2">
                <Label htmlFor="centerName">Center Name *</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="centerName"
                    value={formData.centerName}
                    onChange={(e) => setFormData((prev) => ({ ...prev, centerName: e.target.value }))}
                    placeholder="Enter center name"
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                    placeholder="Full center address"
                    className="pl-9 min-h-[80px]"
                  />
                </div>
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                      placeholder="+91 98765 43210"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Center Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="center@example.com"
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>

              {/* Center Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Center Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="Enter center password"
                    className="pl-9 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Password for center records (not login credentials)</p>
              </div>

              <Separator />

              {/* GST Settings */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-base">GST Registration</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Enable GST on invoices if your center is GST registered
                    </p>
                  </div>
                  <Switch
                    checked={formData.gstEnabled}
                    onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, gstEnabled: checked }))}
                  />
                </div>

                {formData.gstEnabled && (
                  <div className="space-y-2 pl-6 border-l-2 border-muted">
                    <Label htmlFor="gstNumber">GST Number</Label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="gstNumber"
                        value={formData.gstNumber}
                        onChange={(e) => setFormData((prev) => ({ ...prev, gstNumber: e.target.value }))}
                        placeholder="22AAAAA0000A1Z5"
                        className="pl-9 uppercase"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      15-digit GSTIN format (e.g., 22AAAAA0000A1Z5)
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Historical Data Entry (migration mode) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Label className="text-base">Allow Historical Data Entry</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Enable migration mode — lets administrators back-date appointments &amp; assessments for records that predate the system. Off by default.
                    </p>
                  </div>
                  <Switch
                    checked={formData.allowHistoricalEntry}
                    onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, allowHistoricalEntry: checked }))}
                  />
                </div>
                {formData.allowHistoricalEntry && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    Migration mode is ON. Historical records are tagged with the entering user and timestamp for audit. Disable this once migration is complete.
                  </div>
                )}
              </div>

              <Separator />

              {/* Login OTP (email two-step verification) — DISABLED app-wide.
                  Login is password-only, so this toggle would have no effect;
                  kept commented so it can be restored with the OTP flow:

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Label className="text-base">Login OTP (Email Verification)</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Two-step login for all staff: password + a 6-digit code emailed on every sign-in. Parent portal accounts are not affected.
                    </p>
                  </div>
                  <Switch
                    checked={formData.loginOtpEnabled}
                    onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, loginOtpEnabled: checked }))}
                  />
                </div>
                {formData.loginOtpEnabled && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    Make sure every staff member&apos;s login email is a REAL, deliverable address before enabling — staff with unreachable emails will not be able to sign in.
                  </div>
                )}
              </div>

              <Separator />
              */}

              {/* Last Updated */}
              {settings?.updatedAt && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Settings className="h-3 w-3" />
                  <span>Last updated: {formatDate(settings.updatedAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Print Branding — full width below the main grid */}
      <PrintBrandingCard />

      {/* Payroll — full width below Print Branding */}
      <PayrollSettingsCard />
    </div>
  )
}
