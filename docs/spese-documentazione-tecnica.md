# Documentazione Tecnica Modulo Spese

## Architettura
- Modulo implementato in Angular dentro `section-page` (`@case('spese')`).
- Logica dominio centralizzata in `AudiomaxDataService`.
- Persistenza locale tramite snapshot `AudiomaxState`.
- Persistenza SQL predisposta in `supabase/audiomax_state.sql`.

## Modello dati runtime
- `ExpenseCategoryRecord`
- `ExpenseSupplierRecord`
- `ExpensePaymentMethodRecord`
- `ExpenseRecord`
- `ExpenseInstallmentRecord`
- `ExpenseNotificationRecord`
- `ExpenseAuditRecord`

## Funzioni principali servizio
- `createExpense(payload)`:
  - calcolo IVA (imponibile/imposta)
  - creazione spesa
  - generazione rate
  - audit automatico
- `markExpenseInstallmentPaid(...)`:
  - pagamento rata
  - aggiornamento stato spesa (`parziale`/`pagata`)
  - audit pagamento
- `runExpenseReminderSweep(...)`:
  - verifica scadenze rate
  - genera notifiche su soglie 7/3/1 giorni
  - aggiorna stato rate in `scaduta` se oltre termine
- `setCurrentUserRole(...)` + `expensePermissions`:
  - gestione permessi runtime per create/update/delete/view
- `receiveWarehouseStock(...)`:
  - sincronizzazione magazzino → spese con creazione automatica uscita prevista.

## Tabelle relazionali SQL
- `categorie_spese`
- `fornitori`
- `metodi_pagamento`
- `registro_spese`
- `spese_rateali`
- `notifiche`

## Sicurezza e controllo
- RLS attivo su tabelle spese.
- Policy CRUD `anon` allineate all’ambiente demo.
- Audit trail su operazioni critiche nel runtime.

## Permessi multi-utente
- Struttura pronta per ruoli applicativi:
  - visualizza
  - crea
  - modifica
  - elimina
- Integrazione ruoli reali demandata a layer auth/ACL.
- Ruoli runtime attuali:
  - admin
  - finance
  - operations
  - viewer
- Controlli lato servizio su create/update spese.
