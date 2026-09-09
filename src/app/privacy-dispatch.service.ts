import { Injectable, inject, signal } from '@angular/core';

import { BrowserStorageService } from './browser-storage.service';

export type RemoteDispatchChannel = 'whatsapp' | 'email' | 'firma';

export interface PrivacyDispatchResult {
  status: 'success' | 'missing-link' | 'invalid-phone' | 'invalid-email' | 'blocked';
  absoluteConsentUrl: string;
}

@Injectable({
  providedIn: 'root',
})
export class PrivacyDispatchService {
  private readonly storage = inject(BrowserStorageService);
  private readonly privacyBaseUrlStorageKey = 'audiomax-privacy-base-url';

  readonly baseUrlOverride = signal(this.storage.getItem(this.privacyBaseUrlStorageKey) ?? '');

  updateBaseUrlOverride(value: string): void {
    const normalizedValue = value.trim();
    this.baseUrlOverride.set(normalizedValue);

    if (normalizedValue) {
      this.storage.setItem(this.privacyBaseUrlStorageKey, normalizedValue);
    } else {
      this.storage.removeItem(this.privacyBaseUrlStorageKey);
    }
  }

  resetBaseUrlOverride(): void {
    this.baseUrlOverride.set('');
    this.storage.removeItem(this.privacyBaseUrlStorageKey);
  }

  dispatchRemoteConsent(options: {
    clientName: string;
    clientPhone: string;
    clientEmail: string;
    remoteConsentUrl: string | null;
    dispatchChannel: RemoteDispatchChannel;
  }): PrivacyDispatchResult {
    const absoluteConsentUrl = this.buildAbsoluteUrl(options.remoteConsentUrl ?? '');

    if (!options.remoteConsentUrl) {
      return {
        status: 'missing-link',
        absoluteConsentUrl,
      };
    }

    let targetUrl = absoluteConsentUrl;

    if (options.dispatchChannel === 'whatsapp') {
      const normalizedPhone = this.normalizeWhatsappPhone(options.clientPhone);
      if (!normalizedPhone) {
        return {
          status: 'invalid-phone',
          absoluteConsentUrl,
        };
      }

      const message =
        `Ciao ${options.clientName}, per favore conferma la privacy Audiomax qui: ${absoluteConsentUrl}`;
      targetUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
    } else if (options.dispatchChannel === 'email') {
      const email = (options.clientEmail ?? '').trim();
      if (!email || email.endsWith('@cash.local')) {
        return {
          status: 'invalid-email',
          absoluteConsentUrl,
        };
      }

      const subject = 'Conferma privacy Audiomax';
      const body =
        `Ciao ${options.clientName},\n\nper favore conferma la privacy Audiomax al link:\n${absoluteConsentUrl}\n`;
      targetUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    if (!this.openExternalUrl(targetUrl)) {
      return {
        status: 'blocked',
        absoluteConsentUrl,
      };
    }

    return {
      status: 'success',
      absoluteConsentUrl,
    };
  }

  normalizeWhatsappPhone(value: string): string | null {
    const raw = (value ?? '').trim();
    if (!raw || raw === 'Non indicato') {
      return null;
    }

    let digits = raw.replace(/[^\d+]/g, '');
    digits = digits.replace(/^00/, '+');
    digits = digits.replace(/^\+/, '');

    if (!digits) {
      return null;
    }

    if (!digits.startsWith('39') && digits.length === 10) {
      return `39${digits}`;
    }

    return digits;
  }

  openExternalUrl(url: string): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    return !!opened;
  }

  buildAbsoluteUrl(pathOrUrl: string): string {
    if (!pathOrUrl) {
      return '';
    }

    if (/^https?:\/\//i.test(pathOrUrl)) {
      return pathOrUrl;
    }

    const override = this.baseUrlOverride().trim().replace(/\/+$/, '');
    const origin =
      override || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return `${origin}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  }
}
