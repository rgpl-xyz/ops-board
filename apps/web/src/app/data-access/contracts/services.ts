import type { RevisionString } from './common';
import type { ServiceHealth } from './enums';

export interface CreateServiceRequest {
  name: string;
  description: string;
  teamId: string;
}

export interface UpdateServiceRequest {
  name: string;
  description: string;
  teamId: string;
  health: ServiceHealth;
  expectedVersion: RevisionString;
}

export interface ServiceDto {
  id: string;
  name: string;
  description: string;
  teamId: string;
  teamName: string;
  health: ServiceHealth;
  createdAt: string;
  updatedAt: string;
  version: RevisionString;
}

export interface ServiceQuery {
  page?: number;
  pageSize?: number;
  teamId?: string | null;
  health?: ServiceHealth | null;
  search?: string | null;
  sort?: string;
  direction?: string;
}
