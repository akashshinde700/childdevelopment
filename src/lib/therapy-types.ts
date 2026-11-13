// Canonical therapy-type vocabulary. This is the de-facto source of truth for
// the free-text `therapyType` string stored on Package/PatientPackageTherapyType/
// Appointment/TherapySession — there is no FK constraint, so every place that
// offers a therapyType dropdown must draw from this same list to avoid drift.
// Used by PackagesPage (package/session therapy type) and by the Payroll
// Engine (per-therapist/org-default rate configuration, keyed by this same
// string, plus the "Assessment" sentinel for assessment-based earnings).
export const THERAPY_TYPES = [
  'Speech Therapy',
  'Occupational Therapy',
  'Behavioral Therapy',
  'Special Education',
  'ABA Therapy',
  'Physiotherapy',
  'Counseling',
  'Remedial Therapy',
]

// Sentinel serviceType used for Assessment-based earnings (assessments are a
// separate module/model from therapy sessions, not one of the types above).
export const ASSESSMENT_SERVICE_TYPE = 'Assessment'

// Full list of rate-configurable service types (therapy types + Assessment),
// for the Payroll Engine's rate tables (Employee Payment Information section,
// Settings → Payroll organization defaults).
export const PAYROLL_SERVICE_TYPES = [...THERAPY_TYPES, ASSESSMENT_SERVICE_TYPE]
