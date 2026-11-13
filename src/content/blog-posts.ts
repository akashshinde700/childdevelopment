// Blog content lives as plain data (no CMS, no MDX dependency) so it can be
// authored/edited directly in the repo and reviewed like any other change.
// Rendered by src/app/blog/page.tsx (index) and src/app/blog/[slug]/page.tsx
// (article). Each section renders to plain semantic HTML — no raw HTML is
// ever accepted here, so there's no XSS surface from this content.

export type BlogSection =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }

export interface BlogPost {
  slug: string
  title: string
  // 1-2 sentence meta description AND the direct-answer opener shown at the
  // top of the article — the format AI answer engines (Google AI Overview,
  // ChatGPT, Perplexity) tend to lift directly into their responses.
  description: string
  publishedAt: string // ISO date
  updatedAt: string // ISO date
  readingTime: string
  sections: BlogSection[]
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'manage-speech-therapy-clinic-without-whatsapp-excel',
    title: 'How to Manage a Speech Therapy Clinic Without WhatsApp and Excel',
    description: 'Most speech therapy and child development clinics in India run on WhatsApp groups, Excel sheets and paper registers. Here is what actually breaks as a clinic grows, and how a single practice-management platform fixes each one.',
    publishedAt: '2026-01-15',
    updatedAt: '2026-07-10',
    readingTime: '6 min read',
    sections: [
      { type: 'p', text: 'A speech therapy or child development clinic outgrows WhatsApp and Excel the moment it crosses roughly 50 active patients or adds a second therapist — appointment clashes, lost session notes and billing errors start costing more time than the tools save. The fix is a single system where patients, appointments, sessions, billing and staff records live in one place instead of scattered across a WhatsApp group, three Excel sheets and a paper register.' },
      { type: 'h2', text: 'Where WhatsApp and Excel actually break down' },
      { type: 'p', text: 'These tools work fine for a one-person practice. Past that, four specific failure points show up in almost every clinic we talk to:' },
      { type: 'ul', items: [
        'Double-booked therapists — two receptionists updating two different Excel copies, or a WhatsApp message that got missed.',
        'Session notes that live in a therapist\'s personal notebook or phone, not tied to the patient\'s record — lost the moment that therapist leaves.',
        'Billing built by hand in Excel, with no link between "sessions completed" and "amount owed" — packages get over-delivered or under-billed.',
        'No parent visibility — parents call or WhatsApp the reception desk to ask about the next appointment or how many sessions are left, instead of checking it themselves.',
      ] },
      { type: 'h2', text: 'What a dedicated clinic platform replaces each of these with' },
      { type: 'h3', text: 'One shared appointment calendar' },
      { type: 'p', text: 'Every therapist\'s schedule lives in one calendar. A booking anywhere in the system is visible everywhere — no second Excel copy to go stale, no double-booking.' },
      { type: 'h3', text: 'Session notes tied to the patient, not the therapist' },
      { type: 'p', text: 'SOAP-style session notes (subjective, objective, assessment, plan) are entered against the patient\'s record at the time of the session. If a therapist leaves, the clinic keeps the full session history — nothing walks out the door with them.' },
      { type: 'h3', text: 'Packages and billing that stay in sync automatically' },
      { type: 'p', text: 'A patient buys a package of sessions; each completed appointment deducts from it automatically. Invoices, GST and payment tracking are generated from the same data — no manual reconciliation between "how many sessions happened" and "how much is owed."' },
      { type: 'h3', text: 'A parent portal instead of a WhatsApp thread' },
      { type: 'p', text: 'Parents log in to see upcoming appointments, session progress and invoices directly — cutting the volume of "when is our next session" calls to reception.' },
      { type: 'h2', text: 'What to look for when evaluating a platform' },
      { type: 'ul', items: [
        'Built for therapy clinics specifically, not a generic hospital/clinic ERP retrofitted with a "therapy" label.',
        'Supports package-based billing (most therapy clinics sell session bundles, not per-visit billing).',
        'A parent portal, not just a staff-facing tool.',
        'Multi-branch support if you plan to expand beyond one location.',
        'A free trial with your own real patient data, not just a sales demo.',
      ] },
      { type: 'p', text: 'AetherDev Solutions is built specifically for speech therapy, occupational therapy, ABA and child development clinics in India — patients, appointments, sessions, billing, HR and a parent portal in one platform, with a 7-day free trial on your own data.' },
    ],
  },
  {
    slug: 'gst-invoicing-therapy-clinics-guide',
    title: 'GST Invoicing for Therapy Clinics: What to Include',
    description: 'Most individual therapy services (speech, OT, ABA, counselling) fall under GST-exempt healthcare services in India, but package billing, TDS and correct invoice fields still trip clinics up. Here is what a compliant therapy clinic invoice needs.',
    publishedAt: '2026-02-20',
    updatedAt: '2026-07-10',
    readingTime: '5 min read',
    sections: [
      { type: 'p', text: 'A therapy clinic invoice in India needs a unique invoice number, the clinic\'s GSTIN (if registered), the patient/guardian\'s name and address, a clear description of the service or package, the amount, and the applicable GST treatment — most clinical therapy services are exempt under healthcare service provisions, but this depends on how the clinic is registered and what exactly is being billed. Always confirm exemption applicability with a CA before assuming it applies to your clinic.' },
      { type: 'h2', text: 'Fields every therapy clinic invoice should have' },
      { type: 'ul', items: [
        'Invoice number — sequential and unique, required for GST compliance even on exempt supplies once turnover crosses the registration threshold.',
        'Clinic name, address, GSTIN (if registered) and contact details on a letterhead.',
        'Patient / guardian name and billing address.',
        'Clear line-item description: e.g. "Speech Therapy Package — 12 sessions" rather than a vague "Therapy charges."',
        'Session count and package validity, if billing a package rather than a single visit.',
        'Payment mode and amount received, with balance due shown separately from amount paid.',
        'GST rate applied (or exemption noted), CGST/SGST split for intra-state supply.',
      ] },
      { type: 'h2', text: 'Why package billing complicates this' },
      { type: 'p', text: 'Most therapy clinics sell packages of sessions (e.g. 12 sessions of speech therapy) rather than billing per visit. That means the invoice is raised once, up front, but the service is delivered over weeks or months. Two things commonly go wrong here:' },
      { type: 'ul', items: [
        'The invoice and the actual session delivery drift apart — a package shows as "fully invoiced" but only half the sessions have been delivered, with no record of which sessions are still owed.',
        'Discounts applied at the time of sale aren\'t reflected consistently across the invoice, the receipt and the patient\'s package balance.',
      ] },
      { type: 'p', text: 'The practical fix is billing software where the invoice is generated directly from the package record — so the invoice, the payment receipt and the sessions-remaining count for that patient are always the same number, not three separate figures a receptionist has to keep matching by hand.' },
      { type: 'h2', text: 'Receipts vs. invoices vs. advance receipts' },
      { type: 'p', text: 'Clinics that accept advance payment before starting a package should issue an advance receipt at the time of payment, then a final invoice once the package is confirmed — rather than one document trying to serve both purposes. This also makes month-end accounting reconciliation straightforward instead of a manual Excel exercise.' },
      { type: 'p', text: 'AetherDev Solutions generates GST-ready invoices, receipts and advance receipts directly from each patient\'s package record, on your own clinic letterhead — so the invoice, payment status and sessions-remaining count are always the same number across the system.' },
    ],
  },
  {
    slug: 'speech-therapy-vs-ot-vs-aba-software-features',
    title: 'Speech Therapy vs OT vs ABA: Software Features Each Needs',
    description: 'Speech therapy, occupational therapy and ABA therapy clinics share a lot of software needs, but each has features the others don\'t. Here is what to check for depending on which therapies your clinic offers.',
    publishedAt: '2026-03-18',
    updatedAt: '2026-07-10',
    readingTime: '5 min read',
    sections: [
      { type: 'p', text: 'Speech therapy, occupational therapy (OT) and ABA (Applied Behavior Analysis) clinics all need patient records, scheduling and billing — but each therapy type has specific documentation and tracking needs a generic clinic system usually misses. A multi-disciplinary center needs software that handles all three without forcing one therapy type\'s workflow onto the others.' },
      { type: 'h2', text: 'What all three therapy types need in common' },
      { type: 'ul', items: [
        'A single patient record shared across therapy types — a child in speech therapy and OT at the same clinic should have one file, not two disconnected ones.',
        'Therapist-wise scheduling with session duration that varies by therapy type (a 30-minute OT session vs. a 60-minute ABA session, for example).',
        'Package-based billing tied to sessions actually delivered.',
        'Parent visibility into progress across every therapy the child is receiving.',
      ] },
      { type: 'h2', text: 'Speech therapy — what\'s specific' },
      { type: 'p', text: 'Speech therapy session notes typically track receptive vs. expressive language milestones, articulation progress and specific goals per session (e.g. "2-step verbal commands with 80% accuracy"). Software should let a therapist log structured progress against goals, not just a free-text note, so progress is comparable session-to-session and printable into a parent-facing progress report.' },
      { type: 'h2', text: 'Occupational therapy — what\'s specific' },
      { type: 'p', text: 'OT documentation tends to track fine-motor and sensory-integration progress (grip type, pegboard time, sensory diet activities) and often needs equipment/resource tracking (sensory room bookings, therapy equipment used per session) that speech and ABA sessions don\'t.' },
      { type: 'h2', text: 'ABA therapy — what\'s specific' },
      { type: 'p', text: 'ABA typically involves higher session frequency (multiple sessions per week, sometimes daily) and behavior-tracking data points per session rather than a single narrative note — software needs to handle a much higher volume of short, structured entries without becoming tedious for the therapist to fill in after every session.' },
      { type: 'h2', text: 'What to check before choosing software for a multi-disciplinary clinic' },
      { type: 'ul', items: [
        'Can a single patient be enrolled in multiple therapy types at once, with one combined record?',
        'Does session-note structure adapt per therapy type, or is every therapist forced into the same generic note field?',
        'Can packages mix therapy types (e.g. a combined speech + OT package) or does billing force them apart?',
        'Is there a therapist-wise view so a speech therapist only sees their caseload, not the whole clinic\'s?',
      ] },
      { type: 'p', text: 'AetherDev Solutions supports speech therapy, occupational therapy, ABA, behavioral and special education workflows in one platform — a child can be enrolled across multiple therapy types with one shared record, therapist-wise scheduling and package billing that doesn\'t force every therapy into the same mold.' },
    ],
  },
  {
    slug: 'multi-branch-therapy-clinic-management',
    title: 'How to Run a Multi-Branch Child Therapy Clinic',
    description: 'Expanding a child therapy clinic from one branch to several changes how scheduling, billing and staff management need to work. Here is what breaks first, and how to structure a multi-branch clinic so it doesn\'t.',
    publishedAt: '2026-04-25',
    updatedAt: '2026-07-10',
    readingTime: '6 min read',
    sections: [
      { type: 'p', text: 'The first thing that breaks when a child therapy clinic opens a second branch is data isolation without visibility — each branch ends up with its own Excel sheet or WhatsApp group, and the owner loses a single view across the whole business. The fix is a system where each branch\'s day-to-day data (patients, appointments, billing) stays branch-specific, while ownership retains a consolidated view across all branches.' },
      { type: 'h2', text: 'What changes between single-branch and multi-branch' },
      { type: 'ul', items: [
        'Staff need branch-scoped access — a receptionist at Branch A shouldn\'t see or edit Branch B\'s appointments, but the admin/owner needs to see both.',
        'Therapists sometimes work across branches on different days — scheduling needs to handle that without duplicate staff records per branch.',
        'Billing and financial reporting need both a per-branch view (for local performance) and a consolidated view (for the business as a whole).',
        'Patient transfers between branches (a family relocating within the same city) need to move the full history, not start a fresh record.',
      ] },
      { type: 'h2', text: 'Branch-level access control' },
      { type: 'p', text: 'Staff roles should be assignable per branch — a receptionist or therapist logs in and sees only their branch\'s patients, appointments and billing, while an admin or owner role sees a branch switcher and can view any branch, or all of them combined. Trying to run this with shared Excel sheets or one big WhatsApp group inevitably leaks one branch\'s patient data to staff who have no reason to see it.' },
      { type: 'h2', text: 'Consolidated reporting without losing branch-level detail' },
      { type: 'p', text: 'Owners running multiple branches need to answer two different questions on demand: "how is Branch A doing this month" and "how is the whole clinic doing this month." A spreadsheet-based setup usually only answers one of these well — either branch-level detail is strong and consolidation is a manual copy-paste job, or the consolidated view exists but loses per-branch nuance. A shared platform with branch tagging on every record (patient, appointment, invoice) answers both from the same data, instantly.' },
      { type: 'h2', text: 'What to check before expanding to a second branch' },
      { type: 'ul', items: [
        'Does your current system support branch-level staff permissions, or does everyone see everything?',
        'Can a therapist be scheduled across branches without duplicate login accounts?',
        'Is billing/GST reporting available per branch and consolidated, without manual reconciliation?',
        'Can a patient record move between branches without losing session or billing history?',
      ] },
      { type: 'p', text: 'AetherDev Solutions supports unlimited branches on its higher plans, with branch-scoped staff access, therapist-wise scheduling across branches, and consolidated billing and reporting for the whole clinic from one login.' },
    ],
  },
]

export function getAllPosts(): BlogPost[] {
  return [...BLOG_POSTS].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug)
}
