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
  // ✅ EP v3: Portale Dipendenti STANDALONE — senza shell CRM condivisa (no sidebar, no topbar gestionale)
  // Renderizza solo il portalino dedicato del dipendente.
  {
    path: 'portale-dipendenti',
    loadComponent: () =>
      import('./section-page').then((module) => module.SectionPageComponent),
    title: 'Portale Dipendenti | Audiomax',
    data: {
      sectionId: 'employee-portal',
      standalonePortal: true,
    },
  },
  ...crmSections
    // route 'portale-dipendenti' la gestiamo a mano sopra in standalone,
    // quindi la escludiamo dalla mappa standard che usa la shell gestionale.
    .filter((s) => s.id !== 'employee-portal')
    .map((section) => ({
      path: section.route,
      loadComponent: () =>
        import('./section-page').then((module) => module.SectionPageComponent),
      title: `Audiomax CRM | ${section.label}`,
      data: {
        sectionId: section.id,
        standalonePortal: false,
      },
    })),
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
