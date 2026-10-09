# Audiomax

Gestionale desktop-first sviluppato con Angular e Supabase per coprire CRM, preventivi, agenda, magazzino, cassa, report e gestione dipendenti.

## Stack

- Angular 21 standalone
- Signals e Reactive Forms
- Supabase per sincronizzazione e persistenza remota
- Vitest tramite `ng test`

## Script disponibili

```bash
npm start
npm run build
npm test -- --watch=false
```

## Avvio locale

```bash
npm install
npm start
```

L'app viene servita su `http://localhost:4200/`.

## Qualità

- Build produzione: `npm run build`
- Test unitari: `npm test -- --watch=false`

## Note architetturali

- La shell applicativa vive in `src/app/app.*`
- Dashboard e sezioni operative sono in `src/app/dashboard-page.*` e `src/app/section-page.*`
- Lo stato condiviso e la logica di dominio sono centralizzati in `src/app/audiomax-data.service.ts`
- La configurazione Supabase è in `src/app/supabase.config.ts`

## Stato attuale

- I test unitari inclusi nel repository passano
- La build di produzione passa
- Il bundle iniziale supera ancora il budget configurato, quindi il prossimo passo consigliato è introdurre lazy loading e scomporre `SectionPageComponent`
