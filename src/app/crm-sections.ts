export type CrmSectionId =
  | 'agenda'
  | 'magazzino'
  | 'spese'
  | 'cassa'
  | 'servizi'
  | 'orari'
  | 'preventivi'
  | 'clienti'
  | 'dipendenti'
  | 'tecnico'
  | 'ecommerce'
  | 'impostazioni'
  | 'report';

export interface CrmSection {
  id: CrmSectionId;
  route: string;
  label: string;
  icon: string;
  summary: string;
  description: string;
  highlights: string[];
  metricLabel: string;
  metricValue: string;
}

export const crmSections: CrmSection[] = [
  {
    id: 'agenda',
    route: 'agenda',
    label: 'Agenda',
    icon: '🗓️',
    summary: 'Agenda condivisa per appuntamenti, installazioni e assistenze.',
    description:
      'Organizza sopralluoghi, interventi tecnici, consegne e appuntamenti commerciali in un’unica agenda condivisa.',
    highlights: [
      'Vista giornaliera, settimanale e per tecnico',
      'Assegnazione interventi a domicilio o in officina',
      'Promemoria per appuntamenti e scadenze',
    ],
    metricLabel: 'Attività gestite',
    metricValue: '128',
  },
  {
    id: 'magazzino',
    route: 'magazzino',
    label: 'Magazzino',
    icon: '📦',
    summary: 'Controllo di scorte, movimenti e disponibilità.',
    description:
      'Tiene sotto controllo articoli, kit di installazione, accessori e ricambi, con disponibilità aggiornata e priorità di riordino.',
    highlights: [
      'Disponibilità in tempo reale',
      'Movimenti di carico e scarico',
      'Segnalazione scorte minime e riordini',
    ],
    metricLabel: 'Referenze attive',
    metricValue: '642',
  },
  {
    id: 'spese',
    route: 'spese',
    label: 'Spese',
    icon: '💸',
    summary: 'Gestione operativa delle uscite aziendali.',
    description:
      'Raccoglie costi di acquisto, trasferta, manutenzione e forniture interne in una vista unica.',
    highlights: [
      'Registrazione uscite per categoria',
      'Storico mensile e confronto periodi',
      'Collegamento con fornitori e cassa',
    ],
    metricLabel: 'Uscite del mese',
    metricValue: '€ 18.240',
  },
  {
    id: 'cassa',
    route: 'cassa',
    label: 'Cassa',
    icon: '🧾',
    summary: 'Monitoraggio di incassi, movimenti giornalieri e saldi.',
    description:
      'Centralizza pagamenti, acconti, saldi e movimenti di cassa del negozio e dei servizi.',
    highlights: [
      'Saldo giornaliero immediato',
      'Storico movimenti e causali',
      'Allineamento con preventivi e servizi',
    ],
    metricLabel: 'Saldo corrente',
    metricValue: '€ 12.870',
  },
  {
    id: 'servizi',
    route: 'servizi',
    label: 'Servizi',
    icon: '🛠️',
    summary: 'Gestione di servizi interni ed esterni.',
    description:
      'Coordina installazioni, manutenzioni, richieste clienti e attività tecniche, distinguendo gli interventi in sede da quelli esterni.',
    highlights: [
      'Workflow per presa in carico e chiusura',
      'Stato avanzamento con priorità',
      'Materiale utilizzato durante il servizio',
    ],
    metricLabel: 'Interventi aperti',
    metricValue: '24',
  },
  {
    id: 'orari',
    route: 'orari-dipendenti',
    label: 'Orari e Dipendenti',
    icon: '⏱️',
    summary: 'Programmazione di turni, presenze e disponibilità.',
    description:
      'Pianifica il lavoro del personale tra showroom, officina, installazioni e assistenze, con visibilità sui carichi e sulle disponibilità.',
    highlights: [
      'Turni e disponibilità del team',
      'Assegnazione per area o competenza',
      'Controllo ore dedicate ai servizi',
    ],
    metricLabel: 'Tecnici schedulati',
    metricValue: '9',
  },
  {
    id: 'preventivi',
    route: 'preventivi',
    label: 'Preventivi',
    icon: '🧾',
    summary: 'Preventivi per impianti audio residenziali e commerciali.',
    description:
      'Gestisce preventivi per home theater, multiroom, locali, impianti outdoor e integrazioni domotiche, con prodotti, manodopera e servizi.',
    highlights: [
      'Preventivi con righe prodotto e installazione',
      'Home theater, multiroom, filodiffusione, outdoor',
      'Collegamento con clienti, cassa e ticket tecnico',
    ],
    metricLabel: 'Bozze in corso',
    metricValue: '17',
  },
  {
    id: 'clienti',
    route: 'clienti',
    label: 'Contatti',
    icon: '📇',
    summary: 'Rubrica unica di clienti, aziende e fornitori.',
    description:
      'Raccoglie schede complete con recapiti, note commerciali, interventi tecnici e documenti collegati.',
    highlights: [
      'Clienti, aziende e fornitori nello stesso posto',
      'Storico preventivi, cassa e interventi',
      'Note commerciali e follow-up rapidi',
    ],
    metricLabel: 'Contatti attivi',
    metricValue: '1.284',
  },
  {
    id: 'dipendenti',
    route: 'portale-dipendenti',
    label: 'Portale dipendenti',
    icon: '🧑‍🔧',
    summary: 'Area operativa per task, materiali e segnalazioni.',
    description:
      'Offre al personale un accesso rapido a task assegnati, richieste materiale e segnalazioni operative.',
    highlights: [
      'Elenco attività assegnate',
      'Richieste materiali e segnalazioni',
      'Accesso diretto da mobile per il team',
    ],
    metricLabel: 'Segnalazioni aperte',
    metricValue: '11',
  },
  {
    id: 'tecnico',
    route: 'servizio-tecnico',
    label: 'Servizio tecnico',
    icon: '🔊',
    summary: 'Gestione degli interventi in officina e a domicilio.',
    description:
      'Monitora presa in carico, diagnosi, lavorazioni e consegna delle apparecchiature audio, in laboratorio o presso il cliente.',
    highlights: [
      'Check-in apparati e ticket tecnici',
      'Distinzione officina e domicilio',
      'Storico interventi e materiali usati',
    ],
    metricLabel: 'Ticket tecnici',
    metricValue: '32',
  },
  {
    id: 'ecommerce',
    route: 'ecommerce',
    label: 'E-commerce',
    icon: '🛒',
    summary: 'Base per integrare catalogo e ordini del sito.',
    description:
      'Prepara il collegamento tra CRM e sito per sincronizzare prodotti, lead, richieste commerciali e ordini online.',
    highlights: [
      'Catalogo prodotti sincronizzabile',
      'Lead dal sito e richieste preventivo',
      'Ordini e disponibilità collegati al CRM',
    ],
    metricLabel: 'Canali collegati',
    metricValue: '1',
  },
  {
    id: 'impostazioni',
    route: 'impostazioni',
    label: 'Impostazioni',
    icon: '⚙️',
    summary: 'Configurazione azienda, dipendenti e categorie.',
    description: 'Gestisci dati aziendali, operatori, categorie di servizio e preferenze del gestionale.',
    highlights: [
      'Dati azienda e sede',
      'Gestione operatori e ruoli',
      'Categorie servizi e listini',
    ],
    metricLabel: 'Configurazioni',
    metricValue: '—',
  },
  {
    id: 'report',
    route: 'report',
    label: 'Report',
    icon: '📊',
    summary: 'Statistiche su vendite, servizi e performance.',
    description: 'Panoramica su incassi, servizi, operatori e andamento generale.',
    highlights: [
      'Incassi per periodo e metodo',
      'Performance operatori',
      'Andamento clienti e servizi',
    ],
    metricLabel: 'Report',
    metricValue: '—',
  },
];
