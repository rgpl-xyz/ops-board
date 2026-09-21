import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { asRevisionString, type UserRole } from '../data-access';
import { RouteFocusService } from '../core/a11y/route-focus.service';
import { IdentityApi } from '../data-access/http/identity.api';
import { IncidentsApi } from '../data-access/http/incidents.api';
import { ServicesApi } from '../data-access/http/services.api';
import { CommandPaletteComponent } from './command-palette.component';

/** jsdom builds without native dialog support still exercise open/close state. */
function stubNativeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === 'function') {
    return;
  }

  dialog.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  dialog.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
}

const incident = (id: string, title: string, serviceName: string) => ({
  id,
  title,
  serviceId: 's1',
  serviceName,
  teamId: 't1',
  teamName: 'Payments',
  severity: 'Critical' as const,
  status: 'Investigating' as const,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T01:00:00Z',
  resolvedAt: null,
  version: asRevisionString('1'),
  lifecycleVersion: asRevisionString('1'),
});

const service = (id: string, name: string) => ({
  id,
  name,
  description: '',
  teamId: 't1',
  teamName: 'Payments',
  health: 'Degraded' as const,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T01:00:00Z',
  version: asRevisionString('1'),
});

function matching<T>(
  rows: readonly T[],
  search: string | null | undefined,
  text: (row: T) => string,
): T[] {
  const term = (search ?? '').trim().toLowerCase();
  return rows.filter((row) => text(row).toLowerCase().includes(term));
}

const page = <T>(items: T[]) => ({
  items,
  page: 1,
  pageSize: 5,
  totalCount: items.length,
  totalPages: 1,
});

@Component({
  selector: 'ob-test-blank',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class BlankRoute {}

/** Mirrors the real activation targets so activations resolve in tests. */
const ACTIVATION_ROUTES = [
  { path: 'incidents', component: BlankRoute },
  { path: 'incidents/new', component: BlankRoute },
  { path: 'incidents/:id', component: BlankRoute },
  { path: 'services', component: BlankRoute },
  { path: 'services/:id', component: BlankRoute },
];

describe('CommandPaletteComponent', () => {
  let fixture: ComponentFixture<CommandPaletteComponent>;
  let palette: CommandPaletteComponent;
  let invoker: HTMLButtonElement;
  let incidentsList: ReturnType<typeof vi.fn>;
  let servicesList: ReturnType<typeof vi.fn>;
  let role: UserRole;

  async function createPalette(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [CommandPaletteComponent],
      providers: [
        provideRouter(ACTIVATION_ROUTES),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false } } }),
        ),
        {
          provide: IdentityApi,
          useValue: {
            getCurrentUser: async () => ({
              userId: 'u1',
              organizationId: 'o1',
              displayName: 'Veyo R',
              role,
              demo: true,
            }),
            getOrganization: async () => ({ id: 'o1', name: 'Acme Cloud' }),
          },
        },
        { provide: IncidentsApi, useValue: { list: incidentsList } },
        { provide: ServicesApi, useValue: { list: servicesList } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CommandPaletteComponent);
    palette = fixture.componentInstance;
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    stubNativeDialog(dialogEl());
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    role = 'IncidentManager';
    const allIncidents = [
      incident('i1', 'Payments API latency', 'Payments API'),
      incident('i2', 'Checkout failures', 'Checkout'),
    ];
    const allServices = [service('s1', 'Payments API')];
    incidentsList = vi.fn(async (query: { search?: string | null }) =>
      page(matching(allIncidents, query.search, (row) => row.title)),
    );
    servicesList = vi.fn(async (query: { search?: string | null }) =>
      page(matching(allServices, query.search, (row) => row.name)),
    );

    invoker = document.createElement('button');
    invoker.type = 'button';
    invoker.textContent = 'Command menu';
    document.body.append(invoker);
  });

  afterEach(() => {
    fixture?.destroy();
    fixture?.nativeElement.remove();
    invoker.remove();
    vi.useRealTimers();
  });

  function dialogEl(): HTMLDialogElement {
    return fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
  }

  function searchEl(): HTMLInputElement {
    return fixture.nativeElement.querySelector(
      'input[role="combobox"]',
    ) as HTMLInputElement;
  }

  function optionEls(): HTMLElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('[role="option"]'),
    ) as HTMLElement[];
  }

  function optionLabels(): string[] {
    return optionEls().map((option) =>
      (option.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  function activeOption(): HTMLElement | undefined {
    return optionEls().find(
      (option) => option.getAttribute('aria-selected') === 'true',
    );
  }

  function summaryText(): string {
    return (
      fixture.nativeElement.querySelector('.palette__summary') as HTMLElement
    ).textContent?.trim() ?? '';
  }

  function isOpen(): boolean {
    return dialogEl().open || dialogEl().hasAttribute('open');
  }

  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(300);
    await TestBed.tick();
    await TestBed.tick();
  }

  async function search(text: string): Promise<void> {
    const input = searchEl();
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await TestBed.tick();
  }

  function press(key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    searchEl().dispatchEvent(event);
    return event;
  }

  describe('dialog and shortcut lifecycle', () => {
    beforeEach(async () => {
      await createPalette();
    });

    it('opens as a modal from its invoker and focuses the search field', async () => {
      invoker.focus();

      palette.openFrom(invoker);
      await TestBed.tick();

      expect(isOpen()).toBe(true);
      expect(palette.isOpen).toBe(true);
      expect(document.activeElement).toBe(searchEl());
      expect(searchEl().getAttribute('aria-expanded')).toBe('true');
    });

    it('retains the first invoker and only refocuses search when already open', async () => {
      palette.openFrom(invoker);
      await TestBed.tick();

      const other = document.createElement('button');
      other.type = 'button';
      document.body.append(other);
      other.focus();

      palette.openFrom(other);
      await TestBed.tick();

      expect(document.activeElement).toBe(searchEl());

      palette.close('dismiss');
      await TestBed.tick();

      expect(isOpen()).toBe(false);
      expect(document.activeElement).toBe(invoker);
      other.remove();
    });

    it('treats native cancel as dismissal and restores the connected invoker', async () => {
      palette.openFrom(invoker);
      await TestBed.tick();

      const cancel = new Event('cancel', { cancelable: true });
      dialogEl().dispatchEvent(cancel);
      await TestBed.tick();

      expect(cancel.defaultPrevented).toBe(true);
      expect(isOpen()).toBe(false);
      expect(document.activeElement).toBe(invoker);
    });

    it('dismisses from the labelled close control and from Escape in search', async () => {
      palette.openFrom(invoker);
      await TestBed.tick();

      const close = fixture.nativeElement.querySelector(
        '.palette__close',
      ) as HTMLButtonElement;
      expect(close.textContent?.trim()).toBe('Close');
      close.click();
      await TestBed.tick();

      expect(isOpen()).toBe(false);
      expect(document.activeElement).toBe(invoker);

      palette.openFrom(invoker);
      await TestBed.tick();
      const escape = press('Escape');
      await TestBed.tick();

      expect(escape.defaultPrevented).toBe(true);
      expect(isOpen()).toBe(false);
      expect(document.activeElement).toBe(invoker);
    });

    it('suppresses invoker restoration when closing for navigation', async () => {
      palette.openFrom(invoker);
      await TestBed.tick();

      palette.close('navigate');
      await TestBed.tick();

      expect(isOpen()).toBe(false);
      expect(document.activeElement).not.toBe(invoker);
    });

    it('does not restore focus to a disconnected invoker', async () => {
      const detached = document.createElement('button');
      detached.type = 'button';
      document.body.append(detached);
      detached.focus();

      palette.openFrom(detached);
      await TestBed.tick();
      detached.remove();

      palette.close('dismiss');
      await TestBed.tick();

      expect(isOpen()).toBe(false);
      expect(document.activeElement).not.toBe(detached);
    });

    it('exposes labelled dialog, combobox, and result-surface semantics', async () => {
      const el = fixture.nativeElement as HTMLElement;

      expect(dialogEl().getAttribute('aria-labelledby')).toBe('palette-title');
      expect(dialogEl().getAttribute('aria-describedby')).toBe('palette-help');
      expect(el.querySelector('#palette-title')?.textContent).toContain(
        'Command menu',
      );

      const search = searchEl();
      expect(search.getAttribute('aria-autocomplete')).toBe('list');
      expect(search.getAttribute('aria-controls')).toBe('palette-results');
      expect(search.getAttribute('aria-labelledby')).toBe('palette-help');
      expect(search.getAttribute('aria-expanded')).toBe('false');

      const results = el.querySelector('#palette-results') as HTMLElement;
      expect(results.getAttribute('role')).toBe('listbox');
      expect(results.getAttribute('aria-label')).toBe('Command results');

      palette.openFrom(invoker);
      await TestBed.tick();
      expect(searchEl().getAttribute('aria-expanded')).toBe('true');
    });
  });

  describe('query-backed results and keyboard model', () => {
    beforeEach(async () => {
      await createPalette();
      palette.openFrom(invoker);
      await settle();
    });

    it('offers static commands for empty and short input without entity requests', async () => {
      expect(optionLabels()).toEqual([
        'Go to Incidents',
        'Go to Services',
        'Create incident',
      ]);
      expect(incidentsList).not.toHaveBeenCalled();
      expect(servicesList).not.toHaveBeenCalled();

      await search('g');
      await settle();

      expect(incidentsList).not.toHaveBeenCalled();
      expect(servicesList).not.toHaveBeenCalled();
      expect(optionLabels().length).toBeGreaterThan(0);
    });

    it('keeps the open surface expanded for every result state', async () => {
      expect(searchEl().getAttribute('aria-expanded')).toBe('true');

      await search('zzzz');
      await settle();

      expect(optionEls()).toHaveLength(0);
      expect(searchEl().getAttribute('aria-expanded')).toBe('true');
    });

    it('bounds entity lookups to five current rows per group in deterministic order', async () => {
      await search('pay');
      await settle();

      expect(incidentsList).toHaveBeenCalledWith({
        search: 'pay',
        page: 1,
        pageSize: 5,
      });
      expect(servicesList).toHaveBeenCalledWith({
        search: 'pay',
        page: 1,
        pageSize: 5,
        sort: 'name',
      });

      const groups = Array.from(
        fixture.nativeElement.querySelectorAll('.palette__group'),
      ).map((el) => (el as HTMLElement).textContent?.trim());
      expect(groups).toEqual(['Incidents', 'Services']);

      const labels = optionLabels();
      expect(labels).toHaveLength(2);
      expect(labels[0]).toContain('Payments API latency');
      expect(labels[0]).toContain('Investigating');
      expect(labels[1]).toContain('Payments API');
      expect(labels[1]).toContain('Degraded');
    });

    it('hides earlier entity rows as soon as newer text is pending', async () => {
      await search('pay');
      await settle();
      expect(optionLabels().some((l) => l.includes('Payments API latency'))).toBe(
        true,
      );

      await search('paym');

      expect(optionLabels().some((l) => l.includes('Payments API latency'))).toBe(
        false,
      );
      expect(
        (
          fixture.nativeElement.querySelector('.palette__note') as HTMLElement
        ).textContent,
      ).toContain('Searching');
    });

    it('moves the active option with arrows, Home and End while focus stays in search', async () => {
      searchEl().focus();
      expect(searchEl().getAttribute('aria-activedescendant')).toBe(
        'palette-option-command-incidents',
      );

      const down = press('ArrowDown');
      await TestBed.tick();
      expect(down.defaultPrevented).toBe(true);
      expect(activeOption()?.textContent).toContain('Go to Services');
      expect(document.activeElement).toBe(searchEl());

      press('End');
      await TestBed.tick();
      expect(activeOption()?.textContent).toContain('Create incident');

      press('ArrowDown');
      await TestBed.tick();
      expect(activeOption()?.textContent).toContain('Go to Incidents');

      press('ArrowUp');
      await TestBed.tick();
      expect(activeOption()?.textContent).toContain('Create incident');

      press('Home');
      await TestBed.tick();
      expect(activeOption()?.textContent).toContain('Go to Incidents');
      expect(searchEl().getAttribute('aria-activedescendant')).toBe(
        activeOption()?.id,
      );
    });

    it('resets the active option on input and clamps it when results shrink', async () => {
      press('End');
      await TestBed.tick();
      expect(activeOption()?.textContent).toContain('Create incident');

      await search('go to s');
      await settle();

      expect(optionLabels()).toEqual(['Go to Services']);
      expect(activeOption()?.textContent).toContain('Go to Services');
      expect(searchEl().getAttribute('aria-activedescendant')).toBe(
        'palette-option-command-services',
      );
    });

    it('activates only an enabled active option with Enter', async () => {
      await search('zzzz');
      await settle();

      const ignored = press('Enter');
      await TestBed.tick();
      expect(ignored.defaultPrevented).toBe(false);
      expect(isOpen()).toBe(true);
      expect(searchEl().getAttribute('aria-activedescendant')).toBeNull();

      await search('');
      await settle();

      const activated = press('Enter');
      await TestBed.tick();

      expect(activated.defaultPrevented).toBe(true);
      expect(isOpen()).toBe(false);
      expect(document.activeElement).not.toBe(invoker);
    });

    it('closes without restoring the invoker and then navigates for each activation', async () => {
      const navigate = vi
        .spyOn(TestBed.inject(Router), 'navigate')
        .mockResolvedValue(true);

      press('Enter');
      await TestBed.tick();

      expect(isOpen()).toBe(false);
      expect(document.activeElement).not.toBe(invoker);
      expect(navigate).toHaveBeenCalledWith(['/incidents']);

      palette.openFrom(invoker);
      await settle();
      press('End');
      press('Enter');
      await TestBed.tick();
      expect(navigate).toHaveBeenCalledWith(['/incidents', 'new']);

      palette.openFrom(invoker);
      await settle();
      await search('pay');
      await settle();

      optionEls()[0].click();
      await TestBed.tick();
      expect(navigate).toHaveBeenCalledWith(['/incidents', 'i1']);
      expect(isOpen()).toBe(false);

      palette.openFrom(invoker);
      await settle();
      await search('pay');
      await settle();
      optionEls()[1].click();
      await TestBed.tick();
      expect(navigate).toHaveBeenCalledWith(['/services', 's1']);
    });

    it('navigates for Go to Services and leaves dismissal untouched', async () => {
      const navigate = vi
        .spyOn(TestBed.inject(Router), 'navigate')
        .mockResolvedValue(true);

      press('ArrowDown');
      press('Enter');
      await TestBed.tick();
      expect(navigate).toHaveBeenCalledWith(['/services']);

      palette.openFrom(invoker);
      await settle();
      press('Escape');
      await TestBed.tick();

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(invoker);
    });

    it('announces a settled count or no-match outcome politely and stays quiet otherwise', async () => {
      const summary = fixture.nativeElement.querySelector(
        '.palette__summary',
      ) as HTMLElement;
      expect(summary.getAttribute('role')).toBe('status');
      expect(summary.getAttribute('aria-live')).toBe('polite');
      expect(summaryText()).toBe('');

      await search('pay');
      await settle();
      expect(summaryText()).toBe('2 results');

      await search('zzzz');
      await settle();
      expect(summaryText()).toBe('No matching commands or records');

      press('ArrowDown');
      await TestBed.tick();
      expect(summaryText()).toBe('No matching commands or records');
    });
  });

  describe('capability-gated commands', () => {
    it('omits Create incident for a role without the capability', async () => {
      role = 'Viewer';
      await createPalette();
      palette.openFrom(invoker);
      await settle();

      expect(optionLabels()).toEqual(['Go to Incidents', 'Go to Services']);
    });
  });

  describe('routed activation handoff', () => {
    @Component({
      selector: 'ob-test-incidents',
      changeDetection: ChangeDetectionStrategy.OnPush,
      template:
        '<main><h1 data-ob-route-focus tabindex="-1">Incidents</h1></main>',
    })
    class IncidentsRoute {}

    @Component({
      selector: 'ob-test-services',
      changeDetection: ChangeDetectionStrategy.OnPush,
      template:
        '<main><h1 data-ob-route-focus tabindex="-1">Services</h1></main>',
    })
    class ServicesRoute {}

    @Component({
      selector: 'ob-test-host',
      changeDetection: ChangeDetectionStrategy.OnPush,
      imports: [CommandPaletteComponent, RouterOutlet],
      template: `
        <button type="button" id="entry">Command menu</button>
        <ob-command-palette />
        <router-outlet />
      `,
    })
    class HostShell {
      private readonly routeFocus = inject(RouteFocusService);

      constructor() {
        this.routeFocus.initialize();
      }
    }

    it('gives the destination target focus instead of the palette invoker', async () => {
      await TestBed.configureTestingModule({
        imports: [HostShell],
        providers: [
          provideRouter([
            { path: 'incidents', component: IncidentsRoute },
            { path: 'services', component: ServicesRoute },
          ]),
          provideHttpClient(),
          provideHttpClientTesting(),
          provideTanStackQuery(
            new QueryClient({ defaultOptions: { queries: { retry: false } } }),
          ),
          {
            provide: IdentityApi,
            useValue: {
              getCurrentUser: async () => ({
                userId: 'u1',
                organizationId: 'o1',
                displayName: 'Veyo R',
                role: 'IncidentManager',
                demo: true,
              }),
              getOrganization: async () => ({ id: 'o1', name: 'Acme Cloud' }),
            },
          },
          { provide: IncidentsApi, useValue: { list: incidentsList } },
          { provide: ServicesApi, useValue: { list: servicesList } },
        ],
      }).compileComponents();

      const host = TestBed.createComponent(HostShell);
      document.body.append(host.nativeElement);
      host.detectChanges();

      const router = TestBed.inject(Router);
      await router.navigateByUrl('/incidents');
      await TestBed.tick();

      const dialog = host.nativeElement.querySelector(
        'dialog',
      ) as HTMLDialogElement;
      stubNativeDialog(dialog);

      const entry = host.nativeElement.querySelector(
        '#entry',
      ) as HTMLButtonElement;
      entry.focus();

      const paletteInstance = host.debugElement.query(
        (node) => node.componentInstance instanceof CommandPaletteComponent,
      ).componentInstance as CommandPaletteComponent;
      paletteInstance.openFrom(entry);
      await TestBed.tick();

      const search = host.nativeElement.querySelector(
        'input[role="combobox"]',
      ) as HTMLInputElement;
      search.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          bubbles: true,
          cancelable: true,
        }),
      );
      search.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      );

      await vi.advanceTimersByTimeAsync(300);
      await TestBed.tick();
      await TestBed.tick();

      expect(router.url).toBe('/services');
      expect(dialog.open || dialog.hasAttribute('open')).toBe(false);
      expect(document.activeElement).not.toBe(entry);
      expect(
        (document.activeElement as HTMLElement | null)?.textContent,
      ).toContain('Services');

      host.destroy();
      host.nativeElement.remove();
    });
  });
});
