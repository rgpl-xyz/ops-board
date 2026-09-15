import { Routes } from '@angular/router';

import { ShellLayoutComponent } from './layout/shell-layout.component';

export const routes: Routes = [
  {
    path: '',
    component: ShellLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'incidents' },
      {
        path: 'incidents',
        loadChildren: () =>
          import('./features/incidents/incidents.routes').then(
            (m) => m.INCIDENT_ROUTES,
          ),
      },
      {
        path: 'services',
        loadChildren: () =>
          import('./features/services/services.routes').then(
            (m) => m.SERVICE_ROUTES,
          ),
      },
      { path: '**', redirectTo: 'incidents' },
    ],
  },
];
