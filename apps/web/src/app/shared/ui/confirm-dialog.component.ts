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
      border: 1px solid var(--ob-border);
      background: var(--ob-surface);
      color: var(--ob-ink);
      padding: 0;
      max-width: 24rem;
      width: calc(100% - 2rem);
    }
    .confirm::backdrop {
      background: rgb(28 27 25 / 45%);
    }
    .confirm__form {
      margin: 0;
      padding: 1rem;
    }
    .confirm__title {
      margin: 0 0 0.5rem;
      font-size: 1.05rem;
    }
    .confirm__body {
      margin: 0 0 0.85rem;
      color: var(--ob-muted);
      line-height: 1.45;
    }
    .confirm__actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.45rem;
    }
    .confirm__btn {
      appearance: none;
      border: 1px solid var(--ob-border);
      background: var(--ob-surface);
      color: var(--ob-ink);
      padding: 0.4rem 0.7rem;
      font: inherit;
      cursor: pointer;
    }
    .confirm__btn--danger {
      border-color: var(--ob-danger, #8f1d1d);
      color: var(--ob-danger, #8f1d1d);
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
