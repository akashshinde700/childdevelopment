'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { useAppStore, type AuthUser } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { Eye, EyeOff, LogIn, Loader2, Mail, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { InstallAppButton } from '@/components/pwa/Pwa'

export function LoginPage() {
  const { login } = useAppStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  // OTP login DISABLED — login is password-only. State kept commented so the
  // two-step flow can be restored by uncommenting these + the blocks below.
  // const [otpEmail, setOtpEmail] = useState<string | null>(null)
  // const [otpCode, setOtpCode] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      toast.error('Please enter email and password')
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Invalid email or password')
        setIsLoading(false)
        return
      }
      // OTP step disabled — the API no longer returns otpRequired.
      // if (data.otpRequired) {
      //   setOtpEmail(data.email)
      //   toast.success(`A 6-digit code has been sent to ${data.email}`)
      //   return
      // }
      login(data.user as AuthUser, data.token)
      toast.success(`Welcome back, ${data.user.name}!`)
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // OTP verification handler DISABLED (login is password-only now).
  // const handleVerifyOtp = async (e: React.FormEvent) => {
  //   e.preventDefault()
  //   if (!otpCode.trim()) {
  //     toast.error('Please enter the 6-digit code from your email')
  //     return
  //   }
  //   setIsLoading(true)
  //   try {
  //     const res = await fetch('/api/auth/verify-otp', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ email: otpEmail, code: otpCode.trim() }),
  //     })
  //     const data = await res.json()
  //     if (!res.ok) {
  //       toast.error(data.error || 'Verification failed')
  //       return
  //     }
  //     login(data.user as AuthUser, data.token)
  //     toast.success(`Welcome back, ${data.user.name}!`)
  //   } catch {
  //     toast.error('Network error. Please try again.')
  //   } finally {
  //     setIsLoading(false)
  //   }
  // }

  const handleGoogleSignIn = () => {
    toast.info('Google sign-in is not configured. Please use email and password.')
  }

  return (
    <div className="min-h-screen flex login-page-fade">
      {/* ═══════════════════════════════════════════════════════════════
          LEFT SIDE (60%) — Premium branding + 3D illustration
         ═══════════════════════════════════════════════════════════════ */}
      <div
        className="hidden md:flex md:w-[50%] lg:w-[60%] relative overflow-hidden flex-col items-center justify-between p-10 xl:p-16"
        style={{
          background: 'linear-gradient(160deg, #0F7A87 0%, #0B5A64 50%, #073E45 100%)',
        }}
      >
        {/* ── Aurora animated background ── */}
        <div className="login-aurora">
          <div className="login-aurora-blob login-aurora-blob-1" />
          <div className="login-aurora-blob login-aurora-blob-2" />
          <div className="login-aurora-blob login-aurora-blob-3" />
          <div className="login-aurora-blob login-aurora-blob-4" />
        </div>

        {/* ── Light rays ── */}
        <div className="login-light-ray login-light-ray-1" />
        <div className="login-light-ray login-light-ray-2" />
        <div className="login-light-ray login-light-ray-3" />

        {/* ── Glowing sparkles ── */}
        <div className="login-sparkle login-sparkle-1" />
        <div className="login-sparkle login-sparkle-2" />
        <div className="login-sparkle login-sparkle-3" />
        <div className="login-sparkle login-sparkle-4" />
        <div className="login-sparkle login-sparkle-5" />
        <div className="login-sparkle login-sparkle-6" />

        {/* ── Floating puzzle pieces ── */}
        <div className="absolute top-[12%] left-[8%] login-puzzle-float-1 opacity-20 z-10">
          <svg width="40" height="40" viewBox="0 0 40 40"><path d="M8 8 h10 a4 4 0 1 1 8 0 h6 v6 a4 4 0 1 0 0 8 v6 h-6 a4 4 0 1 1 -8 0 h-10 v-6 a4 4 0 1 0 0 -8 z" fill="rgba(255,255,255,0.6)" /></svg>
        </div>
        <div className="absolute top-[20%] right-[10%] login-puzzle-float-2 opacity-15 z-10">
          <svg width="32" height="32" viewBox="0 0 40 40"><path d="M8 8 h10 a4 4 0 1 1 8 0 h6 v6 a4 4 0 1 0 0 8 v6 h-6 a4 4 0 1 1 -8 0 h-10 v-6 a4 4 0 1 0 0 -8 z" fill="rgba(165,243,252,0.5)" /></svg>
        </div>
        <div className="absolute bottom-[20%] left-[12%] login-puzzle-float-3 opacity-15 z-10">
          <svg width="28" height="28" viewBox="0 0 40 40"><path d="M8 8 h10 a4 4 0 1 1 8 0 h6 v6 a4 4 0 1 0 0 8 v6 h-6 a4 4 0 1 1 -8 0 h-10 v-6 a4 4 0 1 0 0 -8 z" fill="rgba(255,128,171,0.4)" /></svg>
        </div>

        {/* ── Top: Logo ── */}
        <div className="relative z-20 flex flex-col items-center login-slide-up login-slide-up-1">
          <div className="login-logo-float">
            <Image
              src="/logo.png"
              alt="Clinic logo"
              width={200}
              height={90}
              className="object-contain drop-shadow-2xl"
              priority
            />
          </div>
        </div>

        {/* ── Center: Clinic name + tagline + 3D illustration ── */}
        <div className="relative z-20 flex flex-col items-center text-center max-w-lg">
          {/* Clinic name */}
          <div className="login-slide-up login-slide-up-2 mb-2">
            <h1 className="text-[36px] font-bold text-white leading-tight" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.2)' }}>
              Welcome Back
            </h1>
            <p className="text-lg font-semibold text-cyan-200 uppercase tracking-wider mt-1" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.15)' }}>
              Child Development Center
            </p>
          </div>

          {/* Pink line with heart divider */}
          <div className="login-slide-up login-slide-up-3 flex items-center gap-3 my-4">
            <div className="h-px w-16 bg-pink-300/60" />
            <span className="text-pink-300 text-sm">♥</span>
            <div className="h-px w-16 bg-pink-300/60" />
          </div>

          {/* Tagline */}
          <p className="login-slide-up login-slide-up-3 text-base text-blue-100 max-w-sm mb-8 leading-relaxed">
            Helping Every Child Reach Their Full Potential
          </p>

          {/* 3D Illustration */}
          <div className="login-slide-up login-slide-up-4 login-glass-float">
            <Illustration3D />
          </div>
        </div>

        {/* ── Bottom: Glass stat bar ── */}
        <div className="login-slide-up login-slide-up-5 relative z-20 w-full max-w-2xl">
          <div
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4"
            style={{
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(16px)',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.25)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            }}
          >
            <StatBarItem icon={<span className="text-lg">😊</span>} value="1200+" label="Happy Children" />
            <StatBarItem icon={<span className="text-lg">👥</span>} value="15+" label="Expert Therapists" />
            <StatBarItem icon={<span className="text-lg">💝</span>} value="10+" label="Therapy Programs" />
            <StatBarItem icon={<span className="text-lg">⭐</span>} value="2016" label="Trusted Care" />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          RIGHT SIDE (40%) — Premium glassmorphism login card
         ═══════════════════════════════════════════════════════════════ */}
      <div
        className="flex-1 flex items-center justify-center p-5 sm:p-8 relative overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #F1F8F8 0%, #E9F4F5 100%)',
        }}
      >
        {/* Subtle aurora on right side too */}
        <div className="login-aurora">
          <div className="login-aurora-blob login-aurora-blob-1" style={{ opacity: 0.3 }} />
          <div className="login-aurora-blob login-aurora-blob-2" style={{ opacity: 0.25 }} />
        </div>

        {/* Mobile logo */}
        <div className="md:hidden absolute top-6 left-1/2 -translate-x-1/2">
          <Image
            src="/logo.png"
            alt="Clinic logo"
            width={160}
            height={70}
            className="object-contain"
            priority
          />
        </div>

        {/* Premium floating glass login card */}
        <div
          className="login-glass-float login-slide-up relative z-10 w-full max-w-[440px]"
          style={{
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(28px)',
            borderRadius: '32px',
            padding: '48px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.12), 0 8px 24px rgba(106,17,203,0.08), inset 0 1px 0 rgba(255,255,255,1)',
            border: '1px solid rgba(255,255,255,0.6)',
          }}
        >
          {/* Logo at top */}
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.png"
              alt="Clinic logo"
              width={200}
              height={90}
              className="object-contain"
              priority
            />
          </div>

          {/* Heading */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Welcome Back! 👋</h2>
            <p className="text-sm text-gray-500">Sign in to continue to your account</p>
          </div>

          {/* ── OTP verification step DISABLED — password-only login. Kept
              here (commented) so it can be restored later:

          {otpEmail ? (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm text-teal-800">
                We emailed a 6-digit code to <span className="font-semibold">{otpEmail}</span>. Enter it below to finish signing in.
              </div>
              <Input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoFocus
                placeholder="6-digit code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                className="login-premium-input h-[56px] text-center text-xl tracking-[0.5em] font-semibold border-gray-200"
                style={{ background: 'rgba(255,255,255,0.8)', borderRadius: '10px' }}
              />
              <Button
                type="submit"
                disabled={isLoading}
                className="login-premium-btn w-full h-[56px] text-[16px] font-bold text-white border-0"
                style={{ background: 'linear-gradient(to right, #0F7A87 0%, #0B5A64 100%)', borderRadius: '25px' }}
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Verify and Sign In'}
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-gray-500 hover:text-[#0F7A87]"
                onClick={() => { setOtpEmail(null); setOtpCode('') }}
              >
                Back to password
              </button>
            </form>
          ) : (
          */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email input */}
            <div className="login-slide-up login-slide-up-2 relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 z-10" />
              <Input
                id="email"
                type="email"
                placeholder="admin@creativemind.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="login-premium-input h-[56px] pl-12 pr-4 border-gray-200 text-[15px] text-gray-700 placeholder:text-gray-400 transition-all"
                style={{ background: 'rgba(255,255,255,0.8)', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}
                autoComplete="email"
              />
            </div>

            {/* Password input */}
            <div className="login-slide-up login-slide-up-3 relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 z-10" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-premium-input h-[56px] pl-12 pr-12 border-gray-200 text-[15px] text-gray-700 placeholder:text-gray-400 transition-all"
                style={{ background: 'rgba(255,255,255,0.8)', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#0F7A87] transition-colors z-10"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {/* Remember me + Forgot password */}
            <div className="login-slide-up login-slide-up-4 flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#0F7A87] focus:ring-[#0F7A87]/30 cursor-pointer"
                />
                <span className="text-gray-600">Remember Me</span>
              </label>
              <button
                type="button"
                onClick={() => toast.info('Please contact your administrator to reset your password.')}
                className="text-[#0B5A64] hover:underline font-medium"
              >
                Forgot Password?
              </button>
            </div>

            {/* Sign In button — gradient #00BCD4 → #0F7A87 */}
            <div className="login-slide-up login-slide-up-5">
              <Button
                type="submit"
                disabled={isLoading}
                className="login-premium-btn login-btn-ripple w-full h-[56px] text-[16px] font-bold text-white transition-all border-0"
                style={{
                  background: 'linear-gradient(to right, #0F7A87 0%, #0B5A64 100%)',
                  borderRadius: '25px',
                  boxShadow: '0 8px 20px rgba(65,105,225,0.3)',
                }}
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <>
                    <LogIn className="h-5 w-5 mr-2" />
                    Sign In
                  </>
                )}
              </Button>
            </div>

            {/* Divider */}
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 text-xs text-gray-400">OR</span>
              </div>
            </div>

            {/* Google button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="login-google-btn login-slide-up login-slide-up-6 w-full h-[56px] border border-gray-200 bg-white flex items-center justify-center gap-3 text-[15px] font-medium text-gray-600"
              style={{ borderRadius: '25px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
            >
              <GoogleIcon className="h-5 w-5" />
              Sign in with Google
            </button>
          </form>
          {/* )}  ← closes the disabled OTP ternary above */}

          {/* Shown only on phones/browsers where the app can be installed */}
          <InstallAppButton className="mt-5" />

          {/* Security text */}
          <div className="flex items-center justify-center gap-2 mt-6">
            <svg className="h-4 w-4 text-[#0F7A87]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="text-xs text-gray-500 italic">Your data is safe and secure with us</p>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 mt-4">
            © Child Development Center
          </p>
        </div>
      </div>
    </div>
  )
}

// ── 3D Illustration (pure CSS/SVG) ─────────────────────────────────────

function Illustration3D() {
  return (
    <div className="relative w-[340px] h-[220px] flex items-center justify-center">
      {/* Rainbow arc */}
      <svg className="absolute top-0 left-1/2 -translate-x-1/2 opacity-40" width="200" height="80" viewBox="0 0 200 80">
        <path d="M10 75 A85 85 0 0 1 190 75" fill="none" stroke="#FF6B6B" strokeWidth="5" strokeLinecap="round" />
        <path d="M22 75 A73 73 0 0 1 178 75" fill="none" stroke="#FFA94D" strokeWidth="5" strokeLinecap="round" />
        <path d="M34 75 A61 61 0 0 1 166 75" fill="none" stroke="#FFD93D" strokeWidth="5" strokeLinecap="round" />
        <path d="M46 75 A49 49 0 0 1 154 75" fill="none" stroke="#6BCB77" strokeWidth="5" strokeLinecap="round" />
        <path d="M58 75 A37 37 0 0 1 142 75" fill="none" stroke="#4D96FF" strokeWidth="5" strokeLinecap="round" />
      </svg>

      {/* Cloud left */}
      <svg className="absolute top-[5%] left-[2%] opacity-50 login-puzzle-float-3" width="70" height="35" viewBox="0 0 80 40">
        <ellipse cx="22" cy="26" rx="16" ry="12" fill="#fff" />
        <ellipse cx="40" cy="20" rx="18" ry="14" fill="#fff" />
        <ellipse cx="58" cy="26" rx="15" ry="11" fill="#fff" />
      </svg>

      {/* Hot air balloon */}
      <div className="absolute top-[8%] right-[8%] login-puzzle-float-1">
        <svg width="36" height="50" viewBox="0 0 40 60">
          <ellipse cx="20" cy="20" rx="16" ry="20" fill="#FF80AB" opacity="0.8" />
          <path d="M20 40 L16 46 L24 46 Z" fill="#FF80AB" opacity="0.8" />
          <path d="M20 46 L20 54" stroke="#94A3B8" strokeWidth="1" />
          <rect x="16" y="54" width="8" height="4" rx="1" fill="#94A3B8" />
        </svg>
      </div>

      {/* Building blocks tower (center) */}
      <div className="absolute bottom-[15%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
        <div className="w-16 h-10 rounded-lg shadow-xl login-puzzle-float-2" style={{ background: 'linear-gradient(135deg, #A78BFA 0%, #7C4DFF 100%)', boxShadow: '0 8px 16px rgba(124,77,255,0.35)' }} />
        <div className="w-14 h-10 rounded-lg shadow-xl login-puzzle-float-1" style={{ background: 'linear-gradient(135deg, #60A5FA 0%, #0F7A87 100%)', boxShadow: '0 8px 16px rgba(30,136,229,0.35)' }} />
        <div className="w-12 h-10 rounded-lg shadow-xl login-puzzle-float-3" style={{ background: 'linear-gradient(135deg, #4ADE80 0%, #43A047 100%)', boxShadow: '0 8px 16px rgba(67,160,71,0.35)' }} />
      </div>

      {/* Puzzle piece left */}
      <div className="absolute bottom-[20%] left-[5%] login-puzzle-float-2">
        <svg width="40" height="40" viewBox="0 0 40 40">
          <path d="M8 8 h10 a4 4 0 1 1 8 0 h6 v6 a4 4 0 1 0 0 8 v6 h-6 a4 4 0 1 1 -8 0 h-10 v-6 a4 4 0 1 0 0 -8 z" fill="rgba(167,139,250,0.6)" />
        </svg>
      </div>

      {/* Star right */}
      <div className="absolute bottom-[25%] right-[5%] login-puzzle-float-3">
        <svg width="28" height="28" viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" fill="#FFD93D" /></svg>
      </div>

      {/* Central glass circle emblem */}
      <div className="relative z-10 flex items-center justify-center mt-[-20px]">
        <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-2xl login-logo-float" style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(232,249,255,0.85) 100%)',
          boxShadow: '0 16px 40px rgba(0,0,0,0.2), inset 0 2px 0 rgba(255,255,255,1)',
          border: '2px solid rgba(255,255,255,0.9)',
        }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <defs>
              <linearGradient id="emblemGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#00BCD4" />
                <stop offset="100%" stopColor="#0F7A87" />
              </linearGradient>
            </defs>
            <path d="M12 2C8 2 6 4 6 7c0 1-1 2-1 3s1 2 1 3c0 3 2 5 6 5s6-2 6-5c0-1 1-2 1-3s-1-2-1-3c0-3-2-5-6-5z" fill="url(#emblemGrad)" />
            <path d="M12 18c-1-1-3-2-3-4 0-1 1-2 2-2s1 1 1 2 0-1 1-2 2 1 2 2c0 2-2 3-3 4z" fill="#FF80AB" />
          </svg>
        </div>
      </div>

      {/* Glowing stars */}
      <div className="absolute top-[30%] left-[15%] login-sparkle login-sparkle-4" style={{ position: 'absolute' }} />
      <div className="absolute top-[50%] right-[15%] login-sparkle login-sparkle-5" style={{ position: 'absolute' }} />
    </div>
  )
}

// ── Stat bar item ──────────────────────────────────────────────────────

function StatBarItem({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="login-glass-stat flex flex-col items-center text-center gap-0.5 px-2 py-1">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-base font-bold text-white">{value}</span>
      </div>
      <span className="text-[10px] text-blue-100/80 leading-tight">{label}</span>
    </div>
  )
}

// ── Google "G" icon ────────────────────────────────────────────────────

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}
