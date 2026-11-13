import { dbUnscoped } from './db'

// Typed access to the PlatformAdmin model. The narrow delegate interface
// below lets platform code compile even before `prisma generate` has been
// re-run after the PlatformAdmin model was added to schema.prisma — and
// keeps call sites typed once it has.
//
// PlatformAdmin lives OUTSIDE the tenant world: it is not in the tenant
// guard's model list (it has no organizationId), and all platform routes
// use dbUnscoped because their whole job is cross-organization management.

export interface PlatformAdminRecord {
  id: string
  email: string
  password: string
  name: string
  isActive: boolean
  lastLogin: Date | null
  createdAt: Date
  updatedAt: Date
}

interface PlatformAdminDelegate {
  findUnique(args: { where: { id?: string; email?: string } }): Promise<PlatformAdminRecord | null>
  findFirst(args?: { where?: Partial<Record<'id' | 'email', string>> }): Promise<PlatformAdminRecord | null>
  create(args: { data: { email: string; password: string; name: string } }): Promise<PlatformAdminRecord>
  update(args: { where: { id: string }; data: Partial<Pick<PlatformAdminRecord, 'password' | 'name' | 'isActive' | 'lastLogin'>> }): Promise<PlatformAdminRecord>
  deleteMany(args: { where: object }): Promise<{ count: number }>
  count(args?: object): Promise<number>
}

export const platformAdminDb = (dbUnscoped as unknown as { PlatformAdmin: PlatformAdminDelegate }).PlatformAdmin

// Platform routes manage every organization — dbUnscoped is the point.
export { dbUnscoped as platformDb } from './db'
