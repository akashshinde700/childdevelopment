import { db } from '@/lib/db'

async function seedUsers() {
  console.log('Seeding users for role-based login...')

  const users = [
    { email: 'admin@creativemind.com', password: 'admin123', name: 'Dr. Anita Sharma', role: 'super_admin', phone: '9876500000' },
    { email: 'reception@creativemind.com', password: 'admin123', name: 'Sanjay Verma', role: 'admin', phone: '9876500007' },
    { email: 'speech@creativemind.com', password: 'therapist123', name: 'Dr. Ravi Menon', role: 'therapist_speech', phone: '9876500002' },
    { email: 'ot@creativemind.com', password: 'therapist123', name: 'Priya Nair', role: 'therapist_ot', phone: '9876500003' },
    { email: 'behavioral@creativemind.com', password: 'therapist123', name: 'Rahul Sharma', role: 'therapist_behavioral', phone: '9876500005' },
    { email: 'remedial@creativemind.com', password: 'therapist123', name: 'Anjali Deshmukh', role: 'therapist_remedial', phone: '9876500004' },
    { email: 'psych@creativemind.com', password: 'psych123', name: 'Dr. Neha Gupta', role: 'psychologist', phone: '9876500006' },
    { email: 'parent@creativemind.com', password: 'parent123', name: 'Rajesh Sharma', role: 'parent', phone: '9876543210', patientId: (await db.patient.findFirst({ select: { id: true } }))?.id },
  ]

  for (const userData of users) {
    const user = await db.user.upsert({
      where: { email: userData.email },
      update: { name: userData.name, role: userData.role, phone: userData.phone },
      create: userData,
    })
    console.log(`  ✓ ${user.role}: ${user.name} (${user.email})`)
  }

  console.log('\n✅ All user accounts seeded successfully!')
  console.log('\nLogin Credentials:')
  console.log('  Super Admin:     admin@creativemind.com / admin123')
  console.log('  Admin:           reception@creativemind.com / admin123')
  console.log('  Speech Therapist: speech@creativemind.com / therapist123')
  console.log('  OT Therapist:    ot@creativemind.com / therapist123')
  console.log('  Behavioral Ther: behavioral@creativemind.com / therapist123')
  console.log('  Remedial Ther:   remedial@creativemind.com / therapist123')
  console.log('  Psychologist:    psych@creativemind.com / psych123')
  console.log('  Parent:          parent@creativemind.com / parent123')
}

seedUsers()
  .catch((e) => { console.error('Error:', e); process.exit(1) })
  .finally(() => process.exit(0))
