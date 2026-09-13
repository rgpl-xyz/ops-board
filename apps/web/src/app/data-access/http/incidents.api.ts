import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import type { Bounded, ContinuationQuery, Page, PageQuery } from '../contracts/common';
import type {
  CreateIncidentRequest,
  IncidentDetailDto,
  IncidentQuery,
  IncidentSummaryDto,
  LifecycleVersionRequest,
  ResponderDto,
  ResponseMutationDto,
  SeverityRequest,
  StatusRequest,
  TimelineEntryDto,
  UpdateIncidentRequest,
  VersionRequest,
  WrittenUpdateRequest,
} from '../contracts/incidents';
import { API_BASE_URL } from './api-base';
import { apiUrl, buildHttpParams, toPromise } from './http-utils';

@Injectable({ providedIn: 'root' })
export class IncidentsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(query: IncidentQuery = {}): Promise<Page<IncidentSummaryDto>> {
    return toPromise(
      this.http.get<Page<IncidentSummaryDto>>(
        apiUrl(this.baseUrl, '/api/incidents'),
        {
          params: buildHttpParams({
            page: query.page,
            pageSize: query.pageSize,
            serviceId: query.serviceId,
            teamId: query.teamId,
            severity: query.severity,
            status: query.status,
            search: query.search,
            sort: query.sort,
            direction: query.direction,
          }),
        },
      ),
    );
  }

  getById(id: string): Promise<IncidentDetailDto> {
    return toPromise(
      this.http.get<IncidentDetailDto>(
        apiUrl(this.baseUrl, `/api/incidents/${id}`),
      ),
    );
  }

  create(body: CreateIncidentRequest): Promise<IncidentDetailDto> {
    return toPromise(
      this.http.post<IncidentDetailDto>(
        apiUrl(this.baseUrl, '/api/incidents'),
        body,
      ),
    );
  }

  update(id: string, body: UpdateIncidentRequest): Promise<IncidentDetailDto> {
    return toPromise(
      this.http.put<IncidentDetailDto>(
        apiUrl(this.baseUrl, `/api/incidents/${id}`),
        body,
      ),
    );
  }

  changeSeverity(
    id: string,
    body: SeverityRequest,
  ): Promise<IncidentDetailDto> {
    return toPromise(
      this.http.patch<IncidentDetailDto>(
        apiUrl(this.baseUrl, `/api/incidents/${id}/severity`),
        body,
      ),
    );
  }

  changeStatus(id: string, body: StatusRequest): Promise<IncidentDetailDto> {
    return toPromise(
      this.http.patch<IncidentDetailDto>(
        apiUrl(this.baseUrl, `/api/incidents/${id}/status`),
        body,
      ),
    );
  }

  resolve(id: string, body: VersionRequest): Promise<IncidentDetailDto> {
    return toPromise(
      this.http.post<IncidentDetailDto>(
        apiUrl(this.baseUrl, `/api/incidents/${id}/resolve`),
        body,
      ),
    );
  }

  reopen(id: string, body: VersionRequest): Promise<IncidentDetailDto> {
    return toPromise(
      this.http.post<IncidentDetailDto>(
        apiUrl(this.baseUrl, `/api/incidents/${id}/reopen`),
        body,
      ),
    );
  }

  listResponders(
    id: string,
    query: ContinuationQuery = {},
  ): Promise<Bounded<ResponderDto>> {
    return toPromise(
      this.http.get<Bounded<ResponderDto>>(
        apiUrl(this.baseUrl, `/api/incidents/${id}/responders`),
        {
          params: buildHttpParams({
            limit: query.limit,
            after: query.after,
          }),
        },
      ),
    );
  }

  join(
    id: string,
    body: LifecycleVersionRequest,
  ): Promise<ResponseMutationDto> {
    return toPromise(
      this.http.post<ResponseMutationDto>(
        apiUrl(this.baseUrl, `/api/incidents/${id}/responders/join`),
        body,
      ),
    );
  }

  leave(
    id: string,
    body: LifecycleVersionRequest,
  ): Promise<ResponseMutationDto> {
    return toPromise(
      this.http.post<ResponseMutationDto>(
        apiUrl(this.baseUrl, `/api/incidents/${id}/responders/leave`),
        body,
      ),
    );
  }

  addUpdate(
    id: string,
    body: WrittenUpdateRequest,
  ): Promise<ResponseMutationDto> {
    return toPromise(
      this.http.post<ResponseMutationDto>(
        apiUrl(this.baseUrl, `/api/incidents/${id}/updates`),
        body,
      ),
    );
  }

  listTimeline(
    id: string,
    query: PageQuery = {},
  ): Promise<Page<TimelineEntryDto>> {
    return toPromise(
      this.http.get<Page<TimelineEntryDto>>(
        apiUrl(this.baseUrl, `/api/incidents/${id}/timeline`),
        {
          params: buildHttpParams({
            page: query.page,
            pageSize: query.pageSize,
          }),
        },
      ),
    );
  }
}
