import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import type { CurrentUserDto, OrganizationDto } from '../contracts/identity';
import { API_BASE_URL } from './api-base';
import { apiUrl, toPromise } from './http-utils';

@Injectable({ providedIn: 'root' })
export class IdentityApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  getCurrentUser(): Promise<CurrentUserDto> {
    return toPromise(
      this.http.get<CurrentUserDto>(apiUrl(this.baseUrl, '/api/current-user')),
    );
  }

  getOrganization(): Promise<OrganizationDto> {
    return toPromise(
      this.http.get<OrganizationDto>(apiUrl(this.baseUrl, '/api/organization')),
    );
  }
}
