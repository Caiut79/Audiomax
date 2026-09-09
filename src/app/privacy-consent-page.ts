import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { AudiomaxDataService } from './audiomax-data.service';

@Component({
  selector: 'app-privacy-consent-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './privacy-consent-page.html',
  styleUrl: './privacy-consent-page.scss',
})
export class PrivacyConsentPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly data = inject(AudiomaxDataService);

  protected readonly clientId = signal(
    this.route.snapshot.paramMap.get('clientId') ?? '',
  );
  protected readonly client = computed(
    () => this.data.clients().find((item) => item.id === this.clientId()) ?? null,
  );
  protected readonly emailMarketing = signal(false);
  protected readonly whatsappMarketing = signal(false);
  protected readonly fidelityProfiling = signal(false);
  protected readonly selectedConsentsCount = computed(
    () =>
      [this.emailMarketing(), this.whatsappMarketing(), this.fidelityProfiling()].filter(Boolean)
        .length,
  );
  protected readonly archivePreview = computed(
    () => this.client()?.privacyProfile.archive.slice(0, 4) ?? [],
  );
  protected readonly statusCards = computed(() => {
    const client = this.client();

    if (!client) {
      return [];
    }

    return [
      {
        label: 'Stato consenso',
        value: client.privacyProfile.remoteConsentStatus,
        detail: 'Flusso remoto del cliente',
      },
      {
        label: 'Consensi attivi',
        value: `${this.selectedConsentsCount()}/3`,
        detail: 'Email, WhatsApp, fidelity',
      },
      {
        label: 'Informativa',
        value: client.privacyProfile.noticeVersion,
        detail: client.privacyProfile.noticeAcknowledged ? 'Registrata' : 'Da registrare',
      },
      {
        label: 'Archivio',
        value: `${client.privacyProfile.archive.length}`,
        detail: 'Elementi salvati nel gestionale',
      },
    ];
  });

  constructor() {
    effect(() => {
      const client = this.client();

      if (!client) {
        return;
      }

      this.emailMarketing.set(client.privacyProfile.emailMarketing.granted);
      this.whatsappMarketing.set(client.privacyProfile.whatsappMarketing.granted);
      this.fidelityProfiling.set(client.privacyProfile.fidelityProfiling.granted);
    });

    this.route.paramMap.pipe(map((params) => params.get('clientId') ?? '')).subscribe((clientId) => {
      this.clientId.set(clientId);
    });
  }

  protected setEmailMarketing(value: boolean): void {
    this.emailMarketing.set(value);
  }

  protected setWhatsappMarketing(value: boolean): void {
    this.whatsappMarketing.set(value);
  }

  protected setFidelityProfiling(value: boolean): void {
    this.fidelityProfiling.set(value);
  }

  protected confirmConsents(): void {
    const client = this.client();

    if (!client) {
      return;
    }

    const timestamp = new Date().toISOString();

    this.data.updateClient({
      ...client,
      privacyProfile: {
        ...client.privacyProfile,
        remoteConsentStatus: 'completato',
        emailMarketing: {
          granted: this.emailMarketing(),
          grantedAt: this.emailMarketing() ? timestamp : null,
          channel: this.emailMarketing() ? 'link-remoto' : null,
        },
        whatsappMarketing: {
          granted: this.whatsappMarketing(),
          grantedAt: this.whatsappMarketing() ? timestamp : null,
          channel: this.whatsappMarketing() ? 'link-remoto' : null,
        },
        fidelityProfiling: {
          granted: this.fidelityProfiling(),
          grantedAt: this.fidelityProfiling() ? timestamp : null,
          channel: this.fidelityProfiling() ? 'link-remoto' : null,
        },
        audit: [
          {
            id: `privacy-audit-${crypto.randomUUID()}`,
            action: 'consenso-confermato',
            detail: 'Cliente ha confermato i consensi dal link remoto.',
            operator: 'Portale consenso',
            channel: 'link-remoto',
            createdAt: timestamp,
          },
          ...client.privacyProfile.audit,
        ],
        archive: [
          {
            id: `privacy-archive-${crypto.randomUUID()}`,
            type: 'conferma-consenso',
            title: 'Conferma remota consensi privacy',
            status: 'confermato',
            channel: 'link-remoto',
            url: client.privacyProfile.remoteConsentUrl,
            createdAt: timestamp,
          },
          ...client.privacyProfile.archive,
        ],
      },
    });
  }

  protected rejectConsents(): void {
    const client = this.client();

    if (!client) {
      return;
    }

    const timestamp = new Date().toISOString();
    this.emailMarketing.set(false);
    this.whatsappMarketing.set(false);
    this.fidelityProfiling.set(false);

    this.data.updateClient({
      ...client,
      privacyProfile: {
        ...client.privacyProfile,
        remoteConsentStatus: 'revocato',
        emailMarketing: {
          granted: false,
          grantedAt: null,
          channel: null,
        },
        whatsappMarketing: {
          granted: false,
          grantedAt: null,
          channel: null,
        },
        fidelityProfiling: {
          granted: false,
          grantedAt: null,
          channel: null,
        },
        audit: [
          {
            id: `privacy-audit-${crypto.randomUUID()}`,
            action: 'consenso-revocato',
            detail: 'Cliente ha rifiutato o revocato i consensi dal link remoto.',
            operator: 'Portale consenso',
            channel: 'link-remoto',
            createdAt: timestamp,
          },
          ...client.privacyProfile.audit,
        ],
        archive: [
          {
            id: `privacy-archive-${crypto.randomUUID()}`,
            type: 'revoca-consenso',
            title: 'Revoca remota consensi privacy',
            status: 'revocato',
            channel: 'link-remoto',
            url: client.privacyProfile.remoteConsentUrl,
            createdAt: timestamp,
          },
          ...client.privacyProfile.archive,
        ],
      },
    });
  }
}
