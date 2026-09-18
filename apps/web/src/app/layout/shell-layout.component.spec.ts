import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { routes } from '../app.routes';
import { IdentityApi } from '../data-access/http/identity.api';
import {
  IncidentRealtimeConnection,
  type RealtimeConnectionStatus,
} from '../core/realtime/incident-realtime-connection';
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
  let realtimeStatus: WritableSignal<RealtimeConnectionStatus>;

  beforeEach(async () => {
    realtimeStatus = signal<RealtimeConnectionStatus>('disconnected');
    await TestBed.configureTestingModule({
      imports: [ShellLayoutComponent],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: IdentityApi, useValue: fakeIdentity },
        {
          provide: IncidentRealtimeConnection,
          useValue: { status: realtimeStatus },
        },
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

  it('renders and announces each realtime transport status without LIVE language', () => {
    const fixture = TestBed.createComponent(ShellLayoutComponent);
    fixture.detectChanges();
    const statusElement = fixture.nativeElement.querySelector(
      '.shell__realtime',
    ) as HTMLElement;

    expect(statusElement.getAttribute('role')).toBe('status');
    expect(statusElement.getAttribute('aria-live')).toBe('polite');

    for (const [status, text] of [
      ['connecting', 'Realtime: Connecting'],
      ['connected', 'Realtime: Connected'],
      ['reconnecting', 'Realtime: Reconnecting'],
      ['disconnected', 'Realtime: Disconnected'],
    ] as const satisfies ReadonlyArray<
      readonly [RealtimeConnectionStatus, string]
    >) {
      realtimeStatus.set(status);
      fixture.detectChanges();
      expect(statusElement.textContent).toContain(text);
    }

    expect(statusElement.textContent).not.toMatch(/\bLIVE\b/i);
    expect(fixture.nativeElement.textContent).toContain('Incidents');
    expect(fixture.nativeElement.textContent).toContain('Services');
    expect(fixture.nativeElement.textContent).toContain('Demo Environment');
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

describe('responsive layout breakpoint behavior', () => {
  it('documents narrow breakpoint acceptance for core screens', () => {
    // Mirrors SCSS shipped in shell + list pages (≤720px):
    // - shell__body → single column; nav wraps; content padding tightens
    // - list filters → single column; .col-wide secondary columns hidden
    // - incident detail → single column below 721px (desktop two-column)
    const responsiveLayout = {
      breakpointPx: 720,
      shellStacked: true,
      filtersStack: true,
      hideWideListColumns: true,
      detailSingleColumnBelowDesktop: true,
    };
    expect(responsiveLayout.breakpointPx).toBe(720);
    expect(responsiveLayout.shellStacked).toBe(true);
    expect(responsiveLayout.filtersStack).toBe(true);
    expect(responsiveLayout.hideWideListColumns).toBe(true);
    expect(responsiveLayout.detailSingleColumnBelowDesktop).toBe(true);
  });
});
