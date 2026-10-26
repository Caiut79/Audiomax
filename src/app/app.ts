import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { AudiomaxDataService } from './audiomax-data.service';
import { BrowserStorageService } from './browser-storage.service';
import { crmSections } from './crm-sections';
import { SupabaseService } from './supabase.service';
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
  private readonly storage = inject(BrowserStorageService);
  private readonly supabase = inject(SupabaseService);
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
      ids: ['portal-comms-admin', 'employee-portal', 'impostazioni'],
      sections: ['portal-comms-admin', 'employee-portal', 'impostazioni'].flatMap(
        (id) => crmSections.filter((s) => s.id === id),
      ),
    },
  ];

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

  protected readonly connectionLabel = this.supabase.connectionLabel;
  protected readonly connectionState = this.supabase.connectionState;
  protected readonly currentTheme = this.themeService.theme;

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
