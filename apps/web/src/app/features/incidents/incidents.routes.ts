import { Routes } from '@angular/router';

import { IncidentCreatePage } from './pages/incident-create.page';
import { IncidentDetailPage } from './pages/incident-detail.page';
import { IncidentListPage } from './pages/incident-list.page';

export const INCIDENT_ROUTES: Routes = [
  { path: '', component: IncidentListPage },
  { path: 'new', component: IncidentCreatePage },
  { path: ':id', component: IncidentDetailPage },
];
