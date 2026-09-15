import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Stub page. */
@Component({
  selector: 'ob-service-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Services</h1><p class="stub">List arrives in 12.1.</p>`,
  styles: `.stub { color: var(--ob-muted); }`,
})
export class ServiceListPage {}
