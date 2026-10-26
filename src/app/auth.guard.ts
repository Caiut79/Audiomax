import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Protegge le rotte del gestionale.
 *
 * Regola:
 * - se esiste una sessione, l'accesso è consentito;
 * - se il backend account non è ancora disponibile (script SQL non eseguito,
 *   Supabase non configurato o offline) l'accesso resta consentito, così il
 *   gestionale non si blocca completamente durante la messa in servizio;
 * - altrimenti si viene rimandati alla pagina di login.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated() || !auth.authBackendReady()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

/**
 * Impedisce di riaprire la pagina di login quando la sessione è già attiva.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
