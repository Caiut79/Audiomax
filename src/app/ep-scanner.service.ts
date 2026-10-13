import { Injectable, signal } from '@angular/core';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Result } from '@zxing/library';

/** Stato dei permessi della fotocamera */
export type EpCameraPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

/**
 * Servizio scanner barcode / QR code via fotocamera.
 * Supporta: QR Code, Code 128, EAN-13, EAN-8, UPC-A, UPC-E, Code 39, ITF, Data Matrix.
 * Usato dal portale dipendenti per riordini magazzino e ordini.
 */
@Injectable({
  providedIn: 'root',
})
export class EpScannerService {
  /** True quando la fotocamera è attiva e la scansione è in corso */
  readonly isScanning = signal<boolean>(false);
  /** Ultimo testo rilevato (utile per debug o anteprima) */
  readonly lastDetected = signal<string>('');
  /** Errore corrente (es. permessi negati, nessuna fotocamera) */
  readonly error = signal<string>('');
  /** Stato attuale dei permessi della fotocamera */
  readonly permissionState = signal<EpCameraPermissionState>('prompt');

  private controls: IScannerControls | null = null;
  private reader: BrowserMultiFormatReader | null = null;

  /**
   * Controlla lo stato dei permessi della fotocamera senza richiederli.
   * Usa navigator.permissions.query quando disponibile.
   */
  async checkPermission(): Promise<EpCameraPermissionState> {
    try {
      if (navigator.permissions && 'query' in navigator.permissions) {
        // @ts-ignore - il tipo PermissionName non include 'camera' in tutte le versioni TS
        const result = await navigator.permissions.query({ name: 'camera' });
        const state = result.state as EpCameraPermissionState;
        this.permissionState.set(state);
        return state;
      }
    } catch {
      /* browser non supporta l'API permissions */
    }
    this.permissionState.set('unsupported');
    return 'unsupported';
  }

  /**
   * Richiede esplicitamente i permessi della fotocamera.
   * Questo metodo attiva il prompt nativo del browser se i permessi non sono ancora stati decisi.
   * Se i permessi sono già negati, il browser non mostrerà il prompt: l'utente dovrà abilitarli manualmente.
   * @returns true se i permessi sono stati concessi, false altrimenti
   */
  async requestPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      // Rilascio subito lo stream: mi serve solo per attivare il prompt
      stream.getTracks().forEach((t) => t.stop());
      this.permissionState.set('granted');
      return true;
    } catch (e: unknown) {
      const name = (e as DOMException)?.name ?? '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.permissionState.set('denied');
        this.error.set('Accesso alla fotocamera negato. Abilita i permessi nelle impostazioni del browser.');
      } else {
        this.error.set(this.humanizeError(e));
      }
      return false;
    }
  }

  /**
   * Avvia la scansione sulla fotocamera posteriore.
   * @param videoElement elemento <video> dove mostrare lo stream
   * @param onResult callback invocato a ogni codice rilevato
   */
  async start(
    videoElement: HTMLVideoElement,
    onResult: (text: string) => void,
  ): Promise<void> {
    this.error.set('');
    this.lastDetected.set('');

    // Aggiorno lo stato dei permessi prima di partire
    await this.checkPermission();

    // Se già in corso, fermo prima per evitare doppi stream
    if (this.controls) {
      this.stop();
    }

    // BrowserMultiFormatReader supporta tutti i formati più comuni
    this.reader = new BrowserMultiFormatReader();

    try {
      // Preferisce la fotocamera posteriore (environment)
      this.controls = await this.reader.decodeFromVideoDevice(
        undefined,
        videoElement,
        (result: Result | undefined, err: unknown, controls: IScannerControls) => {
          if (result) {
            const text = result.getText();
            this.lastDetected.set(text);
            onResult(text);
            // Auto-stop dopo il primo rilevamento per evitare ripetizioni
            controls.stop();
            this.stop();
          }
        },
      );
      this.isScanning.set(true);
      this.permissionState.set('granted');
    } catch (e: unknown) {
      const msg = this.humanizeError(e);
      this.error.set(msg);
      this.isScanning.set(false);
      // Aggiorno lo stato dei permessi in base all'errore
      const name = (e as DOMException)?.name ?? '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.permissionState.set('denied');
      }
    }
  }

  /** Ferma la scansione e rilascia la fotocamera */
  stop(): void {
    if (this.controls) {
      try {
        this.controls.stop();
      } catch {
        /* ignore */
      }
      this.controls = null;
    }
    this.reader = null;
    this.isScanning.set(false);

    // Rilascia esplicitamente i media stream per spegnere la luce della fotocamera
    const video = document.querySelector<HTMLVideoElement>('video.ep-scanner-video');
    if (video?.srcObject) {
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  }

  /**
   * Restituisce istruzioni dettagliate per abilitare la fotocamera nel browser corrente.
   * Include passaggi specifici per Chrome (Android), Safari (iOS) e browser desktop.
   */
  getPermissionInstructions(): { browser: string; steps: string[] } {
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isSafari = isIOS || (/safari/.test(ua) && !/chrome|crios|fxios|edg|opr/.test(ua));
    const isChrome = /chrome|crios/.test(ua) && !/edg|opr/.test(ua);
    const isFirefox = /firefox|fxios/.test(ua);

    if (isSafari) {
      return {
        browser: 'Safari',
        steps: [
          'Apri l\'app Impostazioni di iOS',
          'Scorri e tocca "Safari"',
          'Tocca "Fotocamera"',
          'Seleziona "Consenti"',
          'Torna al portale e riprova',
        ],
      };
    }
    if (isChrome) {
      return {
        browser: isIOS ? 'Chrome (iOS)' : 'Chrome',
        steps: isIOS
          ? [
              'Apri l\'app Impostazioni di iOS',
              'Scorri e tocca "Chrome"',
              'Tocca "Fotocamera"',
              'Attiva l\'interruttore',
              'Torna al portale e riprova',
            ]
          : [
              'Tocca i tre puntini ⋮ in alto a destra',
              'Vai su "Impostazioni" → "Privacy e sicurezza"',
              'Tocca "Autorizzazioni sito" → "Fotocamera"',
              'Trova questo sito e seleziona "Consenti"',
              'Torna al portale e riprova',
            ],
      };
    }
    if (isFirefox) {
      return {
        browser: 'Firefox',
        steps: [
          'Tocca i tre puntini ⋮ in alto a destra',
          'Vai su "Impostazioni" → "Privacy e sicurezza"',
          'Nella sezione "Permessi" tocca "Fotocamera"',
          'Trova questo sito e seleziona "Consenti"',
          'Torna al portale e riprova',
        ],
      };
    }
    return {
      browser: 'Browser',
      steps: [
        'Apri le impostazioni del browser',
        'Vai su "Privacy e sicurezza" → "Permessi"',
        'Seleziona "Fotocamera"',
        'Trova questo sito e consenti l\'accesso alla fotocamera',
        'Torna al portale e riprova',
      ],
    };
  }

  /** Converte errori tecnici in messaggi comprensibili all'utente */
  private humanizeError(e: any): string {
    const name = e?.name ?? '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Accesso alla fotocamera negato. Abilita i permessi nelle impostazioni del browser.';
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return 'Nessuna fotocamera rilevata sul dispositivo.';
    }
    if (name === 'NotReadableError') {
      return 'La fotocamera è già in uso da un\'altra applicazione.';
    }
    return 'Impossibile avviare la fotocamera. Riprova.';
  }
}
