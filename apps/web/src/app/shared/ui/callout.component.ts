import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type CalloutVariant =
  | 'loading'
  | 'empty'
  | 'error'
  | 'forbidden'
  | 'conflict'
  | 'info';

export type CalloutSemantic = 'quiet' | 'status' | 'alert';

@Component({
  selector: 'ob-callout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="callout"
      [class.callout--loading]="variant() === 'loading'"
      [class.callout--empty]="variant() === 'empty'"
      [class.callout--error]="variant() === 'error' || variant() === 'forbidden'"
      [class.callout--conflict]="variant() === 'conflict'"
      [class.callout--info]="variant() === 'info'"
      [attr.role]="role()"
      [attr.aria-live]="semantic() === 'status' ? 'polite' : null"
    >
      <ng-content />
    </div>
  `,
  styles: `
    .callout {
      margin: 0 0 1rem;
      padding: 0.6rem 0.85rem;
      border-left: 3px solid var(--ob-rule-strong);
      background: color-mix(in srgb, var(--ob-rule) 30%, transparent);
      color: var(--ob-ink-2);
      font-size: 0.92rem;
      line-height: 1.5;
    }
    .callout--loading {
      border-left-color: var(--ob-rule);
      background: none;
      padding-left: 0;
      border-left-width: 0;
      color: var(--ob-muted);
      font-family: var(--ob-font-mono);
      font-size: 0.8rem;
      letter-spacing: 0.01em;
    }
    .callout--empty {
      padding: 0.9rem 0;
      border-left: 0;
      border-bottom: 1px solid var(--ob-rule);
      background: none;
      color: var(--ob-muted);
    }
    .callout--info {
      color: var(--ob-muted);
    }
    .callout--error {
      border-left-color: var(--ob-danger);
      background: var(--ob-danger-bg);
      color: var(--ob-danger);
    }
    .callout--conflict {
      border-left-width: 4px;
      border-left-color: var(--ob-critical);
      background: var(--ob-danger-bg);
      color: var(--ob-ink);
      padding: 0.85rem 1rem;
      font-weight: 500;
    }
    .callout--conflict::before {
      content: 'Conflict';
      display: block;
      margin-bottom: 0.35rem;
      font-family: var(--ob-font-mono);
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ob-critical);
    }
  `,
})
export class CalloutComponent {
  readonly variant = input<CalloutVariant>('info');
  readonly semantic = input<CalloutSemantic>('quiet');

  protected role(): 'status' | 'alert' | null {
    switch (this.semantic()) {
      case 'status':
        return 'status';
      case 'alert':
        return 'alert';
      default:
        return null;
    }
  }
}
