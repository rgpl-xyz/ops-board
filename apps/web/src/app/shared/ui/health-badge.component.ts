import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { ServiceHealth } from '../../data-access';

@Component({
  selector: 'ob-health-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [attr.data-health]="health()">{{
    health()
  }}</span>`,
  styles: `
    .badge {
      display: inline-block;
      font-size: 0.82rem;
      padding: 0.1rem 0.35rem;
      border: 1px solid var(--ob-border);
      background: var(--ob-surface);
    }
    .badge[data-health='Outage'] {
      border-color: var(--ob-danger, #8f1d1d);
      color: var(--ob-danger, #8f1d1d);
    }
    .badge[data-health='Degraded'] {
      border-color: var(--ob-warn, #8a4b12);
      color: var(--ob-warn, #8a4b12);
    }
  `,
})
export class HealthBadgeComponent {
  readonly health = input.required<ServiceHealth>();
}
