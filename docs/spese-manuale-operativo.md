# Manuale Operativo Gestione Spese

## 1. Nuova spesa
- Apri **Spese** dal menu principale.
- Compila il modulo con campi obbligatori:
  - descrizione
  - importo
  - data
  - categoria
  - fornitore
  - metodo pagamento
- Inserisci opzionali:
  - note
  - allegato PDF
  - codice progetto
  - centro di costo
- Salva con **Registra spesa**.

## 2. Tipologie pagamento
- **Singolo**: una sola scadenza.
- **Rateale**: numero rate configurabile.
- **Ricorrente**: frequenza mensile/trimestrale/annuale.
- Ogni rata usa preavviso notifica da 1 a 30 giorni.

## 3. Promemoria e notifiche
- Dashboard mostra widget **Promemoria pagamenti**.
- Sezione Spese mostra rate in scadenza.
- Alert predisposti su soglie 7/3/1 giorni.
- Le notifiche sono tracciate nel log interno.
- Puoi eseguire manualmente il controllo con **Esegui controllo 7/3/1**.
- Puoi abilitare notifiche browser con **Abilita push browser**.

## 4. Integrazione magazzino
- Ogni carico magazzino genera automaticamente:
  - voce in registro spese (stato prevista)
  - collegamento source `magazzino`
  - riferimento documento

## 5. Registro e filtri
- Filtri disponibili:
  - ricerca libera
  - stato pagamento
  - tipo pagamento
  - fornitore
- Vista con importo, categoria, fornitore, stato.
- Export disponibili:
  - CSV (compatibile Excel)
  - PDF via stampa professionale

## 6. Fornitori
- Anagrafica completa in sezione Spese.
- Inserimento rapido durante operatività.
- Associazione a spesa o voce generica utenza.

## 7. Permessi multi-ruolo
- Selettore ruolo operativo:
  - admin
  - finance
  - operations
  - viewer
- Le azioni di creazione/modifica sono abilitate in base ai permessi del ruolo.
