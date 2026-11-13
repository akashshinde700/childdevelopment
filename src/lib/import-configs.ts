/**
 * import-configs.ts
 * -----------------
 * Single source of truth for all import field definitions.
 *
 * Admins can extend the alias lists here (or register entirely new modules)
 * WITHOUT touching the engine or the dialog component. The engine reads these
 * configs via `autoMapColumns` / `validateRows`, and the ImportDialog looks
 * up a module's config by its key.
 *
 * Each field should have 10-15 alias variations covering:
 *   - camelCase / snake_case / kebab-case / spaced variants
 *   - common abbreviations (dob, tel, hr, etc.)
 *   - multilingual hints (nom, ciudad, etc.) where relevant
 *   - common typos / alternative spellings
 *
 * Required fields are marked with `required: true` and an asterisk in `label`.
 */

import type { ModuleImportConfig } from './import-engine'

// ─────────────────────────────────────────────────────────────────────────────
// PATIENTS
// ─────────────────────────────────────────────────────────────────────────────

const patientsConfig: ModuleImportConfig = {
  module: 'patients',
  createEndpoint: '/api/patients',
  duplicateKeys: ['mobile'],
  fields: [
    {
      field: 'childName',
      label: 'Child Name *',
      required: true,
      type: 'text',
      aliases: [
        'child name', 'childname', 'child_name', 'patient name', 'patientname',
        'name', 'kid name', 'baby name', 'nom', 'child', 'student name',
        'beneficiary name', 'patient', 'childs name', 'kids name',
      ],
    },
    {
      field: 'mobile',
      label: 'Mobile *',
      required: true,
      type: 'mobile',
      aliases: [
        'mobile', 'phone', 'mobile number', 'mobile no', 'phone number',
        'contact', 'contact number', 'contact no', 'contact details',
        'cell', 'cell phone', 'handphone', 'telephone', 'tel', 'hp',
        'mobile no.', 'primary number', 'parent contact',
      ],
    },
    {
      field: 'dateOfBirth',
      label: 'Date of Birth *',
      required: true,
      type: 'date',
      aliases: [
        'date of birth', 'dob', 'date_of_birth', 'birthdate', 'birth date',
        'd.o.b', 'birthday', 'born on', 'dob ', ' date of birth', 'birth',
        'date birth', 'bday', 'date of birth ', 'child dob',
      ],
    },
    {
      field: 'gender',
      label: 'Gender',
      required: false,
      type: 'text',
      aliases: [
        'gender', 'sex', 'gender ', ' gende', 'male/female', 'm/f',
        'child gender', 'patient gender', 'sex ', 'gendar', 'gende',
        'genderidentity', 'gender identity', 'gen',
      ],
    },
    {
      field: 'parentName',
      label: 'Parent/Guardian Name',
      required: false,
      type: 'text',
      aliases: [
        'parent name', 'parentname', 'parent_name', 'parent/guardian name',
        'parent', 'guardian name', 'parent/guardian', 'father/mother name',
        'guardian', 'parents name', 'parent or guardian', 'caretaker name',
        'caregiver name', 'guardian ', 'father/mother',
      ],
    },
    {
      field: 'fatherName',
      label: 'Father Name',
      required: false,
      type: 'text',
      aliases: [
        'father name', 'fathername', 'father_name', 'father', 'fathers name',
        'dad name', 'dad', 'papa name', 'papa', 'father s name',
        'father full name', 'parent father', 'father guardian',
      ],
    },
    {
      field: 'motherName',
      label: 'Mother Name',
      required: false,
      type: 'text',
      aliases: [
        'mother name', 'mothername', 'mother_name', 'mother', 'mothers name',
        'mom name', 'mom', 'mama name', 'mama', 'mother s name',
        'mother full name', 'parent mother', 'mother guardian',
      ],
    },
    {
      field: 'email',
      label: 'Email',
      required: false,
      type: 'email',
      aliases: [
        'email', 'email id', 'email address', 'e-mail', 'e mail',
        'mail id', 'mail', 'emailid', 'email_id', 'patient email',
        'parent email', 'contact email', 'electronic mail', 'emailid ',
      ],
    },
    {
      field: 'address',
      label: 'Address',
      required: false,
      type: 'text',
      aliases: [
        'address', 'full address', 'residential address', 'addr', 'street address',
        'home address', 'house address', 'location', 'addr1', 'address1',
        'address line', 'address line 1', 'street', 'complete address',
      ],
    },
    {
      field: 'city',
      label: 'City',
      required: false,
      type: 'text',
      aliases: [
        'city', 'town', 'city name', 'cityname', 'city_name',
        'locality', 'municipality', 'urb', 'ciudad', 'ville',
        'district city', 'metro', 'region',
      ],
    },
    {
      field: 'state',
      label: 'State',
      required: false,
      type: 'text',
      aliases: [
        'state', 'province', 'state name', 'statename', 'state_name',
        'region', 'territory', 'estado', 'department', 'prefecture',
        'county', 'state province', 'federal state',
      ],
    },
    {
      field: 'pincode',
      label: 'Pincode',
      required: false,
      type: 'text',
      aliases: [
        'pincode', 'pin code', 'pin', 'zip', 'zip code', 'zipcode',
        'postal code', 'postalcode', 'postal', 'postcode', 'post code',
        'pin no', 'pin number', 'zip postal', 'area code',
      ],
    },
    {
      field: 'schoolName',
      label: 'School Name',
      required: false,
      type: 'text',
      aliases: [
        'school name', 'schoolname', 'school_name', 'school', 'school college',
        'institution', 'institute name', 'institution name', 'academy',
        'school name ', 'child school', 'student school', 'education center',
        'school ',
      ],
    },
    {
      field: 'class',
      label: 'Class',
      required: false,
      type: 'text',
      aliases: [
        'class', 'grade', 'standard', 'class grade', 'class name',
        'form', 'year', 'grade level', 'class level', 'std',
        'section', 'class section', 'academic year', 'class standard',
      ],
    },
    {
      field: 'referredBy',
      label: 'Referral Source',
      required: false,
      type: 'text',
      aliases: [
        'referred by', 'referredby', 'referred_by', 'referral', 'reference',
        'referral source', 'referralsource', 'referral_source', 'referrence',
        'refference', 'refferred by', 'reffrence', 'source of referral',
        'referred by doctor', 'referral by', 'reference by',
      ],
    },
    {
      field: 'diagnosis',
      label: 'Diagnosis',
      required: false,
      type: 'text',
      aliases: [
        'diagnosis', 'diagnosis report', 'condition', 'diagnosed condition',
        'medical condition', 'diagnosis details', 'diagnosisdescription',
        'diagnosis description', 'disorder', 'disorder name', 'ailment',
        'medical diagnosis', 'primary diagnosis', 'diagnosed with',
        'health condition',
      ],
    },
    {
      field: 'medicalHistory',
      label: 'Medical History',
      required: false,
      type: 'text',
      aliases: [
        'medical history', 'medicalhistory', 'medical_history', 'medical',
        'medical background', 'medical record', 'medical records',
        'health history', 'health record', 'past medical history',
        'medical info', 'medical information', 'patient history medical',
        'history medical', 'medical background info',
      ],
    },
    {
      field: 'birthHistory',
      label: 'Birth History',
      required: false,
      type: 'text',
      aliases: [
        'birth history', 'birthhistory', 'birth_history', 'birth',
        'birth details', 'birth record', 'delivery history',
        'perinatal history', 'natal history', 'delivery details',
        'birth type', 'delivery type', 'birth info', 'birth information',
        'labor history',
      ],
    },
    {
      field: 'alternateNumber',
      label: 'Alternate Number',
      required: false,
      type: 'mobile',
      aliases: [
        'alternate number', 'alternatenumber', 'alternate_number', 'alt number',
        'alternate mobile', 'alternate phone', 'secondary number',
        'secondary mobile', 'alt mobile', 'alt phone', 'backup number',
        'emergency number', 'emergency contact', 'other number', 'alt contact',
        'alt no',
      ],
    },
  ],
  // Default body builder for patients: trim strings, drop empty values,
  // coerce DOB to ISO date string for the API.
  buildBody: (row) => {
    const out: Record<string, unknown> = {}
    const str = (k: string) => {
      const v = String(row[k] ?? '').trim()
      return v || null
    }
    out.childName = String(row.childName ?? '').trim()
    out.mobile = String(row.mobile ?? '').trim()
    const dob = String(row.dateOfBirth ?? '').trim()
    out.dateOfBirth = dob
    out.gender = String(row.gender ?? '').trim() || 'Not Specified'
    out.parentName = str('parentName')
    out.fatherName = str('fatherName')
    out.motherName = str('motherName')
    out.email = str('email')
    out.address = str('address')
    out.city = str('city')
    out.state = str('state')
    out.pincode = str('pincode')
    out.schoolName = str('schoolName')
    out.class = str('class')
    out.referredBy = str('referredBy')
    out.diagnosis = str('diagnosis')
    out.medicalHistory = str('medicalHistory')
    out.birthHistory = str('birthHistory')
    out.alternateNumber = str('alternateNumber')
    return out
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEES
// ─────────────────────────────────────────────────────────────────────────────

const employeesConfig: ModuleImportConfig = {
  module: 'employees',
  createEndpoint: '/api/employees',
  duplicateKeys: ['email', 'mobile'],
  fields: [
    {
      field: 'name',
      label: 'Name *',
      required: true,
      type: 'text',
      aliases: [
        'name', 'employee name', 'employeename', 'employee_name', 'full name',
        'fullname', 'full_name', 'staff name', 'staffname', 'person name',
        'worker name', 'nom', 'employee', 'person',
      ],
    },
    {
      field: 'mobile',
      label: 'Mobile *',
      required: true,
      type: 'mobile',
      aliases: [
        'mobile', 'phone', 'mobile number', 'mobile no', 'phone number',
        'contact', 'contact number', 'contact no', 'contact details',
        'cell', 'cell phone', 'handphone', 'telephone', 'tel', 'hp',
        'mobile no.', 'personal number', 'employee mobile',
      ],
    },
    {
      field: 'email',
      label: 'Email',
      required: false,
      type: 'email',
      aliases: [
        'email', 'email id', 'email address', 'e-mail', 'e mail',
        'mail id', 'mail', 'emailid', 'email_id', 'employee email',
        'work email', 'official email', 'contact email', 'electronic mail',
        'emailid ',
      ],
    },
    {
      field: 'designation',
      label: 'Designation',
      required: false,
      type: 'text',
      aliases: [
        'designation', 'designacion', 'designationname', 'designation_name',
        'job title', 'jobtitle', 'job_title', 'title', 'position',
        'role title', 'post', 'rank', 'job position', 'employment title',
        'work title',
      ],
    },
    {
      field: 'department',
      label: 'Department',
      required: false,
      type: 'text',
      aliases: [
        'department', 'dept', 'department name', 'dept name', 'departmentname',
        'department_name', 'div', 'division', 'unit', 'team',
        'section', 'branch department', 'deptartment', 'department ',
        'work department',
      ],
    },
    {
      field: 'joinDate',
      label: 'Join Date',
      required: false,
      type: 'date',
      aliases: [
        'join date', 'joindate', 'join_date', 'joining date', 'date of joining',
        'date joined', 'joined on', 'start date', 'startdate', 'start_date',
        'date of join', 'joining', 'employment date', 'hire date', 'hired date',
      ],
    },
    {
      field: 'basicSalary',
      label: 'Basic Salary',
      required: false,
      type: 'number',
      aliases: [
        'basic salary', 'basicsalary', 'basic_salary', 'basic', 'salary',
        'base salary', 'basesalary', 'base_salary', 'basic pay',
        'monthly salary', 'monthly basic', 'pay', 'wage', 'basic wage',
        'salary basic',
      ],
    },
    {
      field: 'hra',
      label: 'HRA',
      required: false,
      type: 'number',
      aliases: [
        'hra', 'house rent allowance', 'house rent', 'rent allowance',
        'hra allowance', 'housing allowance', 'hra amount', 'hra ',
        'house rent allowance hra', 'accommodation allowance', 'rent',
        'hra component', 'allowance hra', 'hra pay',
      ],
    },
    {
      field: 'allowances',
      label: 'Allowances',
      required: false,
      type: 'number',
      aliases: [
        'allowances', 'allowance', 'allowance amount', 'other allowances',
        'additional allowances', 'special allowance', 'allowances total',
        'total allowances', 'extra allowances', 'allowences', 'allownce',
        'perks', 'benefits', 'supplementary allowances', 'misc allowances',
      ],
    },
  ],
  buildBody: (row) => {
    const out: Record<string, unknown> = {}
    const str = (k: string) => {
      const v = String(row[k] ?? '').trim()
      return v || null
    }
    const num = (k: string) => {
      const v = String(row[k] ?? '').trim()
      return v === '' ? null : Number(v)
    }
    out.name = String(row.name ?? '').trim()
    out.mobile = String(row.mobile ?? '').trim()
    out.email = str('email')
    out.designation = str('designation')
    out.department = str('department')
    out.joinDate = str('joinDate')
    out.basicSalary = num('basicSalary')
    out.hra = num('hra')
    out.allowances = num('allowances')
    return out
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// APPOINTMENTS
// ─────────────────────────────────────────────────────────────────────────────

const appointmentsConfig: ModuleImportConfig = {
  module: 'appointments',
  createEndpoint: '/api/appointments',
  duplicateKeys: ['patientId'],
  fields: [
    {
      field: 'patientId',
      label: 'Patient ID *',
      required: true,
      type: 'text',
      aliases: [
        'patient id', 'patientid', 'patient_id', 'patient', 'patient code',
        'patient no', 'patient number', 'patientno', 'patient_no',
        'pid', 'patient ref', 'patient reference', 'patient ref no',
        'patient identifier', 'child id', 'patient code id',
      ],
    },
    {
      field: 'date',
      label: 'Date *',
      required: true,
      type: 'date',
      aliases: [
        'date', 'appointment date', 'appointmentdate', 'appointment_date',
        'appt date', 'session date', 'sessiondate', 'session_date',
        'visit date', 'visitdate', 'visit_date', 'date of appointment',
        'scheduled date', 'appt date ', 'booking date',
      ],
    },
    {
      field: 'startTime',
      label: 'Start Time *',
      required: true,
      type: 'text',
      aliases: [
        'start time', 'starttime', 'start_time', 'from time', 'from',
        'time from', 'begin time', 'time begin', 'time start',
        'start', 'commence time', 'fromtime', 'from_time', 'start hour',
        'appt start', 'session start',
      ],
    },
    {
      field: 'endTime',
      label: 'End Time',
      required: false,
      type: 'text',
      aliases: [
        'end time', 'endtime', 'end_time', 'to time', 'to', 'time to',
        'finish time', 'time finish', 'time end', 'end', 'until time',
        'totime', 'to_time', 'end hour', 'appt end', 'session end',
      ],
    },
    {
      field: 'therapistId',
      label: 'Therapist',
      required: false,
      type: 'text',
      aliases: [
        'therapist', 'therapist id', 'therapistid', 'therapist_id',
        'therapist name', 'therapistname', 'therapist_name', 'counselor',
        'counselor id', 'counselorid', 'specialist', 'specialist id',
        'practitioner', 'consultant', 'therapist ref', 'therapy by',
        'conducted by',
      ],
    },
    {
      field: 'type',
      label: 'Type',
      required: false,
      type: 'text',
      aliases: [
        'type', 'appointment type', 'appointmenttype', 'appointment_type',
        'session type', 'sessiontype', 'session_type', 'appt type',
        'visit type', 'visittype', 'visit_type', 'category',
        'appointment category', 'kind', 'classification',
      ],
    },
    {
      field: 'notes',
      label: 'Notes',
      required: false,
      type: 'text',
      aliases: [
        'notes', 'note', 'remarks', 'remark', 'comments', 'comment',
        'description', 'details', 'additional notes', 'extra notes',
        'notes ', 'session notes', 'appointment notes', 'general notes',
        'instructions',
      ],
    },
  ],
  buildBody: (row) => {
    const out: Record<string, unknown> = {}
    const str = (k: string) => {
      const v = String(row[k] ?? '').trim()
      return v || null
    }
    out.patientId = String(row.patientId ?? '').trim()
    out.date = String(row.date ?? '').trim()
    out.startTime = String(row.startTime ?? '').trim()
    out.endTime = str('endTime')
    out.therapistId = str('therapistId')
    out.type = str('type')
    out.notes = str('notes')
    return out
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// PACKAGES
// ─────────────────────────────────────────────────────────────────────────────

const packagesConfig: ModuleImportConfig = {
  module: 'packages',
  createEndpoint: '/api/packages',
  duplicateKeys: ['name'],
  fields: [
    {
      field: 'name',
      label: 'Name *',
      required: true,
      type: 'text',
      aliases: [
        'name', 'package name', 'packagename', 'package_name', 'plan name',
        'planname', 'plan_name', 'package title', 'title', 'plan',
        'package', 'package title name', 'scheme name', 'program name',
        'programme name',
      ],
    },
    {
      field: 'therapyType',
      label: 'Therapy Type *',
      required: true,
      type: 'text',
      aliases: [
        'therapy type', 'therapytype', 'therapy_type', 'therapy',
        'type of therapy', 'therapy category', 'treatment type',
        'treatmenttype', 'treatment_type', 'service type', 'servicetype',
        'service_type', 'modality', 'therapy name', 'discipline',
      ],
    },
    {
      field: 'sessionCount',
      label: 'Session Count *',
      required: true,
      type: 'number',
      aliases: [
        'session count', 'sessioncount', 'session_count', 'sessions',
        'no of sessions', 'number of sessions', 'session numbers',
        'total sessions', 'sessions count', 'sessionscount', 'sessions_count',
        'session quantity', 'session qty', 'count', 'session total',
        'num sessions',
      ],
    },
    {
      field: 'sessionDuration',
      label: 'Session Duration *',
      required: true,
      type: 'number',
      aliases: [
        'session duration', 'sessionduration', 'session_duration',
        'duration', 'duration per session', 'durationpersession',
        'duration_per_session', 'session length', 'sessionlength',
        'session_length', 'length', 'time per session', 'session time',
        'mins per session', 'minutes per session', 'duration mins',
      ],
    },
    {
      field: 'amount',
      label: 'Amount *',
      required: true,
      type: 'number',
      aliases: [
        'amount', 'price', 'cost', 'fee', 'fees', 'package amount',
        'packageamount', 'package_amount', 'total amount', 'totalamount',
        'total_amount', 'package price', 'packageprice', 'package_price',
        'charge', 'charges',
      ],
    },
    {
      field: 'discount',
      label: 'Discount',
      required: false,
      type: 'number',
      aliases: [
        'discount', 'discount amount', 'discountamount', 'discount_amount',
        'discount percent', 'discountpercent', 'discount_percent',
        'discount percentage', 'discountpercentage', 'discount_percentage',
        'reduction', 'markdown', 'off', 'discount value', 'concession',
        'rebate',
      ],
    },
    {
      field: 'validityDays',
      label: 'Validity (Days)',
      required: false,
      type: 'number',
      aliases: [
        'validity days', 'validitydays', 'validity_days', 'validity',
        'valid days', 'validdays', 'valid_days', 'days valid',
        'expiry days', 'expirydays', 'expiry_days', 'duration days',
        'durationdays', 'duration_days', 'validity period', 'valid for days',
      ],
    },
  ],
  buildBody: (row) => {
    const out: Record<string, unknown> = {}
    const str = (k: string) => {
      const v = String(row[k] ?? '').trim()
      return v || null
    }
    const num = (k: string) => {
      const v = String(row[k] ?? '').trim()
      return v === '' ? null : Number(v)
    }
    out.name = String(row.name ?? '').trim()
    out.therapyType = String(row.therapyType ?? '').trim()
    out.sessionCount = num('sessionCount')
    out.sessionDuration = num('sessionDuration')
    out.amount = num('amount')
    out.discount = num('discount')
    out.validityDays = num('validityDays')
    return out
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS
// ─────────────────────────────────────────────────────────────────────────────

const paymentsConfig: ModuleImportConfig = {
  module: 'payments',
  createEndpoint: '/api/payments',
  duplicateKeys: ['patientId', 'referenceNo'],
  fields: [
    {
      field: 'patientId',
      label: 'Patient ID *',
      required: true,
      type: 'text',
      aliases: [
        'patient id', 'patientid', 'patient_id', 'patient', 'patient code',
        'patient no', 'patient number', 'patientno', 'patient_no',
        'pid', 'patient ref', 'patient reference', 'patient ref no',
        'patient identifier', 'child id', 'patient code id',
      ],
    },
    {
      field: 'amount',
      label: 'Amount *',
      required: true,
      type: 'number',
      aliases: [
        'amount', 'payment amount', 'paymentamount', 'payment_amount',
        'total amount', 'totalamount', 'total_amount', 'paid amount',
        'paidamount', 'paid_amount', 'sum', 'value', 'fee amount',
        'feeamount', 'fee_amount', 'charge amount', 'charges', 'payment value',
      ],
    },
    {
      field: 'paymentMode',
      label: 'Payment Mode',
      required: false,
      type: 'text',
      aliases: [
        'payment mode', 'paymentmode', 'payment_mode', 'mode',
        'mode of payment', 'modeofpayment', 'mode_of_payment', 'method',
        'payment method', 'paymentmethod', 'payment_method', 'pay mode',
        'paymode', 'pay_mode', 'payment via', 'payment type mode', 'instrument',
      ],
    },
    {
      field: 'date',
      label: 'Date',
      required: false,
      type: 'date',
      aliases: [
        'date', 'payment date', 'paymentdate', 'payment_date', 'paid date',
        'paiddate', 'paid_date', 'transaction date', 'transactiondate',
        'transaction_date', 'date of payment', 'receipt date', 'receiptdate',
        'receipt_date', 'date paid', 'payment received on',
      ],
    },
    {
      field: 'type',
      label: 'Type',
      required: false,
      type: 'text',
      aliases: [
        'type', 'payment type', 'paymenttype', 'payment_type', 'kind',
        'payment kind', 'paymentkind', 'payment_kind', 'category',
        'payment category', 'paymentcategory', 'payment_category',
        'classification', 'fee type', 'feetype', 'fee_type', 'nature',
      ],
    },
    {
      field: 'referenceNo',
      label: 'Reference No',
      required: false,
      type: 'text',
      aliases: [
        'reference no', 'referenceno', 'reference_no', 'reference number',
        'referencenumber', 'reference_number', 'ref no', 'refno', 'ref_no',
        'reference', 'ref number', 'refnumber', 'ref_number', 'txn id',
        'transaction id', 'transactionid', 'transaction_id', 'receipt no',
        'receiptno',
      ],
    },
    {
      field: 'notes',
      label: 'Notes',
      required: false,
      type: 'text',
      aliases: [
        'notes', 'note', 'remarks', 'remark', 'comments', 'comment',
        'description', 'details', 'additional notes', 'extra notes',
        'notes ', 'payment notes', 'transaction notes', 'general notes',
        'instructions', 'memo',
      ],
    },
  ],
  buildBody: (row) => {
    const out: Record<string, unknown> = {}
    const str = (k: string) => {
      const v = String(row[k] ?? '').trim()
      return v || null
    }
    const num = (k: string) => {
      const v = String(row[k] ?? '').trim()
      return v === '' ? null : Number(v)
    }
    out.patientId = String(row.patientId ?? '').trim()
    out.amount = num('amount')
    out.paymentMode = str('paymentMode')
    out.date = str('date')
    out.type = str('type')
    out.referenceNo = str('referenceNo')
    out.notes = str('notes')
    return out
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// THERAPISTS
// ─────────────────────────────────────────────────────────────────────────────

const therapistsConfig: ModuleImportConfig = {
  module: 'therapists',
  createEndpoint: '/api/therapists',
  duplicateKeys: ['email'],
  fields: [
    {
      field: 'name',
      label: 'Name *',
      required: true,
      type: 'text',
      aliases: [
        'name', 'therapist name', 'therapistname', 'therapist_name',
        'full name', 'fullname', 'full_name', 'staff name', 'staffname',
        'practitioner name', 'practitionername', 'specialist name',
        'counselor name', 'counselorname', 'nom', 'therapist',
      ],
    },
    {
      field: 'email',
      label: 'Email *',
      required: true,
      type: 'email',
      aliases: [
        'email', 'email id', 'email address', 'e-mail', 'e mail',
        'mail id', 'mail', 'emailid', 'email_id', 'therapist email',
        'work email', 'official email', 'contact email', 'electronic mail',
        'emailid ', 'primary email',
      ],
    },
    {
      field: 'role',
      label: 'Role *',
      required: true,
      type: 'text',
      aliases: [
        'role', 'role name', 'rolename', 'role_name', 'job role',
        'jobrole', 'job_role', 'position', 'designation', 'specialization',
        'speciality', 'discipline', 'profession', 'capacity', 'function',
        'therapist role', 'therapistrole', 'therapist_role',
      ],
    },
    {
      field: 'mobile',
      label: 'Mobile',
      required: false,
      type: 'mobile',
      aliases: [
        'mobile', 'phone', 'mobile number', 'mobile no', 'phone number',
        'contact', 'contact number', 'contact no', 'contact details',
        'cell', 'cell phone', 'handphone', 'telephone', 'tel', 'hp',
        'mobile no.', 'personal number', 'therapist mobile',
      ],
    },
    {
      field: 'therapyType',
      label: 'Therapy Type',
      required: false,
      type: 'text',
      aliases: [
        'therapy type', 'therapytype', 'therapy_type', 'therapy',
        'type of therapy', 'therapy category', 'treatment type',
        'treatmenttype', 'treatment_type', 'service type', 'servicetype',
        'service_type', 'modality', 'therapy name', 'discipline',
        'specialization area',
      ],
    },
  ],
  buildBody: (row) => {
    const out: Record<string, unknown> = {}
    const str = (k: string) => {
      const v = String(row[k] ?? '').trim()
      return v || null
    }
    out.name = String(row.name ?? '').trim()
    out.email = String(row.email ?? '').trim()
    out.role = String(row.role ?? '').trim()
    out.mobile = str('mobile')
    out.therapyType = str('therapyType')
    return out
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADS
// ─────────────────────────────────────────────────────────────────────────────

const leadsConfig: ModuleImportConfig = {
  module: 'leads',
  createEndpoint: '/api/leads',
  duplicateKeys: ['mobile'],
  fields: [
    {
      field: 'name',
      label: 'Name *',
      required: true,
      type: 'text',
      aliases: [
        'name', 'lead name', 'leadname', 'lead_name', 'full name',
        'fullname', 'full_name', 'parent name', 'parentname', 'contact name',
        'nom', 'lead', 'enquirer name', 'client name',
      ],
    },
    {
      field: 'mobile',
      label: 'Mobile *',
      required: true,
      type: 'mobile',
      aliases: [
        'mobile', 'phone', 'mobile number', 'mobile no', 'phone number',
        'contact', 'contact number', 'contact no', 'contact details',
        'cell', 'cell phone', 'handphone', 'telephone', 'tel', 'hp',
        'mobile no.', 'whatsapp', 'whatsapp number',
      ],
    },
    {
      field: 'email',
      label: 'Email',
      required: false,
      type: 'email',
      aliases: [
        'email', 'email id', 'email address', 'e-mail', 'e mail',
        'mail id', 'mail', 'emailid', 'email_id', 'parent email',
        'contact email', 'electronic mail',
      ],
    },
    {
      field: 'childName',
      label: 'Child Name',
      required: false,
      type: 'text',
      aliases: [
        'child name', 'childname', 'child_name', 'kid name', 'patient name',
        'student name', 'ward name', 'baby name',
      ],
    },
    {
      field: 'childAge',
      label: 'Child Age',
      required: false,
      type: 'text',
      aliases: [
        'child age', 'childage', 'child_age', 'age', 'kid age', 'age of child',
      ],
    },
    {
      field: 'concern',
      label: 'Concern',
      required: false,
      type: 'text',
      aliases: [
        'concern', 'concerns', 'issue', 'problem', 'primary concern',
        'reason', 'complaint', 'symptoms', 'query',
      ],
    },
    {
      field: 'source',
      label: 'Source',
      required: false,
      type: 'text',
      aliases: [
        'source', 'lead source', 'leadsource', 'lead_source', 'referral source',
        'referred by', 'referredby', 'how did you hear', 'channel', 'origin',
      ],
    },
    {
      field: 'notes',
      label: 'Notes',
      required: false,
      type: 'text',
      aliases: ['notes', 'note', 'remarks', 'comment', 'comments', 'additional notes'],
    },
  ],
  buildBody: (row) => {
    const out: Record<string, unknown> = {}
    const str = (k: string) => {
      const v = String(row[k] ?? '').trim()
      return v || null
    }
    out.name = String(row.name ?? '').trim()
    out.mobile = String(row.mobile ?? '').trim()
    out.email = str('email')
    out.childName = str('childName')
    out.childAge = str('childAge')
    out.concern = str('concern')
    out.source = str('source')
    out.notes = str('notes')
    return out
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────────────────────────────────────

const expensesConfig: ModuleImportConfig = {
  module: 'expenses',
  createEndpoint: '/api/expenses',
  duplicateKeys: ['vendor'],
  fields: [
    {
      field: 'category',
      label: 'Category *',
      required: true,
      type: 'text',
      aliases: [
        'category', 'expense category', 'expensecategory', 'expense_category',
        'type', 'expense type', 'head', 'expense head',
      ],
    },
    {
      field: 'amount',
      label: 'Amount *',
      required: true,
      type: 'number',
      aliases: [
        'amount', 'expense amount', 'cost', 'value', 'price', 'total',
        'expense', 'sum',
      ],
    },
    {
      field: 'date',
      label: 'Date',
      required: false,
      type: 'date',
      aliases: ['date', 'expense date', 'expensedate', 'expense_date', 'transaction date'],
    },
    {
      field: 'vendor',
      label: 'Vendor',
      required: false,
      type: 'text',
      aliases: ['vendor', 'payee', 'paid to', 'supplier', 'merchant', 'vendor name'],
    },
    {
      field: 'description',
      label: 'Description',
      required: false,
      type: 'text',
      aliases: ['description', 'notes', 'remarks', 'details', 'comment', 'comments'],
    },
    {
      field: 'gst',
      label: 'GST',
      required: false,
      type: 'number',
      aliases: ['gst', 'tax', 'gst amount', 'gst_amount'],
    },
    {
      field: 'paymentMode',
      label: 'Payment Mode',
      required: false,
      type: 'text',
      aliases: ['payment mode', 'paymentmode', 'payment_mode', 'mode', 'payment method', 'paid via'],
    },
  ],
  buildBody: (row) => {
    const out: Record<string, unknown> = {}
    const str = (k: string) => {
      const v = String(row[k] ?? '').trim()
      return v || null
    }
    const num = (k: string) => {
      const v = String(row[k] ?? '').trim()
      return v === '' ? 0 : Number(v)
    }
    out.category = String(row.category ?? '').trim()
    const amount = num('amount')
    const gst = num('gst')
    out.amount = amount
    out.gst = gst
    out.totalAmount = amount + gst
    out.date = str('date') || new Date().toISOString()
    out.vendor = str('vendor')
    out.description = str('description')
    out.paymentMode = str('paymentMode') || 'cash'
    return out
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The single source of truth for all import field definitions.
 *
 * To add a new importable module:
 *   1. Define a `ModuleImportConfig` above.
 *   2. Add it to this record.
 *   3. Pass `module="<key>"` to the `<ImportDialog />` component.
 *
 * To extend an existing module's aliases, just add strings to the relevant
 * `aliases` array — no other code changes required.
 */
export const IMPORT_CONFIGS: Record<string, ModuleImportConfig> = {
  patients: patientsConfig,
  employees: employeesConfig,
  appointments: appointmentsConfig,
  packages: packagesConfig,
  payments: paymentsConfig,
  therapists: therapistsConfig,
  leads: leadsConfig,
  expenses: expensesConfig,
}
