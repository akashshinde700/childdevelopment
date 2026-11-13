import Link from 'next/link'

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      <nav className="sticky top-0 z-40 border-b border-white/10 bg-teal-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1 shadow-md ring-1 ring-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo1.png" alt="AetherDev Solutions logo" className="h-full w-full object-contain" />
            </span>
            <span className="text-sm font-extrabold tracking-widest text-white">AETHERDEV <span className="font-normal text-teal-200">Blog</span></span>
          </Link>
          <div className="flex items-center gap-5 text-sm text-teal-100">
            <Link href="/#pricing" className="hover:text-white">Pricing</Link>
            <Link href="/login" className="rounded-full border border-white/40 px-4 py-1.5 font-semibold text-white transition-colors hover:bg-white hover:text-teal-800">Login</Link>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-3xl px-6 py-14">{children}</main>
      <footer className="border-t border-slate-100 bg-slate-50 py-8 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} AetherDev Solutions · <Link href="/" className="hover:underline">aetherdevsolutions.in</Link>
      </footer>
    </div>
  )
}
