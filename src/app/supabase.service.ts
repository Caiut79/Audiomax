import { Injectable, computed, signal } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

import { supabaseConfig } from './supabase.config';

export type SupabaseConnectionState =
  | 'missing-url'
  | 'ready'
  | 'syncing'
  | 'connected'
  | 'schema-required'
  | 'error';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly clientInstance =
    supabaseConfig.url.trim() && supabaseConfig.publishableKey.trim()
      ? createClient(supabaseConfig.url, supabaseConfig.publishableKey)
      : null;

  readonly connectionState = signal<SupabaseConnectionState>(
    this.clientInstance ? 'ready' : 'missing-url',
  );

  readonly connectionLabel = computed(() => {
    switch (this.connectionState()) {
      case 'connected':
        return 'Supabase connesso';
      case 'syncing':
        return 'Sincronizzazione in corso';
      case 'schema-required':
        return 'Schema Supabase richiesto';
      case 'error':
        return 'Errore sincronizzazione';
      case 'ready':
        return 'Supabase pronto';
      default:
        return 'URL Supabase mancante';
    }
  });

  get client(): SupabaseClient | null {
    return this.clientInstance;
  }

  get isConfigured(): boolean {
    return Boolean(this.clientInstance);
  }
}
