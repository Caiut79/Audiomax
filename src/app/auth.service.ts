import { Injectable, computed, inject, signal } from '@angular/core';

import { BrowserStorageService } from './browser-storage.service';
import { supabaseConfig } from './supabase.config';
import { SupabaseService } from './supabase.service';

/** Ruolo dell'account che accede al gestionale. */
export type AppAccountRole = 'azienda' | 'super-admin';
/** Stato del profilo: attivo, sospeso dal super admin oppure eliminato. */
export type AppAccountStatus = 'attiva' | 'sospesa' | 'eliminata';
/**
 * Ruolo operativo all'interno dell'azienda:
 * - `titolare`  → profilo principale creato in fase di attivazione, vede tutto
 *                 incluso il registro attività;
 * - `operativo` → accesso creato dall'azienda per un dipendente, uso operativo
 *                 senza registro attività.
 */
export type AppStaffRole = 'titolare' | 'operativo';

/** Account (azienda o super admin) letto dalla tabella public.app_accounts. */
export interface AppAccountRecord {
  id: string;
  companyName: string;
  email: string;
  role: AppAccountRole;
  status: AppAccountStatus;
  licenseExpiresAt: string | null;
  licenseNotes: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  loginCount: number;
}

/**
 * Accesso gestionale dedicato creato dall'azienda (tabella app_staff_accounts).
 * Separato dalle credenziali del Portale Dipendenti.
 */
export interface AppStaffAccountRecord {
  id: string;
  tenantId: string;
  username: string;
  displayName: string;
  role: AppStaffRole;
  status: AppAccountStatus;
  createdAt: string;
  lastLoginAt: string | null;
  loginCount: number;
}

/** Sessione minimale persistita in localStorage per non perdere l'accesso al reload. */
export interface AuthSession {
  accountId: string;
  companyName: string;
  email: string;
  role: AppAccountRole;
  /**
   * Ruolo operativo effettivo. È opzionale per retro-compatibilità: le sessioni
   * salvate prima dell'introduzione dei profili staff vengono lette come `titolare`.
   */
  staffRole?: AppStaffRole;
  /** Valorizzato solo per gli accessi staff (non per il titolare). */
  staffId?: string;
  /** Nome mostrato in topbar per gli accessi staff. */
  displayName?: string;
  issuedAt: number;
}

export interface AuthResult {
  ok: boolean;
  message?: string;
  account?: AppAccountRecord;
}

export interface RegisterPayload {
  companyName: string;
  email: string;
  password: string;
}

/** Dati per creare un accesso gestionale dedicato a un dipendente. */
export interface StaffAccountPayload {
  /** Può essere un semplice username oppure un indirizzo email (anche fittizio). */
  username: string;
  password: string;
  /** Opzionale: se assente viene mostrato lo username. */
  displayName?: string;
  /** Opzionale: gli accessi creati dall'azienda sono operativi. */
  role?: AppStaffRole;
}

interface AppAccountRow {
  id: string;
  company_name: string;
  email: string;
  password_hash: string;
  password_salt: string;
  role: AppAccountRole;
  status: AppAccountStatus;
  license_expires_at: string | null;
  license_notes: string | null;
  created_at: string;
  last_login_at: string | null;
  login_count: number;
  suspended_at?: string | null;
  deleted_at?: string | null;
}

interface AppStaffRow {
  id: string;
  tenant_id: string;
  username: string;
  display_name: string | null;
  password_hash: string;
  password_salt: string;
  role: AppStaffRole;
  status: AppAccountStatus;
  created_at: string;
  last_login_at: string | null;
  login_count: number;
  suspended_at?: string | null;
}

/**
 * Identificativo dell'azienda principale (super admin).
 * È lo stesso UUID usato dallo script supabase/audiomax_multi_tenant.sql e
 * rappresenta il tenant a cui appartengono i dati già esistenti.
 */
export const SUPER_ADMIN_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/** Messaggio mostrato quando il browser non espone WebCrypto (contesto non sicuro). */
const CRYPTO_UNAVAILABLE_MESSAGE =
  'Accesso sicuro non disponibile su questo indirizzo. Apri il gestionale da https:// oppure da http://localhost.';

/**
 * Autenticazione con account multi-azienda.
 *
 * Convenzioni:
 * - Le password NON vengono mai salvate: in app_accounts finiscono solo hash e salt.
 * - Algoritmo: PBKDF2-SHA256, 210000 iterazioni, 32 byte, salt casuale di 16 byte.
 *   Gli stessi parametri sono usati dagli hash già presenti su Supabase.
 * - La sessione vive in localStorage quando l'utente sceglie "Rimani connesso",
 *   altrimenti in sessionStorage: in quel caso si resta collegati solo nella
 *   scheda corrente e al reload/riapertura si torna alla pagina di login.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly storage = inject(BrowserStorageService);

  private readonly sessionStorageKey = 'audiomax-auth-session';
  private readonly iterations = 210000;
  private readonly keyBytes = 32;
  private readonly saltBytes = 16;

  /** Sessione attiva (null = nessun accesso). */
  readonly session = signal<AuthSession | null>(null);
  /** Dati completi dell'account collegato, riletti dal database. */
  readonly currentAccount = signal<AppAccountRecord | null>(null);
  /**
   * Esito del probe sulla tabella app_accounts.
   * - false = backend account non ancora verificato oppure non disponibile:
   *   in questo caso l'accesso al gestionale resta consentito (nessun blocco totale
   *   se lo script SQL non è ancora stato eseguito).
   * - true = backend pronto: l'accesso richiede una sessione valida.
   */
  readonly authBackendReady = signal(false);
  /** Probe del backend account, eseguito una sola volta e riusato dalle guardie. */
  private backendProbe: Promise<boolean> | null = null;

  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly isSuperAdmin = computed(() => this.session()?.role === 'super-admin');
  /** Identificativo dell'azienda usato per isolare i dati (tenant_id). */
  readonly tenantId = computed(() => this.session()?.accountId ?? null);
  readonly companyName = computed(() => this.session()?.companyName ?? '');
  readonly accountEmail = computed(() => this.session()?.email ?? '');
  /**
   * Ruolo operativo effettivo dell'accesso corrente.
   * Le sessioni salvate prima dell'introduzione dei profili staff non hanno
   * `staffRole`: in quel caso valgono come `titolare` (nessuna retro-regressione).
   */
  readonly staffRole = computed<AppStaffRole>(() => this.session()?.staffRole ?? 'titolare');
  /** True se l'accesso è del titolare (o del super admin): vede tutto. */
  readonly isOwner = computed(() => this.staffRole() === 'titolare');
  /**
   * True solo per gli accessi che possono consultare il registro attività
   * "chi ha fatto cosa". Il profilo operativo non lo vede.
   */
  readonly canViewAuditRegister = computed(() => this.isOwner());
  /** Nome mostrato in topbar: per gli accessi staff è il nome dell'operatore. */
  readonly displayName = computed(
    () => this.session()?.displayName?.trim() || this.session()?.email || '',
  );
  /** Etichetta del ruolo, usata nella topbar. */
  readonly roleLabel = computed(() => {
    if (this.session()?.role === 'super-admin') {
      return 'Super Admin';
    }
    return this.staffRole() === 'operativo' ? 'Operativo' : 'Titolare';
  });

  constructor() {
    this.restoreSession();
    this.backendProbe = this.probeAuthBackend();
  }

  // ==========================================================================
  // Sessione
  // ==========================================================================

  /**
   * Recupera la sessione salvata: prima quella persistente ("Rimani connesso"),
   * poi quella temporanea della scheda corrente.
   */
  private restoreSession(): void {
    const persistent = this.storage.getJson<AuthSession>(this.sessionStorageKey, 'local');
    const temporary = this.storage.getJson<AuthSession>(this.sessionStorageKey, 'session');
    const stored = persistent ?? temporary;

    if (!stored || !stored.accountId) {
      return;
    }

    this.session.set(stored);
  }

  /**
   * Avvia la sessione.
   * @param remember true = localStorage (resta connesso anche dopo la chiusura),
   *                 false = sessionStorage (solo per la scheda corrente).
   * @param staff    dati dell'accesso staff; se assente la sessione è del titolare.
   */
  private startSession(
    account: AppAccountRecord,
    remember = true,
    staff?: { staffId: string; displayName: string; staffRole: AppStaffRole },
  ): void {
    const session: AuthSession = {
      accountId: account.id,
      companyName: account.companyName,
      email: account.email,
      role: account.role,
      staffRole: staff?.staffRole ?? 'titolare',
      staffId: staff?.staffId,
      displayName: staff?.displayName,
      issuedAt: Date.now(),
    };

    this.session.set(session);
    this.currentAccount.set(account);

    // Salviamo in un solo ambito: cancelliamo sempre l'altro per non lasciare
    // sessioni duplicate o vecchie.
    if (remember) {
      this.storage.setJson(this.sessionStorageKey, session, 'local');
      this.storage.removeItem(this.sessionStorageKey, 'session');
    } else {
      this.storage.setJson(this.sessionStorageKey, session, 'session');
      this.storage.removeItem(this.sessionStorageKey, 'local');
    }
  }

  /** Chiude la sessione e cancella le copie locali (persistente e temporanea). */
  logout(): void {
    this.session.set(null);
    this.currentAccount.set(null);
    this.storage.removeItem(this.sessionStorageKey, 'local');
    this.storage.removeItem(this.sessionStorageKey, 'session');
  }

  // ==========================================================================
  // Verifica disponibilità backend account
  // ==========================================================================

  /**
   * Verifica che la tabella app_accounts esista.
   * Serve a non bloccare il gestionale prima che la migration SQL sia stata eseguita.
   */
  async probeAuthBackend(): Promise<boolean> {
    const client = this.supabase.client;

    if (!client) {
      this.authBackendReady.set(false);
      return false;
    }

    const { error } = await client
      .from(supabaseConfig.tables.accounts)
      .select('id')
      .limit(1);

    const ready = !error;
    this.authBackendReady.set(ready);
    return ready;
  }

  /**
   * Attende l'esito (una sola volta) del probe sul backend account.
   * Le guardie di rotta la usano per decidere se l'accesso è consentito:
   * senza questa attesa la prima navigazione partirebbe prima che il probe
   * sia concluso e il gestionale si aprirebbe senza login.
   */
  ensureAuthBackendProbe(): Promise<boolean> {
    this.backendProbe ??= this.probeAuthBackend();
    return this.backendProbe;
  }

  // ==========================================================================
  // Login / Registrazione
  // ==========================================================================

  /**
   * Verifica le credenziali e avvia la sessione.
   * L'identificativo può essere l'email del titolare (app_accounts) oppure lo
   * username di un accesso staff (app_staff_accounts).
   * @param remember true = "Rimani connesso" (sessione persistente nel browser).
   */
  async login(identifierRaw: string, password: string, remember = true): Promise<AuthResult> {
    const identifier = identifierRaw.trim().toLowerCase();

    if (!identifier || !password) {
      return { ok: false, message: 'Inserisci credenziali e password.' };
    }

    if (!this.isCryptoAvailable()) {
      return { ok: false, message: CRYPTO_UNAVAILABLE_MESSAGE };
    }

    // 1) Titolare / azienda: l'identificativo è l'email in app_accounts.
    const { row, error } = await this.loadAccountRow(identifier);
    if (error) {
      return { ok: false, message: error };
    }
    if (row) {
      if (row.status === 'eliminata') {
        return { ok: false, message: 'Questo account è stato eliminato.' };
      }
      if (row.status === 'sospesa') {
        return { ok: false, message: "Account sospeso. Contatta l'amministratore del gestionale." };
      }

      const hash = await this.derivePasswordHash(password, row.password_salt);
      if (!this.constantTimeEquals(hash, row.password_hash)) {
        return { ok: false, message: 'Password non corretta.' };
      }

      const licenseError = this.checkLicense(row);
      if (licenseError) {
        return { ok: false, message: licenseError };
      }

      const account = this.mapAccountRow(row);
      this.startSession(account, remember);
      void this.touchLogin(row);

      return { ok: true, account };
    }

    // 2) Accesso staff: l'identificativo è lo username in app_staff_accounts.
    return this.loginStaff(identifier, password, remember);
  }

  /**
   * Accesso con credenziali staff dedicate al gestionale.
   * Restituisce sempre un AuthResult: se lo username non esiste, il messaggio
   * resta neutro per non rivelare quali username sono registrati.
   */
  private async loginStaff(
    username: string,
    password: string,
    remember: boolean,
  ): Promise<AuthResult> {
    const genericFailure: AuthResult = {
      ok: false,
      message: 'Credenziali non valide.',
    };

    const client = this.supabase.client;
    if (!client) {
      return { ok: false, message: 'Supabase non configurato: impossibile verificare le credenziali.' };
    }

    const { data, error } = await client
      .from(supabaseConfig.tables.staffAccounts)
      .select('*')
      .ilike('username', username)
      .limit(5);

    if (error) {
      // Tabella non ancora creata: il messaggio aiuta a capire cosa fare.
      if (error.code === 'PGRST205' || error.code === '42P01') {
        return {
          ok: false,
          message:
            'Accessi staff non ancora attivi: esegui lo script supabase/audiomax_multi_tenant.sql su Supabase.',
        };
      }
      return { ok: false, message: `Errore di connessione al database: ${error.message ?? ''}` };
    }

    const normalized = username.trim().toLowerCase();
    const row = (data ?? []).find(
      (item: AppStaffRow) => (item.username ?? '').trim().toLowerCase() === normalized,
    ) as AppStaffRow | undefined;

    if (!row) {
      return genericFailure;
    }
    if (row.status === 'eliminata' || row.status === 'sospesa') {
      return { ok: false, message: 'Accesso sospeso. Contatta il titolare dell\'azienda.' };
    }

    const hash = await this.derivePasswordHash(password, row.password_salt);
    if (!this.constantTimeEquals(hash, row.password_hash)) {
      return genericFailure;
    }

    // Serve il nome azienda per la topbar: lo leggiamo dall'account titolare.
    const companyName = await this.loadCompanyName(row.tenant_id);
    if (!companyName) {
      return { ok: false, message: 'Azienda non disponibile per questo accesso.' };
    }

    const ownerAccount: AppAccountRecord = {
      id: row.tenant_id,
      companyName,
      email: row.username,
      role: 'azienda',
      status: 'attiva',
      licenseExpiresAt: null,
      licenseNotes: null,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      loginCount: row.login_count ?? 0,
    };

    this.startSession(ownerAccount, remember, {
      staffId: row.id,
      displayName: row.display_name?.trim() || row.username,
      staffRole: row.role,
    });
    void this.touchStaffLogin(row);

    return { ok: true, account: ownerAccount };
  }

  private async loadCompanyName(tenantId: string): Promise<string | null> {
    const client = this.supabase.client;
    if (!client) {
      return null;
    }

    const { data, error } = await client
      .from(supabaseConfig.tables.accounts)
      .select('company_name')
      .eq('id', tenantId)
      .limit(1);

    if (error || !data?.length) {
      return null;
    }

    return (data[0] as { company_name: string }).company_name ?? null;
  }

  private async touchStaffLogin(row: AppStaffRow): Promise<void> {
    const client = this.supabase.client;
    if (!client) {
      return;
    }

    await client
      .from(supabaseConfig.tables.staffAccounts)
      .update({
        last_login_at: new Date().toISOString(),
        login_count: (row.login_count ?? 0) + 1,
      })
      .eq('id', row.id);
  }

  async register(payload: RegisterPayload): Promise<AuthResult> {
    const companyName = payload.companyName.trim();
    const email = payload.email.trim().toLowerCase();
    const password = payload.password;

    if (companyName.length < 2) {
      return { ok: false, message: "Inserisci il nome dell'azienda." };
    }
    if (!this.isValidEmail(email)) {
      return { ok: false, message: 'Inserisci un indirizzo email valido.' };
    }
    if (password.length < 8) {
      return { ok: false, message: 'La password deve avere almeno 8 caratteri.' };
    }
    if (!this.isCryptoAvailable()) {
      return { ok: false, message: CRYPTO_UNAVAILABLE_MESSAGE };
    }

    const client = this.supabase.client;
    if (!client) {
      return { ok: false, message: 'Supabase non configurato: registrazione non disponibile.' };
    }

    const existing = await this.loadAccountRow(email);
    if (existing.error) {
      return { ok: false, message: existing.error };
    }
    if (existing.row) {
      return { ok: false, message: 'Esiste già un account con questa email.' };
    }

    const salt = this.randomHex(this.saltBytes);
    const hash = await this.derivePasswordHash(password, salt);

    const { data, error } = await client
      .from(supabaseConfig.tables.accounts)
      .insert({
        company_name: companyName,
        email,
        password_hash: hash,
        password_salt: salt,
        role: 'azienda',
        status: 'attiva',
      })
      .select('*')
      .single();

    if (error || !data) {
      return {
        ok: false,
        message: error ? this.describeBackendError(error) : 'Registrazione non riuscita.',
      };
    }

    const account = this.mapAccountRow(data as AppAccountRow);
    this.startSession(account);
    void this.touchLogin(data as AppAccountRow);

    return { ok: true, account };
  }

  /**
   * Rilegge dal database l'account della sessione corrente.
   * Restituisce false (e chiude la sessione) se il profilo è stato sospeso,
   * eliminato oppure se la licenza è scaduta: così le azioni del super admin
   * hanno effetto anche su dispositivi già collegati.
   */
  async refreshCurrentAccount(): Promise<boolean> {
    const session = this.session();
    const client = this.supabase.client;

    if (!session || !client) {
      return true;
    }

    const { data, error } = await client
      .from(supabaseConfig.tables.accounts)
      .select('*')
      .eq('id', session.accountId)
      .limit(1);

    if (error || !data?.length) {
      // Backend non raggiungibile: non buttiamo fuori l'utente, lasciamo i dati locali.
      return true;
    }

    const row = data[0] as AppAccountRow;

    if (row.status !== 'attiva' || Boolean(this.checkLicense(row))) {
      this.logout();
      return false;
    }

    // Accesso staff: verifichiamo anche che l'accesso del dipendente sia attivo,
    // così la sospensione decisa dal titolare ha effetto subito.
    const staffValid = await this.checkStaffStillActive(session.staffId);
    if (!staffValid) {
      this.logout();
      return false;
    }

    this.currentAccount.set(this.mapAccountRow(row));
    return true;
  }

  /**
   * Verifica che un accesso staff sia ancora attivo.
   * Se il backend non è raggiungibile non blocchiamo l'utente (ritorna true).
   */
  private async checkStaffStillActive(staffId: string | undefined): Promise<boolean> {
    if (!staffId) {
      return true;
    }

    const client = this.supabase.client;
    if (!client) {
      return true;
    }

    const { data, error } = await client
      .from(supabaseConfig.tables.staffAccounts)
      .select('status')
      .eq('id', staffId)
      .limit(1);

    if (error || !data?.length) {
      return true;
    }

    return (data[0] as { status: AppAccountStatus }).status === 'attiva';
  }

  // ==========================================================================
  // Gestione profili (solo super admin)
  // ==========================================================================

  /** Elenco completo degli account registrati, ordinato per data di creazione. */
  async listAccounts(): Promise<AppAccountRecord[]> {
    const client = this.supabase.client;

    if (!client) {
      return [];
    }

    const { data, error } = await client
      .from(supabaseConfig.tables.accounts)
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return (data as AppAccountRow[]).map((row) => this.mapAccountRow(row));
  }

  /** Sospende un profilo: il login viene bloccato finché non viene riattivato. */
  async suspendAccount(accountId: string): Promise<AuthResult> {
    return this.patchAccount(accountId, {
      status: 'sospesa',
      suspended_at: new Date().toISOString(),
    });
  }

  /** Riattiva un profilo sospeso. */
  async resumeAccount(accountId: string): Promise<AuthResult> {
    return this.patchAccount(accountId, {
      status: 'attiva',
      suspended_at: null,
    });
  }

  /**
   * Elimina definitivamente un profilo.
   * Il vincolo ON DELETE CASCADE della migration cancella anche tutti i dati
   * (clienti, preventivi, cassa, magazzino, …) collegati a quell'azienda.
   */
  async deleteAccount(accountId: string): Promise<AuthResult> {
    const client = this.supabase.client;

    if (!client) {
      return { ok: false, message: 'Supabase non configurato.' };
    }

    const { error } = await client
      .from(supabaseConfig.tables.accounts)
      .delete()
      .eq('id', accountId);

    if (error) {
      return { ok: false, message: this.describeBackendError(error) };
    }

    return { ok: true };
  }

  /** Aggiorna i dati di licenza (scadenza e note). */
  async updateLicense(
    accountId: string,
    license: { expiresAt: string | null; notes: string | null },
  ): Promise<AuthResult> {
    return this.patchAccount(accountId, {
      license_expires_at: license.expiresAt,
      license_notes: license.notes,
    });
  }

  private async patchAccount(
    accountId: string,
    patch: Record<string, unknown>,
  ): Promise<AuthResult> {
    const client = this.supabase.client;

    if (!client) {
      return { ok: false, message: 'Supabase non configurato.' };
    }

    const { error } = await client
      .from(supabaseConfig.tables.accounts)
      .update(patch)
      .eq('id', accountId);

    if (error) {
      return { ok: false, message: this.describeBackendError(error) };
    }

    return { ok: true };
  }

  // ==========================================================================
  // Accessi staff (creati dal titolare da Impostazioni)
  // ==========================================================================

  /** Elenco degli accessi staff dell'azienda collegata. */
  async listStaffAccounts(): Promise<AppStaffAccountRecord[]> {
    const client = this.supabase.client;
    const tenant = this.tenantId();

    if (!client || !tenant) {
      return [];
    }

    const { data, error } = await client
      .from(supabaseConfig.tables.staffAccounts)
      .select('*')
      .eq('tenant_id', tenant)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return (data as AppStaffRow[]).map((row) => this.mapStaffRow(row));
  }

  /** Crea un accesso gestionale per un dipendente (username + password). */
  async createStaffAccount(payload: StaffAccountPayload): Promise<AuthResult> {
    const client = this.supabase.client;
    const tenant = this.tenantId();

    if (!client || !tenant) {
      return { ok: false, message: 'Supabase non configurato.' };
    }
    if (!this.isCryptoAvailable()) {
      return { ok: false, message: CRYPTO_UNAVAILABLE_MESSAGE };
    }

    const username = payload.username.trim().toLowerCase();
    // Il nome mostrato è opzionale: se non indicato usiamo lo username stesso.
    const displayName = payload.displayName?.trim() || username;
    const role: AppStaffRole = payload.role ?? 'operativo';

    const usernameError = this.validateUsername(username);
    if (usernameError) {
      return { ok: false, message: usernameError };
    }
    if (payload.password.length < 8) {
      return { ok: false, message: 'La password deve avere almeno 8 caratteri.' };
    }

    // Lo username deve essere univoco a livello globale perché il login avviene
    // solo con lo username, senza indicare l'azienda.
    const existing = await client
      .from(supabaseConfig.tables.staffAccounts)
      .select('id, username')
      .ilike('username', username)
      .limit(5);

    if (existing.error) {
      if (existing.error.code === 'PGRST205' || existing.error.code === '42P01') {
        return {
          ok: false,
          message:
            'Accessi staff non ancora attivi: esegui lo script supabase/audiomax_multi_tenant.sql su Supabase.',
        };
      }
      return { ok: false, message: `Errore di connessione al database: ${existing.error.message ?? ''}` };
    }

    const taken = (existing.data ?? []).some(
      (item: { username?: string }) => (item.username ?? '').trim().toLowerCase() === username,
    );
    if (taken) {
      return { ok: false, message: 'Username già in uso: scegline un altro.' };
    }

    const salt = this.randomHex(this.saltBytes);
    const hash = await this.derivePasswordHash(payload.password, salt);

    const { error } = await client
      .from(supabaseConfig.tables.staffAccounts)
      .insert({
        tenant_id: tenant,
        username,
        display_name: displayName,
        password_hash: hash,
        password_salt: salt,
        role,
        status: 'attiva',
      });

    if (error) {
      return { ok: false, message: this.describeStaffError(error) };
    }

    return { ok: true };
  }

  /** Reimposta la password di un accesso staff. */
  async setStaffPassword(staffId: string, password: string): Promise<AuthResult> {
    if (password.length < 8) {
      return { ok: false, message: 'La password deve avere almeno 8 caratteri.' };
    }
    if (!this.isCryptoAvailable()) {
      return { ok: false, message: CRYPTO_UNAVAILABLE_MESSAGE };
    }

    const salt = this.randomHex(this.saltBytes);
    const hash = await this.derivePasswordHash(password, salt);

    return this.patchStaff(staffId, { password_hash: hash, password_salt: salt });
  }

  /** Sospende un accesso staff: il login viene bloccato finché non viene riattivato. */
  async suspendStaffAccount(staffId: string): Promise<AuthResult> {
    return this.patchStaff(staffId, {
      status: 'sospesa',
      suspended_at: new Date().toISOString(),
    });
  }

  /** Riattiva un accesso staff sospeso. */
  async resumeStaffAccount(staffId: string): Promise<AuthResult> {
    return this.patchStaff(staffId, { status: 'attiva', suspended_at: null });
  }

  /** Elimina definitivamente un accesso staff. */
  async deleteStaffAccount(staffId: string): Promise<AuthResult> {
    const client = this.supabase.client;

    if (!client) {
      return { ok: false, message: 'Supabase non configurato.' };
    }

    const { error } = await client
      .from(supabaseConfig.tables.staffAccounts)
      .delete()
      .eq('id', staffId);

    if (error) {
      return { ok: false, message: this.describeStaffError(error) };
    }

    return { ok: true };
  }

  private async patchStaff(
    staffId: string,
    patch: Record<string, unknown>,
  ): Promise<AuthResult> {
    const client = this.supabase.client;

    if (!client) {
      return { ok: false, message: 'Supabase non configurato.' };
    }

    const { error } = await client
      .from(supabaseConfig.tables.staffAccounts)
      .update(patch)
      .eq('id', staffId);

    if (error) {
      return { ok: false, message: this.describeStaffError(error) };
    }

    return { ok: true };
  }

  /**
   * Lo username accetta lettere, numeri, punto, trattino e underscore; è
   * ammesso anche un indirizzo email (anche fittizio) per comodità d'uso.
   */
  private validateUsername(username: string): string | null {
    if (username.length < 3 || username.length > 60) {
      return 'Lo username deve avere tra 3 e 60 caratteri.';
    }
    if (!/^[a-z0-9._%+-]+(@[a-z0-9-]+(\.[a-z0-9-]+)+)?$/.test(username)) {
      return 'Usa uno username semplice oppure un indirizzo email (es. nome@azienda.it).';
    }
    return null;
  }

  private describeStaffError(error: { code?: string; message?: string }): string {
    const message = error.message ?? '';

    if (
      error.code === 'PGRST205' ||
      error.code === '42P01' ||
      message.includes('Could not find the table')
    ) {
      return 'Accessi staff non ancora attivi: esegui lo script supabase/audiomax_multi_tenant.sql su Supabase.';
    }
    if (error.code === '23505') {
      return 'Username già in uso: scegline un altro.';
    }

    return `Errore di connessione al database: ${message}`;
  }

  private mapStaffRow(row: AppStaffRow): AppStaffAccountRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      username: row.username,
      displayName: row.display_name?.trim() ?? '',
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      loginCount: row.login_count ?? 0,
    };
  }

  private async touchLogin(row: AppAccountRow): Promise<void> {
    const client = this.supabase.client;

    if (!client) {
      return;
    }

    await client
      .from(supabaseConfig.tables.accounts)
      .update({
        last_login_at: new Date().toISOString(),
        login_count: (row.login_count ?? 0) + 1,
      })
      .eq('id', row.id);
  }

  // ==========================================================================
  // Verifica anti-bot (codice a 4 cifre)
  // ==========================================================================

  /** Genera il codice di verifica da mostrare all'utente in fase di registrazione. */
  createHumanChallenge(): string {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => String(byte % 10)).join('');
  }

  /** Confronta il codice digitato con quello generato. */
  verifyHumanChallenge(expected: string, input: string): boolean {
    return expected.trim() === input.trim();
  }

  // ==========================================================================
  // Helper interni
  // ==========================================================================

  private isCryptoAvailable(): boolean {
    return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }

  private checkLicense(row: AppAccountRow): string | null {
    if (!row.license_expires_at) {
      return null;
    }

    const expiresAt = new Date(row.license_expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() >= Date.now()) {
      return null;
    }

    const label = new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(expiresAt);

    return `Licenza scaduta il ${label}. Contatta l'amministratore del gestionale.`;
  }

  private mapAccountRow(row: AppAccountRow): AppAccountRecord {
    return {
      id: row.id,
      companyName: row.company_name,
      email: row.email,
      role: row.role,
      status: row.status,
      licenseExpiresAt: row.license_expires_at,
      licenseNotes: row.license_notes,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      loginCount: row.login_count ?? 0,
    };
  }

  private async loadAccountRow(
    email: string,
  ): Promise<{ row: AppAccountRow | null; error: string | null }> {
    const client = this.supabase.client;

    if (!client) {
      return { row: null, error: 'Supabase non configurato: impossibile verificare le credenziali.' };
    }

    // La ricerca è case-insensitive; il confronto esatto viene rifatto in JS
    // perché il carattere "_" è un jolly per ilike ed evitiamo falsi positivi.
    const { data, error } = await client
      .from(supabaseConfig.tables.accounts)
      .select('*')
      .ilike('email', email)
      .limit(5);

    if (error) {
      return { row: null, error: this.describeBackendError(error) };
    }

    const normalized = email.trim().toLowerCase();
    const row = (data ?? []).find(
      (item: AppAccountRow) => (item.email ?? '').trim().toLowerCase() === normalized,
    );

    return { row: (row as AppAccountRow) ?? null, error: null };
  }

  /** Traduce gli errori Supabase più frequenti in messaggi comprensibili. */
  private describeBackendError(error: { code?: string; message?: string }): string {
    const message = error.message ?? '';

    if (
      error.code === 'PGRST205' ||
      error.code === '42P01' ||
      message.includes('Could not find the table')
    ) {
      return 'Tabella account non trovata: esegui lo script supabase/audiomax_multi_tenant.sql su Supabase.';
    }

    return `Errore di connessione al database: ${message}`;
  }

  private async derivePasswordHash(password: string, saltHex: string): Promise<string> {
    const salt = this.hexToBytes(saltHex);
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt as unknown as BufferSource,
        iterations: this.iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      this.keyBytes * 8,
    );

    return this.bytesToHex(new Uint8Array(bits));
  }

  private randomHex(bytes: number): string {
    const buffer = new Uint8Array(bytes);
    crypto.getRandomValues(buffer);
    return this.bytesToHex(buffer);
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  private hexToBytes(hex: string): Uint8Array {
    const clean = hex.trim();
    const bytes = new Uint8Array(Math.floor(clean.length / 2));

    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = parseInt(clean.substr(index * 2, 2), 16);
    }

    return bytes;
  }

  private constantTimeEquals(left: string, right: string): boolean {
    if (!left || !right || left.length !== right.length) {
      return false;
    }

    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }

    return difference === 0;
  }
}
