// Roles that may change an appointment's slot — must match the role check in
// PUT /api/appointments. They also handle parents' reschedule requests.
export const RESCHEDULE_STAFF_ROLES = ['super_admin', 'admin', 'receptionist']
