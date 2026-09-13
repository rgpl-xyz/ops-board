import { InjectionToken } from '@angular/core';

/**
 * Empty string so browser requests stay relative (`/api/...`) and hit the
 * Angular dev proxy. Prefer https://localhost:7243; http://localhost:5233 is
 * the launchSettings fallback if the https profile is unavailable.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '',
});
