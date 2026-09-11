import { computed, effect, inject, Injectable, signal } from '@angular/core';

import {
  AppointmentRecord,
  AudiomaxState,
  CashFiscalSettings,
  CashOperatorRecord,
  CashPaymentSplit,
  CashRegisterProductRecord,
  CashShiftRecord,
  CashTransactionLine,
  CashTransactionRecord,
  ClientRecord,
  ClientPrivacyProfile,
  CompanyProfileRecord,
  EmployeeAttendanceRecord,
  EmployeeLeaveRecord,
  ExpenseAuditRecord,
  ExpenseCategoryRecord,
  ExpenseInstallmentRecord,
  ExpenseNotificationRecord,
  ExpensePaymentMethodRecord,
  ExpenseRecord,
  ExpenseSupplierRecord,
  InventoryItemRecord,
  QuoteRecord,
  ServiceTicketMaterialLine,
  ServiceTicketRecord,
  WarehouseAdjustmentRecord,
  WarehouseAuditRecord,
  WarehouseLotRecord,
  WarehouseMovementRecord,
  WarehousePositionRecord,
  WarehousePurchaseRecord,
  createClientPrivacyProfile,
  initialAudiomaxState,
} from './crm-runtime-data';
import { BrowserStorageService } from './browser-storage.service';
import { supabaseConfig } from './supabase.config';
import { SupabaseService } from './supabase.service';

interface ClientRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  segment: string;
  preferred_contact: ClientRecord['preferredContact'];
  notes: string;
  favorite_brands: string;
  last_contact: string;
  status: ClientRecord['status'];
  privacy_profile: ClientPrivacyProfile | null;
}

interface QuoteRow {
  id: string;
  customer_name: string;
  project_type: string;
  value: number | string;
  stage: QuoteRecord['stage'];
  due_date: string;
  discount_amount?: number | string | null;
  is_anonymous?: boolean | null;
}

interface AppointmentRow {
  id: string;
  title: string;
  customer_name: string;
  appointment_type: AppointmentRecord['appointmentType'];
  location_type: AppointmentRecord['locationType'];
  scheduled_at: string;
  duration_minutes: number | string;
  technician: string;
  linked_quote_id: string | null;
  status: AppointmentRecord['status'];
}

interface InventoryItemRow {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  category: string;
  usage_type?: InventoryItemRecord['usageType'] | null;
  stock: number | string;
  min_stock: number | string;
  unit_cost: number | string;
  sale_price?: number | string | null;
  supplier: string;
  location: string;
  cable_rolls?: number | string | null;
  cable_meters_per_roll?: number | string | null;
  status: InventoryItemRecord['status'];
}

interface CashProductRow {
  id: string;
  name: string;
  category: CashRegisterProductRecord['category'];
  price: number | string;
  shortcut: boolean;
  pricing_mode: CashRegisterProductRecord['pricingMode'];
  linked_inventory_item_id: string | null;
}

interface CashTransactionRow {
  id: string;
  reference: string;
  client_id: string | null;
  customer_name: string;
  document_type?: CashTransactionRecord['documentType'];
  payment_method: CashTransactionRecord['paymentMethod'];
  status: CashTransactionRecord['status'];
  created_at: string;
  notes: string;
  received_amount: number | string;
  total: number | string;
  change_amount: number | string;
  discount_amount?: number | string;
  discount_note?: string;
  receipt_number?: number | null;
  invoice_number?: number | null;
  linked_quote_id?: string | null;
  payment_split?: CashPaymentSplit | null;
  settled_at?: string | null;
  lines: CashTransactionLine[];
}

interface CashShiftRow {
  id: string;
  label: string;
  opened_at: string;
  closed_at: string;
  transactions_count: number | string;
  paid_total: number | string;
  suspended_total: number | string;
  by_method: CashShiftRecord['byMethod'];
}

interface ServiceTicketRow {
  id: string;
  title: string;
  customer_name: string;
  inserted_at?: string | null;
  service_type: ServiceTicketRecord['serviceType'];
  location_type: ServiceTicketRecord['locationType'];
  priority: ServiceTicketRecord['priority'];
  status: ServiceTicketRecord['status'];
  technician: string;
  linked_quote_id: string | null;
  linked_appointment_id: string | null;
  material_summary: string;
  material_cost: number | string;
  material_lines: ServiceTicketMaterialLine[];
  work_summary: string;
  notes?: string | null;
  resolution_status: ServiceTicketRecord['resolutionStatus'];
  closed_at: string | null;
  created_at: string;
  updated_at?: string | null;
}

interface WarehouseReceivePayload {
  inventoryItemId?: string | null;
  sku: string;
  barcode?: string;
  name: string;
  description: string;
  category: string;
  usageType: InventoryItemRecord['usageType'];
  unitOfMeasure: string;
  quantity: number;
  cableRolls?: number;
  cableMetersPerRoll?: number;
  unitCost: number;
  salePrice?: number;
  receivedDate: string;
  supplier: string;
  lotNumber: string;
  expiryDate: string | null;
  shelfCode: string;
  minStock: number;
  purchaseDocumentNumber: string;
  operator: string;
  transportCost: number;
  customsCost: number;
  packagingCost: number;
}

interface ExpenseCreatePayload {
  description: string;
  categoryId: string;
  supplierId: string | null;
  genericSupplierLabel: string | null;
  paymentMode: ExpenseRecord['paymentMode'];
  recurringFrequency: ExpenseRecord['recurringFrequency'];
  paymentMethodId: string;
  amountGross: number;
  vatRate: number;
  expenseDate: string;
  dueDate: string;
  notes: string;
  attachmentName: string | null;
  projectCode: string | null;
  costCenterCode: string | null;
  createdBy: string;
  sourceType: ExpenseRecord['sourceType'];
  sourceReferenceId: string | null;
  installmentsCount?: number;
  noticeDaysBefore?: number;
}

type ExpensePermission = 'expense:view' | 'expense:create' | 'expense:update' | 'expense:delete';
type AppUserRole = 'admin' | 'finance' | 'operations' | 'viewer';

export interface GlobalSearchResult {
  id: string;
  category: 'Cliente' | 'Preventivo' | 'Agenda' | 'Ticket' | 'Magazzino' | 'Cassa' | 'Spese';
  title: string;
  detail: string;
  status: string;
  route: string;
}

interface IndexedGlobalSearchResult extends GlobalSearchResult {
  searchIndex: string;
}

@Injectable({
  providedIn: 'root',
})
export class AudiomaxDataService {
  private readonly supabase = inject(SupabaseService);
  private readonly storage = inject(BrowserStorageService);
  private readonly storageKey = 'audiomax-crm-state';
  private readonly localPersistDelayMs = 180;
  private localPersistTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPersistedState: string | null = null;
  private lastPersistedState = '';
  readonly currentUserRole = signal<AppUserRole>('admin');

  readonly clients = signal<ClientRecord[]>(initialAudiomaxState.clients);
  readonly quotes = signal<QuoteRecord[]>(initialAudiomaxState.quotes);
  readonly appointments = signal<AppointmentRecord[]>(initialAudiomaxState.appointments);
  readonly inventoryItems = signal<InventoryItemRecord[]>(initialAudiomaxState.inventoryItems);
  readonly warehouseLots = signal<WarehouseLotRecord[]>(initialAudiomaxState.warehouseLots);
  readonly warehouseMovements = signal<WarehouseMovementRecord[]>(initialAudiomaxState.warehouseMovements);
  readonly warehousePositions = signal<WarehousePositionRecord[]>(initialAudiomaxState.warehousePositions);
  readonly warehousePurchases = signal<WarehousePurchaseRecord[]>(initialAudiomaxState.warehousePurchases);
  readonly warehouseAdjustments = signal<WarehouseAdjustmentRecord[]>(
    initialAudiomaxState.warehouseAdjustments,
  );
  readonly warehouseAuditLog = signal<WarehouseAuditRecord[]>(initialAudiomaxState.warehouseAuditLog);
  readonly serviceCategories = signal<string[]>(initialAudiomaxState.serviceCategories);
  readonly companyProfile = signal<CompanyProfileRecord>(initialAudiomaxState.companyProfile);
  readonly productCategories = signal<string[]>(
    Array.from(
      new Set(
        initialAudiomaxState.inventoryItems
          .map((item) => item.category)
          .filter((category): category is string => !!category && category.trim().length > 0),
      ),
    ).sort((left, right) => left.localeCompare(right, 'it-IT')),
  );
  readonly expenseCategories = signal<ExpenseCategoryRecord[]>(initialAudiomaxState.expenseCategories);
  readonly expenseSuppliers = signal<ExpenseSupplierRecord[]>(initialAudiomaxState.expenseSuppliers);
  readonly expensePaymentMethods = signal<ExpensePaymentMethodRecord[]>(
    initialAudiomaxState.expensePaymentMethods,
  );
  readonly expenseRecords = signal<ExpenseRecord[]>(initialAudiomaxState.expenseRecords);
  readonly expenseInstallments = signal<ExpenseInstallmentRecord[]>(
    initialAudiomaxState.expenseInstallments,
  );
  readonly expenseNotifications = signal<ExpenseNotificationRecord[]>(
    initialAudiomaxState.expenseNotifications,
  );
  readonly expenseAuditLog = signal<ExpenseAuditRecord[]>(initialAudiomaxState.expenseAuditLog);
  readonly cashOperators = signal<CashOperatorRecord[]>(initialAudiomaxState.cashOperators);
  readonly employeeLeaves = signal<EmployeeLeaveRecord[]>(initialAudiomaxState.employeeLeaves);
  readonly employeeAttendanceRecords = signal<EmployeeAttendanceRecord[]>(initialAudiomaxState.employeeAttendanceRecords);
  readonly cashProducts = signal<CashRegisterProductRecord[]>(initialAudiomaxState.cashProducts);
  readonly cashTransactions = signal<CashTransactionRecord[]>(initialAudiomaxState.cashTransactions);
  readonly cashShifts = signal<CashShiftRecord[]>(initialAudiomaxState.cashShifts);
  readonly cashFiscalSettings = signal<CashFiscalSettings>(initialAudiomaxState.cashFiscalSettings);
  readonly serviceTickets = signal<ServiceTicketRecord[]>(initialAudiomaxState.serviceTickets);
  // ===== NUOVI Task 1: negozio chiusure settimanali, aperture straordinarie, chiusure collettive =====
  readonly storeClosingDaysWeekly = signal<Record<'lun'|'mar'|'mer'|'gio'|'ven'|'sab'|'dom', boolean>>(initialAudiomaxState.storeClosingDaysWeekly);
  readonly storeExtraOpeningDates = signal<Array<{ id: string; date: string; note?: string }>>(initialAudiomaxState.storeExtraOpeningDates);
  readonly storeBulkClosures = signal<Array<{ id: string; startDate: string; endDate: string; reason: string }>>(initialAudiomaxState.storeBulkClosures);

  readonly activeClients = computed(
    () => this.clients().filter((client) => client.status !== 'lead').length,
  );
  readonly openQuotes = computed(
    () =>
      this.quotes().filter((quote) => quote.stage !== 'ordine' && quote.stage !== 'confermato').length,
  );
  readonly plannedAppointments = computed(
    () => this.appointments().filter((appointment) => appointment.status !== 'chiuso').length,
  );
  readonly projectedRevenue = computed(() =>
    this.quotes().reduce((total, quote) => total + quote.value, 0),
  );
  readonly openServiceTickets = computed(
    () => this.serviceTickets().filter((ticket) => ticket.status !== 'chiuso').length,
  );
  readonly closedServiceTickets = computed(
    () => this.serviceTickets().filter((ticket) => ticket.status === 'chiuso').length,
  );
  readonly lowStockItems = computed(
    () => this.inventoryItems().filter((item) => item.status !== 'disponibile').length,
  );
  readonly todayCashRevenue = computed(() =>
    this.cashTransactions()
      .filter((transaction) => transaction.status === 'pagato')
      .reduce((total, transaction) => total + transaction.total, 0),
  );
  readonly cashTransactionsCount = computed(() => this.cashTransactions().length);
  readonly latestCashShift = computed(() => this.cashShifts()[0] ?? null);
  readonly activeCashOperators = computed(() =>
    this.cashOperators().filter((operator) => operator.active),
  );
  readonly latestClients = computed(() => this.clients().slice(0, 5));
  readonly latestQuotes = computed(() => this.quotes().slice(0, 5));
  readonly nextAppointments = computed(() =>
    [...this.appointments()]
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
      .slice(0, 5),
  );
  readonly latestServiceTickets = computed(() => this.serviceTickets().slice(0, 5));
  readonly latestInventoryItems = computed(() => this.inventoryItems().slice(0, 5));
  readonly warehouseInventoryByLot = computed(() => {
    const itemMap = new Map(this.inventoryItems().map((item) => [item.id, item]));

    return this.warehouseLots().map((lot) => ({
      ...lot,
      productName: itemMap.get(lot.inventoryItemId)?.name ?? 'Prodotto',
      totalValue: lot.availableQuantity * lot.unitCost,
    }));
  });
  readonly warehouseInventorySummary = computed(() =>
    this.inventoryItems().map((item) => {
      const lots = this.warehouseLots()
        .filter((lot) => lot.inventoryItemId === item.id)
        .sort((left, right) => left.receivedDate.localeCompare(right.receivedDate));
      const quantityAvailable = lots.reduce((total, lot) => total + lot.availableQuantity, 0);
      const quantityReserved = lots.reduce((total, lot) => total + lot.reservedQuantity, 0);
      const quantityCommitted = this.serviceTickets()
        .filter((ticket) => ticket.status !== 'chiuso')
        .flatMap((ticket) => ticket.materialLines)
        .filter((line) => line.inventoryItemId === item.id)
        .reduce((total, line) => total + line.quantity, 0);
      const valuationByLot = lots.reduce(
        (total, lot) => total + lot.availableQuantity * lot.unitCost,
        0,
      );

      return {
        item,
        lots,
        quantityAvailable,
        quantityReserved,
        quantityCommitted,
        quantityReady: Math.max(0, quantityAvailable - quantityReserved),
        valuationByLot,
      };
    }),
  );
  readonly latestCashTransactions = computed(() => this.cashTransactions().slice(0, 5));
  readonly expenseUpcomingInstallments = computed(() =>
    this.expenseInstallments()
      .filter((entry) => entry.status !== 'pagata')
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
      .slice(0, 12),
  );
  readonly expenseTotalCurrentMonth = computed(() => {
    const month = new Date().toISOString().slice(0, 7);

    return this.expenseRecords()
      .filter((record) => record.expenseDate.startsWith(month))
      .reduce((total, record) => total + record.amountGross, 0);
  });
  readonly expenseByCategorySummary = computed(() => {
    const categoryMap = new Map(this.expenseCategories().map((entry) => [entry.id, entry]));
    const grouped = new Map<string, { categoryLabel: string; total: number; count: number }>();

    this.expenseRecords().forEach((expense) => {
      const label = categoryMap.get(expense.categoryId)?.label ?? expense.categoryId;
      const current = grouped.get(expense.categoryId) ?? { categoryLabel: label, total: 0, count: 0 };
      current.total += expense.amountGross;
      current.count += 1;
      grouped.set(expense.categoryId, current);
    });

    return [...grouped.values()].sort((left, right) => right.total - left.total);
  });
  readonly expensePermissions = computed(() => this.resolveExpensePermissions(this.currentUserRole()));
  readonly loyalClients = computed(() =>
    this.clients()
      .map((client) => {
        const transactions = this.cashTransactions().filter(
          (transaction) => transaction.customerName === client.name && transaction.status === 'pagato',
        );
        const totalSpent = transactions.reduce((sum, transaction) => sum + transaction.total, 0);

        return {
          client,
          totalSpent,
          visits: transactions.length,
          points: Math.floor(totalSpent / 10),
        };
      })
      .filter((entry) => entry.totalSpent > 0)
      .sort((left, right) => right.totalSpent - left.totalSpent)
      .slice(0, 5),
  );

  readonly recentActivities = computed(() => [
    ...this.clients().slice(0, 2).map((client) => ({
      title: client.name,
      detail: `${client.segment} · ${client.city}`,
      meta: `Cliente ${client.status}`,
    })),
    ...this.quotes().slice(0, 2).map((quote) => ({
      title: quote.projectType,
      detail: `${quote.customerName} · € ${quote.value.toLocaleString('it-IT')}`,
      meta: `Preventivo ${quote.stage}`,
    })),
    ...this.appointments().slice(0, 2).map((appointment) => ({
      title: appointment.title,
      detail: `${appointment.customerName} · ${appointment.technician}`,
      meta: `Agenda ${appointment.status}`,
    })),
    ...this.inventoryItems().slice(0, 2).map((item) => ({
      title: item.name,
      detail: `${item.sku} · ${item.location}`,
      meta: `Magazzino ${item.status}`,
    })),
    ...this.cashTransactions().slice(0, 2).map((transaction) => ({
      title: transaction.reference,
      detail: `${transaction.customerName} · € ${transaction.total.toLocaleString('it-IT')}`,
      meta: `Cassa ${transaction.paymentMethod}`,
    })),
    ...this.serviceTickets().slice(0, 2).map((ticket) => ({
      title: ticket.title,
      detail: `${ticket.customerName} · ${ticket.technician}`,
      meta: `Ticket ${ticket.status}`,
    })),
    ...this.expenseRecords().slice(0, 2).map((expense) => ({
      title: expense.description,
      detail: `${expense.expenseDate} · € ${expense.amountGross.toLocaleString('it-IT')}`,
      meta: `Spese ${expense.status}`,
    })),
  ]);

  private readonly searchableRecordIndex = computed<IndexedGlobalSearchResult[]>(() => [
    ...this.clients().map((client) =>
      this.createSearchRecord({
        id: client.id,
        category: 'Cliente',
        title: client.name,
        detail: `${client.segment} · ${client.city} · ${client.phone} · ${client.email}`,
        status: client.status,
        route: '/clienti',
      }),
    ),
    ...this.quotes().map((quote) =>
      this.createSearchRecord({
        id: quote.id,
        category: 'Preventivo',
        title: quote.projectType,
        detail: `${quote.customerName} · € ${quote.value.toLocaleString('it-IT')}`,
        status: quote.stage,
        route: '/preventivi',
      }),
    ),
    ...this.appointments().map((appointment) =>
      this.createSearchRecord({
        id: appointment.id,
        category: 'Agenda',
        title: appointment.title,
        detail: `${appointment.customerName} · ${appointment.technician}`,
        status: appointment.status,
        route: '/agenda',
      }),
    ),
    ...this.inventoryItems().map((item) =>
      this.createSearchRecord({
        id: item.id,
        category: 'Magazzino',
        title: item.name,
        detail: `${item.sku} · ${item.category} · ${item.location}`,
        status: item.status,
        route: '/magazzino',
      }),
    ),
    ...this.cashTransactions().map((transaction) =>
      this.createSearchRecord({
        id: transaction.id,
        category: 'Cassa',
        title: transaction.reference,
        detail: `${transaction.customerName} · € ${transaction.total.toLocaleString('it-IT')}`,
        status: transaction.paymentMethod,
        route: '/cassa',
      }),
    ),
    ...this.serviceTickets().map((ticket) =>
      this.createSearchRecord({
        id: ticket.id,
        category: 'Ticket',
        title: ticket.title,
        detail: `${ticket.customerName} · ${ticket.technician}`,
        status: ticket.status,
        route: '/servizio-tecnico',
      }),
    ),
    ...this.expenseRecords().map((expense) =>
      this.createSearchRecord({
        id: expense.id,
        category: 'Spese',
        title: expense.description,
        detail: `${expense.expenseDate} · € ${expense.amountGross.toLocaleString('it-IT')}`,
        status: expense.status,
        route: '/spese',
      }),
    ),
  ]);
  readonly searchableRecords = computed<GlobalSearchResult[]>(() =>
    this.searchableRecordIndex().map(({ searchIndex: _searchIndex, ...record }) => record),
  );

  constructor() {
    this.loadLocalState();

    effect(() => {
      this.scheduleLocalPersist(this.serializeSnapshot());
    });

    if (this.supabase.isConfigured) {
      void this.loadRemoteState();
    }
  }

  addClient(payload: Omit<ClientRecord, 'id' | 'lastContact'>): ClientRecord {
    const record: ClientRecord = {
      id: `cli-${crypto.randomUUID()}`,
      lastContact: new Date().toISOString().slice(0, 10),
      ...payload,
    };

    this.clients.update((items) => [record, ...items]);
    this.queueRemoteSync('client', record);
    return record;
  }

  updateClient(record: ClientRecord): void {
    this.clients.update((items) => items.map((item) => (item.id === record.id ? record : item)));
    this.queueRemoteSync('client', record);
  }

  deleteClient(id: string): void {
    this.clients.update((items) => items.filter((item) => item.id !== id));
    this.queueRemoteDelete('client', id);
  }

  addQuote(payload: Omit<QuoteRecord, 'id'>): void {
    const record: QuoteRecord = {
      id: `prv-${crypto.randomUUID()}`,
      ...payload,
    };

    this.quotes.update((items) => [record, ...items]);
    this.queueRemoteSync('quote', record);
  }

  updateQuote(record: QuoteRecord): void {
    this.quotes.update((items) => items.map((item) => (item.id === record.id ? record : item)));
    this.queueRemoteSync('quote', record);
  }

  deleteQuote(id: string): void {
    this.quotes.update((items) => items.filter((item) => item.id !== id));
    this.queueRemoteDelete('quote', id);
  }

  addAppointment(payload: Omit<AppointmentRecord, 'id'>): void {
    const record: AppointmentRecord = {
      id: `app-${crypto.randomUUID()}`,
      ...payload,
    };

    this.appointments.update((items) => [record, ...items]);
    this.queueRemoteSync('appointment', record);
  }

  updateCashTransaction(record: CashTransactionRecord): void {
    this.cashTransactions.update((items) => items.map((item) => (item.id === record.id ? record : item)));
    this.queueRemoteSync('cash-transaction', record);
  }

  reviseCashTransaction(record: CashTransactionRecord, previousRecord: CashTransactionRecord): void {
    const productMap = new Map(this.cashProducts().map((item) => [item.id, item]));
    const previousByInventory = new Map<string, number>();
    const nextByInventory = new Map<string, number>();

    const collectQuantities = (
      lines: CashTransactionLine[],
      bucket: Map<string, number>,
    ): void => {
      for (const line of lines) {
        const product = productMap.get(line.productId);
        if (!product?.linkedInventoryItemId) {
          continue;
        }

        bucket.set(
          product.linkedInventoryItemId,
          (bucket.get(product.linkedInventoryItemId) ?? 0) + line.quantity,
        );
      }
    };

    collectQuantities(previousRecord.lines, previousByInventory);
    collectQuantities(record.lines, nextByInventory);

    const inventoryIds = new Set([...previousByInventory.keys(), ...nextByInventory.keys()]);

    inventoryIds.forEach((inventoryItemId) => {
      const previousQuantity = previousByInventory.get(inventoryItemId) ?? 0;
      const nextQuantity = nextByInventory.get(inventoryItemId) ?? 0;
      const delta = nextQuantity - previousQuantity;

      if (!delta) {
        return;
      }

      const item = this.inventoryItems().find((entry) => entry.id === inventoryItemId);
      if (!item) {
        return;
      }

      this.adjustInventoryQuantity({
        inventoryItemId,
        actualQuantity: Math.max(0, item.stock - delta),
        reason: `Correzione documento ${record.reference}`,
        operator: 'Cassa',
      });
    });

    this.updateCashTransaction(record);
  }

  addInventoryItem(payload: Omit<InventoryItemRecord, 'id' | 'status'>): void {
    const record: InventoryItemRecord = {
      id: `inv-${crypto.randomUUID()}`,
      ...payload,
      status: this.resolveInventoryStatus(payload.stock, payload.minStock),
    };

    this.inventoryItems.update((items) => [record, ...items]);
    this.queueRemoteSync('inventory', record);
  }

  addExpenseCategory(payload: Omit<ExpenseCategoryRecord, 'id'>): void {
    if (!this.canExpense('expense:update')) {
      return;
    }
    const record: ExpenseCategoryRecord = {
      id: `exp-cat-${crypto.randomUUID()}`,
      ...payload,
    };
    this.expenseCategories.update((items) => [record, ...items]);
    this.appendExpenseAudit({
      entityType: 'category',
      entityId: record.id,
      action: 'create',
      detail: `Nuova categoria spese ${record.label}`,
      actor: 'Sistema',
      createdAt: new Date().toISOString(),
    });
  }

  addExpenseSupplier(payload: Omit<ExpenseSupplierRecord, 'id'>): ExpenseSupplierRecord | null {
    if (!this.canExpense('expense:update')) {
      return null;
    }
    const record: ExpenseSupplierRecord = {
      id: `exp-sup-${crypto.randomUUID()}`,
      ...payload,
    };
    this.expenseSuppliers.update((items) => [record, ...items]);
    this.appendExpenseAudit({
      entityType: 'supplier',
      entityId: record.id,
      action: 'create',
      detail: `Nuovo fornitore ${record.businessName}`,
      actor: 'Sistema',
      createdAt: new Date().toISOString(),
    });
    return record;
  }

  createExpense(payload: ExpenseCreatePayload): ExpenseRecord {
    if (!this.canExpense('expense:create')) {
      throw new Error('Permessi insufficienti per creare spese');
    }
    const gross = Math.max(0, Number(payload.amountGross) || 0);
    const vatRate = Math.max(0, Number(payload.vatRate) || 0);
    const amountNet = gross / (1 + vatRate / 100);
    const amountVat = gross - amountNet;
    const nowIso = new Date().toISOString();
    const expenseId = `exp-${crypto.randomUUID()}`;
    const record: ExpenseRecord = {
      id: expenseId,
      description: payload.description,
      categoryId: payload.categoryId,
      supplierId: payload.supplierId,
      genericSupplierLabel: payload.genericSupplierLabel,
      paymentMode: payload.paymentMode,
      recurringFrequency: payload.recurringFrequency,
      paymentMethodId: payload.paymentMethodId,
      amountGross: gross,
      vatRate,
      amountNet: Number(amountNet.toFixed(2)),
      amountVat: Number(amountVat.toFixed(2)),
      expenseDate: payload.expenseDate,
      dueDate: payload.dueDate,
      status: 'prevista',
      notes: payload.notes,
      attachmentName: payload.attachmentName,
      projectCode: payload.projectCode,
      costCenterCode: payload.costCenterCode,
      sourceType: payload.sourceType,
      sourceReferenceId: payload.sourceReferenceId,
      createdBy: payload.createdBy,
      createdAt: nowIso,
    };

    this.expenseRecords.update((items) => [record, ...items]);

    const installmentsCount =
      payload.paymentMode === 'rateale' ? Math.max(1, Number(payload.installmentsCount) || 1) : 1;
    const noticeDaysBefore = Math.max(1, Math.min(30, Number(payload.noticeDaysBefore) || 7));
    const installmentAmount = Number((gross / installmentsCount).toFixed(2));

    const installments: ExpenseInstallmentRecord[] = Array.from({ length: installmentsCount }).map(
      (_, index) => ({
        id: `exp-inst-${crypto.randomUUID()}`,
        expenseId,
        installmentNumber: index + 1,
        dueDate: this.addMonthsToDate(payload.dueDate, payload.paymentMode === 'rateale' ? index : 0),
        amount:
          index === installmentsCount - 1
            ? Number((gross - installmentAmount * (installmentsCount - 1)).toFixed(2))
            : installmentAmount,
        status: 'prevista',
        noticeDaysBefore,
        paidAt: null,
      }),
    );

    this.expenseInstallments.update((items) => [...installments, ...items]);
    this.appendExpenseAudit({
      entityType: 'expense',
      entityId: expenseId,
      action: 'create',
      detail: `Creata spesa ${record.description} per € ${record.amountGross.toLocaleString('it-IT')}`,
      actor: payload.createdBy,
      createdAt: nowIso,
    });

    return record;
  }

  markExpenseInstallmentPaid(installmentId: string, actor: string): void {
    if (!this.canExpense('expense:update')) {
      return;
    }
    const installment = this.expenseInstallments().find((entry) => entry.id === installmentId);

    if (!installment) {
      return;
    }

    const nowIso = new Date().toISOString();
    this.expenseInstallments.update((items) =>
      items.map((entry) =>
        entry.id === installmentId ? { ...entry, status: 'pagata', paidAt: nowIso } : entry,
      ),
    );

    const expenseInstallments = this.expenseInstallments().filter(
      (entry) => entry.expenseId === installment.expenseId,
    );
    const allPaid = expenseInstallments.every((entry) => entry.status === 'pagata');
    this.expenseRecords.update((items) =>
      items.map((entry) =>
        entry.id === installment.expenseId
          ? {
              ...entry,
              status: allPaid ? 'pagata' : 'parziale',
            }
          : entry,
      ),
    );

    this.appendExpenseAudit({
      entityType: 'installment',
      entityId: installmentId,
      action: 'payment',
      detail: `Pagata rata ${installment.installmentNumber} spesa ${installment.expenseId}`,
      actor,
      createdAt: nowIso,
    });
  }

  setCurrentUserRole(role: AppUserRole): void {
    this.currentUserRole.set(role);
  }

  runExpenseReminderSweep(referenceDate = new Date().toISOString().slice(0, 10)): void {
    const alerts = [7, 3, 1];
    const reference = new Date(referenceDate);

    if (Number.isNaN(reference.getTime())) {
      return;
    }

    this.expenseInstallments.update((items) =>
      items.map((installment) => {
        if (installment.status === 'pagata') {
          return installment;
        }

        const due = new Date(installment.dueDate);
        const diff = Math.floor((due.getTime() - reference.getTime()) / (1000 * 60 * 60 * 24));

        if (diff < 0 && installment.status === 'prevista') {
          return {
            ...installment,
            status: 'scaduta',
          };
        }

        return installment;
      }),
    );

    const nowIso = new Date().toISOString();
    const newNotifications: ExpenseNotificationRecord[] = [];

    this.expenseInstallments().forEach((installment) => {
      if (installment.status === 'pagata') {
        return;
      }

      const due = new Date(installment.dueDate);
      const diff = Math.floor((due.getTime() - reference.getTime()) / (1000 * 60 * 60 * 24));

      alerts.forEach((daysBefore) => {
        if (diff !== daysBefore || daysBefore > installment.noticeDaysBefore) {
          return;
        }

        const alreadyExists = this.expenseNotifications().some(
          (notification) =>
            notification.installmentId === installment.id &&
            notification.daysBeforeDue === daysBefore &&
            notification.channel === 'push',
        );

        if (alreadyExists) {
          return;
        }

        newNotifications.push({
          id: `exp-not-${crypto.randomUUID()}`,
          expenseId: installment.expenseId,
          installmentId: installment.id,
          channel: 'push',
          daysBeforeDue: daysBefore,
          sentAt: nowIso,
          readAt: null,
        });
      });
    });

    if (newNotifications.length) {
      this.expenseNotifications.update((items) => [...newNotifications, ...items]);
      newNotifications.forEach((entry) => {
        this.appendExpenseAudit({
          entityType: 'notification',
          entityId: entry.id,
          action: 'create',
          detail: `Notifica promemoria inviata (-${entry.daysBeforeDue} giorni)`,
          actor: 'Sistema',
          createdAt: nowIso,
        });
      });
    }
  }

  markExpenseNotificationRead(notificationId: string): void {
    const nowIso = new Date().toISOString();
    this.expenseNotifications.update((items) =>
      items.map((notification) =>
        notification.id === notificationId ? { ...notification, readAt: nowIso } : notification,
      ),
    );
  }

  receiveWarehouseStock(payload: WarehouseReceivePayload): void {
    const normalizedQuantity = Math.max(0, Number(payload.quantity) || 0);
    const normalizedCableRolls = Math.max(0, Number(payload.cableRolls) || 0);
    const normalizedCableMetersPerRoll = Math.max(0, Number(payload.cableMetersPerRoll) || 0);
    const normalizedUnitCost = Math.max(0, Number(payload.unitCost) || 0);
    const normalizedSalePrice = Math.max(0, Number(payload.salePrice) || 0);
    const normalizedMinStock = Math.max(0, Number(payload.minStock) || 0);
    const normalizedTransport = Math.max(0, Number(payload.transportCost) || 0);
    const normalizedCustoms = Math.max(0, Number(payload.customsCost) || 0);
    const normalizedPackaging = Math.max(0, Number(payload.packagingCost) || 0);

    if (!normalizedQuantity) {
      return;
    }

    const existingItem =
      this.inventoryItems().find((item) => item.id === payload.inventoryItemId) ??
      this.inventoryItems().find((item) => item.sku === payload.sku) ??
      null;
    const inventoryItemId = existingItem?.id ?? `inv-${crypto.randomUUID()}`;
    const resolvedBarcode = (payload.barcode ?? '').trim() || existingItem?.barcode || '';
    const resolvedSalePrice =
      payload.salePrice === undefined && existingItem ? existingItem.salePrice : normalizedSalePrice;
    const existingLots = this.warehouseLots()
      .filter((lot) => lot.inventoryItemId === inventoryItemId)
      .sort((left, right) => right.receivedDate.localeCompare(left.receivedDate));
    const latestLot = existingLots[0] ?? null;
    const shouldCreateNewLot =
      !latestLot ||
      latestLot.unitCost !== normalizedUnitCost ||
      (latestLot.barcode ?? '') !== resolvedBarcode ||
      Number(latestLot.salePrice ?? 0) !== resolvedSalePrice;
    const generatedLotCode = shouldCreateNewLot
      ? `LOTTO-${String(existingLots.length + 1).padStart(3, '0')}`
      : latestLot!.lotCode;
    const lotCode = payload.lotNumber.trim() || generatedLotCode;
    const lotId = shouldCreateNewLot ? `lot-${crypto.randomUUID()}` : latestLot!.id;
    const nowIso = new Date().toISOString();
    const totalCost =
      normalizedQuantity * normalizedUnitCost +
      normalizedTransport +
      normalizedCustoms +
      normalizedPackaging;

    if (existingItem) {
      const updatedStock = existingItem.stock + normalizedQuantity;
      this.updateInventoryItem({
        ...existingItem,
        sku: payload.sku.trim() || existingItem.sku,
        barcode: resolvedBarcode,
        name: payload.name.trim() || existingItem.name,
        category: payload.category?.trim() || existingItem.category,
        usageType: payload.usageType || existingItem.usageType,
        stock: updatedStock,
        unitCost: normalizedUnitCost,
        salePrice: resolvedSalePrice,
        minStock: normalizedMinStock,
        supplier: payload.supplier,
        location: payload.shelfCode,
        cableRolls:
          normalizedCableRolls > 0
            ? (existingItem.cableRolls ?? 0) + normalizedCableRolls
            : existingItem.cableRolls ?? null,
        cableMetersPerRoll:
          normalizedCableMetersPerRoll > 0
            ? normalizedCableMetersPerRoll
            : existingItem.cableMetersPerRoll ?? null,
      });
    } else {
      const itemName = payload.description.trim() || payload.name.trim();
      const resolvedCategory = payload.category?.trim() || 'Generale';
      this.addProductCategory(resolvedCategory);
      const newItem: InventoryItemRecord = {
        id: inventoryItemId,
        sku: payload.sku,
        barcode: resolvedBarcode,
        name: itemName,
        category: resolvedCategory,
        usageType: payload.usageType || 'rivendita',
        stock: normalizedQuantity,
        minStock: normalizedMinStock,
        unitCost: normalizedUnitCost,
        salePrice: resolvedSalePrice,
        supplier: payload.supplier,
        location: payload.shelfCode,
        cableRolls: normalizedCableRolls > 0 ? normalizedCableRolls : null,
        cableMetersPerRoll: normalizedCableMetersPerRoll > 0 ? normalizedCableMetersPerRoll : null,
        status: this.resolveInventoryStatus(normalizedQuantity, normalizedMinStock),
      };

      this.inventoryItems.update((items) => [newItem, ...items]);
      this.queueRemoteSync('inventory', newItem);
    }

    if (shouldCreateNewLot) {
      const newLot: WarehouseLotRecord = {
        id: lotId,
        inventoryItemId,
        lotCode,
        barcode: resolvedBarcode,
        supplier: payload.supplier,
        receivedDate: payload.receivedDate,
        receivedQuantity: normalizedQuantity,
        availableQuantity: normalizedQuantity,
        reservedQuantity: 0,
        unitCost: normalizedUnitCost,
        salePrice: resolvedSalePrice,
        expiryDate: payload.expiryDate || null,
        shelfCode: payload.shelfCode,
        purchaseDocumentNumber: payload.purchaseDocumentNumber,
      };
      this.warehouseLots.update((items) => [newLot, ...items]);
    } else {
      this.warehouseLots.update((items) =>
        items.map((lot) =>
          lot.id === lotId
            ? {
                ...lot,
                receivedQuantity: lot.receivedQuantity + normalizedQuantity,
                availableQuantity: lot.availableQuantity + normalizedQuantity,
                receivedDate: payload.receivedDate,
                barcode: resolvedBarcode,
                purchaseDocumentNumber: payload.purchaseDocumentNumber || lot.purchaseDocumentNumber,
                salePrice: resolvedSalePrice,
                shelfCode: payload.shelfCode || lot.shelfCode,
              }
            : lot,
        ),
      );
    }

    const linkedExpenseId = `EXP-${payload.receivedDate.replaceAll('-', '')}-${String(this.warehousePurchases().length + 1).padStart(3, '0')}`;
    this.warehousePurchases.update((items) => [
      {
        id: `wpur-${crypto.randomUUID()}`,
        inventoryItemId,
        lotId,
        supplier: payload.supplier,
        documentNumber: payload.purchaseDocumentNumber,
        receivedDate: payload.receivedDate,
        quantity: normalizedQuantity,
        unitCost: normalizedUnitCost,
        transportCost: normalizedTransport,
        customsCost: normalizedCustoms,
        packagingCost: normalizedPackaging,
        totalCost,
        linkedExpenseId,
      },
      ...items,
    ]);

    const warehouseExpenseCategory =
      this.expenseCategories().find((entry) => entry.parentCategory === 'magazzino') ??
      this.expenseCategories()[0];
    const warehousePaymentMethod = this.expensePaymentMethods()[0];
    const supplierMatch =
      this.expenseSuppliers().find((entry) => entry.businessName === payload.supplier) ?? null;
    this.createExpense({
      description: `Acquisto magazzino ${payload.description || payload.name}`,
      categoryId: warehouseExpenseCategory?.id ?? 'exp-cat-004',
      supplierId: supplierMatch?.id ?? null,
      genericSupplierLabel: supplierMatch ? null : payload.supplier,
      paymentMode: 'singolo',
      recurringFrequency: null,
      paymentMethodId: warehousePaymentMethod?.id ?? 'pay-001',
      amountGross: totalCost,
      vatRate: 22,
      expenseDate: payload.receivedDate,
      dueDate: payload.receivedDate,
      notes: `Generata automaticamente da carico magazzino ${payload.purchaseDocumentNumber}`,
      attachmentName: null,
      projectCode: null,
      costCenterCode: 'CC-MAGAZZINO',
      createdBy: payload.operator,
      sourceType: 'magazzino',
      sourceReferenceId: linkedExpenseId,
      installmentsCount: 1,
      noticeDaysBefore: 7,
    });

    this.warehouseMovements.update((items) => [
      {
        id: `wmov-${crypto.randomUUID()}`,
        inventoryItemId,
        lotId,
        movementType: 'carico',
        quantity: normalizedQuantity,
        unitCost: normalizedUnitCost,
        totalCost: normalizedQuantity * normalizedUnitCost,
        documentNumber: payload.purchaseDocumentNumber,
        reason: `Carico merce ${payload.description || payload.name}`,
        operator: payload.operator,
        sourceModule: 'magazzino',
        movedAt: nowIso,
      },
      ...items,
    ]);

    this.registerWarehousePosition(payload.shelfCode, inventoryItemId);
    this.appendWarehouseAudit({
      entityType: 'lot',
      entityId: lotId,
      action: shouldCreateNewLot ? 'create' : 'update',
      detail: `Ricevuti ${normalizedQuantity} pezzi a € ${normalizedUnitCost.toLocaleString('it-IT')} (${lotCode})`,
      actor: payload.operator,
      createdAt: nowIso,
    });
  }

  consumeInventoryFifoByItemId(params: {
    inventoryItemId: string;
    quantity: number;
    reason: string;
    documentNumber: string;
    operator: string;
    sourceModule: WarehouseMovementRecord['sourceModule'];
  }): number {
    const requestedQuantity = Math.max(0, Number(params.quantity) || 0);

    if (!requestedQuantity) {
      return 0;
    }

    const inventoryItem = this.inventoryItems().find((item) => item.id === params.inventoryItemId);

    if (!inventoryItem) {
      return 0;
    }

    const fifoLots = this.warehouseLots()
      .filter((lot) => lot.inventoryItemId === params.inventoryItemId && lot.availableQuantity > 0)
      .sort((left, right) => left.receivedDate.localeCompare(right.receivedDate));
    let remaining = requestedQuantity;
    const nowIso = new Date().toISOString();
    const consumedByLot = new Map<string, number>();

    for (const lot of fifoLots) {
      if (!remaining) {
        break;
      }

      const consumed = Math.min(lot.availableQuantity, remaining);
      remaining -= consumed;
      consumedByLot.set(lot.id, consumed);
    }

    const consumedTotal = requestedQuantity - remaining;

    if (!consumedTotal) {
      return 0;
    }

    this.warehouseLots.update((items) =>
      items.map((lot) => {
        const consumed = consumedByLot.get(lot.id) ?? 0;

        return consumed
          ? {
              ...lot,
              availableQuantity: Math.max(0, lot.availableQuantity - consumed),
            }
          : lot;
      }),
    );

    const movementRows = fifoLots.reduce<WarehouseMovementRecord[]>((acc, lot) => {
        const consumed = consumedByLot.get(lot.id) ?? 0;

        if (!consumed) {
          return acc;
        }

        acc.push({
          id: `wmov-${crypto.randomUUID()}`,
          inventoryItemId: lot.inventoryItemId,
          lotId: lot.id,
          movementType: 'scarico',
          quantity: consumed,
          unitCost: lot.unitCost,
          totalCost: consumed * lot.unitCost,
          documentNumber: params.documentNumber,
          reason: params.reason,
          operator: params.operator,
          sourceModule: params.sourceModule,
          movedAt: nowIso,
        });

        return acc;
      }, []);

    if (movementRows.length) {
      this.warehouseMovements.update((items) => [...movementRows, ...items]);
      movementRows.forEach((movement) => {
        this.appendWarehouseAudit({
          entityType: 'movement',
          entityId: movement.id,
          action: 'consume-fifo',
          detail: `Scarico FIFO ${movement.quantity} pz dal lotto ${movement.lotId}`,
          actor: params.operator,
          createdAt: nowIso,
        });
      });
    }

    const newStock = Math.max(0, inventoryItem.stock - consumedTotal);
    this.updateInventoryItem({
      ...inventoryItem,
      stock: newStock,
    });

    return consumedTotal;
  }

  adjustInventoryQuantity(params: {
    inventoryItemId: string;
    actualQuantity: number;
    reason: string;
    operator: string;
  }): void {
    const item = this.inventoryItems().find((entry) => entry.id === params.inventoryItemId);

    if (!item) {
      return;
    }

    const actualQuantity = Math.max(0, Number(params.actualQuantity) || 0);
    const deltaQuantity = actualQuantity - item.stock;
    const nowIso = new Date().toISOString();

    if (!deltaQuantity) {
      return;
    }

    this.warehouseAdjustments.update((items) => [
      {
        id: `wadj-${crypto.randomUUID()}`,
        inventoryItemId: item.id,
        lotId: null,
        previousQuantity: item.stock,
        actualQuantity,
        deltaQuantity,
        reason: params.reason,
        operator: params.operator,
        adjustedAt: nowIso,
      },
      ...items,
    ]);

    if (deltaQuantity < 0) {
      this.consumeInventoryFifoByItemId({
        inventoryItemId: item.id,
        quantity: Math.abs(deltaQuantity),
        reason: `Rettifica inventario: ${params.reason}`,
        documentNumber: `RET-${nowIso.slice(0, 10)}`,
        operator: params.operator,
        sourceModule: 'inventario',
      });
    } else {
      const lastLot = this.warehouseLots()
        .filter((lot) => lot.inventoryItemId === item.id)
        .sort((left, right) => right.receivedDate.localeCompare(left.receivedDate))[0];
      const lotId = `lot-${crypto.randomUUID()}`;
      const lotCode = `RET-${String(this.warehouseLots().filter((lot) => lot.inventoryItemId === item.id).length + 1).padStart(3, '0')}`;
      const unitCost = lastLot?.unitCost ?? item.unitCost;

      this.warehouseLots.update((items) => [
        {
          id: lotId,
          inventoryItemId: item.id,
          lotCode,
          barcode: lastLot?.barcode ?? item.barcode,
          supplier: item.supplier,
          receivedDate: nowIso.slice(0, 10),
          receivedQuantity: deltaQuantity,
          availableQuantity: deltaQuantity,
          reservedQuantity: 0,
          unitCost,
          salePrice: lastLot?.salePrice ?? item.salePrice,
          expiryDate: null,
          shelfCode: item.location,
          purchaseDocumentNumber: `RET-${nowIso.slice(0, 10)}`,
        },
        ...items,
      ]);
      this.warehouseMovements.update((items) => [
        {
          id: `wmov-${crypto.randomUUID()}`,
          inventoryItemId: item.id,
          lotId,
          movementType: 'rettifica+/-',
          quantity: deltaQuantity,
          unitCost,
          totalCost: deltaQuantity * unitCost,
          documentNumber: `RET-${nowIso.slice(0, 10)}`,
          reason: params.reason,
          operator: params.operator,
          sourceModule: 'inventario',
          movedAt: nowIso,
        },
        ...items,
      ]);
      this.updateInventoryItem({
        ...item,
        stock: actualQuantity,
      });
    }

    this.appendWarehouseAudit({
      entityType: 'adjustment',
      entityId: params.inventoryItemId,
      action: 'adjust',
      detail: `Rettifica inventario da ${item.stock} a ${actualQuantity}`,
      actor: params.operator,
      createdAt: nowIso,
    });
  }

  addCashProduct(payload: Omit<CashRegisterProductRecord, 'id'>): void {
    const record: CashRegisterProductRecord = {
      id: `cash-prod-${crypto.randomUUID()}`,
      ...payload,
    };

    this.cashProducts.update((items) => [record, ...items]);
    this.queueRemoteSync('cash-product', record);
  }

  updateCashProduct(record: CashRegisterProductRecord): void {
    this.cashProducts.update((items) => items.map((item) => (item.id === record.id ? record : item)));
    this.queueRemoteSync('cash-product', record);
  }

  addCashOperator(payload: Omit<CashOperatorRecord, 'id'>): void {
    const record: CashOperatorRecord = {
      id: `cash-op-${crypto.randomUUID()}`,
      ...payload,
    };

    this.cashOperators.update((items) => [record, ...items]);
  }

  addServiceTicket(
    payload: Omit<ServiceTicketRecord, 'id' | 'createdAt' | 'updatedAt'> & {
      updatedAt?: string | null;
    },
  ): ServiceTicketRecord {
    const record: ServiceTicketRecord = {
      id: `srv-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      ...payload,
      updatedAt: payload.updatedAt ?? null,
    };

    this.serviceTickets.update((items) => [record, ...items]);
    this.queueRemoteSync('ticket', record);
    return record;
  }

  updateAppointment(record: AppointmentRecord): void {
    this.appointments.update((items) => items.map((item) => (item.id === record.id ? record : item)));
    this.queueRemoteSync('appointment', record);
  }

  updateInventoryItem(record: InventoryItemRecord): void {
    const normalizedRecord: InventoryItemRecord = {
      ...record,
      status: this.resolveInventoryStatus(record.stock, record.minStock),
    };

    this.inventoryItems.update((items) =>
      items.map((item) => (item.id === normalizedRecord.id ? normalizedRecord : item)),
    );
    this.syncCashProductsForInventoryItem(normalizedRecord);
    this.queueRemoteSync('inventory', normalizedRecord);
  }

  updateServiceTicket(record: ServiceTicketRecord): void {
    this.serviceTickets.update((items) => items.map((item) => (item.id === record.id ? record : item)));
    this.queueRemoteSync('ticket', record);
  }

  deleteAppointment(id: string): void {
    this.appointments.update((items) => items.filter((item) => item.id !== id));
    this.queueRemoteDelete('appointment', id);
  }

  deleteInventoryItem(id: string): void {
    this.inventoryItems.update((items) => items.filter((item) => item.id !== id));
    this.warehouseLots.update((items) => items.filter((lot) => lot.inventoryItemId !== id));
    this.warehouseMovements.update((items) => items.filter((movement) => movement.inventoryItemId !== id));
    this.warehousePurchases.update((items) => items.filter((purchase) => purchase.inventoryItemId !== id));
    this.warehouseAdjustments.update((items) =>
      items.filter((adjustment) => adjustment.inventoryItemId !== id),
    );
    this.warehousePositions.update((items) =>
      items
        .map((position) => ({
          ...position,
          occupiedInventoryItemIds: position.occupiedInventoryItemIds.filter((itemId) => itemId !== id),
        }))
        .filter((position) => position.occupiedInventoryItemIds.length > 0),
    );
    this.queueRemoteDelete('inventory', id);
  }

  deleteCashProduct(id: string): void {
    this.cashProducts.update((items) => items.filter((item) => item.id !== id));
    this.queueRemoteDelete('cash-product', id);
  }

  addServiceCategory(name: string): void {
    const label = name.trim();
    if (!label) {
      return;
    }
    const exists = this.serviceCategories().some((entry) => entry.toLowerCase() === label.toLowerCase());
    if (exists) {
      return;
    }
    this.serviceCategories.update((items) =>
      [...items, label].sort((left, right) => left.localeCompare(right, 'it-IT')),
    );
  }

  removeServiceCategory(name: string): void {
    const label = name.trim();
    if (!label) {
      return;
    }
    this.serviceCategories.update((items) => items.filter((entry) => entry !== label));
  }

  addProductCategory(name: string): string | null {
    const label = name.trim();
    if (!label) {
      return null;
    }
    const existing = this.productCategories().find(
      (entry) => entry.toLowerCase() === label.toLowerCase(),
    );
    if (existing) {
      return existing;
    }
    this.productCategories.update((items) =>
      [...items, label].sort((left, right) => left.localeCompare(right, 'it-IT')),
    );
    return label;
  }

  updateCashOperator(record: CashOperatorRecord): void {
    this.cashOperators.update((items) => items.map((item) => (item.id === record.id ? record : item)));
  }

  addEmployeeLeave(payload: Omit<EmployeeLeaveRecord, 'id'>): void {
    const record: EmployeeLeaveRecord = {
      id: `leave-${crypto.randomUUID()}`,
      ...payload,
    };

    this.employeeLeaves.update((items) => [record, ...items]);
  }

  deleteEmployeeLeave(id: string): void {
    this.employeeLeaves.update((items) => items.filter((item) => item.id !== id));
  }

  upsertEmployeeAttendanceRecord(payload: Omit<EmployeeAttendanceRecord, 'id'>): void {
    this.employeeAttendanceRecords.update((items) => {
      const existing = items.find((item) => item.employeeId === payload.employeeId && item.date === payload.date);
      if (existing) {
        return items.map((item) =>
          item.id === existing.id
            ? {
                ...existing,
                ...payload,
              }
            : item,
        );
      }

      return [
        {
          id: `attendance-${crypto.randomUUID()}`,
          ...payload,
        },
        ...items,
      ];
    });
  }

  upsertEmployeeAttendanceRecords(payloads: Omit<EmployeeAttendanceRecord, 'id'>[]): void {
    if (!payloads.length) {
      return;
    }

    this.employeeAttendanceRecords.update((items) => {
      let nextItems = [...items];

      for (const payload of payloads) {
        const existing = nextItems.find(
          (item) => item.employeeId === payload.employeeId && item.date === payload.date,
        );

        if (existing) {
          nextItems = nextItems.map((item) =>
            item.id === existing.id
              ? {
                  ...existing,
                  ...payload,
                }
              : item,
          );
          continue;
        }

        nextItems = [
          {
            id: `attendance-${crypto.randomUUID()}`,
            ...payload,
          },
          ...nextItems,
        ];
      }

      return nextItems;
    });
  }

  deleteEmployeeAttendanceRecord(employeeId: string, date: string): void {
    this.employeeAttendanceRecords.update((items) =>
      items.filter((item) => !(item.employeeId === employeeId && item.date === date)),
    );
  }

  deleteCashOperator(id: string): void {
    this.cashOperators.update((items) => items.filter((item) => item.id !== id));
  }

  closeCashShift(label: string): void {
    const paidTransactions = this.cashTransactions().filter((transaction) => transaction.status === 'pagato');
    const suspendedTransactions = this.cashTransactions().filter(
      (transaction) => transaction.status === 'sospeso',
    );
    const fiscal = this.cashFiscalSettings();
    const receiptNumbers = paidTransactions
      .filter((transaction) => transaction.receiptNumber !== null)
      .map((transaction) => transaction.receiptNumber!)
      .sort((left, right) => left - right);
    const invoiceNumbers = paidTransactions
      .filter((transaction) => transaction.invoiceNumber !== null)
      .map((transaction) => transaction.invoiceNumber!)
      .sort((left, right) => left - right);

    const shift: CashShiftRecord = {
      id: `shift-${crypto.randomUUID()}`,
      label,
      openedAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
      closedAt: new Date().toISOString(),
      closureNumber: fiscal.nextClosureNumber,
      transactionsCount: this.cashTransactions().length,
      paidTotal: paidTransactions.reduce((sum, transaction) => sum + transaction.total, 0),
      suspendedTotal: suspendedTransactions.reduce((sum, transaction) => sum + transaction.total, 0),
      receiptNumbers,
      invoiceNumbers,
      byMethod: {
        contanti: paidTransactions
          .filter((transaction) => transaction.paymentMethod === 'contanti')
          .reduce((sum, transaction) => sum + transaction.total, 0),
        pos: paidTransactions
          .filter((transaction) => transaction.paymentMethod === 'pos')
          .reduce((sum, transaction) => sum + transaction.total, 0),
        bonifico: paidTransactions
          .filter((transaction) => transaction.paymentMethod === 'bonifico')
          .reduce((sum, transaction) => sum + transaction.total, 0),
        misto: paidTransactions
          .filter((transaction) => transaction.paymentMethod === 'misto')
          .reduce((sum, transaction) => sum + transaction.total, 0),
      },
    };

    this.cashFiscalSettings.update((settings) => ({
      ...settings,
      nextClosureNumber: settings.nextClosureNumber + 1,
    }));
    this.cashShifts.update((items) => [shift, ...items]);
    this.queueRemoteSync('cash-shift', shift);
  }

  updateCashFiscalSettings(settings: Partial<CashFiscalSettings>): void {
    this.cashFiscalSettings.update((current) => ({ ...current, ...settings }));
  }

  updateCompanyProfile(settings: Partial<CompanyProfileRecord>): void {
    this.companyProfile.update((current) => ({ ...current, ...settings }));
  }

  deleteServiceTicket(id: string): void {
    this.serviceTickets.update((items) => items.filter((item) => item.id !== id));
    this.queueRemoteDelete('ticket', id);
  }

  advanceQuote(id: string): void {
    let updatedQuote: QuoteRecord | null = null;

    this.quotes.update((items) =>
      items.map((item) => {
        if (item.id !== id) {
          return item;
        }

        if (item.stage === 'bozza') {
          updatedQuote = { ...item, stage: 'trattativa' };
          return updatedQuote;
        }

        if (item.stage === 'trattativa') {
          updatedQuote = { ...item, stage: 'ordine' };
          return updatedQuote;
        }

        return item;
      }),
    );

    if (updatedQuote) {
      this.queueRemoteSync('quote', updatedQuote);
    }
  }

  completeAppointment(id: string): void {
    let updatedAppointment: AppointmentRecord | null = null;

    this.appointments.update((items) =>
      items.map((item) => {
        if (item.id !== id) {
          return item;
        }

        updatedAppointment = { ...item, status: 'chiuso' };
        return updatedAppointment;
      }),
    );

    if (updatedAppointment) {
      this.queueRemoteSync('appointment', updatedAppointment);
    }
  }

  progressServiceTicket(id: string): void {
    let updatedTicket: ServiceTicketRecord | null = null;

    this.serviceTickets.update((items) =>
      items.map((item) => {
        if (item.id !== id) {
          return item;
        }

        if (item.status === 'aperto') {
          updatedTicket = { ...item, status: 'pianificato', updatedAt: new Date().toISOString() };
          return updatedTicket;
        }

        if (item.status === 'pianificato') {
          updatedTicket = { ...item, status: 'in-lavorazione', updatedAt: new Date().toISOString() };
          return updatedTicket;
        }

        if (item.status === 'in-lavorazione') {
          updatedTicket = { ...item, status: 'chiuso', updatedAt: new Date().toISOString() };
          return updatedTicket;
        }

        return item;
      }),
    );

    if (updatedTicket) {
      this.queueRemoteSync('ticket', updatedTicket);
    }
  }

  createServiceTicketFromQuote(quoteId: string): void {
    const quote = this.quotes().find((item) => item.id === quoteId);

    if (!quote) {
      return;
    }

    this.addServiceTicket({
      title: `Ticket ${quote.projectType}`,
      customerName: quote.customerName,
      insertedAt: new Date().toISOString().slice(0, 10),
      serviceType: 'installazione',
      locationType: 'domicilio',
      priority: quote.stage === 'ordine' || quote.stage === 'confermato' ? 'alta' : 'media',
      status: quote.stage === 'ordine' || quote.stage === 'confermato' ? 'pianificato' : 'aperto',
      technician: 'Da assegnare',
      linkedQuoteId: quote.id,
      linkedAppointmentId: null,
      materialSummary: '',
      materialCost: 0,
      workSummary: '',
      notes: '',
      resolutionStatus: 'da-verificare',
      closedAt: null,
      materialLines: [],
    });
  }

  scheduleAppointmentFromTicket(ticketId: string): void {
    const ticket = this.serviceTickets().find((item) => item.id === ticketId);

    if (!ticket) {
      return;
    }

    const appointmentId = `app-${crypto.randomUUID()}`;
    const appointment: AppointmentRecord = {
      id: appointmentId,
      title: ticket.title,
      customerName: ticket.customerName,
      appointmentType: 'installazione',
      locationType: ticket.locationType,
      scheduledAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
      durationMinutes: 120,
      technician: ticket.technician,
      linkedQuoteId: ticket.linkedQuoteId,
      status: 'programmato',
    };

    this.appointments.update((items) => [appointment, ...items]);
    this.queueRemoteSync('appointment', appointment);

    const updatedTicket: ServiceTicketRecord = {
      ...ticket,
      linkedAppointmentId: appointmentId,
      status: ticket.status === 'aperto' ? 'pianificato' : ticket.status,
      updatedAt: new Date().toISOString(),
    };

    this.serviceTickets.update((items) => items.map((item) => (item.id === ticket.id ? updatedTicket : item)));
    this.queueRemoteSync('ticket', updatedTicket);
  }

  closeServiceTicket(id: string): void {
    let updatedTicket: ServiceTicketRecord | null = null;

    this.serviceTickets.update((items) =>
      items.map((item) => {
        if (item.id !== id) {
          return item;
        }

        updatedTicket = {
          ...item,
          status: 'chiuso',
          closedAt: item.closedAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          resolutionStatus:
            item.resolutionStatus === 'da-verificare' ? 'risolto' : item.resolutionStatus,
        };
        return updatedTicket;
      }),
    );

    if (updatedTicket) {
      this.queueRemoteSync('ticket', updatedTicket);
    }
  }

  assignInventoryToTicket(ticketId: string, inventoryItemId: string, quantity: number): void {
    if (quantity <= 0) {
      return;
    }

    const inventoryItem = this.inventoryItems().find((item) => item.id === inventoryItemId);
    const ticket = this.serviceTickets().find((item) => item.id === ticketId);

    if (!inventoryItem || !ticket || inventoryItem.stock < quantity) {
      return;
    }
    const consumedQuantity = this.consumeInventoryFifoByItemId({
      inventoryItemId,
      quantity,
      reason: `Materiale ticket ${ticket.title}`,
      documentNumber: ticket.id,
      operator: ticket.technician || 'Tecnico',
      sourceModule: 'tecnico',
    });

    if (!consumedQuantity) {
      return;
    }

    const existingLine =
      ticket.materialLines.find((line) => line.inventoryItemId === inventoryItem.id) ?? null;

    const updatedLine: ServiceTicketMaterialLine = existingLine
      ? {
          ...existingLine,
          quantity: existingLine.quantity + consumedQuantity,
          totalCost: (existingLine.quantity + consumedQuantity) * existingLine.unitCost,
        }
      : {
          inventoryItemId: inventoryItem.id,
          itemName: inventoryItem.name,
          quantity: consumedQuantity,
          unitCost: inventoryItem.unitCost,
          totalCost: consumedQuantity * inventoryItem.unitCost,
        };

    const otherLines = ticket.materialLines.filter((line) => line.inventoryItemId !== inventoryItem.id);
    const materialLines = [...otherLines, updatedLine];
    const materialCost = materialLines.reduce((total, line) => total + line.totalCost, 0);

    const updatedTicket: ServiceTicketRecord = {
      ...ticket,
      materialLines,
      materialSummary: materialLines.map((line) => `${line.itemName} x${line.quantity}`).join(', '),
      materialCost,
      updatedAt: new Date().toISOString(),
    };

    this.serviceTickets.update((items) => items.map((item) => (item.id === updatedTicket.id ? updatedTicket : item)));
    this.queueRemoteSync('ticket', updatedTicket);
  }

  completeCashTransaction(payload: {
    clientId?: string | null;
    customerName: string;
    documentType: CashTransactionRecord['documentType'];
    paymentMethod: CashTransactionRecord['paymentMethod'];
    electronicMethod: CashTransactionRecord['electronicMethod'];
    status: CashTransactionRecord['status'];
    notes: string;
    receivedAmount: number;
    discountAmount: number;
    discountNote: string;
    linkedQuoteId: string | null;
    paymentSplit: CashPaymentSplit | null;
    lines: CashTransactionLine[];
  }): CashTransactionRecord {
    const linesTotal = payload.lines.reduce((sum, line) => sum + line.total, 0);
    const total = Math.max(linesTotal - (payload.discountAmount || 0), 0);
    const matchedClient =
      this.clients().find(
        (client) => client.id === payload.clientId || client.name === payload.customerName.trim(),
      ) ?? null;
    const fiscal = this.cashFiscalSettings();
    const isInvoice = payload.documentType === 'fattura';
    const docNumber = isInvoice ? fiscal.nextInvoiceNumber : fiscal.nextReceiptNumber;
    const resolvedElectronicMethod = this.resolveElectronicMethod(
      payload.paymentMethod,
      payload.paymentSplit,
      payload.electronicMethod,
    );
    const electronicAmount =
      payload.paymentMethod === 'pos'
        ? total
        : payload.paymentMethod === 'misto'
          ? payload.paymentSplit?.elettronico ?? 0
          : 0;
    const electronicFeePercent =
      resolvedElectronicMethod === 'bancomat'
        ? fiscal.posDebitFeePercent
        : resolvedElectronicMethod === 'carta'
          ? fiscal.posCreditFeePercent
          : 0;
    const electronicFeeAmount =
      resolvedElectronicMethod && electronicFeePercent > 0
        ? Math.round((electronicAmount * electronicFeePercent) / 100 * 100) / 100
        : 0;
    const record: CashTransactionRecord = {
      id: `cash-tx-${crypto.randomUUID()}`,
      reference: `CAS-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${`${this.cashTransactions().length + 1}`.padStart(3, '0')}`,
      clientId: matchedClient?.id ?? null,
      createdAt: new Date().toISOString(),
      customerName: payload.customerName || 'Banco',
      documentType: payload.documentType,
      paymentMethod: payload.paymentMethod,
      electronicMethod: resolvedElectronicMethod,
      electronicFeePercent,
      electronicFeeAmount,
      status: payload.status,
      notes: payload.notes,
      receivedAmount: payload.receivedAmount,
      total,
      changeAmount: this.resolveCashChangeAmount(
        payload.paymentMethod,
        payload.receivedAmount,
        total,
        payload.paymentSplit,
      ),
      discountAmount: payload.discountAmount || 0,
      discountNote: payload.discountNote || '',
      receiptNumber: isInvoice ? null : docNumber,
      invoiceNumber: isInvoice ? docNumber : null,
      linkedQuoteId: payload.linkedQuoteId || null,
      paymentSplit: payload.paymentSplit,
      settledAt: payload.status === 'pagato' ? new Date().toISOString() : null,
      lines: payload.lines,
    };
    this.cashFiscalSettings.update((settings) => ({
      ...settings,
      ...(isInvoice
        ? { nextInvoiceNumber: settings.nextInvoiceNumber + 1 }
        : { nextReceiptNumber: settings.nextReceiptNumber + 1 }),
    }));

    const stockDeductions = new Map<string, number>();

    for (const line of payload.lines) {
      const product = this.cashProducts().find((item) => item.id === line.productId);

      if (product?.linkedInventoryItemId) {
        stockDeductions.set(
          product.linkedInventoryItemId,
          (stockDeductions.get(product.linkedInventoryItemId) ?? 0) + line.quantity,
        );
      }
    }

    if (stockDeductions.size) {
      stockDeductions.forEach((quantity, inventoryItemId) => {
        this.consumeInventoryFifoByItemId({
          inventoryItemId,
          quantity,
          reason: `Scarico vendita ${record.reference}`,
          documentNumber: record.reference,
          operator: 'Cassa',
          sourceModule: 'cassa',
        });
      });
    }

    if (matchedClient && payload.status === 'pagato') {
      let updatedClient: ClientRecord | null = null;

      this.clients.update((items) =>
        items.map((client) => {
          if (client.id !== matchedClient.id) {
            return client;
          }

          updatedClient = { ...client, lastContact: new Date().toISOString().slice(0, 10) };
          return updatedClient;
        }),
      );

      if (updatedClient) {
        this.queueRemoteSync('client', updatedClient);
      }
    }

    this.cashTransactions.update((items) => [record, ...items]);
    this.queueRemoteSync('cash-transaction', record);
    return record;
  }

  settleCashTransaction(
    transactionId: string,
    payload: {
      paymentMethod: CashTransactionRecord['paymentMethod'];
      electronicMethod: CashTransactionRecord['electronicMethod'];
      receivedAmount: number;
      notes: string;
      paymentSplit: CashPaymentSplit | null;
    },
  ): CashTransactionRecord | null {
    const transaction = this.cashTransactions().find((item) => item.id === transactionId);
    if (!transaction) {
      return null;
    }

    const settledAt = new Date().toISOString();
    const fiscal = this.cashFiscalSettings();
    const resolvedElectronicMethod = this.resolveElectronicMethod(
      payload.paymentMethod,
      payload.paymentSplit,
      payload.electronicMethod,
    );
    const electronicAmount =
      payload.paymentMethod === 'pos'
        ? transaction.total
        : payload.paymentMethod === 'misto'
          ? payload.paymentSplit?.elettronico ?? 0
          : 0;
    const electronicFeePercent =
      resolvedElectronicMethod === 'bancomat'
        ? fiscal.posDebitFeePercent
        : resolvedElectronicMethod === 'carta'
          ? fiscal.posCreditFeePercent
          : 0;
    const electronicFeeAmount =
      resolvedElectronicMethod && electronicFeePercent > 0
        ? Math.round((electronicAmount * electronicFeePercent) / 100 * 100) / 100
        : 0;
    const updated: CashTransactionRecord = {
      ...transaction,
      paymentMethod: payload.paymentMethod,
      electronicMethod: resolvedElectronicMethod,
      electronicFeePercent,
      electronicFeeAmount,
      status: 'pagato',
      notes: payload.notes.trim() || transaction.notes,
      receivedAmount: payload.receivedAmount,
      changeAmount: this.resolveCashChangeAmount(
        payload.paymentMethod,
        payload.receivedAmount,
        transaction.total,
        payload.paymentSplit,
      ),
      paymentSplit: payload.paymentSplit,
      settledAt,
    };

    this.cashTransactions.update((items) =>
      items.map((item) => (item.id === transactionId ? updated : item)),
    );
    this.queueRemoteSync('cash-transaction', updated);

    if (updated.clientId) {
      const matchedClient = this.clients().find((client) => client.id === updated.clientId) ?? null;
      if (matchedClient) {
        const refreshedClient = {
          ...matchedClient,
          lastContact: settledAt.slice(0, 10),
        };
        this.updateClient(refreshedClient);
      }
    }

    return updated;
  }

  searchRecords(query: string): GlobalSearchResult[] {
    const normalizedQuery = this.normalizeSearchValue(query);

    if (!normalizedQuery) {
      return [];
    }

    return this.searchableRecordIndex()
      .filter((item) => item.searchIndex.includes(normalizedQuery))
      .map(({ searchIndex: _searchIndex, ...record }) => record)
      .slice(0, 8);
  }

  private snapshot(): AudiomaxState {
    return {
      clients: this.clients(),
      quotes: this.quotes(),
      appointments: this.appointments(),
      inventoryItems: this.inventoryItems(),
      warehouseLots: this.warehouseLots(),
      warehouseMovements: this.warehouseMovements(),
      warehousePositions: this.warehousePositions(),
      warehousePurchases: this.warehousePurchases(),
      warehouseAdjustments: this.warehouseAdjustments(),
      warehouseAuditLog: this.warehouseAuditLog(),
      serviceCategories: this.serviceCategories(),
      companyProfile: this.companyProfile(),
      expenseCategories: this.expenseCategories(),
      expenseSuppliers: this.expenseSuppliers(),
      expensePaymentMethods: this.expensePaymentMethods(),
      expenseRecords: this.expenseRecords(),
      expenseInstallments: this.expenseInstallments(),
      expenseNotifications: this.expenseNotifications(),
      expenseAuditLog: this.expenseAuditLog(),
      cashOperators: this.cashOperators(),
      employeeLeaves: this.employeeLeaves(),
      employeeAttendanceRecords: this.employeeAttendanceRecords(),
      cashProducts: this.cashProducts(),
      cashTransactions: this.cashTransactions(),
      cashShifts: this.cashShifts(),
      cashFiscalSettings: this.cashFiscalSettings(),
      serviceTickets: this.serviceTickets(),
      // ===== NUOVI Task 1: negozio chiusure =====
      storeClosingDaysWeekly: this.storeClosingDaysWeekly(),
      storeExtraOpeningDates: this.storeExtraOpeningDates(),
      storeBulkClosures: this.storeBulkClosures(),
    };
  }

  private loadLocalState(): void {
    const rawState = this.storage.getItem(this.storageKey);

    if (!rawState) {
      return;
    }

    try {
      const parsedState = JSON.parse(rawState) as Partial<AudiomaxState>;
      this.restoreCollectionState(this.clients, parsedState.clients);
      this.restoreCollectionState(this.quotes, parsedState.quotes);
      this.restoreCollectionState(this.appointments, parsedState.appointments);
      this.restoreCollectionState(this.inventoryItems, parsedState.inventoryItems);
      this.restoreCollectionState(this.serviceCategories, parsedState.serviceCategories);
      this.restoreValueState(this.companyProfile, parsedState.companyProfile);
      this.companyProfile.update((current) => ({ ...initialAudiomaxState.companyProfile, ...current }));
      this.restoreCollectionState(this.warehouseLots, parsedState.warehouseLots);
      this.restoreCollectionState(this.warehouseMovements, parsedState.warehouseMovements);
      this.restoreCollectionState(this.warehousePositions, parsedState.warehousePositions);
      this.restoreCollectionState(this.warehousePurchases, parsedState.warehousePurchases);
      this.restoreCollectionState(this.warehouseAdjustments, parsedState.warehouseAdjustments);
      this.restoreCollectionState(this.warehouseAuditLog, parsedState.warehouseAuditLog);
      this.restoreCollectionState(this.expenseCategories, parsedState.expenseCategories);
      this.restoreCollectionState(this.expenseSuppliers, parsedState.expenseSuppliers);
      this.restoreCollectionState(this.expensePaymentMethods, parsedState.expensePaymentMethods);
      this.restoreCollectionState(this.expenseRecords, parsedState.expenseRecords);
      this.restoreCollectionState(this.expenseInstallments, parsedState.expenseInstallments);
      this.restoreCollectionState(this.expenseNotifications, parsedState.expenseNotifications);
      this.restoreCollectionState(this.expenseAuditLog, parsedState.expenseAuditLog);
      this.restoreCollectionState(this.cashOperators, parsedState.cashOperators);
      this.restoreCollectionState(this.employeeLeaves, parsedState.employeeLeaves);
      this.restoreCollectionState(this.employeeAttendanceRecords, parsedState.employeeAttendanceRecords);
      this.cashOperators.update((items) =>
        items.map((operator: any) => ({
          ...operator,
          employmentType: operator.employmentType ?? 'dipendente',
          jobTitle: operator.jobTitle ?? operator.role,
          contractHoursWeekly: operator.contractHoursWeekly ?? (operator.employmentType === 'titolare' ? 0 : 40),
          shiftPatterns:
            operator.shiftPatterns ?? [operator.weeklyShifts ?? { lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' }],
          shiftCycleStartDate: operator.shiftCycleStartDate ?? '2025-01-01',
        })),
      );
      this.restoreCollectionState(this.cashProducts, parsedState.cashProducts);
      this.restoreCollectionState(this.cashTransactions, parsedState.cashTransactions);
      this.restoreCollectionState(this.cashShifts, parsedState.cashShifts);
      this.restoreValueState(this.cashFiscalSettings, parsedState.cashFiscalSettings);
      this.cashFiscalSettings.update((current) => ({ ...initialAudiomaxState.cashFiscalSettings, ...current }));
      this.restoreCollectionState(this.serviceTickets, parsedState.serviceTickets);
      // ===== NUOVI Task 1: ripristina impostazioni negozio + fallback defaults per retrocompatibilità =====
      this.restoreCollectionState(this.storeExtraOpeningDates, parsedState.storeExtraOpeningDates);
      this.restoreCollectionState(this.storeBulkClosures, parsedState.storeBulkClosures);
      this.restoreValueState(this.storeClosingDaysWeekly, parsedState.storeClosingDaysWeekly);
      this.storeClosingDaysWeekly.update((current) => ({ ...initialAudiomaxState.storeClosingDaysWeekly, ...(current ?? ({} as any)) }));
      this.migrateLegacyWarehouseCablingState();
      this.lastPersistedState = rawState;
    } catch {
      this.storage.removeItem(this.storageKey);
    }
  }

  private serializeSnapshot(): string {
    return JSON.stringify(this.snapshot());
  }

  private scheduleLocalPersist(serializedState: string): void {
    if (serializedState === this.lastPersistedState || serializedState === this.pendingPersistedState) {
      return;
    }

    this.pendingPersistedState = serializedState;

    if (this.localPersistTimer !== null) {
      clearTimeout(this.localPersistTimer);
    }

    this.localPersistTimer = setTimeout(() => {
      if (!this.pendingPersistedState || this.pendingPersistedState === this.lastPersistedState) {
        this.localPersistTimer = null;
        return;
      }

      const persistedState = this.pendingPersistedState;
      const didPersist = this.storage.setItem(this.storageKey, persistedState);
      if (didPersist) {
        this.lastPersistedState = persistedState;
      }
      this.pendingPersistedState = null;
      this.localPersistTimer = null;
    }, this.localPersistDelayMs);
  }

  private restoreCollectionState<T>(target: { set(value: T[]): void }, value: T[] | undefined): void {
    if (value?.length) {
      target.set(value);
    }
  }

  private restoreValueState<T>(target: { set(value: T): void }, value: T | undefined): void {
    if (value !== undefined) {
      target.set(value);
    }
  }

  private migrateLegacyWarehouseCablingState(): void {
    const seedItem = initialAudiomaxState.inventoryItems.find((item) => item.id === 'inv-001');
    const currentItem = this.inventoryItems().find((item) => item.id === 'inv-001');

    if (!seedItem || !currentItem) {
      return;
    }

    const needsMigration =
      currentItem.sku !== seedItem.sku ||
      currentItem.name !== seedItem.name ||
      Number(currentItem.cableMetersPerRoll ?? 0) !== Number(seedItem.cableMetersPerRoll ?? 0) ||
      Number(currentItem.unitCost) > 20;

    if (!needsMigration) {
      return;
    }

    this.inventoryItems.update((items) =>
      items.map((item) =>
        item.id === seedItem.id
          ? {
              ...item,
              ...seedItem,
              status: this.resolveInventoryStatus(seedItem.stock, seedItem.minStock),
            }
          : item,
      ),
    );

    const seedLots = initialAudiomaxState.warehouseLots.filter((lot) => lot.inventoryItemId === seedItem.id);
    this.warehouseLots.update((items) => [
      ...items.filter((lot) => lot.inventoryItemId !== seedItem.id),
      ...seedLots,
    ]);

    const seedMovements = initialAudiomaxState.warehouseMovements.filter(
      (movement) => movement.inventoryItemId === seedItem.id,
    );
    this.warehouseMovements.update((items) => [
      ...items.filter((movement) => movement.inventoryItemId !== seedItem.id),
      ...seedMovements,
    ]);

    const seedPurchases = initialAudiomaxState.warehousePurchases.filter(
      (purchase) => purchase.inventoryItemId === seedItem.id,
    );
    this.warehousePurchases.update((items) => [
      ...items.filter((purchase) => purchase.inventoryItemId !== seedItem.id),
      ...seedPurchases,
    ]);

    const seedCashProduct = initialAudiomaxState.cashProducts.find(
      (product) => product.linkedInventoryItemId === seedItem.id,
    );
    if (seedCashProduct) {
      this.cashProducts.update((items) =>
        items.map((product) =>
          product.linkedInventoryItemId === seedItem.id
            ? {
                ...product,
                name: seedCashProduct.name,
                price: seedCashProduct.price,
              }
            : product,
        ),
      );
    }

    this.serviceTickets.update((tickets) =>
      tickets.map((ticket) => ({
        ...ticket,
        materialSummary: ticket.materialSummary.replace('cablaggio HDMI 8K', 'cablaggio speaker OFC'),
        materialLines: ticket.materialLines.map((line) =>
          line.inventoryItemId === seedItem.id
            ? {
                ...line,
                itemName: seedItem.name,
                unitCost: seedItem.unitCost,
                totalCost: line.quantity * seedItem.unitCost,
              }
            : line,
        ),
      })),
    );
  }

  private normalizeSearchValue(value: string): string {
    return value.trim().toLowerCase();
  }

  private createSearchRecord(record: GlobalSearchResult): IndexedGlobalSearchResult {
    return {
      ...record,
      searchIndex: this.normalizeSearchValue(
        `${record.category} ${record.title} ${record.detail} ${record.status}`,
      ),
    };
  }

  private async loadRemoteState(): Promise<void> {
    const client = this.supabase.client;

    if (!client) {
      return;
    }

    this.supabase.connectionState.set('syncing');

    const [
      clientsResult,
      quotesResult,
      appointmentsResult,
      inventoryItemsResult,
      cashProductsResult,
      cashTransactionsResult,
      cashShiftsResult,
      serviceTicketsResult,
    ] =
      await Promise.all([
      client
        .from(supabaseConfig.tables.clients)
        .select(
          'id, name, phone, email, city, address, segment, preferred_contact, notes, favorite_brands, last_contact, status, privacy_profile',
        )
        .order('last_contact', { ascending: false }),
      client
        .from(supabaseConfig.tables.quotes)
        .select('id, customer_name, project_type, value, stage, due_date')
        .order('due_date', { ascending: true }),
      client
        .from(supabaseConfig.tables.appointments)
        .select(
          'id, title, customer_name, appointment_type, location_type, scheduled_at, duration_minutes, technician, linked_quote_id, status',
        )
        .order('scheduled_at', { ascending: true }),
      client
        .from(supabaseConfig.tables.inventoryItems)
        .select('id, sku, name, category, stock, min_stock, unit_cost, supplier, location, status')
        .order('name', { ascending: true }),
      client
        .from(supabaseConfig.tables.cashProducts)
        .select('id, name, category, price, shortcut, pricing_mode, linked_inventory_item_id')
        .order('name', { ascending: true }),
      client
        .from(supabaseConfig.tables.cashTransactions)
        .select(
          'id, reference, client_id, customer_name, payment_method, status, created_at, notes, received_amount, total, change_amount, lines',
        )
        .order('created_at', { ascending: false }),
      client
        .from(supabaseConfig.tables.cashShifts)
        .select(
          'id, label, opened_at, closed_at, transactions_count, paid_total, suspended_total, by_method',
        )
        .order('closed_at', { ascending: false }),
      client
        .from(supabaseConfig.tables.serviceTickets)
        .select(
          'id, title, customer_name, service_type, location_type, priority, status, technician, linked_quote_id, linked_appointment_id, material_summary, material_cost, material_lines, work_summary, resolution_status, closed_at, created_at',
        )
        .order('created_at', { ascending: false }),
      ]);

    const firstError =
      clientsResult.error ??
      quotesResult.error ??
      appointmentsResult.error ??
      inventoryItemsResult.error ??
      cashProductsResult.error ??
      cashTransactionsResult.error ??
      cashShiftsResult.error ??
      serviceTicketsResult?.error;

    if (firstError) {
      this.supabase.connectionState.set(firstError.code === '42P01' ? 'schema-required' : 'error');
      return;
    }

    const remoteClients = (clientsResult.data ?? []).map((row) => this.mapClientRow(row));
    const remoteQuotes = (quotesResult.data ?? []).map((row) => this.mapQuoteRow(row));
    const remoteAppointments = (appointmentsResult.data ?? []).map((row) =>
      this.mapAppointmentRow(row),
    );
    const remoteInventoryItems = (inventoryItemsResult.data ?? []).map((row) =>
      this.mapInventoryItemRow(row),
    );
    const remoteCashProducts = (cashProductsResult.data ?? []).map((row) => this.mapCashProductRow(row));
    const remoteCashTransactions = (cashTransactionsResult.data ?? []).map((row) =>
      this.mapCashTransactionRow(row),
    );
    const remoteCashShifts = (cashShiftsResult.data ?? []).map((row) => this.mapCashShiftRow(row));
    const remoteServiceTickets = (serviceTicketsResult?.data ?? []).map((row: ServiceTicketRow) =>
      this.mapServiceTicketRow(row),
    );

    if (
      !remoteClients.length &&
      !remoteQuotes.length &&
      !remoteAppointments.length &&
      !remoteInventoryItems.length &&
      !remoteCashProducts.length &&
      !remoteCashTransactions.length &&
      !remoteCashShifts.length &&
      !remoteServiceTickets.length
    ) {
      await this.seedRemoteTables();
      this.supabase.connectionState.set('connected');
      return;
    }

    if (remoteClients.length) {
      this.clients.set(remoteClients);
    }

    if (remoteQuotes.length) {
      this.quotes.set(remoteQuotes);
    }

    if (remoteAppointments.length) {
      this.appointments.set(remoteAppointments);
    }

    if (remoteInventoryItems.length) {
      this.inventoryItems.set(remoteInventoryItems);
    }

    if (remoteCashProducts.length) {
      this.cashProducts.set(remoteCashProducts);
    }

    if (remoteCashTransactions.length) {
      this.cashTransactions.set(remoteCashTransactions);
    }

    if (remoteCashShifts.length) {
      this.cashShifts.set(remoteCashShifts);
    }

    if (remoteServiceTickets.length) {
      this.serviceTickets.set(remoteServiceTickets);
    }

    this.supabase.connectionState.set('connected');
  }

  private queueRemoteSync(
    kind:
      | 'client'
      | 'quote'
      | 'appointment'
      | 'inventory'
      | 'cash-product'
      | 'cash-transaction'
      | 'cash-shift'
      | 'ticket',
    payload:
      | ClientRecord
      | QuoteRecord
      | AppointmentRecord
      | InventoryItemRecord
      | CashRegisterProductRecord
      | CashTransactionRecord
      | CashShiftRecord
      | ServiceTicketRecord,
  ): void {
    if (!this.supabase.isConfigured) {
      return;
    }

    void this.saveRemoteRecord(kind, payload);
  }

  private queueRemoteDelete(
    kind:
      | 'client'
      | 'quote'
      | 'appointment'
      | 'inventory'
      | 'cash-product'
      | 'cash-transaction'
      | 'cash-shift'
      | 'ticket',
    id: string,
  ): void {
    if (!this.supabase.isConfigured) {
      return;
    }

    void this.deleteRemoteRecord(kind, id);
  }

  private async seedRemoteTables(): Promise<void> {
    const client = this.supabase.client;

    if (!client) {
      return;
    }

    const snapshot = this.snapshot();

    const [
      clientsResult,
      quotesResult,
      appointmentsResult,
      inventoryItemsResult,
      cashProductsResult,
      cashTransactionsResult,
      cashShiftsResult,
      serviceTicketsResult,
    ] =
      await Promise.all([
      snapshot.clients.length
        ? client
            .from(supabaseConfig.tables.clients)
            .upsert(snapshot.clients.map((item) => this.toClientRow(item)))
        : Promise.resolve({ error: null }),
      snapshot.quotes.length
        ? client
            .from(supabaseConfig.tables.quotes)
            .upsert(snapshot.quotes.map((item) => this.toQuoteRow(item)))
        : Promise.resolve({ error: null }),
      snapshot.appointments.length
        ? client
            .from(supabaseConfig.tables.appointments)
            .upsert(snapshot.appointments.map((item) => this.toAppointmentRow(item)))
        : Promise.resolve({ error: null }),
      snapshot.inventoryItems.length
        ? client
            .from(supabaseConfig.tables.inventoryItems)
            .upsert(snapshot.inventoryItems.map((item) => this.toInventoryItemRow(item)))
        : Promise.resolve({ error: null }),
      snapshot.cashProducts.length
        ? client
            .from(supabaseConfig.tables.cashProducts)
            .upsert(snapshot.cashProducts.map((item) => this.toCashProductRow(item)))
        : Promise.resolve({ error: null }),
      snapshot.cashTransactions.length
        ? client
            .from(supabaseConfig.tables.cashTransactions)
            .upsert(snapshot.cashTransactions.map((item) => this.toCashTransactionRow(item)))
        : Promise.resolve({ error: null }),
      snapshot.cashShifts.length
        ? client
            .from(supabaseConfig.tables.cashShifts)
            .upsert(snapshot.cashShifts.map((item) => this.toCashShiftRow(item)))
        : Promise.resolve({ error: null }),
      snapshot.serviceTickets.length
        ? client
            .from(supabaseConfig.tables.serviceTickets)
            .upsert(snapshot.serviceTickets.map((item) => this.toServiceTicketRow(item)))
        : Promise.resolve({ error: null }),
      ]);

    const firstError =
      clientsResult.error ??
      quotesResult.error ??
      appointmentsResult.error ??
      inventoryItemsResult.error ??
      cashProductsResult.error ??
      cashTransactionsResult.error ??
      cashShiftsResult.error ??
      serviceTicketsResult?.error;

    if (firstError) {
      this.supabase.connectionState.set(firstError.code === '42P01' ? 'schema-required' : 'error');
      return;
    }
  }

  private async saveRemoteRecord(
    kind:
      | 'client'
      | 'quote'
      | 'appointment'
      | 'inventory'
      | 'cash-product'
      | 'cash-transaction'
      | 'cash-shift'
      | 'ticket',
    payload:
      | ClientRecord
      | QuoteRecord
      | AppointmentRecord
      | InventoryItemRecord
      | CashRegisterProductRecord
      | CashTransactionRecord
      | CashShiftRecord
      | ServiceTicketRecord,
  ): Promise<void> {
    const client = this.supabase.client;

    if (!client) {
      return;
    }

    this.supabase.connectionState.set('syncing');

    const result =
      kind === 'client'
        ? await client
            .from(supabaseConfig.tables.clients)
            .upsert(this.toClientRow(payload as ClientRecord))
        : kind === 'quote'
          ? await client
              .from(supabaseConfig.tables.quotes)
              .upsert(this.toQuoteRow(payload as QuoteRecord))
          : kind === 'inventory'
            ? await client
                .from(supabaseConfig.tables.inventoryItems)
                .upsert(this.toInventoryItemRow(payload as InventoryItemRecord))
          : kind === 'cash-product'
            ? await client
                .from(supabaseConfig.tables.cashProducts)
                .upsert(this.toCashProductRow(payload as CashRegisterProductRecord))
          : kind === 'cash-transaction'
            ? await client
                .from(supabaseConfig.tables.cashTransactions)
                .upsert(this.toCashTransactionRow(payload as CashTransactionRecord))
          : kind === 'cash-shift'
            ? await client
                .from(supabaseConfig.tables.cashShifts)
                .upsert(this.toCashShiftRow(payload as CashShiftRecord))
          : kind === 'appointment'
            ? await client
                .from(supabaseConfig.tables.appointments)
                .upsert(this.toAppointmentRow(payload as AppointmentRecord))
            : await client
                .from(supabaseConfig.tables.serviceTickets)
                .upsert(this.toServiceTicketRow(payload as ServiceTicketRecord));

    if (result.error) {
      this.supabase.connectionState.set(result.error.code === '42P01' ? 'schema-required' : 'error');
      return;
    }

    this.supabase.connectionState.set('connected');
  }

  private async deleteRemoteRecord(
    kind:
      | 'client'
      | 'quote'
      | 'appointment'
      | 'inventory'
      | 'cash-product'
      | 'cash-transaction'
      | 'cash-shift'
      | 'ticket',
    id: string,
  ): Promise<void> {
    const client = this.supabase.client;

    if (!client) {
      return;
    }

    this.supabase.connectionState.set('syncing');

    const table =
      kind === 'client'
        ? supabaseConfig.tables.clients
        : kind === 'quote'
          ? supabaseConfig.tables.quotes
          : kind === 'inventory'
            ? supabaseConfig.tables.inventoryItems
            : kind === 'cash-product'
              ? supabaseConfig.tables.cashProducts
              : kind === 'cash-transaction'
                ? supabaseConfig.tables.cashTransactions
                : kind === 'cash-shift'
                  ? supabaseConfig.tables.cashShifts
          : kind === 'appointment'
            ? supabaseConfig.tables.appointments
            : supabaseConfig.tables.serviceTickets;

    const result = await client.from(table).delete().eq('id', id);

    if (result.error) {
      this.supabase.connectionState.set(result.error.code === '42P01' ? 'schema-required' : 'error');
      return;
    }

    this.supabase.connectionState.set('connected');
  }

  private toClientRow(item: ClientRecord): ClientRow {
    return {
      id: item.id,
      name: item.name,
      phone: item.phone,
      email: item.email,
      city: item.city,
      address: item.address,
      segment: item.segment,
      preferred_contact: item.preferredContact,
      notes: item.notes,
      favorite_brands: item.favoriteBrands,
      last_contact: item.lastContact,
      status: item.status,
      privacy_profile: item.privacyProfile,
    };
  }

  private toQuoteRow(item: QuoteRecord): QuoteRow {
    return {
      id: item.id,
      customer_name: item.customerName,
      project_type: item.projectType,
      value: item.value,
      stage: item.stage === 'ordine' ? 'confermato' : item.stage,
      due_date: item.dueDate,
      discount_amount: item.discountAmount,
      is_anonymous: item.isAnonymous,
    };
  }

  private toAppointmentRow(item: AppointmentRecord): AppointmentRow {
    return {
      id: item.id,
      title: item.title,
      customer_name: item.customerName,
      appointment_type: item.appointmentType,
      location_type: item.locationType,
      scheduled_at: item.scheduledAt,
      duration_minutes: item.durationMinutes,
      technician: item.technician,
      linked_quote_id: item.linkedQuoteId,
      status: item.status,
    };
  }

  private toInventoryItemRow(item: InventoryItemRecord): InventoryItemRow {
    return {
      id: item.id,
      sku: item.sku,
      barcode: item.barcode,
      name: item.name,
      category: item.category,
      usage_type: item.usageType,
      stock: item.stock,
      min_stock: item.minStock,
      unit_cost: item.unitCost,
      sale_price: item.salePrice,
      supplier: item.supplier,
      location: item.location,
      cable_rolls: item.cableRolls ?? null,
      cable_meters_per_roll: item.cableMetersPerRoll ?? null,
      status: item.status,
    };
  }

  private toCashProductRow(item: CashRegisterProductRecord): CashProductRow {
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      price: item.price,
      shortcut: item.shortcut,
      pricing_mode: item.pricingMode,
      linked_inventory_item_id: item.linkedInventoryItemId,
    };
  }

  private toCashTransactionRow(item: CashTransactionRecord): CashTransactionRow {
    return {
      id: item.id,
      reference: item.reference,
      client_id: item.clientId,
      customer_name: item.customerName,
      document_type: item.documentType,
      payment_method: item.paymentMethod,
      status: item.status,
      created_at: item.createdAt,
      notes: item.notes,
      received_amount: item.receivedAmount,
      total: item.total,
      change_amount: item.changeAmount,
      discount_amount: item.discountAmount,
      discount_note: item.discountNote,
      receipt_number: item.receiptNumber,
      invoice_number: item.invoiceNumber,
      linked_quote_id: item.linkedQuoteId,
      payment_split: item.paymentSplit,
      settled_at: item.settledAt,
      lines: item.lines,
    };
  }

  private toCashShiftRow(item: CashShiftRecord): CashShiftRow {
    return {
      id: item.id,
      label: item.label,
      opened_at: item.openedAt,
      closed_at: item.closedAt,
      transactions_count: item.transactionsCount,
      paid_total: item.paidTotal,
      suspended_total: item.suspendedTotal,
      by_method: item.byMethod,
    };
  }

  private toServiceTicketRow(item: ServiceTicketRecord): ServiceTicketRow {
    return {
      id: item.id,
      title: item.title,
      customer_name: item.customerName,
      service_type: item.serviceType,
      location_type: item.locationType,
      priority: item.priority,
      status: item.status,
      technician: item.technician,
      linked_quote_id: item.linkedQuoteId,
      linked_appointment_id: item.linkedAppointmentId,
      material_summary: item.materialSummary,
      material_cost: item.materialCost,
      material_lines: item.materialLines,
      work_summary: item.workSummary,
      resolution_status: item.resolutionStatus,
      closed_at: item.closedAt,
      created_at: item.createdAt,
    };
  }

  private mapClientRow(row: ClientRow): ClientRecord {
    const fallbackPrivacyProfile = createClientPrivacyProfile();
    const privacyProfile = row.privacy_profile
      ? {
          ...fallbackPrivacyProfile,
          ...row.privacy_profile,
          emailMarketing: {
            ...fallbackPrivacyProfile.emailMarketing,
            ...row.privacy_profile.emailMarketing,
          },
          whatsappMarketing: {
            ...fallbackPrivacyProfile.whatsappMarketing,
            ...row.privacy_profile.whatsappMarketing,
          },
          fidelityProfiling: {
            ...fallbackPrivacyProfile.fidelityProfiling,
            ...row.privacy_profile.fidelityProfiling,
          },
          audit: row.privacy_profile.audit ?? fallbackPrivacyProfile.audit,
          archive: row.privacy_profile.archive ?? fallbackPrivacyProfile.archive,
        }
      : fallbackPrivacyProfile;

    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      city: row.city,
      address: row.address,
      segment: row.segment,
      preferredContact: row.preferred_contact,
      notes: row.notes,
      favoriteBrands: row.favorite_brands,
      lastContact: row.last_contact,
      status: row.status,
      privacyProfile,
    };
  }

  private mapQuoteRow(row: QuoteRow): QuoteRecord {
    return {
      id: row.id,
      customerName: row.customer_name,
      projectType: row.project_type,
      value: Number(row.value),
      stage: row.stage === 'confermato' ? 'ordine' : row.stage,
      dueDate: row.due_date,
      discountAmount: row.discount_amount != null ? Number(row.discount_amount) : undefined,
      isAnonymous: row.is_anonymous != null ? Boolean(row.is_anonymous) : undefined,
    };
  }

  private mapAppointmentRow(row: AppointmentRow): AppointmentRecord {
    return {
      id: row.id,
      title: row.title,
      customerName: row.customer_name,
      appointmentType: row.appointment_type,
      locationType: row.location_type,
      scheduledAt: row.scheduled_at,
      durationMinutes: Number(row.duration_minutes),
      technician: row.technician,
      linkedQuoteId: row.linked_quote_id,
      status: row.status,
    };
  }

  private mapInventoryItemRow(row: InventoryItemRow): InventoryItemRecord {
    return {
      id: row.id,
      sku: row.sku,
      barcode: row.barcode ?? '',
      name: row.name,
      category: row.category,
      usageType: row.usage_type ?? 'rivendita',
      stock: Number(row.stock),
      minStock: Number(row.min_stock),
      unitCost: Number(row.unit_cost),
      salePrice: Number(row.sale_price ?? 0),
      supplier: row.supplier,
      location: row.location,
      cableRolls: Number(row.cable_rolls ?? 0) || null,
      cableMetersPerRoll: Number(row.cable_meters_per_roll ?? 0) || null,
      status: row.status,
    };
  }

  private syncCashProductsForInventoryItem(item: InventoryItemRecord): void {
    const linkedProducts = this.cashProducts().filter((product) => product.linkedInventoryItemId === item.id);

    if (!linkedProducts.length) {
      return;
    }

    this.cashProducts.update((items) =>
      items.map((product) =>
        product.linkedInventoryItemId === item.id
          ? {
              ...product,
              price: item.salePrice,
            }
          : product,
      ),
    );

    for (const product of linkedProducts) {
      this.queueRemoteSync('cash-product', {
        ...product,
        price: item.salePrice,
      });
    }
  }

  private mapCashProductRow(row: CashProductRow): CashRegisterProductRecord {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      price: Number(row.price),
      shortcut: row.shortcut,
      pricingMode: row.pricing_mode,
      linkedInventoryItemId: row.linked_inventory_item_id,
    };
  }

  private mapCashTransactionRow(row: CashTransactionRow): CashTransactionRecord {
    return {
      id: row.id,
      reference: row.reference,
      clientId: row.client_id,
      customerName: row.customer_name,
      documentType: row.document_type ?? 'scontrino',
      paymentMethod: row.payment_method,
      status: row.status,
      createdAt: row.created_at,
      notes: row.notes,
      receivedAmount: Number(row.received_amount),
      total: Number(row.total),
      changeAmount: Number(row.change_amount),
      discountAmount: Number(row.discount_amount ?? 0),
      discountNote: String(row.discount_note ?? ''),
      receiptNumber: row.receipt_number ?? null,
      invoiceNumber: row.invoice_number ?? null,
      linkedQuoteId: row.linked_quote_id ?? null,
      paymentSplit: row.payment_split ?? null,
      settledAt: row.settled_at ?? null,
      lines: (row.lines ?? []).map((line) => ({
        ...line,
        excludeFromReceipt: line.excludeFromReceipt ?? false,
      })),
    };
  }

  private resolveCashChangeAmount(
    paymentMethod: CashTransactionRecord['paymentMethod'],
    receivedAmount: number,
    total: number,
    paymentSplit: CashPaymentSplit | null,
  ): number {
    if (paymentMethod === 'contanti') {
      return Math.max(receivedAmount - total, 0);
    }

    if (paymentMethod === 'misto' && paymentSplit) {
      return Math.max(receivedAmount - paymentSplit.contanti, 0);
    }

    return 0;
  }

  private resolveElectronicMethod(
    paymentMethod: CashTransactionRecord['paymentMethod'],
    paymentSplit: CashPaymentSplit | null,
    electronicMethod: CashTransactionRecord['electronicMethod'],
  ): CashTransactionRecord['electronicMethod'] {
    if (paymentMethod === 'pos') {
      return electronicMethod ?? 'bancomat';
    }

    if (paymentMethod === 'misto') {
      const method = paymentSplit?.elettronicoMethod ?? null;
      return method === 'bonifico' ? null : method;
    }

    return null;
  }

  private mapCashShiftRow(row: CashShiftRow): CashShiftRecord {
    return {
      id: row.id,
      label: row.label,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      closureNumber: Number((row as unknown as Record<string, unknown>)['closure_number'] ?? 0),
      transactionsCount: Number(row.transactions_count),
      paidTotal: Number(row.paid_total),
      suspendedTotal: Number(row.suspended_total),
      receiptNumbers: ((row as unknown as Record<string, unknown>)['receipt_numbers'] as number[]) ?? [],
      invoiceNumbers: ((row as unknown as Record<string, unknown>)['invoice_numbers'] as number[]) ?? [],
      byMethod: row.by_method,
    };
  }

  private mapServiceTicketRow(row: ServiceTicketRow): ServiceTicketRecord {
    return {
      id: row.id,
      title: row.title,
      customerName: row.customer_name,
      insertedAt: row.inserted_at ?? row.created_at.slice(0, 10),
      serviceType: row.service_type,
      locationType: row.location_type,
      priority: row.priority,
      status: row.status,
      technician: row.technician,
      linkedQuoteId: row.linked_quote_id,
      linkedAppointmentId: row.linked_appointment_id,
      materialSummary: row.material_summary,
      materialCost: Number(row.material_cost),
      materialLines: row.material_lines ?? [],
      workSummary: row.work_summary,
      notes: row.notes ?? '',
      resolutionStatus: row.resolution_status,
      closedAt: row.closed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? null,
    };
  }

  private resolveInventoryStatus(
    stock: number,
    minStock: number,
  ): InventoryItemRecord['status'] {
    if (stock <= 0) {
      return 'esaurito';
    }

    if (stock <= minStock) {
      return 'bassa-scorta';
    }

    return 'disponibile';
  }

  private registerWarehousePosition(code: string, inventoryItemId: string): void {
    const normalizedCode = code.trim().toUpperCase();

    if (!normalizedCode) {
      return;
    }

    const [zone = 'A', shelf = '01', level = '01'] = normalizedCode.split('-');
    const existingPosition = this.warehousePositions().find((position) => position.code === normalizedCode);

    if (existingPosition) {
      this.warehousePositions.update((items) =>
        items.map((position) =>
          position.id === existingPosition.id
            ? {
                ...position,
                occupiedInventoryItemIds: Array.from(
                  new Set([...position.occupiedInventoryItemIds, inventoryItemId]),
                ),
              }
            : position,
        ),
      );
      return;
    }

    this.warehousePositions.update((items) => [
      {
        id: `wpos-${crypto.randomUUID()}`,
        code: normalizedCode,
        zone,
        shelf,
        level,
        occupiedInventoryItemIds: [inventoryItemId],
      },
      ...items,
    ]);
  }

  private appendWarehouseAudit(entry: Omit<WarehouseAuditRecord, 'id'>): void {
    this.warehouseAuditLog.update((items) => [
      {
        id: `waudit-${crypto.randomUUID()}`,
        ...entry,
      },
      ...items,
    ]);
  }

  private appendExpenseAudit(entry: Omit<ExpenseAuditRecord, 'id'>): void {
    this.expenseAuditLog.update((items) => [
      {
        id: `exp-audit-${crypto.randomUUID()}`,
        ...entry,
      },
      ...items,
    ]);
  }

  private addMonthsToDate(date: string, months: number): string {
    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    parsed.setMonth(parsed.getMonth() + months);
    return parsed.toISOString().slice(0, 10);
  }

  private canExpense(permission: ExpensePermission): boolean {
    return this.expensePermissions()[permission];
  }

  private resolveExpensePermissions(role: AppUserRole): Record<ExpensePermission, boolean> {
    if (role === 'admin') {
      return {
        'expense:view': true,
        'expense:create': true,
        'expense:update': true,
        'expense:delete': true,
      };
    }

    if (role === 'finance') {
      return {
        'expense:view': true,
        'expense:create': true,
        'expense:update': true,
        'expense:delete': false,
      };
    }

    if (role === 'operations') {
      return {
        'expense:view': true,
        'expense:create': true,
        'expense:update': false,
        'expense:delete': false,
      };
    }

    return {
      'expense:view': true,
      'expense:create': false,
      'expense:update': false,
      'expense:delete': false,
    };
  }
}
