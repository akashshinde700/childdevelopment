import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { roleLabels, type UserRole } from '@/store/app-store'
import { PERMISSION_MODULES, emptyPermissions, slugifyRoleName, hasAtLeastOnePermission, normalizeToViewOnly, type RolePermission } from '@/lib/role-permissions'

const BUILT_IN_ROLES = Object.keys(roleLabels) as UserRole[]

// GET - List all assignable roles: the 9 built-in roles + admin-defined custom roles
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request)
    const organizationId = user.organizationId
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const customRoles = await db.role.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } })

    const roles = [
      ...BUILT_IN_ROLES.map((value) => ({ value, label: roleLabels[value], isSystem: true as const })),
      ...customRoles.map((r) => ({
        id: r.id,
        value: r.slug,
        label: r.name,
        description: r.description,
        permissions: r.permissions as unknown as RolePermission[],
        isSystem: false as const,
      })),
    ]

    return NextResponse.json({ roles, modules: PERMISSION_MODULES })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Role list error:', error)
    return NextResponse.json({ error: 'Failed to fetch roles' }, { status: 500 })
  }
}

// POST - Create a new custom role
export async function POST(request: NextRequest) {
  try {
    const currentUser = await requireSessionUser(request)
    const organizationId = currentUser.organizationId
    if (currentUser.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can create roles.' }, { status: 403 })
    }

    const body = await request.json()
    const name: string = (body.name || '').trim().replace(/\s+/g, ' ')
    const description: string | null = body.description ? String(body.description).trim() : null
    const permissions: RolePermission[] = normalizeToViewOnly(
      Array.isArray(body.permissions) ? body.permissions : emptyPermissions()
    )

    if (!name) {
      return NextResponse.json({ error: 'Role name is required' }, { status: 400 })
    }
    if (!hasAtLeastOnePermission(permissions)) {
      return NextResponse.json({ error: 'At least one permission must be selected' }, { status: 400 })
    }

    const nameLower = name.toLowerCase()
    const builtInClash = BUILT_IN_ROLES.some((value) => roleLabels[value].toLowerCase() === nameLower || value === nameLower)
    if (builtInClash) {
      return NextResponse.json({ error: 'A role with this name already exists' }, { status: 409 })
    }

    const existing = await db.role.findFirst({ where: { name: { equals: name }, organizationId } })
    if (existing && existing.name.toLowerCase() === nameLower) {
      return NextResponse.json({ error: 'A role with this name already exists' }, { status: 409 })
    }

    let slug = slugifyRoleName(name)
    const slugTaken = async (s: string) => BUILT_IN_ROLES.includes(s as UserRole) || !!(await db.role.findUnique({ where: { slug: s } }))
    if (await slugTaken(slug)) {
      let suffix = 2
      while (await slugTaken(`${slug}_${suffix}`)) suffix++
      slug = `${slug}_${suffix}`
    }

    const role = await db.role.create({
      data: {
        name,
        slug,
        description,
        permissions: permissions as unknown as object,
        organizationId,
      },
    })

    return NextResponse.json({ id: role.id, name: role.name, value: role.slug })
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Role create error:', error)
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 })
  }
}
