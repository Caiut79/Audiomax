import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Protegge le rotte del gestionale.
 *
 * Regola: si entra solo con una sessione attiva.
 * Prima di decidere attende l'esito del probe sul backend account: senza questa
 * attesa la prima navigazione (es. apertura del link in produzione) arriverebbe
 * prima della verifica e il gestionale si aprirebbe senza login.
 * Se il backend account non è raggiungibile, la pagina di login mostra un
 * avviso con l'accesso alternativo in locale.
 */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureAuthBackendProbe();

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

/**
 * Impedisce di riaprire la pagina di login quando la sessione è già attiva.
 * Attende il probe come la guardia di accesso, così al reload di un utente
 * già collegato non si vede il login per un istante.
 */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureAuthBackendProbe();

  if (!auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
