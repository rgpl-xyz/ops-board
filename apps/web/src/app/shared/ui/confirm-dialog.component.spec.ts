import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  it('opens with showModal, focuses confirm, and restores focus on cancel', async () => {
    @Component({
      imports: [ConfirmDialogComponent],
      template: `
        <button type="button" #invoker id="invoker">Open</button>
        <ob-confirm-dialog
          #dlg
          title="Resolve incident?"
          body="This records resolution."
          confirmLabel="Confirm resolve"
          [danger]="true"
        />
      `,
    })
    class Host {
      // bound in template via #dlg
    }

    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();

    const invoker = fixture.nativeElement.querySelector(
      '#invoker',
    ) as HTMLButtonElement;
    invoker.focus();

    const dialogEl = fixture.nativeElement.querySelector(
      'dialog',
    ) as HTMLDialogElement;
    if (typeof dialogEl.showModal !== 'function') {
      dialogEl.showModal = vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      });
      dialogEl.close = vi.fn(function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      });
    }

    const dlgDebug = fixture.debugElement.query(
      (d) => d.componentInstance instanceof ConfirmDialogComponent,
    );
    const dlg = dlgDebug.componentInstance as ConfirmDialogComponent;

    let cancelled = false;
    dlg.cancelled.subscribe(() => {
      cancelled = true;
    });

    dlg.open(invoker);
    await fixture.whenStable();
    await Promise.resolve();

    expect(dialogEl.open || dialogEl.hasAttribute('open')).toBeTruthy();
    const confirmBtn = fixture.nativeElement.querySelector(
      'button[value="confirm"]',
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(confirmBtn);

    (fixture.nativeElement.querySelector(
      'button[value="cancel"]',
    ) as HTMLButtonElement).click();
    await fixture.whenStable();
    await Promise.resolve();
    await Promise.resolve();

    expect(cancelled).toBe(true);
    expect(document.activeElement).toBe(invoker);
  });

  it('emits confirmed when confirm is submitted', async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.componentRef.setInput('title', 'Leave?');
    fixture.componentRef.setInput('body', 'Leave this incident.');
    fixture.componentRef.setInput('confirmLabel', 'Leave');
    await fixture.whenStable();

    const dialogEl = fixture.nativeElement.querySelector(
      'dialog',
    ) as HTMLDialogElement;
    if (typeof dialogEl.showModal !== 'function') {
      dialogEl.showModal = vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      });
      dialogEl.close = vi.fn(function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      });
    }

    let confirmed = false;
    fixture.componentInstance.confirmed.subscribe(() => {
      confirmed = true;
    });

    fixture.componentInstance.open();
    await fixture.whenStable();
    (fixture.nativeElement.querySelector(
      'button[value="confirm"]',
    ) as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(confirmed).toBe(true);
  });
});
