import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { focusAfterRender, firstFocusable } from '../a11y/focus';

export interface ConfirmDialogOpenOptions {
  invoker?: HTMLElement | null;
  initialFocus?: 'cancel' | 'confirm';
  cancelFallback?: () => HTMLElement | null | undefined;
}

export interface ConfirmDialogSettleOptions {
  focusTarget: () => HTMLElement | null | undefined;
}

@Component({
  selector: 'ob-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      class="confirm"
      aria-labelledby="confirm-dialog-title"
      [attr.aria-describedby]="body() ? 'confirm-dialog-body' : null"
      (cancel)="onCancel($event)"
    >
      <form method="dialog" class="confirm__form" (submit)="onSubmit($event)">
        <h2 id="confirm-dialog-title" class="confirm__title">{{ title() }}</h2>
        @if (body()) {
          <p id="confirm-dialog-body" class="confirm__body">{{ body() }}</p>
        }
        @if (pending()) {
          <p #pendingStatus class="confirm__pending" role="status" tabindex="-1">
            Working…
          </p>
        }
        <div class="confirm__actions">
          <button
            type="submit"
            class="confirm__btn confirm__btn--cancel"
            value="cancel"
            [disabled]="pending()"
          >
            Cancel
          </button>
          <button
            #confirmBtn
            type="submit"
            class="confirm__btn"
            [class.confirm__btn--danger]="danger()"
            value="confirm"
            [disabled]="pending()"
          >
            {{ confirmLabel() }}
          </button>
        </div>
      </form>
    </dialog>
  `,
  styles: `
    .confirm {
      border: 1px solid var(--ob-rule-strong);
      border-radius: var(--ob-radius);
      background: var(--ob-surface);
      color: var(--ob-ink);
      padding: 0;
      max-width: 26rem;
      width: calc(100% - 2rem);
    }
    .confirm::backdrop {
      background: rgb(25 25 23 / 40%);
    }
    .confirm__form {
      margin: 0;
      padding: 1.25rem 1.25rem 1rem;
    }
    .confirm__title {
      margin: 0 0 0.5rem;
      font-size: 1.05rem;
      font-weight: 600;
    }
    .confirm__body {
      margin: 0 0 1.25rem;
      color: var(--ob-ink-2);
      line-height: 1.5;
    }
    .confirm__actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      padding-top: 0.9rem;
      border-top: 1px solid var(--ob-rule);
    }
    .confirm__btn {
      appearance: none;
      min-height: 2.25rem;
      padding: 0.4rem 0.9rem;
      border: 1px solid var(--ob-rule-strong);
      border-radius: var(--ob-radius);
      background: var(--ob-surface);
      color: var(--ob-ink);
      font: inherit;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
    }
    .confirm__btn:hover:not(:disabled) {
      border-color: var(--ob-ink-2);
    }
    .confirm__btn--danger {
      background: var(--ob-danger);
      border-color: var(--ob-danger);
      color: #fff;
    }
    .confirm__btn--danger:hover:not(:disabled) {
      background: #761616;
      border-color: #761616;
    }
    .confirm__btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
})
export class ConfirmDialogComponent {
  private readonly injector = inject(Injector);
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  readonly confirmLabel = input('Confirm');
  readonly danger = input(false);

  readonly confirmRequested = output<void>();
  readonly cancelled = output<void>();
  readonly pending = signal(false);

  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly confirmBtn =
    viewChild<ElementRef<HTMLButtonElement>>('confirmBtn');
  private readonly pendingStatus =
    viewChild<ElementRef<HTMLElement>>('pendingStatus');

  private invoker: HTMLElement | null = null;
  private cancelFallback: (() => HTMLElement | null | undefined) | null = null;

  open(options: ConfirmDialogOpenOptions = {}): void {
    this.invoker =
      options.invoker ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    this.cancelFallback = options.cancelFallback ?? null;
    this.pending.set(false);
    const el = this.dialog().nativeElement;
    if (!el.open) {
      el.showModal();
    }
    focusAfterRender(this.injector, () =>
      options.initialFocus === 'cancel'
        ? (el.querySelector('button[value="cancel"]') as HTMLButtonElement | null)
        : this.confirmBtn()?.nativeElement,
    );
  }

  settle(options: ConfirmDialogSettleOptions): void {
    this.pending.set(false);
    const el = this.dialog().nativeElement;
    if (el.open) {
      el.close();
    }
    focusAfterRender(this.injector, () =>
      firstFocusable([options.focusTarget()]),
    );
    this.clearFocusContext();
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    if (this.pending()) {
      return;
    }
    this.dismiss();
  }

  protected onSubmit(event: Event): void {
    const submitter = (event as SubmitEvent).submitter as
      | HTMLButtonElement
      | null;
    const value = submitter?.value ?? 'cancel';
    if (value === 'confirm') {
      event.preventDefault();
      if (this.pending()) {
        return;
      }
      this.pending.set(true);
      focusAfterRender(this.injector, () => this.pendingStatus()?.nativeElement);
      this.confirmRequested.emit();
    } else {
      event.preventDefault();
      if (!this.pending()) {
        this.dismiss();
      }
    }
  }

  private dismiss(): void {
    const target = firstFocusable([this.invoker, this.cancelFallback?.()]);
    const el = this.dialog().nativeElement;
    if (el.open) {
      el.close();
    }
    this.cancelled.emit();
    focusAfterRender(this.injector, () => target);
    this.clearFocusContext();
  }

  private clearFocusContext(): void {
    this.invoker = null;
    this.cancelFallback = null;
  }
}
