import { Routes } from '@angular/router';

import { crmSections } from './crm-sections';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./dashboard-page').then((module) => module.DashboardPageComponent),
    title: 'Audiomax CRM | Dashboard',
  },
  {
    path: 'privacy-consent/:clientId',
    loadComponent: () =>
      import('./privacy-consent-page').then((module) => module.PrivacyConsentPageComponent),
    title: 'Audiomax CRM | Consensi Privacy',
  },
  ...crmSections.map((section) => ({
    path: section.route,
    loadComponent: () =>
      import('./section-page').then((module) => module.SectionPageComponent),
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
