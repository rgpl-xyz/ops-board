import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Stub page. */
@Component({
  selector: 'ob-incident-create-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Create incident</h1><p class="stub">Form arrives in 7.1.</p>`,
  styles: `.stub { color: var(--ob-muted); }`,
})
export class IncidentCreatePage {}
