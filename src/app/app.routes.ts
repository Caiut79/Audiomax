import { Routes } from '@angular/router';

import { crmSections } from './crm-sections';
import { DashboardPageComponent } from './dashboard-page';
import { PrivacyConsentPageComponent } from './privacy-consent-page';
import { SectionPageComponent } from './section-page';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'dashboard',
    component: DashboardPageComponent,
    title: 'Audiomax CRM | Dashboard',
  },
  {
    path: 'privacy-consent/:clientId',
    component: PrivacyConsentPageComponent,
    title: 'Audiomax CRM | Consensi Privacy',
  },
  ...crmSections.map((section) => ({
    path: section.route,
    component: SectionPageComponent,
    title: `Audiomax CRM | ${section.label}`,
    data: {
      sectionId: section.id,
    },
  })),
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
