import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class BrowserStorageService {
  getItem(key: string): string | null {
    const storage = this.resolveStorage();
    if (!storage) {
      return null;
    }

    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  getJson<T>(key: string): T | null {
    const raw = this.getItem(key);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      this.removeItem(key);
      return null;
    }
  }

  setItem(key: string, value: string): boolean {
    const storage = this.resolveStorage();
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

  setJson(key: string, value: unknown): boolean {
    return this.setItem(key, JSON.stringify(value));
  }

  removeItem(key: string): void {
    const storage = this.resolveStorage();
    if (!storage) {
      return;
    }

    try {
      storage.removeItem(key);
    } catch {
      // Ignoriamo errori di storage per non bloccare il flusso UI.
    }
  }

  private resolveStorage(): Storage | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    return localStorage;
  }
}
