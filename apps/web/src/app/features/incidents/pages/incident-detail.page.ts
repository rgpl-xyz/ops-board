import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Stub page. */
@Component({
  selector: 'ob-incident-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Incident</h1><p class="stub">Detail arrives in 8.1.</p>`,
  styles: `.stub { color: var(--ob-muted); }`,
})
export class IncidentDetailPage {}
