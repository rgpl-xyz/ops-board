import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { IncidentSeverity } from '../../data-access';

@Component({
  selector: 'ob-severity-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [attr.data-severity]="severity()">{{
    severity()
  }}</span>`,
  styles: `
    .badge {
      display: inline-block;
      font-size: 0.82rem;
      padding: 0.1rem 0.35rem;
      border: 1px solid var(--ob-border);
      background: var(--ob-surface);
    }
    .badge[data-severity='Critical'] {
      border-color: var(--ob-danger, #8f1d1d);
      color: var(--ob-danger, #8f1d1d);
    }
    .badge[data-severity='High'] {
      border-color: var(--ob-warn, #8a4b12);
      color: var(--ob-warn, #8a4b12);
    }
  `,
})
export class SeverityBadgeComponent {
  readonly severity = input.required<IncidentSeverity>();
}
