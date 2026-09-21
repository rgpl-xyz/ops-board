import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  DefaultUrlSerializer,
  NavigationEnd,
  Router,
} from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RouteFocusService } from './route-focus.service';

@Component({
  template: `
    <main>
      @if (showFallback()) {
        <section
          data-ob-route-focus
          tabindex="-1"
          aria-label="Loading incident details"
        >
          Loading incident details…
        </section>
      } @else {
        <h1 data-ob-route-focus tabindex="-1">Incident details</h1>
      }
    </main>
  `,
})
class RouteFocusHost {
  readonly showFallback = signal(true);
}

describe('RouteFocusService', () => {
  let events: Subject<NavigationEnd>;
  let fixture: ReturnType<typeof TestBed.createComponent<RouteFocusHost>>;

  beforeEach(async () => {
    events = new Subject<NavigationEnd>();
    const serializer = new DefaultUrlSerializer();

    await TestBed.configureTestingModule({
      imports: [RouteFocusHost],
      providers: [
        RouteFocusService,
        {
          provide: Router,
          useValue: {
            events: events.asObservable(),
            parseUrl: (url: string) => serializer.parse(url),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RouteFocusHost);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    TestBed.inject(RouteFocusService).initialize();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('uses the first completed navigation as a no-focus baseline', async () => {
    const target = targetFor(fixture);
    const focus = vi.spyOn(target, 'focus');

    navigate('/incidents');
    await TestBed.tick();

    expect(focus).not.toHaveBeenCalled();
  });

  it('focuses the destination target once after a changed primary pathname', async () => {
    const target = targetFor(fixture);
    const focus = vi.spyOn(target, 'focus');

    navigate('/incidents');
    navigate('/services');
    await TestBed.tick();

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: false });
  });

  it.each([
    ['/incidents?search=payments', 'query-only search'],
    ['/incidents?status=Investigating&page=2', 'filter and pagination'],
    ['/incidents#timeline', 'fragment-only change'],
    ['/incidents?search=payments&page=2', 'history-like in-page URL state'],
  ])('preserves focus for %s (%s)', async (url) => {
    const target = targetFor(fixture);
    const focus = vi.spyOn(target, 'focus');

    navigate('/incidents?status=New&page=1');
    target.focus();
    expect(document.activeElement).toBe(target);

    navigate(url);
    await TestBed.tick();

    expect(focus).not.toHaveBeenCalledWith({ preventScroll: false });
    expect(document.activeElement).toBe(target);
  });

  it('focuses a browser-history-like navigation when its pathname changes', async () => {
    const target = targetFor(fixture);
    const focus = vi.spyOn(target, 'focus');

    navigate('/incidents?status=New');
    navigate('/services?health=Healthy');
    await TestBed.tick();

    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('focuses a named loading target once and does not react when content later replaces it', async () => {
    const fallback = targetFor(fixture);
    const fallbackFocus = vi.spyOn(fallback, 'focus');

    navigate('/incidents');
    navigate('/incidents/incident-1');
    await TestBed.tick();

    expect(fallbackFocus).toHaveBeenCalledTimes(1);

    fixture.componentInstance.showFallback.set(false);
    fixture.detectChanges();
    await TestBed.tick();

    const heading = targetFor(fixture);
    const headingFocus = vi.spyOn(heading, 'focus');
    expect(headingFocus).not.toHaveBeenCalled();
  });

  it('has no data-activity dependency: replacing rendered content without NavigationEnd does not focus', async () => {
    const target = targetFor(fixture);
    const focus = vi.spyOn(target, 'focus');

    fixture.componentInstance.showFallback.set(false);
    fixture.detectChanges();
    await TestBed.tick();

    expect(focus).not.toHaveBeenCalled();
  });

  function navigate(url: string): void {
    events.next(new NavigationEnd(1, url, url));
  }
});

function targetFor(
  fixture: ReturnType<typeof TestBed.createComponent<RouteFocusHost>>,
): HTMLElement {
  const target = (fixture.nativeElement as HTMLElement).querySelector(
    '[data-ob-route-focus]',
  ) as HTMLElement | null;

  if (!target) {
    throw new Error('Expected a route focus target.');
  }

  return target;
}
