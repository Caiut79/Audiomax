import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';

type AuthMode = 'login' | 'register';

/**
 * Pagina di accesso al gestionale.
 * Due modalità: login e registrazione di una nuova azienda.
 * La registrazione non prevede verifica email: si conferma l'operazione
 * ridigitando un codice numerico generato dalla pagina (verifica anti-bot).
 */
@Component({
  selector: 'app-login-page',
  imports: [],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly themeService = inject(ThemeService);

  protected readonly mode = signal<AuthMode>('login');
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  /** True quando la tabella app_accounts non è raggiungibile. */
  protected readonly backendMissing = computed(() => !this.auth.authBackendReady());

  protected readonly currentTheme = this.themeService.theme;

  /** Punti di forza mostrati nel pannello identità. */
  protected readonly features = [
    {
      icon: '📇',
      title: 'Contatti e preventivi',
      detail: 'Anagrafiche, trattative e documenti nella stessa scheda.',
    },
    {
      icon: '🛠️',
      title: 'Agenda e servizio tecnico',
      detail: 'Interventi, ticket e materiali usati, sempre tracciati.',
    },
    {
      icon: '🧾',
      title: 'Cassa e magazzino',
      detail: 'Incassi, DDT e disponibilità aggiornati in tempo reale.',
    },
    {
      icon: '🧑‍🔧',
      title: 'Portale dipendenti',
      detail: 'Area mobile dedicata ai tecnici, collegata al gestionale.',
    },
  ];

  // ── Campi login ──
  /** Email del titolare oppure username di un accesso staff dedicato. */
  protected readonly loginIdentifier = signal('');
  protected readonly loginPassword = signal('');
  protected readonly loginPasswordVisible = signal(false);
  /** True = sessione persistente ("Rimani connesso"), false = solo scheda corrente. */
  protected readonly rememberMe = signal(true);

  // ── Campi registrazione ──
  protected readonly companyName = signal('');
  protected readonly registerEmail = signal('');
  protected readonly registerPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly humanInput = signal('');
  protected readonly humanCode = signal('');
  protected readonly registerPasswordVisible = signal(false);

  protected readonly passwordsMatch = computed(
    () => this.registerPassword().length > 0 && this.registerPassword() === this.confirmPassword(),
  );
  protected readonly passwordStrength = computed(() => {
    const password = this.registerPassword();
    const score = [
      password.length >= 8,
      /[A-Z]/.test(password),
      /[0-9]/.test(password),
      /[^A-Za-z0-9]/.test(password),
    ].filter(Boolean).length;

    if (!password.length) {
      return { label: '—', level: 0 };
    }
    if (score <= 1) {
      return { label: 'Debole', level: 1 };
    }
    if (score === 2) {
      return { label: 'Media', level: 2 };
    }
    if (score === 3) {
      return { label: 'Buona', level: 3 };
    }
    return { label: 'Forte', level: 4 };
  });

  constructor() {
    this.humanCode.set(this.auth.createHumanChallenge());
  }

  // ==========================================================================
  // Azioni di interfaccia
  // ==========================================================================

  protected setMode(mode: AuthMode): void {
    if (this.mode() === mode) {
      return;
    }

    this.mode.set(mode);
    this.errorMessage.set('');
    this.successMessage.set('');

    if (mode === 'register' && !this.humanCode()) {
      this.humanCode.set(this.auth.createHumanChallenge());
    }
  }

  protected toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  protected regenerateHumanCode(): void {
    this.humanCode.set(this.auth.createHumanChallenge());
    this.humanInput.set('');
  }

  protected toggleLoginPassword(): void {
    this.loginPasswordVisible.update((value) => !value);
  }

  protected toggleRegisterPassword(): void {
    this.registerPasswordVisible.update((value) => !value);
  }

  protected async submitLogin(): Promise<void> {
    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    const result = await this.auth.login(this.loginIdentifier(), this.loginPassword(), this.rememberMe());

    this.submitting.set(false);

    if (!result.ok) {
      this.errorMessage.set(result.message ?? 'Accesso non riuscito.');
      return;
    }

    this.enterApplication();
  }

  protected async submitRegister(): Promise<void> {
    if (this.submitting()) {
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');

    if (this.registerPassword() !== this.confirmPassword()) {
      this.errorMessage.set('Le due password non coincidono.');
      return;
    }

    if (!this.auth.verifyHumanChallenge(this.humanCode(), this.humanInput())) {
      this.errorMessage.set('Codice di verifica non corretto: ricontrolla le 4 cifre.');
      this.regenerateHumanCode();
      return;
    }

    this.submitting.set(true);

    const result = await this.auth.register({
      companyName: this.companyName(),
      email: this.registerEmail(),
      password: this.registerPassword(),
    });

    this.submitting.set(false);

    if (!result.ok) {
      this.errorMessage.set(result.message ?? 'Registrazione non riuscita.');
      this.regenerateHumanCode();
      return;
    }

    this.successMessage.set('Account creato. Preparo il gestionale…');
    this.enterApplication();
  }

  /**
   * Dopo l'accesso ricarichiamo completamente l'applicazione: così tutti i
   * servizi ripartono con l'azienda (tenant) corretta e senza dati precedenti.
   */
  private enterApplication(): void {
    window.location.assign('/dashboard');
  }
}
