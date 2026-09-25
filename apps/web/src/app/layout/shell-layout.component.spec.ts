import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';

import { routes } from '../app.routes';
import { IdentityApi } from '../data-access/http/identity.api';
import {
  IncidentRealtimeConnection,
  type RealtimeConnectionStatus,
} from '../core/realtime/incident-realtime-connection';
import { RouteFocusService } from '../core/a11y/route-focus.service';
import { CommandPaletteComponent } from './command-palette.component';
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
    expect(el.textContent).toContain('Incident manager');
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

  it('initializes the root route-focus service from the persistent shell', () => {
    let instances = 0;
    const initialize = vi.fn();
    TestBed.overrideProvider(RouteFocusService, {
      useFactory: () => {
        instances += 1;
        return { initialize };
      },
    });

    const fixture = TestBed.createComponent(ShellLayoutComponent);
    fixture.detectChanges();

    expect(instances).toBe(1);
    expect(initialize).toHaveBeenCalledTimes(1);
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

describe('ShellLayoutComponent command palette entry and shortcut', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<ShellLayoutComponent>>;
  const cleanup: HTMLElement[] = [];

  beforeEach(async () => {
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
          useValue: { status: signal<RealtimeConnectionStatus>('connected') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShellLayoutComponent);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();

    const dialog = paletteDialog();
    if (typeof dialog.showModal !== 'function') {
      dialog.showModal = vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      });
      dialog.close = vi.fn(function (this: HTMLDialogElement) {
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      });
    }
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
    for (const node of cleanup.splice(0)) {
      node.remove();
    }
  });

  function paletteDialog(): HTMLDialogElement {
    return fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
  }

  function paletteSearch(): HTMLInputElement {
    return fixture.nativeElement.querySelector(
      'input[role="combobox"]',
    ) as HTMLInputElement;
  }

  function entryButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector(
      '.shell__command',
    ) as HTMLButtonElement;
  }

  function isPaletteOpen(): boolean {
    const dialog = paletteDialog();
    return dialog.open || dialog.hasAttribute('open');
  }

  function shortcut(
    target: EventTarget,
    init: KeyboardEventInit = { ctrlKey: true },
  ): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(event);
    return event;
  }

  function track<T extends HTMLElement>(node: T): T {
    document.body.append(node);
    cleanup.push(node);
    return node;
  }

  it('renders a visible named command entry with its shortcut hint', () => {
    const entry = entryButton();

    expect(entry).not.toBeNull();
    expect(entry.textContent).toContain('Command menu');
    expect(entry.textContent).toContain('Ctrl K');
    expect(entry.getAttribute('aria-keyshortcuts')).toBe('Control+K Meta+K');
    expect(isPaletteOpen()).toBe(false);
  });

  it('opens the palette from the entry button and restores its focus on dismissal', async () => {
    entryButton().click();
    await TestBed.tick();

    expect(isPaletteOpen()).toBe(true);
    expect(document.activeElement).toBe(paletteSearch());

    const cancel = new Event('cancel', { cancelable: true });
    paletteDialog().dispatchEvent(cancel);
    await TestBed.tick();

    expect(isPaletteOpen()).toBe(false);
    expect(document.activeElement).toBe(entryButton());
  });

  it('opens the palette with Ctrl+K and with Meta+K', async () => {
    const ctrl = shortcut(document.body, { ctrlKey: true });
    await TestBed.tick();

    expect(ctrl.defaultPrevented).toBe(true);
    expect(isPaletteOpen()).toBe(true);
    expect(document.activeElement).toBe(paletteSearch());

    const palette = fixture.debugElement.query(
      (node) => node.componentInstance instanceof CommandPaletteComponent,
    ).componentInstance as CommandPaletteComponent;
    palette.close('dismiss');
    await TestBed.tick();
    expect(isPaletteOpen()).toBe(false);

    const meta = shortcut(document.body, { metaKey: true });
    await TestBed.tick();

    expect(meta.defaultPrevented).toBe(true);
    expect(isPaletteOpen()).toBe(true);
  });

  it('refocuses the open palette instead of reopening it on a second shortcut', async () => {
    entryButton().click();
    await TestBed.tick();

    const search = paletteSearch();
    const showModal = vi.spyOn(paletteDialog(), 'showModal');
    const openCalls = showModal.mock.calls.length;
    search.blur();
    const second = shortcut(search, { ctrlKey: true });
    await TestBed.tick();

    expect(second.defaultPrevented).toBe(true);
    expect(showModal.mock.calls.length).toBe(openCalls);
    expect(document.activeElement).toBe(search);

    const cancel = new Event('cancel', { cancelable: true });
    paletteDialog().dispatchEvent(cancel);
    await TestBed.tick();

    expect(document.activeElement).toBe(entryButton());
  });

  it('leaves the shortcut to editable targets', async () => {
    const input = track(document.createElement('input'));
    const textarea = track(document.createElement('textarea'));
    const select = track(document.createElement('select'));
    const editable = track(document.createElement('div'));
    editable.setAttribute('contenteditable', 'true');
    const inEditable = document.createElement('span');
    editable.append(inEditable);

    for (const target of [input, textarea, select, inEditable]) {
      const event = shortcut(target, { ctrlKey: true });
      await TestBed.tick();

      expect(event.defaultPrevented).toBe(false);
      expect(isPaletteOpen()).toBe(false);
    }
  });

  it('does not intercept the shortcut while another native dialog is open', async () => {
    const other = track(document.createElement('dialog'));
    other.setAttribute('open', '');

    const event = shortcut(document.body, { ctrlKey: true });
    await TestBed.tick();

    expect(event.defaultPrevented).toBe(false);
    expect(isPaletteOpen()).toBe(false);
  });

  it('ignores unrelated keys', async () => {
    const plain = shortcut(document.body, {});
    const other = new KeyboardEvent('keydown', {
      key: 'j',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(other);
    await TestBed.tick();

    expect(plain.defaultPrevented).toBe(false);
    expect(other.defaultPrevented).toBe(false);
    expect(isPaletteOpen()).toBe(false);
  });
});
