import { Injectable, signal } from '@angular/core';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Result } from '@zxing/library';

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

  private controls: IScannerControls | null = null;
  private reader: BrowserMultiFormatReader | null = null;

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
    } catch (e: unknown) {
      const msg = this.humanizeError(e);
      this.error.set(msg);
      this.isScanning.set(false);
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
