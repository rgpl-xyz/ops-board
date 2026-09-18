import { InjectionToken } from '@angular/core';

export const HUB_URL = new InjectionToken<string>('HUB_URL', {
  providedIn: 'root',
  factory: () => '/hubs/incidents',
});
