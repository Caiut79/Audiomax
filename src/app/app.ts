import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { AudiomaxDataService } from './audiomax-data.service';
import { AuthService } from './auth.service';
import { BrowserStorageService } from './browser-storage.service';
import { CompanyProfileRecord } from './crm-runtime-data';
import { crmSections } from './crm-sections';
import { ThemeService } from './theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly data = inject(AudiomaxDataService);
  private readonly auth = inject(AuthService);
  private readonly storage = inject(BrowserStorageService);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly rootRoute = inject(ActivatedRoute);
  private readonly sidebarStorageKey = 'audiomax-sidebar-collapsed';

  // ✅ EP v3: Portale Dipendenti STANDALONE (via route data standalonePortal === true).
  // Quando TRUE: nascondiamo completamente sidebar + topbar + workspace del CRM:
  // il dipendente vede SOLO il portalino dedicato (NIENTE gestionale completo!).
  protected readonly hideCrmShell = signal(false);

  protected readonly sections = crmSections;
  // Menu laterale: collassato di default (stato retrattile).
  // Al passaggio del mouse sulla sidebar si espande temporaneamente
  // se l'utente non l'ha bloccata in modalità espansa con il toggle.
  protected readonly sidebarCollapsed = signal(true);
  protected readonly sidebarHover = signal(false);
  protected readonly mobileMenuOpen = signal(false);

  protected readonly navGroups = [
    {
      key: 'sales',
      label: 'Vendite',
      icon: 'VE',
      ids: ['clienti', 'preventivi', 'cassa', 'ecommerce'],
      sections: ['clienti', 'preventivi', 'cassa', 'ecommerce'].flatMap(
        (id) => crmSections.filter((s) => s.id === id),
      ),
    },
    {
      key: 'operations',
      label: 'Interventi',
      icon: 'OP',
      ids: ['agenda', 'servizi', 'tecnico'],
      sections: ['agenda', 'servizi', 'tecnico'].flatMap(
        (id) => crmSections.filter((s) => s.id === id),
      ),
    },
    {
      key: 'logistics',
      label: 'Materiali e consegne',
      icon: 'MA',
      ids: ['magazzino', 'ddt'],
      sections: ['magazzino', 'ddt'].flatMap(
        (id) => crmSections.filter((s) => s.id === id),
      ),
    },
    {
      key: 'management',
      label: 'Azienda',
      icon: 'GE',
      ids: ['dipendenti', 'orari', 'spese', 'report'],
      sections: ['dipendenti', 'orari', 'spese', 'report'].flatMap(
        (id) => crmSections.filter((s) => s.id === id),
      ),
    },
    {
      key: 'system',
      label: 'Portale e sistema',
      icon: 'SY',
      // ✅ Il portale dipendenti è accessibile solo dal link pubblico (/portale-dipendenti),
      //    non dalla navigazione del gestionale: evita di restare "intrappolati" nel portale.
      ids: ['registro', 'portal-comms-admin', 'impostazioni'],
      sections: ['registro', 'portal-comms-admin', 'impostazioni'].flatMap(
        (id) => crmSections.filter((s) => s.id === id),
      ),
    },
  ];

  /**
   * Gruppi di navigazione effettivamente visibili all'utente collegato.
   * Il registro attività è riservato al titolare: il profilo operativo non lo vede.
   */
  protected readonly visibleNavGroups = computed(() =>
    this.navGroups
      .map((group) => ({
        ...group,
        sections: group.sections.filter((section) => this.canAccessSection(section.id)),
      }))
      .filter((group) => group.sections.length > 0),
  );

  protected readonly topMetrics = computed(() => [
    {
      label: 'Contatti',
      value: `${this.data.activeClients()}`,
    },
    {
      label: 'Preventivi',
      value: `${this.data.openQuotes()}`,
    },
    {
      label: 'Agenda',
      value: `${this.data.plannedAppointments()}`,
    },
    {
      label: 'Pipeline',
      value: `€${this.data.projectedRevenue().toLocaleString('it-IT')}`,
    },
  ]);

  protected readonly currentTheme = this.themeService.theme;

  // ===== Sessione attiva: azienda, ruolo e uscita =====
  protected readonly companyName = this.auth.companyName;
  protected readonly accountEmail = this.auth.accountEmail;
  protected readonly roleLabel = this.auth.roleLabel;
  protected readonly isSuperAdmin = this.auth.isSuperAdmin;
  /** True se l'accesso è del titolare (o super admin): vede anche il registro attività. */
  protected readonly canViewAuditRegister = this.auth.canViewAuditRegister;

  /**
   * Decide se la voce di menu può essere mostrata all'utente collegato.
   * Al momento l'unica sezione riservata è il registro attività (solo titolare).
   */
  private canAccessSection(sectionId: string): boolean {
    if (sectionId === 'registro') {
      return this.canViewAuditRegister();
    }
    return true;
  }

  // ========================================================================
  // ONBOARDING PRIMO ACCESSO · dati azienda
  // ========================================================================
  /** Profilo azienda (anagrafica usata anche per la fatturazione). */
  protected readonly companyProfile = this.data.companyProfile;
  /** Chiave di persistenza dell'onboarding, isolata per azienda (tenant). */
  private readonly onboardingStorageKey = 'audiomax-onboarding-dismissed';
  private readonly onboardingKey = computed(() => {
    const tenant = this.auth.tenantId();
    return tenant ? `${this.onboardingStorageKey}:${tenant}` : this.onboardingStorageKey;
  });
  /** True se l'utente ha scelto "Inserisci successivamente" per questa azienda. */
  protected readonly onboardingDismissed = signal(
    this.storage.getItem(this.onboardingKey()) === '1',
  );
  protected readonly onboardingFeedback = signal('');
  /**
   * Mostra il pop-up dei dati aziendali al primo accesso di un'azienda cliente
   * (non super admin) finché la ragione sociale non è stata inserita.
   */
  protected readonly showCompanyOnboarding = computed(
    () =>
      !this.hideCrmShell() &&
      this.auth.isAuthenticated() &&
      !this.auth.isSuperAdmin() &&
      !this.onboardingDismissed() &&
      !this.companyProfile().legalName.trim(),
  );

  protected readonly globalSearchOpen = signal(false);
  protected readonly globalSearchQuery = signal('');
  protected readonly globalSearchSelectedIndex = signal(0);
  protected readonly globalSearchResults = computed(() =>
    this.data.searchRecords(this.globalSearchQuery()),
  );

  protected readonly todayLabel = new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  constructor() {
    const persisted = this.storage.getItem(this.sidebarStorageKey);
    if (persisted === '1') {
      this.sidebarCollapsed.set(true);
    }

    // ✅ EP v3: aggiorna hideCrmShell su NavigationEnd (la route lazy-loaded ha data.standalonePortal sulla leaf)
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        // Attraversa tutta la gerarchia ActivatedRoute fino alla foglia per trovare 'standalonePortal'
        let child: ActivatedRoute | null = this.rootRoute.firstChild;
        let standalone = false;
        while (child) {
          if ((child.snapshot.data as any)?.standalonePortal === true) {
            standalone = true;
          }
          child = child.firstChild;
        }
        // Controllo diretto: URL inizia per /portale-dipendenti
        if (!standalone && this.router.url.startsWith('/portale-dipendenti')) {
          standalone = true;
        }
        this.hideCrmShell.set(standalone);
      });

    // Verifica in background che l'account collegato sia ancora attivo:
    // se il super admin lo ha sospeso o eliminato, la sessione viene chiusa.
    if (this.auth.isAuthenticated()) {
      void this.auth.refreshCurrentAccount().then((valid) => {
        if (!valid) {
          void this.router.navigateByUrl('/login');
        }
      });
    }
  }

  /** Chiude la sessione e riporta alla pagina di accesso. */
  protected logout(): void {
    this.auth.logout();
    window.location.assign('/login');
  }

  /** Aggiorna un campo testuale del profilo azienda dal pop-up di onboarding. */
  protected updateOnboardingField(field: keyof CompanyProfileRecord, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
    if (!target) return;
    this.data.updateCompanyProfile({ [field]: target.value });
  }

  /** Salva i dati aziendali inseriti nel pop-up di primo accesso. */
  protected saveCompanyOnboarding(): void {
    if (!this.companyProfile().legalName.trim()) {
      this.onboardingFeedback.set('Inserisci almeno la ragione sociale per salvare i dati aziendali.');
      return;
    }
    this.onboardingFeedback.set('');
    this.dismissCompanyOnboarding();
  }

  /** Rimanda la compilazione: porta l'utente in Impostazioni → Dati Azienda. */
  protected skipCompanyOnboarding(): void {
    this.dismissCompanyOnboarding();
    this.storage.setItem('audiomax_settings_last_tab', 'azienda');
    void this.router.navigateByUrl('/impostazioni');
  }

  /** Memorizza la scelta dell'utente per non riproporre il pop-up. */
  private dismissCompanyOnboarding(): void {
    this.storage.setItem(this.onboardingKey(), '1');
    this.onboardingDismissed.set(true);
  }

  protected toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  protected toggleSidebar(): void {
    if (window.innerWidth <= 768) {
      this.mobileMenuOpen.update((v) => !v);
    } else {
      this.sidebarCollapsed.update((v) => {
        const next = !v;
        this.storage.setItem(this.sidebarStorageKey, next ? '1' : '0');
        return next;
      });
    }
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  protected openGlobalSearch(): void {
    this.globalSearchOpen.set(true);
    this.globalSearchSelectedIndex.set(0);
    queueMicrotask(() => {
      const input = document.getElementById('global-search-input') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  protected closeGlobalSearch(): void {
    this.globalSearchOpen.set(false);
    this.globalSearchQuery.set('');
    this.globalSearchSelectedIndex.set(0);
  }

  protected updateGlobalSearchQuery(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.globalSearchQuery.set(target?.value ?? '');
    this.globalSearchSelectedIndex.set(0);
  }

  @HostListener('window:keydown', ['$event'])
  protected handleGlobalKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (!this.globalSearchOpen()) {
        this.openGlobalSearch();
      }
      return;
    }

    if (!this.globalSearchOpen()) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeGlobalSearch();
      return;
    }

    const results = this.globalSearchResults();
    if (!results.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.globalSearchSelectedIndex.update((value) => Math.min(value + 1, results.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.globalSearchSelectedIndex.update((value) => Math.max(value - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = results[this.globalSearchSelectedIndex()] ?? results[0];
      // ✅ Fix REV-010: Promise<boolean> navigateByUrl con .catch per errori
      //    invece void puro silenzia rejection route invalida / guard rifiuta.
      void this.router
        .navigateByUrl(selected.route)
        .catch((err) => console.warn('[Global Search] Navigazione fallita:', err));
      this.closeGlobalSearch();
    }
  }
}
