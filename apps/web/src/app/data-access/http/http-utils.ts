import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom, type Observable } from 'rxjs';

import { asRevisionString, type RevisionString } from '../contracts/common';
import { parseProblem } from '../errors/parse-problem';
import type { OpsBoardProblem } from '../errors/problem';

export async function toPromise<T>(source: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(source);
  } catch (error) {
    throw toOpsBoardProblem(error);
  }
}

export function toOpsBoardProblem(error: unknown): OpsBoardProblem {
  if (error instanceof HttpErrorResponse) {
    return parseProblem(error, error.status);
  }
  return parseProblem(error);
}

export function assertRevisionString(value: string): RevisionString {
  return asRevisionString(value);
}

/** Build HttpParams from allowlisted entries; omit null/undefined. */
export function buildHttpParams(
  entries: Record<string, string | number | boolean | null | undefined>,
): HttpParams {
  let params = new HttpParams();
  for (const key of Object.keys(entries).sort()) {
    const value = entries[key];
    if (value === null || value === undefined) {
      continue;
    }
    params = params.set(key, String(value));
  }
  return params;
}

export function apiUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}
