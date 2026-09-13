import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import type { Bounded, ContinuationQuery } from '../contracts/common';
import type { LookupUserDto, TeamDto } from '../contracts/lookups';
import { API_BASE_URL } from './api-base';
import { apiUrl, buildHttpParams, toPromise } from './http-utils';

@Injectable({ providedIn: 'root' })
export class LookupsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  listTeams(query: ContinuationQuery = {}): Promise<Bounded<TeamDto>> {
    return toPromise(
      this.http.get<Bounded<TeamDto>>(apiUrl(this.baseUrl, '/api/lookups/teams'), {
        params: buildHttpParams({
          limit: query.limit,
          after: query.after,
        }),
      }),
    );
  }

  listUsers(query: ContinuationQuery = {}): Promise<Bounded<LookupUserDto>> {
    return toPromise(
      this.http.get<Bounded<LookupUserDto>>(
        apiUrl(this.baseUrl, '/api/lookups/users'),
        {
          params: buildHttpParams({
            limit: query.limit,
            after: query.after,
          }),
        },
      ),
    );
  }
}
