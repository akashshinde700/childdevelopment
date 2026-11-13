// Who counts as a therapist for scheduling (therapist dropdowns, the
// appointment grid, assigning sessions/assessments): every built-in
// therapist role, plus any other account flagged takesSessions — e.g. the
// clinic owner who is Org Admin but also treats patients, or a custom role
// like "Pediatric Physiotherapist". Access rules still follow the role.
export const THERAPIST_ROLES = ['therapist_speech', 'therapist_ot', 'therapist_behavioral', 'therapist_remedial', 'psychologist']

export function takesTherapySessions(
  user: { role?: string | null; takesSessions?: boolean | null },
  roles: readonly string[] = THERAPIST_ROLES,
): boolean {
  return (!!user.role && roles.includes(user.role)) || user.takesSessions === true
}
