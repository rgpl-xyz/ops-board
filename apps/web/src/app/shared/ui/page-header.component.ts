import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ob-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <div class="page-header__text">
        @if (eyebrow()) {
          <p class="page-header__eyebrow">{{ eyebrow() }}</p>
        }
        <h1 class="page-header__title">{{ title() }}</h1>
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
      gap: 0.75rem;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.85rem;
    }
    .page-header__eyebrow {
      margin: 0 0 0.2rem;
      color: var(--ob-muted);
      font-size: 0.85rem;
    }
    .page-header__title {
      margin: 0;
      font-size: 1.25rem;
      letter-spacing: -0.02em;
    }
    .page-header__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input<string | null>(null);
}
