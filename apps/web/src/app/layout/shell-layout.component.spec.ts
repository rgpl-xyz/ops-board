import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { routes } from '../app.routes';
import { IdentityApi } from '../data-access/http/identity.api';
import { ShellLayoutComponent } from './shell-layout.component';

const fakeIdentity: Pick<IdentityApi, 'getCurrentUser' | 'getOrganization'> = {
  getCurrentUser: async () => ({
    userId: 'u1',
    organizationId: 'o1',
    displayName: 'Veyo R',
    role: 'IncidentManager',
    demo: true,
  }),
  getOrganization: async () => ({
    id: 'o1',
    name: 'Acme Cloud',
  }),
};

describe('ShellLayoutComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShellLayoutComponent],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: IdentityApi, useValue: fakeIdentity },
      ],
    }).compileComponents();
  });

  it('renders brand, demo banner, nav, and identity chrome', async () => {
    const fixture = TestBed.createComponent(ShellLayoutComponent);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Veyo R');
    });

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('OpsBoard');
    expect(el.textContent).toContain('Demo Environment');
    expect(el.textContent).toContain('Incidents');
    expect(el.textContent).toContain('Services');
    expect(el.textContent).toContain('IncidentManager');
    expect(el.textContent).toContain('Acme Cloud');
  });
});

describe('app routes', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: IdentityApi, useValue: fakeIdentity },
      ],
    }).compileComponents();
  });

  it('redirects / to /incidents', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    expect(router.url.startsWith('/incidents')).toBe(true);
  });
});
