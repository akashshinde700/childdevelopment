import path from 'path'

// Generated PDFs published behind a share token live here. Under
// public/uploads so the deploy's runtime-data copy already preserves them,
// and the proxy already blocks /uploads/* from being served statically —
// the only way in is GET /api/d/[token].
export const SHARED_DIR = path.join(process.cwd(), 'public', 'uploads', 'shared')
