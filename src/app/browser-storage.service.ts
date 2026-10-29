import { Injectable } from '@angular/core';

/**
 * Ambito di persistenza:
 * - 'local'   → localStorage, i dati sopravvivono alla chiusura del browser;
 * - 'session' → sessionStorage, i dati durano solo per la scheda corrente.
 *   Usato quando l'utente sceglie di NON restare connesso.
 */
export type StorageScope = 'local' | 'session';

@Injectable({
  providedIn: 'root',
})
export class BrowserStorageService {
  getItem(key: string, scope: StorageScope = 'local'): string | null {
    const storage = this.resolveStorage(scope);
    if (!storage) {
      return null;
    }

    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  getJson<T>(key: string, scope: StorageScope = 'local'): T | null {
    const raw = this.getItem(key, scope);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      this.removeItem(key, scope);
      return null;
    }
  }

  setItem(key: string, value: string, scope: StorageScope = 'local'): boolean {
    const storage = this.resolveStorage(scope);
    if (!storage) {
      return false;
    }

    try {
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  setJson(key: string, value: unknown, scope: StorageScope = 'local'): boolean {
    return this.setItem(key, JSON.stringify(value), scope);
  }

  removeItem(key: string, scope: StorageScope = 'local'): void {
    const storage = this.resolveStorage(scope);
    if (!storage) {
      return;
    }

    try {
      storage.removeItem(key);
    } catch {
      // Ignoriamo errori di storage per non bloccare il flusso UI.
    }
  }

  private resolveStorage(scope: StorageScope): Storage | null {
    if (scope === 'session') {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    }

    return typeof localStorage === 'undefined' ? null : localStorage;
  }
}
