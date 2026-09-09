import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';

import { BrowserStorageService } from './browser-storage.service';

export type ThemeMode = 'dark' | 'light';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(BrowserStorageService);
  private readonly storageKey = 'audiomax-theme';

  readonly theme = signal<ThemeMode>(this.readStoredTheme());

  constructor() {
    effect(() => {
      const currentTheme = this.theme();
      this.document.documentElement.dataset['theme'] = currentTheme;
      this.document.documentElement.style.colorScheme = currentTheme;
      this.storage.setItem(this.storageKey, currentTheme);
    });
  }

  toggleTheme(): void {
    this.theme.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private readStoredTheme(): ThemeMode {
    const storedTheme = this.storage.getItem(this.storageKey);
    return storedTheme === 'dark' ? 'dark' : 'light';
  }
}
