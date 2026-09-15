import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { IncidentStatus } from '../../data-access';

@Component({
  selector: 'ob-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [attr.data-status]="status()">{{
    status()
  }}</span>`,
  styles: `
    .badge {
      display: inline-block;
      font-size: 0.82rem;
      padding: 0.1rem 0.35rem;
      border: 1px solid var(--ob-border);
      background: var(--ob-surface);
    }
    .badge[data-status='Resolved'] {
      opacity: 0.8;
    }
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<IncidentStatus>();
}
