import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type CalloutVariant =
  | 'loading'
  | 'empty'
  | 'error'
  | 'forbidden'
  | 'conflict'
  | 'info';

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
    >
      <ng-content />
    </div>
  `,
  styles: `
    .callout {
      border: 1px solid var(--ob-border);
      background: var(--ob-surface);
      padding: 0.65rem 0.75rem;
      margin: 0 0 0.75rem;
      color: var(--ob-ink);
    }
    .callout--loading,
    .callout--empty,
    .callout--info {
      color: var(--ob-muted);
    }
    .callout--error {
      background: var(--ob-danger-bg, #f6e4e4);
      border-color: var(--ob-danger-border, #e0b4b4);
      color: var(--ob-danger, #8f1d1d);
    }
    .callout--conflict {
      background: var(--ob-warn-bg, #f7ead9);
      border-color: var(--ob-warn-border, #e0c9a8);
      color: var(--ob-warn, #8a4b12);
    }
  `,
})
export class CalloutComponent {
  readonly variant = input<CalloutVariant>('info');

  protected role(): 'status' | 'alert' {
    const v = this.variant();
    return v === 'error' || v === 'forbidden' || v === 'conflict'
      ? 'alert'
      : 'status';
  }
}
