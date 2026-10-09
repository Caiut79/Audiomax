export interface ClientRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  segment: string;
  preferredContact: 'telefono' | 'email' | 'whatsapp';
  notes: string;
  favoriteBrands: string;
  lastContact: string;
  status: 'lead' | 'occasionale' | 'poco spendente' | 'molto spendente';
  privacyProfile: ClientPrivacyProfile;
}

export interface ClientConsentFlag {
  granted: boolean;
  grantedAt: string | null;
  channel: 'cassa' | 'crm' | 'agenda' | 'link-remoto' | null;
}

export interface ClientPrivacyAuditRecord {
  id: string;
  action:
  | 'informativa-mostrata'
  | 'consenso-email'
  | 'consenso-whatsapp'
  | 'consenso-fidelity'
  | 'cliente-creato'
  | 'link-generato'
  | 'consenso-confermato'
  | 'consenso-revocato';
  detail: string;
  operator: string;
  channel: 'cassa' | 'crm' | 'agenda' | 'link-remoto';
  createdAt: string;
}

export interface ClientPrivacyArchiveRecord {
  id: string;
  type:
  | 'informativa'
  | 'consenso-remoto'
  | 'conferma-consenso'
  | 'revoca-consenso'
  | 'scheda-cliente';
  title: string;
  status: 'bozza' | 'registrato' | 'inviato' | 'confermato' | 'revocato';
  channel: 'cassa' | 'crm' | 'agenda' | 'link-remoto';
  url: string | null;
  createdAt: string;
}

export interface ClientBillingProfile {
  kind: 'privato' | 'azienda';
  taxId: string;
  sdiCode: string;
  pec: string;
  billingAddress: string;
}

export interface ClientPrivacyProfile {
  noticeVersion: string;
  lawfulBasis: 'contratto' | 'precontrattuale' | 'obbligo-legale' | 'consenso';
  noticeAcknowledged: boolean;
  noticeShownAt: string | null;
  dataRetentionNote: string;
  remoteConsentStatus: 'non-inviato' | 'da-inviare' | 'inviato' | 'completato' | 'revocato';
  remoteConsentUrl: string | null;
  emailMarketing: ClientConsentFlag;
  whatsappMarketing: ClientConsentFlag;
  fidelityProfiling: ClientConsentFlag;
  audit: ClientPrivacyAuditRecord[];
  archive: ClientPrivacyArchiveRecord[];
  billingProfile?: ClientBillingProfile;
}

export interface QuoteRecord {
  id: string;
  clientId?: string | null;
  operatorName?: string;
  customerName: string;
  projectType: string;
  value: number;
  stage: 'bozza' | 'trattativa' | 'ordine' | 'confermato';
  dueDate: string;
  issueDate?: string;
  discountAmount?: number;
  isAnonymous?: boolean;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerTaxId?: string;
  customerPec?: string;
  customerSdiCode?: string;
  fulfillmentType?: 'showroom' | 'esterno';
  fulfillmentAddress?: string;
  paymentPlan?: 'unica' | 'finanziamento' | 'rate-negozio';
  installmentCount?: number;
  installmentCadence?: 'settimanale' | 'mensile';
  financingProvider?: string;
  paymentAlertDays?: number;
  paymentNotes?: string;
  attachmentName?: string;
  notes?: string;
  lines?: QuoteLineRecord[];
}

export interface QuoteLineRecord {
  id: string;
  kind: 'servizio' | 'materiale' | 'altro';
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  vatRate: number;
}

export interface AppointmentRecord {
  id: string;
  title: string;
  clientId?: string | null;
  customerName: string;
  appointmentType: 'negozio' | 'uscita' | 'installazione' | 'assistenza' | 'sopralluogo';
  locationType: 'showroom' | 'domicilio' | 'officina';
  address?: string;
  scheduledAt: string;
  durationMinutes: number;
  technician: string;
  linkedQuoteId: string | null;
  status: 'programmato' | 'in-corso' | 'chiuso';
}

export interface InventoryItemRecord {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  usageType: 'rivendita' | 'uso-negozio';
  stock: number;
  minStock: number;
  unitCost: number;
  salePrice: number;
  supplier: string;
  location: string;
  cableRolls?: number | null;
  cableMetersPerRoll?: number | null;
  status: 'disponibile' | 'bassa-scorta' | 'esaurito';
}

export interface WarehouseLotRecord {
  id: string;
  inventoryItemId: string;
  lotCode: string;
  barcode: string;
  supplier: string;
  receivedDate: string;
  receivedQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  unitCost: number;
  salePrice: number;
  expiryDate: string | null;
  shelfCode: string;
  purchaseDocumentNumber: string;
}

export interface WarehouseMovementRecord {
  id: string;
  inventoryItemId: string;
  lotId: string | null;
  movementType: 'carico' | 'scarico' | 'rettifica+/-' | 'prenotazione';
  quantity: number;
  unitCost: number;
  totalCost: number;
  documentNumber: string;
  reason: string;
  operator: string;
  sourceModule: 'magazzino' | 'cassa' | 'tecnico' | 'inventario';
  movedAt: string;
}

export interface WarehousePositionRecord {
  id: string;
  code: string;
  zone: string;
  shelf: string;
  level: string;
  occupiedInventoryItemIds: string[];
}

export interface WarehousePurchaseRecord {
  id: string;
  inventoryItemId: string;
  lotId: string;
  supplier: string;
  documentNumber: string;
  receivedDate: string;
  quantity: number;
  unitCost: number;
  transportCost: number;
  customsCost: number;
  packagingCost: number;
  totalCost: number;
  linkedExpenseId: string;
}

export interface WarehouseAdjustmentRecord {
  id: string;
  inventoryItemId: string;
  lotId: string | null;
  previousQuantity: number;
  actualQuantity: number;
  deltaQuantity: number;
  reason: string;
  operator: string;
  adjustedAt: string;
}

export interface WarehouseAuditRecord {
  id: string;
  entityType: 'inventory-item' | 'lot' | 'movement' | 'position' | 'adjustment';
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'consume-fifo' | 'adjust';
  detail: string;
  actor: string;
  createdAt: string;
}

export interface CashRegisterProductRecord {
  id: string;
  name: string;
  category: string;
  price: number;
  shortcut: boolean;
  pricingMode: 'fisso' | 'quantità' | 'ora' | 'mezzora' | 'quarto';
  linkedInventoryItemId: string | null;
}

export interface CashTransactionLine {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  originalUnitPrice: number;
  discountPercentage?: number;
  total: number;
  pricingMode: CashRegisterProductRecord['pricingMode'];
  operatorName: string;
  excludeFromReceipt: boolean;
}

export interface CashPaymentSplit {
  contanti: number;
  elettronico: number;
  elettronicoMethod: 'bancomat' | 'carta' | 'bonifico';
}

export interface CashTransactionRecord {
  id: string;
  reference: string;
  clientId: string | null;
  customerName: string;
  documentType: 'scontrino' | 'fattura';
  paymentMethod: 'contanti' | 'pos' | 'bonifico' | 'misto';
  electronicMethod?: 'bancomat' | 'carta' | null;
  electronicFeePercent?: number;
  electronicFeeAmount?: number;
  status: 'pagato' | 'sospeso' | 'insoluto';
  createdAt: string;
  notes: string;
  receivedAmount: number;
  total: number;
  changeAmount: number;
  discountAmount: number;
  discountNote: string;
  receiptNumber: number | null;
  invoiceNumber: number | null;
  linkedQuoteId: string | null;
  paymentSplit: CashPaymentSplit | null;
  settledAt: string | null;
  lines: CashTransactionLine[];
}

export interface CashShiftRecord {
  id: string;
  label: string;
  openedAt: string;
  closedAt: string;
  closureNumber: number;
  transactionsCount: number;
  paidTotal: number;
  suspendedTotal: number;
  receiptNumbers: number[];
  invoiceNumbers: number[];
  byMethod: {
    contanti: number;
    pos: number;
    bonifico: number;
    misto: number;
  };
}

export interface CashFiscalSettings {
  nextReceiptNumber: number;
  nextInvoiceNumber: number;
  nextClosureNumber: number;
  registerType: string;
  registerSerial: string;
  posDebitFeePercent: number;
  posCreditFeePercent: number;
}

export interface CashOperatorRecord {
  id: string;
  name: string;
  role: 'vendita' | 'tecnico' | 'amministrazione' | 'magazzino';
  active: boolean;
  employmentType: 'titolare' | 'dipendente';
  jobTitle: string;
  contractHoursWeekly: number;
  shiftPatterns: Array<Record<'lun' | 'mar' | 'mer' | 'gio' | 'ven' | 'sab' | 'dom', string>>;
  shiftCycleStartDate: string;
  defaultWeeklyShift: Record<'lun' | 'mar' | 'mer' | 'gio' | 'ven' | 'sab' | 'dom', string>;
}

export interface EmployeeLeaveRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: 'ferie' | 'permesso' | 'malattia';
  startDate: string;
  endDate: string;
  note: string;
  status: 'programmata' | 'approvata';
  returnShiftPatternIndex?: number | null;
  // ===== NUOVI Task 7: permesso ORARIO PARZIALE (null = giornata intera) =====
  startTimeMinutes?: number | null;
  endTimeMinutes?: number | null;
  hours?: number | null;
}

export interface EmployeeAttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  status: 'lavorato' | 'riposo' | 'assenza';
  plannedShift: string;
  plannedMinutes: number;
  actualStartTime: string;
  actualEndTime: string;
  breakMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  note: string;
  manualOverride: boolean;
}

export interface CompanyProfileRecord {
  legalName: string;
  vatNumber: string;
  taxCode: string;
  address: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
  sdiCode: string;
  pec: string;
  phone: string;
  email: string;
  website: string;
  iban: string;
  invoiceFooterNote: string;
  logoUrl?: string | null;
  letterheadFont?: string;
  letterheadColor?: string;
}

export interface ServiceTicketMaterialLine {
  inventoryItemId: string;
  itemName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface ServiceTicketRecord {
  id: string;
  title: string;
  customerName: string;
  insertedAt: string;
  serviceType: 'installazione' | 'assistenza' | 'diagnosi';
  locationType: 'domicilio' | 'officina' | 'showroom';
  priority: 'alta' | 'media' | 'bassa';
  status: 'aperto' | 'pianificato' | 'in-lavorazione' | 'chiuso';
  technician: string;
  linkedQuoteId: string | null;
  linkedAppointmentId: string | null;
  materialSummary: string;
  materialCost: number;
  workSummary: string;
  notes: string;
  resolutionStatus: 'da-verificare' | 'risolto' | 'parziale' | 'non-risolto';
  closedAt: string | null;
  materialLines: ServiceTicketMaterialLine[];
  createdAt: string;
  updatedAt: string | null;
}

export interface ExpenseCategoryRecord {
  id: string;
  code: string;
  label: string;
  parentCategory: 'amministrative' | 'utenze' | 'operative' | 'magazzino';
  active: boolean;
}

export interface ExpenseSupplierRecord {
  id: string;
  businessName: string;
  vatNumber: string;
  address: string;
  contactName: string;
  email: string;
  phone: string;
  supplyType: string;
  active: boolean;
}

export interface ExpensePaymentMethodRecord {
  id: string;
  label: 'bonifico' | 'rid' | 'carta-credito' | 'paypal' | 'contanti';
  provider: string;
  active: boolean;
  // ⭐ (Opzionale) Link a un provider di pagamento integrato es. Stripe configurato in Impostazioni
  paymentProviderId?: string | null;
}

// ⭐ Provider di pagamento integrato (Stripe, Satispay, Adyen, Sepa Direct Debit via API, ecc.)
//    Oppure "Esterno" = pagamento fuori dal gestionale (es. contanti, bonifico bancario manuale)
export type PaymentProviderKind = 'esterno' | 'integrato';
export type PaymentExecutionMode = 'manuale' | 'automatico';
export interface PaymentProviderRecord {
  id: string;
  name: string;                    // Nome mostrato all'utente (es. "Stripe · Conto Business")
  kind: PaymentProviderKind;       // Esterno o Integrato
  code: string;                    // Identificativo tecnico: 'stripe', 'satispay', 'adyen', 'bonifico-manuale', 'contanti'
  description?: string;            // Note libere (IBAN, beneficiario, avviso, ecc.)
  // Per provider integrati: configurazione minima (non salviamo vere API key per sicurezza demo)
  apiPublishableKey?: string;
  connectedBankAccountIban?: string;
  connectedBankAccountLabel?: string;
  autoSupported: boolean;          // true = supporta pagamenti automatici ricorrenti
  active: boolean;
  createdAt: string;
}

export interface ExpenseInstallmentRecord {
  id: string;
  expenseId: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  status: 'prevista' | 'pagata' | 'scaduta';
  noticeDaysBefore: number;
  paidAt: string | null;
}

export interface ExpenseNotificationRecord {
  id: string;
  expenseId: string;
  installmentId: string | null;
  channel: 'push' | 'email';
  daysBeforeDue: number;
  sentAt: string;
  readAt: string | null;
}

export interface ExpenseRecord {
  id: string;
  description: string;
  categoryId: string;
  supplierId: string | null;
  genericSupplierLabel: string | null;
  paymentMode: 'singolo' | 'rateale' | 'ricorrente';
  recurringFrequency: 'mensile' | 'trimestrale' | 'annuale' | null;
  paymentMethodId: string;
  amountGross: number;
  vatRate: number;
  amountNet: number;
  amountVat: number;
  expenseDate: string;
  dueDate: string;
  status: 'prevista' | 'pagata' | 'parziale' | 'annullata';
  notes: string;
  attachmentName: string | null;
  projectCode: string | null;
  costCenterCode: string | null;
  sourceType: 'manuale' | 'magazzino';
  sourceReferenceId: string | null;
  createdBy: string;
  createdAt: string;
  // ⭐ Metodo di calcolo IVA al momento della registrazione della spesa
  // amountAlreadyIvato: se true = l'utente ha inserito importo lordo già IVA COMPRESA (caso più frequente in Italia).
  // amountSplitVat:    se true e amountAlreadyIvato=true, l'IVA viene SCORPORATA dall'importo (ivaRate = aliquota scorporo).
  //                    Se false = l'importo lordo è considerato GIÀ IVATO per legge (es. medicina, tabacchi) → amountVat=0.
  amountAlreadyIvato?: boolean;
  amountSplitVat?: boolean;
  amountIsReverseCharge?: boolean;
  // ⭐ Metodo di pagamento collegato a provider integrato (es. Stripe) e modalità esecuzione
  // Tutti opzionali per retrocompatibilità · SEMPRE modificabili dopo la registrazione della spesa
  paymentProviderId?: string | null;
  paymentExecution?: PaymentExecutionMode;          // 'manuale' (default) o 'automatico'
  paymentAutoStartDate?: string | null;             // Data primo addebito se automatico
  paymentNotes?: string | null;                      // Note pagamento (causale, RIF, ecc.)
  paymentModifiedAt?: string | null;                 // Timestamp ultima modifica
}

export interface ExpenseAuditRecord {
  id: string;
  entityType: 'expense' | 'installment' | 'notification' | 'supplier' | 'category';
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'status-change' | 'payment';
  detail: string;
  actor: string;
  createdAt: string;
}

export interface AudiomaxState {
  clients: ClientRecord[];
  quotes: QuoteRecord[];
  appointments: AppointmentRecord[];
  inventoryItems: InventoryItemRecord[];
  warehouseLots: WarehouseLotRecord[];
  warehouseMovements: WarehouseMovementRecord[];
  warehousePositions: WarehousePositionRecord[];
  warehousePurchases: WarehousePurchaseRecord[];
  warehouseAdjustments: WarehouseAdjustmentRecord[];
  warehouseAuditLog: WarehouseAuditRecord[];
  serviceCategories: string[];
  companyProfile: CompanyProfileRecord;
  expenseCategories: ExpenseCategoryRecord[];
  expenseSuppliers: ExpenseSupplierRecord[];
  expensePaymentMethods: ExpensePaymentMethodRecord[];
  // ⭐ Provider pagamento integrati (Stripe, Satispay, Adyen, Sepa Direct Debit, ecc.)
  paymentProviders: PaymentProviderRecord[];
  expenseRecords: ExpenseRecord[];
  expenseInstallments: ExpenseInstallmentRecord[];
  expenseNotifications: ExpenseNotificationRecord[];
  expenseAuditLog: ExpenseAuditRecord[];
  cashOperators: CashOperatorRecord[];
  employeeLeaves: EmployeeLeaveRecord[];
  employeeAttendanceRecords: EmployeeAttendanceRecord[];
  cashProducts: CashRegisterProductRecord[];
  cashTransactions: CashTransactionRecord[];
  cashShifts: CashShiftRecord[];
  cashFiscalSettings: CashFiscalSettings;
  serviceTickets: ServiceTicketRecord[];
  // ===== NUOVI Task 1/2/4: negozio chiusure settimanali / aperture straordinarie / chiusure collettive =====
  storeClosingDaysWeekly: Record<'lun' | 'mar' | 'mer' | 'gio' | 'ven' | 'sab' | 'dom', boolean>;
  storeExtraOpeningDates: Array<{ id: string; date: string; note?: string }>;
  storeBulkClosures: Array<{ id: string; startDate: string; endDate: string; reason: string }>;
}

export function createClientPrivacyProfile(config?: {
  channel?: 'cassa' | 'crm' | 'agenda' | 'link-remoto';
  operator?: string;
  lawfulBasis?: ClientPrivacyProfile['lawfulBasis'];
  noticeAcknowledged?: boolean;
  emailMarketing?: boolean;
  whatsappMarketing?: boolean;
  fidelityProfiling?: boolean;
  remoteConsentStatus?: ClientPrivacyProfile['remoteConsentStatus'];
  remoteConsentUrl?: string | null;
}): ClientPrivacyProfile {
  const timestamp = new Date().toISOString();
  const channel = config?.channel ?? 'crm';
  const operator = config?.operator ?? 'Sistema';
  const noticeAcknowledged = config?.noticeAcknowledged ?? true;

  return {
    noticeVersion: 'privacy-v1.0',
    lawfulBasis: config?.lawfulBasis ?? 'contratto',
    noticeAcknowledged,
    noticeShownAt: noticeAcknowledged ? timestamp : null,
    dataRetentionNote: 'Dati trattati per gestione cliente, agenda, cassa e assistenza nel rispetto del principio di minimizzazione.',
    remoteConsentStatus: config?.remoteConsentStatus ?? 'da-inviare',
    remoteConsentUrl: config?.remoteConsentUrl ?? null,
    emailMarketing: {
      granted: config?.emailMarketing ?? false,
      grantedAt: config?.emailMarketing ? timestamp : null,
      channel: config?.emailMarketing ? channel : null,
    },
    whatsappMarketing: {
      granted: config?.whatsappMarketing ?? false,
      grantedAt: config?.whatsappMarketing ? timestamp : null,
      channel: config?.whatsappMarketing ? channel : null,
    },
    fidelityProfiling: {
      granted: config?.fidelityProfiling ?? false,
      grantedAt: config?.fidelityProfiling ? timestamp : null,
      channel: config?.fidelityProfiling ? channel : null,
    },
    audit: noticeAcknowledged
      ? [
        {
          id: `privacy-audit-${crypto.randomUUID()}`,
          action: 'informativa-mostrata',
          detail: 'Informativa privacy mostrata e registrata nel CRM.',
          operator,
          channel,
          createdAt: timestamp,
        },
        {
          id: `privacy-audit-${crypto.randomUUID()}`,
          action: 'cliente-creato',
          detail: 'Profilo cliente creato con stato privacy iniziale.',
          operator,
          channel,
          createdAt: timestamp,
        },
      ]
      : [],
    archive: noticeAcknowledged
      ? [
        {
          id: `privacy-archive-${crypto.randomUUID()}`,
          type: 'informativa',
          title: `Informativa privacy ${'privacy-v1.0'}`,
          status: 'registrato',
          channel,
          url: null,
          createdAt: timestamp,
        },
        {
          id: `privacy-archive-${crypto.randomUUID()}`,
          type: 'scheda-cliente',
          title: 'Scheda cliente con stato privacy iniziale',
          status: 'registrato',
          channel,
          url: null,
          createdAt: timestamp,
        },
      ]
      : [],
  };
}

export const initialAudiomaxState: AudiomaxState = {
  clients: [
    {
      id: 'cli-001',
      name: 'Famiglia Bianchi',
      phone: '347 1203344',
      email: 'bianchi@audiomax-demo.it',
      city: 'Bergamo',
      address: 'Via delle Querce 18',
      segment: 'Home theater premium',
      preferredContact: 'telefono',
      notes: 'Cliente premium, richiede sempre sopralluogo dettagliato e finiture invisibili.',
      favoriteBrands: 'Denon, Monitor Audio, Epson',
      lastContact: '2026-03-28',
      status: 'molto spendente',
      privacyProfile: createClientPrivacyProfile({
        operator: 'Sara',
        channel: 'crm',
        lawfulBasis: 'contratto',
        whatsappMarketing: true,
        fidelityProfiling: true,
      }),
    },
    {
      id: 'cli-002',
      name: 'Residence Blu',
      phone: '348 7754211',
      email: 'booking@residenceblu.it',
      city: 'Brescia',
      address: 'Viale Lago 42',
      segment: 'Assistenza multiroom',
      preferredContact: 'email',
      notes: 'Struttura ricettiva con richieste rapide e interventi fuori orario standard.',
      favoriteBrands: 'Yamaha, Sonos',
      lastContact: '2026-03-27',
      status: 'poco spendente',
      privacyProfile: createClientPrivacyProfile({
        operator: 'Elena',
        channel: 'crm',
        lawfulBasis: 'contratto',
        emailMarketing: true,
      }),
    },
    {
      id: 'cli-003',
      name: 'Loft 21',
      phone: '351 8841023',
      email: 'info@loft21.it',
      city: 'Milano',
      address: 'Via Tortona 77',
      segment: 'Audio distribuito',
      preferredContact: 'whatsapp',
      notes: 'Lead sensibile al design e all’integrazione con arredi minimal.',
      favoriteBrands: 'Bluesound, Bowers & Wilkins',
      lastContact: '2026-03-26',
      status: 'lead',
      privacyProfile: createClientPrivacyProfile({
        operator: 'Giulia',
        channel: 'agenda',
        lawfulBasis: 'precontrattuale',
      }),
    },
  ],
  serviceCategories: ['Installazione', 'Assistenza', 'Consulenza', 'Progettazione', 'Calibrazione'],
  companyProfile: {
    legalName: 'Audiomax S.r.l.',
    vatNumber: '',
    taxCode: '',
    address: '',
    postalCode: '',
    city: '',
    province: '',
    country: 'Italia',
    sdiCode: '',
    pec: '',
    phone: '',
    email: '',
    website: '',
    iban: '',
    invoiceFooterNote: '',
    letterheadFont: 'Inter, sans-serif',
    letterheadColor: '#182233',
  },
  quotes: [
    {
      id: 'prv-001',
      customerName: 'Famiglia Bianchi',
      customerEmail: 'bianchi@email.it',
      customerPhone: '348 1234567',
      customerAddress: 'Via delle Rose 14, Torino',
      projectType: 'Home Theater sala cinema',
      value: 28500,
      stage: 'trattativa',
      issueDate: '2026-03-15',
      dueDate: '2026-04-15',
      notes: 'Sala dedicata 30mq con trattamento acustico. Predisposizione già presente per 7 diffusori a parete. Cablaggio in canalina a vista non accettato dal cliente, prevedere tracce.',
      lines: [
        { id: 'line-001a', kind: 'materiale', description: 'Diffusori B&W 603 S3 (coppia frontali)', quantity: 1, unitPrice: 1800, vatRate: 22 },
        { id: 'line-001b', kind: 'materiale', description: 'Diffusore B&W HTM6 S3 (canale centrale)', quantity: 1, unitPrice: 900, vatRate: 22 },
        { id: 'line-001c', kind: 'materiale', description: 'Diffusori B&W 607 S3 (coppia surround)', quantity: 2, unitPrice: 650, vatRate: 22 },
        { id: 'line-001d', kind: 'materiale', description: 'Subwoofer SVS SB-2000 Pro', quantity: 1, unitPrice: 950, vatRate: 22 },
        { id: 'line-001e', kind: 'materiale', description: 'Sintoamplificatore Denon AVR-X3800H 9.4ch', quantity: 1, unitPrice: 1690, vatRate: 22 },
        { id: 'line-001f', kind: 'materiale', description: 'Proiettore Sony VPL-XW5000ES 4K Laser', quantity: 1, unitPrice: 5500, vatRate: 22 },
        { id: 'line-001g', kind: 'materiale', description: 'Telo motorizzato 120" Screen Innovations', quantity: 1, unitPrice: 2200, vatRate: 22 },
        { id: 'line-001h', kind: 'materiale', description: 'Cavi speaker OFC 4mm² (100m)', quantity: 1, unitPrice: 280, vatRate: 22 },
        { id: 'line-001i', kind: 'materiale', description: 'Cavi HDMI 8K CL3 (15m)', quantity: 3, unitPrice: 85, vatRate: 22 },
        { id: 'line-001j', kind: 'servizio', description: 'Installazione e cablaggio impianto 7.1', quantity: 2, unitPrice: 450, vatRate: 22 },
        { id: 'line-001k', kind: 'servizio', description: 'Calibrazione acustica con microfono', quantity: 1, unitPrice: 350, vatRate: 22 },
        { id: 'line-001l', kind: 'servizio', description: 'Programmazione telecomando universale e istruzione cliente', quantity: 1, unitPrice: 150, vatRate: 22 },
      ],
    },
    {
      id: 'prv-002',
      customerName: 'Ristorante Da Mario',
      customerEmail: 'info@damariotorino.it',
      customerPhone: '011 5678901',
      customerAddress: 'Corso Francia 182, Torino',
      customerTaxId: '09876543210',
      projectType: 'Impianto audio filodiffusione ristorante',
      value: 8750,
      stage: 'bozza',
      issueDate: '2026-04-01',
      dueDate: '2026-04-20',
      notes: 'Locale su due livelli (sala interna 80mq + dehors 40mq). Musica di sottofondo controllabile da iPad alla cassa. Necessario sopralluogo per passaggio cavi tra i due livelli.',
      lines: [
        { id: 'line-002a', kind: 'materiale', description: 'Diffusori incasso soffitto Bose DesignMax DM3C (sala)', quantity: 6, unitPrice: 220, vatRate: 22 },
        { id: 'line-002b', kind: 'materiale', description: 'Diffusori esterni Bose DesignMax DM5SE (dehors)', quantity: 4, unitPrice: 310, vatRate: 22 },
        { id: 'line-002c', kind: 'materiale', description: 'Amplificatore multizona Sonance DSP 2-750 MKII', quantity: 1, unitPrice: 1850, vatRate: 22 },
        { id: 'line-002d', kind: 'materiale', description: 'Streamer di rete Bluesound NODE', quantity: 1, unitPrice: 550, vatRate: 22 },
        { id: 'line-002e', kind: 'materiale', description: 'Cavo speaker 2×1.5mm² schermato (150m)', quantity: 1, unitPrice: 195, vatRate: 22 },
        { id: 'line-002f', kind: 'servizio', description: 'Sopralluogo e progettazione impianto', quantity: 1, unitPrice: 200, vatRate: 22 },
        { id: 'line-002g', kind: 'servizio', description: 'Installazione diffusori e cablaggio', quantity: 2, unitPrice: 400, vatRate: 22 },
        { id: 'line-002h', kind: 'servizio', description: 'Configurazione multizona e test copertura', quantity: 1, unitPrice: 250, vatRate: 22 },
      ],
    },
    {
      id: 'prv-003',
      customerName: 'Villa Serra',
      customerEmail: 'gserra@pec.it',
      customerPhone: '335 9876543',
      customerAddress: 'Strada della Collina 8, Moncalieri (TO)',
      projectType: 'Multiroom Hi-Fi villa con giardino',
      value: 18200,
      stage: 'confermato',
      issueDate: '2026-03-10',
      dueDate: '2026-04-30',
      notes: 'Impianto su 4 zone: soggiorno, cucina open, camera padronale, terrazza/giardino. Integrazione con domotica KNX esistente. Predisposizione già presente solo in soggiorno.',
      lines: [
        { id: 'line-003a', kind: 'materiale', description: 'Diffusori da scaffale KEF LS50 Meta (coppia soggiorno)', quantity: 1, unitPrice: 1200, vatRate: 22 },
        { id: 'line-003b', kind: 'materiale', description: 'Amplificatore integrato Marantz MODEL 40n', quantity: 1, unitPrice: 1690, vatRate: 22 },
        { id: 'line-003c', kind: 'materiale', description: 'Diffusori incasso Sonos Architectural by Sonance (cucina)', quantity: 2, unitPrice: 350, vatRate: 22 },
        { id: 'line-003d', kind: 'materiale', description: 'Sonos Amp (zona cucina)', quantity: 1, unitPrice: 750, vatRate: 22 },
        { id: 'line-003e', kind: 'materiale', description: 'Diffusori incasso soffitto camera padronale', quantity: 2, unitPrice: 280, vatRate: 22 },
        { id: 'line-003f', kind: 'materiale', description: 'Sonos Amp (zona camera)', quantity: 1, unitPrice: 750, vatRate: 22 },
        { id: 'line-003g', kind: 'materiale', description: 'Diffusori outdoor Sonance Mariner 86 (coppia giardino)', quantity: 2, unitPrice: 480, vatRate: 22 },
        { id: 'line-003h', kind: 'materiale', description: 'Sonos Amp (zona giardino)', quantity: 1, unitPrice: 750, vatRate: 22 },
        { id: 'line-003i', kind: 'materiale', description: 'Cavi speaker OFC 2.5mm² (200m)', quantity: 1, unitPrice: 340, vatRate: 22 },
        { id: 'line-003j', kind: 'servizio', description: 'Progettazione impianto e integrazione KNX', quantity: 1, unitPrice: 500, vatRate: 22 },
        { id: 'line-003k', kind: 'servizio', description: 'Installazione e cablaggio 4 zone', quantity: 3, unitPrice: 450, vatRate: 22 },
        { id: 'line-003l', kind: 'servizio', description: 'Configurazione Sonos + domotica e collaudo', quantity: 1, unitPrice: 400, vatRate: 22 },
      ],
    },
  ],
  appointments: [
    {
      id: 'app-001',
      title: 'Installazione multiroom 4 zone',
      customerName: 'Villa Serra',
      appointmentType: 'installazione',
      locationType: 'domicilio',
      scheduledAt: '2026-04-18T09:00:00',
      durationMinutes: 480,
      technician: 'Marco',
      linkedQuoteId: 'prv-003',
      status: 'programmato',
    },
    {
      id: 'app-002',
      title: 'Demo showroom hi-end',
      customerName: 'Famiglia Bianchi',
      appointmentType: 'negozio',
      locationType: 'showroom',
      scheduledAt: '2026-03-29T16:00:00',
      durationMinutes: 90,
      technician: 'Giulia',
      linkedQuoteId: 'prv-001',
      status: 'programmato',
    },
    {
      id: 'app-003',
      title: 'Check officina sintoamplificatore',
      customerName: 'Cliente laboratorio',
      appointmentType: 'assistenza',
      locationType: 'officina',
      scheduledAt: '2026-03-29T11:15:00',
      durationMinutes: 120,
      technician: 'Luca',
      linkedQuoteId: null,
      status: 'in-corso',
    },
  ],
  inventoryItems: [
    {
      id: 'inv-001',
      sku: 'CABL-SPK-2X25',
      barcode: '8051110000012',
      name: 'Cavo speaker OFC 2x2.5 mm',
      category: 'Cablaggio',
      usageType: 'rivendita',
      stock: 120,
      minStock: 60,
      unitCost: 4.8,
      salePrice: 7.9,
      supplier: 'TecnoCab',
      location: 'Scaffale A1',
      cableRolls: 12,
      cableMetersPerRoll: 10,
      status: 'disponibile',
    },
    {
      id: 'inv-002',
      sku: 'BRKT-SPK-PRO',
      barcode: '8051110000029',
      name: 'Staffa speaker Pro',
      category: 'Supporti',
      usageType: 'rivendita',
      stock: 4,
      minStock: 5,
      unitCost: 36,
      salePrice: 45,
      supplier: 'MountLab',
      location: 'Scaffale B3',
      status: 'bassa-scorta',
    },
    {
      id: 'inv-003',
      sku: 'PWR-AMP-SRV',
      barcode: '8051110000036',
      name: 'Modulo alimentazione amplificatore',
      category: 'Ricambi',
      usageType: 'rivendita',
      stock: 0,
      minStock: 2,
      unitCost: 95,
      salePrice: 149,
      supplier: 'Audio Reference Italia',
      location: 'Cassetto R2',
      status: 'esaurito',
    },
  ],
  warehouseLots: [
    {
      id: 'lot-001',
      inventoryItemId: 'inv-001',
      lotCode: 'LOTTO-001',
      barcode: '8051110000012',
      supplier: 'TecnoCab',
      receivedDate: '2026-03-10',
      receivedQuantity: 80,
      availableQuantity: 60,
      reservedQuantity: 0,
      unitCost: 4.65,
      salePrice: 8.4,
      expiryDate: null,
      shelfCode: 'A-01-01',
      purchaseDocumentNumber: 'DDT-TC-2026-033',
    },
    {
      id: 'lot-002',
      inventoryItemId: 'inv-001',
      lotCode: 'LOTTO-002',
      barcode: '8051110000012',
      supplier: 'TecnoCab',
      receivedDate: '2026-03-20',
      receivedQuantity: 60,
      availableQuantity: 60,
      reservedQuantity: 0,
      unitCost: 4.92,
      salePrice: 7.9,
      expiryDate: null,
      shelfCode: 'A-01-01',
      purchaseDocumentNumber: 'DDT-TC-2026-044',
    },
    {
      id: 'lot-003',
      inventoryItemId: 'inv-002',
      lotCode: 'LOTTO-001',
      barcode: '8051110000029',
      supplier: 'Videopro',
      receivedDate: '2026-03-16',
      receivedQuantity: 12,
      availableQuantity: 12,
      reservedQuantity: 0,
      unitCost: 14.5,
      salePrice: 45,
      expiryDate: null,
      shelfCode: 'B-02-03',
      purchaseDocumentNumber: 'DDT-VP-2026-102',
    },
  ],
  warehouseMovements: [
    {
      id: 'wmov-001',
      inventoryItemId: 'inv-001',
      lotId: 'lot-001',
      movementType: 'carico',
      quantity: 80,
      unitCost: 4.65,
      totalCost: 372,
      documentNumber: 'DDT-TC-2026-033',
      reason: 'Ricevimento fornitore',
      operator: 'Magazzino',
      sourceModule: 'magazzino',
      movedAt: '2026-03-10T09:10:00',
    },
    {
      id: 'wmov-002',
      inventoryItemId: 'inv-001',
      lotId: 'lot-001',
      movementType: 'scarico',
      quantity: 20,
      unitCost: 4.65,
      totalCost: 93,
      documentNumber: 'TCK-2026-001',
      reason: 'Prelievo per assistenza',
      operator: 'Marco',
      sourceModule: 'tecnico',
      movedAt: '2026-03-22T11:45:00',
    },
    {
      id: 'wmov-003',
      inventoryItemId: 'inv-001',
      lotId: 'lot-002',
      movementType: 'carico',
      quantity: 60,
      unitCost: 4.92,
      totalCost: 295.2,
      documentNumber: 'DDT-TC-2026-044',
      reason: 'Ricevimento fornitore',
      operator: 'Magazzino',
      sourceModule: 'magazzino',
      movedAt: '2026-03-20T10:05:00',
    },
  ],
  warehousePositions: [
    {
      id: 'wpos-001',
      code: 'A-01-01',
      zone: 'A',
      shelf: '01',
      level: '01',
      occupiedInventoryItemIds: ['inv-001'],
    },
    {
      id: 'wpos-002',
      code: 'B-02-03',
      zone: 'B',
      shelf: '02',
      level: '03',
      occupiedInventoryItemIds: ['inv-002'],
    },
  ],
  warehousePurchases: [
    {
      id: 'wpur-001',
      inventoryItemId: 'inv-001',
      lotId: 'lot-001',
      supplier: 'TecnoCab',
      documentNumber: 'DDT-TC-2026-033',
      receivedDate: '2026-03-10',
      quantity: 80,
      unitCost: 4.65,
      transportCost: 24,
      customsCost: 0,
      packagingCost: 9,
      totalCost: 405,
      linkedExpenseId: 'EXP-2026-033',
    },
    {
      id: 'wpur-002',
      inventoryItemId: 'inv-001',
      lotId: 'lot-002',
      supplier: 'TecnoCab',
      documentNumber: 'DDT-TC-2026-044',
      receivedDate: '2026-03-20',
      quantity: 60,
      unitCost: 4.92,
      transportCost: 18,
      customsCost: 0,
      packagingCost: 6,
      totalCost: 319.2,
      linkedExpenseId: 'EXP-2026-044',
    },
  ],
  warehouseAdjustments: [],
  warehouseAuditLog: [
    {
      id: 'waudit-001',
      entityType: 'lot',
      entityId: 'lot-001',
      action: 'create',
      detail: 'Creato lotto iniziale per cavo speaker OFC a metraggio',
      actor: 'Sistema',
      createdAt: '2026-03-10T09:12:00',
    },
  ],
  expenseCategories: [
    {
      id: 'exp-cat-001',
      code: 'AMM-GEN',
      label: 'Spese amministrative',
      parentCategory: 'amministrative',
      active: true,
    },
    {
      id: 'exp-cat-002',
      code: 'UT-INTERNET',
      label: 'Internet e telefonia',
      parentCategory: 'utenze',
      active: true,
    },
    {
      id: 'exp-cat-003',
      code: 'OP-SERVIZI',
      label: 'Spese operative',
      parentCategory: 'operative',
      active: true,
    },
    {
      id: 'exp-cat-004',
      code: 'MAG-ACQ',
      label: 'Acquisti magazzino',
      parentCategory: 'magazzino',
      active: true,
    },
  ],
  expenseSuppliers: [
    {
      id: 'exp-sup-001',
      businessName: 'Energia Lombardia S.p.A.',
      vatNumber: 'IT02154830990',
      address: 'Via Milano 102, Bergamo',
      contactName: 'Ufficio clienti',
      email: 'fatture@energialombardia.it',
      phone: '035-991100',
      supplyType: 'utenza-luce',
      active: true,
    },
    {
      id: 'exp-sup-002',
      businessName: 'Audio Trade',
      vatNumber: 'IT01020304050',
      address: 'Via Industriale 45, Brescia',
      contactName: 'Marco Riva',
      email: 'ordini@audiotrade.it',
      phone: '030-884422',
      supplyType: 'fornitura-magazzino',
      active: true,
    },
  ],
  expensePaymentMethods: [
    { id: 'pay-001', label: 'bonifico', provider: 'Banca Intesa', active: true, paymentProviderId: 'pp-bonifico' },
    { id: 'pay-002', label: 'rid', provider: 'SEPA RID', active: true, paymentProviderId: 'pp-sepa-rid' },
    { id: 'pay-003', label: 'carta-credito', provider: 'Nexi Business', active: true, paymentProviderId: 'pp-stripe' },
    { id: 'pay-004', label: 'paypal', provider: 'PayPal Business', active: true, paymentProviderId: null },
    { id: 'pay-005', label: 'contanti', provider: 'Contanti (cassa)', active: true, paymentProviderId: 'pp-contanti' },
  ],
  // ⭐ Payment provider integrati (default seed) · combinazione esterno/integrato
  paymentProviders: [
    {
      id: 'pp-contanti',
      name: 'Contanti (pagamento esterno cassa)',
      kind: 'esterno',
      code: 'contanti',
      description: 'Pagamento in contanti fuori dal gestionale · nessun automatismo.',
      autoSupported: false,
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'pp-bonifico',
      name: 'Bonifico bancario manuale',
      kind: 'esterno',
      code: 'bonifico-manuale',
      description: 'Bonifico separato presso la banca · IBAN configurabile.',
      connectedBankAccountIban: 'IT02X1234567890123456789012',
      connectedBankAccountLabel: 'Banca Intesa S.p.A. · Conto Ordinario',
      autoSupported: false,
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'pp-sepa-rid',
      name: 'SEPA Direct Debit · RID',
      kind: 'integrato',
      code: 'sepa-dd',
      description: 'Addebito diretto SEPA su conto cliente · supporta ricorrente automatico.',
      connectedBankAccountIban: 'IT02X1234567890123456789012',
      connectedBankAccountLabel: 'Banca Intesa S.p.A. · Conto Ordinario',
      autoSupported: true,
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'pp-stripe',
      name: 'Stripe · Conto Business (Carta / Addebito)',
      kind: 'integrato',
      code: 'stripe',
      description: 'Pagamenti via Stripe · API Publishable Key + IBAN di accredito configurabile.',
      apiPublishableKey: 'pk_test_placeholder',
      connectedBankAccountIban: 'IT02X1234567890123456789012',
      connectedBankAccountLabel: 'Banca Intesa S.p.A. · Conto Stripe Accrediti',
      autoSupported: true,
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'pp-satispay',
      name: 'Satispay Business',
      kind: 'integrato',
      code: 'satispay',
      description: 'Pagamenti tramite Satispay Business · supporto automatico ricorrente.',
      autoSupported: true,
      active: true,
      createdAt: new Date().toISOString(),
    },
  ],
  expenseRecords: [
    {
      id: 'exp-001',
      description: 'Fattura energia marzo',
      categoryId: 'exp-cat-002',
      supplierId: 'exp-sup-001',
      genericSupplierLabel: null,
      paymentMode: 'ricorrente',
      recurringFrequency: 'mensile',
      paymentMethodId: 'pay-002',
      amountGross: 642.3,
      vatRate: 22,
      amountNet: 526.48,
      amountVat: 115.82,
      expenseDate: '2026-03-01',
      dueDate: '2026-03-31',
      status: 'prevista',
      notes: 'Utenza sede centrale',
      attachmentName: 'fattura-energia-marzo.pdf',
      projectCode: null,
      costCenterCode: 'CC-UTENZE',
      sourceType: 'manuale',
      sourceReferenceId: null,
      createdBy: 'Elena',
      createdAt: '2026-03-01T10:30:00',
    },
  ],
  expenseInstallments: [
    {
      id: 'exp-inst-001',
      expenseId: 'exp-001',
      installmentNumber: 1,
      dueDate: '2026-03-31',
      amount: 642.3,
      status: 'prevista',
      noticeDaysBefore: 7,
      paidAt: null,
    },
  ],
  expenseNotifications: [
    {
      id: 'exp-not-001',
      expenseId: 'exp-001',
      installmentId: 'exp-inst-001',
      channel: 'email',
      daysBeforeDue: 7,
      sentAt: '2026-03-24T08:00:00',
      readAt: null,
    },
  ],
  expenseAuditLog: [
    {
      id: 'exp-audit-001',
      entityType: 'expense',
      entityId: 'exp-001',
      action: 'create',
      detail: 'Inserita spesa ricorrente utenza energia',
      actor: 'Elena',
      createdAt: '2026-03-01T10:31:00',
    },
  ],
  cashOperators: [
    {
      id: 'cash-op-001',
      name: 'Banco',
      role: 'vendita',
      active: true,
      employmentType: 'titolare',
      jobTitle: 'Titolare',
      contractHoursWeekly: 0,
      shiftPatterns: [{ lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' }],
      shiftCycleStartDate: '2025-01-01',
      defaultWeeklyShift: { lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' },
    },
    {
      id: 'cash-op-002',
      name: 'Marco',
      role: 'tecnico',
      active: true,
      employmentType: 'dipendente',
      jobTitle: 'Tecnico',
      contractHoursWeekly: 40,
      shiftPatterns: [{ lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' }],
      shiftCycleStartDate: '2025-01-01',
      defaultWeeklyShift: { lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' },
    },
    {
      id: 'cash-op-003',
      name: 'Sara',
      role: 'vendita',
      active: true,
      employmentType: 'dipendente',
      jobTitle: 'Vendita',
      contractHoursWeekly: 40,
      shiftPatterns: [{ lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' }],
      shiftCycleStartDate: '2025-01-01',
      defaultWeeklyShift: { lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' },
    },
    {
      id: 'cash-op-004',
      name: 'Luca',
      role: 'tecnico',
      active: true,
      employmentType: 'dipendente',
      jobTitle: 'Tecnico',
      contractHoursWeekly: 40,
      shiftPatterns: [{ lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' }],
      shiftCycleStartDate: '2025-01-01',
      defaultWeeklyShift: { lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' },
    },
    {
      id: 'cash-op-005',
      name: 'Giulia',
      role: 'vendita',
      active: true,
      employmentType: 'dipendente',
      jobTitle: 'Vendita',
      contractHoursWeekly: 40,
      shiftPatterns: [{ lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' }],
      shiftCycleStartDate: '2025-01-01',
      defaultWeeklyShift: { lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' },
    },
    {
      id: 'cash-op-006',
      name: 'Elena',
      role: 'amministrazione',
      active: true,
      employmentType: 'dipendente',
      jobTitle: 'Amministrazione',
      contractHoursWeekly: 40,
      shiftPatterns: [{ lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' }],
      shiftCycleStartDate: '2025-01-01',
      defaultWeeklyShift: { lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' },
    },
  ],
  employeeLeaves: [],
  employeeAttendanceRecords: [],
  cashProducts: [
    {
      id: 'cash-prod-001',
      name: 'Consulenza audio',
      category: 'Consulenza',
      price: 40,
      shortcut: true,
      pricingMode: 'ora',
      linkedInventoryItemId: null,
    },
    {
      id: 'cash-prod-002',
      name: 'Installazione diffusori',
      category: 'Installazione',
      price: 55,
      shortcut: true,
      pricingMode: 'ora',
      linkedInventoryItemId: null,
    },
    {
      id: 'cash-prod-003',
      name: 'Cavo speaker OFC',
      category: 'Accessori',
      price: 7.9,
      shortcut: true,
      pricingMode: 'quantità',
      linkedInventoryItemId: 'inv-001',
    },
    {
      id: 'cash-prod-004',
      name: 'Staffa speaker',
      category: 'Accessori',
      price: 45,
      shortcut: false,
      pricingMode: 'quantità',
      linkedInventoryItemId: 'inv-002',
    },
    {
      id: 'cash-prod-005',
      name: 'Calibrazione acustica',
      category: 'Calibrazione',
      price: 80,
      shortcut: true,
      pricingMode: 'ora',
      linkedInventoryItemId: null,
    },
    {
      id: 'cash-prod-006',
      name: 'Saldo preventivo',
      category: 'Pagamenti',
      price: 250,
      shortcut: false,
      pricingMode: 'fisso',
      linkedInventoryItemId: null,
    },
    {
      id: 'cash-prod-007',
      name: 'Sopralluogo tecnico',
      category: 'Progettazione',
      price: 60,
      shortcut: true,
      pricingMode: 'fisso',
      linkedInventoryItemId: null,
    },
    {
      id: 'cash-prod-008',
      name: 'Configurazione multiroom',
      category: 'Installazione',
      price: 90,
      shortcut: false,
      pricingMode: 'ora',
      linkedInventoryItemId: null,
    },
  ],
  cashTransactions: [
    {
      id: 'cash-tx-001',
      reference: 'CAS-240329-001',
      clientId: null,
      customerName: 'Cliente showroom',
      documentType: 'scontrino',
      paymentMethod: 'pos',
      status: 'pagato',
      createdAt: '2026-03-29T09:12:00',
      notes: 'Vendita accessori demo',
      receivedAmount: 124,
      total: 124,
      changeAmount: 0,
      discountAmount: 0,
      discountNote: '',
      receiptNumber: 1,
      invoiceNumber: null,
      linkedQuoteId: null,
      paymentSplit: null,
      settledAt: '2026-03-29T09:12:00',
      lines: [
        {
          id: 'cash-line-001',
          productId: 'cash-prod-003',
          name: 'Cavo HDMI 8K',
          quantity: 1,
          unitPrice: 79,
          originalUnitPrice: 79,
          total: 79,
          pricingMode: 'quantità',
          operatorName: 'Banco',
          excludeFromReceipt: false,
        },
        {
          id: 'cash-line-002',
          productId: 'cash-prod-004',
          name: 'Staffa speaker',
          quantity: 1,
          unitPrice: 45,
          originalUnitPrice: 45,
          total: 45,
          pricingMode: 'quantità',
          operatorName: 'Banco',
          excludeFromReceipt: false,
        },
      ],
    },
    {
      id: 'cash-tx-002',
      reference: 'CAS-240329-002',
      clientId: 'cli-001',
      customerName: 'Famiglia Bianchi',
      documentType: 'scontrino',
      paymentMethod: 'contanti',
      status: 'pagato',
      createdAt: '2026-03-29T10:05:00',
      notes: 'Acconto servizio tecnico',
      receivedAmount: 100,
      total: 90,
      changeAmount: 10,
      discountAmount: 0,
      discountNote: '',
      receiptNumber: 2,
      invoiceNumber: null,
      linkedQuoteId: null,
      paymentSplit: null,
      settledAt: '2026-03-29T10:05:00',
      lines: [
        {
          id: 'cash-line-003',
          productId: 'cash-prod-001',
          name: 'Consulenza audio',
          quantity: 1,
          unitPrice: 35,
          originalUnitPrice: 35,
          total: 35,
          pricingMode: 'fisso',
          operatorName: 'Marco',
          excludeFromReceipt: false,
        },
        {
          id: 'cash-line-004',
          productId: 'cash-prod-005',
          name: 'Installazione diffusori',
          quantity: 1,
          unitPrice: 55,
          originalUnitPrice: 55,
          total: 55,
          pricingMode: 'ora',
          operatorName: 'Luca',
          excludeFromReceipt: false,
        },
      ],
    },
    {
      id: 'cash-tx-003',
      reference: 'CAS-240329-003',
      clientId: 'cli-001',
      customerName: 'Famiglia Bianchi',
      documentType: 'scontrino',
      paymentMethod: 'contanti',
      status: 'insoluto',
      createdAt: '2026-03-29T11:40:00',
      notes: 'Saldo accessori showroom da recuperare al prossimo passaggio.',
      receivedAmount: 0,
      total: 180,
      changeAmount: 0,
      discountAmount: 0,
      discountNote: '',
      receiptNumber: 3,
      invoiceNumber: null,
      linkedQuoteId: null,
      paymentSplit: null,
      settledAt: null,
      lines: [
        {
          id: 'cash-line-005',
          productId: 'cash-prod-003',
          name: 'Cavo HDMI 8K',
          quantity: 1,
          unitPrice: 79,
          originalUnitPrice: 79,
          total: 79,
          pricingMode: 'quantità',
          operatorName: 'Giulia',
          excludeFromReceipt: false,
        },
        {
          id: 'cash-line-006',
          productId: 'cash-prod-004',
          name: 'Staffa speaker',
          quantity: 1,
          unitPrice: 45,
          originalUnitPrice: 45,
          total: 45,
          pricingMode: 'quantità',
          operatorName: 'Giulia',
          excludeFromReceipt: false,
        },
        {
          id: 'cash-line-007',
          productId: 'cash-prod-001',
          name: 'Consulenza audio',
          quantity: 1,
          unitPrice: 56,
          originalUnitPrice: 56,
          total: 56,
          pricingMode: 'fisso',
          operatorName: 'Giulia',
          excludeFromReceipt: false,
        },
      ],
    },
  ],
  cashShifts: [
    {
      id: 'shift-001',
      label: 'Turno Mattina',
      openedAt: '2026-03-29T08:00:00',
      closedAt: '2026-03-29T12:30:00',
      closureNumber: 1,
      transactionsCount: 7,
      paidTotal: 424,
      suspendedTotal: 180,
      receiptNumbers: [1, 2, 3],
      invoiceNumbers: [],
      byMethod: {
        contanti: 90,
        pos: 334,
        bonifico: 0,
        misto: 0,
      },
    },
  ],
  cashFiscalSettings: {
    nextReceiptNumber: 4,
    nextInvoiceNumber: 1,
    nextClosureNumber: 2,
    registerType: 'Registratore telematico',
    registerSerial: 'RT-DEMO-001',
    posDebitFeePercent: 0,
    posCreditFeePercent: 0,
  },
  serviceTickets: [
    {
      id: 'srv-001',
      title: 'Installazione cinema room dedicata',
      customerName: 'Famiglia Bianchi',
      insertedAt: '2026-03-28',
      serviceType: 'installazione',
      locationType: 'domicilio',
      priority: 'alta',
      status: 'pianificato',
      technician: 'Marco',
      linkedQuoteId: 'prv-001',
      linkedAppointmentId: 'app-002',
      materialSummary: '2 diffusori surround, kit staffe, cablaggio speaker OFC',
      materialCost: 860,
      workSummary: 'Preparazione installazione e verifica predisposizione cliente',
      notes: 'Cliente disponibile nel pomeriggio. Verificare passaggio cavi in controsoffitto.',
      resolutionStatus: 'da-verificare',
      closedAt: null,
      materialLines: [
        {
          inventoryItemId: 'inv-001',
          itemName: 'Cavo speaker OFC 2x2.5 mm',
          quantity: 20,
          unitCost: 4.8,
          totalCost: 96,
        },
        {
          inventoryItemId: 'inv-002',
          itemName: 'Staffa speaker Pro',
          quantity: 4,
          unitCost: 36,
          totalCost: 144,
        },
      ],
      createdAt: '2026-03-28T09:15:00',
      updatedAt: '2026-03-29T11:40:00',
    },
    {
      id: 'srv-002',
      title: 'Diagnosi sintoamplificatore laboratorio',
      customerName: 'Cliente laboratorio',
      insertedAt: '2026-03-28',
      serviceType: 'diagnosi',
      locationType: 'officina',
      priority: 'media',
      status: 'in-lavorazione',
      technician: 'Luca',
      linkedQuoteId: null,
      linkedAppointmentId: 'app-003',
      materialSummary: 'Banco test, alimentatore laboratorio, kit saldatura',
      materialCost: 120,
      workSummary: 'Analisi alimentazione e controllo stadio finale',
      notes: 'Il cliente ha segnalato spegnimenti casuali dopo circa 40 minuti di utilizzo.',
      resolutionStatus: 'parziale',
      closedAt: null,
      materialLines: [
        {
          inventoryItemId: 'inv-003',
          itemName: 'Modulo alimentazione amplificatore',
          quantity: 1,
          unitCost: 95,
          totalCost: 95,
        },
      ],
      createdAt: '2026-03-28T10:45:00',
      updatedAt: '2026-03-30T16:05:00',
    },
    {
      id: 'srv-003',
      title: 'Assistenza multiroom residence',
      customerName: 'Residence Blu',
      insertedAt: '2026-03-28',
      serviceType: 'assistenza',
      locationType: 'domicilio',
      priority: 'alta',
      status: 'aperto',
      technician: 'Sara',
      linkedQuoteId: null,
      linkedAppointmentId: null,
      materialSummary: '',
      materialCost: 0,
      workSummary: '',
      notes: 'Richiesto controllo zone audio piano terra e reception.',
      resolutionStatus: 'da-verificare',
      closedAt: null,
      materialLines: [],
      createdAt: '2026-03-28T12:30:00',
      updatedAt: null,
    },
  ],
  // ===== NUOVI Task 1: valori DEFAULT per chiusure negozio =====
  storeClosingDaysWeekly: { lun: false, mar: false, mer: false, gio: false, ven: false, sab: false, dom: true }, // Domenica = chiusa di default
  storeExtraOpeningDates: [],
  storeBulkClosures: [],
};
