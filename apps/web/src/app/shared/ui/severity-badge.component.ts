import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { IncidentSeverity } from '../../data-access';

@Component({
  selector: 'ob-severity-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="sev" [attr.data-severity]="severity()" [attr.data-muted]="muted() || null"
    ><span class="sev__bar" aria-hidden="true"></span>{{ severity() }}</span
  >`,
  styles: `
    .sev {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-family: var(--ob-font-mono);
      font-size: 0.8rem;
      font-weight: 500;
      letter-spacing: 0.01em;
      color: var(--ob-ink-2);
      white-space: nowrap;
    }
    .sev__bar {
      width: 3px;
      height: 0.95em;
      border-radius: 1px;
      background: var(--ob-low);
    }
    .sev[data-severity='Critical'] {
      color: var(--ob-critical);
      font-weight: 600;
    }
    .sev[data-severity='Critical'] .sev__bar {
      background: var(--ob-critical);
    }
    .sev[data-severity='High'] {
      color: var(--ob-high);
      font-weight: 600;
    }
    .sev[data-severity='High'] .sev__bar {
      background: var(--ob-high);
    }
    .sev[data-severity='Medium'] .sev__bar {
      background: var(--ob-medium);
    }
    .sev[data-severity='Low'] {
      color: var(--ob-muted);
    }
    .sev[data-muted] {
      color: var(--ob-muted);
      font-weight: 500;
    }
    .sev[data-muted] .sev__bar {
      background: var(--ob-rule-strong);
    }
  `,
})
export class SeverityBadgeComponent {
  readonly severity = input.required<IncidentSeverity>();
  /** Resolved work recedes: the word stays, the colour does not. */
  readonly muted = input(false);
}
