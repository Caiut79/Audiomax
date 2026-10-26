import { Injectable, computed, inject, signal } from '@angular/core';

import { BrowserStorageService } from './browser-storage.service';
import { supabaseConfig } from './supabase.config';
import { SupabaseService } from './supabase.service';

/** Ruolo dell'account che accede al gestionale. */
export type AppAccountRole = 'azienda' | 'super-admin';
/** Stato del profilo: attivo, sospeso dal super admin oppure eliminato. */
export type AppAccountStatus = 'attiva' | 'sospesa' | 'eliminata';

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

/** Sessione minimale persistita in localStorage per non perdere l'accesso al reload. */
export interface AuthSession {
  accountId: string;
  companyName: string;
  email: string;
  role: AppAccountRole;
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
 * - La sessione vive in localStorage: al reload l'utente resta collegato.
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

  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly isSuperAdmin = computed(() => this.session()?.role === 'super-admin');
  /** Identificativo dell'azienda usato per isolare i dati (tenant_id). */
  readonly tenantId = computed(() => this.session()?.accountId ?? null);
  readonly companyName = computed(() => this.session()?.companyName ?? '');
  readonly accountEmail = computed(() => this.session()?.email ?? '');
  /** Etichetta del ruolo, usata nella topbar. */
  readonly roleLabel = computed(() =>
    this.session()?.role === 'super-admin' ? 'Super Admin' : 'Azienda',
  );

  constructor() {
    this.restoreSession();
    void this.probeAuthBackend();
  }

  // ==========================================================================
  // Sessione
  // ==========================================================================

  private restoreSession(): void {
    const stored = this.storage.getJson<AuthSession>(this.sessionStorageKey);

    if (!stored || !stored.accountId) {
      return;
    }

    this.session.set(stored);
  }

  private startSession(account: AppAccountRecord): void {
    const session: AuthSession = {
      accountId: account.id,
      companyName: account.companyName,
      email: account.email,
      role: account.role,
      issuedAt: Date.now(),
    };

    this.session.set(session);
    this.currentAccount.set(account);
    this.storage.setJson(this.sessionStorageKey, session);
  }

  /** Chiude la sessione e cancella la copia locale. */
  logout(): void {
    this.session.set(null);
    this.currentAccount.set(null);
    this.storage.removeItem(this.sessionStorageKey);
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

  // ==========================================================================
  // Login / Registrazione
  // ==========================================================================

  async login(emailRaw: string, password: string): Promise<AuthResult> {
    const email = emailRaw.trim().toLowerCase();

    if (!email || !password) {
      return { ok: false, message: 'Inserisci email e password.' };
    }

    if (!this.isCryptoAvailable()) {
      return { ok: false, message: CRYPTO_UNAVAILABLE_MESSAGE };
    }

    const { row, error } = await this.loadAccountRow(email);
    if (error) {
      return { ok: false, message: error };
    }
    if (!row) {
      return { ok: false, message: 'Nessun account trovato con questa email.' };
    }
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
    this.startSession(account);
    void this.touchLogin(row);

    return { ok: true, account };
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

    this.currentAccount.set(this.mapAccountRow(row));
    return true;
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
