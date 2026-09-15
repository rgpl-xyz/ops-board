import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'ob-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="confirm" (cancel)="onCancel($event)">
      <form method="dialog" class="confirm__form" (submit)="onSubmit($event)">
        <h2 class="confirm__title">{{ title() }}</h2>
        <p class="confirm__body">{{ body() }}</p>
        <div class="confirm__actions">
          <button
            type="submit"
            class="confirm__btn confirm__btn--cancel"
            value="cancel"
          >
            Cancel
          </button>
          <button
            #confirmBtn
            type="submit"
            class="confirm__btn"
            [class.confirm__btn--danger]="danger()"
            value="confirm"
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
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  readonly confirmLabel = input('Confirm');
  readonly danger = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly confirmBtn =
    viewChild<ElementRef<HTMLButtonElement>>('confirmBtn');

  private restoreFocusTo: HTMLElement | null = null;

  open(restoreFocusTo?: HTMLElement | null): void {
    this.restoreFocusTo =
      restoreFocusTo ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const el = this.dialog().nativeElement;
    if (!el.open) {
      el.showModal();
    }
    queueMicrotask(() => this.confirmBtn()?.nativeElement.focus());
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) {
      el.close();
    }
    this.restoreFocus();
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.dialog().nativeElement.close();
    this.cancelled.emit();
    this.restoreFocus();
  }

  protected onSubmit(event: Event): void {
    const submitter = (event as SubmitEvent).submitter as
      | HTMLButtonElement
      | null;
    const value = submitter?.value ?? 'cancel';
    if (value === 'confirm') {
      this.confirmed.emit();
    } else {
      this.cancelled.emit();
    }
    this.restoreFocus();
  }

  private restoreFocus(): void {
    const target = this.restoreFocusTo;
    this.restoreFocusTo = null;
    queueMicrotask(() => target?.focus());
  }
}
