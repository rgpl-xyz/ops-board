import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HoverCardComponent } from './hover-card.component';

/** jsdom has no Popover API: announce each change of state the way a browser does. */
function installPopoverStubs(panel: HTMLElement): void {
  const toggle = (newState: 'open' | 'closed'): void => {
    panel.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState }));
  };
  panel.showPopover = vi.fn(() => toggle('open'));
  panel.hidePopover = vi.fn(() => toggle('closed'));
}

function pointer(type: 'pointerenter' | 'pointerleave', pointerType = 'mouse'): Event {
  return Object.assign(new Event(type), { pointerType });
}

@Component({
  imports: [HoverCardComponent],
  template: `
    <ob-hover-card label="+2 more responders" heading="Responders">
      <p>Every responder</p>
    </ob-hover-card>
  `,
})
class Host {}

async function render() {
  await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const panel = root.querySelector('[popover]') as HTMLElement;
  installPopoverStubs(panel);
  const card = fixture.debugElement.query(
    (d) => d.componentInstance instanceof HoverCardComponent,
  ).componentInstance as HoverCardComponent;
  return { trigger: root.querySelector('button') as HTMLButtonElement, panel, card };
}

describe('HoverCardComponent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens once the mouse rests on the button and closes after it leaves the button and the card', async () => {
    const { trigger, panel, card } = await render();

    trigger.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(299);
    expect(card.isOpen()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(card.isOpen()).toBe(true);

    // Crossing from the button into the card keeps it open.
    trigger.dispatchEvent(pointer('pointerleave'));
    panel.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(500);
    expect(card.isOpen()).toBe(true);

    panel.dispatchEvent(pointer('pointerleave'));
    vi.advanceTimersByTime(200);
    expect(card.isOpen()).toBe(false);
  });

  it('leaves a touch to the tap that follows it', async () => {
    const { trigger, card } = await render();

    trigger.dispatchEvent(pointer('pointerenter', 'touch'));
    vi.advanceTimersByTime(1000);

    expect(card.isOpen()).toBe(false);
  });

  it('keeps a card the mouse opened open when its button is clicked', async () => {
    const { trigger, card } = await render();
    trigger.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(300);

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    trigger.dispatchEvent(click);
    trigger.dispatchEvent(pointer('pointerleave'));
    vi.advanceTimersByTime(1000);

    expect(click.defaultPrevented).toBe(true);
    expect(card.isOpen()).toBe(true);
  });

  it('ties the button to a card named by its heading', async () => {
    const { trigger, panel } = await render();

    expect(trigger.getAttribute('popovertarget')).toBe(panel.id);
    const title = panel.querySelector(`#${panel.getAttribute('aria-labelledby')}`);
    expect(title?.textContent?.trim()).toBe('Responders');
    expect(panel.textContent).toContain('Every responder');
  });
});
