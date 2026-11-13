'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { useAppStore, getRoleLabel, getRoleColor, type AppPage } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  Bell,
  Moon,
  Sun,
  User,
  LogOut,
  Menu,
  Shield,
  Star,
  CalendarDays,
  ClipboardCheck,
  IndianRupee,
  Info,
  Package,
  Briefcase,
  Receipt,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { authFetch, authUpload } from '@/lib/api-client'
import { toast } from 'sonner'

interface NotificationItem {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  isRead: boolean
  createdAt: string
}

const notificationIcons: Record<string, React.ReactNode> = {
  appointment: <CalendarDays className="h-4 w-4 text-blue-500" />,
  assessment: <ClipboardCheck className="h-4 w-4 text-purple-500" />,
  payment: <IndianRupee className="h-4 w-4 text-emerald-500" />,
  package: <Package className="h-4 w-4 text-amber-500" />,
  hr: <Briefcase className="h-4 w-4 text-indigo-500" />,
  expense: <Receipt className="h-4 w-4 text-rose-500" />,
  general: <Info className="h-4 w-4 text-gray-500" />,
}

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  patients: 'Patient Management',
  'patient-form': 'Register Patient',
  'patient-profile': 'Patient Profile',
  'patient-history': 'Patient History',
  appointments: 'Appointment Management',
  'appointment-form': 'Schedule Appointment',
  packages: 'Package Management',
  'package-form': 'Create Package',
  sessions: 'Therapy Sessions',
  assessments: 'Assessment Management',
  'assessment-form': 'Schedule Assessment',
  billing: 'Billing & Invoices',
  payments: 'Payment Management',
  employees: 'Employee Management',
  attendance: 'Attendance Management',
  leaves: 'Leave Management',
  payroll: 'Payroll Management',
  expenses: 'Expense Management',
  reports: 'Reports',
  leads: 'Leads & Inquiries',
  'lead-form': 'New Lead',
  'whatsapp-logs': 'WhatsApp Logs',
  settings: 'Settings',
  'user-management': 'User Management',
  print: 'Print Center',
  projection: 'Projection Report',
  'system-config': 'System Configuration',
  parent: 'Parent Management',
  'parent-login': 'Parent Login Management',
  'parent-dashboard': 'My Portal',
  'parent-appointments': 'My Appointments',
  'parent-sessions': 'Therapy Notes',
  'parent-assessments': 'Assessment Reports',
  'parent-payments': 'Payments & Invoices',
}

export function AppHeader() {
  const { currentPage, sidebarOpen, setSidebarOpen, user, logout, navigate, updateUser } = useAppStore()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const handlePhotoUpload = async (file: File) => {
    setUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await authUpload('/api/users/me/photo', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        updateUser({ avatar: data.avatar })
        toast.success('Profile photo updated')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to upload photo')
      }
    } catch {
      toast.error('Failed to upload photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handlePhotoRemove = async () => {
    setUploadingPhoto(true)
    try {
      const res = await authFetch('/api/users/me/photo', { method: 'DELETE' })
      if (res.ok) {
        updateUser({ avatar: null })
        toast.success('Profile photo removed')
      } else {
        toast.error('Failed to remove photo')
      }
    } catch {
      toast.error('Failed to remove photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const fetchNotifications = React.useCallback(async () => {
    try {
      const res = await authFetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
    } catch { /* non-fatal — bell just stays empty */ }
  }, [])

  React.useEffect(() => {
    if (!user) return
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60000)
    return () => clearInterval(interval)
  }, [user, fetchNotifications])

  const handleNotificationClick = async (n: NotificationItem) => {
    if (!n.isRead) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)))
      setUnreadCount((c) => Math.max(0, c - 1))
      authFetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id }),
      }).catch(() => {})
    }
    if (n.link) navigate(n.link as AppPage)
  }

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((x) => ({ ...x, isRead: true })))
    setUnreadCount(0)
    authFetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    }).catch(() => {})
  }

  const timeAgo = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const initials = user?.name?.split(' ').map(n => n[0]).join('') || 'U'

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-slate-200/60 bg-background/90 px-4 backdrop-blur-lg supports-[backdrop-filter]:bg-background/70 shadow-sm shadow-slate-900/5 transition-colors duration-300 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 md:hidden interactive-smooth"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex flex-col">
        <h1 className="text-lg font-semibold leading-tight">{pageTitles[currentPage] || 'Dashboard'}</h1>
      </div>

      <div className="flex-1" />

      {/* Search lives on the Dashboard (live results dropdown across
          patients/invoices/payments/employees/leads) — removed the
          duplicate simpler search box that used to be here to avoid two
          search inputs competing for attention on the same screen. */}

      {/* Notifications */}
      <DropdownMenu onOpenChange={(open) => { if (open) fetchNotifications() }}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground interactive-smooth hover:text-foreground"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
          <div className="flex items-center justify-between px-2 py-1.5">
            <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <DropdownMenuSeparator />
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`flex items-start gap-2.5 py-2.5 cursor-pointer ${!n.isRead ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''}`}
                >
                  <span className="mt-0.5 shrink-0">{notificationIcons[n.type] || notificationIcons.general}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold truncate">{n.title}</p>
                      {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">{timeAgo(n.createdAt)}</p>
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Theme toggle */}
      {mounted && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="text-muted-foreground interactive-smooth hover:text-foreground"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      )}

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-9 w-9 rounded-full interactive-smooth hover:shadow-lg">
            <Avatar className="h-9 w-9 ring-2 ring-[#0F7A87]/20 ring-offset-1 ring-offset-background">
              {user?.avatar && <AvatarImage src={user.avatar} alt={user.name || 'User'} />}
              <AvatarFallback className="bg-gradient-to-br from-[#0F7A87] to-[#0B5A64] text-white text-sm font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col space-y-1.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{user?.name || 'User'}</p>
                <Star className="h-3 w-3 text-[#F2673D] fill-[#F2673D]" />
              </div>
              <p className="text-xs text-muted-foreground">{user?.email || ''}</p>
              {user && (
                <Badge variant="outline" className={`w-fit text-[10px] px-1.5 py-0 ${getRoleColor(user.role)}`}>
                  {getRoleLabel(user.role)}
                </Badge>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setProfileDialogOpen(true)}>
            <User className="mr-2 h-4 w-4" />
            My Profile
          </DropdownMenuItem>
          {user?.role === 'parent' && (
            <DropdownMenuItem onClick={() => useAppStore.getState().navigate('parent-dashboard' as any)}>
              <User className="mr-2 h-4 w-4" />
              My Portal
            </DropdownMenuItem>
          )}
          {user?.role !== 'parent' && (
            <DropdownMenuItem onClick={() => useAppStore.getState().navigate('settings')}>
              <Shield className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* My Profile dialog — self-service avatar upload/remove */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>My Profile</DialogTitle>
            <DialogDescription>Manage your account photo</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <Avatar className="h-24 w-24 ring-2 ring-[#0F7A87]/20 ring-offset-2 ring-offset-background">
              {user?.avatar && <AvatarImage src={user.avatar} alt={user.name || 'User'} />}
              <AvatarFallback className="bg-gradient-to-br from-[#0F7A87] to-[#0B5A64] text-white text-2xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <p className="text-sm font-medium">{user?.name || 'User'}</p>
              <p className="text-xs text-muted-foreground">{user?.email || ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploadingPhoto}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handlePhotoUpload(file)
                    e.target.value = ''
                  }}
                />
                <span className="inline-flex items-center gap-1.5 text-sm font-medium border rounded-md px-3 py-1.5 cursor-pointer hover:bg-muted transition-colors">
                  {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {user?.avatar ? 'Replace Photo' : 'Upload Photo'}
                </span>
              </label>
              {user?.avatar && (
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive" disabled={uploadingPhoto} onClick={handlePhotoRemove}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">JPG, PNG or WebP. Max 2MB.</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setProfileDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  )
}
