import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ob-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <div class="page-header__text">
        <ng-content select="[crumb]" />
        <div class="page-header__line">
          <h1
            class="page-header__title"
            data-ob-route-focus
            tabindex="-1"
          >
            {{ title() }}
          </h1>
          @if (count() !== null) {
            <span class="page-header__count" aria-hidden="true">{{ count() }}</span>
          }
        </div>
      </div>
      <div class="page-header__actions">
        <ng-content select="[actions]" />
      </div>
    </header>
  `,
  styles: `
    .page-header {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1rem;
      align-items: flex-end;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }
    .page-header__text {
      min-width: 0;
    }
    .page-header__line {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
    }
    .page-header__title {
      margin: 0;
      font-size: 1.35rem;
      font-weight: 600;
      line-height: 1.2;
      letter-spacing: -0.015em;
    }
    .page-header__title:focus {
      outline: none;
    }
    .page-header__title:focus-visible {
      outline: 2px solid var(--ob-focus);
      outline-offset: 3px;
    }
    .page-header__count {
      font-family: var(--ob-font-mono);
      font-size: 1.9rem;
      font-weight: 500;
      line-height: 1;
      letter-spacing: -0.03em;
      color: var(--ob-ink-2);
      font-variant-numeric: tabular-nums;
    }
    .page-header__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 1rem;
    }
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  /** Shown beside the title; the same total is announced by the list's pagination. */
  readonly count = input<number | null>(null);
}
