import { db } from '@/lib/db'

async function seed() {
  console.log('Seeding database...')

  // Create center settings
  await db.centerSettings.upsert({
    where: { id: 'cs-1' },
    update: {},
    create: {
      id: 'cs-1',
      centerName: 'Your Clinic Name',
      address: '123, MG Road, Sector 15, Noida, Uttar Pradesh - 201301',
      phone: '+91 98765 43210',
      email: 'info@creativemindcdc.com',
      gstNumber: '09AAACM1234A1Z5',
    },
  })

  // Create admin user
  await db.user.upsert({
    where: { email: 'admin@creativemind.com' },
    update: {},
    create: {
      email: 'admin@creativemind.com',
      password: 'admin123',
      name: 'Super Admin',
      role: 'super_admin',
      phone: '+91 98765 43210',
    },
  })

  // Create patients
  const patientsData = [
    { childName: 'Aarav Sharma', gender: 'Male', dateOfBirth: new Date('2019-05-15'), fatherName: 'Rajesh Sharma', motherName: 'Priya Sharma', parentName: 'Rajesh Sharma', mobile: '9876543210', email: 'rajesh@email.com', address: '45, Sector 18, Noida', city: 'Noida', state: 'Uttar Pradesh', pincode: '201301', schoolName: 'Delhi Public School', class: 'UKG', referredBy: 'Doctor', diagnosis: 'Autism Spectrum Disorder (ASD)', medicalHistory: 'No significant medical history', birthHistory: 'Full term, normal delivery' },
    { childName: 'Ananya Patel', gender: 'Female', dateOfBirth: new Date('2020-03-22'), fatherName: 'Vikram Patel', motherName: 'Neha Patel', parentName: 'Vikram Patel', mobile: '9876543211', email: 'vikram@email.com', address: '78, Sector 22, Noida', city: 'Noida', state: 'Uttar Pradesh', pincode: '201302', schoolName: 'Amity International', class: 'Nursery', referredBy: 'School', diagnosis: 'Speech Delay', medicalHistory: 'Ear infections as infant', birthHistory: 'Pre-term, 35 weeks' },
    { childName: 'Arjun Kumar', gender: 'Male', dateOfBirth: new Date('2018-11-08'), fatherName: 'Suresh Kumar', motherName: 'Kavita Kumar', parentName: 'Suresh Kumar', mobile: '9876543212', email: 'suresh@email.com', address: '12, Sector 5, Noida', city: 'Noida', state: 'Uttar Pradesh', pincode: '201301', schoolName: 'Ryan International', class: 'Class 1', referredBy: 'Parent Reference', diagnosis: 'ADHD - Combined Type', medicalHistory: 'Allergic to penicillin', birthHistory: 'C-section delivery' },
    { childName: 'Diya Singh', gender: 'Female', dateOfBirth: new Date('2021-01-30'), fatherName: 'Manish Singh', motherName: 'Ritu Singh', parentName: 'Manish Singh', mobile: '9876543213', address: '56, Sector 31, Noida', city: 'Noida', state: 'Uttar Pradesh', pincode: '201303', schoolName: 'Mother\'s Pride', class: 'Playgroup', referredBy: 'Social Media', diagnosis: 'Global Developmental Delay', medicalHistory: 'Hearing screening normal', birthHistory: 'Full term, vaginal delivery' },
    { childName: 'Vivaan Gupta', gender: 'Male', dateOfBirth: new Date('2019-09-12'), fatherName: 'Amit Gupta', motherName: 'Sunita Gupta', parentName: 'Amit Gupta', mobile: '9876543214', email: 'amit@email.com', address: '89, Sector 62, Noida', city: 'Noida', state: 'Uttar Pradesh', pincode: '201309', schoolName: 'Kothari International', class: 'LKG', referredBy: 'Doctor', diagnosis: 'Learning Disability', medicalHistory: 'Mild asthma', birthHistory: 'Full term, normal delivery' },
    { childName: 'Ishita Reddy', gender: 'Female', dateOfBirth: new Date('2020-07-25'), fatherName: 'Ramesh Reddy', motherName: 'Lakshmi Reddy', parentName: 'Ramesh Reddy', mobile: '9876543215', address: '34, Sector 44, Noida', city: 'Noida', state: 'Uttar Pradesh', pincode: '201303', schoolName: 'Pathways School', class: 'Pre-Nursery', referredBy: 'Doctor', diagnosis: 'Sensory Processing Disorder', medicalHistory: 'No significant history', birthHistory: 'Full term' },
    { childName: 'Kabir Mehta', gender: 'Male', dateOfBirth: new Date('2018-04-18'), fatherName: 'Dinesh Mehta', motherName: 'Pooja Mehta', parentName: 'Dinesh Mehta', mobile: '9876543216', email: 'dinesh@email.com', address: '67, Sector 27, Noida', city: 'Noida', state: 'Uttar Pradesh', pincode: '201301', schoolName: 'Shriram Millennium', class: 'Class 2', referredBy: 'School', diagnosis: 'Asperger Syndrome', medicalHistory: 'Sleep difficulties', birthHistory: 'C-section' },
    { childName: 'Riya Joshi', gender: 'Female', dateOfBirth: new Date('2021-06-05'), fatherName: 'Anil Joshi', motherName: 'Swati Joshi', parentName: 'Anil Joshi', mobile: '9876543217', address: '23, Sector 50, Noida', city: 'Noida', state: 'Uttar Pradesh', pincode: '201304', schoolName: 'Step by Step School', class: 'Nursery', referredBy: 'Parent Reference', diagnosis: 'Articulation Disorder', medicalHistory: 'Frequent colds', birthHistory: 'Full term' },
    { childName: 'Aditya Verma', gender: 'Male', dateOfBirth: new Date('2017-12-01'), fatherName: 'Prakash Verma', motherName: 'Suman Verma', parentName: 'Prakash Verma', mobile: '9876543218', email: 'prakash@email.com', address: '91, Sector 15, Noida', city: 'Noida', state: 'Uttar Pradesh', pincode: '201301', schoolName: 'Genesis Global School', class: 'Class 3', referredBy: 'Advertisement', diagnosis: 'Dyslexia', medicalHistory: 'Wears glasses', birthHistory: 'Full term' },
    { childName: 'Nisha Agarwal', gender: 'Female', dateOfBirth: new Date('2020-10-14'), fatherName: 'Rajat Agarwal', motherName: 'Meera Agarwal', parentName: 'Rajat Agarwal', mobile: '9876543219', address: '45, Sector 37, Noida', city: 'Noida', state: 'Uttar Pradesh', pincode: '201302', schoolName: 'The Shri Ram School', class: 'LKG', referredBy: 'Walk-in', diagnosis: 'Intellectual Disability - Mild', medicalHistory: 'Seizure disorder - controlled', birthHistory: 'Pre-term, 32 weeks' },
  ]

  const patients: Awaited<ReturnType<typeof db.patient.create>>[] = []
  for (let i = 0; i < patientsData.length; i++) {
    const p = patientsData[i]
    const patient = await db.patient.create({
      data: {
        patientId: `CM-${String(i + 1).padStart(4, '0')}`,
        ...p,
      },
    })
    patients.push(patient)
  }

  // Create package templates
  const packageTemplates = [
    { name: 'Speech Therapy Basic', therapyType: 'Speech Therapy', sessionCount: 12, sessionDuration: 30, amount: 12000, discount: 500, validityDays: 60 },
    { name: 'Speech Therapy Standard', therapyType: 'Speech Therapy', sessionCount: 24, sessionDuration: 45, amount: 21600, discount: 1200, validityDays: 90 },
    { name: 'Occupational Therapy Basic', therapyType: 'Occupational Therapy', sessionCount: 12, sessionDuration: 30, amount: 15000, discount: 750, validityDays: 60 },
    { name: 'Occupational Therapy Standard', therapyType: 'Occupational Therapy', sessionCount: 24, sessionDuration: 45, amount: 27000, discount: 1500, validityDays: 90 },
    { name: 'ABA Therapy Package', therapyType: 'ABA Therapy', sessionCount: 48, sessionDuration: 60, amount: 72000, discount: 3600, validityDays: 120 },
    { name: 'Special Education Basic', therapyType: 'Special Education', sessionCount: 12, sessionDuration: 45, amount: 10000, discount: 500, validityDays: 60 },
    { name: 'Behavioral Therapy', therapyType: 'Behavioral Therapy', sessionCount: 16, sessionDuration: 30, amount: 14000, discount: 700, validityDays: 75 },
    { name: 'Comprehensive Assessment', therapyType: 'Comprehensive', sessionCount: 4, sessionDuration: 60, amount: 8000, discount: 0, validityDays: 30 },
  ]

  const packages: Awaited<ReturnType<typeof db.package.create>>[] = []
  for (const pt of packageTemplates) {
    const pkg = await db.package.create({ data: pt })
    packages.push(pkg)
  }

  // Assign packages to patients
  const patientPackages: Awaited<ReturnType<typeof db.patientPackage.create>>[] = []
  for (let i = 0; i < 6; i++) {
    const pp = await db.patientPackage.create({
      data: {
        patientId: patients[i].id,
        packageId: packages[i % packages.length].id,
        sessionsPurchased: packages[i % packages.length].sessionCount,
        sessionsCompleted: Math.min(Math.floor(Math.random() * packages[i % packages.length].sessionCount), packages[i % packages.length].sessionCount),
        sessionsExpired: Math.floor(Math.random() * 2),
        totalAmount: packages[i % packages.length].amount,
        discountAmount: packages[i % packages.length].discount,
        netAmount: packages[i % packages.length].amount - packages[i % packages.length].discount,
        startDate: new Date('2025-01-15'),
        endDate: new Date('2025-07-15'),
        status: 'active',
      },
    })
    patientPackages.push(pp)
  }

  // Create employees
  const employeesData = [
    { name: 'Dr. Sneha Kapoor', designation: 'Developmental Pediatrician', department: 'Therapy', mobile: '9876500001', email: 'sneha@creativemind.com', joinDate: new Date('2022-03-01'), basicSalary: 80000, hra: 24000, allowances: 10000 },
    { name: 'Dr. Ravi Menon', designation: 'Speech Therapist', department: 'Therapy', mobile: '9876500002', email: 'ravi@creativemind.com', joinDate: new Date('2022-06-15'), basicSalary: 45000, hra: 13500, allowances: 5000 },
    { name: 'Priya Nair', designation: 'Occupational Therapist', department: 'Therapy', mobile: '9876500003', email: 'priya.n@creativemind.com', joinDate: new Date('2023-01-10'), basicSalary: 42000, hra: 12600, allowances: 5000 },
    { name: 'Anjali Deshmukh', designation: 'Special Educator', department: 'Therapy', mobile: '9876500004', email: 'anjali@creativemind.com', joinDate: new Date('2023-04-01'), basicSalary: 38000, hra: 11400, allowances: 4000 },
    { name: 'Rahul Sharma', designation: 'ABA Therapist', department: 'Therapy', mobile: '9876500005', email: 'rahul@creativemind.com', joinDate: new Date('2023-07-15'), basicSalary: 35000, hra: 10500, allowances: 4000 },
    { name: 'Neha Gupta', designation: 'Clinical Psychologist', department: 'Therapy', mobile: '9876500006', email: 'neha.g@creativemind.com', joinDate: new Date('2022-09-01'), basicSalary: 50000, hra: 15000, allowances: 6000 },
    { name: 'Sanjay Verma', designation: 'Receptionist', department: 'Admin', mobile: '9876500007', email: 'sanjay@creativemind.com', joinDate: new Date('2023-02-01'), basicSalary: 22000, hra: 6600, allowances: 2000 },
    { name: 'Meera Iyer', designation: 'HR Manager', department: 'HR', mobile: '9876500008', email: 'meera@creativemind.com', joinDate: new Date('2022-05-01'), basicSalary: 40000, hra: 12000, allowances: 5000 },
  ]

  const employees: Awaited<ReturnType<typeof db.employee.create>>[] = []
  for (let i = 0; i < employeesData.length; i++) {
    const emp = await db.employee.create({
      data: {
        employeeId: `EMP-${String(i + 1).padStart(4, '0')}`,
        ...employeesData[i],
      },
    })
    employees.push(emp)
  }

  // Create attendance for this month
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  
  for (const emp of employees) {
    for (let day = 1; day <= Math.min(today.getDate(), 28); day++) {
      const date = new Date(currentYear, currentMonth, day)
      const dow = date.getDay()
      if (dow === 0) continue // Skip Sundays
      
      const rand = Math.random()
      let status = 'present'
      if (rand > 0.95) status = 'absent'
      else if (rand > 0.9) status = 'leave'
      else if (rand > 0.85) status = 'half_day'
      
      await db.attendance.create({
        data: {
          employeeId: emp.id,
          date,
          status,
          checkIn: '09:00',
          checkOut: status === 'half_day' ? '13:00' : '18:00',
          workingHours: status === 'half_day' ? 4 : status === 'present' ? 9 : 0,
          overtime: Math.random() > 0.8 ? 1 : 0,
        },
      })
    }
  }

  // Create appointments for today and upcoming
  const therapists = ['Dr. Ravi Menon', 'Priya Nair', 'Anjali Deshmukh', 'Rahul Sharma', 'Dr. Sneha Kapoor', 'Neha Gupta']
  const todayStr = new Date()
  
  for (let d = 0; d < 7; d++) {
    const aptDate = new Date(todayStr)
    aptDate.setDate(aptDate.getDate() + d)
    
    const numApts = d === 0 ? 6 : 4
    for (let i = 0; i < numApts; i++) {
      const hour = 9 + i
      const statuses = d === 0 && i < 2 ? ['completed'] : ['scheduled', 'confirmed']
      await db.appointment.create({
        data: {
          patientId: patients[i % patients.length].id,
          therapistId: therapists[i % therapists.length],
          title: ['Speech Therapy', 'Occupational Therapy', 'ABA Therapy', 'Special Education', 'Doctor Consultation', 'Assessment'][i % 6],
          date: aptDate,
          startTime: `${String(hour).padStart(2, '0')}:00`,
          endTime: `${String(hour + 1).padStart(2, '0')}:00`,
          status: statuses[Math.floor(Math.random() * statuses.length)],
          type: ['consultation', 'therapy', 'assessment'][i % 3],
        },
      })
    }
  }

  // Create therapy sessions
  const soapNotes = [
    { subjective: 'Parent reports child responded well to visual cues during breakfast today.', objective: 'Child maintained eye contact for 3-4 seconds during structured tasks. Followed 2-step verbal commands with 80% accuracy.', assessment: 'Showing gradual improvement in receptive language skills. Social engagement increasing.', plan: 'Continue with current therapy plan. Introduce more complex commands next session. Home practice recommended.' },
    { subjective: 'Child was cooperative today. Mother reports improvement in handwriting at school.', objective: 'Completed pegboard activity within time. Pencil grip improved from 3-finger to tripod. Copied shapes with 70% accuracy.', assessment: 'Fine motor skills improving steadily. Visual-motor coordination developing well.', plan: 'Progress to letter formation exercises. Add cutting activities. Increase session duration by 5 minutes.' },
    { subjective: 'Child showed enthusiasm during play-based activities today.', objective: 'Engaged in parallel play for 15 minutes. Responded to name 4 out of 5 times. Used 2 new words spontaneously.', assessment: 'Social communication skills improving. Vocabulary expanding at good pace.', plan: 'Introduce group activities. Work on turn-taking skills. Add picture communication cards.' },
  ]

  for (let i = 0; i < 15; i++) {
    const sessionDate = new Date()
    sessionDate.setDate(sessionDate.getDate() - Math.floor(i / 2))
    
    await db.therapySession.create({
      data: {
        patientId: patients[i % patients.length].id,
        patientPackageId: patientPackages[i % patientPackages.length]?.id,
        therapistName: therapists[i % therapists.length],
        therapyType: ['Speech Therapy', 'Occupational Therapy', 'ABA Therapy', 'Special Education'][i % 4],
        date: sessionDate,
        startTime: `${String(9 + (i % 4)).padStart(2, '0')}:00`,
        endTime: `${String(10 + (i % 4)).padStart(2, '0')}:00`,
        status: 'completed',
        ...soapNotes[i % soapNotes.length],
      },
    })
  }

  // Create assessments
  const assessmentsData = [
    { type: 'doctor_consultation', status: 'completed', completedDate: new Date('2025-01-20'), therapistName: 'Dr. Sneha Kapoor', findings: 'Child presents with features consistent with Autism Spectrum Disorder. ADOS-2 positive.', recommendations: 'Recommended Speech Therapy, Occupational Therapy, and ABA Therapy. Follow-up in 3 months.' },
    { type: 'speech', status: 'completed', completedDate: new Date('2025-02-10'), therapistName: 'Dr. Ravi Menon', findings: 'Receptive language at 2-year level, expressive at 18-month level. Oral motor skills adequate.', recommendations: 'Speech Therapy twice weekly. Focus on vocabulary building and sentence formation.' },
    { type: 'occupational', status: 'completed', completedDate: new Date('2025-02-15'), therapistName: 'Priya Nair', findings: 'Fine motor skills delayed by 12 months. Sensory seeking behaviors noted in proprioceptive and vestibular domains.', recommendations: 'Occupational Therapy twice weekly. Sensory diet recommended at home.' },
    { type: 'autism', status: 'in_progress', therapistName: 'Neha Gupta', findings: '', recommendations: '' },
    { type: 'adhd', status: 'completed', completedDate: new Date('2025-03-01'), therapistName: 'Dr. Sneha Kapoor', findings: 'Conners rating scale significant for inattention and hyperactivity. No significant anxiety or depression.', recommendations: 'Behavioral therapy recommended. Parent training program. Medication evaluation if no improvement in 3 months.' },
    { type: 'iq', status: 'scheduled', therapistName: 'Neha Gupta', findings: '', recommendations: '' },
  ]

  for (const a of assessmentsData) {
    await db.assessment.create({
      data: {
        patientId: patients[Math.floor(Math.random() * patients.length)].id,
        scheduledDate: new Date('2025-06-01'),
        ...a,
      },
    })
  }

  // Create invoices and payments
  for (let i = 0; i < 6; i++) {
    const subtotal = packages[i % packages.length].amount
    const discount = packages[i % packages.length].discount
    const gstApplicable = i % 2 === 0
    
    const invoice = await db.invoice.create({
      data: {
        invoiceNo: `INV-${String(i + 1).padStart(4, '0')}`,
        patientId: patients[i].id,
        type: i % 3 === 0 ? 'invoice' : i % 3 === 1 ? 'receipt' : 'advance_receipt',
        subtotal,
        discount,
        gstApplicable,
        cgst: gstApplicable ? (subtotal - discount) * 0.09 : 0,
        sgst: gstApplicable ? (subtotal - discount) * 0.09 : 0,
        gstNumber: gstApplicable ? '09AAACM1234A1Z5' : null,
        totalAmount: subtotal - discount + (gstApplicable ? (subtotal - discount) * 0.18 : 0),
        amountPaid: i < 4 ? subtotal - discount : 0,
        balanceDue: i < 4 ? 0 : subtotal - discount,
        paymentMode: ['cash', 'upi', 'card', 'bank_transfer'][i % 4],
        status: i < 4 ? 'paid' : 'pending',
        invoiceItems: {
          create: {
            description: `${packages[i % packages.length].name} - ${packages[i % packages.length].sessionCount} Sessions`,
            quantity: 1,
            rate: subtotal,
            amount: subtotal,
          },
        },
      },
    })

    await db.payment.create({
      data: {
        paymentNo: `PAY-${String(i + 1).padStart(4, '0')}`,
        patientId: patients[i].id,
        invoiceId: invoice.id,
        amount: i < 4 ? subtotal - discount : subtotal * 0.3,
        paymentMode: ['cash', 'upi', 'card', 'bank_transfer'][i % 4],
        type: i < 4 ? 'payment' : 'advance',
        status: 'completed',
      },
    })
  }

  // Create expenses
  const expenseData = [
    { category: 'rent', vendor: 'Property Owner', description: 'Monthly office rent', amount: 50000, paymentMode: 'bank_transfer' },
    { category: 'electricity', vendor: 'UP Electricity Board', description: 'Electricity bill - June', amount: 8500, paymentMode: 'upi' },
    { category: 'internet', vendor: 'Jio Fiber', description: 'Internet bill - June', amount: 2500, paymentMode: 'upi' },
    { category: 'therapy_equipment', vendor: 'Special Needs Store', description: 'New sensory integration equipment', amount: 15000, paymentMode: 'card' },
    { category: 'stationery', vendor: 'Wholesale Stationery', description: 'Worksheets and art supplies', amount: 3500, paymentMode: 'cash' },
    { category: 'housekeeping', vendor: 'CleanPro Services', description: 'Monthly housekeeping', amount: 8000, paymentMode: 'cash' },
    { category: 'maintenance', vendor: 'FixIt Solutions', description: 'AC maintenance and repair', amount: 4500, paymentMode: 'cash' },
    { category: 'marketing', vendor: 'Google Ads', description: 'Digital marketing - June', amount: 12000, paymentMode: 'card' },
  ]

  for (const e of expenseData) {
    const gst = e.category === 'rent' || e.category === 'therapy_equipment' ? e.amount * 0.18 : 0
    await db.expense.create({
      data: {
        date: new Date(`2025-06-${String(Math.floor(Math.random() * 25) + 1).padStart(2, '0')}`),
        category: e.category,
        vendor: e.vendor,
        description: e.description,
        amount: e.amount,
        gst,
        totalAmount: e.amount + gst,
        paymentMode: e.paymentMode,
        status: 'approved',
      },
    })
  }

  // Create leaves
  await db.leave.create({
    data: {
      employeeId: employees[1].id,
      leaveType: 'casual',
      startDate: new Date('2025-06-20'),
      endDate: new Date('2025-06-21'),
      totalDays: 2,
      reason: 'Personal work',
      status: 'approved',
      approvedBy: 'Super Admin',
    },
  })

  await db.leave.create({
    data: {
      employeeId: employees[2].id,
      leaveType: 'sick',
      startDate: new Date('2025-06-18'),
      endDate: new Date('2025-06-18'),
      totalDays: 1,
      reason: 'Not feeling well',
      status: 'pending',
    },
  })

  await db.leave.create({
    data: {
      employeeId: employees[3].id,
      leaveType: 'earned',
      startDate: new Date('2025-07-01'),
      endDate: new Date('2025-07-05'),
      totalDays: 5,
      reason: 'Family vacation',
      status: 'pending',
    },
  })

  // Create payroll records for this month
  for (const emp of employees) {
    const pf = emp.basicSalary * 0.12
    const esi = emp.basicSalary > 21000 ? 0 : emp.basicSalary * 0.0075
    const profTax = emp.basicSalary > 25000 ? 200 : 0
    
    await db.payrollRecord.create({
      data: {
        employeeId: emp.id,
        month: 6,
        year: 2025,
        basicSalary: emp.basicSalary,
        hra: emp.hra,
        allowances: emp.allowances,
        incentives: Math.random() > 0.7 ? 2000 : 0,
        bonus: 0,
        totalEarnings: emp.basicSalary + emp.hra + emp.allowances,
        leaveDeduction: 0,
        pf,
        esi,
        professionalTax: profTax,
        advanceRecovery: 0,
        totalDeductions: pf + esi + profTax,
        netSalary: emp.basicSalary + emp.hra + emp.allowances - pf - esi - profTax,
        status: 'processed',
      },
    })
  }

  // Create leads
  await db.lead.createMany({
    data: [
      { name: 'Rahul Agarwal', mobile: '9988776655', childName: 'Vihaan', childAge: '3 years', concern: 'Not speaking yet', source: 'doctor', status: 'contacted' },
      { name: 'Pooja Sharma', mobile: '9988776656', childName: 'Aanya', childAge: '4 years', concern: 'Hyperactive behavior', source: 'social_media', status: 'new' },
      { name: 'Amit Bansal', mobile: '9988776657', childName: 'Arnav', childAge: '5 years', concern: 'Learning difficulties', source: 'school', status: 'interested' },
      { name: 'Swati Jain', mobile: '9988776658', childName: 'Kavya', childAge: '2 years', concern: 'Delayed milestones', source: 'parent_reference', status: 'registered' },
      { name: 'Deepak Singh', mobile: '9988776659', childName: 'Reyansh', childAge: '6 years', concern: 'Autism assessment needed', source: 'advertisement', status: 'new' },
    ],
  })

  // Create WhatsApp logs
  await db.whatsAppLog.createMany({
    data: [
      { patientId: patients[0].id, mobile: '9876543210', template: 'Appointment Reminder', message: 'Reminder: Your appointment is scheduled for tomorrow at 10:00 AM. Please be on time.', status: 'delivered' },
      { patientId: patients[1].id, mobile: '9876543211', template: 'Payment Reminder', message: 'Your payment of ₹11,500 is due. Please clear the balance at your earliest.', status: 'read' },
      { patientId: patients[2].id, mobile: '9876543212', template: 'Session Balance', message: 'You have 4 sessions remaining in your Speech Therapy package. Consider renewing.', status: 'delivered' },
      { patientId: patients[3].id, mobile: '9876543213', template: 'Assessment Report Ready', message: 'Your child\'s assessment report is ready. Please collect from the center.', status: 'sent' },
      { patientId: patients[4].id, mobile: '9876543214', template: 'Appointment Confirmation', message: 'Your appointment has been confirmed for June 25 at 2:00 PM.', status: 'delivered' },
    ],
  })

  console.log('✅ Database seeded successfully!')
  console.log(`Created ${patients.length} patients`)
  console.log(`Created ${packages.length} package templates`)
  console.log(`Created ${patientPackages.length} patient packages`)
  console.log(`Created ${employees.length} employees`)
  console.log(`Created 6 invoices and payments`)
  console.log(`Created 8 expenses`)
  console.log(`Created 5 leads`)
  console.log(`Created 5 WhatsApp logs`)
}

seed()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(() => process.exit(0))
