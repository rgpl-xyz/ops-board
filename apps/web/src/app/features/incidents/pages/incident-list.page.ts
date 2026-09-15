import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Stub page. */
@Component({
  selector: 'ob-incident-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Incidents</h1><p class="stub">List arrives in 6.1.</p>`,
  styles: `.stub { color: var(--ob-muted); }`,
})
export class IncidentListPage {}
