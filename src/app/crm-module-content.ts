import { CrmSectionId } from './crm-sections';

export interface ModuleMetric {
  label: string;
  value: string;
  detail: string;
}

export interface ModuleWorkflowStep {
  label: string;
  value: string;
  state: 'ok' | 'warning' | 'neutral';
}

export interface ModuleQueueItem {
  title: string;
  subtitle: string;
  owner: string;
  status: string;
  due: string;
}

export interface CrmModuleContent {
  sectionId: CrmSectionId;
  operationalStatus: string;
  owner: string;
  primaryAction: string;
  secondaryAction: string;
  metrics: ModuleMetric[];
  workflow: ModuleWorkflowStep[];
  queue: ModuleQueueItem[];
  checklist: string[];
  integrations: string[];
}

export const crmModuleContent: Record<CrmSectionId, CrmModuleContent> = {
  agenda: {
    sectionId: 'agenda',
    operationalStatus: 'Agenda pronta con pianificazione installazioni, sopralluoghi e assistenze.',
    owner: 'Front office + coordinamento tecnico',
    primaryAction: 'Nuovo appuntamento',
    secondaryAction: 'Vista tecnici',
    metrics: [
      { label: 'Appuntamenti oggi', value: '18', detail: '6 showroom, 8 domicilio, 4 officina' },
      { label: 'Tecnici in uscita', value: '7', detail: 'Copertura completa zone nord e centro' },
      { label: 'Richieste urgenti', value: '3', detail: 'Da assegnare entro le 11:30' },
    ],
    workflow: [
      { label: 'Richieste ricevute', value: '24', state: 'ok' },
      { label: 'Interventi assegnati', value: '18', state: 'ok' },
      { label: 'Slot da confermare', value: '6', state: 'warning' },
    ],
    queue: [
      {
        title: 'Installazione home theater Villa Serra',
        subtitle: 'Sopralluogo finale con verifica cablaggio e taratura audio',
        owner: 'Marco + Luca',
        status: 'Confermato',
        due: '09:30',
      },
      {
        title: 'Assistenza multiroom Residence Blu',
        subtitle: 'Cliente richiede controllo zone cucina e living',
        owner: 'Sara',
        status: 'In viaggio',
        due: '11:15',
      },
      {
        title: 'Dimostrazione showroom Sonus Fabri',
        subtitle: 'Appuntamento commerciale con focus diffusori premium',
        owner: 'Giulia',
        status: 'Da preparare',
        due: '16:00',
      },
    ],
    checklist: [
      'Confermare le finestre orarie dei servizi esterni',
      'Associare i materiali riservati agli appuntamenti',
      'Inviare promemoria automatici ai clienti del pomeriggio',
    ],
    integrations: ['Clienti', 'Servizi', 'Orari dipendenti', 'Servizio tecnico'],
  },
  magazzino: {
    sectionId: 'magazzino',
    operationalStatus: 'Magazzino impostato per stock, prelievi tecnici e riordino.',
    owner: 'Responsabile logistica',
    primaryAction: 'Nuovo carico',
    secondaryAction: 'Genera riordino',
    metrics: [
      { label: 'Referenze monitorate', value: '642', detail: 'Cavi, elettroniche, supporti e accessori' },
      { label: 'Scorte minime', value: '14', detail: 'Articoli da riordinare nelle prossime 24h' },
      { label: 'Prelievi aperti', value: '9', detail: 'Richieste collegate a servizi di oggi' },
    ],
    workflow: [
      { label: 'Disponibile', value: '580', state: 'ok' },
      { label: 'Impegnato', value: '48', state: 'neutral' },
      { label: 'Sotto soglia', value: '14', state: 'warning' },
    ],
    queue: [
      {
        title: 'Ricevitore AV Denon AVR-X2800H',
        subtitle: 'Disponibilità residua 2 unità su soglia minima 4',
        owner: 'Magazzino',
        status: 'Riordino',
        due: 'Oggi',
      },
      {
        title: 'Kit cavi HDMI 8K 10m',
        subtitle: 'Materiale prenotato per 3 installazioni della settimana',
        owner: 'Servizi',
        status: 'Impegnato',
        due: 'Domani',
      },
      {
        title: 'Staffe a parete premium',
        subtitle: 'Confronto listino fornitore A e fornitore B',
        owner: 'Acquisti',
        status: 'Valutazione',
        due: '48h',
      },
    ],
    checklist: [
      'Attivare vista inventario per categoria e marca',
      'Collegare i prelievi ai ticket di assistenza',
      'Impostare alert automatici sulle scorte minime',
    ],
    integrations: ['Fornitori', 'Servizi', 'Servizio tecnico', 'E-commerce'],
  },
  spese: {
    sectionId: 'spese',
    operationalStatus: 'Spese organizzate per categoria, fornitore e centro di costo.',
    owner: 'Amministrazione',
    primaryAction: 'Registra uscita',
    secondaryAction: 'Filtra per mese',
    metrics: [
      { label: 'Spese mese', value: '€ 18.240', detail: 'Acquisti tecnici, trasferte e costi interni' },
      { label: 'Fatture da verificare', value: '7', detail: '3 fornitori, 4 rimborsi' },
      { label: 'Costo servizi esterni', value: '€ 4.920', detail: 'Incidenza attuale 27%' },
    ],
    workflow: [
      { label: 'Registrate', value: '46', state: 'ok' },
      { label: 'Da approvare', value: '7', state: 'warning' },
      { label: 'Liquidate', value: '39', state: 'neutral' },
    ],
    queue: [
      {
        title: 'Rimborso carburante squadra installazioni',
        subtitle: 'Trasferte zona lago con due veicoli aziendali',
        owner: 'Roberto',
        status: 'Da approvare',
        due: 'Oggi',
      },
      {
        title: 'Fattura cablaggi e canaline',
        subtitle: 'Fornitore TecnoCab - lotto per cantiere in corso',
        owner: 'Amministrazione',
        status: 'Da registrare',
        due: '14:00',
      },
      {
        title: 'Canone piattaforma assistenza remota',
        subtitle: 'Rinnovo trimestrale servizi post-vendita',
        owner: 'Direzione',
        status: 'Programmato',
        due: '30/03',
      },
    ],
    checklist: [
      'Unificare categorie spesa con movimenti di cassa',
      'Agganciare la spesa al relativo fornitore',
      'Tenere separati costi showroom, officina e servizi esterni',
    ],
    integrations: ['Cassa', 'Fornitori', 'Servizi'],
  },
  cassa: {
    sectionId: 'cassa',
    operationalStatus: 'Cassa pronta per incassi, acconti e saldi.',
    owner: 'Amministrazione + vendite',
    primaryAction: 'Nuovo movimento',
    secondaryAction: 'Chiusura giornaliera',
    metrics: [
      { label: 'Saldo attuale', value: '€ 12.870', detail: 'Aggiornato agli ultimi 20 minuti' },
      { label: 'Incassi oggi', value: '€ 3.460', detail: '5 transazioni showroom, 2 servizi' },
      { label: 'Acconti aperti', value: '€ 9.200', detail: 'Da riconciliare su 11 preventivi' },
    ],
    workflow: [
      { label: 'Movimenti inseriti', value: '31', state: 'ok' },
      { label: 'Da riconciliare', value: '5', state: 'warning' },
      { label: 'Chiusi', value: '26', state: 'neutral' },
    ],
    queue: [
      {
        title: 'Saldo installazione Sala Cinema Bianchi',
        subtitle: 'Bonifico ricevuto, collegare al preventivo confermato',
        owner: 'Giulia',
        status: 'Da riconciliare',
        due: 'Oggi',
      },
      {
        title: 'Acconto impianto multiroom Loft 21',
        subtitle: 'Pagamento POS effettuato in showroom',
        owner: 'Cassa',
        status: 'Registrato',
        due: '10:20',
      },
      {
        title: 'Incasso assistenza a domicilio',
        subtitle: 'Pagamento in contanti con ricevuta da allegare',
        owner: 'Marco',
        status: 'Da chiudere',
        due: '18:00',
      },
    ],
    checklist: [
      'Collegare acconti e saldi ai preventivi confermati',
      'Registrare la modalità di pagamento per ogni servizio',
      'Preparare report chiusura cassa per fine giornata',
    ],
    integrations: ['Preventivi', 'Spese', 'Clienti'],
  },
  servizi: {
    sectionId: 'servizi',
    operationalStatus: 'Servizi interni ed esterni allineati per presa in carico e consegna.',
    owner: 'Coordinamento tecnico',
    primaryAction: 'Apri servizio',
    secondaryAction: 'Assegna squadra',
    metrics: [
      { label: 'Servizi aperti', value: '24', detail: '12 installazioni, 7 assistenze, 5 collaudi' },
      { label: 'In esecuzione', value: '8', detail: 'Con squadre già sul campo' },
      { label: 'Materiali prenotati', value: '19', detail: 'Prelievi confermati dal magazzino' },
    ],
    workflow: [
      { label: 'Nuovi ticket', value: '11', state: 'warning' },
      { label: 'Pianificati', value: '13', state: 'ok' },
      { label: 'Chiusi', value: '8', state: 'neutral' },
    ],
    queue: [
      {
        title: 'Installazione sistema Dolby Atmos',
        subtitle: 'Cantiere cliente premium con richiesta di finitura invisibile',
        owner: 'Squadra A',
        status: 'In corso',
        due: 'Oggi',
      },
      {
        title: 'Riconfigurazione rack audio showroom',
        subtitle: 'Servizio interno per nuova area demo high-end',
        owner: 'Laboratorio',
        status: 'Da iniziare',
        due: '13:30',
      },
      {
        title: 'Sostituzione amplificatore zona outdoor',
        subtitle: 'Intervento esterno con verifica alimentazione e rete',
        owner: 'Squadra B',
        status: 'In attesa materiale',
        due: 'Domani',
      },
    ],
    checklist: [
      'Agganciare ogni servizio a cliente, agenda e materiali',
      'Monitorare SLA tra apertura, uscita e chiusura',
      'Raccogliere firma cliente o conferma esito',
    ],
    integrations: ['Agenda', 'Magazzino', 'Clienti', 'Servizio tecnico'],
  },
  orari: {
    sectionId: 'orari',
    operationalStatus: 'Anagrafica dipendenti pronta per creazione, modifica e stato operativo.',
    owner: 'Risorse umane',
    primaryAction: 'Nuovo dipendente',
    secondaryAction: 'Aggiorna anagrafica',
    metrics: [
      { label: 'Dipendenti attivi', value: '14', detail: 'Vendita, tecnico, amministrazione e magazzino' },
      { label: 'Titolari', value: '2', detail: 'Profili amministrativi sempre disponibili' },
      { label: 'Disattivati', value: '1', detail: 'Profili esclusi dai flussi quotidiani' },
    ],
    workflow: [
      { label: 'Profili completi', value: '12', state: 'ok' },
      { label: 'Da aggiornare', value: '2', state: 'warning' },
      { label: 'Nuovi inserimenti', value: '1', state: 'neutral' },
    ],
    queue: [
      {
        title: 'Copertura showroom sabato pomeriggio',
        subtitle: 'Serve conferma presenza consulente senior',
        owner: 'Direzione',
        status: 'Da approvare',
        due: 'Oggi',
      },
      {
        title: 'Rotazione tecnici per uscite domicilio',
        subtitle: 'Bilanciamento km e competenze su impianti custom',
        owner: 'Coordinamento',
        status: 'Revisione',
        due: '17:00',
      },
      {
        title: 'Turno laboratorio riparazioni',
        subtitle: 'Aumento carico ticket audio vintage',
        owner: 'Officina',
        status: 'Confermato',
        due: 'Settimana',
      },
    ],
    checklist: [
      'Aprire subito la scheda anagrafica dal registro dipendenti',
      'Tenere allineati ruolo, mansione e stato operativo',
      'Ridurre i passaggi di inserimento del personale',
    ],
    integrations: ['Cassa', 'Servizi', 'Portale dipendenti'],
  },
  preventivi: {
    sectionId: 'preventivi',
    operationalStatus: 'Preventivi pronti con prodotti, installazione e manodopera.',
    owner: 'Area commerciale',
    primaryAction: 'Nuovo preventivo',
    secondaryAction: 'Invia revisione',
    metrics: [
      { label: 'Bozze attive', value: '17', detail: '9 home theater, 5 multiroom, 3 assistenze' },
      { label: 'Valore pipeline', value: '€ 146.000', detail: 'Ticket medio elevato su impianti premium' },
      { label: 'Da richiamare', value: '6', detail: 'Clienti che attendono revisione finale' },
    ],
    workflow: [
      { label: 'Bozze', value: '17', state: 'warning' },
      { label: 'In trattativa', value: '9', state: 'ok' },
      { label: 'Confermati', value: '4', state: 'neutral' },
    ],
    queue: [
      {
        title: 'Cinema room Villa Orione',
        subtitle: 'Richiesta aggiornamento su diffusori e automazione tende',
        owner: 'Giulia',
        status: 'Revisione cliente',
        due: 'Oggi',
      },
      {
        title: 'Impianto audio distribuito B&B Le Onde',
        subtitle: 'Soluzione multi-zona con amplificatori slim rack',
        owner: 'Lorenzo',
        status: 'Bozza interna',
        due: '15:30',
      },
      {
        title: 'Upgrade sala living Rossi',
        subtitle: 'Cliente confermabile dopo sopralluogo tecnico',
        owner: 'Giulia + Marco',
        status: 'Da allineare',
        due: 'Domani',
      },
    ],
    checklist: [
      'Distinguere prodotto, installazione e servizio tecnico',
      'Collegare il preventivo al cliente e allo stato incasso',
      'Preparare revisioni multiple senza perdere storico',
    ],
    integrations: ['Clienti', 'Cassa', 'Magazzino', 'E-commerce'],
  },
  clienti: {
    sectionId: 'clienti',
    operationalStatus: 'Rubrica unica per clienti, aziende e fornitori.',
    owner: 'Vendite + amministrazione',
    primaryAction: 'Nuovo contatto',
    secondaryAction: 'Apri dettaglio',
    metrics: [
      { label: 'Contatti attivi', value: '1.284', detail: 'Clienti, aziende e fornitori in rubrica unica' },
      { label: 'Lead da richiamare', value: '22', detail: '15 dal sito, 7 dal negozio' },
      { label: 'Aziende', value: '34', detail: 'Con dati fatturazione e storico ordini' },
    ],
    workflow: [
      { label: 'Nuovi contatti', value: '22', state: 'warning' },
      { label: 'In gestione', value: '41', state: 'ok' },
      { label: 'Follow-up chiusi', value: '18', state: 'neutral' },
    ],
    queue: [
      {
        title: 'Famiglia Bianchi',
        subtitle: 'Storico completo tra showroom, preventivi e due installazioni',
        owner: 'Giulia',
        status: 'Follow-up',
        due: 'Oggi',
      },
      {
        title: 'Lead sito - Sala cinema privata',
        subtitle: 'Richiesta preventivo form premium ricevuta stanotte',
        owner: 'Lorenzo',
        status: 'Nuovo lead',
        due: '11:00',
      },
      {
        title: 'Cliente assistenza Denon vintage',
        subtitle: 'Richiede aggiornamento stato riparazione in officina',
        owner: 'Customer care',
        status: 'Da contattare',
        due: '16:30',
      },
    ],
    checklist: [
      'Centralizzare recapiti e note per tutti i contatti',
      'Unire storico commerciale e storico tecnico',
      'Gestire clienti/aziende/fornitori nello stesso modulo',
    ],
    integrations: ['Preventivi', 'Agenda', 'Servizi', 'Servizio tecnico', 'E-commerce'],
  },
  dipendenti: {
    sectionId: 'dipendenti',
    operationalStatus: 'Portale dipendenti pronto per task, materiali e segnalazioni.',
    owner: 'Operations',
    primaryAction: 'Assegna task',
    secondaryAction: 'Nuova segnalazione',
    metrics: [
      { label: 'Task assegnati', value: '37', detail: 'Ripartiti tra showroom, officina e tecnici esterni' },
      { label: 'Segnalazioni aperte', value: '11', detail: '5 materiali, 3 sicurezza, 3 processo' },
      { label: 'Richieste materiale', value: '8', detail: 'Da evadere entro fine turno' },
    ],
    workflow: [
      { label: 'Task aperti', value: '37', state: 'warning' },
      { label: 'In lavorazione', value: '19', state: 'ok' },
      { label: 'Risolti', value: '18', state: 'neutral' },
    ],
    queue: [
      {
        title: 'Segnalazione mancanza cavi ottici demo',
        subtitle: 'Showroom principale chiede reintegro immediato',
        owner: 'Paolo',
        status: 'Aperta',
        due: 'Oggi',
      },
      {
        title: 'Richiesta staffe aggiuntive per intervento',
        subtitle: 'Team domicilio necessita integrazione materiale prima della partenza',
        owner: 'Squadra B',
        status: 'Da evadere',
        due: '10:45',
      },
      {
        title: 'Check sicurezza area officina',
        subtitle: 'Verifica strumentazione e banco test finale',
        owner: 'Responsabile interno',
        status: 'In corso',
        due: 'Fine turno',
      },
    ],
    checklist: [
      'Consentire segnalazioni rapide da mobile',
      'Associare task e materiale al singolo servizio',
      'Tenere traccia dello storico interventi del personale',
    ],
    integrations: ['Servizi', 'Magazzino', 'Orari dipendenti'],
  },
  tecnico: {
    sectionId: 'tecnico',
    operationalStatus: 'Laboratorio tecnico pronto per officina, ritiro e domicilio.',
    owner: 'Capo tecnico',
    primaryAction: 'Apri ticket tecnico',
    secondaryAction: 'Accetta in officina',
    metrics: [
      { label: 'Ticket aperti', value: '32', detail: '18 officina, 14 domicilio' },
      { label: 'Diagnosi in corso', value: '9', detail: 'Tra AV receiver, giradischi e diffusori attivi' },
      { label: 'Pronti alla consegna', value: '6', detail: 'Clienti da contattare per ritiro o uscita' },
    ],
    workflow: [
      { label: 'Accettati', value: '32', state: 'neutral' },
      { label: 'In diagnosi', value: '9', state: 'warning' },
      { label: 'Chiusi', value: '17', state: 'ok' },
    ],
    queue: [
      {
        title: 'Riparazione amplificatore valvolare',
        subtitle: 'Cliente storico, attesa ricambio alimentazione dedicato',
        owner: 'Laboratorio',
        status: 'In diagnosi',
        due: 'Oggi',
      },
      {
        title: 'Intervento domicilio streamer audio',
        subtitle: 'Problema rete e app di controllo su impianto esistente',
        owner: 'Luca',
        status: 'Pianificato',
        due: 'Domani',
      },
      {
        title: 'Collaudo finale subwoofer custom',
        subtitle: 'Test vibrazioni e risposta ambiente dopo riparazione',
        owner: 'Marco',
        status: 'Quasi chiuso',
        due: '15:00',
      },
    ],
    checklist: [
      'Separare ticket officina, domicilio e post-vendita',
      'Allegare materiale utilizzato al ticket tecnico',
      'Aggiornare il cliente sullo stato della lavorazione',
    ],
    integrations: ['Clienti', 'Magazzino', 'Agenda', 'Servizi'],
  },
  impostazioni: {
    sectionId: 'impostazioni',
    operationalStatus: 'Configurazione azienda e operatori.',
    owner: 'Amministrazione',
    primaryAction: 'Modifica impostazioni',
    secondaryAction: 'Gestisci operatori',
    metrics: [],
    workflow: [],
    queue: [],
    checklist: [],
    integrations: [],
  },
  report: {
    sectionId: 'report',
    operationalStatus: 'Report e statistiche operative.',
    owner: 'Direzione',
    primaryAction: 'Torna in cassa',
    secondaryAction: 'Apri dettaglio',
    metrics: [],
    workflow: [],
    queue: [],
    checklist: [],
    integrations: [],
  },
  ecommerce: {
    sectionId: 'ecommerce',
    operationalStatus: 'Canale e-commerce predisposto per catalogo, lead e ordini.',
    owner: 'Marketing + vendite online',
    primaryAction: 'Sincronizza catalogo',
    secondaryAction: 'Apri lead web',
    metrics: [
      { label: 'Prodotti pronti al sync', value: '214', detail: 'Categorie selezionate per il sito' },
      { label: 'Lead web mese', value: '39', detail: 'Richieste da catalogo e form preventivo' },
      { label: 'Ordini monitorati', value: '12', detail: 'Con stato disponibilità e logistica' },
    ],
    workflow: [
      { label: 'Catalogo da pubblicare', value: '214', state: 'neutral' },
      { label: 'Lead da contattare', value: '15', state: 'warning' },
      { label: 'Ordini confermati', value: '12', state: 'ok' },
    ],
    queue: [
      {
        title: 'Sincronizzazione prodotti home theater',
        subtitle: 'Priorità a bundle premium con disponibilità reale',
        owner: 'Marketing',
        status: 'In preparazione',
        due: 'Oggi',
      },
      {
        title: 'Lead form configurazione sala cinema',
        subtitle: 'Richiesta arrivata dal sito con budget e metratura',
        owner: 'Vendite online',
        status: 'Nuovo lead',
        due: '11:30',
      },
      {
        title: 'Ordine supporti speaker design',
        subtitle: 'Confermare disponibilità e data evasione con magazzino',
        owner: 'Backoffice web',
        status: 'Da allineare',
        due: '14:45',
      },
    ],
    checklist: [
      'Mappare prodotti, disponibilità e lead in un unico flusso',
      'Distinguere vendita online da richiesta consulenza',
      'Sincronizzare stato ordine con magazzino e cassa',
    ],
    integrations: ['Clienti', 'Magazzino', 'Preventivi', 'Cassa'],
  },
};
