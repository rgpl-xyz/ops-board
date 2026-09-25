import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'ob-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pager" role="navigation" [attr.aria-label]="label()">
      <button
        type="button"
        class="pager__btn"
        [disabled]="!canPrev()"
        (click)="previous.emit()"
      >
        Previous
      </button>
      <span class="pager__status"
        >Page {{ page() }} of {{ totalPages() }}{{ totalSuffix() }}</span
      >
      <button
        type="button"
        class="pager__btn"
        [disabled]="!canNext()"
        (click)="next.emit()"
      >
        Next
      </button>
    </div>
  `,
  styles: `
    .pager {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      margin-top: 1rem;
      color: var(--ob-muted);
      font-size: 0.85rem;
    }
    .pager__status {
      font-family: var(--ob-font-mono);
      font-size: 0.78rem;
      font-variant-numeric: tabular-nums;
    }
    .pager__btn {
      appearance: none;
      min-height: 2rem;
      padding: 0.3rem 0.75rem;
      border: 1px solid var(--ob-rule-strong);
      border-radius: var(--ob-radius);
      background: var(--ob-surface);
      color: var(--ob-ink);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .pager__btn:hover:not(:disabled) {
      border-color: var(--ob-ink-2);
    }
    .pager__btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `,
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly totalCount = input<number | null>(null);
  readonly label = input('Pagination');

  readonly previous = output<void>();
  readonly next = output<void>();

  protected readonly canPrev = computed(() => this.page() > 1);
  protected readonly canNext = computed(
    () => this.page() < this.totalPages() && this.totalPages() > 0,
  );
  protected readonly totalSuffix = computed(() => {
    const total = this.totalCount();
    return total === null || total === undefined ? '' : ` · ${total} total`;
  });
}
