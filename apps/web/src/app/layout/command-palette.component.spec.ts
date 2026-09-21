import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('CommandPaletteComponent', () => {
  let fixture: ComponentFixture<CommandPaletteComponent>;
  let palette: CommandPaletteComponent;
  let invoker: HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommandPaletteComponent],
    }).compileComponents();

    invoker = document.createElement('button');
    invoker.type = 'button';
    invoker.textContent = 'Command menu';
    document.body.append(invoker);

    fixture = TestBed.createComponent(CommandPaletteComponent);
    palette = fixture.componentInstance;
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    stubNativeDialog(dialogEl());
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
    invoker.remove();
  });

  function dialogEl(): HTMLDialogElement {
    return fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
  }

  function searchEl(): HTMLInputElement {
    return fixture.nativeElement.querySelector(
      'input[role="combobox"]',
    ) as HTMLInputElement;
  }

  function isOpen(): boolean {
    return dialogEl().open || dialogEl().hasAttribute('open');
  }

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

  it('dismisses from the labelled close control', async () => {
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
    expect(el.querySelector('[role="option"]')).toBeNull();

    palette.openFrom(invoker);
    await TestBed.tick();
    expect(searchEl().getAttribute('aria-expanded')).toBe('true');
  });
});
