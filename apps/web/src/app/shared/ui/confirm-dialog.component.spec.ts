import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialogComponent } from './confirm-dialog.component';

function installDialogStubs(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal !== 'function') {
    dialog.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    dialog.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  }
}

describe('ConfirmDialogComponent', () => {
  it('names the dialog, focuses Cancel for destructive confirmation, and restores the invoker once', async () => {
    @Component({
      imports: [ConfirmDialogComponent],
      template: `
        <button type="button" #invoker id="invoker">Open</button>
        <ob-confirm-dialog #dlg title="Resolve incident?" body="This records resolution." confirmLabel="Confirm resolve" [danger]="true" />
      `,
    })
    class Host {}

    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    installDialogStubs(dialog);
    const invoker = fixture.nativeElement.querySelector('#invoker') as HTMLButtonElement;
    const dlg = fixture.debugElement.query(
      (d) => d.componentInstance instanceof ConfirmDialogComponent,
    ).componentInstance as ConfirmDialogComponent;
    const cancelled = vi.fn();
    dlg.cancelled.subscribe(cancelled);

    dlg.open({ invoker, initialFocus: 'cancel', cancelFallback: () => null });
    await TestBed.tick();

    expect(dialog.getAttribute('aria-labelledby')).toBe('confirm-dialog-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('confirm-dialog-body');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('button[value="cancel"]'));

    (fixture.nativeElement.querySelector('button[value="cancel"]') as HTMLButtonElement).click();
    await TestBed.tick();
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(invoker);

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('keeps focus in a pending dialog until its parent settles the outcome', async () => {
    await TestBed.configureTestingModule({ imports: [ConfirmDialogComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    document.body.append(fixture.nativeElement);
    fixture.componentRef.setInput('title', 'Leave?');
    fixture.componentRef.setInput('body', 'Leave this incident.');
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    installDialogStubs(dialog);
    const requested = vi.fn();
    fixture.componentInstance.confirmRequested.subscribe(requested);
    const fallback = document.createElement('button');
    fallback.type = 'button';
    document.body.append(fallback);

    fixture.componentInstance.open({ initialFocus: 'confirm' });
    await TestBed.tick();
    (fixture.nativeElement.querySelector('button[value="confirm"]') as HTMLButtonElement).click();
    await TestBed.tick();

    expect(requested).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.pending()).toBe(true);
    expect(dialog.open || dialog.hasAttribute('open')).toBe(true);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[role="status"]'));

    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(fixture.componentInstance.pending()).toBe(true);
    fixture.componentInstance.settle({ focusTarget: () => fallback });
    await TestBed.tick();

    expect(fixture.componentInstance.pending()).toBe(false);
    expect(document.activeElement).toBe(fallback);
    fallback.remove();
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  /// The component Phase 6 delivered has a multi-state lifecycle. These cases
  /// cover the states a parent depends on but the first two tests do not reach.
  describe('lifecycle states', () => {
    @Component({
      imports: [ConfirmDialogComponent],
      template: `
        <button type="button" id="invoker">Open</button>
        <button type="button" id="fallback">Fallback</button>
        <button type="button" id="outcome">Outcome</button>
        <ob-confirm-dialog
          title="Resolve incident?"
          body="This records resolution."
          confirmLabel="Confirm resolve"
          [danger]="true"
        />
      `,
    })
    class LifecycleHost {}

    async function setup() {
      await TestBed.configureTestingModule({
        imports: [LifecycleHost],
      }).compileComponents();
      const fixture = TestBed.createComponent(LifecycleHost);
      document.body.append(fixture.nativeElement);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const dialog = el.querySelector('dialog') as HTMLDialogElement;
      installDialogStubs(dialog);
      const dlg = fixture.debugElement.query(
        (d) => d.componentInstance instanceof ConfirmDialogComponent,
      ).componentInstance as ConfirmDialogComponent;

      return {
        fixture,
        dialog,
        dlg,
        invoker: el.querySelector('#invoker') as HTMLButtonElement,
        fallback: el.querySelector('#fallback') as HTMLButtonElement,
        outcome: el.querySelector('#outcome') as HTMLButtonElement,
        cancel: () => el.querySelector('button[value="cancel"]') as HTMLButtonElement,
        confirm: () => el.querySelector('button[value="confirm"]') as HTMLButtonElement,
        working: () => el.querySelector('.confirm__pending') as HTMLElement | null,
        teardown: () => {
          fixture.destroy();
          fixture.nativeElement.remove();
        },
      };
    }

    it('disables both controls and focuses a working status once confirmed', async () => {
      const t = await setup();
      const requested = vi.fn();
      t.dlg.confirmRequested.subscribe(requested);

      t.dlg.open({ invoker: t.invoker, initialFocus: 'cancel' });
      await TestBed.tick();
      expect(t.working()).toBeNull();

      t.confirm().click();
      await TestBed.tick();
      t.fixture.detectChanges();

      expect(requested).toHaveBeenCalledTimes(1);
      expect(t.dlg.pending()).toBe(true);
      expect(t.dialog.open || t.dialog.hasAttribute('open')).toBeTruthy();
      expect(t.cancel().disabled).toBe(true);
      expect(t.confirm().disabled).toBe(true);

      const working = t.working();
      expect(working).not.toBeNull();
      expect(working!.getAttribute('role')).toBe('status');
      expect(working!.getAttribute('tabindex')).toBe('-1');
      expect(document.activeElement).toBe(working);

      t.teardown();
    });

    it('ignores Escape while an action is in flight', async () => {
      const t = await setup();
      const cancelled = vi.fn();
      t.dlg.cancelled.subscribe(cancelled);

      t.dlg.open({ invoker: t.invoker, initialFocus: 'cancel' });
      await TestBed.tick();
      t.confirm().click();
      await TestBed.tick();

      const escape = new Event('cancel', { cancelable: true });
      t.dialog.dispatchEvent(escape);
      await TestBed.tick();

      expect(escape.defaultPrevented).toBe(true);
      expect(cancelled).not.toHaveBeenCalled();
      expect(t.dialog.open || t.dialog.hasAttribute('open')).toBeTruthy();
      expect(t.dlg.pending()).toBe(true);

      t.teardown();
    });

    it('settles to the outcome target and stays there if settled again', async () => {
      const t = await setup();
      const cancelled = vi.fn();
      t.dlg.cancelled.subscribe(cancelled);

      t.dlg.open({ invoker: t.invoker, initialFocus: 'cancel' });
      await TestBed.tick();
      t.confirm().click();
      await TestBed.tick();

      t.dlg.settle({ focusTarget: () => t.outcome });
      await TestBed.tick();

      expect(t.dlg.pending()).toBe(false);
      expect(t.dialog.open || t.dialog.hasAttribute('open')).toBeFalsy();
      expect(document.activeElement).toBe(t.outcome);

      t.dlg.settle({ focusTarget: () => t.outcome });
      await TestBed.tick();

      expect(document.activeElement).toBe(t.outcome);
      expect(cancelled).not.toHaveBeenCalled();

      t.teardown();
    });

    it('separates a cancellation from a confirmation', async () => {
      const t = await setup();
      const requested = vi.fn();
      const cancelled = vi.fn();
      t.dlg.confirmRequested.subscribe(requested);
      t.dlg.cancelled.subscribe(cancelled);

      t.dlg.open({ invoker: t.invoker, initialFocus: 'cancel' });
      await TestBed.tick();
      t.cancel().click();
      await TestBed.tick();

      expect(cancelled).toHaveBeenCalledTimes(1);
      expect(requested).not.toHaveBeenCalled();
      expect(t.dlg.pending()).toBe(false);
      expect(t.dialog.open || t.dialog.hasAttribute('open')).toBeFalsy();

      t.teardown();
    });

    it('falls back to a supplied target when the invoker has gone', async () => {
      const t = await setup();

      t.dlg.open({
        invoker: t.invoker,
        initialFocus: 'cancel',
        cancelFallback: () => t.fallback,
      });
      await TestBed.tick();
      t.invoker.remove();

      t.cancel().click();
      await TestBed.tick();

      expect(document.activeElement).toBe(t.fallback);
      expect(document.activeElement).not.toBe(document.body);

      t.teardown();
    });
  });
});
