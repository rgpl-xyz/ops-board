import type { UserRole } from '../../data-access';

const RESPOND_ROLES = new Set<UserRole>([
  'Responder',
  'IncidentManager',
  'Administrator',
]);

const MANAGE_ROLES = new Set<UserRole>([
  'IncidentManager',
  'Administrator',
]);

/** All delivered roles may read. Explicit allow — no ordinal compares. */
export function canRead(role: UserRole): boolean {
  return (
    role === 'Viewer' ||
    role === 'Responder' ||
    role === 'IncidentManager' ||
    role === 'Administrator'
  );
}

export function canRespond(role: UserRole): boolean {
  return RESPOND_ROLES.has(role);
}

export function canManage(role: UserRole): boolean {
  return MANAGE_ROLES.has(role);
}
