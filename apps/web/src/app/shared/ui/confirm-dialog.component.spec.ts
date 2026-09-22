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
});
