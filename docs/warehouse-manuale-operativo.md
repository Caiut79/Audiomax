# Manuale Utente Magazzino Professionale

## 1. Inserimento Merci
- Apri modulo **Magazzino**.
- Compila il form **Carico merce professionale** con:
  - codice prodotto
  - descrizione
  - unità di misura
  - quantità
  - prezzo acquisto unitario
  - data ricevimento
  - fornitore
  - numero lotto
  - data scadenza
  - codice scaffale
  - numero documento
  - scorta minima
  - operatore
  - costi aggiuntivi (trasporto, dogana, imballaggio)
- Premi **Registra carico**.

## 2. Gestione Lotti e FIFO
- Ogni carico genera o aggiorna un lotto.
- Se il prezzo differisce dal lotto più recente, il sistema crea un nuovo lotto.
- I codici lotto seguono formato progressivo `LOTTO-001`, `LOTTO-002`.
- Gli scarichi usano FIFO automatico: prima i lotti più vecchi.

## 3. Inventario e Rettifiche
- Seleziona un prodotto nella lista **Inventario in tempo reale**.
- Usa **Rettifica inventario** per allineare quantità reale e quantità sistema.
- Il sistema salva:
  - quantità precedente
  - quantità reale
  - delta
  - causale
  - operatore
  - data e ora

## 4. Storico Movimenti
- Nel riquadro **Storico movimenti** filtra per:
  - tipo movimento
  - operatore
  - intervallo date
- Ogni riga mostra tipo, documento, causale, modulo sorgente, quantità.

## 5. Posizioni Scaffali
- Codifica supportata: `A-01-03` (zona-scaffale-piano).
- Le posizioni vengono aggiornate automaticamente al carico.
- Sezione **Scaffali, etichette, costi** include:
  - mappa zone
  - etichette barcode testuali per stampa

## 6. Integrazione Costi/Spese
- Ogni carico genera un record acquisto con:
  - costo prodotto
  - costi aggiuntivi
  - totale
  - collegamento `linkedExpenseId`
- La sezione **Analisi costi fornitore** riepiloga costi e numero carichi.

## 7. Avvisi Scorta Minima
- I prodotti sotto soglia compaiono in **Alert scorte minime**.
- Stato articolo aggiornato automaticamente:
  - disponibile
  - bassa-scorta
  - esaurito
