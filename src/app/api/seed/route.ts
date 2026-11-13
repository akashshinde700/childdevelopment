import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSessionUser } from '@/lib/session'
import { hashPassword } from '@/lib/password'

// POST - Seed branches and users
// Restricted to an authenticated Super Admin — this endpoint upserts known
// accounts back to a hardcoded default password, so it must never be
// reachable by anyone who merely knows (or leaks) a static secret string.
export async function POST(request: NextRequest) {
  try {
    let user
    try {
      user = await requireSessionUser(request)
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden — Super Admin only' }, { status: 403 })
    }

    const organizationId = user.organizationId
    const defaultPassword = await hashPassword('admin123')

    // Create branches
    const branch1 = await db.branch.upsert({
      where: { code: 'BR1' },
      update: {},
      create: {
        organizationId,
        name: 'Main Center',
        code: 'BR1',
        address: '123 Health Avenue, Koramangala',
        phone: '+91 80 1234 5678',
        email: 'main@creativemind.com',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560034',
      },
    })

    const branch2 = await db.branch.upsert({
      where: { code: 'BR2' },
      update: {},
      create: {
        organizationId,
        name: 'East Branch',
        code: 'BR2',
        address: '456 Wellness Road, Indiranagar',
        phone: '+91 80 8765 4321',
        email: 'east@creativemind.com',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560038',
      },
    })

    // Super Admin (no branch)
    const superAdmin = await db.user.upsert({
      where: { email: 'admin@creativemind.com' },
      update: { name: 'Dr. Anita Sharma', role: 'super_admin', password: defaultPassword, branchId: null },
      create: {
        organizationId,
        email: 'admin@creativemind.com',
        password: defaultPassword,
        name: 'Dr. Anita Sharma',
        phone: '+91 98765 43210',
        role: 'super_admin',
      },
    })

    // Branch 1 Admin
    const admin1 = await db.user.upsert({
      where: { email: 'admin1@creativemind.com' },
      update: { name: 'Sanjay Verma', role: 'admin', password: defaultPassword, branchId: branch1.id },
      create: {
        organizationId,
        email: 'admin1@creativemind.com',
        password: defaultPassword,
        name: 'Sanjay Verma',
        phone: '+91 98765 43211',
        role: 'admin',
        branchId: branch1.id,
      },
    })

    // Branch 2 Admin
    const admin2 = await db.user.upsert({
      where: { email: 'admin2@creativemind.com' },
      update: { name: 'Priya Desai', role: 'admin', password: defaultPassword, branchId: branch2.id },
      create: {
        organizationId,
        email: 'admin2@creativemind.com',
        password: defaultPassword,
        name: 'Priya Desai',
        phone: '+91 98765 43212',
        role: 'admin',
        branchId: branch2.id,
      },
    })

    const br1Staff = [
      { email: 'reception1@creativemind.com', name: 'Meera Krishnan', role: 'receptionist', phone: '+91 98765 43213' },
      { email: 'speech1@creativemind.com', name: 'Dr. Ravi Menon', role: 'therapist_speech', phone: '+91 98765 43214', therapyType: 'Speech Therapy' },
      { email: 'ot1@creativemind.com', name: 'Anjali Nair', role: 'therapist_ot', phone: '+91 98765 43215', therapyType: 'Occupational Therapy' },
      { email: 'behavioral1@creativemind.com', name: 'Rahul Sharma', role: 'therapist_behavioral', phone: '+91 98765 43216', therapyType: 'Behavioral Therapy' },
      { email: 'remedial1@creativemind.com', name: 'Anjali Deshmukh', role: 'therapist_remedial', phone: '+91 98765 43217', therapyType: 'Remedial Therapy' },
      { email: 'psych1@creativemind.com', name: 'Dr. Neha Gupta', role: 'psychologist', phone: '+91 98765 43218' },
      { email: 'parent1@creativemind.com', name: 'Rajesh Sharma', role: 'parent', phone: '+91 98765 43219' },
    ]

    const br2Staff = [
      { email: 'reception2@creativemind.com', name: 'Kavitha Reddy', role: 'receptionist', phone: '+91 98765 43220' },
      { email: 'speech2@creativemind.com', name: 'Dr. Suresh Iyer', role: 'therapist_speech', phone: '+91 98765 43221', therapyType: 'Speech Therapy' },
      { email: 'ot2@creativemind.com', name: 'Divya Menon', role: 'therapist_ot', phone: '+91 98765 43222', therapyType: 'Occupational Therapy' },
      { email: 'behavioral2@creativemind.com', name: 'Vikram Patel', role: 'therapist_behavioral', phone: '+91 98765 43223', therapyType: 'Behavioral Therapy' },
      { email: 'remedial2@creativemind.com', name: 'Swati Kulkarni', role: 'therapist_remedial', phone: '+91 98765 43224', therapyType: 'Remedial Therapy' },
      { email: 'psych2@creativemind.com', name: 'Dr. Amit Joshi', role: 'psychologist', phone: '+91 98765 43225' },
      { email: 'parent2@creativemind.com', name: 'Sunil Kumar', role: 'parent', phone: '+91 98765 43226' },
    ]

    for (const staff of br1Staff) {
      await db.user.upsert({
        where: { email: staff.email },
        update: { name: staff.name, role: staff.role, branchId: branch1.id, therapyType: staff.therapyType || null },
        create: { ...staff, password: defaultPassword, branchId: branch1.id, organizationId },
      })
    }

    for (const staff of br2Staff) {
      await db.user.upsert({
        where: { email: staff.email },
        update: { name: staff.name, role: staff.role, branchId: branch2.id, therapyType: staff.therapyType || null },
        create: { ...staff, password: defaultPassword, branchId: branch2.id, organizationId },
      })
    }

    return NextResponse.json({
      success: true,
      branches: [branch1.name, branch2.name],
      users: {
        super_admin: superAdmin.email,
        branch1_admin: admin1.email,
        branch2_admin: admin2.email,
        branch1_staff_count: br1Staff.length,
        branch2_staff_count: br2Staff.length,
      },
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 })
  }
}
