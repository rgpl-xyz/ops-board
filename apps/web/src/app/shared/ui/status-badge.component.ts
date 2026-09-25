import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { IncidentStatus } from '../../data-access';

@Component({
  selector: 'ob-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="status" [attr.data-status]="status()">{{
    status()
  }}</span>`,
  styles: `
    .status {
      font-family: var(--ob-font-mono);
      font-size: 0.8rem;
      font-weight: 500;
      letter-spacing: 0.01em;
      color: var(--ob-ink);
      white-space: nowrap;
    }
    .status[data-status='Resolved'] {
      font-weight: 400;
      color: var(--ob-muted);
    }
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<IncidentStatus>();
}
