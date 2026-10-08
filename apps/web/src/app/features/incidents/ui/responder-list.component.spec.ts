import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { ResponderDto } from '../../../data-access';
import { ResponderListComponent } from './responder-list.component';

const responder = (name: string, minute: number): ResponderDto => ({
  userId: `u-${name}`,
  displayName: name,
  joinedAt: `2026-09-10T10:${String(minute).padStart(2, '0')}:00Z`,
});

async function render(responders: readonly ResponderDto[]): Promise<HTMLElement> {
  await TestBed.configureTestingModule({ imports: [ResponderListComponent] }).compileComponents();
  const fixture = TestBed.createComponent(ResponderListComponent);
  fixture.componentRef.setInput('responders', responders);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

/** The rows of the list itself, not of the card inside its last row. */
function rows(root: HTMLElement): string[] {
  const list = root.querySelector('ul') as HTMLUListElement;
  return [...list.children].map((row) => row.firstElementChild?.textContent?.trim() ?? '');
}

describe('ResponderListComponent', () => {
  it('shows four responders in full, since folding one would save no room', async () => {
    const root = await render([
      responder('Avery', 1),
      responder('Blake', 2),
      responder('Casey', 3),
      responder('Devon', 4),
    ]);

    expect(rows(root)).toEqual(['Avery', 'Blake', 'Casey', 'Devon']);
    expect(root.querySelector('ob-hover-card')).toBeNull();
  });

  it('shows the first three to join and folds the rest into a card', async () => {
    const root = await render([
      responder('Elliot', 9),
      responder('Avery', 1),
      responder('Frankie', 12),
      responder('Casey', 3),
      responder('Blake', 2),
      responder('Devon', 4),
    ]);

    expect(rows(root).slice(0, 3)).toEqual(['Avery', 'Blake', 'Casey']);
    expect(root.querySelector('ob-hover-card button')?.textContent?.trim()).toBe(
      '+3 more responders',
    );
    const card = root.querySelector('[popover]') as HTMLElement;
    const everyone = [...card.querySelectorAll('li span')].map((name) => name.textContent);
    expect(everyone).toEqual(['Avery', 'Blake', 'Casey', 'Devon', 'Elliot', 'Frankie']);
  });
});
