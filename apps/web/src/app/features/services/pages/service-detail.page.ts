import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Stub page. */
@Component({
  selector: 'ob-service-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Service</h1><p class="stub">Detail arrives in 13.1.</p>`,
  styles: `.stub { color: var(--ob-muted); }`,
})
export class ServiceDetailPage {}
