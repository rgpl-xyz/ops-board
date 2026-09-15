import { Routes } from '@angular/router';

import { ServiceDetailPage } from './pages/service-detail.page';
import { ServiceListPage } from './pages/service-list.page';

export const SERVICE_ROUTES: Routes = [
  { path: '', component: ServiceListPage },
  { path: ':id', component: ServiceDetailPage },
];
