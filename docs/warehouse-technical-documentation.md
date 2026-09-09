# Documentazione Tecnica Magazzino

## Architettura
- Frontend: Angular standalone components.
- Stato applicativo: `AudiomaxDataService` con signal/computed.
- Persistenza locale: snapshot JSON in `localStorage`.
- Persistenza remota: Supabase con schema SQL in `supabase/audiomax_state.sql`.

## Modello Dati
- `InventoryItemRecord`: anagrafica prodotto e stato scorta.
- `WarehouseLotRecord`: gestione lotti multi-prezzo.
- `WarehouseMovementRecord`: storico movimenti carico/scarico/rettifica/prenotazione.
- `WarehousePositionRecord`: codifica scaffali gerarchica.
- `WarehousePurchaseRecord`: integrazione costi e collegamento spese.
- `WarehouseAdjustmentRecord`: rettifiche inventario.
- `WarehouseAuditRecord`: audit modifiche critiche.

## Logica Principale
- `receiveWarehouseStock(payload)`:
  - crea/aggiorna prodotto
  - verifica prezzo rispetto lotto più recente
  - genera nuovo lotto se prezzo diverso
  - registra movimento di carico
  - registra acquisto con costi extra
  - aggiorna posizione scaffale
  - aggiunge audit
- `consumeInventoryFifoByItemId(params)`:
  - ordina lotti per data crescente
  - scarica quantità in FIFO
  - registra movimenti per lotto
  - aggiorna stock prodotto
  - traccia audit
- `adjustInventoryQuantity(params)`:
  - calcola delta rispetto stock attuale
  - delta negativo: scarico FIFO
  - delta positivo: crea lotto rettifica
  - registra rettifica + audit

## UI Operativa
- `section-page.html` sezione `@case ('magazzino')`:
  - scheda carico merce completa
  - inventario real-time con alert
  - rettifica con storico
  - gestione lotti FIFO
  - storico movimenti filtrabile
  - mappa scaffali e etichette
  - analisi costi fornitore

## Script Database
- Nuove tabelle:
  - `crm_inventory_lots`
  - `crm_inventory_movements`
  - `crm_inventory_positions`
  - `crm_inventory_purchases`
  - `crm_inventory_adjustments`
  - `crm_inventory_audit_log`
- RLS abilitato su tutte le tabelle.
- Policy CRUD `anon` allineate al resto dell’applicazione.

## Sicurezza e Integrità
- Movimento e rettifica tracciati in audit.
- Riferimenti relazionali con `foreign key`.
- Uso di identificativi univoci `crypto.randomUUID()`.
- Stati inventario ricalcolati centralmente.

## Backup e Continuità Operativa
- Backup giornaliero raccomandato:
  - dump PostgreSQL tabelle `crm_inventory_*`
  - retention minima 30 giorni
- Verifica restore mensile su ambiente staging.
