import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup } from '@angular/forms';

import { BrowserStorageService } from './browser-storage.service';

@Injectable({
  providedIn: 'root',
})
export class FormDraftService {
  private readonly storage = inject(BrowserStorageService);
  private readonly storagePrefix = 'audiomax-form-draft';
  private readonly draftMeta = signal<Record<string, string | null>>({});
  private readonly pausedKeys = new Set<string>();

  hasDraft(key: string): boolean {
    return !!this.draftMeta()[key];
  }

  savedAt(key: string): string | null {
    return this.draftMeta()[key] ?? null;
  }

  registerForm(key: string, form: FormGroup, destroyRef: DestroyRef): void {
    const stored = this.readDraft(key);
    this.draftMeta.update((state) => ({
      ...state,
      [key]: stored?.savedAt ?? null,
    }));

    form.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
      if (this.pausedKeys.has(key)) {
        return;
      }

      const value = form.getRawValue();
      if (this.hasContent(value)) {
        const savedAt = new Date().toISOString();
        this.storage.setJson(this.storageKey(key), { savedAt, value });
        this.draftMeta.update((state) => ({ ...state, [key]: savedAt }));
        return;
      }

      this.clearDraft(key);
    });
  }

  restoreDraft(key: string, form: FormGroup): boolean {
    const stored = this.readDraft(key);
    if (!stored) {
      return false;
    }

    this.runWithoutSync(key, () => {
      form.patchValue(stored.value as Record<string, unknown>);
    });
    return true;
  }

  clearDraft(key: string): void {
    this.storage.removeItem(this.storageKey(key));
    this.draftMeta.update((state) => ({ ...state, [key]: null }));
  }

  runWithoutSync(key: string, callback: () => void): void {
    this.pausedKeys.add(key);
    try {
      callback();
    } finally {
      queueMicrotask(() => this.pausedKeys.delete(key));
    }
  }

  private storageKey(key: string): string {
    return `${this.storagePrefix}:${key}`;
  }

  private readDraft(key: string): { savedAt: string; value: unknown } | null {
    return this.storage.getJson<{ savedAt: string; value: unknown }>(this.storageKey(key));
  }

  private hasContent(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.some((entry) => this.hasContent(entry));
    }
    if (typeof value === 'object') {
      return Object.values(value).some((entry) => this.hasContent(entry));
    }
    return false;
  }

}
