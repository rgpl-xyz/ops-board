import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { fromEvent, takeUntil } from 'rxjs';

import type { AssistantStatusDto, IncidentBriefDto } from '../contracts/assistant';
import { API_BASE_URL } from './api-base';
import { apiUrl, toPromise } from './http-utils';

@Injectable({ providedIn: 'root' })
export class AssistantApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  getStatus(): Promise<AssistantStatusDto> {
    return toPromise(
      this.http.get<AssistantStatusDto>(apiUrl(this.baseUrl, '/api/assistant')),
    );
  }

  /**
   * Asks the server for a brief of one incident. It sends no body: the
   * server chooses the data, the instructions and the model. Aborting the
   * signal drops the request.
   */
  generateBrief(
    incidentId: string,
    signal?: AbortSignal,
  ): Promise<IncidentBriefDto> {
    const request = this.http.post<IncidentBriefDto>(
      apiUrl(this.baseUrl, `/api/incidents/${incidentId}/assistant/brief`),
      null,
    );
    return toPromise(
      signal ? request.pipe(takeUntil(fromEvent(signal, 'abort'))) : request,
    );
  }
}
