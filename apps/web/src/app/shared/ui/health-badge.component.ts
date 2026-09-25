import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { ServiceHealth } from '../../data-access';

@Component({
  selector: 'ob-health-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="health" [attr.data-health]="health()"
    ><span class="health__bar" aria-hidden="true"></span>{{ health() }}</span
  >`,
  styles: `
    .health {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-family: var(--ob-font-mono);
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--ob-ink-2);
      white-space: nowrap;
    }
    .health__bar {
      width: 3px;
      height: 0.95em;
      border-radius: 1px;
      background: var(--ob-ok);
    }
    .health[data-health='Outage'] {
      color: var(--ob-critical);
      font-weight: 600;
    }
    .health[data-health='Outage'] .health__bar {
      background: var(--ob-critical);
    }
    .health[data-health='Degraded'] {
      color: var(--ob-high);
      font-weight: 600;
    }
    .health[data-health='Degraded'] .health__bar {
      background: var(--ob-high);
    }
  `,
})
export class HealthBadgeComponent {
  readonly health = input.required<ServiceHealth>();
}
