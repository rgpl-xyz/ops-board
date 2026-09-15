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
      gap: 0.5rem;
      align-items: center;
      margin-top: 0.65rem;
      color: var(--ob-muted);
      font-size: 0.9rem;
    }
    .pager__btn {
      appearance: none;
      border: 1px solid var(--ob-border);
      background: var(--ob-surface);
      color: var(--ob-ink);
      padding: 0.35rem 0.65rem;
      font: inherit;
      cursor: pointer;
    }
    .pager__btn:disabled {
      opacity: 0.55;
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
