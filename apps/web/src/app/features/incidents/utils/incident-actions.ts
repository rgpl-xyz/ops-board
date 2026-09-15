import type { IncidentStatus, UserRole } from '../../../data-access';
import { canManage, canRespond } from '../../../shared/permissions/capabilities';

const ACTIVE_STATUSES = new Set<IncidentStatus>([
  'Investigating',
  'Identified',
  'Monitoring',
]);

export function isActiveStatus(status: IncidentStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function canChangeSeverity(role: UserRole): boolean {
  return canManage(role);
}

export function canChangeActiveStatus(
  role: UserRole,
  status: IncidentStatus,
): boolean {
  return canManage(role) && isActiveStatus(status);
}

export function canResolve(role: UserRole, status: IncidentStatus): boolean {
  return canManage(role) && isActiveStatus(status);
}

export function canReopen(role: UserRole, status: IncidentStatus): boolean {
  return canManage(role) && status === 'Resolved';
}

export function canJoin(
  role: UserRole,
  status: IncidentStatus,
  isMember: boolean,
): boolean {
  return canRespond(role) && isActiveStatus(status) && !isMember;
}

export function canLeave(
  role: UserRole,
  status: IncidentStatus,
  isMember: boolean,
): boolean {
  return canRespond(role) && isActiveStatus(status) && isMember;
}

export function canPostWrittenUpdate(
  role: UserRole,
  status: IncidentStatus,
): boolean {
  return canRespond(role) && isActiveStatus(status);
}

export function canEditIncidentDetails(role: UserRole): boolean {
  return canManage(role);
}

export function canCreateIncident(role: UserRole): boolean {
  return canManage(role);
}

/** Active status options for the status control (never includes Resolved). */
export const ACTIVE_STATUS_OPTIONS: readonly IncidentStatus[] = [
  'Investigating',
  'Identified',
  'Monitoring',
] as const;
