import type { UserRole } from './enums';

export interface CurrentUserDto {
  userId: string;
  organizationId: string;
  displayName: string;
  role: UserRole;
  demo: boolean;
}

export interface OrganizationDto {
  id: string;
  name: string;
}
