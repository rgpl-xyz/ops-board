import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ClampedTextComponent } from './clamped-text.component';

const LONG = 'Notifications were delayed while a send worker leaked connections. '.repeat(12);

@Component({
  imports: [ClampedTextComponent],
  template: `<ob-clamped-text [text]="text()" heading="Description" />`,
})
class Host {
  readonly text = signal('Short summary.');
}

/** jsdom lays nothing out, so report the paragraph as cut short or not. */
function layOut(root: HTMLElement, cut: boolean): void {
  const paragraph = root.querySelector('.clamped') as HTMLElement;
  Object.defineProperty(paragraph, 'clientHeight', { configurable: true, value: 100 });
  Object.defineProperty(paragraph, 'scrollHeight', {
    configurable: true,
    value: cut ? 180 : 100,
  });
}

async function show(fixture: ComponentFixture<Host>, text: string, cut: boolean) {
  layOut(fixture.nativeElement, cut);
  fixture.componentInstance.text.set(text);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

async function render(): Promise<ComponentFixture<Host>> {
  await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('ClampedTextComponent', () => {
  it('ends text cut short in a more button that shows all of it', async () => {
    const fixture = await render();
    await show(fixture, LONG, true);
    const root = fixture.nativeElement as HTMLElement;

    const more = root.querySelector('ob-hover-card button');
    expect(more?.textContent?.trim()).toBe('more');
    expect(more?.getAttribute('aria-label')).toBe('More of the description');
    expect(root.querySelector('[popover]')?.textContent).toContain(LONG.trim());
  });

  it('offers nothing more when the text fits', async () => {
    const fixture = await render();
    await show(fixture, 'Short summary, still.', false);

    expect(fixture.nativeElement.querySelector('ob-hover-card')).toBeNull();
  });

  it('measures again when new text keeps the same clamped height', async () => {
    const fixture = await render();
    await show(fixture, LONG, true);
    await show(fixture, 'Exactly four lines of text.', false);

    expect(fixture.nativeElement.querySelector('ob-hover-card')).toBeNull();
  });

  it('keeps the whole text in place for assistive technology', async () => {
    const fixture = await render();
    await show(fixture, LONG, true);

    expect(fixture.nativeElement.querySelector('.clamped').textContent).toBe(LONG);
  });
});
