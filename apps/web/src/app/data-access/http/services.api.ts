import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import type { Page } from '../contracts/common';
import type {
  CreateServiceRequest,
  ServiceDto,
  ServiceQuery,
  UpdateServiceRequest,
} from '../contracts/services';
import { API_BASE_URL } from './api-base';
import { apiUrl, buildHttpParams, toPromise } from './http-utils';

@Injectable({ providedIn: 'root' })
export class ServicesApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(query: ServiceQuery = {}): Promise<Page<ServiceDto>> {
    return toPromise(
      this.http.get<Page<ServiceDto>>(apiUrl(this.baseUrl, '/api/services'), {
        params: buildHttpParams({
          page: query.page,
          pageSize: query.pageSize,
          teamId: query.teamId,
          health: query.health,
          search: query.search,
          sort: query.sort,
          direction: query.direction,
        }),
      }),
    );
  }

  getById(id: string): Promise<ServiceDto> {
    return toPromise(
      this.http.get<ServiceDto>(apiUrl(this.baseUrl, `/api/services/${id}`)),
    );
  }

  create(body: CreateServiceRequest): Promise<ServiceDto> {
    return toPromise(
      this.http.post<ServiceDto>(apiUrl(this.baseUrl, '/api/services'), body),
    );
  }

  update(id: string, body: UpdateServiceRequest): Promise<ServiceDto> {
    return toPromise(
      this.http.put<ServiceDto>(
        apiUrl(this.baseUrl, `/api/services/${id}`),
        body,
      ),
    );
  }
}
