# Documentazione di Manutenzione Futura

## File Principali
- Dominio dati: `src/app/crm-runtime-data.ts`
- Logica applicativa: `src/app/audiomax-data.service.ts`
- UI magazzino: `src/app/section-page.html`, `src/app/section-page.ts`, `src/app/section-page.scss`
- Schema DB: `supabase/audiomax_state.sql`
- Test: `src/app/audiomax-data.service.spec.ts`

## Estensioni consigliate
- Gestione permessi granulari per ruoli:
  - magazziniere
  - amministrazione
  - sola lettura
- Prenotazioni impegni da ordini cliente con release automatica.
- Report mensili/annuali esportabili in CSV/XLSX.
- Barcode reale via libreria stampa termica.

## Operazioni periodiche
- Verifica indici DB su tabelle `crm_inventory_*`.
- Pulizia audit storico oltre retention concordata.
- Controllo consistenza:
  - stock prodotto = somma disponibili lotti
  - movimenti coerenti con rettifiche e scarichi FIFO

## Procedure di emergenza
- Ripristino backup giornaliero DB.
- Rebuild stato locale da Supabase dopo recovery.
- Riesecuzione script schema su ambiente pulito.

## Compatibilità
- Il modulo magazzino è compatibile con i flussi:
  - cassa
  - ticket tecnico
  - dashboard
- Ogni modifica su scarichi stock deve passare da `consumeInventoryFifoByItemId`.
