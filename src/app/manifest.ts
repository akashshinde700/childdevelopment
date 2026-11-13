import type { MetadataRoute } from 'next'

// Web app manifest (served at /manifest.webmanifest) — makes the app
// installable from Chrome on Android ("Install app" / Add to Home screen) and
// opens it full-screen without the browser bar. /login sends an already
// signed-in user straight on to the app shell.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/login',
    name: 'AetherDev Solutions',
    short_name: 'AetherDev',
    description: 'Child therapy clinic management — patients, appointments, sessions, billing and the parent portal.',
    start_url: '/login?source=pwa',
    scope: '/',
    display: 'standalone',
    // No orientation lock: tablets (iPad, Android tabs) are mostly used in
    // landscape at the front desk.
    background_color: '#ffffff',
    theme_color: '#0F7A87',
    categories: ['medical', 'business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
