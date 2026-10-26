import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  WritableSignal,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map, merge, startWith } from 'rxjs';
// ✅ Fix ISS-29: import del servizio storage centralizzato SSR-safe
import { BrowserStorageService } from './browser-storage.service';

import { AudiomaxDataService } from './audiomax-data.service';
import { EpScannerService } from './ep-scanner.service';
import { crmModuleContent } from './crm-module-content';
import { FormDraftService } from './form-draft.service';
import { PrivacyDispatchService } from './privacy-dispatch.service';
import { SupabaseService } from './supabase.service';
import { UiDialogDirective } from './ui-dialog.directive';
import {
  AppointmentRecord,
  CashFiscalSettings,
  CashOperatorRecord,
  CashPaymentSplit,
  CashRegisterProductRecord,
  CashTransactionLine,
  CashTransactionRecord,
  ClientBillingProfile,
  ClientRecord,
  CompanyProfileRecord,
  EmployeeAttendanceRecord,
  EmployeeLeaveRecord,
  ExpenseRecord,
  ExpenseSupplierRecord,
  InventoryItemRecord,
  PaymentProviderKind,
  PaymentExecutionMode,
  PaymentProviderRecord,
  PortalCommunicationLine,
  PortalCommunicationRecord,
  PortalSettings,
  QuoteLineRecord,
  QuoteRecord,
  ServiceTicketRecord,
  WarehouseLotRecord,
  WarehouseMovementRecord,
  WarehousePurchaseRecord,
  WarehouseDdtLineRecord,
  WarehouseDdtPartySnapshot,
  WarehouseDdtRecord,
  PendingServiceRecord,
  WarehouseOrderRecord,
  createClientPrivacyProfile,
} from './crm-runtime-data';
import { crmSections } from './crm-sections';

interface CashDeskSessionDraft {
  id: string;
  queuedAt: string;
  customerMode: 'existing' | 'walk-in';
  clientId: string | null;
  customerName: string;
  customerPhone: string;
  customerCity: string;
  customerEmail: string;
  notes: string;
  receivedAmount: number;
  discountValue: number;
  discountType: 'importo' | 'percentuale';
  discountNote: string;
  linkedQuoteId: string | null;
  pendingTransactionId: string | null;
  paymentMethod: CashTransactionRecord['paymentMethod'];
  mixedCashAmount: number;
  mixedElectronicAmount: number;
  mixedElectronicMethod: 'bancomat' | 'carta' | 'bonifico';
  documentType: CashTransactionRecord['documentType'];
  salesMode: CashSalesMode;
  currentOperator: string;
  cart: CashTransactionLine[];
}

type CashSalesMode = 'tutti' | 'servizi' | 'rivendita' | 'storico' | 'preventivi';

/** Riga editabile della modale "Carica in magazzino da ordine portale" */
interface OrderReceiptLineDraft {
  lineId: string;
  /** Descrizione originale della richiesta */
  description: string;
  /** '' = crea un nuovo prodotto, altrimenti id del prodotto esistente da ricaricare */
  inventoryItemId: string;
  /** Nome del nuovo prodotto (se inventoryItemId è vuoto) */
  newName: string;
  quantity: number;
  unitCost: number;
  salePrice: number;
  /** Se true la riga viene ignorata nel carico */
  skip: boolean;
}

interface CashClientRecentItem {
  id: string;
  kind: 'preventivo' | 'vendita' | 'appuntamento' | 'ticket';
  title: string;
  meta: string;
  dateKey: string;
  tone: 'accent' | 'success' | 'warning' | 'neutral';
}

interface DdtLocalDraftSummary {
  savedAt: string;
  recipientName: string;
  causale: string;
  documentDate: string;
  linkedQuoteNumber: string;
  lineCount: number;
}

type EmployeeShiftDayKey = keyof CashOperatorRecord['shiftPatterns'][0];
type ReportSectionKey =
  | 'overview'
  | 'cross'
  | 'commerciale'
  | 'operatività'
  | 'amministrazione'
  | 'alert';
type ReportFilterKey = 'all' | ReportSectionKey;
type ReportPageKey =
  | 'dashboard'
  | 'economici'
  | 'clienti'
  | 'preventivi'
  | 'servizi'
  | 'documenti'
  | 'magazzino'
  | 'altre';
type ReportPeriodPreset =
  | 'oggi'
  | 'ultimi-7'
  | 'ultimi-30'
  | 'mese-corrente'
  | 'mese-precedente'
  | 'trimestre-corrente'
  | 'anno-corrente'
  | 'anno-precedente'
  | 'custom';
type ReportDrilldownKind =
  | 'cash-paid'
  | 'quotes-all'
  | 'quotes-stage'
  | 'expenses'
  | 'clients-active'
  | 'tickets'
  | 'appointments'
  | 'ddts'
  | 'warehouse-movements'
  | 'warehouse-suppliers'
  | 'clients-top'
  | 'services-top'
  | 'services-low'
  | 'payment-method';

interface EmployeeShiftDraft {
  startHour: string;
  startMinute: string;
  endHour: string;
  endMinute: string;
  hasBreak: boolean;
  breakFromHour: string;
  breakFromMinute: string;
  breakToHour: string;
  breakToMinute: string;
  unparsedText: string;
}

interface EmployeeShiftDayMeta {
  key: EmployeeShiftDayKey;
  label: string;
}

// ─── Planner turni (Settimane multiple)
type PlannerLeaveTone =
  | 'standard'   // Turno lavorativo
  | 'ferie'      // Ferie
  | 'permesso'   // Permesso
  | 'malattia'   // Malattia
  | 'riposo';    // Riposo / Libero

const PLANNER_LEAVE_TONES: { tone: PlannerLeaveTone; label: string; badge: string }[] = [
  { tone: 'standard', label: 'Turno', badge: 'bg-blue-100 text-blue-800' },
  { tone: 'ferie', label: 'Ferie', badge: 'bg-emerald-100 text-emerald-800' },
  { tone: 'permesso', label: 'Permesso', badge: 'bg-amber-100 text-amber-800' },
  { tone: 'malattia', label: 'Malattia', badge: 'bg-rose-100 text-rose-800' },
  { tone: 'riposo', label: 'Riposo', badge: 'bg-slate-200 text-slate-700' },
];

interface PlannerShiftCell {
  tone: PlannerLeaveTone;
  // Turno (solo quando tone === 'standard')
  startMinutes: number | null;
  endMinutes: number | null;
  breakStart: number | null;
  breakEnd: number | null;
  // Permesso orario parziale (solo tone === 'permesso')
  permitStartMinutes?: number | null;
  permitEndMinutes?: number | null;
  permitHours?: number | null;
}

interface PlannerSelectedCell {
  employeeId: string;
  weekIndex: number;   // 0..N-1
  dayKey: EmployeeShiftDayKey;
}

interface ReportBarRow {
  label: string;
  value: number;
  detail: string;
  share: number;
}

interface ReportStatusTile {
  label: string;
  value: number;
  detail: string;
  tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  format: 'currency' | 'number';
}

interface ReportPeriodOption {
  value: ReportPeriodPreset;
  label: string;
}

interface ReportPeriodRange {
  label: string;
  from: string;
  to: string;
  previousLabel: string;
  previousFrom: string;
  previousTo: string;
  compareEnabled: boolean;
}

interface ReportDrilldownRequest {
  kind: ReportDrilldownKind;
  title: string;
  subtitle: string;
  filter?: string;
}

interface ReportOverviewCard extends ReportStatusTile {
  previousValue: number | null;
  delta: number | null;
  deltaPercent: number | null;
  trend: 'up' | 'down' | 'flat' | 'none';
  periodLabel: string;
  previousLabel: string;
  drilldown: ReportDrilldownRequest | null;
}

interface ReportDrilldownRow {
  id: string;
  values: Array<string | number>;
  actionType?: 'cash' | 'quote' | 'client' | 'ticket' | 'ddt' | 'supplier';
  actionId?: string;
  actionLabel?: string;
}

interface ReportClientActivityRow {
  client: ClientRecord;
  revenue: number;
  quotes: number;
  appointments: number;
  tickets: number;
  ddts: number;
  activities: number;
}

interface ReportServiceActivityRow {
  id: string;
  name: string;
  category: string;
  price: number;
  quoteCount: number;
  salesCount: number;
  salesTotal: number;
}

interface ReportSectionDescriptor {
  key: ReportSectionKey;
  kicker: string;
  label: string;
  description: string;
  metric: string;
  badge: string;
}

interface ReportDonutSegment {
  label: string;
  value: number;
  detail: string;
  color: string;
  share: number;
}

interface ReportDonutChart {
  key: string;
  title: string;
  subtitle: string;
  kind: 'currency' | 'number';
  total: number;
  totalLabel: string;
  segments: ReportDonutSegment[];
  searchableText: string;
  gradient: string;
}

interface ReportDashboardKpi {
  key: string;
  icon: string;
  label: string;
  value: number;
  detail: string;
  tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  format: 'currency' | 'number';
  page: Exclude<ReportPageKey, 'dashboard'>;
}

interface ReportAreaCard {
  key: Exclude<ReportPageKey, 'dashboard'>;
  icon: string;
  title: string;
  description: string;
  metric: string;
  badge: string;
}

interface ReportTrendPoint {
  label: string;
  value: number;
  valueLabel: string;
  x: number;
  y: number;
}

interface ReportTrendChart {
  title: string;
  subtitle: string;
  totalLabel: string;
  maxLabel: string;
  polyline: string;
  area: string;
  points: ReportTrendPoint[];
}

interface EmployeeCalendarDayCell {
  isoDate: string;
  dayNumber: string;
  weekdayLabel: string;
  isCurrentMonth: boolean;
  scheduledCount: number;
  absentCount: number;
  leaves: EmployeeFilteredLeaveEntry[];
}

interface EmployeeFilteredLeaveEntry extends EmployeeLeaveRecord {
  visibleStart: string;
  visibleEnd: string;
  daysInRange: number;
  overlapsOutsideRange: boolean;
}

type EmployeeAttendanceDisplayStatus =
  | EmployeeAttendanceRecord['status']
  | EmployeeLeaveRecord['leaveType']
  | 'programmato';

interface EmployeeRegisterDayMeta {
  isoDate: string;
  dayNumber: number;
  weekdayLabel: string;
  isWeekend: boolean;
}

interface EmployeeResolvedAttendanceEntry {
  employee: CashOperatorRecord;
  date: string;
  status: EmployeeAttendanceDisplayStatus;
  plannedShift: string;
  plannedMinutes: number;
  actualStartTime: string;
  actualEndTime: string;
  breakMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  note: string;
  manualOverride: boolean;
  isLeave: boolean;
  isFuture: boolean;
  // Task7: permesso orario parziale (ore di permesso)
  leaveHours?: number | null;
  leaveStartTimeMinutes?: number | null;
  leaveEndTimeMinutes?: number | null;
}

interface EmployeeAttendanceRegisterCell extends EmployeeResolvedAttendanceEntry {
  dayNumber: number;
  weekdayLabel: string;
  isWeekend: boolean;
  primaryLabel: string;
  secondaryLabel: string;
  tone: 'worked' | 'leave' | 'rest' | 'future' | 'absence';
}

interface EmployeeAttendanceRegisterRow {
  employee: CashOperatorRecord;
  days: EmployeeAttendanceRegisterCell[];
  totalWorkedMinutes: number;
  totalOvertimeMinutes: number;
  totalLeaveDays: number;
}

interface SelectedClientHistory {
  quotes: QuoteRecord[];
  transactions: CashTransactionRecord[];
  receipts: CashTransactionRecord[];
  invoices: CashTransactionRecord[];
  appointments: AppointmentRecord[];
  tickets: ServiceTicketRecord[];
}

interface SupplierOrderHistoryEntry {
  purchase: WarehousePurchaseRecord;
  itemName: string;
  linkedExpense: ExpenseRecord | null;
}

interface WarehouseSupplierSummaryRow {
  supplier: string;
  records: number;
  totalCost: number;
  lastReceivedDate: string;
  lastDocumentNumber: string;
  distinctItems: number;
}

interface WarehouseValuationRow {
  item: InventoryItemRecord;
  quantityAvailable: number;
  valuationByLot: number;
}

// ══════════════════════════════════════════════
// Tabelle esportazione mensile PDF · Ufficio paghe
// ══════════════════════════════════════════════
interface PagheGridCell {
  dayNumber: number;       // 1..31 (fuori mese → kind='fuori')
  isoDate: string;          // YYYY-MM-DD
  weekdayShort: string;    // L/M/M/G/V/S/D
  isWeekend: boolean;
  display: string;           // Stringa mostrata: "9", "F", "P(4)", "M", "", "·"
  kind: 'lavorato' | 'ferie' | 'malattia' | 'permesso' | 'riposo' | 'vuoto' | 'fuori';
  minutes: number;       // minuti lavorati o di assenza
  note?: string;
}
interface PagheGridRow {
  employeeId: string;
  employeeName: string;
  jobTitle: string;
  cells: PagheGridCell[];                 // sempre 31 (1..31)
  workedMinutes: number;                // somma tutti i giorni
  leaveMinutes: { ferie: number; permesso: number; malattia: number };
  contractHoursWeekly: number;          // es. 40
  contractHours: number;                  // ore contratto proporz. giorni nel mese lavorativi
  workedHours: number;                   // ore effettive (lavorato)
  overtimeHours: number;              // straordinari = workedHours - contratto
}
interface PagheNoteRow {
  employeeName: string;
  assenzaPer: 'Ferie' | 'Permesso' | 'Malattia';
  dal: string;
  al: string;
  oreN: string;
}

@Component({
  selector: 'app-section-page',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, UiDialogDirective],
  templateUrl: './section-page.html',
  styleUrl: './section-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  // Reso protected invece di private perché i template accedono a paymentProviders()
  // e a togglePaymentProviderActive / CRUD fornitori dalle impostazioni.
  protected readonly data = inject(AudiomaxDataService);
  private readonly supabase = inject(SupabaseService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formDrafts = inject(FormDraftService);
  private readonly privacyDispatch = inject(PrivacyDispatchService);
  // ✅ Fix ISS-29: uso BrowserStorageService centralizzato (già fornito SSR-safe)
  // invece di localStorage diretto in 4 punti del component.
  private readonly storage = inject(BrowserStorageService);
  protected readonly epScanner = inject(EpScannerService);

  protected readonly section = toSignal(
    this.route.data.pipe(
      map(({ sectionId }) => crmSections.find((item) => item.id === sectionId) ?? crmSections[0]),
    ),
    { initialValue: crmSections[0] },
  );

  protected readonly content = computed(() => crmModuleContent[this.section().id]);
  protected readonly allClients = this.data.clients;
  protected readonly allQuotes = this.data.quotes;
  protected readonly allAppointments = this.data.appointments;
  protected readonly allInventoryItems = this.data.inventoryItems;
  protected readonly allWarehouseLots = this.data.warehouseLots;
  protected readonly allWarehouseMovements = this.data.warehouseMovements;
  protected readonly allWarehousePositions = this.data.warehousePositions;
  protected readonly allWarehousePurchases = this.data.warehousePurchases;
  protected readonly allWarehouseAdjustments = this.data.warehouseAdjustments;
  protected readonly allWarehouseAuditLog = this.data.warehouseAuditLog;
  protected readonly allExpenseCategories = this.data.expenseCategories;
  protected readonly allExpenseSuppliers = this.data.expenseSuppliers;
  protected readonly allExpensePaymentMethods = this.data.expensePaymentMethods;
  protected readonly allExpenseRecords = this.data.expenseRecords;
  protected readonly allExpenseInstallments = this.data.expenseInstallments;
  protected readonly allExpenseNotifications = this.data.expenseNotifications;
  protected readonly allExpenseAuditLog = this.data.expenseAuditLog;
  protected readonly expensePermissions = this.data.expensePermissions;
  protected readonly currentExpenseRole = this.data.currentUserRole;
  protected readonly allCashOperators = this.data.cashOperators;
  protected readonly allEmployeeAttendanceRecords = this.data.employeeAttendanceRecords;
  protected readonly allCashProducts = this.data.cashProducts;
  protected readonly allCashTransactions = this.data.cashTransactions;
  protected readonly allCashShifts = this.data.cashShifts;
  protected readonly allServiceTickets = this.data.serviceTickets;
  protected readonly cashConnectionState = this.supabase.connectionState;
  protected readonly cashConnectionLabel = this.supabase.connectionLabel;
  protected readonly editingClientId = signal<string | null>(null);
  protected readonly editingQuoteId = signal<string | null>(null);
  protected readonly editingAppointmentId = signal<string | null>(null);
  protected readonly editingInventoryId = signal<string | null>(null);
  /** Modale di modifica anagrafica prodotto (pulsante "Modifica" nel dettaglio) */
  protected readonly inventoryEditModalOpen = signal(false);
  protected readonly editingTicketId = signal<string | null>(null);
  protected readonly editingCashProductId = signal<string | null>(null);
  protected readonly serviceMenuOpenId = signal<string | null>(null);
  protected readonly clientModalOpen = signal(false);
  protected readonly clientDetailModalOpen = signal(false);
  protected readonly quoteModalOpen = signal(false);
  protected readonly quoteDetailModalOpen = signal(false);

  // Esponiamo i segnali dal servizio dati per l'autocompletamento nel preventivo
  protected services = computed(() => this.allCashProducts().filter(p => p.category !== 'Accessori'));

  protected readonly quotePaymentModalOpen = signal(false);
  protected readonly quotePaymentQuoteId = signal<string | null>(null);
  protected readonly ddtModalOpen = signal(false);
  protected readonly ddtQuoteId = signal<string | null>(null);
  protected readonly ddtNumber = signal('');
  protected readonly ddtCreatedAt = signal('');
  protected readonly ddtEditorModalOpen = signal(false);
  protected readonly ddtDetailModalOpen = signal(false);
  protected readonly ddtQuotePickerOpen = signal(false);
  protected readonly ddtDraftsModalOpen = signal(false);
  protected readonly ddtSendModalOpen = signal(false);
  protected readonly ddtEditingId = signal<string | null>(null);
  protected readonly ddtDetailId = signal<string | null>(null);
  protected readonly ddtSendRecordId = signal<string | null>(null);
  protected readonly ddtSendPhone = signal('');
  protected readonly ddtSendEmail = signal('');
  protected readonly ddtQuoteSearch = signal('');
  protected readonly ddtSearch = signal('');
  protected readonly ddtFilterClientId = signal('tutti');
  protected readonly ddtFilterStatus = signal<'tutti' | WarehouseDdtRecord['status']>('tutti');
  protected readonly ddtFilterCause = signal('tutte');
  protected readonly ddtFilterFrom = signal('');
  protected readonly ddtFilterTo = signal('');
  protected readonly appointmentModalOpen = signal(false);
  protected readonly ticketModalOpen = signal(false);
  protected readonly expenseModalOpen = signal(false);
  // ⭐ Edit spesa · se non null stiamo modificando una spesa esistente
  // (tutti i campi pagamento sono modificabili post save come richiesto)
  protected readonly expenseEditingId = signal<string | null>(null);
  protected readonly warehouseModalOpen = signal(false);
  protected readonly warehouseReceiptMode = signal<'new' | 'restock'>('new');
  protected readonly warehouseReceiptTargetId = signal<string | null>(null);
  protected readonly warehouseSupplierHandoff = signal<{ active: boolean; draft: any | null }>({
    active: false,
    draft: null,
  });
  protected readonly expenseSupplierHandoff = signal<{ active: boolean; draft: any | null }>({
    active: false,
    draft: null,
  });
  protected readonly ticketClientHandoff = signal<{ active: boolean; draft: any | null }>({
    active: false,
    draft: null,
  });
  protected readonly serviceModalOpen = signal(false);
  protected readonly toastMessage = signal<string | null>(null);
  protected readonly toastTone = signal<'success' | 'error'>('success');
  // ✅ Fix REV-007 / REV-008: handle timers salvati per cleanup via DestroyRef
  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly blobTimers = new Set<ReturnType<typeof setTimeout>>();

  // Helper: restituisce la data in formato esteso italiano per etichette accessibilità calendario
  protected _longItalianDate(isoDate: string): string {
    const WEEKDAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    try {
      const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
      const dt = new Date(y, (m || 1) - 1, d || 1);
      return `${WEEKDAYS[dt.getDay()]} ${d} ${MONTHS[(m || 1) - 1]} ${y}`;
    } catch {
      return isoDate;
    }
  }

  // Helper: padding a 2 cifre per orari (non posso usare String() direttamene nel template)
  protected _pad2(n: number): string {
    return n.toString().padStart(2, '0');
  }

  // Helper: restituisce classi CSS per l'intestazione giorno della tabella paghe
  // Sostituisce binding con ternari inline {{ }} che il parser html-validate scambia per classi duplicate
  protected pagheThDayClass(d: { dow: number }): string {
    const classes = ['paghe-th-day'];
    if (d.dow === -1) {
      classes.push('paghe-th-day-off', 'paghe-th-off');
    } else if (d.dow === 0 || d.dow === 6) {
      classes.push('paghe-th-day-we', 'paghe-th-we');
    } else {
      classes.push('paghe-th-day-wd');
    }
    return classes.join(' ');
  }

  // Helper: restituisce classi CSS per la riga D/L/M/M/G/V/S sotto i giorni paghe
  protected pagheThDowClass(d: { dow: number }): string {
    const classes = ['paghe-th-dow'];
    if (d.dow === -1) {
      classes.push('paghe-th-dow-off', 'paghe-th-off');
    } else if (d.dow === 0 || d.dow === 6) {
      classes.push('paghe-th-dow-we', 'paghe-th-we');
    } else {
      classes.push('paghe-th-dow-wd');
    }
    return classes.join(' ');
  }

  // Helper: restituisce classi CSS per il tag assenza (Ferie/Permesso/Malattia)
  // Evita binding ternario inline {{ }} che genera falsi positivi classi duplicate
  protected tagAssenzaClass(assenzaPer: string): string {
    if (assenzaPer === 'Ferie') return 'tag-ass tag-ass-f';
    if (assenzaPer === 'Permesso') return 'tag-ass tag-ass-p';
    return 'tag-ass tag-ass-m';
  }

  protected readonly privacyBaseUrlOverride = this.privacyDispatch.baseUrlOverride;
  protected readonly selectedClientId = signal<string | null>(null);
  protected readonly selectedSupplierId = signal<string | null>(null);
  protected readonly selectedQuoteId = signal<string | null>(null);
  protected readonly selectedAppointmentId = signal<string | null>(null);
  protected readonly selectedInventoryId = signal<string | null>(null);
  protected readonly selectedTicketId = signal<string | null>(null);
  protected readonly ticketDetailModalOpen = signal(false);
  protected readonly selectedCashProductId = signal<string | null>(null);
  protected readonly selectedExpenseId = signal<string | null>(null);
  protected readonly selectedCashTransactionId = signal<string | null>(null);
  protected readonly selectedCashClientId = signal<string | null>(null);
  protected readonly draggedQuoteId = signal<string | null>(null);
  protected readonly clientQuery = signal('');
  protected readonly quoteQuery = signal('');
  protected readonly quoteClientLookup = signal('');
  // Blocco dati fiscali del preventivo: chiuso di default per ridurre la densità del form
  protected readonly quoteBillingOpen = signal(false);
  protected readonly ticketClientLookup = signal('');
  protected readonly quoteQuickServiceId = signal('');
  protected readonly quoteQuickProductId = signal('');
  protected readonly appointmentQuery = signal('');
  protected readonly agendaCurrentDate = signal<string>(new Date().toISOString().slice(0, 10));
  protected readonly agendaViewMode = signal<'agendina' | 'settimanale' | 'mensile'>('agendina');
  protected readonly ticketQuery = signal('');
  protected readonly inventoryQuery = signal('');
  protected readonly cashProductQuery = signal('');
  protected readonly expenseQuery = signal('');
  protected readonly clientStatusFilter = signal<'tutti' | ClientRecord['status']>('tutti');
  protected readonly clientSortFilter = signal<'alfabetico-az' | 'alfabetico-za' | 'contatto-recente' | 'contatto-storico'>('alfabetico-az');
  protected readonly clientPrivacyFilter = signal<'tutti' | 'ok' | 'mancante'>('tutti');
  protected readonly clientView = signal<
    'dashboard' | 'contatti' | 'interazioni' | 'pipeline' | 'report' | 'automazioni'
  >('dashboard');
  protected readonly clientCityFilter = signal('tutte');
  protected readonly contactsSegment = signal<'clienti' | 'aziende' | 'fornitori'>('clienti');
  protected readonly contactModalKind = signal<'cliente' | 'azienda' | 'fornitore'>('cliente');
  protected readonly filteredContactClients = computed(() =>
    this.filteredClients().filter((client) => client.privacyProfile.billingProfile?.kind !== 'azienda'),
  );
  protected readonly filteredContactCompanies = computed(() =>
    this.filteredClients().filter((client) => client.privacyProfile.billingProfile?.kind === 'azienda'),
  );
  protected readonly filteredContactSuppliers = computed(() => {
    const query = this.clientQuery().trim().toLowerCase();

    return this.allExpenseSuppliers()
      .filter((supplier) => supplier.active)
      .filter((supplier) =>
        query
          ? `${supplier.businessName} ${supplier.vatNumber} ${supplier.email} ${supplier.phone} ${supplier.contactName} ${supplier.supplyType}`
            .toLowerCase()
            .includes(query)
          : true,
      )
      .slice(0, 30);
  });
  protected readonly contactVisibleCount = computed(() => {
    if (this.contactsSegment() === 'fornitori') {
      return this.filteredContactSuppliers().length;
    }
    if (this.contactsSegment() === 'aziende') {
      return this.filteredContactCompanies().length;
    }
    return this.filteredContactClients().length;
  });
  protected readonly contactCommandSummary = computed(() => {
    const clients = this.allClients();
    const suppliers = this.allExpenseSuppliers().filter((supplier) => supplier.active);
    const companies = clients.filter((client) => client.privacyProfile.billingProfile?.kind === 'azienda');
    const privates = clients.filter((client) => client.privacyProfile.billingProfile?.kind !== 'azienda');
    const missingPrivacy = clients.filter((client) => !client.privacyProfile.noticeAcknowledged);

    return [
      {
        segment: 'clienti' as const,
        tone: 'info' as const,
        kicker: 'Rubrica clienti',
        label: 'Privati e lead',
        count: privates.length,
        detail: 'Contatti da richiamare, seguire o portare in preventivo.',
      },
      {
        segment: 'aziende' as const,
        tone: 'success' as const,
        kicker: 'Anagrafiche business',
        label: 'Aziende attive',
        count: companies.length,
        detail: 'Schede con dati fiscali e storico operativo dedicato.',
      },
      {
        segment: 'fornitori' as const,
        tone: 'neutral' as const,
        kicker: 'Rete acquisti',
        label: 'Fornitori attivi',
        count: suppliers.length,
        detail: 'Partner attivi collegati a ordini e documenti spesa.',
      },
      {
        segment: 'clienti' as const,
        tone: 'warning' as const,
        kicker: 'Attenzione',
        label: 'Privacy da completare',
        count: missingPrivacy.length,
        detail: 'Contatti da sistemare prima di campagne, offerte e follow-up.',
      },
    ];
  });
  protected readonly interactionKindFilter = signal<'tutti' | 'appuntamento' | 'ticket'>('tutti');
  protected readonly interactionOwnerFilter = signal('tutti');
  protected readonly interactionDateFilter = signal('');
  protected readonly quoteStageFilter = signal<'tutte' | QuoteRecord['stage']>('tutte');
  protected readonly appointmentStatusFilter = signal<'tutti' | AppointmentRecord['status']>('tutti');
  protected readonly appointmentLocationFilter = signal<
    'tutti' | AppointmentRecord['locationType']
  >('tutti');
  protected readonly appointmentTypeFilter = signal<'tutti' | AppointmentRecord['appointmentType']>(
    'tutti',
  );
  protected readonly ticketStatusFilter = signal<'tutti' | ServiceTicketRecord['status']>('tutti');
  protected readonly ticketPriorityFilter = signal<'tutte' | ServiceTicketRecord['priority']>(
    'tutte',
  );
  protected readonly inventoryStatusFilter = signal<'tutti' | InventoryItemRecord['status']>('tutti');
  protected readonly warehouseValuationDate = signal<string>('');
  protected readonly warehouseCategoryFilter = signal('tutte');
  protected readonly warehouseSupplierQuery = signal('');
  protected readonly warehouseSupplierDetailName = signal<string | null>(null);
  protected readonly warehouseView = signal<
    'ricerca' | 'acquisto' | 'consumi' | 'utilizzo' | 'sottoscorta' | 'valore' | 'movimenti' | 'ordini' | 'fornitori'
  >('ricerca');
  protected readonly warehouseMovementTypeFilter = signal<'tutti' | WarehouseMovementRecord['movementType']>(
    'tutti',
  );
  protected readonly warehouseOperatorFilter = signal('tutti');
  protected readonly warehouseMovementDateFrom = signal('');
  protected readonly warehouseMovementDateTo = signal('');
  protected readonly cashCategoryFilter = signal('tutte');
  protected readonly expenseStatusFilter = signal<'tutte' | ExpenseRecord['status']>('tutte');
  protected readonly expenseView = signal<'registro' | 'scadenze' | 'fornitori' | 'audit' | 'statistiche'>('registro');
  protected readonly quoteDraftLines = signal<QuoteLineRecord[]>([
    {
      id: `qline-${crypto.randomUUID()}`,
      kind: 'servizio',
      description: '',
      quantity: 1,
      unitPrice: 0,
      vatRate: 22,
    },
  ]);
  /**
   * Insieme degli ID delle righe preventivo in modalità "Altro" (testo libero).
   * Se un ID è presente, la riga usa un input testo libero invece del dropdown
   * dei servizi/prodotti esistenti.
   */
  protected readonly quoteLineFreeTextIds = signal<Set<string>>(new Set());
  protected readonly expensePaymentModeFilter = signal<'tutte' | ExpenseRecord['paymentMode']>('tutte');
  protected readonly expenseSupplierFilter = signal('tutti');
  protected readonly cashSalesMode = signal<CashSalesMode>('tutti');
  protected readonly cashCustomerMode = signal<'existing' | 'walk-in'>('walk-in');
  protected readonly cashPaymentMethod = signal<CashTransactionRecord['paymentMethod']>('pos');
  protected readonly cashMixedElectronicMethod = signal<'bancomat' | 'carta' | 'bonifico'>('bancomat');
  protected readonly cashPosElectronicMethod = signal<'bancomat' | 'carta'>('bancomat');
  protected readonly cashMixedCashAmount = signal(0);
  protected readonly cashMixedElectronicAmount = signal(0);
  protected readonly cashDocumentType = signal<CashTransactionRecord['documentType']>('scontrino');
  protected readonly cashCustomerName = signal('Cliente di passaggio');
  protected readonly cashClientLookup = signal('');
  protected readonly cashCustomerPhone = signal('');
  protected readonly cashCustomerCity = signal('');
  protected readonly cashCustomerEmail = signal('');
  protected readonly cashQueuedSessions = signal<CashDeskSessionDraft[]>([]);
  protected readonly cashClientModalOpen = signal(false);
  protected readonly cashHistoryModalOpen = signal(false);
  /** Popup dedicato all'elenco dei clienti messi in attesa alla cassa */
  protected readonly cashWaitingModalOpen = signal(false);
  protected readonly cashReceiptPreviewModalOpen = signal(false);
  protected readonly cashNewClientName = signal('');
  protected readonly cashNewClientPhone = signal('');
  protected readonly cashNewClientCity = signal('');
  protected readonly cashNewClientEmail = signal('');
  protected readonly cashNewClientIsCompany = signal(false);
  protected readonly cashNewClientTaxId = signal('');
  protected readonly cashNewClientSdiCode = signal('');
  protected readonly cashNewClientPec = signal('');
  protected readonly cashNewClientBillingAddress = signal('');
  protected readonly cashNewClientBillingPostalCode = signal('');
  protected readonly cashNewClientBillingProvince = signal('');
  protected readonly cashNewClientBillingCountry = signal('IT');

  // ✅ Modale Dati Identificativi Fattura (quando passi da scontrino → fattura con cliente walk-in o incompleto)
  protected readonly cashInvoiceDataModalOpen = signal(false);
  protected readonly cashInvIsCompany = signal(false);
  protected readonly cashInvName = signal('');
  protected readonly cashInvPhone = signal('');
  protected readonly cashInvCity = signal('');
  protected readonly cashInvEmail = signal('');
  protected readonly cashInvTaxId = signal('');
  protected readonly cashInvSdiCode = signal('');
  protected readonly cashInvPec = signal('');
  protected readonly cashInvBillingAddress = signal('');
  protected readonly cashInvBillingPostalCode = signal('');
  protected readonly cashInvBillingProvince = signal('');
  protected readonly cashInvBillingCountry = signal('IT');
  protected readonly cashInvCapturedType: WritableSignal<CashTransactionRecord['documentType'] | null> = signal(null);
  protected readonly cashPrivacyDispatchChannel = signal<'whatsapp' | 'email' | 'firma'>('whatsapp');
  protected readonly cashPrivacyNoticeAcknowledged = signal(false);
  protected readonly cashPrivacyEmailMarketing = signal(false);
  protected readonly cashPrivacyWhatsappMarketing = signal(false);
  protected readonly cashPrivacyFidelityProfiling = signal(false);
  protected readonly cashNotes = signal('');
  protected readonly cashReceivedAmount = signal(0);
  protected readonly cashDiscountValue = signal(0);
  protected readonly cashDiscountType = signal<'importo' | 'percentuale'>('importo');
  protected readonly cashDiscountNote = signal('');
  protected readonly cashLinkedQuoteId = signal<string | null>(null);
  protected readonly cashPendingTransactionId = signal<string | null>(null);
  protected readonly cashClosureModalOpen = signal(false);
  protected readonly cashReceiptsModalOpen = signal(false);
  protected readonly cashDocumentListFilter = signal<'scontrini' | 'fatture'>('scontrini');
  protected readonly selectedCashReceiptId = signal<string | null>(null);
  protected readonly cashReceiptSearch = signal('');
  protected readonly cashEditingTransactionId = signal<string | null>(null);
  protected readonly cashReportModalOpen = signal(false);
  protected readonly cashReportModalView = signal<'incassi' | 'operatori' | 'categorie' | 'numerazione' | 'chiusure' | 'clienti-top'>('incassi');
  protected readonly cashShiftSearch = signal('');
  protected readonly selectedCashReportShiftId = signal<string | null>(null);
  protected readonly selectedCashReportTransactionId = signal<string | null>(null);
  protected readonly selectedCashTopClientId = signal<string | null>(null);
  protected readonly cashCart = signal<CashTransactionLine[]>([]);
  protected readonly cashShiftLabel = signal('Chiusura giornaliera');
  protected readonly cashCurrentOperator = signal('Banco');
  protected readonly cashOperators = computed(() =>
    this.data.activeCashOperators().map((operator) => operator.name),
  );
  protected readonly selectedEmployeeId = signal<string | null>(null);
  protected readonly employeeModalOpen = signal(false);
  protected readonly isCreatingEmployee = signal(false);
  protected readonly employeeAttendanceModalOpen = signal(false);
  protected readonly selectedAttendanceEmployeeId = signal<string | null>(null);
  protected readonly selectedAttendanceDate = signal('');
  protected readonly employeeShiftDays: EmployeeShiftDayMeta[] = [
    { key: 'lun', label: 'Lunedì' },
    { key: 'mar', label: 'Martedì' },
    { key: 'mer', label: 'Mercoledì' },
    { key: 'gio', label: 'Giovedì' },
    { key: 'ven', label: 'Venerdì' },
    { key: 'sab', label: 'Sabato' },
    { key: 'dom', label: 'Domenica' },
  ];
  protected readonly timeHours = Array.from({ length: 24 }, (_, index) =>
    String(index).padStart(2, '0'),
  );
  protected readonly timeMinutes = Array.from({ length: 12 }, (_, index) =>
    String(index * 5).padStart(2, '0'),
  );
  protected readonly employeeShiftDrafts = signal<Record<EmployeeShiftDayKey, EmployeeShiftDraft>>(
    this.emptyEmployeeShiftDrafts(),
  );
  protected readonly reportSectionState = signal<Record<ReportSectionKey, boolean>>({
    overview: true,
    cross: false,
    commerciale: false,
    operatività: false,
    amministrazione: false,
    alert: false,
  });
  protected readonly reportFilter = signal<ReportFilterKey>('all');
  protected readonly reportSearch = signal('');
  protected readonly reportCurrentPage = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => this.parseReportPage(params.get('view'))),
    ),
    { initialValue: 'dashboard' as ReportPageKey },
  );
  protected readonly reportPeriodPreset = signal<ReportPeriodPreset>('ultimi-30');
  protected readonly reportPeriodFrom = signal('');
  protected readonly reportPeriodTo = signal('');
  protected readonly reportComparePrevious = signal(true);
  protected readonly reportLastRefreshAt = signal(new Date().toISOString());
  protected readonly reportDrilldownRequest = signal<ReportDrilldownRequest | null>(null);
  protected readonly reportDrilldownHeaders = signal<string[]>([]);
  protected readonly reportDrilldownRows = signal<ReportDrilldownRow[]>([]);
  protected readonly employeeDraft = signal<CashOperatorRecord | null>(null);
  protected readonly selectedEmployee = computed(() => {
    return this.employeeDraft();
  });
  protected readonly employeeRosterStats = computed(() => {
    const operators = this.allCashOperators();
    return {
      dipendenti: operators.filter((item) => item.employmentType === 'dipendente').length,
      titolari: operators.filter((item) => item.employmentType === 'titolare').length,
      attivi: operators.filter((item) => item.active).length,
    };
  });
  protected readonly employeeWeeklyContractHours = computed(() =>
    this.allCashOperators()
      .filter((employee) => employee.active)
      .reduce((sum, employee) => sum + Math.max(0, employee.contractHoursWeekly), 0),
  );
  protected readonly employeesWithConfiguredShiftsCount = computed(
    () => this.allCashOperators().filter((item) => this.employeeFilledShiftDays(item) > 0).length,
  );
  protected readonly employeeRoleStats = computed(() => {
    const operators = this.allCashOperators();
    return [
      {
        key: 'vendita',
        label: 'Vendita',
        detail: 'Accoglienza, consulenza e supporto cliente',
        count: operators.filter((item) => item.role === 'vendita').length,
      },
      {
        key: 'tecnico',
        label: 'Tecnici',
        detail: 'Installazioni, assistenze e laboratorio',
        count: operators.filter((item) => item.role === 'tecnico').length,
      },
      {
        key: 'amministrazione',
        label: 'Amministrazione',
        detail: 'Back office, documenti e controllo interno',
        count: operators.filter((item) => item.role === 'amministrazione').length,
      },
      {
        key: 'magazzino',
        label: 'Magazzino',
        detail: 'Scorte, movimenti e supporto operativo',
        count: operators.filter((item) => item.role === 'magazzino').length,
      },
    ];
  });
  protected readonly selectedEmployeeFilledShiftDays = computed(() => {
    const employee = this.selectedEmployee();
    return employee ? this.employeeFilledShiftDays(employee) : 0;
  });
  protected readonly employeePanelView = signal<'elenco' | 'turni'>('turni');
  protected readonly employeeScheduleView = signal<'mese' | 'periodo'>('mese');
  // ═══ Tab modale dipendente: Anagrafica | Turni Standard | Turni Settimanali
  protected readonly employeeModalTab = signal<'anagrafica' | 'turni-standard' | 'turni-settimanali'>('anagrafica');
  // ═══ Turni standard settimanali (profilo dipendente)
  protected readonly employeeDefaultShiftDrafts = signal<Record<EmployeeShiftDayKey, EmployeeShiftDraft>>(
    this.emptyEmployeeShiftDrafts(),
  );
  // ═══ Promemoria paghe 1° del mese
  protected readonly pagheReminderOpen = signal(false);
  // ✅ Fix ISS-28: handle del setTimeout per cleanup su DestroyRef
  private pagheReminderTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly employeeLeaves = this.data.employeeLeaves;
  protected readonly employeeScheduleMonth = signal<string>(this.startOfMonthIso(this.toIsoDate(new Date())));
  protected readonly employeePeriodFrom = signal<string>(this.startOfMonthIso(this.toIsoDate(new Date())));
  protected readonly employeePeriodTo = signal<string>(this.endOfMonthIso(this.toIsoDate(new Date())));
  protected readonly employeeLeaveTypeFilter = signal<'tutte' | EmployeeLeaveRecord['leaveType']>('tutte');
  protected readonly employeeLeaveEmployeeFilter = signal<'tutti' | string>('tutti');
  protected readonly employeeLeaveSelectedOperator = computed(() => {
    const employeeId = this.employeeLeaveForm.value.employeeId;
    if (!employeeId) {
      return null;
    }
    return this.allCashOperators().find((employee) => employee.id === employeeId) ?? null;
  });
  protected readonly employeeLeaveSelectedShiftPatterns = computed(
    () => this.employeeLeaveSelectedOperator()?.shiftPatterns ?? [],
  );
  protected readonly weeklyShiftDays = [
    { key: 'lun', label: 'Lun' },
    { key: 'mar', label: 'Mar' },
    { key: 'mer', label: 'Mer' },
    { key: 'gio', label: 'Gio' },
    { key: 'ven', label: 'Ven' },
    { key: 'sab', label: 'Sab' },
    { key: 'dom', label: 'Dom' },
  ] as const;

  // ═══════════════════ PLANNER TURNI SETTIMANALE ═══════════════════
  // Elenco slot orari step 30min da 00:00 a 24:00 (49 valori, in mezz'ore).
  protected readonly planner30MinSlots: string[] = Array.from(
    { length: 49 },
    (_, index) =>
      `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'}`,
  );
  protected readonly plannerMaxWeeks = 4;
  // Per coerenza con shiftPatterns array inizializzo sempre a 1.
  // L'utente può aggiungere con pulsante +.
  protected readonly plannerActiveWeekIndex = signal(0);
  protected readonly plannerMonthAnchor = signal<string>('');  // Data ISO opzionale: "turno d'inizio mese"
  protected readonly plannerSelectedCell = signal<PlannerSelectedCell | null>(null);

  // ══ Selettori mese/anno per export PDF paghe ══
  private readonly _oggi = new Date();
  protected readonly pagheMese = signal<number>(this._oggi.getMonth());   // 0..11
  protected readonly pagheAnno = signal<number>(this._oggi.getFullYear());
  protected readonly pagheMesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  // ══ Lista operatori Veloce (Impostazioni): toggle per mostrare anche quelli "nascosti" (active=false)
  protected readonly showHiddenOperators = signal<boolean>(false);
  protected readonly operatorsListVisible = computed(() => {
    if (this.showHiddenOperators()) {
      return this.allCashOperators();
    }
    return this.allCashOperators().filter((op) => op.active);
  });
  protected toggleShowHiddenOperators(checked: boolean): void {
    this.showHiddenOperators.set(checked);
  }

  // ═══════════════════════════════════════════════════════════════════
  // TASK 2 · Impostazioni Orari Negozio · Giorni chiusura / Aperture straordinarie / Chiusure collettive
  // ═══════════════════════════════════════════════════════════════════
  protected readonly STORE_WEEKDAY_KEYS: Array<{ key: 'lun' | 'mar' | 'mer' | 'gio' | 'ven' | 'sab' | 'dom'; short: string; label: string; }> = [
    { key: 'lun', short: 'L', label: 'Lunedì' },
    { key: 'mar', short: 'M', label: 'Martedì' },
    { key: 'mer', short: 'M', label: 'Mercoledì' },
    { key: 'gio', short: 'G', label: 'Giovedì' },
    { key: 'ven', short: 'V', label: 'Venerdì' },
    { key: 'sab', short: 'S', label: 'Sabato' },
    { key: 'dom', short: 'D', label: 'Domenica' },
  ];

  // ⚠️ Incapsulamento: `data` service è private. Wrapper computed leggibili dal template.
  protected readonly storeClosingDaysWeekly = computed(() => this.data.storeClosingDaysWeekly());
  protected readonly storeExtraOpeningDates = computed(() => this.data.storeExtraOpeningDates());
  protected readonly storeBulkClosures = computed(() => this.data.storeBulkClosures());
  // Draft per form inline Apertura Straordinaria (data odierna default)
  protected readonly storeNewExtraOpening = signal<{ date: string; note: string; }>({
    date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),  // default = domani
    note: ''
  });
  // Draft per form inline Chiusura Collettiva (default: domani a +7gg, Ferie)
  protected readonly storeNewBulkClosure = signal<{ startDate: string; endDate: string; reason: string; }>((() => {
    const start = new Date(Date.now() + 86400000);
    const end = new Date(start.getTime() + 6 * 86400000);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      reason: 'Ferie collettive del negozio'
    };
  })());

  /** Toggle giorno di chiusura settimanale (Lun..Dom). Chiamato dalla card Impostazioni. */
  protected toggleStoreClosingDay(key: 'lun' | 'mar' | 'mer' | 'gio' | 'ven' | 'sab' | 'dom'): void {
    const curr = this.data.storeClosingDaysWeekly();
    const nuovo = { ...curr, [key]: !curr[key] };
    this.data.storeClosingDaysWeekly.set(nuovo);
    const info = this.STORE_WEEKDAY_KEYS.find(g => g.key === key)!;
    this.pushToast(`${info.label} ${nuovo[key] ? 'impostato come giorno di chiusura' : 'ripristinato giorno di apertura'}`, 'success');
  }

  /** Aggiunge un giorno di apertura straordinario (sovrascrive chiusura settimanale/bulk). */
  protected addStoreExtraOpening(): void {
    const d = this.storeNewExtraOpening();
    if (!d.date) { this.pushToast('Inserisci una data per l\'apertura straordinaria', 'error'); return; }
    const nuovo = {
      id: 'exop_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: d.date,
      note: (d.note || '').trim() || undefined
    };
    this.data.storeExtraOpeningDates.update(arr => [...arr, nuovo]);
    this.storeNewExtraOpening.set({
      date: new Date(new Date(d.date).getTime() + 86400000).toISOString().slice(0, 10),
      note: ''
    });
    this.pushToast(`Apertura straordinaria ${d.date} salvata`, 'success');
  }
  protected removeStoreExtraOpening(id: string): void {
    this.data.storeExtraOpeningDates.update(arr => arr.filter(a => a.id !== id));
    this.pushToast('Apertura straordinaria rimossa', 'success');
  }

  /** Aggiunge una chiusura collettiva completa negozio (Ferie, ferragosto, ecc.). */
  protected addStoreBulkClosure(): void {
    const d = this.storeNewBulkClosure();
    if (!d.startDate || !d.endDate) { this.pushToast('Compila data inizio e fine chiusura collettiva', 'error'); return; }
    if (d.endDate < d.startDate) { this.pushToast('Data fine deve essere >= inizio', 'error'); return; }
    const nuovo = {
      id: 'bulk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      startDate: d.startDate,
      endDate: d.endDate,
      reason: d.reason.trim() || 'Chiusura negozio'
    };
    this.data.storeBulkClosures.update(arr => [...arr, nuovo]);
    // reset form +1 giorno dopo fine
    const afterEnd = new Date(new Date(d.endDate).getTime() + 86400000);
    const afterEndEnd = new Date(afterEnd.getTime() + 6 * 86400000);
    this.storeNewBulkClosure.set({
      startDate: afterEnd.toISOString().slice(0, 10),
      endDate: afterEndEnd.toISOString().slice(0, 10),
      reason: 'Ferie collettive del negozio'
    });
    this.pushToast(`Chiusura collettiva ${nuovo.startDate} → ${nuovo.endDate} salvata (${nuovo.reason})`, 'success');
  }
  protected removeStoreBulkClosure(id: string): void {
    this.data.storeBulkClosures.update(arr => arr.filter(c => c.id !== id));
    this.pushToast('Chiusura collettiva rimossa', 'success');
  }

  // Helper per HTML template (Angular NON ammette `new Date(...)` negli expressions)
  /** Ritorna il nome del giorno della settimana data una stringa YYYY-MM-DD. */
  protected weekdayNameFromDate(dateStr: string): string {
    if (!dateStr) return '';
    return ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'][new Date(dateStr + 'T00:00:00').getDay()];
  }
  /** Calcola il numero di giorni inclusi tra startStr (YYYY-MM-DD) e endStr. */
  protected daysBetweenDates(startStr: string, endStr: string): number {
    if (!startStr || !endStr) return 0;
    const s = new Date(startStr + 'T00:00:00').getTime();
    const e = new Date(endStr + 'T23:59:59').getTime();
    return Math.max(0, Math.round((e - s) / 86400000) + 1);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TASK 6 · Store apertura / chiusura per data (usato da paghe e agenda)
  // ═══════════════════════════════════════════════════════════════════════

  /** Mappa i giorni della settimana 0=Domenica..6=Sabato → chiavi record storeClosingDaysWeekly */
  private static readonly _DOW_TO_WEEKDAY_KEY: Record<number, 'lun' | 'mar' | 'mer' | 'gio' | 'ven' | 'sab' | 'dom'> = {
    0: 'dom', 1: 'lun', 2: 'mar', 3: 'mer', 4: 'gio', 5: 'ven', 6: 'sab'
  };

  /** Restituisce il motivo dell'apertura/chiusura per una certa data.
   *  Priorità 0→4 (P0 extra-open vince sempre):
   *   P0 = extra-open (apertura straordinaria sovrascrive chiusure)
   *   P1 = bulk-closure (chiusura collettiva negozio → F ferie)
   *   P2 = closed-weekly (chiusura settimanale → R riposo standard)
   *   P3 = open (normale)
   */
  protected storeOpenStatusForDate(
    d: Date | string
  ):
    | { kind: 'open' }
    | { kind: 'extra-open'; note?: string }
    | { kind: 'closed-weekly'; dayLabel: string }
    | { kind: 'bulk-closure'; reason: string; from: string; to: string } {
    const date = typeof d === 'string' ? new Date(d + 'T12:00:00') : new Date(d.getTime() + 43200000);
    const iso = date.toISOString().slice(0, 10);

    // P0: apertura straordinaria → vince sempre
    const extra = this.storeExtraOpeningDates().find(x => x.date === iso);
    if (extra) {
      return { kind: 'extra-open', note: extra.note };
    }

    // P1: chiusura collettiva → F per tutti
    const bulk = this.storeBulkClosures().find(c => c.startDate <= iso && iso <= c.endDate);
    if (bulk) {
      return { kind: 'bulk-closure', reason: bulk.reason, from: bulk.startDate, to: bulk.endDate };
    }

    // P2: chiusura settimanale
    const dow = date.getDay();
    const wk = SectionPageComponent._DOW_TO_WEEKDAY_KEY[dow];
    const closing = this.storeClosingDaysWeekly();
    if (closing[wk]) {
      const labels: Record<string, string> = { lun: 'Lunedì', mar: 'Martedì', mer: 'Mercoledì', gio: 'Giovedì', ven: 'Venerdì', sab: 'Sabato', dom: 'Domenica' };
      return { kind: 'closed-weekly', dayLabel: labels[wk] };
    }

    return { kind: 'open' };
  }

  /** Helper veloce: negozio è chiuso (weekly o bulk)? Le aperture straordinarie → false. */
  protected isStoreClosedOnDate(d: Date | string): boolean {
    const s = this.storeOpenStatusForDate(d);
    return s.kind === 'closed-weekly' || s.kind === 'bulk-closure';
  }

  /** Ritorna la chiusura collettiva per data se esiste (per badge agenda). */
  protected bulkClosureForDate(d: Date | string) {
    const s = this.storeOpenStatusForDate(d);
    return s.kind === 'bulk-closure' ? s : null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TASK 8 · Agenda · Controllo Tecnici 5 livelli Priorità 0→4
  // ═══════════════════════════════════════════════════════════════════════

  /** Estrae la Data prevista dall'appuntamento (scheduledAt del form) o null se non compilata. */
  private _appointmentDateOrNull(): Date | null {
    try {
      const v = (this as any).appointmentForm?.value?.scheduledAt;
      if (!v || typeof v !== 'string' || v.length < 10) return null;
      return new Date(v.length <= 10 ? (v + 'T12:00:00') : v);
    } catch { return null; }
  }

  /**
   * Calcola lo stato di un tecnico per la data/ora dell'appuntamento (6 livelli P0→P4 + OK).
   *   P0 = extra-open (informativo, il negozio è aperto in via straordinaria)
   *   P1 = NEGOZIO CHIUSO (weekly o bulk) → TUTTI i tecnici disabilitati 🔴 🔒
   *   P2 = Tecnico ha FERIE / MALATTIA full-day → disabilitato ❌
   *   P3 = Tecnico ha PERMESSO ORARIO sovrapposto all'appuntamento (non bloccante ⚠️ arancio)
   *   P4 = Tecnico in RIPOSO (nessun turno standard/programmato) 💤 grigio (non bloccante)
   *   P9 = Tecnico libero ✅
   */
  protected getAppointmentOperatorStatus(
    operatorName: string
  ): { level: 0 | 1 | 2 | 3 | 4 | 9; badge: string; classes: string; disabled: boolean; title: string } {
    const emp = this.allCashOperators().find(o => o.name === operatorName);
    const dateObj = this._appointmentDateOrNull();
    if (!emp || !dateObj) {
      return { level: 9, badge: '', classes: '', disabled: false, title: 'Seleziona data/ora appuntamento per vedere la disponibilità' };
    }
    const iso = dateObj.toISOString().slice(0, 10);
    const dow = dateObj.getDay();
    const apptStartMin = dateObj.getHours() * 60 + dateObj.getMinutes();
    // Assumiamo durata appuntamento di default 90min, usiamo 120min come finestra di overlap
    const apptEndMin = Math.min(24 * 60, apptStartMin + 120);

    // P1 / P0: Controllo stato negozio (vale per TUTTI i tecnici)
    const storeStatus = this.storeOpenStatusForDate(dateObj);
    if (storeStatus.kind === 'closed-weekly' || storeStatus.kind === 'bulk-closure') {
      const motivo = storeStatus.kind === 'bulk-closure'
        ? `Chiusura collettiva: ${storeStatus.reason} (${storeStatus.from} → ${storeStatus.to}) · Puoi comunque selezionare per eventi speciali/dimostrazioni.`
        : `Negozio chiuso · ${storeStatus.dayLabel} · Puoi comunque selezionare per eventi speciali/dimostrazioni.`;
      return { level: 1, badge: `🔒 NEGOZIO CHIUSO`, classes: 'tech-warn tech-level1 tech-overridable', disabled: false, title: motivo };
    }
    // P0: Apertura straordinaria (solo informativo)
    let extraBadge = '';
    if (storeStatus.kind === 'extra-open') {
      extraBadge = storeStatus.note ? `🌟 Apertura straordinaria · ${storeStatus.note}` : '🌟 Apertura straordinaria';
    }

    // P2 / P3: Leave records del dipendente oggi
    const leaves = (emp as any).leaves ?? [];
    const todayLeaves = leaves.filter((l: any) => l.startDate <= iso && iso <= (l.endDate || l.startDate));

    const fullDayOff = todayLeaves.find((l: any) => l.type === 'ferie' || l.type === 'malattia');
    if (fullDayOff) {
      const tip = fullDayOff.type === 'ferie'
        ? `❌ Ferie ${fullDayOff.startDate} → ${fullDayOff.endDate || fullDayOff.startDate}`
        : `❌ Malattia ${fullDayOff.startDate} → ${fullDayOff.endDate || fullDayOff.startDate}`;
      return { level: 2, badge: tip, classes: 'tech-dis tech-level2', disabled: true, title: tip };
    }

    const permesso = todayLeaves.find((l: any) => l.type === 'permesso');
    if (permesso) {
      // Calcola overlap tra permesso e appuntamento
      let permStart = 0, permEnd = 24 * 60;
      if (typeof permesso.startTimeMinutes === 'number' && typeof permesso.endTimeMinutes === 'number') {
        permStart = permesso.startTimeMinutes;
        permEnd = permesso.endTimeMinutes;
      } else if (typeof permesso.hours === 'number' && permesso.hours > 0 && permesso.hours < 8) {
        permStart = 8 * 60;
        permEnd = permStart + Math.round(permesso.hours * 60);
      } else {
        // Permesso giornata intera senza orari → overlap pieno
        permStart = 0; permEnd = 24 * 60;
      }
      const overlap = Math.max(0, Math.min(apptEndMin, permEnd) - Math.max(apptStartMin, permStart));
      if (overlap > 15) { // oltre 15 minuti → avviso
        const oreP = ((permEnd - permStart) / 60);
        const orePTxt = (Math.round(oreP * 10) / 10).toFixed(1).replace('.', ',');
        const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        const tip = `⚠️ Permesso ${fmt(permStart)}–${fmt(permEnd)} (${orePTxt.replace(',0', '')}h) · appuntamento sovrapposto`;
        return { level: 3, badge: tip, classes: 'tech-warn tech-level3', disabled: false, title: tip + '. Puoi comunque selezionare se necessario.' };
      }
    }

    // P4: Riposo (nessun turno)
    const wkKey = SectionPageComponent._DOW_TO_WEEKDAY_KEY[dow];
    const defaultShift = (emp.defaultWeeklyShift?.[wkKey])?.trim() ?? '';
    const hasProg = this.getShiftForDate(emp, iso) || '';
    if (
      (!defaultShift || /^\[(riposo|chiusura)\]\s*$/i.test(defaultShift)) &&
      (!hasProg || /^\[(riposo|chiusura)\]\s*$/i.test(hasProg))
    ) {
      const tip = '💤 Riposo · nessun turno standard o programmato';
      return { level: 4, badge: tip, classes: 'tech-info tech-level4', disabled: false, title: tip + '. Puoi comunque assegnare se serve.' };
    }

    return {
      level: 9,
      badge: extraBadge || '✅ Disponibile',
      classes: 'tech-ok',
      disabled: false,
      title: 'Tecnico disponibile per questa fascia oraria.'
    };
  }

  /** Badge AVVISO in cima ai chips tecnici (negozio chiuso / extra open). */
  protected appointmentStoreNoticeBadge(): { show: boolean; text: string; classes: string } | null {
    const d = this._appointmentDateOrNull();
    if (!d) return null;
    const s = this.storeOpenStatusForDate(d);
    if (s.kind === 'closed-weekly') {
      return { show: true, text: `🔒 Negozio chiuso · ${s.dayLabel} · Puoi comunque salvare appuntamenti speciali (eventi, dimostrazioni).`, classes: 'tech-badge tech-badge-level1' };
    }
    if (s.kind === 'bulk-closure') {
      return { show: true, text: `🔒 Chiusura collettiva: ${s.reason} (${s.from} → ${s.to}) · Puoi comunque salvare eventi/dimostrazioni.`, classes: 'tech-badge tech-badge-level1' };
    }
    if (s.kind === 'extra-open') {
      return { show: true, text: `🌟 Apertura straordinaria · negozio aperto eccezionalmente.${s.note ? ' (' + s.note + ')' : ''}`, classes: 'tech-badge tech-badge-level0' };
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════
  protected readonly plannerLeaveTones = PLANNER_LEAVE_TONES;
  // Preset rapidi di orario standard per click singolo su una cella turno.
  protected readonly plannerShiftPresets = [
    { key: 'mattutino', label: 'Mattina', start: '08:30', end: '17:00', breakFrom: '13:00', breakTo: '14:00' },
    { key: 'pomeridiano', label: 'Pomeriggio', start: '14:00', end: '22:00', breakFrom: '18:00', breakTo: '18:30' },
    { key: 'split', label: 'Continuato', start: '08:00', end: '13:00 15:00 19:00', breakFrom: '13:00', breakTo: '15:00' },
    { key: 'serale', label: 'Serale', start: '17:00', end: '24:00', breakFrom: '20:00', breakTo: '20:30' },
  ];

  // Stato temporaneo dell'editor custom (per select orari senza riferimenti template fragili)
  protected readonly plannerEditorTmp = signal<{ start: string; end: string; hasBreak: boolean; breakFrom: string; breakTo: string; }>({
    start: '08:30', end: '17:00', hasBreak: true, breakFrom: '13:00', breakTo: '14:00'
  });

  // Stato temporaneo editor PERMESSO ORARIO (Task7)
  protected readonly plannerPermitEditorTmp = signal<{ start: string; end: string; }>({
    start: '09:00', end: '11:00',
  });

  // ========================================================================
  // TASK 4: IMPOSTAZIONI · TABS ORIZZONTALI 7 CATEGORIE
  // ========================================================================
  protected readonly SETTINGS_TABS = [
    { key: 'azienda', label: 'Dati Azienda', icon: '🏢' },
    { key: 'dipendenti', label: 'Dipendenti', icon: '👥' },
    { key: 'pagamenti', label: 'Pagamenti', icon: '💳' },
    { key: 'orari-negozio', label: 'Orari Negozio', icon: '🏪' },
    { key: 'fiscale', label: 'Fiscale', icon: '🧾' },
    { key: 'preferenze', label: 'Preferenze', icon: '⚙️' },
    { key: 'privacy', label: 'Privacy', icon: '🔒' },
  ] as const;
  protected readonly activeSettingsTab: WritableSignal<string> = signal(
    this.SETTINGS_TABS.some((tab) => tab.key === this.storage.getItem('audiomax_settings_last_tab'))
      ? (this.storage.getItem('audiomax_settings_last_tab') as string)
      : 'azienda'
  );
  protected setActiveSettingsTab(key: string): void {
    this.activeSettingsTab.set(key);
    this.storage.setItem('audiomax_settings_last_tab', key);
  }

  // ========================================================================
  // CATALOGO SERVIZI · TABS ORIZZONTALI (stile Impostazioni)
  // ========================================================================
  protected readonly SERVICES_TABS = [
    { key: 'servizi', label: 'Servizi', icon: '🛠️' },
    { key: 'categorie', label: 'Categorie', icon: '🏷️' },
    { key: 'listino', label: 'Listino', icon: '💰' },
  ] as const;
  protected readonly activeServicesTab: WritableSignal<string> = signal('servizi');
  protected setActiveServicesTab(key: string): void {
    this.activeServicesTab.set(key);
  }

  // ------------------------------------------------------------------------
  // LISTINO CASSA · vista in sola lettura con selezione ed export PDF
  // ------------------------------------------------------------------------
  protected readonly listinoQuery = signal('');
  protected readonly listinoCategoryFilter = signal('tutte');
  /** Id delle voci di listino selezionate per l'export */
  protected readonly listinoSelectedIds = signal<string[]>([]);

  protected readonly listinoCategoryOptions = computed(() =>
    [...new Set(this.allCashProducts().map((item) => item.category).filter((category) => !!category))].sort(
      (left, right) => left.localeCompare(right, 'it-IT'),
    ),
  );

  protected readonly listinoFilteredProducts = computed(() => {
    const query = this.listinoQuery().trim().toLowerCase();
    const category = this.listinoCategoryFilter();

    return this.allCashProducts()
      .filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(query))
      .filter((item) => (category === 'tutte' ? true : item.category === category))
      .sort(
        (left, right) =>
          left.category.localeCompare(right.category, 'it-IT') || left.name.localeCompare(right.name, 'it-IT'),
      );
  });

  protected readonly listinoSelectedProducts = computed(() => {
    const selected = new Set(this.listinoSelectedIds());
    return this.allCashProducts()
      .filter((item) => selected.has(item.id))
      .sort(
        (left, right) =>
          left.category.localeCompare(right.category, 'it-IT') || left.name.localeCompare(right.name, 'it-IT'),
      );
  });

  protected readonly listinoSelectionTotal = computed(() =>
    this.listinoSelectedProducts().reduce((total, item) => total + this.resolveCashProductPrice(item), 0),
  );

  // ========================================================================
  // TASK 2: AGENDA PAGINA + DASHBOARD · MINI-MODALE HR ⚡ Operazioni Dipendenti
  // ========================================================================
  protected readonly miniHrModalOpen = signal(false);
  protected readonly miniHrModalDate = signal<string>('');
  protected readonly miniHrModalAction = signal<'appuntamento' | 'straordinario' | 'ferie' | 'malattia' | 'permesso'>('ferie');
  protected readonly miniHrModalEmpName = signal<string>('');
  protected readonly miniHrModalPermitStart = signal<string>('09:00');
  protected readonly miniHrModalPermitEnd = signal<string>('11:00');
  protected readonly miniHrModalNote = signal<string>('');

  /** Apre il mini-modale ⚡ Operazioni Dipendenti per una data specifica. */
  protected openMiniHrModal(isoDate: string, initialAction: 'straordinario' | 'ferie' | 'malattia' | 'permesso' | 'appuntamento' = 'ferie'): void {
    if (initialAction === 'appuntamento') {
      // shortcut → usa modale normale invece di mini-modale HR
      this.openAppointmentModalForDate(isoDate);
      return;
    }
    this.miniHrModalDate.set(isoDate);
    this.miniHrModalAction.set(initialAction);
    // default: primo operatore attivo (se esiste)
    const firstOp = this.allCashOperators().find(o => o.active);
    this.miniHrModalEmpName.set(firstOp?.name ?? '');
    this.miniHrModalPermitStart.set('09:00');
    this.miniHrModalPermitEnd.set('11:00');
    this.miniHrModalNote.set('');
    this.miniHrModalOpen.set(true);
  }
  protected closeMiniHrModal(): void { this.miniHrModalOpen.set(false); }

  /** Helper calcolo minuti permesso orario per mini-modale HR (template non ammette Math). */
  protected miniHrPermitMinutesCalc(): number {
    const s = this.hhmmToMinutes(this.miniHrModalPermitStart());
    const e = this.hhmmToMinutes(this.miniHrModalPermitEnd());
    const m = e - s;
    return m > 0 ? m : 0;
  }

  /** Salva l'azione scelta nel mini-modale HR → sync direct leaves + planner se applicabile. */
  protected saveMiniHrAction(): void {
    const empName = this.miniHrModalEmpName();
    const iso = this.miniHrModalDate();
    const action = this.miniHrModalAction();
    if (!empName || !iso) {
      this.pushToast('Seleziona dipendente e data.', 'error');
      return;
    }
    const emp = this.allCashOperators().find(o => o.name === empName);
    if (!emp) {
      this.pushToast('Dipendente non trovato.', 'error');
      return;
    }
    const leavesArr: any[] = Array.isArray((emp as any).leaves) ? [...(emp as any).leaves] : [];

    if (action === 'straordinario') {
      // Inserisce pattern [straordinario 08:30-17:00] nel planner del mese, se data presente.
      const ok = this._injectPlannerExtraShiftByName(empName, iso, '08:30', '17:00', '13:00', '14:00');
      this.pushToast(
        ok ? `Turno straordinario inserito per ${empName} · ${iso}.`
          : `Turno straordinario salvato in ${empName} (planner non aggiornato: data fuori mese corrente).`,
        'success'
      );
    } else {
      // azione: ferie | malattia | permesso
      const hours = action === 'permesso'
        ? Math.max(0, (this.hhmmToMinutes(this.miniHrModalPermitEnd()) - this.hhmmToMinutes(this.miniHrModalPermitStart())) / 60)
        : 8;
      const permitStart = action === 'permesso' ? this.hhmmToMinutes(this.miniHrModalPermitStart()) : null;
      const permitEnd = action === 'permesso' ? this.hhmmToMinutes(this.miniHrModalPermitEnd()) : null;
      const note = this.miniHrModalNote().trim();
      // Rimuovi entry leave duplicate per stessa data + tipo
      const filtered = leavesArr.filter((l: any) =>
        !(l.startDate === iso && l.type === action)
      );
      filtered.push({
        id: `hr-quick-${action}-${iso}-${Date.now()}`,
        type: action,
        startDate: iso,
        endDate: iso,
        startTimeMinutes: permitStart,
        endTimeMinutes: permitEnd,
        hours: action === 'permesso' ? (hours > 0 && hours < 8 ? hours : null) : null,
        reason: note || null,
      } as any);
      const payloadToSave: any = { ...(emp as any), leaves: filtered };
      this.data.updateCashOperator(payloadToSave);
      const actionLabel = action === 'ferie' ? 'Ferie' : action === 'malattia' ? 'Malattia' :
        (hours > 0 ? `Permesso ${hours}h` : 'Permesso');
      this.pushToast(`${actionLabel} salvato per ${empName} · ${iso}.`, 'success');
    }
    this.closeMiniHrModal();
  }

  /** Inietta un turno extra (straordinario) nel planner del dipendente per la data data. */
  private _injectPlannerExtraShiftByName(empName: string, isoDate: string, startHH: string, endHH: string, brkFrom: string, brkTo: string): boolean {
    const emp = this.allCashOperators().find(o => o.name === empName);
    if (!emp) return false;
    const currentPatterns: string[][] = Array.isArray((emp as any).shiftPatterns) ? (emp as any).shiftPatterns : [];
    // Copia profonda
    const nextPatterns: string[][] = currentPatterns.map(week => week.map(cell => cell ?? ''));
    if (!nextPatterns.length) {
      nextPatterns.push(Array.from({ length: 7 }, () => '')); // 1 settimana vuota iniziale
    }
    // Trova weekIndex + dayKey per la data
    const anchor = this.plannerMonthAnchor() || this.startOfMonthIso(isoDate);
    const anchorDate = this.parseIsoDate(anchor);
    const firstDay = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const firstWeekday = firstDay.getDay();
    const mondayOffset = firstWeekday === 0 ? -6 : 1 - firstWeekday;
    const firstMonday = new Date(firstDay);
    firstMonday.setDate(firstDay.getDate() + mondayOffset);
    const targetDate = this.parseIsoDate(isoDate);
    const msPerDay = 86_400_000;
    const daysDiff = Math.round((targetDate.getTime() - firstMonday.getTime()) / msPerDay);
    if (daysDiff < 0 || daysDiff >= 7 * this.plannerMaxWeeks) {
      return false; // fuori dalle settimane gestite → non si inietta
    }
    const weekIndex = Math.floor(daysDiff / 7);
    const dayOffset = daysDiff % 7;
    const keys: EmployeeShiftDayKey[] = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
    const dayKey = keys[dayOffset];
    while (nextPatterns.length <= weekIndex) {
      nextPatterns.push(Array.from({ length: 7 }, () => ''));
    }
    const cellText = `[straordinario ${startHH}-${endHH} (${brkFrom}-${brkTo})]`;
    nextPatterns[weekIndex][keys.indexOf(dayKey)] = cellText;
    const payloadToSave: any = { ...(emp as any), shiftPatterns: nextPatterns };
    this.data.updateCashOperator(payloadToSave);
    return true;
  }

  // Helper: calcola la data ISO di una cella planner (weekIndex + dayKey)
  // Ritorna null se plannerMonthAnchor non è impostato
  protected plannerIsoDateForCell(weekIndex: number, dayKey: EmployeeShiftDayKey): string | null {
    const anchor = this.plannerMonthAnchor();
    if (!anchor) return null;
    const anchorDate = this.parseIsoDate(anchor);
    const firstDay = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const firstWeekday = firstDay.getDay();
    const mondayOffset = firstWeekday === 0 ? -6 : 1 - firstWeekday;
    const firstMonday = new Date(firstDay);
    firstMonday.setDate(firstDay.getDate() + mondayOffset);
    const weekdayOrder: EmployeeShiftDayKey[] = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
    const offsetDays = weekIndex * 7 + weekdayOrder.indexOf(dayKey);
    const cellDate = new Date(firstMonday);
    cellDate.setDate(firstMonday.getDate() + offsetDays);
    return this.toIsoDate(cellDate);
  }

  // Helper: indice slot 30min a partire da minuti (Math non accessibile nel template)
  protected plannerSlotIndex(mins: number | null | undefined): number {
    if (mins == null) return 0;
    return Math.max(0, Math.min(this.planner30MinSlots.length - 1, Math.floor(mins / 30)));
  }

  // Applica il preset alla cella correntemente selezionata (dall'editor)
  protected plannerApplyPresetToSelected(presetKey: string): void {
    const sel = this.plannerSelectedCell();
    if (!sel) return;
    this.plannerApplyPreset(sel.employeeId, sel.weekIndex, sel.dayKey, presetKey);
    const preset = this.plannerShiftPresets.find((p) => p.key === presetKey);
    if (preset) {
      this.plannerEditorTmp.set({ start: preset.start, end: preset.end === '13:00 15:00 19:00' ? '19:00' : preset.end, hasBreak: true, breakFrom: preset.breakFrom, breakTo: preset.breakTo });
    }
  }

  // Quattro handler per i campi custom dell'editor: ognuno aggiorna plannerEditorTmp e salva subito sul record
  protected plannerEditorSetStart(value: string): void {
    const next = { ...this.plannerEditorTmp(), start: value };
    this.plannerEditorTmp.set(next);
    const sel = this.plannerSelectedCell();
    if (!sel) return;
    this.plannerApplyCustom(sel.employeeId, sel.weekIndex, sel.dayKey, next.start, next.end, next.breakFrom, next.breakTo, next.hasBreak);
  }
  protected plannerEditorSetEnd(value: string): void {
    const next = { ...this.plannerEditorTmp(), end: value };
    this.plannerEditorTmp.set(next);
    const sel = this.plannerSelectedCell();
    if (!sel) return;
    this.plannerApplyCustom(sel.employeeId, sel.weekIndex, sel.dayKey, next.start, next.end, next.breakFrom, next.breakTo, next.hasBreak);
  }
  protected plannerEditorSetBreakToggle(checked: boolean): void {
    const next = { ...this.plannerEditorTmp(), hasBreak: checked };
    this.plannerEditorTmp.set(next);
    const sel = this.plannerSelectedCell();
    if (!sel) return;
    this.plannerApplyCustom(sel.employeeId, sel.weekIndex, sel.dayKey, next.start, next.end, next.breakFrom, next.breakTo, next.hasBreak);
  }
  protected plannerEditorSetBreakFrom(value: string): void {
    const next = { ...this.plannerEditorTmp(), breakFrom: value, hasBreak: true };
    this.plannerEditorTmp.set(next);
    const sel = this.plannerSelectedCell();
    if (!sel) return;
    this.plannerApplyCustom(sel.employeeId, sel.weekIndex, sel.dayKey, next.start, next.end, next.breakFrom, next.breakTo, next.hasBreak);
  }
  protected plannerEditorSetBreakTo(value: string): void {
    const next = { ...this.plannerEditorTmp(), breakTo: value, hasBreak: true };
    this.plannerEditorTmp.set(next);
    const sel = this.plannerSelectedCell();
    if (!sel) return;
    this.plannerApplyCustom(sel.employeeId, sel.weekIndex, sel.dayKey, next.start, next.end, next.breakFrom, next.breakTo, next.hasBreak);
  }

  // ══ Handler editor PERMESSO ORARIO (Task7) ══
  protected plannerPermitEditorSetStart(value: string): void {
    const next = { ...this.plannerPermitEditorTmp(), start: value };
    this.plannerPermitEditorTmp.set(next);
    const sel = this.plannerSelectedCell();
    if (!sel) return;
    this.plannerApplyPermitHours(sel.employeeId, sel.weekIndex, sel.dayKey, next.start, next.end);
  }
  protected plannerPermitEditorSetEnd(value: string): void {
    const next = { ...this.plannerPermitEditorTmp(), end: value };
    this.plannerPermitEditorTmp.set(next);
    const sel = this.plannerSelectedCell();
    if (!sel) return;
    this.plannerApplyPermitHours(sel.employeeId, sel.weekIndex, sel.dayKey, next.start, next.end);
  }
  // Calcola le ore e salva sul planner + sincronizza leave record
  protected plannerApplyPermitHours(
    employeeId: string,
    weekIndex: number,
    dayKey: EmployeeShiftDayKey,
    startHHMM: string,
    endHHMM: string,
  ): void {
    const startMin = this.hhmmToMinutes(startHHMM);
    const endMin = this.hhmmToMinutes(endHHMM);
    const hours = endMin > startMin ? Math.round(((endMin - startMin) / 60) * 10) / 10 : 0;
    this.plannerSaveCell(employeeId, weekIndex, dayKey, {
      tone: 'permesso',
      startMinutes: null,
      endMinutes: null,
      breakStart: null,
      breakEnd: null,
      permitStartMinutes: startMin,
      permitEndMinutes: endMin,
      permitHours: hours,
    });
  }

  // ══ Helper TEMPLATE per calcolare i minuti di un permesso (Task7: usato in HTML @let) ══
  protected plannerPermitMinutesCalc(
    currentStartMin: number | null | undefined,
    currentEndMin: number | null | undefined,
    tmpStart: string,
    tmpEnd: string,
  ): number {
    if (currentStartMin != null && currentEndMin != null && currentEndMin > currentStartMin) {
      return currentEndMin - currentStartMin;
    }
    if (tmpStart && tmpEnd) {
      const s = this.hhmmToMinutes(tmpStart);
      const e = this.hhmmToMinutes(tmpEnd);
      return e > s ? e - s : 0;
    }
    return 0;
  }

  protected readonly plannerTotalWeeks = computed(() => {
    const operators = this.allCashOperators();
    if (!operators.length) return Math.max(this.plannerShiftWeeksFromAnchor().length, 1);
    let maxLen = 1;
    for (const op of operators) {
      if (op.shiftPatterns?.length > maxLen) maxLen = op.shiftPatterns.length;
    }
    return Math.max(1, Math.min(this.plannerMaxWeeks, maxLen));
  });

  protected plannerShiftWeeksFromAnchor(): { label: string; index: number; startDate?: string }[] {
    const weeks: { label: string; index: number; startDate?: string }[] = [];
    const total = Math.max(1, this.plannerTotalWeeks());
    for (let i = 0; i < total; i++) {
      weeks.push({
        label: `Settimana ${i + 1}`,
        index: i,
        startDate: undefined,
      });
    }
    // Se è impostata la data di inizio mese calcola il lunedì
    // della prima settimana e poi tutte le settimane seguenti.
    if (this.plannerMonthAnchor()) {
      const anchor = this.parseIsoDate(this.plannerMonthAnchor());
      const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const firstWeekday = firstDay.getDay();
      const mondayOffset = firstWeekday === 0 ? -6 : 1 - firstWeekday;
      const firstMonday = new Date(firstDay);
      firstMonday.setDate(firstDay.getDate() + mondayOffset);
      for (let i = 0; i < weeks.length; i++) {
        const monday = new Date(firstMonday);
        monday.setDate(firstMonday.getDate() + i * 7);
        weeks[i].startDate = `${monday.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' })}`;
      }
    }
    return weeks;
  }

  private hhmmToMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map((part) => Number(part));
    if (Number.isNaN(h) || Number.isNaN(m)) return 0;
    return Math.max(0, Math.min(24 * 60, h * 60 + m));
  }

  private minutesToHHMM(totalMinutes: number | null): string {
    if (totalMinutes == null) return '';
    const clamped = Math.max(0, Math.min(24 * 60, Math.round(totalMinutes / 30) * 30));
    return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
  }

  private plannerEmptyWeek(): Record<EmployeeShiftDayKey, string> {
    return { lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' };
  }

  // Parsa il testo shift già salvato nel pattern in una PlannerShiftCell
  // per renderizzare badge e orari in griglia.
  protected plannerParseCell(employee: CashOperatorRecord, weekIndex: number, dayKey: EmployeeShiftDayKey): PlannerShiftCell {
    const patterns = employee.shiftPatterns ?? [];
    const pattern = patterns[weekIndex] ?? this.plannerEmptyWeek();
    const raw = (pattern[dayKey] ?? '').trim();
    const cell: PlannerShiftCell = {
      tone: 'standard',
      startMinutes: null,
      endMinutes: null,
      breakStart: null,
      breakEnd: null,
      permitStartMinutes: null,
      permitEndMinutes: null,
      permitHours: null,
    };
    if (!raw) return cell;
    const toneMatch = raw.match(/^\[(ferie|permesso|malattia|riposo)\]\s*(.*)$/i);
    if (toneMatch) {
      const tone = toneMatch[1].toLowerCase() as PlannerLeaveTone;
      cell.tone = tone;
      // Task7: Parser permesso orario formato: [permesso 09:00-11:00]
      if (tone === 'permesso') {
        const timePart = (toneMatch[2] ?? '').trim();
        const rangeMatch = timePart.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
        if (rangeMatch) {
          const sMin = this.hhmmToMinutes(rangeMatch[1]);
          const eMin = this.hhmmToMinutes(rangeMatch[2]);
          cell.permitStartMinutes = sMin;
          cell.permitEndMinutes = eMin;
          cell.permitHours = eMin > sMin ? Math.round(((eMin - sMin) / 60) * 10) / 10 : 0;
        }
      }
      return cell;
    }
    const parsed = this.parseShiftText(raw);
    if (!parsed.startHour || !parsed.endHour) {
      // Testo custom non riconosciuto come turno strutturato:
      // restituisco standard con valori null per fallback.
      return cell;
    }
    cell.startMinutes = Number(parsed.startHour) * 60 + Number(parsed.startMinute);
    cell.endMinutes = Number(parsed.endHour) * 60 + Number(parsed.endMinute);
    if (parsed.hasBreak && parsed.breakFromHour && parsed.breakToHour) {
      cell.breakStart = Number(parsed.breakFromHour) * 60 + Number(parsed.breakFromMinute);
      cell.breakEnd = Number(parsed.breakToHour) * 60 + Number(parsed.breakToMinute);
    }
    return cell;
  }

  // Salvataggio di una cella nel corrispondente shiftPatterns[weekIndex][dayKey]
  private plannerSaveCell(employeeId: string, weekIndex: number, dayKey: EmployeeShiftDayKey, next: PlannerShiftCell): void {
    const employee = this.allCashOperators().find((op) => op.id === employeeId);
    if (!employee) return;
    const currentPatterns = [...(employee.shiftPatterns ?? [])];
    while (currentPatterns.length <= weekIndex) {
      currentPatterns.push(this.plannerEmptyWeek());
    }
    let serialized = '';
    if (next.tone !== 'standard') {
      // Task7: serializza permesso orario se presente [permesso 09:00-11:00]
      if (next.tone === 'permesso' && next.permitStartMinutes != null && next.permitEndMinutes != null && (next.permitHours ?? 0) > 0) {
        const sHhmm = this.minutesToHHMM(next.permitStartMinutes);
        const eHhmm = this.minutesToHHMM(next.permitEndMinutes);
        serialized = `[${next.tone} ${sHhmm}-${eHhmm}]`;
      } else {
        serialized = `[${next.tone}]`;
      }
    } else if (next.startMinutes != null && next.endMinutes != null) {
      const draft: EmployeeShiftDraft = {
        ...this.emptyEmployeeShiftDraft(),
        startHour: String(Math.floor(next.startMinutes / 60)).padStart(2, '0'),
        startMinute: String(next.startMinutes % 60).padStart(2, '0'),
        endHour: String(Math.floor(next.endMinutes / 60)).padStart(2, '0'),
        endMinute: String(next.endMinutes % 60).padStart(2, '0'),
        hasBreak: next.breakStart != null && next.breakEnd != null,
        breakFromHour: next.breakStart != null ? String(Math.floor(next.breakStart / 60)).padStart(2, '0') : '00',
        breakFromMinute: next.breakStart != null ? String(next.breakStart % 60).padStart(2, '0') : '00',
        breakToHour: next.breakEnd != null ? String(Math.floor(next.breakEnd / 60)).padStart(2, '0') : '00',
        breakToMinute: next.breakEnd != null ? String(next.breakEnd % 60).padStart(2, '0') : '00',
      };
      serialized = this.formatShiftDraft(draft);
    }
    const weekPattern = { ...currentPatterns[weekIndex] };
    weekPattern[dayKey] = serialized;
    currentPatterns[weekIndex] = weekPattern;

    // Task7: Sincronizza con employee.leaves (source of truth per report/agenda)
    const iso = this.plannerIsoDateForCell(weekIndex, dayKey);
    let updatedLeaves = [...((employee as any).leaves ?? [])];
    if (iso) {
      // Rimuovi eventuali leave di questo dipendente per questa data (ri-sincronizza)
      updatedLeaves = updatedLeaves.filter((l: any) => !(l.startDate <= iso && iso <= (l.endDate || l.startDate) && (l.type === next.tone || (l.type === 'ferie' || l.type === 'malattia' || l.type === 'permesso'))));
      if (next.tone === 'ferie' || next.tone === 'malattia' || next.tone === 'permesso') {
        const newLeave: any = {
          id: `${employeeId}-${iso}-${next.tone}-${Date.now()}`,
          employeeId: employeeId,
          employeeName: employee.name,
          type: next.tone,
          startDate: iso,
          endDate: iso,
          visibleStart: iso,
          visibleEnd: iso,
          startTimeMinutes: next.permitStartMinutes ?? null,
          endTimeMinutes: next.permitEndMinutes ?? null,
          hours: next.permitHours ?? null,
          note: next.tone === 'permesso' && (next.permitHours ?? 0) > 0 ? `Permesso ${this.minutesToHHMM(next.permitStartMinutes!)}-${this.minutesToHHMM(next.permitEndMinutes!)} (${next.permitHours}h)` : '',
        };
        updatedLeaves.push(newLeave);
      }
    }

    const payloadToSave: any = {
      ...(employee as any),
      shiftPatterns: currentPatterns,
      leaves: updatedLeaves,
    };
    this.data.updateCashOperator(payloadToSave);
  }

  protected plannerSetCellTone(
    employeeId: string,
    weekIndex: number,
    dayKey: EmployeeShiftDayKey,
    tone: PlannerLeaveTone,
  ): void {
    const employee = this.allCashOperators().find((op) => op.id === employeeId);
    if (!employee) return;
    if (tone === 'standard') {
      // Ripristino il turno precedente del pattern
      const preset = this.plannerShiftPresets[0];
      const base: PlannerShiftCell = {
        tone: 'standard',
        startMinutes: this.hhmmToMinutes(preset.start),
        endMinutes: this.hhmmToMinutes(preset.end),
        breakStart: this.hhmmToMinutes(preset.breakFrom),
        breakEnd: this.hhmmToMinutes(preset.breakTo),
      };
      this.plannerSaveCell(employeeId, weekIndex, dayKey, base);
      return;
    }
    this.plannerSaveCell(employeeId, weekIndex, dayKey, {
      tone,
      startMinutes: null,
      endMinutes: null,
      breakStart: null,
      breakEnd: null,
    });
  }

  protected plannerApplyPreset(
    employeeId: string,
    weekIndex: number,
    dayKey: EmployeeShiftDayKey,
    presetKey: string,
  ): void {
    const preset = this.plannerShiftPresets.find((item) => item.key === presetKey);
    if (!preset) return;
    this.plannerSaveCell(employeeId, weekIndex, dayKey, {
      tone: 'standard',
      startMinutes: this.hhmmToMinutes(preset.start),
      endMinutes: this.hhmmToMinutes(preset.end),
      breakStart: this.hhmmToMinutes(preset.breakFrom),
      breakEnd: this.hhmmToMinutes(preset.breakTo),
    });
  }

  protected plannerApplyCustom(
    employeeId: string,
    weekIndex: number,
    dayKey: EmployeeShiftDayKey,
    startHHMM: string,
    endHHMM: string,
    breakFromHHMM: string,
    breakToHHMM: string,
    hasBreak: boolean,
  ): void {
    this.plannerSaveCell(employeeId, weekIndex, dayKey, {
      tone: 'standard',
      startMinutes: startHHMM ? this.hhmmToMinutes(startHHMM) : null,
      endMinutes: endHHMM ? this.hhmmToMinutes(endHHMM) : null,
      breakStart: hasBreak && breakFromHHMM ? this.hhmmToMinutes(breakFromHHMM) : null,
      breakEnd: hasBreak && breakToHHMM ? this.hhmmToMinutes(breakToHHMM) : null,
    });
  }

  protected plannerClearCell(employeeId: string, weekIndex: number, dayKey: EmployeeShiftDayKey): void {
    const employee = this.allCashOperators().find((op) => op.id === employeeId);
    if (!employee) return;
    const currentPatterns = [...(employee.shiftPatterns ?? [])];
    while (currentPatterns.length <= weekIndex) {
      currentPatterns.push(this.plannerEmptyWeek());
    }
    currentPatterns[weekIndex] = { ...currentPatterns[weekIndex], [dayKey]: '' };
    this.data.updateCashOperator({ ...employee, shiftPatterns: currentPatterns });
  }

  protected plannerFormatCell(cell: PlannerShiftCell): string {
    if (cell.tone !== 'standard') {
      return this.plannerLeaveTones.find((item) => item.tone === cell.tone)?.label ?? '';
    }
    if (cell.startMinutes == null || cell.endMinutes == null) return '';
    let out = `${this.minutesToHHMM(cell.startMinutes)}–${this.minutesToHHMM(cell.endMinutes)}`;
    if (cell.breakStart != null && cell.breakEnd != null) {
      out += ` · 🥪 ${this.minutesToHHMM(cell.breakStart)}–${this.minutesToHHMM(cell.breakEnd)}`;
    }
    return out;
  }

  protected plannerCellToneClass(cell: PlannerShiftCell): string {
    switch (cell.tone) {
      case 'ferie': return 'tone-ferie';
      case 'permesso': return 'tone-permesso';
      case 'malattia': return 'tone-malattia';
      case 'riposo': return 'tone-riposo';
      default:
        if (cell.startMinutes != null && cell.endMinutes != null) return 'tone-standard';
        return 'tone-empty';
    }
  }

  protected plannerWeekToneLabel(cell: PlannerShiftCell): string {
    if (cell.tone !== 'standard') return this.plannerLeaveTones.find((t) => t.tone === cell.tone)?.label ?? '';
    if (cell.startMinutes != null && cell.endMinutes != null) return 'Turno';
    return 'Vuoto';
  }

  // ─── Gestione multi-settimana ───
  protected plannerAddWeek(): void {
    const currentTotal = this.plannerTotalWeeks();
    if (currentTotal >= this.plannerMaxWeeks) return;
    for (const op of this.allCashOperators()) {
      const patterns = [...(op.shiftPatterns ?? [])];
      while (patterns.length <= currentTotal) {
        // Prova ad usare i turni standard del profilo del dipendente, se popolati
        const defaults = op.defaultWeeklyShift;
        const hasDefaults =
          defaults &&
          Object.values(defaults).some((v) => typeof v === 'string' && v.trim().length > 0);
        patterns.push(hasDefaults ? { ...defaults } : this.plannerEmptyWeek());
      }
      this.data.updateCashOperator({ ...op, shiftPatterns: patterns });
    }
    this.plannerActiveWeekIndex.set(currentTotal);
    this.pushToast('Nuova settimana aggiunta (turni standard applicati se configurati)', 'success');
  }

  protected plannerRemoveWeek(index: number): void {
    if (index <= 0) return; // la settimana 1 non si cancella
    for (const op of this.allCashOperators()) {
      const patterns = [...(op.shiftPatterns ?? [])];
      if (patterns.length <= index) continue;
      patterns.splice(index, 1);
      this.data.updateCashOperator({ ...op, shiftPatterns: patterns });
    }
    this.plannerActiveWeekIndex.update((current) => (current >= index ? index - 1 : current));
  }

  protected plannerCopyFromPreviousWeek(targetWeekIndex: number): void {
    if (targetWeekIndex <= 0) return;
    const sourceIndex = targetWeekIndex - 1;
    for (const op of this.allCashOperators()) {
      const patterns = [...(op.shiftPatterns ?? [])];
      while (patterns.length <= targetWeekIndex) patterns.push(this.plannerEmptyWeek());
      patterns[targetWeekIndex] = { ...(patterns[sourceIndex] ?? this.plannerEmptyWeek()) };
      this.data.updateCashOperator({ ...op, shiftPatterns: patterns });
    }
  }

  protected plannerApplyMonthAnchor(value: string): void {
    this.plannerMonthAnchor.set(value);
  }

  protected plannerTotalMinutesForCell(cell: PlannerShiftCell): number {
    if (cell.tone !== 'standard') return 0;
    if (cell.startMinutes == null || cell.endMinutes == null) return 0;
    let work = cell.endMinutes - cell.startMinutes;
    if (cell.breakStart != null && cell.breakEnd != null) {
      work -= Math.max(0, cell.breakEnd - cell.breakStart);
    }
    return Math.max(0, work);
  }

  // helper per etichetta badge ore nella cella
  protected plannerHoursBadge(cell: PlannerShiftCell): string {
    const mins = this.plannerTotalMinutesForCell(cell);
    if (!mins) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h${m}m` : `${h}h`;
  }

  // ─── Utility per i controlli rapidi (step 30min)
  protected plannerPrevSlot(hhmm: string): string {
    if (!hhmm) return '09:00';
    let total = this.hhmmToMinutes(hhmm) - 30;
    if (total < 0) total = 0;
    return this.minutesToHHMM(total);
  }
  protected plannerNextSlot(hhmm: string): string {
    if (!hhmm) return '09:00';
    let total = this.hhmmToMinutes(hhmm) + 30;
    if (total > 24 * 60) total = 24 * 60;
    return this.minutesToHHMM(total);
  }
  protected readonly employeeLeaveForm = this.formBuilder.group({
    employeeId: ['', Validators.required],
    leaveType: ['ferie' as EmployeeLeaveRecord['leaveType'], Validators.required],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    note: [''],
    returnShiftPatternIndex: this.formBuilder.control<number | null>(null),
  }, {
    // ✅ Fix ISS-07: validatore cross-field data fine >= data inizio
    validators: [
      (group) => {
        const start = group.get('startDate')?.value as string | undefined;
        const end = group.get('endDate')?.value as string | undefined;
        if (start && end && new Date(end) < new Date(start)) {
          return { leaveEndBeforeStart: true };
        }
        return null;
      },
    ],
  });
  protected readonly employeeAttendanceForm = this.formBuilder.nonNullable.group({
    status: this.formBuilder.nonNullable.control<EmployeeAttendanceRecord['status']>('lavorato'),
    actualStartTime: [''],
    actualEndTime: [''],
    breakMinutes: [0],
    note: [''],
  });
  protected readonly teamShiftOverview = computed(() =>
    this.allCashOperators().map((employee) => ({
      employee,
      days: this.weeklyShiftDays.map((day) => ({
        ...day,
        shift: employee.shiftPatterns?.[0]?.[day.key] ?? '',
      })),
    })),
  );
  protected readonly upcomingEmployeeLeaves = computed(() =>
    [...this.employeeLeaves()]
      .sort((left, right) =>
        `${left.startDate}${left.employeeName}`.localeCompare(`${right.startDate}${right.employeeName}`),
      )
      .slice(0, 12),
  );
  protected readonly employeeScheduleRange = computed(() => {
    if (this.employeeScheduleView() === 'mese') {
      const from = this.startOfMonthIso(this.employeeScheduleMonth());
      const to = this.endOfMonthIso(this.employeeScheduleMonth());
      return {
        from,
        to,
        label: this.formatMonthYearLabel(from),
      };
    }

    const from = this.employeePeriodFrom() || this.startOfMonthIso(this.toIsoDate(new Date()));
    const to = this.employeePeriodTo() || this.endOfMonthIso(from);
    const normalized = this.normalizeIsoRange(from, to);
    return {
      from: normalized.from,
      to: normalized.to,
      label: `${this.formatIsoDateLabel(normalized.from)} - ${this.formatIsoDateLabel(normalized.to)}`,
    };
  });
  protected readonly filteredEmployeeLeavesByRange = computed<EmployeeFilteredLeaveEntry[]>(() => {
    const { from, to } = this.employeeScheduleRange();
    const leaveType = this.employeeLeaveTypeFilter();
    const employeeId = this.employeeLeaveEmployeeFilter();

    return [...this.employeeLeaves()]
      .filter((leave) => {
        if (leaveType !== 'tutte' && leave.leaveType !== leaveType) {
          return false;
        }

        if (employeeId !== 'tutti' && leave.employeeId !== employeeId) {
          return false;
        }

        return this.isoRangesOverlap(leave.startDate, leave.endDate, from, to);
      })
      .map((leave) => ({
        ...leave,
        visibleStart: this.maxIsoDate(leave.startDate, from),
        visibleEnd: this.minIsoDate(leave.endDate, to),
        daysInRange: this.countInclusiveIsoDays(this.maxIsoDate(leave.startDate, from), this.minIsoDate(leave.endDate, to)),
        overlapsOutsideRange: leave.startDate < from || leave.endDate > to,
      }))
      .sort((left, right) =>
        `${left.visibleStart}${left.employeeName}`.localeCompare(`${right.visibleStart}${right.employeeName}`),
      );
  });
  protected readonly employeeScheduleSummary = computed(() => {
    const leaves = this.filteredEmployeeLeavesByRange();
    const rows = this.employeeAttendanceRegisterRows();

    return {
      employees: rows.length,
      records: leaves.length,
      days: leaves.reduce((sum, leave) => sum + leave.daysInRange, 0),
      ferie: leaves.filter((leave) => leave.leaveType === 'ferie').reduce((sum, leave) => sum + leave.daysInRange, 0),
      permessi: leaves.filter((leave) => leave.leaveType === 'permesso').reduce((sum, leave) => sum + leave.daysInRange, 0),
      malattie: leaves.filter((leave) => leave.leaveType === 'malattia').reduce((sum, leave) => sum + leave.daysInRange, 0),
      workedMinutes: rows.reduce((sum, row) => sum + row.totalWorkedMinutes, 0),
      overtimeMinutes: rows.reduce((sum, row) => sum + row.totalOvertimeMinutes, 0),
    };
  });
  protected readonly employeeRegisterDays = computed<EmployeeRegisterDayMeta[]>(() => {
    const range = this.employeeScheduleRange();
    return this.expandDateRange(range.from, range.to).map((isoDate) => {
      const date = this.parseIsoDate(isoDate);
      const dayOfWeek = date.getDay();
      return {
        isoDate,
        dayNumber: date.getDate(),
        weekdayLabel: this.weeklyShiftDays.find((day) => day.key === this.weekdayKeyFromDate(date))?.label ?? '',
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      };
    });
  });
  protected readonly payrollEmployees = computed(() => {
    const filter = this.employeeLeaveEmployeeFilter();
    return this.allCashOperators().filter(
      (employee) =>
        employee.employmentType === 'dipendente' &&
        employee.active &&
        (filter === 'tutti' || employee.id === filter),
    );
  });
  protected readonly employeeAttendanceRegisterRows = computed<EmployeeAttendanceRegisterRow[]>(() =>
    this.payrollEmployees().map((employee) => {
      const days = this.employeeRegisterDays().map((day) => {
        const resolved = this.resolveEmployeeAttendance(employee, day.isoDate);
        return {
          ...resolved,
          dayNumber: day.dayNumber,
          weekdayLabel: day.weekdayLabel,
          isWeekend: day.isWeekend,
          primaryLabel: this.employeeAttendancePrimaryLabel(resolved),
          secondaryLabel: this.employeeAttendanceSecondaryLabel(resolved),
          tone: this.employeeAttendanceTone(resolved),
        } satisfies EmployeeAttendanceRegisterCell;
      });

      return {
        employee,
        days,
        totalWorkedMinutes: days.reduce((sum, day) => sum + day.workedMinutes, 0),
        totalOvertimeMinutes: days.reduce((sum, day) => sum + day.overtimeMinutes, 0),
        totalLeaveDays: days.filter((day) => day.isLeave).length,
      };
    }),
  );
  protected readonly selectedAttendanceContext = computed(() => {
    const employeeId = this.selectedAttendanceEmployeeId();
    const date = this.selectedAttendanceDate();
    if (!employeeId || !date) {
      return null;
    }

    const employee = this.allCashOperators().find((item) => item.id === employeeId);
    if (!employee) {
      return null;
    }

    return this.resolveEmployeeAttendance(employee, date);
  });
  protected readonly employeeMonthCalendarDays = computed<EmployeeCalendarDayCell[]>(() => {
    const monthAnchor = this.parseIsoDate(this.employeeScheduleMonth());
    const monthStart = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
    const firstWeekday = monthStart.getDay();
    const mondayOffset = firstWeekday === 0 ? -6 : 1 - firstWeekday;
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() + mondayOffset);

    const filteredLeaves = this.filteredEmployeeLeavesByRange();
    const visibleEmployees =
      this.employeeLeaveEmployeeFilter() === 'tutti'
        ? this.allCashOperators()
        : this.allCashOperators().filter((employee) => employee.id === this.employeeLeaveEmployeeFilter());

    return Array.from({ length: 42 }, (_, index) => {
      const current = new Date(gridStart);
      current.setDate(gridStart.getDate() + index);
      const isoDate = this.toIsoDate(current);
      const weekdayKey = this.weekdayKeyFromDate(current);
      const dayLeaves = filteredLeaves.filter((leave) => isoDate >= leave.visibleStart && isoDate <= leave.visibleEnd);
      const scheduledCount = visibleEmployees.filter((employee) => (this.getShiftForDate(employee, isoDate) ?? '').trim()).length;

      return {
        isoDate,
        dayNumber: String(current.getDate()).padStart(2, '0'),
        weekdayLabel: this.weeklyShiftDays.find((day) => day.key === weekdayKey)?.label ?? '',
        isCurrentMonth: current.getMonth() === monthAnchor.getMonth(),
        scheduledCount,
        absentCount: dayLeaves.length,
        leaves: dayLeaves,
      };
    });
  });
  protected readonly agendaLeaveEvents = computed(() =>
    this.employeeLeaves().flatMap((leave) =>
      this.expandDateRange(leave.startDate, leave.endDate).map((isoDate) => ({
        ...leave,
        isoDate,
      })),
    ),
  );
  protected readonly cashFiscalSettings = this.data.cashFiscalSettings;
  protected readonly companyProfile = this.data.companyProfile;
  protected readonly confirmedQuotes = computed(() => {
    const cashTransactions = this.allCashTransactions();
    return this.allQuotes().filter((quote) => {
      if (quote.stage !== 'ordine' && quote.stage !== 'confermato') {
        return false;
      }

      const relatedTransactions = cashTransactions.filter((tx) => tx.linkedQuoteId === quote.id);
      if (relatedTransactions.length === 0) {
        return true;
      }

      return relatedTransactions.some((tx) => tx.status === 'insoluto' || tx.status === 'sospeso');
    });
  });
  protected readonly cashHasOffReceiptItems = computed(() =>
    this.cashCart().some((line) => line.excludeFromReceipt),
  );

  // Regola speciale: in pagamento MISTO la quota in CONTANTI deve coprire
  // OBBLIGATORIAMENTE almeno il totale delle voci fuori scontrino.
  // Perché le voci fuori scontrino non possono essere pagate elettronicamente
  // (non c'è tracciabilità sullo scontrino fiscale, quindi devono risultare
  // come incasso contanti "a mano" extra).
  protected readonly cashMixedCashCoversOffReceipt = computed(() => {
    if (!this.cashHasOffReceiptItems()) return true;
    if (this.cashPaymentMethod() !== 'misto') return true;
    return Number(this.cashMixedCashAmount().toFixed(2)) >= Number(this.cashHiddenReceiptTotal().toFixed(2));
  });
  protected readonly cashEffectiveTotal = computed(() => {
    const pendingTx = this.cashPendingTransaction();
    if (pendingTx) {
      return Math.max(pendingTx.total - (pendingTx.receivedAmount || 0), 0);
    }
    return Math.max(this.cashSubtotal() - this.cashDiscountAmount(), 0);
  });
  protected readonly cashPendingTransactions = computed(() =>
    this.allCashTransactions().filter((transaction) => transaction.status !== 'pagato'),
  );
  protected readonly cashPendingSummaryByClientId = computed(() => {
    const grouped = new Map<string, { total: number; count: number }>();

    for (const transaction of this.cashPendingTransactions()) {
      if (!transaction.clientId) {
        continue;
      }

      const current = grouped.get(transaction.clientId) ?? { total: 0, count: 0 };
      current.total += transaction.total - (transaction.receivedAmount || 0);
      current.count += 1;
      grouped.set(transaction.clientId, current);
    }

    return grouped;
  });
  protected readonly cashPendingTransaction = computed(
    () =>
      this.allCashTransactions().find((transaction) => transaction.id === this.cashPendingTransactionId()) ??
      null,
  );
  protected readonly cashIsSettlingPending = computed(() => !!this.cashPendingTransaction());
  protected readonly cashSelectedClientPendingTransactions = computed(() => {
    const clientId = this.selectedCashClientId();
    if (!clientId) {
      return [];
    }
    return this.cashPendingTransactions().filter((transaction) => transaction.clientId === clientId);
  });
  protected readonly cashSelectedClientPendingTotal = computed(() =>
    this.cashSelectedClientPendingTransactions().reduce((sum, transaction) => sum + (transaction.total - (transaction.receivedAmount || 0)), 0),
  );
  protected readonly cashHasSessionContent = computed(() => this.currentCashSessionHasContent());
  protected readonly cashCanQueueCurrentSession = computed(
    () => this.cashHasSessionContent() && !this.cashIsSettlingPending(),
  );
  protected readonly cashMixedDifference = computed(() =>
    Number((this.cashEffectiveTotal() - this.cashMixedCashAmount() - this.cashMixedElectronicAmount()).toFixed(2)),
  );
  protected readonly cashMixedIsValid = computed(() =>
    this.cashPaymentMethod() !== 'misto'
      ? true
      : this.cashMixedCashAmount() >= 0 &&
      this.cashMixedElectronicAmount() >= 0 &&
      this.cashMixedElectronicMethod() !== null &&
      this.cashMixedDifference() === 0 &&
      this.cashEffectiveTotal() > 0,
  );
  protected readonly cashCanFinalizePaidSale = computed(() => {
    if (!this.cashCart().length && !this.cashIsSettlingPending()) {
      return false;
    }

    if (this.cashIsSettlingPending()) {
      if (!this.cashMixedIsValid()) return false;
      if (!this.cashMixedCashCoversOffReceipt()) return false;
      return true;
    }

    if (this.cashEffectiveTotal() <= 0) {
      return false;
    }

    // ═══════════════ REGOLE FUORI SCONTRINO ═══════════════
    if (this.cashHasOffReceiptItems()) {
      // (1) Metodi elettronici PURI (solo POS / solo Bonifico)
      //     = VIETATO emettere scontrino quando ci sono voci escluse,
      //     perché le voci fuori scontrino non possono essere
      //     tracciate come pagamento elettronico.
      if (this.cashPaymentMethod() === 'pos' || this.cashPaymentMethod() === 'bonifico') {
        return false;
      }

      // (2) Pagamento MISTO: la quota CONTANTI deve coprire
      //     OBBLIGATORIAMENTE il totale delle voci fuori scontrino.
      if (this.cashPaymentMethod() === 'misto' && !this.cashMixedCashCoversOffReceipt()) {
        return false;
      }
    }

    // (3) REGOLA UNIFICATA ricevuto >= dovuto per tutti i metodi.
    if (this.cashPaymentMethod() === 'misto') {
      return this.cashMixedIsValid();
    }

    return this.cashReceivedAmount() >= this.cashEffectiveTotal();
  });

  // Stato pagamento esposto al template (per colorazione dinamica colonna chiusura)
  public readonly cashIsPaymentSettled = computed(() => this.cashCanFinalizePaidSale());
  public readonly cashHasSessionTotal = computed(() => this.cashEffectiveTotal() > 0);
  protected readonly cashCanMarkAsInsoluto = computed(
    () => this.cashCart().length > 0 && !!this.selectedCashClientId() && !this.cashIsSettlingPending(),
  );

  protected readonly implementationPhases = computed(() => [
    `Attivare ${this.content().primaryAction.toLowerCase()} con dati reali e permessi dedicati`,
    `Collegare ${this.section().label.toLowerCase()} agli altri moduli già predisposti`,
    `Chiudere il flusso con storico, notifiche e controllo avanzamento`,
  ]);

  protected readonly filteredClients = computed(() => {
    const query = this.clientQuery().trim().toLowerCase();
    const statusFilter = this.clientStatusFilter();
    const privacyFilter = this.clientPrivacyFilter();
    const sortFilter = this.clientSortFilter();

    let result = [...this.allClients()]
      .filter((item) =>
        `${item.name} ${item.segment} ${item.city} ${item.phone} ${item.email} ${item.address} ${item.favoriteBrands} ${item.status}`
          .toLowerCase()
          .includes(query),
      )
      .filter((item) => (statusFilter === 'tutti' ? true : item.status === statusFilter))
      .filter((item) => {
        if (privacyFilter === 'tutti') return true;
        const isOk = item.privacyProfile.noticeAcknowledged;
        return privacyFilter === 'ok' ? isOk : !isOk;
      });

    result.sort((a, b) => {
      if (sortFilter === 'alfabetico-az') return a.name.localeCompare(b.name, 'it-IT');
      if (sortFilter === 'alfabetico-za') return b.name.localeCompare(a.name, 'it-IT');
      if (sortFilter === 'contatto-recente') return b.lastContact.localeCompare(a.lastContact);
      if (sortFilter === 'contatto-storico') return a.lastContact.localeCompare(b.lastContact);
      return 0;
    });

    return result.slice(0, 15);
  });

  protected readonly filteredQuotes = computed(() => {
    const query = this.quoteQuery().trim().toLowerCase();
    const stageFilter = this.quoteStageFilter();

    return [...this.allQuotes()]
      .filter((item) =>
        `${item.customerName} ${item.projectType} ${item.stage} ${item.value} ${item.dueDate}`
          .toLowerCase()
          .includes(query),
      )
      .filter((item) => {
        if (stageFilter === 'tutte') {
          return true;
        }
        if (stageFilter === 'ordine') {
          return item.stage === 'ordine' || item.stage === 'confermato';
        }
        return item.stage === stageFilter;
      })
      .slice(0, 40);
  });
  protected readonly ddtQuote = computed(
    () => this.allQuotes().find((quote) => quote.id === this.ddtQuoteId()) ?? null,
  );
  protected readonly ddtLines = computed(() => {
    const quote = this.ddtQuote();
    return (quote?.lines ?? []).filter((line) => line.kind === 'materiale');
  });
  protected readonly quoteTotalValue = computed(() =>
    this.filteredQuotes().reduce((total, quote) => total + quote.value, 0),
  );
  protected readonly quoteAverageValue = computed(() => {
    const quotes = this.filteredQuotes();
    if (!quotes.length) {
      return 0;
    }
    return this.quoteTotalValue() / quotes.length;
  });
  protected readonly dueQuotesCount = computed(
    () => this.filteredQuotes().filter((quote) => this.quoteDaysToDue(quote.dueDate) <= 7).length,
  );
  protected readonly quoteConversionRate = computed(() => {
    const quotes = this.allQuotes();
    if (!quotes.length) {
      return 0;
    }
    const confirmed = quotes.filter((quote) => quote.stage === 'ordine' || quote.stage === 'confermato').length;
    return Math.round((confirmed / quotes.length) * 100);
  });
  protected readonly quoteStageSummary = computed(() => {
    const quotes = this.allQuotes();
    const totalValue = quotes.reduce((total, quote) => total + quote.value, 0);
    const draftQuotes = quotes.filter((quote) => quote.stage === 'bozza');
    const negotiationQuotes = quotes.filter((quote) => quote.stage === 'trattativa');
    const readyQuotes = quotes.filter((quote) => quote.stage === 'ordine' || quote.stage === 'confermato');

    const draftValue = draftQuotes.reduce((total, quote) => total + quote.value, 0);
    const negotiationValue = negotiationQuotes.reduce((total, quote) => total + quote.value, 0);
    const readyValue = readyQuotes.reduce((total, quote) => total + quote.value, 0);

    return [
      {
        filter: 'tutte' as const,
        tone: 'all' as const,
        kicker: 'Vista completa',
        label: 'Archivio preventivi',
        count: quotes.length,
        value: totalValue,
        detail: 'Panoramica generale di offerte, revisioni e ordini.',
      },
      {
        filter: 'bozza' as const,
        tone: 'warning' as const,
        kicker: 'Da completare',
        label: 'Bozze da rifinire',
        count: draftQuotes.length,
        value: draftValue,
        detail: 'Documenti da completare e inviare al cliente.',
      },
      {
        filter: 'trattativa' as const,
        tone: 'info' as const,
        kicker: 'Follow-up',
        label: 'Trattative attive',
        count: negotiationQuotes.length,
        value: negotiationValue,
        detail: 'Preventivi aperti che richiedono richiamo o revisione.',
      },
      {
        filter: 'ordine' as const,
        tone: 'success' as const,
        kicker: 'Pronti a partire',
        label: 'Confermati o ordini',
        count: readyQuotes.length,
        value: readyValue,
        detail: 'Pratiche mature da portare in agenda, cassa o installazione.',
      },
    ];
  });
  protected readonly quoteDraftSubtotal = computed(() =>
    this.quoteDraftLines().reduce((total, line) => {
      const subtotal = line.quantity * line.unitPrice;
      const discount = line.discountPercent ? subtotal * (line.discountPercent / 100) : 0;
      return total + (subtotal - discount);
    }, 0),
  );
  protected readonly quoteDraftVatTotal = computed(() =>
    this.quoteDraftLines().reduce((total, line) => {
      const subtotal = line.quantity * line.unitPrice;
      const discount = line.discountPercent ? subtotal * (line.discountPercent / 100) : 0;
      const net = subtotal - discount;
      return total + net * (line.vatRate / 100);
    }, 0),
  );
  protected readonly quoteDraftGrandTotal = computed(() => {
    const subtotalAndVat = this.quoteDraftSubtotal() + this.quoteDraftVatTotal();
    const discountAmount = this.quoteForm.controls.discountAmount.value || 0;
    return Math.max(0, subtotalAndVat - discountAmount);
  });

  protected readonly filteredAppointments = computed(() => {
    const query = this.appointmentQuery().trim().toLowerCase();
    const statusFilter = this.appointmentStatusFilter();
    const locationFilter = this.appointmentLocationFilter();
    const typeFilter = this.appointmentTypeFilter();

    return [...this.allAppointments()]
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
      .filter((item) =>
        `${item.title} ${item.customerName} ${item.technician} ${item.locationType} ${item.status} ${item.appointmentType} ${item.durationMinutes}`
          .toLowerCase()
          .includes(query),
      )
      .filter((item) => (statusFilter === 'tutti' ? true : item.status === statusFilter))
      .filter((item) => (locationFilter === 'tutti' ? true : item.locationType === locationFilter))
      .filter((item) => (typeFilter === 'tutti' ? true : item.appointmentType === typeFilter))
      .slice(0, 8);
  });
  protected readonly appointmentCountsByType = computed(() => {
    const counts: Record<AppointmentRecord['appointmentType'], number> = {
      negozio: 0,
      uscita: 0,
      installazione: 0,
      assistenza: 0,
      sopralluogo: 0,
    };

    for (const item of this.filteredAppointments()) {
      counts[item.appointmentType] += 1;
    }

    return counts;
  });
  protected readonly filteredServiceTickets = computed(() => {
    const query = this.ticketQuery().trim().toLowerCase();
    const statusFilter = this.ticketStatusFilter();
    const priorityFilter = this.ticketPriorityFilter();

    return [...this.allServiceTickets()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .filter((item) =>
        `${item.title} ${item.customerName} ${item.serviceType} ${item.status} ${item.priority} ${item.technician}`
          .toLowerCase()
          .includes(query),
      )
      .filter((item) => (statusFilter === 'tutti' ? true : item.status === statusFilter))
      .filter((item) => (priorityFilter === 'tutte' ? true : item.priority === priorityFilter))
      .slice(0, 8);
  });
  protected readonly highPriorityFilteredTicketsCount = computed(
    () => this.filteredServiceTickets().filter((item) => item.priority === 'alta').length,
  );
  protected readonly inProgressFilteredTicketsCount = computed(
    () => this.filteredServiceTickets().filter((item) => item.status === 'in-lavorazione').length,
  );
  protected readonly ticketCommandSummary = computed<
    Array<{
      filterType: 'all' | 'status' | 'priority';
      filterValue: 'tutti' | 'tutte' | ServiceTicketRecord['status'] | ServiceTicketRecord['priority'];
      tone: 'neutral' | 'warning' | 'info' | 'danger';
      kicker: string;
      label: string;
      count: number;
      value: string;
      detail: string;
    }>
  >(() => {
    const tickets = this.allServiceTickets();
    const openTickets = tickets.filter((ticket) => ticket.status === 'aperto');
    const inProgressTickets = tickets.filter((ticket) => ticket.status === 'in-lavorazione');
    const highPriorityTickets = tickets.filter((ticket) => ticket.priority === 'alta');

    return [
      {
        filterType: 'all' as const,
        filterValue: 'tutti' as const,
        tone: 'neutral' as const,
        kicker: 'Vista completa',
        label: 'Archivio ticket',
        count: tickets.length,
        value: `${tickets.filter((ticket) => ticket.locationType === 'officina').length} in officina`,
        detail: 'Tutti i ticket tra domicilio, showroom e laboratorio.',
      },
      {
        filterType: 'status' as const,
        filterValue: 'aperto' as const,
        tone: 'warning' as const,
        kicker: 'Da prendere in carico',
        label: 'Ticket aperti',
        count: openTickets.length,
        value: `${openTickets.filter((ticket) => ticket.priority === 'alta').length} urgenti`,
        detail: 'Richieste nuove da assegnare o avviare.',
      },
      {
        filterType: 'status' as const,
        filterValue: 'in-lavorazione' as const,
        tone: 'info' as const,
        kicker: 'Lavorazioni attive',
        label: 'In lavorazione',
        count: inProgressTickets.length,
        value: `${inProgressTickets.filter((ticket) => ticket.locationType === 'officina').length} in laboratorio`,
        detail: 'Interventi già in corso con tecnico o banco attivo.',
      },
      {
        filterType: 'priority' as const,
        filterValue: 'alta' as const,
        tone: 'danger' as const,
        kicker: 'Priorità alta',
        label: 'Ticket urgenti',
        count: highPriorityTickets.length,
        value: `${highPriorityTickets.filter((ticket) => ticket.status !== 'chiuso').length} ancora aperti`,
        detail: 'Casi da seguire prima per tempi, blocchi o cliente fermo.',
      },
    ];
  });
  protected readonly filteredInventoryItems = computed(() => {
    const query = this.inventoryQuery().trim().toLowerCase();
    const statusFilter = this.inventoryStatusFilter();

    return [...this.allInventoryItems()]
      .filter((item) =>
        `${item.name} ${item.sku} ${item.category} ${item.supplier} ${item.location} ${item.status}`
          .toLowerCase()
          .includes(query),
      )
      .filter((item) => (statusFilter === 'tutti' ? true : item.status === statusFilter));
  });
  protected readonly warehouseProductCategories = computed(() => {
    const categories = Array.from(
      new Set(
        this.allInventoryItems()
          .map((item) => item.category)
          .filter((entry): entry is string => !!entry && entry.trim().length > 0),
      ),
    ).sort((left, right) => left.localeCompare(right, 'it-IT'));

    return ['tutte', ...categories];
  });

  protected readonly historicalInventoryItems = computed(() => {
    const targetDate = this.warehouseValuationDate();
    if (!targetDate) {
      return this.allInventoryItems();
    }

    const currentItems = this.allInventoryItems();
    // Revert movements that happened AFTER targetDate
    const movementsToRevert = this.allWarehouseMovements().filter(
      (m) => m.movedAt.slice(0, 10) > targetDate
    );

    const stockAdjustments = new Map<string, number>();
    movementsToRevert.forEach((m) => {
      let adj = stockAdjustments.get(m.inventoryItemId) || 0;
      if (m.movementType === 'carico') {
        adj -= m.quantity;
      } else if (m.movementType === 'scarico') {
        adj += m.quantity;
      } else if (m.movementType === 'rettifica+/-') {
        adj -= m.quantity;
      }
      stockAdjustments.set(m.inventoryItemId, adj);
    });

    return currentItems.map((item) => {
      const adj = stockAdjustments.get(item.id) || 0;
      return { ...item, stock: item.stock + adj };
    });
  });

  protected readonly warehouseTableItems = computed(() => {
    const category = this.warehouseCategoryFilter();

    return [...this.filteredInventoryItems()]
      .filter((item) => (category === 'tutte' ? true : item.category === category))
      .sort((left, right) => left.name.localeCompare(right.name, 'it-IT'))
      .slice(0, 40);
  });
  protected readonly filteredExpenseRecords = computed(() => {
    const query = this.expenseQuery().trim().toLowerCase();
    const statusFilter = this.expenseStatusFilter();
    const paymentModeFilter = this.expensePaymentModeFilter();
    const supplierFilter = this.expenseSupplierFilter();
    const categoryMap = new Map(this.allExpenseCategories().map((entry) => [entry.id, entry.label]));
    const supplierMap = new Map(this.allExpenseSuppliers().map((entry) => [entry.id, entry.businessName]));

    return [...this.allExpenseRecords()]
      .sort((left, right) => right.expenseDate.localeCompare(left.expenseDate))
      .filter((expense) =>
        `${expense.description} ${expense.expenseDate} ${expense.status} ${expense.paymentMode} ${categoryMap.get(expense.categoryId) ?? ''} ${supplierMap.get(expense.supplierId ?? '') ?? expense.genericSupplierLabel ?? ''}`
          .toLowerCase()
          .includes(query),
      )
      .filter((expense) => (statusFilter === 'tutte' ? true : expense.status === statusFilter))
      .filter((expense) =>
        paymentModeFilter === 'tutte' ? true : expense.paymentMode === paymentModeFilter,
      )
      .filter((expense) =>
        supplierFilter === 'tutti'
          ? true
          : (expense.supplierId ?? expense.genericSupplierLabel ?? '') === supplierFilter,
      )
      .map((expense) => ({
        ...expense,
        categoryLabel: categoryMap.get(expense.categoryId) ?? expense.categoryId,
        supplierLabel:
          supplierMap.get(expense.supplierId ?? '') ??
          expense.genericSupplierLabel ??
          'Utenza generica',
      }))
      .slice(0, 40);
  });
  protected readonly selectedExpenseRecord = computed(() => {
    const selectedId = this.selectedExpenseId();
    return (
      this.filteredExpenseRecords().find((expense) => expense.id === selectedId) ??
      this.filteredExpenseRecords()[0] ??
      null
    );
  });
  protected readonly selectedExpenseInstallments = computed(() => {
    const expense = this.selectedExpenseRecord();
    if (!expense) {
      return [];
    }

    return this.allExpenseInstallments()
      .filter((installment) => installment.expenseId === expense.id)
      .sort((left, right) => left.installmentNumber - right.installmentNumber);
  });
  protected readonly expenseUpcomingInstallments = this.data.expenseUpcomingInstallments;
  protected readonly expenseMonthlyTotal = this.data.expenseTotalCurrentMonth;
  protected readonly expenseByCategorySummary = this.data.expenseByCategorySummary;
  protected readonly expenseSuppliersSummary = computed(() => {
    const grouped = new Map<string, { supplier: string; total: number; count: number }>();
    const supplierMap = new Map(this.allExpenseSuppliers().map((entry) => [entry.id, entry.businessName]));

    this.allExpenseRecords().forEach((expense) => {
      const supplier =
        supplierMap.get(expense.supplierId ?? '') ?? expense.genericSupplierLabel ?? 'Utenza';
      const current = grouped.get(supplier) ?? { supplier, total: 0, count: 0 };
      current.total += expense.amountGross;
      current.count += 1;
      grouped.set(supplier, current);
    });

    return [...grouped.values()].sort((left, right) => right.total - left.total).slice(0, 8);
  });
  protected readonly expenseStatusSummary = computed(() => {
    const records = this.allExpenseRecords();
    return {
      previste: records.filter((expense) => expense.status === 'prevista').length,
      pagate: records.filter((expense) => expense.status === 'pagata').length,
      parziali: records.filter((expense) => expense.status === 'parziale').length,
      annullate: records.filter((expense) => expense.status === 'annullata').length,
    };
  });
  protected readonly expenseUpcomingInstallmentsDetailed = computed(() => {
    const expenseMap = new Map(this.allExpenseRecords().map((expense) => [expense.id, expense]));
    const supplierMap = new Map(this.allExpenseSuppliers().map((supplier) => [supplier.id, supplier.businessName]));

    return this.expenseUpcomingInstallments()
      .map((installment) => {
        const expense = expenseMap.get(installment.expenseId) ?? null;
        return {
          ...installment,
          expenseLabel: expense?.description ?? 'Spesa non trovata',
          supplierLabel:
            (expense?.supplierId ? supplierMap.get(expense.supplierId) : null) ??
            expense?.genericSupplierLabel ??
            'Utenza generica',
          expenseStatus: expense?.status ?? 'prevista',
        };
      })
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
      .slice(0, 12);
  });
  // ⭐ Metodi calcolo Netto / IVA / Totale
  // Nota: non usiamo Signal computed() perché this.expenseForm.controls.*.value
  // non è un Signal Angular (è un FormGroup Reactive). Usiamo normali metodi:
  // Angular Change Detection li valuta ad ogni ciclo quando il template
  // legge expenseFormNetPreview() / expenseFormVatPreview().
  protected expenseFormNetPreview(): number {
    const gross = Number(this.expenseForm.controls.amountGross.value || 0);
    const vatRate = Number(this.expenseForm.controls.vatRate.value || 0);
    const alreadyIvato = Boolean(this.expenseForm.controls.amountAlreadyIvato?.value ?? true);
    const splitVat = Boolean(this.expenseForm.controls.amountSplitVat?.value ?? true);
    const reverse = Boolean(this.expenseForm.controls.amountIsReverseCharge?.value ?? false);

    // Reverse charge (Italia: 0% IVA inversa) → netto = importo totale
    if (reverse) return gross;

    if (!alreadyIvato) {
      // UTENTE INSERISCE NETTO (Importo prima dell'IVA) → netto = importo scritto
      return gross;
    }
    // UTENTE INSERISCE IMPORTO GIÀ IVATO (default Italia):
    if (!splitVat) {
      // SCENARIO: Importo IVATO ESENTE (es. medicina, tabacchi, IVA 0 per legge)
      return gross;
    }
    // SCENARIO DEFAULT: Importo già ivato → SCORPORO l'IVA scelta
    if (vatRate <= 0) return gross;
    return gross / (1 + vatRate / 100);
  }
  protected expenseFormVatPreview(): number {
    const gross = Number(this.expenseForm.controls.amountGross.value || 0);
    const alreadyIvato = Boolean(this.expenseForm.controls.amountAlreadyIvato?.value ?? true);
    const splitVat = Boolean(this.expenseForm.controls.amountSplitVat?.value ?? true);
    const reverse = Boolean(this.expenseForm.controls.amountIsReverseCharge?.value ?? false);
    const net = this.expenseFormNetPreview();

    if (reverse) return 0;
    if (!alreadyIvato) {
      // UTENTE INSERISCE NETTO → IVA = netto × aliquota%
      const vatRate = Number(this.expenseForm.controls.vatRate.value || 0);
      return Math.max(0, +(net * (vatRate / 100)).toFixed(4));
    }
    if (!splitVat) return 0;
    // Scorporo standard (default)
    return +(gross - net).toFixed(4);
  }
  protected expenseFormGrossFinalPreview(): number {
    const net = this.expenseFormNetPreview();
    const vat = this.expenseFormVatPreview();
    return +(net + vat).toFixed(2);
  }

  // ⭐ Aliquote IVA Italiane (ordinarie + casi speciali, in ordine di frequenza)
  protected readonly expenseVatRateOptions: ReadonlyArray<{
    value: number;
    label: string;
    hint?: string;
  }> = Object.freeze([
    { value: 22, label: 'IVA 22%', hint: 'Ordinaria (beni e servizi standard)' },
    { value: 10, label: 'IVA 10%', hint: 'Alimentare, energia, farmaci, ristorazione' },
    { value: 5, label: 'IVA 5%', hint: 'Alimenti, libri, sanitari, abitazione' },
    { value: 4, label: 'IVA 4%', hint: 'Alimenti base, prima casa, servizi sociali' },
    { value: 0, label: 'IVA 0% (esente)', hint: 'Spese esenti senza IVA (es. sanità, assicurazioni)' },
    { value: 21, label: 'IVA 21%', hint: 'Aliquota storica (fatture antecedenti)' },
    { value: 27, label: 'IVA 27%', hint: 'Aliquota extra (non standard, caso marginale)' },
  ]);

  protected readonly expenseIsReverseChargeOption = Object.freeze({
    label: 'Reverse Charge (Italia · IVA inversa)',
    hint: 'Forniture UE/extra UE, operazioni in reverse charge → IVA 0 in fattura',
  });

  // ⭐ Helper toggle UI (template-safe: Angular non supporta if/else/block statement in (click))
  protected setExpenseAlreadyIvato(mode: 'ivato' | 'netto'): void {
    if (mode === 'ivato') {
      this.expenseForm.controls.amountAlreadyIvato.setValue(true);
    } else {
      // Utente passa a NETTO: splitVat torna a true di default (non più in uso)
      this.expenseForm.controls.amountAlreadyIvato.setValue(false);
      this.expenseForm.controls.amountSplitVat.setValue(true);
    }
  }
  protected setExpenseSplitVat(enabled: boolean): void {
    this.expenseForm.controls.amountSplitVat.setValue(enabled);
  }
  protected toggleExpenseReverseCharge(): void {
    const next = !this.expenseForm.controls.amountIsReverseCharge.value;
    this.expenseForm.controls.amountIsReverseCharge.setValue(next);
    // Se Reverse Charge = ON, forza aliquota a 0 per semantica
    if (next) {
      this.expenseForm.controls.vatRate.setValue(0);
    } else {
      // Torniamo a 22% standard se l'aliquota era rimasta 0
      if (Number(this.expenseForm.controls.vatRate.value || 0) === 0) {
        this.expenseForm.controls.vatRate.setValue(22);
      }
    }
  }

  protected readonly warehouseInventorySummary = this.data.warehouseInventorySummary;
  protected readonly warehouseInventoryByLot = computed(() => {
    const selectedItemId = this.selectedInventoryId();

    return selectedItemId
      ? this.data.warehouseInventoryByLot().filter((lot) => lot.inventoryItemId === selectedItemId)
      : this.data.warehouseInventoryByLot().slice(0, 20);
  });
  protected readonly filteredWarehouseMovements = computed(() => {
    const query = this.inventoryQuery().trim().toLowerCase();
    const typeFilter = this.warehouseMovementTypeFilter();
    const operatorFilter = this.warehouseOperatorFilter();
    const from = this.warehouseMovementDateFrom();
    const to = this.warehouseMovementDateTo();
    const inventoryItemMap = new Map(this.allInventoryItems().map((item) => [item.id, item]));

    return [...this.allWarehouseMovements()]
      .sort((left, right) => right.movedAt.localeCompare(left.movedAt))
      .filter((movement) =>
        `${movement.documentNumber} ${movement.reason} ${movement.operator} ${movement.movementType} ${inventoryItemMap.get(movement.inventoryItemId)?.name ?? ''}`
          .toLowerCase()
          .includes(query),
      )
      .filter((movement) => (typeFilter === 'tutti' ? true : movement.movementType === typeFilter))
      .filter((movement) => (operatorFilter === 'tutti' ? true : movement.operator === operatorFilter))
      .filter((movement) => (from ? movement.movedAt.slice(0, 10) >= from : true))
      .filter((movement) => (to ? movement.movedAt.slice(0, 10) <= to : true))
      .slice(0, 40)
      .map((movement) => ({
        ...movement,
        itemName: inventoryItemMap.get(movement.inventoryItemId)?.name ?? movement.inventoryItemId,
      }));
  });
  protected readonly warehouseMovementOperators = computed(() =>
    [...new Set(this.allWarehouseMovements().map((movement) => movement.operator))].sort((left, right) =>
      left.localeCompare(right, 'it-IT'),
    ),
  );
  protected readonly warehousePurchasesBySupplier = computed(() => {
    const groups = new Map<string, { supplier: string; totalCost: number; records: number }>();

    this.allWarehousePurchases().forEach((purchase) => {
      const current = groups.get(purchase.supplier) ?? {
        supplier: purchase.supplier,
        totalCost: 0,
        records: 0,
      };
      current.totalCost += purchase.totalCost;
      current.records += 1;
      groups.set(purchase.supplier, current);
    });

    return [...groups.values()].sort((left, right) => right.totalCost - left.totalCost);
  });
  protected readonly warehouseHistoricalValue = computed(() =>
    this.allInventoryItems().reduce((total, item) => total + (Math.max(0, item.stock) * item.unitCost), 0),
  );
  protected readonly warehouseLowStockAlerts = computed(() =>
    this.allInventoryItems().filter((item) => item.stock <= item.minStock),
  );
  protected readonly warehouseNegativeStockItems = computed(() =>
    this.allInventoryItems().filter((item) => item.stock < 0),
  );
  protected readonly warehouseStoreSupplyItems = computed(() =>
    this.allInventoryItems().filter((item) => item.usageType === 'uso-negozio'),
  );
  protected readonly warehouseViewMeta = computed(() => {
    const view = this.warehouseView();

    if (view === 'acquisto') {
      return {
        title: 'Acquisti prodotti',
        description: 'Controlla gli ultimi carichi e i documenti di acquisto, con scarico rapido delle giacenze di magazzino.',
      };
    }

    if (view === 'consumi') {
      return {
        title: 'Prodotti consumati',
        description: 'Vedi i pezzi usciti da magazzino per vendite e interventi tecnici.',
      };
    }

    if (view === 'utilizzo') {
      return {
        title: 'Utilizzo personale',
        description: 'Controlla i prodotti ad uso negozio e i consumi interni registrati per pulizia, test e servizio alla sede.',
      };
    }

    if (view === 'sottoscorta') {
      return {
        title: 'Report sottoscorta',
        description: 'Elenco pulito degli articoli sotto soglia, con scorta attuale, minimo e valore residuo.',
      };
    }

    if (view === 'valore') {
      return {
        title: 'Valore magazzino',
        description: 'Mostra il valore per articolo, consente l’inventario a una data selezionata ed evidenzia eventuali anomalie di giacenza.',
      };
    }

    if (view === 'movimenti') {
      return {
        title: 'Storico movimenti',
        description: 'Filtra carichi, scarichi e rettifiche per data, operatore e causale.',
      };
    }

    if (view === 'ordini') {
      return {
        title: 'Registro ordini',
        description: 'Consulta gli ordini del portale e del gestionale con filtri per data, stato e dettaglio righe.',
      };
    }

    if (view === 'fornitori') {
      return {
        title: 'Fornitori',
        description: 'Consulta tutti i fornitori presenti, gli ordini fatti, l’ultimo documento e il dettaglio completo per fornitore.',
      };
    }

    return {
      title: 'Ricerca prodotti',
      description: 'Cerca rapidamente i prodotti, apri il dettaglio e ricarica l’articolo selezionato.',
    };
  });
  protected readonly warehousePurchasesDetailed = computed(() => {
    const inventoryMap = new Map(this.allInventoryItems().map((item) => [item.id, item.name]));

    return [...this.allWarehousePurchases()]
      .sort((left, right) => right.receivedDate.localeCompare(left.receivedDate))
      .map((purchase) => ({
        ...purchase,
        itemName: inventoryMap.get(purchase.inventoryItemId) ?? 'Articolo magazzino',
      }))
      .slice(0, 40);
  });
  protected readonly warehouseConsumedItems = computed(() =>
    this.filteredWarehouseMovements()
      .filter(
        (movement) =>
          movement.movementType === 'scarico' &&
          (movement.sourceModule === 'cassa' || movement.sourceModule === 'tecnico'),
      )
      .slice(0, 40),
  );
  protected readonly warehouseInternalUsageMovements = computed(() =>
    this.filteredWarehouseMovements()
      .filter(
        (movement) =>
          movement.sourceModule === 'inventario' ||
          movement.movementType === 'rettifica+/-' ||
          movement.reason.toLowerCase().includes('intern') ||
          movement.reason.toLowerCase().includes('personale'),
      )
      .slice(0, 40),
  );
  protected readonly warehouseValuationRows = computed<WarehouseValuationRow[]>(() =>
    [...this.historicalInventoryItems()]
      .map((item) => ({
        item,
        quantityAvailable: Math.max(0, item.stock),
        valuationByLot: Math.max(0, item.stock) * item.unitCost,
      }))
      .sort((left, right) => right.valuationByLot - left.valuationByLot)
      .slice(0, 40),
  );
  protected readonly warehouseValuationTotalValue = computed(() =>
    this.historicalInventoryItems().reduce((total, item) => total + (Math.max(0, item.stock) * item.unitCost), 0),
  );
  protected readonly warehouseInventoryExportRows = computed(() =>
    this.historicalInventoryItems().map((item) => ({
      item,
      quantityAvailable: Math.max(0, item.stock),
      valuation: Math.max(0, item.stock) * item.unitCost,
      anomaly: item.stock < 0 ? 'GIACENZA NEGATIVA' : '',
    })),
  );
  protected readonly warehouseSupplierAllRows = computed<WarehouseSupplierSummaryRow[]>(() => {
    const labels = new Map<string, string>();

    this.allExpenseSuppliers().forEach((supplier) => {
      const label = supplier.businessName.trim();
      if (!label) {
        return;
      }
      labels.set(this.normalizeLookup(label), label);
    });

    this.allWarehousePurchases().forEach((purchase) => {
      const label = (purchase.supplier || '').trim() || 'Senza fornitore';
      const key = this.normalizeLookup(label);
      if (!labels.has(key)) {
        labels.set(key, label);
      }
    });

    const grouped = new Map<string, WarehouseSupplierSummaryRow & { itemIds: Set<string> }>();

    labels.forEach((label, key) => {
      grouped.set(key, {
        supplier: label,
        records: 0,
        totalCost: 0,
        lastReceivedDate: '',
        lastDocumentNumber: '',
        distinctItems: 0,
        itemIds: new Set<string>(),
      });
    });

    this.allWarehousePurchases().forEach((purchase) => {
      const label = (purchase.supplier || '').trim() || 'Senza fornitore';
      const key = this.normalizeLookup(label);
      const current = grouped.get(key) ?? {
        supplier: label,
        records: 0,
        totalCost: 0,
        lastReceivedDate: '',
        lastDocumentNumber: '',
        distinctItems: 0,
        itemIds: new Set<string>(),
      };

      current.records += 1;
      current.totalCost += purchase.totalCost;
      current.itemIds.add(purchase.inventoryItemId);

      if (!current.lastReceivedDate || purchase.receivedDate > current.lastReceivedDate) {
        current.lastReceivedDate = purchase.receivedDate;
        current.lastDocumentNumber = purchase.documentNumber;
      }

      grouped.set(key, current);
    });

    return [...grouped.values()]
      .map(({ itemIds, ...row }) => ({
        ...row,
        distinctItems: itemIds.size,
      }))
      .sort((left, right) => {
        if (left.lastReceivedDate !== right.lastReceivedDate) {
          return right.lastReceivedDate.localeCompare(left.lastReceivedDate);
        }
        return left.supplier.localeCompare(right.supplier, 'it-IT');
      });
  });
  protected readonly warehouseSupplierRows = computed<WarehouseSupplierSummaryRow[]>(() => {
    const query = this.normalizeLookup(this.warehouseSupplierQuery());

    return this.warehouseSupplierAllRows().filter((row) =>
      !query
      || this.normalizeLookup(
        `${row.supplier} ${row.lastDocumentNumber} ${row.lastReceivedDate} ${row.records}`,
      ).includes(query),
    );
  });
  protected readonly warehouseSupplierDetail = computed(() => {
    const supplierName = this.warehouseSupplierDetailName();
    return supplierName
      ? this.warehouseSupplierAllRows().find(
        (row) => this.normalizeLookup(row.supplier) === this.normalizeLookup(supplierName),
      ) ?? null
      : null;
  });
  protected readonly warehouseSupplierDetailOrders = computed<SupplierOrderHistoryEntry[]>(() => {
    const supplier = this.warehouseSupplierDetail();
    if (!supplier) {
      return [];
    }

    const inventoryMap = new Map(this.allInventoryItems().map((item) => [item.id, item.name]));

    return this.allWarehousePurchases()
      .filter((purchase) => this.normalizeLookup(purchase.supplier) === this.normalizeLookup(supplier.supplier))
      .sort((left, right) => right.receivedDate.localeCompare(left.receivedDate))
      .map((purchase) => ({
        purchase,
        itemName: inventoryMap.get(purchase.inventoryItemId) ?? 'Articolo magazzino',
        linkedExpense:
          this.allExpenseRecords().find(
            (expense) =>
              expense.id === purchase.linkedExpenseId || expense.sourceReferenceId === purchase.id,
          ) ?? null,
      }));
  });
  protected readonly warehouseTotalQuantity = computed(() =>
    this.allInventoryItems().reduce((total, item) => total + item.stock, 0),
  );
  protected readonly warehouseLowStockAlertText = computed(() =>
    this.warehouseLowStockAlerts().length
      ? this.warehouseLowStockAlerts()
        .map((item) => item.name)
        .join(', ')
      : 'Nessuna anomalia di scorta.',
  );
  protected readonly warehouseCurrentMonthMovementCount = computed(() => {
    const month = new Date().toISOString().slice(0, 7);

    return this.allWarehouseMovements().filter((movement) => movement.movedAt.startsWith(month)).length;
  });
  protected readonly warehouseLatestAdjustments = computed(() => this.allWarehouseAdjustments().slice(0, 8));
  protected readonly warehousePositionMap = computed(() => {
    const inventoryMap = new Map(this.allInventoryItems().map((item) => [item.id, item]));
    const grouped = new Map<string, { code: string; items: string[] }[]>();

    this.allWarehousePositions().forEach((position) => {
      const zoneEntries = grouped.get(position.zone) ?? [];
      zoneEntries.push({
        code: position.code,
        items: position.occupiedInventoryItemIds.map(
          (itemId) => inventoryMap.get(itemId)?.name ?? itemId,
        ),
      });
      grouped.set(position.zone, zoneEntries);
    });

    return [...grouped.entries()]
      .sort((left, right) => left[0].localeCompare(right[0], 'it-IT'))
      .map(([zone, entries]) => ({
        zone,
        entries: entries.sort((left, right) => left.code.localeCompare(right.code, 'it-IT')),
        summary: entries
          .sort((left, right) => left.code.localeCompare(right.code, 'it-IT'))
          .map((entry) => `${entry.code}: ${entry.items.join(' / ')}`)
          .join(' · '),
      }));
  });
  protected readonly warehouseBarcodeLabels = computed(() =>
    this.allWarehousePositions().map((position) => ({
      code: position.code,
      barcode: `*${position.code.replaceAll('-', '')}*`,
    })),
  );
  protected readonly filteredCashProducts = computed(() => {
    const query = this.cashProductQuery().trim().toLowerCase();
    const category = this.cashCategoryFilter();
    const salesMode = this.cashSalesMode();

    return [...this.allCashProducts()]
      .filter((item) =>
        `${item.name} ${item.category} ${item.price}`.toLowerCase().includes(query),
      )
      .filter((item) => (category === 'tutte' ? true : item.category === category))
      .filter((item) => {
        if (salesMode === 'servizi') return item.linkedInventoryItemId === null;
        if (salesMode === 'rivendita') return item.linkedInventoryItemId !== null;
        if (salesMode === 'storico') return true;
        if (salesMode === 'tutti') return true;
        return false;
      })
      .sort((left, right) => Number(right.shortcut) - Number(left.shortcut))
      .slice(0, 12);
  });
  protected readonly cashVisibleCatalogCount = computed(() =>
    this.cashSalesMode() === 'preventivi' ? this.confirmedQuotes().length : this.filteredCashProducts().length,
  );
  protected readonly cashVisibleCategories = computed(() => {
    const salesMode = this.cashSalesMode();

    if (salesMode === 'servizi') {
      return this.cashCategories();
    }

    if (salesMode === 'rivendita') {
      return this.productCategories();
    }

    if (salesMode === 'tutti') {
      return [...new Set([...this.cashCategories(), ...this.productCategories()])].sort((left, right) =>
        left.localeCompare(right, 'it-IT'),
      );
    }

    if (salesMode === 'storico') {
      return [...new Set([...this.cashCategories(), ...this.productCategories()])].sort((left, right) =>
        left.localeCompare(right, 'it-IT'),
      );
    }

    return [];
  });
  protected readonly cashInventoryById = computed(
    () => new Map(this.allInventoryItems().map((item) => [item.id, item])),
  );
  protected readonly cashCategories = this.data.serviceCategories;
  protected readonly productCategories = this.data.productCategories;
  protected readonly latestCashTransactions = computed(() => this.allCashTransactions().slice(0, 8));
  protected readonly latestCashShift = this.data.latestCashShift;
  protected readonly loyalClients = this.data.loyalClients;

  protected readonly clientCities = computed(() =>
    [...new Set(this.allClients().map((item) => item.city))].sort((left, right) =>
      left.localeCompare(right, 'it-IT'),
    ),
  );

  protected readonly selectedClient = computed(
    () => this.allClients().find((item) => item.id === this.selectedClientId()) ?? null,
  );
  protected readonly selectedSupplier = computed(
    () => this.allExpenseSuppliers().find((item) => item.id === this.selectedSupplierId()) ?? null,
  );
  protected readonly selectedContactDetailKind = computed<
    'cliente' | 'azienda' | 'fornitore' | null
  >(() => {
    if (this.selectedSupplier()) {
      return 'fornitore';
    }

    const client = this.selectedClient();
    if (!client) {
      return null;
    }

    return client.privacyProfile.billingProfile?.kind === 'azienda' ? 'azienda' : 'cliente';
  });

  protected readonly selectedClientHistory = computed<SelectedClientHistory>(() => {
    const client = this.selectedClient();
    if (!client) {
      return {
        quotes: [],
        transactions: [],
        receipts: [],
        invoices: [],
        appointments: [],
        tickets: [],
      };
    }

    const quotes = this.allQuotes()
      .filter((quote) =>
        this.matchesClientReference(client, {
          clientId: quote.clientId ?? null,
          customerName: quote.customerName,
          customerEmail: quote.customerEmail,
          customerPhone: quote.customerPhone,
        }),
      )
      .sort((left, right) =>
        (right.issueDate ?? right.dueDate).localeCompare(left.issueDate ?? left.dueDate),
      );
    const transactions = this.allCashTransactions()
      .filter((transaction) =>
        this.matchesClientReference(client, {
          clientId: transaction.clientId,
          customerName: transaction.customerName,
        }),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const appointments = this.allAppointments()
      .filter((appointment) =>
        this.matchesClientReference(client, {
          clientId: appointment.clientId ?? null,
          customerName: appointment.customerName,
        }),
      )
      .sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt));
    const tickets = this.allServiceTickets()
      .filter((ticket) =>
        this.matchesClientReference(client, {
          customerName: ticket.customerName,
        }),
      )
      .sort((left, right) =>
        (right.closedAt ?? right.createdAt).localeCompare(left.closedAt ?? left.createdAt),
      );

    return {
      quotes,
      transactions,
      receipts: transactions.filter((transaction) => transaction.documentType === 'scontrino'),
      invoices: transactions.filter((transaction) => transaction.documentType === 'fattura'),
      appointments,
      tickets,
    };
  });
  protected readonly cashSelectedClientHistory = computed<SelectedClientHistory>(() => {
    const client = this.selectedCashClient();
    if (!client) {
      return {
        quotes: [],
        transactions: [],
        receipts: [],
        invoices: [],
        appointments: [],
        tickets: [],
      };
    }

    const quotes = this.allQuotes()
      .filter((quote) =>
        this.matchesClientReference(client, {
          clientId: quote.clientId ?? null,
          customerName: quote.customerName,
          customerEmail: quote.customerEmail,
          customerPhone: quote.customerPhone,
        }),
      )
      .sort((left, right) =>
        (right.issueDate ?? right.dueDate).localeCompare(left.issueDate ?? left.dueDate),
      );
    const transactions = this.allCashTransactions()
      .filter((transaction) =>
        this.matchesClientReference(client, {
          clientId: transaction.clientId,
          customerName: transaction.customerName,
        }),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const appointments = this.allAppointments()
      .filter((appointment) =>
        this.matchesClientReference(client, {
          clientId: appointment.clientId ?? null,
          customerName: appointment.customerName,
        }),
      )
      .sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt));
    const tickets = this.allServiceTickets()
      .filter((ticket) =>
        this.matchesClientReference(client, {
          customerName: ticket.customerName,
        }),
      )
      .sort((left, right) =>
        (right.closedAt ?? right.createdAt).localeCompare(left.closedAt ?? left.createdAt),
      );

    return {
      quotes,
      transactions,
      receipts: transactions.filter((transaction) => transaction.documentType === 'scontrino'),
      invoices: transactions.filter((transaction) => transaction.documentType === 'fattura'),
      appointments,
      tickets,
    };
  });
  protected readonly cashSelectedClientRecentItems = computed<CashClientRecentItem[]>(() => {
    const history = this.cashSelectedClientHistory();

    return [
      ...history.quotes.slice(0, 4).map((quote) => ({
        id: `quote-${quote.id}`,
        kind: 'preventivo' as const,
        title: quote.projectType,
        meta: `${quote.stage} · € ${quote.value.toLocaleString('it-IT')}`,
        dateKey: quote.issueDate ?? quote.dueDate,
        tone: 'accent' as const,
      })),
      ...history.transactions.slice(0, 4).map((transaction) => ({
        id: `txn-${transaction.id}`,
        kind: 'vendita' as const,
        title: transaction.reference,
        meta: `${transaction.status} · € ${transaction.total.toLocaleString('it-IT')}`,
        dateKey: transaction.createdAt,
        tone: transaction.status === 'insoluto' ? 'warning' as const : 'success' as const,
      })),
      ...history.appointments.slice(0, 4).map((appointment) => ({
        id: `appt-${appointment.id}`,
        kind: 'appuntamento' as const,
        title: appointment.title,
        meta: `${appointment.status} · ${appointment.technician || 'Non assegnato'}`,
        dateKey: appointment.scheduledAt,
        tone: 'neutral' as const,
      })),
      ...history.tickets.slice(0, 4).map((ticket) => ({
        id: `ticket-${ticket.id}`,
        kind: 'ticket' as const,
        title: ticket.title,
        meta: `${ticket.status} · ${ticket.technician || 'Non assegnato'}`,
        dateKey: ticket.closedAt ?? ticket.createdAt,
        tone: ticket.resolutionStatus === 'risolto' ? 'success' as const : 'warning' as const,
      })),
    ]
      .sort((left, right) => right.dateKey.localeCompare(left.dateKey))
      .slice(0, 8);
  });
  protected readonly selectedSupplierOrders = computed<SupplierOrderHistoryEntry[]>(() => {
    const supplier = this.selectedSupplier();
    if (!supplier) {
      return [];
    }

    const inventoryMap = new Map(this.allInventoryItems().map((item) => [item.id, item.name]));

    return this.allWarehousePurchases()
      .filter((purchase) => this.matchesSupplierReference(supplier, purchase.supplier))
      .sort((left, right) => right.receivedDate.localeCompare(left.receivedDate))
      .map((purchase) => ({
        purchase,
        itemName: inventoryMap.get(purchase.inventoryItemId) ?? 'Articolo magazzino',
        linkedExpense:
          this.allExpenseRecords().find(
            (expense) =>
              expense.id === purchase.linkedExpenseId || expense.sourceReferenceId === purchase.id,
          ) ?? null,
      }));
  });
  protected readonly selectedSupplierExpenses = computed(() => {
    const supplier = this.selectedSupplier();
    if (!supplier) {
      return [];
    }

    return this.allExpenseRecords()
      .filter((expense) =>
        this.matchesSupplierReference(
          supplier,
          expense.genericSupplierLabel,
          expense.supplierId ?? null,
        ),
      )
      .sort((left, right) => right.expenseDate.localeCompare(left.expenseDate));
  });

  protected readonly crmClientKpis = computed(() => {
    const clients = this.allClients();
    const active = clients.filter((client) => client.status !== 'lead').length;
    const vip = clients.filter((client) => client.status === 'molto spendente').length;
    const leads = clients.filter((client) => client.status === 'lead').length;

    return {
      total: clients.length,
      active,
      vip,
      leads,
    };
  });
  protected readonly crmPipelineColumns = computed(() => {
    const allQuotes = this.allQuotes();
    const bozza = allQuotes.filter((quote) => quote.stage === 'bozza');
    const trattativa = allQuotes.filter((quote) => quote.stage === 'trattativa');
    const ordini = allQuotes.filter((quote) => quote.stage === 'ordine' || quote.stage === 'confermato');

    return [
      { key: 'bozza', label: 'Bozza', entries: bozza },
      { key: 'trattativa', label: 'Trattativa', entries: trattativa },
      { key: 'ordine', label: 'Ordine', entries: ordini },
    ] as const;
  });
  protected readonly crmInteractionFeed = computed(() => {
    const fromAppointments = this.allAppointments().map((appointment) => ({
      id: appointment.id,
      kind: 'appuntamento',
      customerName: appointment.customerName,
      title: appointment.title,
      date: appointment.scheduledAt,
      status: appointment.status,
      owner: appointment.technician,
    }));
    const fromTickets = this.allServiceTickets().map((ticket) => ({
      id: ticket.id,
      kind: 'ticket',
      customerName: ticket.customerName,
      title: ticket.title,
      date: ticket.createdAt,
      status: ticket.status,
      owner: ticket.technician,
    }));

    return [...fromAppointments, ...fromTickets]
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 25);
  });
  protected readonly crmInteractionOwners = computed(() =>
    ['tutti', ...new Set(this.crmInteractionFeed().map((entry) => entry.owner))]
      .filter((entry) => !!entry)
      .sort((left, right) => left.localeCompare(right, 'it-IT')),
  );
  protected readonly filteredCrmInteractionFeed = computed(() => {
    const kind = this.interactionKindFilter();
    const owner = this.interactionOwnerFilter();
    const date = this.interactionDateFilter();

    return this.crmInteractionFeed()
      .filter((entry) => (kind === 'tutti' ? true : entry.kind === kind))
      .filter((entry) => (owner === 'tutti' ? true : entry.owner === owner))
      .filter((entry) => (date ? entry.date.slice(0, 10) >= date : true));
  });
  protected readonly crmTopQuoteLines = computed(() => {
    const grouped = new Map<string, { description: string; count: number; total: number }>();

    this.allQuotes().forEach((quote) => {
      quote.lines?.forEach((line) => {
        const key = `${line.kind}:${line.description.trim().toLowerCase()}`;
        const current = grouped.get(key) ?? { description: line.description, count: 0, total: 0 };
        current.count += 1;
        current.total += this.quoteLineTotal(line);
        grouped.set(key, current);
      });
    });

    return [...grouped.values()].sort((left, right) => right.total - left.total).slice(0, 12);
  });
  protected readonly crmRevenueByCity = computed(() => {
    const grouped = new Map<string, number>();
    const clientsByName = new Map(this.allClients().map((client) => [client.name, client.city]));

    this.allQuotes().forEach((quote) => {
      const city = clientsByName.get(quote.customerName) ?? 'Non assegnata';
      grouped.set(city, (grouped.get(city) ?? 0) + quote.value);
    });

    return [...grouped.entries()]
      .map(([city, value]) => ({ city, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 10);
  });
  protected readonly crmAutomationTargets = computed(() => {
    const today = new Date();
    return this.allClients()
      .map((client) => {
        const date = new Date(client.lastContact);
        const days =
          Number.isNaN(date.getTime()) ? 999 : Math.floor((today.getTime() - date.getTime()) / 86400000);
        return { client, daysSinceContact: days };
      })
      .filter((entry) => entry.client.status === 'lead' || entry.daysSinceContact > 45)
      .sort((left, right) => right.daysSinceContact - left.daysSinceContact)
      .slice(0, 20);
  });
  protected readonly selectedQuote = computed(
    () => this.allQuotes().find((item) => item.id === this.selectedQuoteId()) ?? null,
  );
  protected readonly selectedQuoteCode = computed(() => {
    const quote = this.selectedQuote();
    return quote ? this.quoteCode(quote.id) : '';
  });
  protected readonly selectedAppointment = computed(
    () => this.allAppointments().find((item) => item.id === this.selectedAppointmentId()) ?? null,
  );
  protected readonly selectedInventoryItem = computed(
    () => this.allInventoryItems().find((item) => item.id === this.selectedInventoryId()) ?? null,
  );
  protected readonly warehouseReceiptTargetItem = computed(() => {
    const itemId = this.warehouseReceiptTargetId();
    return itemId ? this.allInventoryItems().find((item) => item.id === itemId) ?? null : null;
  });
  protected readonly selectedServiceTicket = computed(
    () => this.allServiceTickets().find((item) => item.id === this.selectedTicketId()) ?? null,
  );
  protected readonly selectedCashProduct = computed(
    () => this.allCashProducts().find((item) => item.id === this.selectedCashProductId()) ?? null,
  );
  protected readonly servicesOnly = computed(() =>
    this.allCashProducts().filter((item) => item.linkedInventoryItemId === null),
  );
  protected readonly filteredServices = computed(() => {
    const query = this.cashProductQuery().trim().toLowerCase();
    const category = this.cashCategoryFilter();

    return this.servicesOnly()
      .filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(query))
      .filter((item) => (category === 'tutte' ? true : item.category === category))
      .sort((left, right) => Number(right.shortcut) - Number(left.shortcut))
      .slice(0, 30);
  });
  protected readonly selectedService = computed(() => {
    const record = this.selectedCashProduct();
    return record && record.linkedInventoryItemId === null ? record : null;
  });
  protected readonly servicePerformanceRows = computed(() => {
    const services = this.servicesOnly();
    const stats = new Map(
      services.map((service) => [
        service.id,
        {
          salesCount: 0,
          salesTotal: 0,
          quoteCount: 0,
        },
      ]),
    );
    const serviceNameMap = new Map(
      services.map((service) => [service.name.trim().toLowerCase(), service.id]),
    );

    for (const transaction of this.allCashTransactions().filter((item) => item.status === 'pagato')) {
      for (const line of transaction.lines) {
        if (!stats.has(line.productId)) {
          continue;
        }

        const current = stats.get(line.productId)!;
        current.salesCount += Number(line.quantity) || 0;
        current.salesTotal += Number(line.total) || 0;
      }
    }

    for (const quote of this.allQuotes()) {
      const servicesInQuote = new Set<string>();

      for (const line of quote.lines ?? []) {
        if (line.kind !== 'servizio') {
          continue;
        }

        const matchedServiceId = serviceNameMap.get(line.description.trim().toLowerCase());
        if (matchedServiceId) {
          servicesInQuote.add(matchedServiceId);
        }
      }

      for (const serviceId of servicesInQuote) {
        const current = stats.get(serviceId);
        if (current) {
          current.quoteCount += 1;
        }
      }
    }

    return services
      .map((service) => ({
        ...service,
        salesCount: stats.get(service.id)?.salesCount ?? 0,
        salesTotal: stats.get(service.id)?.salesTotal ?? 0,
        quoteCount: stats.get(service.id)?.quoteCount ?? 0,
      }))
      .sort(
        (left, right) =>
          right.salesTotal - left.salesTotal ||
          right.quoteCount - left.quoteCount ||
          left.name.localeCompare(right.name, 'it'),
      );
  });
  protected readonly servicePerformanceById = computed(
    () => new Map(this.servicePerformanceRows().map((service) => [service.id, service])),
  );
  protected readonly serviceCatalogStats = computed(() => {
    const services = this.servicesOnly();
    const performance = this.servicePerformanceRows();

    return {
      total: services.length,
      categories: new Set(services.map((service) => service.category)).size,
      shortcuts: services.filter((service) => service.shortcut).length,
      quoted: performance.filter((service) => service.quoteCount > 0).length,
    };
  });
  protected readonly serviceCategorySummary = computed(() => {
    const grouped = new Map<
      string,
      {
        count: number;
        salesTotal: number;
        quoteCount: number;
        shortcuts: number;
        avgPriceSum: number;
      }
    >();

    for (const service of this.servicePerformanceRows()) {
      const current = grouped.get(service.category) ?? {
        count: 0,
        salesTotal: 0,
        quoteCount: 0,
        shortcuts: 0,
        avgPriceSum: 0,
      };
      current.count += 1;
      current.salesTotal += service.salesTotal;
      current.quoteCount += service.quoteCount;
      current.shortcuts += service.shortcut ? 1 : 0;
      current.avgPriceSum += service.price;
      grouped.set(service.category, current);
    }

    return [...grouped.entries()]
      .map(([category, values]) => ({
        category,
        count: values.count,
        salesTotal: values.salesTotal,
        quoteCount: values.quoteCount,
        shortcuts: values.shortcuts,
        averagePrice: values.count ? values.avgPriceSum / values.count : 0,
      }))
      .sort((left, right) => right.count - left.count || right.salesTotal - left.salesTotal);
  });
  protected readonly serviceTopPerformers = computed(() =>
    this.servicePerformanceRows()
      .filter((service) => service.salesCount > 0 || service.quoteCount > 0)
      .slice(0, 5),
  );
  protected readonly serviceLowRotation = computed(() =>
    [...this.servicePerformanceRows()]
      .sort(
        (left, right) =>
          left.salesCount + left.quoteCount - (right.salesCount + right.quoteCount) ||
          left.price - right.price ||
          left.name.localeCompare(right.name, 'it'),
      )
      .slice(0, 5),
  );
  protected readonly selectedServicePerformance = computed(() => {
    const selected = this.selectedService();

    if (!selected) {
      return null;
    }

    return this.servicePerformanceRows().find((service) => service.id === selected.id) ?? null;
  });
  protected readonly selectedCashTransaction = computed(
    () =>
      this.allCashTransactions().find((item) => item.id === this.selectedCashTransactionId()) ??
      this.latestCashTransactions()[0] ??
      null,
  );
  protected readonly cashReceiptTransactions = computed(() => {
    const query = this.cashReceiptSearch().trim().toLowerCase();
    const filter = this.cashDocumentListFilter();

    return this.allCashTransactions()
      .filter((transaction) =>
        filter === 'scontrini'
          ? transaction.receiptNumber !== null
          : transaction.invoiceNumber !== null,
      )
      .filter((transaction) =>
        query
          ? `${transaction.reference} ${transaction.customerName} ${transaction.notes} ${transaction.paymentMethod}`
            .toLowerCase()
            .includes(query)
          : true,
      );
  });
  protected readonly selectedCashReceipt = computed(
    () =>
      this.allCashTransactions().find((item) => item.id === this.selectedCashReceiptId()) ??
      this.cashReceiptTransactions()[0] ??
      null,
  );
  protected readonly cashReceiptEditForm = this.formBuilder.nonNullable.group({
    customerName: ['', Validators.required],
    paymentMethod: this.formBuilder.nonNullable.control<CashTransactionRecord['paymentMethod']>('pos'),
    status: this.formBuilder.nonNullable.control<CashTransactionRecord['status']>('pagato'),
    notes: [''],
  });
  protected readonly selectedCashClient = computed(
    () => this.allClients().find((item) => item.id === this.selectedCashClientId()) ?? null,
  );
  protected readonly cashCategoryBreakdown = computed(() => {
    const totals = new Map<string, { total: number; quantity: number }>();

    for (const transaction of this.allCashTransactions().filter((item) => item.status === 'pagato')) {
      for (const line of transaction.lines) {
        const product = this.allCashProducts().find((item) => item.id === line.productId);
        const category = product?.category ?? 'servizi';
        const current = totals.get(category) ?? { total: 0, quantity: 0 };
        current.total += line.total;
        current.quantity += line.quantity;
        totals.set(category, current);
      }
    }

    return [...totals.entries()]
      .map(([category, values]) => ({ category, ...values }))
      .sort((left, right) => right.total - left.total);
  });
  protected readonly filteredCashShifts = computed(() => {
    const query = this.cashShiftSearch().trim().toLowerCase();

    return this.allCashShifts().filter((shift) =>
      query
        ? `${shift.label} ${shift.closureNumber} ${shift.closedAt}`
          .toLowerCase()
          .includes(query)
        : true,
    );
  });
  protected readonly selectedCashReportShift = computed(
    () =>
      this.allCashShifts().find((item) => item.id === this.selectedCashReportShiftId()) ??
      this.filteredCashShifts()[0] ??
      null,
  );
  protected readonly selectedCashReportShiftTransactions = computed(() => {
    const shift = this.selectedCashReportShift();
    if (!shift) {
      return [];
    }

    return this.allCashTransactions().filter((transaction) => {
      const receiptIncluded =
        transaction.receiptNumber !== null && shift.receiptNumbers.includes(transaction.receiptNumber);
      const invoiceIncluded =
        transaction.invoiceNumber !== null && shift.invoiceNumbers.includes(transaction.invoiceNumber);

      return receiptIncluded || invoiceIncluded;
    });
  });
  protected readonly selectedCashReportTransaction = computed(
    () =>
      this.allCashTransactions().find((item) => item.id === this.selectedCashReportTransactionId()) ??
      this.selectedCashReportShiftTransactions()[0] ??
      null,
  );
  protected readonly selectedCashTopClient = computed(
    () =>
      this.loyalClients().find((item) => item.client.id === this.selectedCashTopClientId()) ??
      this.loyalClients()[0] ??
      null,
  );
  protected readonly selectedCashTopClientTransactions = computed(() => {
    const entry = this.selectedCashTopClient();
    if (!entry) {
      return [];
    }

    return this.allCashTransactions()
      .filter((transaction) => transaction.clientId === entry.client.id)
      .slice(0, 12);
  });
  protected readonly cashActiveCustomerLabel = computed(() => {
    const client = this.selectedCashClient();
    if (client) {
      return client.name;
    }

    if (this.cashCustomerMode() === 'walk-in') {
      return this.cashCustomerName().trim() || 'Cliente di passaggio';
    }

    return this.cashCustomerName().trim() || 'Cliente non assegnato';
  });
  protected readonly cashActiveCustomerMeta = computed(() => {
    const client = this.selectedCashClient();
    if (client) {
      return [client.phone, client.city].filter(Boolean).join(' · ') || 'Cliente registrato';
    }

    if (this.cashCustomerMode() === 'walk-in') {
      return 'Banco rapido senza anagrafica';
    }

    return 'Cliente libero in lavorazione';
  });
  protected readonly cashEditingTransaction = computed(
    () =>
      this.allCashTransactions().find((item) => item.id === this.cashEditingTransactionId()) ?? null,
  );
  protected readonly cashSuggestedClients = computed(() => {
    const query = this.cashClientLookup().trim().toLowerCase();

    if (!query) {
      return [];
    }

    return this.allClients()
      .filter((client) =>
        `${client.name} ${client.phone} ${client.city}`.toLowerCase().includes(query),
      )
      .slice(0, 6);
  });
  protected readonly cashCanSaveWalkInClient = computed(() => {
    const normalizedName = this.cashNewClientName().trim().toLowerCase();

    return (
      this.cashPrivacyNoticeAcknowledged() &&
      normalizedName.length >= 3 &&
      normalizedName !== 'cliente di passaggio'
    );
  });
  protected readonly cashPrivacyDispatchLabel = computed(() => {
    switch (this.cashPrivacyDispatchChannel()) {
      case 'email':
        return 'Email';
      case 'firma':
        return 'Firma in negozio';
      default:
        return 'WhatsApp';
    }
  });
  protected readonly selectedClientPrivacyAudit = computed(() =>
    this.selectedClient()?.privacyProfile.audit.slice().sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    ) ?? [],
  );
  protected readonly selectedClientPrivacyArchive = computed(() =>
    this.selectedClient()?.privacyProfile.archive.slice().sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    ) ?? [],
  );
  protected readonly privacyArchiveIndex = computed(() =>
    this.allClients()
      .flatMap((client) =>
        client.privacyProfile.archive.map((entry) => ({
          ...entry,
          clientId: client.id,
          clientName: client.name,
        })),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 12),
  );
  protected readonly inactiveCashOperators = computed(() =>
    this.allCashOperators().filter((operator) => !operator.active),
  );
  protected readonly inactiveCashOperatorNames = computed(() =>
    this.inactiveCashOperators()
      .map((operator) => operator.name)
      .join(', '),
  );
  protected readonly selectedClientQuotes = computed(() => {
    const client = this.selectedClient();

    if (!client) {
      return [];
    }

    return this.allQuotes().filter((item) => item.customerName === client.name).slice(0, 4);
  });
  protected readonly selectedClientAppointments = computed(() => {
    const client = this.selectedClient();

    if (!client) {
      return [];
    }

    return this.allAppointments()
      .filter((item) => item.customerName === client.name)
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
      .slice(0, 4);
  });
  protected readonly selectedClientTickets = computed(() => {
    const client = this.selectedClient();

    if (!client) {
      return [];
    }

    return this.allServiceTickets()
      .filter((item) => item.customerName === client.name)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 4);
  });
  protected readonly selectedClientTicketCount = computed(() => {
    const client = this.selectedClient();

    if (!client) {
      return 0;
    }

    return this.allServiceTickets().filter((item) => item.customerName === client.name).length;
  });
  protected readonly selectedClientRevenue = computed(() => {
    const client = this.selectedClient();

    if (!client) {
      return 0;
    }

    return this.allQuotes()
      .filter((item) => item.customerName === client.name)
      .reduce((total, item) => total + item.value, 0);
  });
  protected readonly selectedClientTimeline = computed(() => {
    const client = this.selectedClient();

    if (!client) {
      return [];
    }

    return [
      ...this.allQuotes()
        .filter((item) => item.customerName === client.name)
        .map((item) => ({
          id: item.id,
          type: 'Preventivo',
          title: item.projectType,
          detail: `€ ${item.value.toLocaleString('it-IT')} · ${item.stage}`,
          date: item.dueDate,
        })),
      ...this.allAppointments()
        .filter((item) => item.customerName === client.name)
        .map((item) => ({
          id: item.id,
          type: 'Agenda',
          title: item.title,
          detail: `${item.technician} · ${item.status}`,
          date: item.scheduledAt,
        })),
      ...this.allServiceTickets()
        .filter((item) => item.customerName === client.name)
        .map((item) => ({
          id: item.id,
          type: 'Ticket',
          title: item.title,
          detail: `${item.technician} · ${item.status}`,
          date: item.closedAt ?? item.createdAt,
        })),
    ]
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 8);
  });
  protected readonly selectedQuoteClient = computed(() => {
    const quote = this.selectedQuote();

    if (!quote) {
      return null;
    }

    return this.allClients().find((item) => item.name === quote.customerName) ?? null;
  });
  protected readonly selectedQuoteAppointments = computed(() => {
    const quote = this.selectedQuote();

    if (!quote) {
      return [];
    }

    return this.allAppointments()
      .filter((item) => item.customerName === quote.customerName)
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
      .slice(0, 4);
  });
  protected readonly quoteFormSelectedService = computed(() => {
    const serviceId = this.quoteForm.controls.serviceId.value || '';
    return this.servicesOnly().find((service) => service.id === serviceId) ?? null;
  });
  protected readonly quoteClientSuggestions = computed(() => {
    const query = this.quoteClientLookup().trim().toLowerCase();

    if (!query || query.length < 2) {
      return [];
    }

    return this.allClients()
      .filter((client) =>
        `${client.name} ${client.phone} ${client.email} ${client.city}`.toLowerCase().includes(query),
      )
      .slice(0, 6);
  });
  protected readonly ticketClientSuggestions = computed(() => {
    const query = this.ticketClientLookup().trim().toLowerCase();

    if (!query || query.length < 2) {
      return [];
    }

    return this.allClients()
      .filter((client) =>
        `${client.name} ${client.phone} ${client.email} ${client.city} ${client.address}`
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 6);
  });
  protected readonly selectedAppointmentClient = computed(() => {
    const appointment = this.selectedAppointment();

    if (!appointment) {
      return null;
    }

    return this.allClients().find((item) => item.name === appointment.customerName) ?? null;
  });
  protected readonly selectedAppointmentQuotes = computed(() => {
    const appointment = this.selectedAppointment();

    if (!appointment) {
      return [];
    }

    return this.allQuotes().filter((item) => item.customerName === appointment.customerName).slice(0, 4);
  });
  protected readonly selectedAppointmentLinkedQuote = computed(() => {
    const appointment = this.selectedAppointment();

    if (!appointment?.linkedQuoteId) {
      return null;
    }

    return this.allQuotes().find((item) => item.id === appointment.linkedQuoteId) ?? null;
  });
  protected readonly appointmentCalendarDays = computed(() => {
    const appointments = [...this.allAppointments()].sort((left, right) =>
      left.scheduledAt.localeCompare(right.scheduledAt),
    );
    const startDate = new Date(this.agendaCurrentDate());
    startDate.setHours(0, 0, 0, 0);

    const mode = this.agendaViewMode();
    let length = 2;
    let actualStart = new Date(startDate);

    if (mode === 'settimanale') {
      length = 7;
      // start from Monday
      const day = actualStart.getDay();
      const diff = actualStart.getDate() - day + (day === 0 ? -6 : 1);
      actualStart = new Date(actualStart.setDate(diff));
    } else if (mode === 'mensile') {
      // month grid: exactly 35 or 42 days starting from the first Monday of the first week of the month
      const firstDay = new Date(actualStart.getFullYear(), actualStart.getMonth(), 1);
      const day = firstDay.getDay();
      const diff = firstDay.getDate() - day + (day === 0 ? -6 : 1);
      actualStart = new Date(firstDay.setDate(diff));
      length = 35; // or 42 depending on how many weeks, but 35 covers most months
    }

    return Array.from({ length }, (_, index) => {
      const currentDate = new Date(actualStart);
      currentDate.setDate(actualStart.getDate() + index);
      const isoDate = currentDate.toISOString().slice(0, 10);

      // if mensile, we don't need 'weekday: long' since grid headers handle it, but we can leave it
      return {
        isoDate,
        isCurrentMonth: mode === 'mensile' ? currentDate.getMonth() === startDate.getMonth() : true,
        label: new Intl.DateTimeFormat('it-IT', {
          weekday: mode === 'mensile' ? 'short' : 'long',
          day: '2-digit',
          month: mode === 'mensile' ? undefined : 'long',
        }).format(currentDate),
        items: appointments.filter((item) => item.scheduledAt.startsWith(isoDate)),
      };
    });
  });

  protected nextAgendaPage(): void {
    const mode = this.agendaViewMode();
    const d = new Date(this.agendaCurrentDate());
    if (mode === 'agendina') {
      d.setDate(d.getDate() + 2);
    } else if (mode === 'settimanale') {
      d.setDate(d.getDate() + 7);
    } else {
      d.setMonth(d.getMonth() + 1);
    }
    this.agendaCurrentDate.set(d.toISOString().slice(0, 10));
  }

  protected prevAgendaPage(): void {
    const mode = this.agendaViewMode();
    const d = new Date(this.agendaCurrentDate());
    if (mode === 'agendina') {
      d.setDate(d.getDate() - 2);
    } else if (mode === 'settimanale') {
      d.setDate(d.getDate() - 7);
    } else {
      d.setMonth(d.getMonth() - 1);
    }
    this.agendaCurrentDate.set(d.toISOString().slice(0, 10));
  }

  protected getAppointmentStyle(item: AppointmentRecord): Record<string, string> {
    const startHour = 8; // Timeline starts at 8:00
    const pixelsPerMinute = 1.5; // 1.5px per minute = 90px per hour

    const timePart = item.scheduledAt.slice(11, 16); // "HH:mm"
    const [hh, mm] = timePart.split(':').map(Number);

    const totalMinutesFromStart = (hh * 60 + mm) - (startHour * 60);
    const topPx = Math.max(0, totalMinutesFromStart * pixelsPerMinute);
    const heightPx = item.durationMinutes * pixelsPerMinute;

    return {
      top: `${topPx}px`,
      height: `${heightPx}px`
    };
  }

  protected appointmentCountByType(type: AppointmentRecord['appointmentType']): number {
    return this.appointmentCountsByType()[type] ?? 0;
  }

  protected appointmentTypeLabel(type: AppointmentRecord['appointmentType']): string {
    return (
      this.appointmentTypeCards.find((item) => item.value === type)?.label ??
      'Appuntamento'
    );
  }

  protected appointmentLocationShortLabel(
    location: AppointmentRecord['locationType'],
  ): string {
    switch (location) {
      case 'showroom':
        return 'Showroom';
      case 'domicilio':
        return 'Esterno';
      case 'officina':
        return 'Laboratorio';
      default:
        return 'Da definire';
    }
  }

  protected employeeLeaveTypeLabel(type: EmployeeLeaveRecord['leaveType']): string {
    switch (type) {
      case 'ferie':
        return 'Ferie';
      case 'permesso':
        return 'Permesso';
      case 'malattia':
        return 'Malattia';
      default:
        return 'Assenza';
    }
  }

  protected employeeLeaveShortLabel(type: EmployeeLeaveRecord['leaveType']): string {
    switch (type) {
      case 'ferie':
        return 'FER';
      case 'permesso':
        return 'PER';
      case 'malattia':
        return 'MAL';
      default:
        return 'ASS';
    }
  }

  protected employeeLeavesForDate(isoDate: string) {
    return this.agendaLeaveEvents().filter((leave) => leave.isoDate === isoDate);
  }

  protected submitEmployeeLeave(): void {
    if (this.employeeLeaveForm.invalid) {
      this.employeeLeaveForm.markAllAsTouched();
      return;
    }

    const value = this.employeeLeaveForm.getRawValue();
    const employee = this.allCashOperators().find((item) => item.id === value.employeeId);

    if (!employee) {
      return;
    }

    if (value.endDate! < value.startDate!) {
      this.pushToast('La data finale deve essere uguale o successiva alla data iniziale.', 'error');
      return;
    }

    this.data.addEmployeeLeave({
      employeeId: employee.id,
      employeeName: employee.name,
      leaveType: value.leaveType!,
      startDate: value.startDate!,
      endDate: value.endDate!,
      note: (value.note ?? '').trim(),
      status: 'approvata',
      returnShiftPatternIndex: value.returnShiftPatternIndex,
    });

    this.employeeLeaveForm.reset({
      employeeId: '',
      leaveType: 'ferie',
      startDate: '',
      endDate: '',
      note: '',
      returnShiftPatternIndex: null
    });
  }

  protected removeEmployeeLeave(id: string): void {
    const leave = this.employeeLeaves().find((item) => item.id === id);

    // Conferma esplicita: l'assenza sparisce dal registro e dai conteggi ferie/permessi
    const confirmed = window.confirm(
      leave
        ? `Eliminare l'assenza di "${leave.employeeName}" (${this.employeeLeaveTypeLabel(leave.leaveType)} dal ${leave.startDate} al ${leave.endDate})?`
        : 'Eliminare questa assenza dal registro?',
    );
    if (!confirmed) {
      return;
    }

    this.data.deleteEmployeeLeave(id);
  }

  protected setEmployeeScheduleView(mode: 'mese' | 'periodo'): void {
    this.employeeScheduleView.set(mode);

    if (mode === 'periodo') {
      const selectedMonth = this.employeeScheduleMonth();
      this.employeePeriodFrom.set(this.startOfMonthIso(selectedMonth));
      this.employeePeriodTo.set(this.endOfMonthIso(selectedMonth));
    }
  }

  protected prevEmployeeScheduleMonth(): void {
    const base = this.parseIsoDate(this.employeeScheduleMonth());
    base.setMonth(base.getMonth() - 1);
    base.setDate(1);
    this.employeeScheduleMonth.set(this.toIsoDate(base));
  }

  protected nextEmployeeScheduleMonth(): void {
    const base = this.parseIsoDate(this.employeeScheduleMonth());
    base.setMonth(base.getMonth() + 1);
    base.setDate(1);
    this.employeeScheduleMonth.set(this.toIsoDate(base));
  }

  protected resetEmployeeScheduleMonth(): void {
    const currentMonth = this.startOfMonthIso(this.toIsoDate(new Date()));
    this.employeeScheduleMonth.set(currentMonth);
  }

  protected updateEmployeeScheduleMonth(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const value = target?.value?.trim();
    if (!value) {
      return;
    }

    this.employeeScheduleMonth.set(`${value}-01`);
  }

  protected applySelectedMonthToEmployeePeriod(): void {
    const selectedMonth = this.employeeScheduleMonth();
    this.employeePeriodFrom.set(this.startOfMonthIso(selectedMonth));
    this.employeePeriodTo.set(this.endOfMonthIso(selectedMonth));
    this.employeeScheduleView.set('periodo');
  }

  protected applyCurrentMonthToEmployeePeriod(): void {
    const currentMonth = this.startOfMonthIso(this.toIsoDate(new Date()));
    this.employeeScheduleMonth.set(currentMonth);
    this.employeePeriodFrom.set(this.startOfMonthIso(currentMonth));
    this.employeePeriodTo.set(this.endOfMonthIso(currentMonth));
    this.employeeScheduleView.set('periodo');
  }

  protected updateEmployeePeriodFrom(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.employeePeriodFrom.set(target?.value ?? '');
  }

  protected updateEmployeePeriodTo(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.employeePeriodTo.set(target?.value ?? '');
  }

  protected updateEmployeeLeaveTypeFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.employeeLeaveTypeFilter.set((target?.value as 'tutte' | EmployeeLeaveRecord['leaveType']) ?? 'tutte');
  }

  protected updateEmployeeLeaveEmployeeFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.employeeLeaveEmployeeFilter.set((target?.value as 'tutti' | string) ?? 'tutti');
  }

  protected exportEmployeePayrollPdf(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const summary = this.employeeScheduleSummary();
    const range = this.employeeScheduleRange();
    const registerDays = this.employeeRegisterDays();
    const registerRows = this.employeeAttendanceRegisterRows();
    const company = this.companyProfile();
    const manualAbsenceRows = this.allEmployeeAttendanceRecords()
      .filter((record) => record.status === 'assenza')
      .filter((record) => record.date >= range.from && record.date <= range.to)
      .filter((record) => this.payrollEmployees().some((employee) => employee.id === record.employeeId))
      .map(
        (record) => `<tr>
          <td>${this.escapeHtml(record.employeeName)}</td>
          <td>Assenza</td>
          <td>${this.escapeHtml(this.formatIsoDateLabel(record.date))}</td>
          <td>${this.escapeHtml(this.formatIsoDateLabel(record.date))}</td>
          <td style="text-align:right">1</td>
          <td>${this.escapeHtml(record.note || 'Assenza giornaliera registrata dal registro presenze')}</td>
        </tr>`,
      )
      .join('');
    const leaveRows = this.filteredEmployeeLeavesByRange()
      .map(
        (leave) => `<tr>
          <td>${this.escapeHtml(leave.employeeName)}</td>
          <td>${this.escapeHtml(this.employeeLeaveTypeLabel(leave.leaveType))}</td>
          <td>${this.escapeHtml(this.formatIsoDateLabel(leave.visibleStart))}</td>
          <td>${this.escapeHtml(this.formatIsoDateLabel(leave.visibleEnd))}</td>
          <td style="text-align:right">${leave.daysInRange}</td>
          <td>${this.escapeHtml(leave.note || '—')}</td>
        </tr>`,
      )
      .join('');
    const absenceRows = `${leaveRows}${manualAbsenceRows}`;
    const detailRows = registerRows
      .flatMap((row) =>
        row.days
          .filter(
            (day) =>
              !day.isFuture &&
              !day.isLeave &&
              (day.manualOverride || day.overtimeMinutes > 0 || !!day.note.trim()),
          )
          .map(
            (day) => `<tr>
              <td>${this.escapeHtml(row.employee.name)}</td>
              <td>${this.escapeHtml(this.formatIsoDateLabel(day.date))}</td>
              <td>${this.escapeHtml(this.employeeAttendanceStatusLabel(day.status))}</td>
              <td>${this.escapeHtml(day.actualStartTime && day.actualEndTime ? `${day.actualStartTime} - ${day.actualEndTime}` : '—')}</td>
              <td style="text-align:right">${day.breakMinutes || 0}</td>
              <td style="text-align:right">${this.escapeHtml(this.formatMinutesToHoursLabel(day.overtimeMinutes))}</td>
              <td>${this.escapeHtml(day.note || (day.manualOverride ? 'Rettifica manuale dal registro presenze' : 'Straordinario maturato'))}</td>
            </tr>`,
          ),
      )
      .join('');
    const registerHead = registerDays
      .map(
        (day) => `<th class="${day.isWeekend ? 'weekend' : ''}">
          <strong>${day.dayNumber}</strong>
          <small>${this.escapeHtml(day.weekdayLabel)}</small>
        </th>`,
      )
      .join('');
    const registerBody = registerRows
      .map((row) => {
        const dayCells = row.days
          .map(
            (day) => `<td class="${day.tone} ${day.isWeekend ? 'weekend' : ''}">
              <strong>${this.escapeHtml(day.primaryLabel)}</strong>
              ${day.secondaryLabel ? `<small>${this.escapeHtml(day.secondaryLabel)}</small>` : ''}
            </td>`,
          )
          .join('');

        return `<tr>
          <th class="name-col">
            <strong>${this.escapeHtml(row.employee.name)}</strong>
            <small>${this.escapeHtml(row.employee.jobTitle || this.employeeRoleLabel(row.employee.role))}</small>
            <span>${this.escapeHtml(this.employeeContractLabel(row.employee.contractHoursWeekly))}</span>
          </th>
          ${dayCells}
          <td class="total-col"><strong>${this.escapeHtml(this.formatMinutesToHoursLabel(row.totalWorkedMinutes))}</strong></td>
          <td class="total-col"><strong>${this.escapeHtml(this.formatMinutesToHoursLabel(row.totalOvertimeMinutes))}</strong></td>
        </tr>`;
      })
      .join('');
    const popup = window.open('', '_blank', 'width=1180,height=820');

    if (!popup) {
      this.pushToast('Popup bloccato dal browser: impossibile aprire il PDF turni e assenze.', 'error');
      return;
    }

    popup.document.write(`
      <html>
      <head>
        <title>${this.escapeHtml(`Turni e assenze ${range.label}`)}</title>
        <style>
          body{font-family:Inter,Arial,sans-serif;padding:24px;color:#132033;background:linear-gradient(180deg,#e7eef8 0%,#f4f7fb 100%)}
          h1,h2{margin:0 0 12px}
          p{margin:0 0 8px}
          .hero{display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-bottom:18px}
          .hero-box,.summary-box,.register-shell,.notes-shell,.detail-shell{border:1px solid #c8d7ea;border-radius:18px;background:#ffffff;box-shadow:0 14px 36px rgba(15,23,42,0.08)}
          .hero-box{padding:20px 22px;background:linear-gradient(135deg,#edf4ff 0%,#ffffff 56%,#f4f8ff 100%);display:flex;align-items:center;gap:20px}
          .hero-box h1{color:#1d4ed8;font-size:28px}
          .hero-box p,.hero-side p{color:#425166}
          .hero-side{padding:20px 22px;background:linear-gradient(135deg,#eaf2ff 0%,#ffffff 100%)}
          .meta-strip{margin-top:14px;padding:12px 14px;border-radius:14px;border:1px solid #d9e4f2;background:#f7fbff;color:#475569;font-size:12px;line-height:1.5}
          .summary{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:18px}
          .summary-box{padding:12px 14px}
          .summary-box strong{display:block;color:#1d4ed8;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
          .summary-box span{display:block;margin-top:6px;font-size:22px;font-weight:800}
          .register-shell{overflow:hidden;margin-top:18px}
          .register-title{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#ffffff}
          .register-title strong{font-size:20px;font-style:italic}
          .legend{display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px;background:#f1f6ff;border-bottom:1px solid #c8d7ea}
          .legend span{display:inline-flex;align-items:center;justify-content:center;padding:6px 10px;border-radius:999px;border:1px solid #cddcf1;font-size:12px;font-weight:700;background:#ffffff}
          .register-wrap{overflow-x:auto}
          .register-table{width:100%;border-collapse:collapse;table-layout:fixed}
          .register-table th,.register-table td{border:1px solid #d8e2ef;padding:0;text-align:center;vertical-align:middle}
          .register-table thead th{background:#dbeafe;color:#132033;padding:6px 2px}
          .register-table thead th.weekend{background:#fef3c7}
          .register-table thead th strong,.register-table thead th small{display:block}
          .register-table thead th small{font-size:10px;color:#516174}
          .name-col{background:#eef4ff;padding:8px;text-align:left;width:180px}
          .name-col strong,.name-col small,.name-col span{display:block}
          .name-col strong{font-size:15px;color:#1d4ed8}
          .name-col small,.name-col span{font-size:11px;color:#435165}
          .register-table td{height:54px;background:#ffffff}
          .register-table td.weekend{background:#fffbeb}
          .register-table td strong,.register-table td small{display:block}
          .register-table td strong{font-size:15px}
          .register-table td small{font-size:10px;color:#516174}
          .register-table td.worked{background:#eefbf1}
          .register-table td.leave{background:#edf4ff;color:#1f4fbf}
          .register-table td.rest{background:#f3f6fa;color:#64748b}
          .register-table td.future{background:#fff8e7;color:#946200}
          .register-table td.absence{background:#fff0f0;color:#c62828}
          .total-col{background:#f3f7ff;font-weight:800;width:82px}
          .notes-shell{margin-top:18px}
          .notes-title{padding:12px 16px;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#ffffff;font-size:18px;font-style:italic}
          .notes-table{width:100%;border-collapse:collapse}
          .notes-table th,.notes-table td{border:1px solid #d3dfef;padding:8px 10px;text-align:left;vertical-align:top}
          .notes-table th{background:#eff5ff}
          .detail-shell{margin-top:18px;overflow:hidden}
          .detail-title{padding:12px 16px;background:linear-gradient(135deg,#0f172a,#1e293b);color:#ffffff;font-size:18px}
          .detail-table{width:100%;border-collapse:collapse}
          .detail-table th,.detail-table td{border:1px solid #d3dfef;padding:8px 10px;text-align:left;vertical-align:top}
          .detail-table th{background:#f8fafc}
          .detail-table td:last-child{width:28%}
          @page { size: landscape; margin: 10mm; }
          @media print{body{background:#ffffff;padding:0}.hero{grid-template-columns:1.7fr 1fr}.register-shell,.notes-shell,.summary-box,.hero-box,.hero-side,.detail-shell{box-shadow:none}}
        </style>
      </head>
      <body>
        <div class="hero">
          <div class="hero-box">
            ${company.logoUrl ? `<img src="${company.logoUrl}" alt="Logo" style="max-height: 80px; border-radius: 8px; object-fit: contain;">` : ''}
            <div>
              <h1>Registro presenze dipendenti</h1>
              <p>${this.escapeHtml(company.legalName || 'AudioMax')}</p>
              <p>Periodo esportato: ${this.escapeHtml(range.label)}</p>
              <p>Data export: ${this.escapeHtml(new Date().toLocaleString('it-IT'))}</p>
              <div class="meta-strip">
                Le giornate concluse vengono precompilate dal turno standard del dipendente.
                Ferie, permessi, malattie e rettifiche manuali hanno sempre priorità nel registro.
              </div>
            </div>
          </div>
          <div class="hero-side hero-box" style="display: block;">
            <h2>Uso paghe</h2>
            <p>Prospetto mensile con giorni del mese, ore lavorate, straordinari e note operative pronto per la stampa in PDF.</p>
          </div>
        </div>

        <div class="summary">
          <div class="summary-box"><strong>Dipendenti</strong><span>${summary.employees}</span></div>
          <div class="summary-box"><strong>Assenze</strong><span>${summary.records}</span></div>
          <div class="summary-box"><strong>Ore registrate</strong><span>${this.escapeHtml(this.formatMinutesToHoursLabel(summary.workedMinutes))}</span></div>
          <div class="summary-box"><strong>Straordinari</strong><span>${this.escapeHtml(this.formatMinutesToHoursLabel(summary.overtimeMinutes))}</span></div>
          <div class="summary-box"><strong>Ferie</strong><span>${summary.ferie}</span></div>
          <div class="summary-box"><strong>Perm. + Mal.</strong><span>${summary.permessi + summary.malattie}</span></div>
        </div>

        <div class="register-shell">
          <div class="register-title">
            <strong>Presenze mese / periodo</strong>
            <span>${this.escapeHtml(range.label)}</span>
          </div>
          <div class="legend">
            <span>Ore = lavorato</span>
            <span>F/P/M = assenza giustificata</span>
            <span>R = riposo</span>
            <span>A = assenza</span>
          </div>
          <div class="register-wrap">
            <table class="register-table">
              <thead>
                <tr>
                  <th class="name-col">Dipendenti</th>
                  ${registerHead}
                  <th>Tot ore</th>
                  <th>Straord.</th>
                </tr>
              </thead>
              <tbody>
                ${registerBody || `<tr><td colspan="${registerDays.length + 3}" style="padding:16px">Nessun dipendente disponibile nel periodo selezionato.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <div class="notes-shell">
          <div class="notes-title">Note, assenze e certificati</div>
          <table class="notes-table">
            <thead>
              <tr><th>Dipendente</th><th>Tipo</th><th>Dal</th><th>Al</th><th style="text-align:right">Giorni</th><th>Nota</th></tr>
            </thead>
            <tbody>${absenceRows || '<tr><td colspan="6">Nessuna assenza nel periodo selezionato.</td></tr>'}</tbody>
          </table>
        </div>

        <div class="detail-shell">
          <div class="detail-title">Rettifiche operative e straordinari</div>
          <table class="detail-table">
            <thead>
              <tr><th>Dipendente</th><th>Giorno</th><th>Esito</th><th>Orario</th><th style="text-align:right">Pausa</th><th style="text-align:right">Straord.</th><th>Nota</th></tr>
            </thead>
            <tbody>${detailRows || '<tr><td colspan="7">Nessuna rettifica manuale o straordinario nel periodo selezionato.</td></tr>'}</tbody>
          </table>
        </div>
      </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    setTimeout(() => {
      popup.print();
    }, 250);
  }

  protected formatIsoDateLabel(value: string): string {
    if (!value) {
      return 'Data da definire';
    }

    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${value}T00:00:00`));
  }

  protected formatIsoDateTimeLabel(value: string | null | undefined): string {
    if (!value) {
      return 'Non disponibile';
    }

    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  protected formatMonthYearLabel(value: string): string {
    return new Intl.DateTimeFormat('it-IT', {
      month: 'long',
      year: 'numeric',
    }).format(this.parseIsoDate(value));
  }

  private expandDateRange(startDate: string, endDate: string): string[] {
    if (!startDate || !endDate) {
      return [];
    }

    const result: string[] = [];
    const cursor = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    while (cursor <= end) {
      result.push(this.toIsoDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }

  private parseIsoDate(value: string): Date {
    return new Date(`${value}T00:00:00`);
  }

  private toIsoDate(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private previousIsoDate(value: string): string {
    const date = this.parseIsoDate(value);
    date.setDate(date.getDate() - 1);
    return this.toIsoDate(date);
  }

  private startOfMonthIso(value: string): string {
    const date = this.parseIsoDate(value);
    return this.toIsoDate(new Date(date.getFullYear(), date.getMonth(), 1));
  }

  private endOfMonthIso(value: string): string {
    const date = this.parseIsoDate(value);
    return this.toIsoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  }

  private normalizeIsoRange(from: string, to: string): { from: string; to: string } {
    return from <= to ? { from, to } : { from: to, to: from };
  }

  private isoRangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
    return startA <= endB && endA >= startB;
  }

  private maxIsoDate(left: string, right: string): string {
    return left >= right ? left : right;
  }

  private minIsoDate(left: string, right: string): string {
    return left <= right ? left : right;
  }

  private countInclusiveIsoDays(from: string, to: string): number {
    const start = this.parseIsoDate(from);
    const end = this.parseIsoDate(to);
    const diff = end.getTime() - start.getTime();
    return Math.floor(diff / 86_400_000) + 1;
  }

  private weekdayKeyFromDate(value: Date): EmployeeShiftDayKey {
    const weekdayMap: Record<number, EmployeeShiftDayKey> = {
      0: 'dom',
      1: 'lun',
      2: 'mar',
      3: 'mer',
      4: 'gio',
      5: 'ven',
      6: 'sab',
    };
    return weekdayMap[value.getDay()];
  }
  protected readonly selectedTicketQuote = computed(() => {
    const ticket = this.selectedServiceTicket();

    if (!ticket?.linkedQuoteId) {
      return null;
    }

    return this.allQuotes().find((item) => item.id === ticket.linkedQuoteId) ?? null;
  });
  protected readonly selectedTicketAppointment = computed(() => {
    const ticket = this.selectedServiceTicket();

    if (!ticket?.linkedAppointmentId) {
      return null;
    }

    return this.allAppointments().find((item) => item.id === ticket.linkedAppointmentId) ?? null;
  });
  protected readonly selectedTicketClient = computed(() => {
    const ticket = this.selectedServiceTicket();

    if (!ticket) {
      return null;
    }

    return this.allClients().find((item) => item.name === ticket.customerName) ?? null;
  });
  protected readonly ticketDraftClient = computed(() => {
    const customerName = this.ticketForm.controls.customerName.value.trim().toLowerCase();

    if (!customerName) {
      return null;
    }

    return this.allClients().find((item) => item.name.trim().toLowerCase() === customerName) ?? null;
  });
  protected readonly ticketDraftLinkedQuote = computed(() => {
    const quoteId = this.ticketForm.controls.linkedQuoteId.value;
    if (!quoteId) {
      return null;
    }

    return this.allQuotes().find((item) => item.id === quoteId) ?? null;
  });
  protected readonly ticketDraftLinkedAppointment = computed(() => {
    const appointmentId = this.ticketForm.controls.linkedAppointmentId.value;
    if (!appointmentId) {
      return null;
    }

    return this.allAppointments().find((item) => item.id === appointmentId) ?? null;
  });
  protected readonly selectedInventoryTickets = computed(() => {
    const inventory = this.selectedInventoryItem();

    if (!inventory) {
      return [];
    }

    return this.allServiceTickets()
      .filter((ticket) =>
        ticket.materialLines.some((line) => line.inventoryItemId === inventory.id),
      )
      .slice(0, 4);
  });
  protected readonly selectedTicketMaterialCount = computed(() => {
    const ticket = this.selectedServiceTicket();

    if (!ticket?.materialSummary.trim()) {
      return 0;
    }

    return ticket.materialSummary
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean).length;
  });
  protected readonly cashSubtotal = computed(() =>
    this.cashCart().reduce((sum, line) => sum + line.total, 0),
  );
  protected readonly cashItemCount = computed(() =>
    this.cashCart().reduce((sum, line) => sum + line.quantity, 0),
  );
  protected readonly cashDiscountAmount = computed(() => {
    if (this.cashDiscountType() === 'percentuale') {
      return this.cashSubtotal() * (this.cashDiscountValue() / 100);
    }
    return this.cashDiscountValue();
  });
  protected readonly cashServiceHours = computed(() =>
    this.cashCart()
      .filter((line) => line.pricingMode === 'ora')
      .reduce((sum, line) => sum + line.quantity, 0),
  );
  protected readonly cashChange = computed(() =>
    this.cashPaymentMethod() === 'misto'
      ? Math.max(this.cashReceivedAmount() - this.cashMixedCashAmount(), 0)
      : Math.max(this.cashReceivedAmount() - this.cashEffectiveTotal(), 0),
  );
  protected readonly cashReceiptLinesCount = computed(
    () => this.selectedCashTransaction()?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0,
  );
  protected readonly cashVisibleReceiptLines = computed(() =>
    this.cashCart().filter((line) => !line.excludeFromReceipt),
  );
  protected readonly cashHiddenReceiptLines = computed(() =>
    this.cashCart().filter((line) => line.excludeFromReceipt),
  );
  // Importo totale delle righe contrassegnate "fuori scontrino"
  protected readonly cashHiddenReceiptTotal = computed(() =>
    this.cashHiddenReceiptLines().reduce((sum, line) => sum + line.total, 0),
  );
  protected readonly cashPaidTransactionsTotal = computed(() =>
    this.allCashTransactions()
      .filter((transaction) => transaction.status === 'pagato')
      .reduce((sum, transaction) => sum + transaction.total, 0),
  );
  protected readonly cashTransactionsTotalCount = computed(() => this.allCashTransactions().length);
  protected readonly cashTotalsByMethod = computed(() => {
    const paidTransactions = this.allCashTransactions().filter(
      (transaction) => transaction.status === 'pagato',
    );

    return paidTransactions.reduce(
      (totals, transaction) => {
        if (transaction.paymentMethod === 'misto' && transaction.paymentSplit) {
          totals.contanti += transaction.paymentSplit.contanti;
          if (transaction.paymentSplit.elettronicoMethod !== 'bonifico') {
            totals.pos += transaction.paymentSplit.elettronico;
          } else {
            totals.bonifico += transaction.paymentSplit.elettronico;
          }
          totals.misto += transaction.total;
          return totals;
        }

        totals[transaction.paymentMethod] += transaction.total;
        return totals;
      },
      {
        contanti: 0,
        pos: 0,
        bonifico: 0,
        misto: 0,
      },
    );
  });
  protected readonly cashUnpaidTransactionsTotal = computed(() =>
    this.cashPendingTransactions().reduce((sum, transaction) => sum + (transaction.total - (transaction.receivedAmount || 0)), 0),
  );

  protected readonly clientPendingAlerts = computed(() =>
    this.filteredClients().filter((client) => this.clientHasPendingTransactions(client.id)).length,
  );

  protected readonly cashPendingTransactionsCount = computed(() => this.cashPendingTransactions().length);

  protected readonly cashPendingTransactionsLabel = computed(() =>
    this.cashPendingTransactionsCount() === 1 ? '1 insoluto aperto' : `${this.cashPendingTransactionsCount()} insoluti aperti`,
  );
  protected readonly cashSelectedClientPendingLabel = computed(() =>
    this.cashSelectedClientPendingTransactions().length === 1
      ? '1 insoluto aperto'
      : `${this.cashSelectedClientPendingTransactions().length} insoluti aperti`,
  );

  protected readonly cashSettlementTitle = computed(() => {
    const transaction = this.cashPendingTransaction();
    return transaction ? `Saldo insoluto ${transaction.reference}` : 'Pagamento';
  });

  protected cashPaymentMethodLabel(): string {
    const method = this.cashPaymentMethod();

    if (method === 'pos') {
      return this.cashPosElectronicMethod() === 'bancomat' ? 'POS · Bancomat' : 'POS · Carta di credito';
    }

    if (method === 'bonifico') {
      return 'Bonifico';
    }

    if (method === 'misto') {
      const electronic = this.cashMixedElectronicMethod();
      if (electronic === 'bonifico') {
        return 'Misto · Bonifico';
      }
      return electronic === 'bancomat' ? 'Misto · Bancomat' : 'Misto · Carta di credito';
    }

    return 'Contanti';
  }

  protected readonly cashRegisteredReceivedAmount = computed(() => {
    if (this.cashPaymentMethod() === 'contanti') {
      return this.cashReceivedAmount();
    }
    if (this.cashPaymentMethod() === 'misto') {
      return this.cashMixedCashAmount();
    }
    return this.cashEffectiveTotal();
  });

  protected readonly cashActivePaymentSplit = computed<CashPaymentSplit | null>(() => {
    if (this.cashPaymentMethod() !== 'misto') {
      return null;
    }

    return {
      contanti: this.cashMixedCashAmount(),
      elettronico: this.cashMixedElectronicAmount(),
      elettronicoMethod: this.cashMixedElectronicMethod(),
    };
  });
  protected readonly cashTopCategories = computed(() => {
    const totals = new Map<string, number>();

    for (const transaction of this.allCashTransactions().filter((item) => item.status === 'pagato')) {
      for (const line of transaction.lines) {
        const product = this.allCashProducts().find((item) => item.id === line.productId);
        const category = product?.category ?? 'servizi';
        totals.set(category, (totals.get(category) ?? 0) + line.total);
      }
    }

    return [...totals.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((left, right) => right.total - left.total)
      .slice(0, 4);
  });
  protected readonly cashTodayReceiptCount = computed(() =>
    this.allCashTransactions().filter((transaction) => transaction.receiptNumber !== null).length,
  );
  protected readonly cashTodayInvoiceCount = computed(() =>
    this.allCashTransactions().filter((transaction) => transaction.invoiceNumber !== null).length,
  );
  protected readonly cashTodayDiscountTotal = computed(() =>
    this.allCashTransactions()
      .filter((transaction) => transaction.status === 'pagato')
      .reduce((sum, transaction) => sum + (transaction.discountAmount || 0), 0),
  );
  protected readonly cashClosureReceiptRange = computed(() => {
    const receipts = this.allCashTransactions()
      .filter((transaction) => transaction.receiptNumber !== null)
      .map((transaction) => transaction.receiptNumber!)
      .sort((left, right) => left - right);
    if (!receipts.length) {
      return 'Nessuno scontrino';
    }
    return receipts.length === 1
      ? `Scontrino n. ${receipts[0]}`
      : `Scontrini n. ${receipts[0]} – ${receipts[receipts.length - 1]}`;
  });
  protected readonly cashClosureInvoiceRange = computed(() => {
    const invoices = this.allCashTransactions()
      .filter((transaction) => transaction.invoiceNumber !== null)
      .map((transaction) => transaction.invoiceNumber!)
      .sort((left, right) => left - right);
    if (!invoices.length) {
      return '';
    }
    return invoices.length === 1
      ? `Fattura n. ${invoices[0]}`
      : `Fatture n. ${invoices[0]} – ${invoices[invoices.length - 1]}`;
  });
  protected readonly cashByOperator = computed(() => {
    const totals = new Map<string, { operator: string; total: number; count: number }>();
    for (const transaction of this.allCashTransactions().filter((item) => item.status === 'pagato')) {
      for (const line of transaction.lines) {
        const current = totals.get(line.operatorName) ?? { operator: line.operatorName, total: 0, count: 0 };
        current.total += line.total;
        current.count += line.quantity;
        totals.set(line.operatorName, current);
      }
    }
    return [...totals.values()].sort((left, right) => right.total - left.total);
  });
  protected readonly reportPeriodOptions: ReportPeriodOption[] = [
    { value: 'oggi', label: 'Oggi' },
    { value: 'ultimi-7', label: 'Ultimi 7 giorni' },
    { value: 'ultimi-30', label: 'Ultimi 30 giorni' },
    { value: 'mese-corrente', label: 'Mese corrente' },
    { value: 'mese-precedente', label: 'Mese precedente' },
    { value: 'trimestre-corrente', label: 'Trimestre corrente' },
    { value: 'anno-corrente', label: 'Anno corrente' },
    { value: 'anno-precedente', label: 'Anno precedente' },
    { value: 'custom', label: 'Personalizzato' },
  ];
  protected readonly reportPeriodRange = computed<ReportPeriodRange>(() =>
    this.buildReportPeriodRange(
      this.reportPeriodPreset(),
      this.reportPeriodFrom(),
      this.reportPeriodTo(),
      this.reportComparePrevious(),
    ),
  );
  protected readonly reportCurrentPaidTransactions = computed(() =>
    this.filterRecordsByIsoDate(
      this.allCashTransactions().filter((transaction) => transaction.status === 'pagato'),
      (transaction) => transaction.settledAt || transaction.createdAt,
      this.reportPeriodRange().from,
      this.reportPeriodRange().to,
    ),
  );
  protected readonly reportPreviousPaidTransactions = computed(() =>
    this.filterRecordsByIsoDate(
      this.allCashTransactions().filter((transaction) => transaction.status === 'pagato'),
      (transaction) => transaction.settledAt || transaction.createdAt,
      this.reportPeriodRange().previousFrom,
      this.reportPeriodRange().previousTo,
    ),
  );
  protected readonly reportCurrentQuotes = computed(() =>
    this.filterRecordsByIsoDate(
      this.allQuotes(),
      (quote) => quote.issueDate || quote.dueDate,
      this.reportPeriodRange().from,
      this.reportPeriodRange().to,
    ),
  );
  protected readonly reportPreviousQuotes = computed(() =>
    this.filterRecordsByIsoDate(
      this.allQuotes(),
      (quote) => quote.issueDate || quote.dueDate,
      this.reportPeriodRange().previousFrom,
      this.reportPeriodRange().previousTo,
    ),
  );
  protected readonly reportCurrentExpenses = computed(() =>
    this.filterRecordsByIsoDate(
      this.allExpenseRecords().filter((expense) => expense.status !== 'annullata'),
      (expense) => expense.expenseDate,
      this.reportPeriodRange().from,
      this.reportPeriodRange().to,
    ),
  );
  protected readonly reportPreviousExpenses = computed(() =>
    this.filterRecordsByIsoDate(
      this.allExpenseRecords().filter((expense) => expense.status !== 'annullata'),
      (expense) => expense.expenseDate,
      this.reportPeriodRange().previousFrom,
      this.reportPeriodRange().previousTo,
    ),
  );
  protected readonly reportCurrentDdts = computed(() =>
    this.filterRecordsByIsoDate(
      this.ddtDocuments(),
      (record) => record.documentDate || record.createdAt,
      this.reportPeriodRange().from,
      this.reportPeriodRange().to,
    ),
  );
  protected readonly reportPreviousDdts = computed(() =>
    this.filterRecordsByIsoDate(
      this.ddtDocuments(),
      (record) => record.documentDate || record.createdAt,
      this.reportPeriodRange().previousFrom,
      this.reportPeriodRange().previousTo,
    ),
  );
  protected readonly reportCurrentAppointments = computed(() =>
    this.filterRecordsByIsoDate(
      this.allAppointments(),
      (appointment) => appointment.scheduledAt,
      this.reportPeriodRange().from,
      this.reportPeriodRange().to,
    ),
  );
  protected readonly reportPreviousAppointments = computed(() =>
    this.filterRecordsByIsoDate(
      this.allAppointments(),
      (appointment) => appointment.scheduledAt,
      this.reportPeriodRange().previousFrom,
      this.reportPeriodRange().previousTo,
    ),
  );
  protected readonly reportCurrentTickets = computed(() =>
    this.filterRecordsByIsoDate(
      this.allServiceTickets(),
      (ticket) => ticket.createdAt,
      this.reportPeriodRange().from,
      this.reportPeriodRange().to,
    ),
  );
  protected readonly reportPreviousTickets = computed(() =>
    this.filterRecordsByIsoDate(
      this.allServiceTickets(),
      (ticket) => ticket.createdAt,
      this.reportPeriodRange().previousFrom,
      this.reportPeriodRange().previousTo,
    ),
  );
  protected readonly reportCurrentWarehouseMovements = computed(() =>
    this.filterRecordsByIsoDate(
      this.allWarehouseMovements(),
      (movement) => movement.movedAt,
      this.reportPeriodRange().from,
      this.reportPeriodRange().to,
    ),
  );
  protected readonly reportPreviousWarehouseMovements = computed(() =>
    this.filterRecordsByIsoDate(
      this.allWarehouseMovements(),
      (movement) => movement.movedAt,
      this.reportPeriodRange().previousFrom,
      this.reportPeriodRange().previousTo,
    ),
  );
  protected readonly reportCurrentWarehousePurchases = computed(() =>
    this.filterRecordsByIsoDate(
      this.allWarehousePurchases(),
      (purchase) => purchase.receivedDate,
      this.reportPeriodRange().from,
      this.reportPeriodRange().to,
    ),
  );
  protected readonly reportPreviousWarehousePurchases = computed(() =>
    this.filterRecordsByIsoDate(
      this.allWarehousePurchases(),
      (purchase) => purchase.receivedDate,
      this.reportPeriodRange().previousFrom,
      this.reportPeriodRange().previousTo,
    ),
  );
  protected readonly reportCurrentClientRows = computed<ReportClientActivityRow[]>(() => {
    const rows = new Map<string, ReportClientActivityRow>();
    const clientsById = new Map(this.allClients().map((client) => [client.id, client]));
    const clientsByName = new Map(
      this.allClients().map((client) => [this.normalizeLookup(client.name), client]),
    );

    const ensureRow = (client: ClientRecord | null): ReportClientActivityRow | null => {
      if (!client) {
        return null;
      }
      const current =
        rows.get(client.id) ??
        {
          client,
          revenue: 0,
          quotes: 0,
          appointments: 0,
          tickets: 0,
          ddts: 0,
          activities: 0,
        };
      rows.set(client.id, current);
      return current;
    };

    for (const transaction of this.reportCurrentPaidTransactions()) {
      const client =
        (transaction.clientId ? clientsById.get(transaction.clientId) ?? null : null) ??
        clientsByName.get(this.normalizeLookup(transaction.customerName)) ??
        null;
      const row = ensureRow(client);
      if (!row) continue;
      row.revenue += transaction.total;
      row.activities += 1;
    }

    for (const quote of this.reportCurrentQuotes()) {
      const client =
        (quote.clientId ? clientsById.get(quote.clientId) ?? null : null) ??
        clientsByName.get(this.normalizeLookup(quote.customerName)) ??
        null;
      const row = ensureRow(client);
      if (!row) continue;
      row.quotes += 1;
      row.activities += 1;
    }

    for (const appointment of this.reportCurrentAppointments()) {
      const client =
        (appointment.clientId ? clientsById.get(appointment.clientId) ?? null : null) ??
        clientsByName.get(this.normalizeLookup(appointment.customerName)) ??
        null;
      const row = ensureRow(client);
      if (!row) continue;
      row.appointments += 1;
      row.activities += 1;
    }

    for (const ticket of this.reportCurrentTickets()) {
      const client = clientsByName.get(this.normalizeLookup(ticket.customerName)) ?? null;
      const row = ensureRow(client);
      if (!row) continue;
      row.tickets += 1;
      row.activities += 1;
    }

    for (const ddt of this.reportCurrentDdts()) {
      const client =
        (ddt.clientId ? clientsById.get(ddt.clientId) ?? null : null) ??
        clientsByName.get(this.normalizeLookup(ddt.clientSnapshot || ddt.recipientSnapshot?.name || '')) ??
        null;
      const row = ensureRow(client);
      if (!row) continue;
      row.ddts += 1;
      row.activities += 1;
    }

    return [...rows.values()].sort(
      (left, right) =>
        right.revenue - left.revenue ||
        right.activities - left.activities ||
        left.client.name.localeCompare(right.client.name, 'it-IT'),
    );
  });
  protected readonly reportPreviousActiveClientsCount = computed(() => {
    const clientsById = new Map(this.allClients().map((client) => [client.id, client]));
    const clientsByName = new Map(
      this.allClients().map((client) => [this.normalizeLookup(client.name), client.id]),
    );
    const ids = new Set<string>();
    const registerClient = (clientId: string | null | undefined, name: string | null | undefined): void => {
      const direct = clientId ? clientsById.get(clientId)?.id ?? null : null;
      const byName = name ? clientsByName.get(this.normalizeLookup(name)) ?? null : null;
      const resolved = direct ?? byName;
      if (resolved) ids.add(resolved);
    };

    for (const transaction of this.reportPreviousPaidTransactions()) {
      registerClient(transaction.clientId, transaction.customerName);
    }
    for (const quote of this.reportPreviousQuotes()) {
      registerClient(quote.clientId ?? null, quote.customerName);
    }
    for (const appointment of this.reportPreviousAppointments()) {
      registerClient(appointment.clientId ?? null, appointment.customerName);
    }
    for (const ticket of this.reportPreviousTickets()) {
      registerClient(null, ticket.customerName);
    }
    for (const ddt of this.reportPreviousDdts()) {
      registerClient(ddt.clientId ?? null, ddt.clientSnapshot || ddt.recipientSnapshot?.name || '');
    }

    return ids.size;
  });
  protected readonly reportCurrentServicePerformanceRows = computed<ReportServiceActivityRow[]>(() => {
    const services = this.servicesOnly();
    const stats = new Map(
      services.map((service) => [
        service.id,
        {
          salesCount: 0,
          salesTotal: 0,
          quoteCount: 0,
        },
      ]),
    );
    const serviceNameMap = new Map(
      services.map((service) => [service.name.trim().toLowerCase(), service.id]),
    );

    for (const transaction of this.reportCurrentPaidTransactions()) {
      for (const line of transaction.lines) {
        if (!stats.has(line.productId)) {
          continue;
        }
        const current = stats.get(line.productId)!;
        current.salesCount += Number(line.quantity) || 0;
        current.salesTotal += Number(line.total) || 0;
      }
    }

    for (const quote of this.reportCurrentQuotes()) {
      const servicesInQuote = new Set<string>();
      for (const line of quote.lines ?? []) {
        if (line.kind !== 'servizio') {
          continue;
        }
        const matched = serviceNameMap.get(line.description.trim().toLowerCase());
        if (matched) {
          servicesInQuote.add(matched);
        }
      }
      for (const serviceId of servicesInQuote) {
        const current = stats.get(serviceId);
        if (current) {
          current.quoteCount += 1;
        }
      }
    }

    return services
      .map((service) => ({
        id: service.id,
        name: service.name,
        category: service.category,
        price: service.price,
        quoteCount: stats.get(service.id)?.quoteCount ?? 0,
        salesCount: stats.get(service.id)?.salesCount ?? 0,
        salesTotal: stats.get(service.id)?.salesTotal ?? 0,
      }))
      .sort(
        (left, right) =>
          right.salesTotal - left.salesTotal ||
          right.quoteCount - left.quoteCount ||
          left.name.localeCompare(right.name, 'it-IT'),
      );
  });
  protected readonly reportCurrentServiceTopPerformers = computed(() =>
    this.reportCurrentServicePerformanceRows()
      .filter((service) => service.salesCount > 0 || service.quoteCount > 0)
      .slice(0, 6),
  );
  protected readonly reportCurrentServiceLowRotation = computed(() =>
    [...this.reportCurrentServicePerformanceRows()]
      .sort(
        (left, right) =>
          left.salesCount + left.quoteCount - (right.salesCount + right.quoteCount) ||
          left.price - right.price ||
          left.name.localeCompare(right.name, 'it'),
      )
      .slice(0, 6),
  );
  protected readonly reportCurrentQuoteStageSummary = computed(() => {
    const quotes = this.reportCurrentQuotes();
    const totalValue = quotes.reduce((total, quote) => total + quote.value, 0);
    const draftQuotes = quotes.filter((quote) => quote.stage === 'bozza');
    const negotiationQuotes = quotes.filter((quote) => quote.stage === 'trattativa');
    const readyQuotes = quotes.filter((quote) => quote.stage === 'ordine' || quote.stage === 'confermato');
    const draftValue = draftQuotes.reduce((total, quote) => total + quote.value, 0);
    const negotiationValue = negotiationQuotes.reduce((total, quote) => total + quote.value, 0);
    const readyValue = readyQuotes.reduce((total, quote) => total + quote.value, 0);

    return [
      {
        filter: 'tutte' as const,
        tone: 'all' as const,
        kicker: 'Vista filtrata',
        label: 'Archivio preventivi',
        count: quotes.length,
        value: totalValue,
        detail: `Periodo ${this.reportPeriodRange().label.toLowerCase()}.`,
      },
      {
        filter: 'bozza' as const,
        tone: 'warning' as const,
        kicker: 'Da definire',
        label: 'Bozze',
        count: draftQuotes.length,
        value: draftValue,
        detail: 'Offerte non ancora portate in trattativa.',
      },
      {
        filter: 'trattativa' as const,
        tone: 'info' as const,
        kicker: 'In trattativa',
        label: 'In attesa cliente',
        count: negotiationQuotes.length,
        value: negotiationValue,
        detail: 'Preventivi in lavorazione o da richiamare.',
      },
      {
        filter: 'ordine' as const,
        tone: 'success' as const,
        kicker: 'Accettati',
        label: 'Confermati',
        count: readyQuotes.length,
        value: readyValue,
        detail: 'Ordini confermati o già da evadere.',
      },
    ];
  });
  protected readonly reportCurrentWarehouseSupplierRows = computed<WarehouseSupplierSummaryRow[]>(() => {
    const grouped = new Map<string, WarehouseSupplierSummaryRow & { itemIds: Set<string> }>();
    for (const purchase of this.reportCurrentWarehousePurchases()) {
      const key = purchase.supplier.trim() || 'Fornitore non indicato';
      const current =
        grouped.get(key) ??
        {
          supplier: key,
          records: 0,
          totalCost: 0,
          lastReceivedDate: '',
          lastDocumentNumber: '',
          distinctItems: 0,
          itemIds: new Set<string>(),
        };
      current.records += 1;
      current.totalCost += purchase.totalCost;
      current.itemIds.add(purchase.inventoryItemId);
      if (!current.lastReceivedDate || purchase.receivedDate > current.lastReceivedDate) {
        current.lastReceivedDate = purchase.receivedDate;
        current.lastDocumentNumber = purchase.documentNumber;
      }
      grouped.set(key, current);
    }

    return [...grouped.values()]
      .map(({ itemIds, ...row }) => ({
        ...row,
        distinctItems: itemIds.size,
      }))
      .sort(
        (left, right) =>
          right.totalCost - left.totalCost ||
          right.records - left.records ||
          right.lastReceivedDate.localeCompare(left.lastReceivedDate),
      );
  });
  protected readonly reportOverviewCards = computed<ReportOverviewCard[]>(() => {
    const range = this.reportPeriodRange();
    const currentCash = this.reportCurrentPaidTransactions();
    const previousCash = this.reportPreviousPaidTransactions();
    const currentCashTotal = currentCash.reduce((sum, transaction) => sum + transaction.total, 0);
    const previousCashTotal = previousCash.reduce((sum, transaction) => sum + transaction.total, 0);
    const currentExpenses = this.reportCurrentExpenses();
    const previousExpenses = this.reportPreviousExpenses();
    const currentExpenseTotal = currentExpenses.reduce((sum, expense) => sum + expense.amountGross, 0);
    const previousExpenseTotal = previousExpenses.reduce((sum, expense) => sum + expense.amountGross, 0);
    const currentQuotes = this.reportCurrentQuotes();
    const previousQuotes = this.reportPreviousQuotes();
    const currentAcceptedQuotes = currentQuotes.filter(
      (quote) => quote.stage === 'ordine' || quote.stage === 'confermato',
    );
    const previousAcceptedQuotes = previousQuotes.filter(
      (quote) => quote.stage === 'ordine' || quote.stage === 'confermato',
    );
    const currentDdts = this.reportCurrentDdts().filter((record) => record.status !== 'annullato');
    const previousDdts = this.reportPreviousDdts().filter((record) => record.status !== 'annullato');
    const currentOpenTickets = this.reportCurrentTickets().filter((ticket) => ticket.status !== 'chiuso');
    const previousOpenTickets = this.reportPreviousTickets().filter((ticket) => ticket.status !== 'chiuso');
    const currentMovements = this.reportCurrentWarehouseMovements();
    const previousMovements = this.reportPreviousWarehouseMovements();
    const currentClients = this.reportCurrentClientRows();
    const previousClients = this.reportPreviousActiveClientsCount();
    const currentConversion = currentQuotes.length
      ? Math.round((currentAcceptedQuotes.length / currentQuotes.length) * 100)
      : 0;
    const topClient = currentClients[0]?.client.name ?? 'Nessuna attività cliente nel periodo';

    return [
      this.buildReportOverviewCard({
        label: 'Incassi effettivi',
        value: currentCashTotal,
        previousValue: previousCashTotal,
        detail: `${currentCash.length} documenti pagati`,
        tone: 'success',
        format: 'currency',
        periodLabel: range.label,
        previousLabel: range.previousLabel,
        drilldown: {
          kind: 'cash-paid',
          title: 'Incassi effettivi',
          subtitle: `Documenti pagati · ${range.label}`,
        },
      }),
      this.buildReportOverviewCard({
        label: 'Costi registrati',
        value: currentExpenseTotal,
        previousValue: previousExpenseTotal,
        detail: `${currentExpenses.length} spese contabilizzate`,
        tone: 'warning',
        format: 'currency',
        periodLabel: range.label,
        previousLabel: range.previousLabel,
        drilldown: {
          kind: 'expenses',
          title: 'Costi registrati',
          subtitle: `Spese del periodo · ${range.label}`,
        },
      }),
      this.buildReportOverviewCard({
        label: 'Preventivi creati',
        value: currentQuotes.length,
        previousValue: previousQuotes.length,
        detail: `${currentAcceptedQuotes.length} accettati · ${currentConversion}% conversione`,
        tone: 'info',
        format: 'number',
        periodLabel: range.label,
        previousLabel: range.previousLabel,
        drilldown: {
          kind: 'quotes-all',
          title: 'Preventivi creati',
          subtitle: `Preventivi nel periodo · ${range.label}`,
        },
      }),
      this.buildReportOverviewCard({
        label: 'Preventivi accettati',
        value: currentAcceptedQuotes.length,
        previousValue: previousAcceptedQuotes.length,
        detail: `€ ${this.formatCurrency(currentAcceptedQuotes.reduce((sum, quote) => sum + quote.value, 0))} confermati`,
        tone: currentAcceptedQuotes.length ? 'success' : 'neutral',
        format: 'number',
        periodLabel: range.label,
        previousLabel: range.previousLabel,
        drilldown: {
          kind: 'quotes-stage',
          title: 'Preventivi accettati',
          subtitle: `Ordini e confermati · ${range.label}`,
          filter: 'ordine|confermato',
        },
      }),
      this.buildReportOverviewCard({
        label: 'Clienti attivi',
        value: currentClients.length,
        previousValue: previousClients,
        detail: topClient,
        tone: 'neutral',
        format: 'number',
        periodLabel: range.label,
        previousLabel: range.previousLabel,
        drilldown: {
          kind: 'clients-active',
          title: 'Clienti attivi',
          subtitle: `Clienti con attività reale · ${range.label}`,
        },
      }),
      this.buildReportOverviewCard({
        label: 'Ticket aperti',
        value: currentOpenTickets.length,
        previousValue: previousOpenTickets.length,
        detail: `${currentOpenTickets.filter((ticket) => ticket.priority === 'alta').length} urgenti`,
        tone: currentOpenTickets.some((ticket) => ticket.priority === 'alta') ? 'danger' : 'info',
        format: 'number',
        periodLabel: range.label,
        previousLabel: range.previousLabel,
        drilldown: {
          kind: 'tickets',
          title: 'Ticket aperti',
          subtitle: `Ticket tecnici del periodo · ${range.label}`,
          filter: 'open',
        },
      }),
      this.buildReportOverviewCard({
        label: 'DDT emessi',
        value: currentDdts.filter((record) => record.status === 'emesso' || record.status === 'consegnato').length,
        previousValue: previousDdts.filter((record) => record.status === 'emesso' || record.status === 'consegnato').length,
        detail: `${currentDdts.filter((record) => record.status === 'bozza').length} bozze nel periodo`,
        tone: 'info',
        format: 'number',
        periodLabel: range.label,
        previousLabel: range.previousLabel,
        drilldown: {
          kind: 'ddts',
          title: 'DDT del periodo',
          subtitle: `Documenti di trasporto · ${range.label}`,
        },
      }),
      this.buildReportOverviewCard({
        label: 'Movimenti magazzino',
        value: currentMovements.length,
        previousValue: previousMovements.length,
        detail: `${currentMovements.filter((movement) => movement.movementType === 'carico').length} carichi · ${currentMovements.filter((movement) => movement.movementType === 'scarico').length} scarichi`,
        tone: 'neutral',
        format: 'number',
        periodLabel: range.label,
        previousLabel: range.previousLabel,
        drilldown: {
          kind: 'warehouse-movements',
          title: 'Movimenti di magazzino',
          subtitle: `Movimenti del periodo · ${range.label}`,
        },
      }),
    ];
  });
  protected readonly reportRevenueMixBars = computed<ReportBarRow[]>(() => {
    const currentCashTotal = this.reportCurrentPaidTransactions().reduce((sum, transaction) => sum + transaction.total, 0);
    const currentQuoteTotal = this.reportCurrentQuotes().reduce((sum, quote) => sum + quote.value, 0);
    const currentServiceTotal = this.reportCurrentServicePerformanceRows().reduce((sum, service) => sum + service.salesTotal, 0);
    const currentExpenseTotal = this.reportCurrentExpenses().reduce((sum, expense) => sum + expense.amountGross, 0);
    const rows = [
      {
        label: 'Cassa',
        value: currentCashTotal,
        detail: `${this.reportCurrentPaidTransactions().length} operazioni`,
      },
      {
        label: 'Preventivi',
        value: currentQuoteTotal,
        detail: `${this.reportCurrentQuotes().length} documenti`,
      },
      {
        label: 'Servizi',
        value: currentServiceTotal,
        detail: `${this.reportCurrentServiceTopPerformers().length} servizi attivi`,
      },
      {
        label: 'Magazzino',
        value: this.warehouseHistoricalValue(),
        detail: `${this.warehouseTotalQuantity()} unità/metri in stock`,
      },
      {
        label: 'Spese',
        value: currentExpenseTotal,
        detail: `${this.reportCurrentExpenses().length} registrazioni`,
      },
    ];
    const maxValue = Math.max(...rows.map((row) => row.value), 1);
    return rows.map((row) => ({
      ...row,
      share: Math.round((row.value / maxValue) * 100),
    }));
  });
  protected readonly reportCommercialFunnel = computed<ReportBarRow[]>(() => {
    const activeClients = this.reportCurrentClientRows();
    const currentQuotes = this.reportCurrentQuotes();
    const currentConfirmedQuotes = currentQuotes.filter(
      (quote) => quote.stage === 'ordine' || quote.stage === 'confermato',
    );
    const currentAppointments = this.reportCurrentAppointments();
    const currentTickets = this.reportCurrentTickets();
    const rows = [
      {
        label: 'Clienti in anagrafica',
        value: activeClients.length,
        detail: `${activeClients.filter((entry) => entry.revenue > 0).length} con ricavi nel periodo`,
      },
      {
        label: 'Preventivi totali',
        value: currentQuotes.length,
        detail: `${currentQuotes.length ? Math.round((currentConfirmedQuotes.length / currentQuotes.length) * 100) : 0}% conversione`,
      },
      {
        label: 'Preventivi confermati',
        value: currentConfirmedQuotes.length,
        detail: 'Ordini o confermati da saldare/gestire',
      },
      {
        label: 'Agenda attiva',
        value: currentAppointments.filter((appointment) => appointment.status !== 'chiuso').length,
        detail: `${currentAppointments.filter((appointment) => appointment.status === 'in-corso').length} in corso`,
      },
      {
        label: 'Ticket aperti',
        value: currentTickets.filter((ticket) => ticket.status !== 'chiuso').length,
        detail: `${currentTickets.filter((ticket) => ticket.priority === 'alta').length} urgenti`,
      },
    ];
    const maxValue = Math.max(...rows.map((row) => row.value), 1);
    return rows.map((row) => ({
      ...row,
      share: Math.round((row.value / maxValue) * 100),
    }));
  });
  protected readonly reportAppointmentMixBars = computed<ReportBarRow[]>(() => {
    const appointments = this.reportCurrentAppointments();
    const counts = {
      negozio: appointments.filter((appointment) => appointment.appointmentType === 'negozio').length,
      uscita: appointments.filter((appointment) => appointment.appointmentType === 'uscita').length,
      installazione: appointments.filter((appointment) => appointment.appointmentType === 'installazione').length,
      assistenza: appointments.filter((appointment) => appointment.appointmentType === 'assistenza').length,
      sopralluogo: appointments.filter((appointment) => appointment.appointmentType === 'sopralluogo').length,
    };
    const rows = [
      { label: 'Negozio', value: counts.negozio, detail: 'Attività in showroom' },
      { label: 'Uscite', value: counts.uscita, detail: 'Appuntamenti fuori sede' },
      { label: 'Installazioni', value: counts.installazione, detail: 'Montaggi e consegne' },
      { label: 'Assistenze', value: counts.assistenza, detail: 'Supporto e verifiche' },
      { label: 'Sopralluoghi', value: counts.sopralluogo, detail: 'Verifiche preliminari' },
    ];
    const maxValue = Math.max(...rows.map((row) => row.value), 1);
    return rows.map((row) => ({
      ...row,
      share: Math.round((row.value / maxValue) * 100),
    }));
  });
  protected readonly reportWarehouseMovementBars = computed<ReportBarRow[]>(() => {
    const movements = this.reportCurrentWarehouseMovements();
    const rows = [
      {
        label: 'Carichi',
        value: movements.filter((movement) => movement.movementType === 'carico').length,
        detail: 'Ingressi prodotti',
      },
      {
        label: 'Scarichi',
        value: movements.filter((movement) => movement.movementType === 'scarico').length,
        detail: 'Vendite e consumi',
      },
      {
        label: 'Prenotazioni',
        value: movements.filter((movement) => movement.movementType === 'prenotazione').length,
        detail: 'Impegni su stock',
      },
      {
        label: 'Rettifiche',
        value: movements.filter((movement) => movement.movementType === 'rettifica+/-').length,
        detail: 'Correzioni inventariali',
      },
    ];
    const maxValue = Math.max(...rows.map((row) => row.value), 1);
    return rows.map((row) => ({
      ...row,
      share: Math.round((row.value / maxValue) * 100),
    }));
  });
  protected readonly reportOperationalAlerts = computed<ReportStatusTile[]>(() => [
    {
      label: 'Insoluti aperti',
      value: this.cashPendingTransactionsCount(),
      detail: this.cashPendingTransactionsLabel(),
      tone: this.cashPendingTransactionsCount() ? 'danger' : 'success',
      format: 'number',
    },
    {
      label: 'Scadenze spese',
      value: this.expenseUpcomingInstallments().length,
      detail: 'Rate e pagamenti da monitorare',
      tone: this.expenseUpcomingInstallments().length ? 'warning' : 'success',
      format: 'number',
    },
    {
      label: 'Scorte critiche',
      value: this.warehouseLowStockAlerts().length,
      detail: this.warehouseNegativeStockItems().length
        ? `${this.warehouseNegativeStockItems().length} con giacenza negativa`
        : 'Nessuna giacenza negativa',
      tone: this.warehouseNegativeStockItems().length ? 'danger' : 'warning',
      format: 'number',
    },
    {
      label: 'Ticket urgenti',
      value: this.allServiceTickets().filter((ticket) => ticket.priority === 'alta').length,
      detail: `${this.allServiceTickets().filter((ticket) => ticket.status === 'in-lavorazione').length} in lavorazione`,
      tone: this.allServiceTickets().filter((ticket) => ticket.priority === 'alta').length ? 'danger' : 'info',
      format: 'number',
    },
    {
      label: 'Clienti con insoluti',
      value: this.clientPendingAlerts(),
      detail: 'Richiedono follow-up tra CRM e cassa',
      tone: this.clientPendingAlerts() ? 'warning' : 'success',
      format: 'number',
    },
    {
      label: 'Agenda in corso',
      value: this.allAppointments().filter((appointment) => appointment.status === 'in-corso').length,
      detail: `${this.allAppointments().filter((appointment) => appointment.status === 'programmato').length} programmati`,
      tone: 'neutral',
      format: 'number',
    },
  ]);
  protected readonly reportCrossModuleTiles = computed<ReportStatusTile[]>(() => {
    const supplierRegistry = new Set(
      this.allExpenseSuppliers().map((supplier) => this.normalizeLookup(supplier.businessName)),
    );
    const sharedSuppliers = this.warehousePurchasesBySupplier().filter((entry) =>
      supplierRegistry.has(this.normalizeLookup(entry.supplier)),
    ).length;
    const servicesQuotedNotSold = this.servicePerformanceRows().filter(
      (service) => service.quoteCount > 0 && service.salesCount === 0,
    ).length;
    const lowStockConsumed = new Set(
      this.warehouseConsumedItems()
        .map((movement) => this.normalizeLookup(movement.itemName))
        .filter(Boolean),
    );
    const lowStockUsed = this.warehouseLowStockAlerts().filter((item) =>
      lowStockConsumed.has(this.normalizeLookup(item.name)),
    ).length;
    const openTicketsWithMaterials = this.allServiceTickets().filter(
      (ticket) => ticket.status !== 'chiuso' && ticket.materialLines.length > 0,
    ).length;

    return [
      {
        label: 'Preventivi confermati da saldare',
        value: this.confirmedQuotes().length,
        detail: 'Incrocio tra preventivi e cassa',
        tone: this.confirmedQuotes().length ? 'warning' : 'success',
        format: 'number',
      },
      {
        label: 'Fornitori condivisi',
        value: sharedSuppliers,
        detail: 'Presenti sia in Spese che in Magazzino',
        tone: 'info',
        format: 'number',
      },
      {
        label: 'Servizi quotati ma non venduti',
        value: servicesQuotedNotSold,
        detail: 'Incrocio tra catalogo servizi, preventivi e cassa',
        tone: servicesQuotedNotSold ? 'warning' : 'success',
        format: 'number',
      },
      {
        label: 'Articoli critici già consumati',
        value: lowStockUsed,
        detail: 'Stock basso su articoli già usciti per cassa/tecnico',
        tone: lowStockUsed ? 'danger' : 'success',
        format: 'number',
      },
      {
        label: 'Ticket aperti con materiali caricati',
        value: openTicketsWithMaterials,
        detail: 'Incrocio tecnico e magazzino',
        tone: openTicketsWithMaterials ? 'info' : 'neutral',
        format: 'number',
      },
      {
        label: 'Clienti top con ritorno economico',
        value: this.loyalClients().length,
        detail: 'Incrocio CRM, preventivi e cassa',
        tone: 'success',
        format: 'number',
      },
    ];
  });
  protected readonly reportSectionDescriptors = computed<ReportSectionDescriptor[]>(() => [
    {
      key: 'overview',
      kicker: 'Cabina di regia',
      label: 'Cruscotto attività',
      description: 'Sintesi veloce tra preventivi, documenti, ticket, agenda tecnica e materiali.',
      metric: `€ ${this.formatCurrency(this.reportCurrentPaidTransactions().reduce((sum, transaction) => sum + transaction.total, 0))}`,
      badge: `${this.reportOverviewCards().length} KPI`,
    },
    {
      key: 'cross',
      kicker: 'Filiera lavoro',
      label: 'Incroci moduli',
      description: 'Collegamenti reali tra CRM, preventivi, ticket, magazzino, DDT e fornitori.',
      metric: `${this.reportCrossModuleTiles().length}`,
      badge: 'Alert e opportunità',
    },
    {
      key: 'commerciale',
      kicker: 'Preventivi e clienti',
      label: 'Commerciale',
      description: 'Andamento preventivi, clienti caldi, servizi venduti e trattative da chiudere.',
      metric: `${this.reportCurrentQuotes().length ? Math.round((this.reportCurrentQuotes().filter((quote) => quote.stage === 'ordine' || quote.stage === 'confermato').length / this.reportCurrentQuotes().length) * 100) : 0}%`,
      badge: 'Conversione',
    },
    {
      key: 'operatività',
      kicker: 'Tecnico',
      label: 'Agenda e assistenze',
      description: 'Sopralluoghi, installazioni, assistenze, ticket e materiali movimentati.',
      metric: `${this.reportCurrentTickets().filter((ticket) => ticket.status !== 'chiuso').length}`,
      badge: 'Ticket aperti',
    },
    {
      key: 'amministrazione',
      kicker: 'Documenti e conti',
      label: 'Amministrazione',
      description: 'Incassi, spese, numerazione documenti, fornitori e acquisti tecnici.',
      metric: `€ ${this.formatCurrency(this.reportCurrentExpenses().reduce((sum, expense) => sum + expense.amountGross, 0))}`,
      badge: 'Spese periodo',
    },
    {
      key: 'alert',
      kicker: 'Da seguire',
      label: 'Priorità operative',
      description: 'Urgenze su ticket, insoluti, materiali sotto scorta e ordini da chiudere.',
      metric: `${this.reportOperationalAlerts().filter((tile) => tile.tone === 'danger').length}`,
      badge: 'Criticità',
    },
  ]);
  protected readonly filteredReportSectionDescriptors = computed(() =>
    this.reportSectionDescriptors().filter((section) =>
      this.reportMatchesSearch(
        section.kicker,
        section.label,
        section.description,
        section.metric,
        section.badge,
        this.reportSectionSearchKeywords(section.key),
      ),
    ),
  );
  protected readonly reportActiveFilterLabel = computed(() => {
    const active = this.reportFilter();
    if (active === 'all') {
      return 'Tutti i settori';
    }
    return this.reportSectionDescriptors().find((section) => section.key === active)?.label ?? 'Settore';
  });
  protected readonly filteredReportOverviewCards = computed(() =>
    this.reportOverviewCards().filter((card) =>
      this.reportMatchesSearch(card.label, card.detail, card.value),
    ),
  );
  protected readonly filteredReportRevenueMixBars = computed(() =>
    this.reportRevenueMixBars().filter((entry) =>
      this.reportMatchesSearch(entry.label, entry.detail, entry.value),
    ),
  );
  protected readonly filteredReportCommercialFunnel = computed(() =>
    this.reportCommercialFunnel().filter((entry) =>
      this.reportMatchesSearch(entry.label, entry.detail, entry.value),
    ),
  );
  protected readonly filteredReportCrossModuleTiles = computed(() =>
    this.reportCrossModuleTiles().filter((tile) =>
      this.reportMatchesSearch(tile.label, tile.detail, tile.value),
    ),
  );
  protected readonly filteredReportAppointmentMixBars = computed(() =>
    this.reportAppointmentMixBars().filter((entry) =>
      this.reportMatchesSearch(entry.label, entry.detail, entry.value),
    ),
  );
  protected readonly filteredReportWarehouseMovementBars = computed(() =>
    this.reportWarehouseMovementBars().filter((entry) =>
      this.reportMatchesSearch(entry.label, entry.detail, entry.value),
    ),
  );
  protected readonly filteredReportOperationalAlerts = computed(() =>
    this.reportOperationalAlerts().filter((tile) =>
      this.reportMatchesSearch(tile.label, tile.detail, tile.value),
    ),
  );
  protected readonly filteredReportQuoteStages = computed(() =>
    this.reportCurrentQuoteStageSummary().filter((stage) =>
      this.reportMatchesSearch(stage.kicker, stage.label, stage.detail, stage.count, stage.value),
    ),
  );
  protected readonly filteredReportLoyalClients = computed(() =>
    this.reportCurrentClientRows().filter((entry) =>
      this.reportMatchesSearch(
        entry.client.name,
        entry.client.city,
        entry.client.status,
        entry.activities,
        entry.revenue,
        entry.quotes,
      ),
    ),
  );
  protected readonly filteredReportServiceTopPerformers = computed(() =>
    this.reportCurrentServiceTopPerformers().filter((service) =>
      this.reportMatchesSearch(
        service.name,
        service.category,
        service.salesCount,
        service.quoteCount,
        service.salesTotal,
      ),
    ),
  );
  protected readonly filteredReportServiceLowRotation = computed(() =>
    this.reportCurrentServiceLowRotation().filter((service) =>
      this.reportMatchesSearch(
        service.name,
        service.category,
        service.salesCount,
        service.quoteCount,
        service.salesTotal,
      ),
    ),
  );
  protected readonly filteredReportTickets = computed(() =>
    this.reportCurrentTickets().filter((ticket) =>
      this.reportMatchesSearch(
        ticket.title,
        ticket.customerName,
        ticket.priority,
        ticket.status,
        ticket.technician,
      ),
    ),
  );
  protected readonly filteredReportWarehouseConsumedItems = computed(() =>
    this.warehouseConsumedItems().filter((movement) =>
      this.extractIsoDateOnly(movement.movedAt) >= this.reportPeriodRange().from &&
      this.extractIsoDateOnly(movement.movedAt) <= this.reportPeriodRange().to &&
      this.reportMatchesSearch(
        movement.itemName,
        movement.sourceModule,
        movement.movementType,
        movement.quantity,
      ),
    ),
  );
  protected readonly filteredReportExpenseSuppliers = computed(() =>
    this.expenseSuppliersSummary().filter((supplier) =>
      this.reportMatchesSearch(supplier.supplier, supplier.count, supplier.total),
    ),
  );
  protected readonly filteredReportWarehouseSuppliers = computed(() =>
    this.reportCurrentWarehouseSupplierRows()
      .filter((supplier) => supplier.records > 0)
      .filter((supplier) =>
        this.reportMatchesSearch(
          supplier.supplier,
          supplier.records,
          supplier.totalCost,
          supplier.lastDocumentNumber,
          supplier.lastReceivedDate,
          supplier.distinctItems,
        ),
      ),
  );
  protected readonly reportTopWarehouseSupplier = computed(() =>
    this.filteredReportWarehouseSuppliers()[0] ?? null,
  );
  protected readonly reportExecutiveCharts = computed<ReportDonutChart[]>(() => {
    const methods = this.reportTotalsByPaymentMethod(this.reportCurrentPaidTransactions());
    const currentQuotes = this.reportCurrentQuotes();
    const currentQuoteStages = this.reportCurrentQuoteStageSummary();

    return [
      this.buildReportDonutChart(
        'economico',
        'Distribuzione economica',
        'Peso dei reparti sul valore complessivo',
        [
          { label: 'Cassa', value: this.reportCurrentPaidTransactions().reduce((sum, transaction) => sum + transaction.total, 0), detail: 'Incassi registrati', color: '#2563eb' },
          { label: 'Preventivi', value: currentQuotes.reduce((sum, quote) => sum + quote.value, 0), detail: 'Valore pipeline', color: '#7c3aed' },
          {
            label: 'Servizi',
            value: this.reportCurrentServicePerformanceRows().reduce((total, service) => total + service.salesTotal, 0),
            detail: 'Vendite da catalogo servizi',
            color: '#0f766e',
          },
          { label: 'Magazzino', value: this.warehouseHistoricalValue(), detail: 'Valore stock', color: '#d97706' },
          { label: 'Spese', value: this.reportCurrentExpenses().reduce((sum, expense) => sum + expense.amountGross, 0), detail: 'Uscite del periodo', color: '#dc2626' },
        ],
        'currency',
      ),
      this.buildReportDonutChart(
        'pipeline',
        'Pipeline preventivi',
        'Stati commerciali e avanzamento',
        currentQuoteStages
          .filter((stage) => stage.filter !== 'tutte')
          .map((stage, index) => ({
            label: stage.label,
            value: stage.count,
            detail: stage.detail,
            color: ['#f59e0b', '#2563eb', '#16a34a'][index] ?? '#64748b',
          })),
        'number',
      ),
      this.buildReportDonutChart(
        'pagamenti',
        'Metodi di pagamento',
        'Ripartizione degli incassi cassa',
        [
          { label: 'Contanti', value: methods.contanti, detail: 'Incasso diretto', color: '#16a34a' },
          { label: 'POS', value: methods.pos, detail: 'Bancomat e carta', color: '#2563eb' },
          { label: 'Bonifico', value: methods.bonifico, detail: 'Pagamenti differiti', color: '#7c3aed' },
          { label: 'Misto', value: methods.misto, detail: 'Combinazione metodi', color: '#f59e0b' },
        ],
        'currency',
      ),
    ].filter((chart) => this.reportMatchesSearch(chart.title, chart.subtitle, chart.searchableText));
  });
  protected readonly reportSearchResultCount = computed(() => {
    return (
      this.filteredReportSectionDescriptors().length +
      this.filteredReportOverviewCards().length +
      this.filteredReportCrossModuleTiles().length +
      this.filteredReportOperationalAlerts().length
    );
  });
  protected readonly reportDashboardKpis = computed<ReportDashboardKpi[]>(() => {
    const currentQuotes = this.reportCurrentQuotes();
    const confirmedQuotes = currentQuotes.filter(
      (quote) => quote.stage === 'ordine' || quote.stage === 'confermato',
    );
    const pendingQuotes = currentQuotes.filter((quote) => quote.stage === 'trattativa');
    const openTickets = this.reportCurrentTickets().filter((ticket) => ticket.status !== 'chiuso');
    const appointmentsToDo = this.reportCurrentAppointments().filter(
      (appointment) => appointment.status === 'programmato' || appointment.status === 'in-corso',
    );
    const incassi = this.reportCurrentPaidTransactions().reduce((sum, transaction) => sum + transaction.total, 0);

    return [
      {
        key: 'valore-confermato',
        icon: '€',
        label: 'Valore confermato',
        value: confirmedQuotes.reduce((sum, quote) => sum + quote.value, 0),
        detail: `${confirmedQuotes.length} ordini o conferme nel periodo`,
        tone: confirmedQuotes.length ? 'success' : 'neutral',
        format: 'currency',
        page: 'preventivi',
      },
      {
        key: 'incassi-effettivi',
        icon: '€',
        label: 'Incassi effettivi',
        value: incassi,
        detail: `${this.reportCurrentPaidTransactions().length} documenti pagati`,
        tone: incassi > 0 ? 'success' : 'neutral',
        format: 'currency',
        page: 'economici',
      },
      {
        key: 'crediti-aperti',
        icon: '€',
        label: 'Crediti aperti',
        value: this.cashPendingTransactionsCount(),
        detail: this.cashPendingTransactionsLabel(),
        tone: this.cashPendingTransactionsCount() ? 'warning' : 'success',
        format: 'number',
        page: 'economici',
      },
      {
        key: 'clienti-attivi',
        icon: '👥',
        label: 'Clienti attivi',
        value: this.reportCurrentClientRows().length,
        detail: this.reportCurrentClientRows()[0]?.client.name ?? 'Nessun cliente attivo nel periodo',
        tone: this.reportCurrentClientRows().length ? 'info' : 'neutral',
        format: 'number',
        page: 'clienti',
      },
      {
        key: 'preventivi-attesa',
        icon: '🧾',
        label: 'Preventivi in attesa',
        value: pendingQuotes.length,
        detail: `${currentQuotes.length} preventivi filtrati nel periodo`,
        tone: pendingQuotes.length ? 'warning' : 'success',
        format: 'number',
        page: 'preventivi',
      },
      {
        key: 'interventi-da-completare',
        icon: '🛠️',
        label: 'Interventi da completare',
        value: openTickets.length + appointmentsToDo.length,
        detail: `${openTickets.length} ticket aperti · ${appointmentsToDo.length} appuntamenti attivi`,
        tone: openTickets.length + appointmentsToDo.length ? 'danger' : 'success',
        format: 'number',
        page: 'servizi',
      },
    ];
  });
  protected readonly reportAreaCards = computed<ReportAreaCard[]>(() => {
    const currentCashTotal = this.reportCurrentPaidTransactions().reduce((sum, transaction) => sum + transaction.total, 0);
    const currentQuotes = this.reportCurrentQuotes();
    const confirmedQuotes = currentQuotes.filter(
      (quote) => quote.stage === 'ordine' || quote.stage === 'confermato',
    );
    const emittedDdts = this.reportCurrentDdts().filter(
      (record) => record.status === 'emesso' || record.status === 'consegnato',
    ).length;

    return [
      {
        key: 'economici',
        icon: '€',
        title: 'Report economici',
        description: 'Incassi, costi, crediti aperti, cassa e spese del periodo selezionato.',
        metric: this.formatReportMetric(currentCashTotal, 'currency'),
        badge: `${this.cashPendingTransactionsCount()} crediti aperti`,
      },
      {
        key: 'clienti',
        icon: '👥',
        title: 'Report clienti',
        description: 'Clienti attivi, ricavi, frequenza e storico operativo collegato.',
        metric: `${this.reportCurrentClientRows().length} attivi`,
        badge: `${this.reportCurrentClientRows().filter((entry) => entry.revenue > 0).length} con ricavi`,
      },
      {
        key: 'preventivi',
        icon: '🧾',
        title: 'Report preventivi',
        description: 'Stati, conversioni, valori confermati e trattative da richiamare.',
        metric: `${currentQuotes.length} preventivi`,
        badge: `${confirmedQuotes.length} confermati`,
      },
      {
        key: 'servizi',
        icon: '🛠️',
        title: 'Servizi e interventi',
        description: 'Agenda tecnica, ticket, assistenze e lavorazioni piu\' richieste.',
        metric: `${this.reportCurrentTickets().filter((ticket) => ticket.status !== 'chiuso').length} ticket`,
        badge: `${this.reportCurrentAppointments().filter((appointment) => appointment.status === 'programmato' || appointment.status === 'in-corso').length} appuntamenti attivi`,
      },
      {
        key: 'documenti',
        icon: '🚚',
        title: 'Report documenti',
        description: 'DDT, incassi documentali, numerazione e accesso ai dettagli cassa.',
        metric: `${emittedDdts} DDT`,
        badge: `${this.reportCurrentPaidTransactions().length} documenti pagati`,
      },
      {
        key: 'magazzino',
        icon: '📦',
        title: 'Prodotti e magazzino',
        description: 'Movimentazioni, consumi, fornitori tecnici e situazione operativa stock.',
        metric: `${this.reportCurrentWarehouseMovements().length} movimenti`,
        badge: `${this.warehouseLowStockAlerts().length} scorte critiche`,
      },
      {
        key: 'altre',
        icon: '⚠️',
        title: 'Altre analisi',
        description: 'Incroci tra moduli, priorita\' operative e alert da seguire.',
        metric: `${this.reportOperationalAlerts().filter((tile) => tile.tone === 'danger').length} criticita\'`,
        badge: `${this.reportCrossModuleTiles().length} incroci utili`,
      },
    ];
  });
  protected readonly reportCurrentPageMeta = computed(() => {
    const page = this.reportCurrentPage();
    if (page === 'dashboard') {
      return {
        title: 'Report e statistiche',
        kicker: 'Dashboard compatta',
        description: 'Vista di sintesi con KPI essenziali, trend rapido e accesso diretto alle aree di analisi.',
      };
    }
    const area = this.reportAreaCards().find((item) => item.key === page);
    return {
      title: area?.title ?? 'Report',
      kicker: 'Analisi dedicata',
      description: area?.description ?? 'Approfondimento operativo del modulo selezionato.',
    };
  });
  protected readonly reportDashboardTrendChart = computed<ReportTrendChart>(() =>
    this.buildReportTrendChart(this.reportCurrentPaidTransactions()),
  );
  protected readonly reportDashboardDistributionChart = computed<ReportDonutChart>(() =>
    this.buildReportDonutChart(
      'dashboard-pipeline',
      'Distribuzione preventivi',
      'Stati reali del periodo selezionato',
      this.reportCurrentQuoteStageSummary()
        .filter((stage) => stage.filter !== 'tutte')
        .map((stage, index) => ({
          label: stage.label,
          value: stage.count,
          detail: stage.detail,
          color: ['#f59e0b', '#2563eb', '#16a34a'][index] ?? '#64748b',
        })),
      'number',
    ),
  );
  protected readonly reportEconomiciCards = computed(() =>
    this.filterReportOverviewCardsByLabels([
      'Incassi effettivi',
      'Costi registrati',
      'Preventivi accettati',
      'DDT emessi',
    ]),
  );
  protected readonly reportClientiCards = computed(() =>
    this.filterReportOverviewCardsByLabels([
      'Clienti attivi',
      'Preventivi creati',
      'Preventivi accettati',
    ]),
  );
  protected readonly reportPreventiviCards = computed(() =>
    this.filterReportOverviewCardsByLabels([
      'Preventivi creati',
      'Preventivi accettati',
      'Clienti attivi',
    ]),
  );
  protected readonly reportServiziCards = computed(() =>
    this.filterReportOverviewCardsByLabels([
      'Ticket aperti',
      'Movimenti magazzino',
      'Clienti attivi',
    ]),
  );
  protected readonly reportDocumentiCards = computed(() =>
    this.filterReportOverviewCardsByLabels([
      'DDT emessi',
      'Incassi effettivi',
      'Preventivi accettati',
    ]),
  );
  protected readonly reportMagazzinoCards = computed(() =>
    this.filterReportOverviewCardsByLabels([
      'Movimenti magazzino',
      'Ticket aperti',
      'DDT emessi',
    ]),
  );
  protected isReportSectionOpen(section: ReportSectionKey): boolean {
    return this.reportSectionState()[section];
  }

  protected toggleReportSection(section: ReportSectionKey): void {
    this.reportSectionState.update((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  protected updateReportSearch(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.reportSearch.set(target?.value ?? '');
  }

  protected clearReportSearch(): void {
    this.reportSearch.set('');
  }

  protected isReportPageActive(page: ReportPageKey): boolean {
    return this.reportCurrentPage() === page;
  }

  protected openReportPage(page: ReportPageKey): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        view: page === 'dashboard' ? null : page,
      },
      queryParamsHandling: 'merge',
    });
  }

  protected openReportDashboard(): void {
    this.openReportPage('dashboard');
  }

  protected setReportFilter(filter: ReportFilterKey): void {
    this.reportFilter.set(filter);
    if (filter !== 'all') {
      this.reportSectionState.update((current) => ({
        ...current,
        [filter]: true,
      }));
    }
  }

  protected isReportFilterActive(filter: ReportFilterKey): boolean {
    return this.reportFilter() === filter;
  }

  protected isReportSectionVisible(section: ReportSectionKey): boolean {
    if (this.reportFilter() !== 'all' && this.reportFilter() !== section) {
      return false;
    }

    const descriptor = this.reportSectionDescriptors().find((item) => item.key === section);
    if (!descriptor) {
      return true;
    }

    return this.reportMatchesSearch(
      descriptor.kicker,
      descriptor.label,
      descriptor.description,
      descriptor.metric,
      descriptor.badge,
      this.reportSectionSearchKeywords(section),
    );
  }

  protected focusReportSection(section: ReportSectionKey): void {
    this.openReportPage(this.reportPageForSection(section));
  }

  protected setReportPeriodPreset(preset: ReportPeriodPreset): void {
    this.reportPeriodPreset.set(preset);
    if (preset !== 'custom') {
      this.reportPeriodFrom.set('');
      this.reportPeriodTo.set('');
    }
    this.refreshReportData();
  }

  protected updateReportPeriodFrom(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.reportPeriodPreset.set('custom');
    this.reportPeriodFrom.set(target?.value ?? '');
    this.refreshReportData();
  }

  protected updateReportPeriodTo(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.reportPeriodPreset.set('custom');
    this.reportPeriodTo.set(target?.value ?? '');
    this.refreshReportData();
  }

  protected toggleReportComparePrevious(): void {
    this.reportComparePrevious.update((current) => !current);
    this.refreshReportData();
  }

  protected refreshReportData(): void {
    this.reportLastRefreshAt.set(new Date().toISOString());
  }

  protected reportTrendIcon(card: ReportOverviewCard): string {
    if (card.trend === 'up') return '▲';
    if (card.trend === 'down') return '▼';
    if (card.trend === 'flat') return '•';
    return '—';
  }

  protected reportDeltaTone(card: ReportOverviewCard): 'positive' | 'negative' | 'neutral' {
    if (card.trend === 'up') return 'positive';
    if (card.trend === 'down') return 'negative';
    return 'neutral';
  }

  protected reportAbsolute(value: number | null | undefined): number {
    return Math.abs(Number(value) || 0);
  }

  protected openReportOverviewDrilldown(card: ReportOverviewCard): void {
    if (!card.drilldown) {
      return;
    }
    this.openReportDrilldown(card.drilldown);
  }

  protected openReportQuoteStageDrilldown(stageFilter: string, stageLabel: string): void {
    this.openReportDrilldown({
      kind: 'quotes-stage',
      title: `Preventivi · ${stageLabel}`,
      subtitle: `Dettaglio preventivi · ${this.reportPeriodRange().label}`,
      filter: stageFilter,
    });
  }

  protected openReportPaymentMethodDrilldown(method: 'contanti' | 'pos' | 'bonifico' | 'misto'): void {
    this.openReportDrilldown({
      kind: 'payment-method',
      title: `Incassi ${method}`,
      subtitle: `Documenti pagati · ${this.reportPeriodRange().label}`,
      filter: method,
    });
  }

  protected openReportSupplierDrilldown(): void {
    this.openReportDrilldown({
      kind: 'warehouse-suppliers',
      title: 'Fornitori magazzino',
      subtitle: `Acquisti per fornitore · ${this.reportPeriodRange().label}`,
    });
  }

  protected openReportServiceDrilldown(mode: 'services-top' | 'services-low'): void {
    this.openReportDrilldown({
      kind: mode,
      title: mode === 'services-top' ? 'Servizi più richiesti' : 'Servizi meno richiesti',
      subtitle: `Catalogo servizi · ${this.reportPeriodRange().label}`,
    });
  }

  protected openReportTicketDrilldown(): void {
    this.openReportDrilldown({
      kind: 'tickets',
      title: 'Ticket del periodo',
      subtitle: `Interventi tecnici · ${this.reportPeriodRange().label}`,
    });
  }

  protected closeReportDrilldown(): void {
    this.reportDrilldownRequest.set(null);
    this.reportDrilldownHeaders.set([]);
    this.reportDrilldownRows.set([]);
  }

  protected exportReportDrilldownCsv(): void {
    const request = this.reportDrilldownRequest();
    if (!request || !this.reportDrilldownHeaders().length) {
      return;
    }
    const rows = [
      this.reportDrilldownHeaders(),
      ...this.reportDrilldownRows().map((row) => row.values.map((value) => String(value))),
    ];
    this.downloadCsv(rows, `report-${request.kind}-${new Date().toISOString().slice(0, 10)}.csv`);
    this.pushToast('Dettaglio report esportato in CSV.', 'success');
  }

  protected printReportDrilldown(): void {
    const request = this.reportDrilldownRequest();
    if (!request) {
      return;
    }
    const popup = window.open('', '_blank', 'width=1180,height=780');
    if (!popup) {
      this.pushToast('Popup bloccato dal browser: impossibile aprire la stampa del report.', 'error');
      return;
    }

    const headers = this.reportDrilldownHeaders()
      .map((header) => `<th>${this.escapeHtml(header)}</th>`)
      .join('');
    const rows = this.reportDrilldownRows()
      .map((row) => `<tr>${row.values.map((value) => `<td>${this.escapeHtml(String(value))}</td>`).join('')}</tr>`)
      .join('');
    const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <title>${this.escapeHtml(request.title)}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:24px;color:#0f172a}
    h1{margin:0 0 6px;font-size:20px}
    p{margin:0 0 18px;color:#475569}
    table{width:100%;border-collapse:collapse}
    th,td{border-bottom:1px solid #e2e8f0;padding:10px 8px;font-size:12px;text-align:left}
    th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#475569}
  </style>
</head>
<body>
  <h1>${this.escapeHtml(request.title)}</h1>
  <p>${this.escapeHtml(request.subtitle)}</p>
  <table>
    <thead><tr>${headers}</tr></thead>
    <tbody>${rows || '<tr><td colspan="99">Nessun dato disponibile.</td></tr>'}</tbody>
  </table>
</body>
</html>`;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    setTimeout(() => {
      popup.print();
    }, 250);
  }

  protected executeReportDrilldownAction(row: ReportDrilldownRow): void {
    if (!row.actionType || !row.actionId) {
      return;
    }

    switch (row.actionType) {
      case 'cash': {
        const receipt = this.allCashTransactions().find((transaction) => transaction.id === row.actionId) ?? null;
        this.openCashReceiptsModal();
        this.selectedCashReceiptId.set(receipt?.id ?? null);
        this.syncCashReceiptEditForm(receipt);
        break;
      }
      case 'quote':
        this.selectQuote(row.actionId);
        break;
      case 'client':
        this.selectClient(row.actionId);
        break;
      case 'ticket':
        this.selectTicket(row.actionId);
        break;
      case 'ddt':
        this.openDdtDetail(row.actionId);
        break;
      case 'supplier':
        this.openWarehouseSupplierDetail(row.actionId);
        break;
    }
  }

  protected openReportDrilldown(request: ReportDrilldownRequest): void {
    this.reportDrilldownRequest.set(request);

    switch (request.kind) {
      case 'cash-paid': {
        const rows = [...this.reportCurrentPaidTransactions()]
          .sort((left, right) => (right.settledAt || right.createdAt).localeCompare(left.settledAt || left.createdAt))
          .map<ReportDrilldownRow>((transaction) => ({
            id: transaction.id,
            values: [
              this.epFormatDate(transaction.settledAt || transaction.createdAt),
              transaction.reference,
              transaction.customerName,
              this.reportCashDocumentTypeLabel(transaction.documentType),
              this.reportCashPaymentMethodLabel(transaction.paymentMethod),
              `€ ${this.formatCurrency(transaction.total)}`,
            ],
            actionType: 'cash',
            actionId: transaction.id,
            actionLabel: 'Apri',
          }));
        this.reportDrilldownHeaders.set(['Data', 'Riferimento', 'Cliente', 'Documento', 'Pagamento', 'Totale']);
        this.reportDrilldownRows.set(rows);
        break;
      }
      case 'quotes-all':
      case 'quotes-stage': {
        const allowedStages = (request.filter ?? '')
          .split('|')
          .map((value) => value.trim())
          .filter(Boolean);
        const rows = [...this.reportCurrentQuotes()]
          .filter((quote) => !allowedStages.length || allowedStages.includes(quote.stage))
          .sort((left, right) => String(right.issueDate || right.dueDate).localeCompare(String(left.issueDate || left.dueDate)))
          .map<ReportDrilldownRow>((quote) => ({
            id: quote.id,
            values: [
              this.quoteCode(quote.id),
              this.epFormatDate(quote.issueDate || quote.dueDate),
              quote.customerName,
              quote.projectType,
              this.quoteStageLabel(quote.stage),
              `€ ${this.formatCurrency(quote.value)}`,
            ],
            actionType: 'quote',
            actionId: quote.id,
            actionLabel: 'Apri',
          }));
        this.reportDrilldownHeaders.set(['Numero', 'Data', 'Cliente', 'Progetto', 'Stato', 'Valore']);
        this.reportDrilldownRows.set(rows);
        break;
      }
      case 'expenses': {
        const supplierMap = new Map(this.allExpenseSuppliers().map((supplier) => [supplier.id, supplier.businessName]));
        const rows = [...this.reportCurrentExpenses()]
          .sort((left, right) => right.expenseDate.localeCompare(left.expenseDate))
          .map<ReportDrilldownRow>((expense) => ({
            id: expense.id,
            values: [
              this.epFormatDate(expense.expenseDate),
              expense.description,
              supplierMap.get(expense.supplierId ?? '') ?? expense.genericSupplierLabel ?? '—',
              expense.status,
              `€ ${this.formatCurrency(expense.amountGross)}`,
            ],
          }));
        this.reportDrilldownHeaders.set(['Data', 'Descrizione', 'Fornitore', 'Stato', 'Totale']);
        this.reportDrilldownRows.set(rows);
        break;
      }
      case 'clients-active':
      case 'clients-top': {
        const rows = [...this.reportCurrentClientRows()]
          .map<ReportDrilldownRow>((entry) => ({
            id: entry.client.id,
            values: [
              entry.client.name,
              entry.client.city || '—',
              entry.activities,
              entry.quotes,
              entry.appointments,
              entry.tickets,
              entry.ddts,
              `€ ${this.formatCurrency(entry.revenue)}`,
            ],
            actionType: 'client',
            actionId: entry.client.id,
            actionLabel: 'Scheda',
          }));
        this.reportDrilldownHeaders.set(['Cliente', 'Città', 'Attività', 'Preventivi', 'Agenda', 'Ticket', 'DDT', 'Ricavi']);
        this.reportDrilldownRows.set(rows);
        break;
      }
      case 'tickets': {
        const rows = [...this.reportCurrentTickets()]
          .filter((ticket) => request.filter === 'open' ? ticket.status !== 'chiuso' : true)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .map<ReportDrilldownRow>((ticket) => ({
            id: ticket.id,
            values: [
              this.epFormatDate(ticket.createdAt),
              ticket.title,
              ticket.customerName,
              ticket.technician || '—',
              ticket.priority,
              ticket.status,
            ],
            actionType: 'ticket',
            actionId: ticket.id,
            actionLabel: 'Apri',
          }));
        this.reportDrilldownHeaders.set(['Data', 'Titolo', 'Cliente', 'Tecnico', 'Priorità', 'Stato']);
        this.reportDrilldownRows.set(rows);
        break;
      }
      case 'appointments': {
        const rows = [...this.reportCurrentAppointments()]
          .sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt))
          .map<ReportDrilldownRow>((appointment) => ({
            id: appointment.id,
            values: [
              this.epFormatDateTime(appointment.scheduledAt),
              appointment.customerName,
              appointment.appointmentType,
              appointment.technician || '—',
              appointment.status,
            ],
          }));
        this.reportDrilldownHeaders.set(['Quando', 'Cliente', 'Tipologia', 'Tecnico', 'Stato']);
        this.reportDrilldownRows.set(rows);
        break;
      }
      case 'ddts': {
        const rows = [...this.reportCurrentDdts()]
          .sort((left, right) => String(right.documentDate || right.createdAt).localeCompare(String(left.documentDate || left.createdAt)))
          .map<ReportDrilldownRow>((record) => ({
            id: record.id,
            values: [
              record.number || 'Bozza',
              this.epFormatDate(record.documentDate || record.createdAt),
              record.clientSnapshot || record.recipientSnapshot?.name || '—',
              record.causale || '—',
              record.status,
              record.lines.length,
            ],
            actionType: 'ddt',
            actionId: record.id,
            actionLabel: 'Apri',
          }));
        this.reportDrilldownHeaders.set(['Numero', 'Data', 'Cliente', 'Causale', 'Stato', 'Righe']);
        this.reportDrilldownRows.set(rows);
        break;
      }
      case 'warehouse-movements': {
        const inventoryMap = new Map(this.allInventoryItems().map((item) => [item.id, item.name]));
        const rows = [...this.reportCurrentWarehouseMovements()]
          .sort((left, right) => right.movedAt.localeCompare(left.movedAt))
          .map<ReportDrilldownRow>((movement) => ({
            id: movement.id,
            values: [
              this.epFormatDateTime(movement.movedAt),
              inventoryMap.get(movement.inventoryItemId) ?? movement.inventoryItemId,
              this.warehouseMovementTypeLabel(movement.movementType),
              this.warehouseSourceModuleLabel(movement.sourceModule),
              movement.quantity,
              `€ ${this.formatCurrency(movement.totalCost)}`,
            ],
          }));
        this.reportDrilldownHeaders.set(['Quando', 'Articolo', 'Tipo', 'Origine', 'Qta', 'Costo']);
        this.reportDrilldownRows.set(rows);
        break;
      }
      case 'warehouse-suppliers': {
        const rows = [...this.reportCurrentWarehouseSupplierRows()]
          .map<ReportDrilldownRow>((supplier) => ({
            id: supplier.supplier,
            values: [
              supplier.supplier,
              supplier.records,
              supplier.lastDocumentNumber || '—',
              this.epFormatDate(supplier.lastReceivedDate),
              supplier.distinctItems,
              `€ ${this.formatCurrency(supplier.totalCost)}`,
            ],
            actionType: 'supplier',
            actionId: supplier.supplier,
            actionLabel: 'Apri',
          }));
        this.reportDrilldownHeaders.set(['Fornitore', 'Ordini', 'Ultimo documento', 'Ultima data', 'Articoli', 'Totale']);
        this.reportDrilldownRows.set(rows);
        break;
      }
      case 'services-top':
      case 'services-low': {
        const source = request.kind === 'services-top'
          ? this.reportCurrentServiceTopPerformers()
          : this.reportCurrentServiceLowRotation();
        const rows = source.map<ReportDrilldownRow>((service) => ({
          id: service.id,
          values: [
            service.name,
            service.category,
            service.salesCount,
            service.quoteCount,
            `€ ${this.formatCurrency(service.salesTotal)}`,
          ],
        }));
        this.reportDrilldownHeaders.set(['Servizio', 'Categoria', 'Vendite', 'Preventivi', 'Ricavi']);
        this.reportDrilldownRows.set(rows);
        break;
      }
      case 'payment-method': {
        const rows = [...this.reportCurrentPaidTransactions()]
          .filter((transaction) => transaction.paymentMethod === request.filter)
          .sort((left, right) => (right.settledAt || right.createdAt).localeCompare(left.settledAt || left.createdAt))
          .map<ReportDrilldownRow>((transaction) => ({
            id: transaction.id,
            values: [
              this.epFormatDate(transaction.settledAt || transaction.createdAt),
              transaction.reference,
              transaction.customerName,
              this.reportCashDocumentTypeLabel(transaction.documentType),
              `€ ${this.formatCurrency(transaction.total)}`,
            ],
            actionType: 'cash',
            actionId: transaction.id,
            actionLabel: 'Apri',
          }));
        this.reportDrilldownHeaders.set(['Data', 'Riferimento', 'Cliente', 'Documento', 'Totale']);
        this.reportDrilldownRows.set(rows);
        break;
      }
    }
  }

  protected readonly clientForm = this.formBuilder.nonNullable.group({
    kind: this.formBuilder.nonNullable.control<'privato' | 'azienda'>('privato'),
    name: ['', Validators.required],
    // ✅ Fix ISS-06: validatore telefono italiano/formato internazionale
    phone: ['', [Validators.pattern(/^[+0-9\s-.()]{7,20}$/)]],
    // ✅ Fix ISS-06: validatore email standard Angular
    email: ['', [Validators.email]],
    city: [''],
    address: [''],
    segment: [''],
    preferredContact: this.formBuilder.nonNullable.control<ClientRecord['preferredContact']>(
      'telefono',
    ),
    notes: [''],
    favoriteBrands: [''],
    status: this.formBuilder.nonNullable.control<ClientRecord['status']>('lead'),
    // ✅ Fix ISS-06: validatore partita IVA (IT opzionale + 11 cifre) o Codice Fiscale
    taxId: ['', [Validators.pattern(/^(IT)?[0-9A-Z]{11,16}$/)]],
    // ✅ Fix ISS-06: validatore codice SDI (7 caratteri alfanumerici maiuscoli)
    sdiCode: ['', [Validators.pattern(/^[A-Z0-9]{7}$/)]],
    // ✅ Fix ISS-06: validatore PEC (stessa sintassi email, dominio tipico accettato)
    pec: ['', [Validators.email]],
    billingAddress: [''],
    billingPostalCode: ['', [Validators.pattern(/^[0-9]{5}$/)]],
    billingProvince: ['', [Validators.pattern(/^[A-Z]{2}$/)]],
    billingCountry: ['IT'],
  });

  protected readonly quoteForm = this.formBuilder.nonNullable.group({
    issueDate: [new Date().toISOString().slice(0, 10), Validators.required],
    operatorName: ['', Validators.required],
    customerName: ['', Validators.required],
    isAnonymous: this.formBuilder.control<boolean>(false),
    // ✅ Fix ISS-07: sconto non negativo (min 0)
    discountAmount: this.formBuilder.control<number>(0, [Validators.min(0)]),
    // ✅ Fix ISS-06: telefono
    customerPhone: ['', [Validators.pattern(/^[+0-9\s-.()]{7,20}$/)]],
    // ✅ Fix ISS-06: email
    customerEmail: ['', [Validators.email]],
    customerAddress: [''],
    // ✅ Fix ISS-06: IVA/CF
    customerTaxId: ['', [Validators.pattern(/^(IT)?[0-9A-Z]{11,16}$/)]],
    // ✅ Fix ISS-06: PEC
    customerPec: ['', [Validators.email]],
    // ✅ Fix ISS-06: SDI
    customerSdiCode: ['', [Validators.pattern(/^[A-Z0-9]{7}$/)]],
    attachmentName: [''],
    fulfillmentType: this.formBuilder.nonNullable.control<NonNullable<QuoteRecord['fulfillmentType']>>(
      'showroom',
    ),
    fulfillmentAddress: [''],
    paymentPlan: this.formBuilder.nonNullable.control<NonNullable<QuoteRecord['paymentPlan']>>('unica'),
    installmentCount: [3, [Validators.min(2)]],
    installmentCadence: this.formBuilder.nonNullable.control<NonNullable<QuoteRecord['installmentCadence']>>(
      'mensile',
    ),
    financingProvider: [''],
    paymentAlertDays: [7, [Validators.min(1)]],
    paymentNotes: [''],
    projectType: ['', Validators.required],
    // Il valore è calcolato automaticamente dalle righe: non va chiesto a mano
    value: [0, [Validators.min(0)]],
    dueDate: ['', Validators.required],
    stage: this.formBuilder.nonNullable.control<QuoteRecord['stage']>('bozza'),
    serviceId: [''],
    units: [1, [Validators.min(1)]],
    notes: [''],
  }, {
    // ✅ Fix ISS-07: validatore cross-field scadenza >= data emissione
    validators: [
      (group) => {
        const issue = group.get('issueDate')?.value as string | undefined;
        const due = group.get('dueDate')?.value as string | undefined;
        if (issue && due && new Date(due) < new Date(issue)) {
          return { dueDateBeforeIssue: true };
        }
        return null;
      },
    ],
  });

  protected readonly quotePaymentForm = this.formBuilder.nonNullable.group({
    paymentMethod: this.formBuilder.nonNullable.control<'sul_posto' | 'finanziamento' | 'rateale_interno'>('sul_posto'),
    operatorName: ['Portale Esterno', Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    notes: [''],
  });

  protected readonly appointmentForm = this.formBuilder.nonNullable.group({
    title: ['', Validators.required],
    customerName: ['', Validators.required],
    appointmentType: this.formBuilder.nonNullable.control<AppointmentRecord['appointmentType']>(
      'negozio',
    ),
    locationType: this.formBuilder.nonNullable.control<AppointmentRecord['locationType']>(
      'showroom',
    ),
    address: [''],
    scheduledAt: ['', Validators.required],
    durationMinutes: [60, [Validators.required, Validators.min(15)]],
    // ✅ Fix ISS-01: technician è ora una stringa (come AppointmentRecord e come
    // serviceTicketForm) invece di string[]. La multi-select UI passa per il
    // signal selectedTechnicians (effetto sincronizza sul form control).
    technician: this.formBuilder.nonNullable.control<string>('', Validators.required),
    linkedQuoteId: this.formBuilder.nonNullable.control<string>(''),
    status: this.formBuilder.nonNullable.control<AppointmentRecord['status']>('programmato'),
  });
  // ✅ Fix ISS-01: Signal dedicato alla UI multi-select dei tecnici,
  // sincronizzato bidirezionalmente con il form control stringa.
  protected readonly selectedTechnicians: WritableSignal<string[]> = signal([]);
  protected readonly appointmentTypeCards: ReadonlyArray<{
    value: AppointmentRecord['appointmentType'];
    label: string;
    detail: string;
  }> = [
      { value: 'negozio', label: 'Negozio', detail: 'Appuntamento in showroom o al banco.' },
      { value: 'uscita', label: 'Uscita', detail: 'Intervento rapido fuori sede.' },
      { value: 'installazione', label: 'Installazione', detail: 'Montaggio, consegna e configurazione.' },
      { value: 'assistenza', label: 'Assistenza', detail: 'Supporto tecnico o verifica sul posto.' },
      { value: 'sopralluogo', label: 'Sopralluogo', detail: 'Analisi preliminare e rilievo.' },
    ];
  protected readonly appointmentQuickSlots: ReadonlyArray<string> = [
    '08:00',
    '09:00',
    '10:00',
    '11:00',
    '14:00',
    '15:00',
    '16:00',
    '17:00',
  ];
  protected readonly appointmentDurationCards: ReadonlyArray<{ value: number; label: string }> = [
    { value: 30, label: '30 min' },
    { value: 60, label: '1 ora' },
    { value: 90, label: '1,5 ore' },
    { value: 120, label: '2 ore' },
    { value: 180, label: '3 ore' },
    { value: 240, label: '4 ore' },
  ];
  protected readonly ticketServiceTypeCards: ReadonlyArray<{
    value: ServiceTicketRecord['serviceType'];
    label: string;
    detail: string;
  }> = [
      { value: 'installazione', label: 'Installazione', detail: 'Montaggio, consegna e configurazione.' },
      { value: 'assistenza', label: 'Assistenza', detail: 'Riparazione, supporto e intervento tecnico.' },
      { value: 'diagnosi', label: 'Diagnosi', detail: 'Analisi guasto, test e verifica preventiva.' },
    ];
  protected readonly ticketPriorityCards: ReadonlyArray<{
    value: ServiceTicketRecord['priority'];
    label: string;
    detail: string;
  }> = [
      { value: 'alta', label: 'Alta', detail: 'Intervento urgente o cliente fermo.' },
      { value: 'media', label: 'Media', detail: 'Lavorazione standard con priorità normale.' },
      { value: 'bassa', label: 'Bassa', detail: 'Attività programmabile senza urgenza.' },
    ];
  protected readonly ticketStatusCards: ReadonlyArray<{
    value: ServiceTicketRecord['status'];
    label: string;
    detail: string;
  }> = [
      { value: 'aperto', label: 'Aperto', detail: 'Ticket registrato e da prendere in carico.' },
      { value: 'pianificato', label: 'Pianificato', detail: 'Intervento organizzato ma non avviato.' },
      { value: 'in-lavorazione', label: 'In lavorazione', detail: 'Attività tecnica già in corso.' },
      { value: 'chiuso', label: 'Chiuso', detail: 'Lavorazione completata e pronta per archivio.' },
    ];
  protected readonly appointmentLinkedQuote = computed(() => {
    const quoteId = this.appointmentForm.controls.linkedQuoteId.value;
    if (!quoteId) {
      return null;
    }
    return this.allQuotes().find((item) => item.id === quoteId) ?? null;
  });
  protected readonly appointmentAddressSuggestions = computed(() => {
    const values = new Set<string>();
    for (const client of this.allClients()) {
      if (client.address?.trim()) {
        values.add(`${client.address}, ${client.city}`.trim());
      }
      if (client.city?.trim()) {
        values.add(client.city.trim());
      }
    }
    for (const quote of this.allQuotes()) {
      if (quote.fulfillmentAddress?.trim()) {
        values.add(quote.fulfillmentAddress.trim());
      }
      if (quote.customerAddress?.trim()) {
        values.add(quote.customerAddress.trim());
      }
    }
    return [...values].sort((left, right) => left.localeCompare(right, 'it'));
  });
  protected readonly inventoryForm = this.formBuilder.nonNullable.group({
    sku: ['', Validators.required],
    barcode: [''],
    name: ['', Validators.required],
    category: ['', Validators.required],
    usageType: this.formBuilder.nonNullable.control<InventoryItemRecord['usageType']>('rivendita'),
    stock: [0, [Validators.required, Validators.min(0)]],
    cableRolls: [0, [Validators.min(0)]],
    cableMetersPerRoll: [0, [Validators.min(0)]],
    minStock: [0, [Validators.required, Validators.min(0)]],
    unitCost: [0, [Validators.required, Validators.min(0)]],
    salePrice: [0, [Validators.required, Validators.min(0)]],
    supplier: ['', Validators.required],
    location: ['', Validators.required],
    // ✅ Fix ISS-08: checkbox UI "Aggiorna anche listino prezzi" (default OFF).
    // Se OFF, updateInventoryItem() non sovrascrive il prezzo dei prodotti
    // di cassa collegati (syncCashPrices=false).
    syncCashPrices: this.formBuilder.control<boolean>(false),
  });
  protected readonly expenseForm = this.formBuilder.nonNullable.group({
    description: ['', Validators.required],
    amountGross: [0, [Validators.required, Validators.min(0.01)]],
    vatRate: [22, [Validators.required, Validators.min(0)]],
    // ⭐ 3 flag metodo di calcolo IVA (Italia)
    // amountAlreadyIvato:    UTENTE HA INSERITO L'IMPORTO GIÀ IVATO? (default ITALIA = true)
    //                         → false = utente inserisce NETTO (senza IVA) + IVA aggiunta
    // amountSplitVat:        SE amountAlreadyIvato=true → SCORPORO AUTOMATICO IVA (default true)
    //                         → false = importo già ivato è ESENTE (IVA 0 per legge)
    // amountIsReverseCharge: Reverse Charge / IVA inversa → forza IVA 0 (alias semantico)
    amountAlreadyIvato: [true, [Validators.required]],
    amountSplitVat: [true, [Validators.required]],
    amountIsReverseCharge: [false, [Validators.required]],
    expenseDate: [new Date().toISOString().slice(0, 10), Validators.required],
    dueDate: [new Date().toISOString().slice(0, 10), Validators.required],
    categoryId: ['', Validators.required],
    supplierId: [''],
    genericSupplierLabel: [''],
    paymentMode: this.formBuilder.nonNullable.control<ExpenseRecord['paymentMode']>('singolo'),
    recurringFrequency: this.formBuilder.nonNullable.control<ExpenseRecord['recurringFrequency']>(null),
    paymentMethodId: ['', Validators.required],
    // ⭐ Pagamento · Provider integrato (es. Stripe) + manuale/automatico
    paymentProviderId: [''] as never,            // '' = nessuno, altrimenti id PaymentProvider
    paymentExecution: this.formBuilder.nonNullable.control<PaymentExecutionMode>('manuale'),
    paymentAutoStartDate: [new Date().toISOString().slice(0, 10)],
    paymentNotes: [''],
    installmentsCount: [1, [Validators.min(1)]],
    noticeDaysBefore: [7, [Validators.required, Validators.min(1), Validators.max(30)]],
    notes: [''],
    attachmentName: [''],
    projectCode: [''],
    costCenterCode: [''],
    createdBy: ['Amministrazione', Validators.required],
  }, {
    // ✅ Fix ISS-07: cross-field validators
    validators: [
      // Almeno 1 fornitore: supplierId XOR genericSupplierLabel (esattamente uno)
      (group) => {
        const supId = (group.get('supplierId')?.value ?? '') as string;
        const supLabel = (group.get('genericSupplierLabel')?.value ?? '') as string;
        const hasSupId = supId.trim().length > 0;
        const hasSupLabel = supLabel.trim().length > 0;
        if (!hasSupId && !hasSupLabel) {
          return { expenseMissingSupplier: true };
        }
        if (hasSupId && hasSupLabel) {
          return { expenseAmbiguousSupplier: true };
        }
        return null;
      },
      // Data scadenza rata >= data registrazione spesa
      (group) => {
        const expDate = group.get('expenseDate')?.value as string | undefined;
        const dDate = group.get('dueDate')?.value as string | undefined;
        if (expDate && dDate && new Date(dDate) < new Date(expDate)) {
          return { expenseDueBeforeExpense: true };
        }
        return null;
      },
    ],
  });
  protected readonly expenseSupplierForm = this.formBuilder.nonNullable.group({
    businessName: ['', Validators.required],
    // ✅ Fix ISS-06: validatore partita IVA (prefisso IT opzionale + 11 cifre)
    vatNumber: ['', [Validators.required, Validators.pattern(/^(IT)?\d{11}$/)]],
    address: [''],
    contactName: [''],
    // ✅ Fix ISS-06: email standard Angular
    email: ['', [Validators.email]],
    // ✅ Fix ISS-06: telefono internazionale
    phone: ['', [Validators.pattern(/^[+0-9\s-.()]{7,20}$/)]],
    supplyType: ['', Validators.required],
    active: [true],
  });
  protected readonly warehouseReceiptForm = this.formBuilder.nonNullable.group({
    inventoryItemId: [''],
    sku: ['', Validators.required],
    barcode: [''],
    name: ['', Validators.required],
    description: [''],
    category: ['', Validators.required],
    newCategory: [''],
    usageType: this.formBuilder.nonNullable.control<InventoryItemRecord['usageType']>('rivendita'),
    registrationMode: this.formBuilder.nonNullable.control<'inventario' | 'spesa'>('inventario'),
    unitOfMeasure: ['pz', Validators.required],
    quantity: [0, [Validators.required, Validators.min(1)]],
    cableRolls: [0, [Validators.min(0)]],
    cableMetersPerRoll: [0, [Validators.min(0)]],
    unitCost: [0, [Validators.required, Validators.min(0)]],
    salePrice: [0, [Validators.required, Validators.min(0)]],
    receivedDate: [new Date().toISOString().slice(0, 10), Validators.required],
    supplier: ['', Validators.required],
    lotNumber: [''],
    expiryDate: [''],
    shelfCode: ['', Validators.required],
    minStock: [0, [Validators.required, Validators.min(0)]],
    purchaseDocumentNumber: ['', Validators.required],
    operator: ['Magazzino', Validators.required],
    transportCost: [0, [Validators.min(0)]],
    customsCost: [0, [Validators.min(0)]],
    packagingCost: [0, [Validators.min(0)]],
    // ✅ Fix ISS-08: checkbox UI "Aggiorna anche listino prezzi" (default OFF)
    syncCashPrices: this.formBuilder.control<boolean>(false),
  });
  protected readonly warehouseAdjustmentForm = this.formBuilder.nonNullable.group({
    inventoryItemId: ['', Validators.required],
    actualQuantity: [0, [Validators.required, Validators.min(0)]],
    reason: ['', Validators.required],
    operator: ['Magazzino', Validators.required],
  });

  /** Valore live reattivo del form di rettifica (per aggiornamenti sincronizzati con l'UI) */
  protected readonly warehouseAdjustmentFormLive = toSignal(
    this.warehouseAdjustmentForm.valueChanges.pipe(
      startWith(this.warehouseAdjustmentForm.getRawValue()),
      map(() => this.warehouseAdjustmentForm.getRawValue()),
    ),
    { initialValue: this.warehouseAdjustmentForm.getRawValue() },
  );

  /** Giacenza attuale dell'articolo selezionato nel form di rettifica (sola lettura, reattiva) */
  protected readonly warehouseAdjustmentCurrentStock = computed(() => {
    const id = this.warehouseAdjustmentFormLive().inventoryItemId;
    if (!id) return null;
    const found = this.allInventoryItems().find((item) => item.id === id);
    return found ? found.stock : null;
  });

  /** Elenco operatori per la rettifica: dipendenti attivi + voci standard sempre disponibili */
  protected readonly warehouseAdjustmentOperatorList = computed(() => {
    const fromEmployees = this.data
      .activeCashOperators()
      .map((op) => op.name.trim())
      .filter((name) => name.length > 0);
    const defaults = ['Magazzino', 'Cassa', 'Amministrazione'];
    const merged = [...defaults, ...fromEmployees];
    // rimuove duplicati preservando ordine
    return Array.from(new Set(merged));
  });

  /** Ripristina il form di rettifica rapida ai valori iniziali (pulsante Annulla) */
  protected resetWarehouseAdjustmentForm(): void {
    this.warehouseAdjustmentForm.reset({
      inventoryItemId: '',
      actualQuantity: 0,
      reason: '',
      operator: 'Magazzino',
    });
  }

  // ============ INIZIO PORTALE DIPENDENTI v1 (mobile-first, 4 moduli) ============
  /** Chiave storage per ricordare l'ultimo operatore selezionato sul dispositivo */
  private readonly EP_OPERATOR_STORAGE_KEY = 'audiomax.ep.activeOperatorId';

  /** Definizione delle tab del portale (barra sticky inferiore) */
  protected readonly epTabs = [
    { id: 'dashboard' as const, label: 'Home' },
    { id: 'agenda' as const, label: 'Agenda' },
    { id: 'magazzino' as const, label: 'Materiali' },
    { id: 'comunicazioni' as const, label: 'Messaggi' },
    { id: 'ddt' as const, label: 'DDT' },
    { id: 'servizi' as const, label: 'Servizi' },
    { id: 'ordini' as const, label: 'Ordini' },
  ] as const;

  // Quattro destinazioni frequenti; le altre restano accessibili dal menu "Altro".
  protected readonly epPrimaryTabs = this.epTabs.slice(0, 4);

  /** Tab attualmente selezionata (persistenza in sessione per ricaricamenti pagina) */
  protected readonly epActiveTab = signal<
    'dashboard' | 'magazzino' | 'ddt' | 'servizi' | 'ordini' | 'agenda' | 'comunicazioni'
  >('dashboard');
  protected readonly epCurrentTabLabel = computed(
    () => this.epTabs.find((tab) => tab.id === this.epActiveTab())?.label ?? 'Home',
  );

  /** Visibilità modale "Link telefono / QR" (header) */
  protected epOpenMobilePanel = false;

  // ✅ EP v3: Menu hamburger drawer (navigazione portale dedicato, niente voci gestionali complete!)
  protected readonly epNavDrawerOpen = signal(false);

  // Home: vista portale principale (tab dashboard + sommario)
  protected epResetPortalView(): void {
    this.epActiveTab.set('dashboard');
    this.epNavDrawerOpen.set(false);
    this.epSelectedCommId.set(null);
  }

  protected epGotoTab(id: 'dashboard' | 'magazzino' | 'ddt' | 'servizi' | 'ordini' | 'agenda' | 'comunicazioni'): void {
    this.epActiveTab.set(id);
    this.epSelectedCommId.set(null);
    this.epNavDrawerOpen.set(false);
  }

  /** Elenco operatori attivi da mostrare nella fase di onboarding */
  protected readonly epOperatoriAttivi = this.data.activeCashOperators;

  // ============ PORTALE DIPENDENTI: Permessi Magazzino (configurati dal titolare nel CRM) ============
  /** Modalità di scrittura magazzino configurata per il portale dipendenti */
  protected readonly epInventoryWriteMode = computed(() => this.data.portalSettings().inventoryWriteMode);
  /** Il tecnico può creare nuovi articoli dal portale? (solo in modalità "aggiungi") */
  protected readonly epCanAddInventory = computed(() => this.epInventoryWriteMode() === 'aggiungi');
  /** Il tecnico può modificare gli articoli esistenti dal portale? (esclusa la sola consultazione) */
  protected readonly epCanEditInventory = computed(() => this.epInventoryWriteMode() !== 'solo-lettura');

  /** Opzioni descrittive delle modalità di scrittura magazzino del portale */
  protected readonly epInventoryWriteModeOptions: {
    value: PortalSettings['inventoryWriteMode'];
    label: string;
    hint: string;
    icon: string;
  }[] = [
      {
        value: 'solo-lettura',
        label: 'Solo consultazione',
        hint: 'Il tecnico vede gli articoli e può solo prelevarli.',
        icon: '👀',
      },
      {
        value: 'aggiorna',
        label: 'Aggiorna esistenti',
        hint: 'Può modificare giacenza, prezzi e dati degli articoli già presenti.',
        icon: '✏️',
      },
      {
        value: 'aggiungi',
        label: 'Aggiungi e aggiorna',
        hint: 'Può anche creare nuovi articoli direttamente dal portale.',
        icon: '➕',
      },
    ];

  /** Imposta dal CRM la modalità di scrittura magazzino del portale dipendenti */
  protected epSetInventoryWriteMode(mode: PortalSettings['inventoryWriteMode']): void {
    this.data.updatePortalSettings({ inventoryWriteMode: mode });
    this.pushToast('Impostazione Portale Dipendenti aggiornata', 'success');
  }

  /** ID operatore attivo attualmente selezionato (signal + persistenza storage) */
  protected readonly epActiveOperatorId = (() => {
    let initial: string | null = null;
    try {
      const stored = this.storage.getItem(this.EP_OPERATOR_STORAGE_KEY);
      initial = typeof stored === 'string' ? stored : null;
    } catch {
      initial = null;
    }
    return signal<string | null>(initial);
  })();

  /** Operatore attualmente attivo (computed da signal id + elenco operatori) */
  protected readonly epActiveOperator = computed(() => {
    const id = this.epActiveOperatorId();
    if (!id) return null;
    return this.data.activeCashOperators().find((o) => o.id === id) ?? null;
  });

  /** Permette all'utente di cambiare operatore (ritorna all'onboarding) */
  protected epChangeOperator(): void {
    this.storage.removeItem(this.EP_OPERATOR_STORAGE_KEY);
    this.epActiveOperatorId.set(null);
  }

  /** Seleziona l'operatore per questa sessione e salva nel browser (legacy v1) */
  protected epSelectOperator(operatorId: string): void {
    const op = this.data.activeCashOperators().find((o) => o.id === operatorId);
    if (!op) return;
    this.storage.setItem(this.EP_OPERATOR_STORAGE_KEY, op.id);
    this.epActiveOperatorId.set(op.id);
  }

  // ============ PORTALE DIPENDENTI v2 - Autenticazione e sessione JIT ============
  /** Chiave storage per la sessione portale (autenticazione tecnici) */
  private readonly EP_SESSION_STORAGE_KEY = 'audiomax.ep.session';
  /** Durata massima sessione (2 ore), allineata a AudiomaxDataService.EP_PORTAL_SESSION_TTL_MS */
  private readonly EP_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

  /** Form di login portale (username + password) */
  protected readonly epLoginForm = this.formBuilder.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });
  /** Eventuale messaggio di errore di login */
  protected readonly epLoginError = signal<string>('');
  /** Stato di submit durante l'hash SHA-256 (operazione async) */
  protected readonly epLoginLoading = signal<boolean>(false);

  /** Carica e valida la sessione dal localStorage. */
  private epReadSessionFromStorage(): { operatorId: string; expireAt: number } | null {
    try {
      const raw = this.storage.getItem(this.EP_SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as any;
      if (!parsed || typeof parsed.operatorId !== 'string' || typeof parsed.expireAt !== 'number') return null;
      if (parsed.expireAt < Date.now()) {
        this.storage.removeItem(this.EP_SESSION_STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
  /** Signal sessione (inizializzato da storage). */
  protected readonly epSession = (() => {
    const init = this.epReadSessionFromStorage();
    return signal<{ operatorId: string; expireAt: number } | null>(init);
  })();

  /**
   * ✅ OPERATORE ATTUALE VALIDATO.
   * Computed JIT (just-in-time): ad ogni render ricontrolla SEMPRE:
   *   1) Sessione localStorage valida (expireAt non scaduto)
   *   2) Ruolo = tecnico
   *   3) epPortalEnabled = true
   *   4) epPortalAccessRevokedAt = null
   *   5) hash password ancora presente
   * Qualsiasi controllo fallisce → ritorna NULL = utente cacciato fuori IMMEDIATAMENTE (tempo zero).
   */
  protected readonly epSessionOperator = computed<CashOperatorRecord | null>(() => {
    const session = this.epSession();
    if (!session) return null;
    if (session.expireAt < Date.now()) {
      queueMicrotask(() => this.epLogout());
      return null;
    }
    // Se lo stato dal server LAN non è ancora stato caricato, non validiamo la sessione
    // per evitare logout falsi su dispositivi nuovi (le credenziali arrivano dal server).
    if (!this.data.serverStateReady()) {
      return null;
    }
    // Check JIT via service: legge signal cashOperators LIVE (revokedAt visto immediatamente).
    const ok = this.data.isEpPortalSessionValid(session.operatorId);
    if (!ok) {
      queueMicrotask(() => this.epLogout());
      return null;
    }
    return this.data.cashOperators().find((o) => o.id === session.operatorId) ?? null;
  });

  /** True se siamo nella schermata di login (nessuna sessione valida). */
  protected readonly epIsLoginScreen = computed(() => this.epSessionOperator() === null);

  /** Submit login: chiama verifyEpPortalLogin (async hash) e se ok salva la sessione. */
  protected async epSubmitLogin(): Promise<void> {
    if (this.epLoginLoading()) return;
    const raw = this.epLoginForm.getRawValue();
    if (!raw.username || !raw.password) {
      this.epLoginError.set('Inserisci username e password.');
      return;
    }
    this.epLoginLoading.set(true);
    this.epLoginError.set('');
    try {
      const op = await this.data.verifyEpPortalLogin(String(raw.username).trim(), String(raw.password));
      if (!op) {
        this.epLoginError.set('Credenziali errate, oppure accesso revocato o non abilitato. Contatta il titolare.');
        return;
      }
      const expireAt = Date.now() + this.EP_SESSION_TTL_MS;
      const session = { operatorId: op.id, expireAt };
      this.storage.setItem(this.EP_SESSION_STORAGE_KEY, JSON.stringify(session));
      this.epSession.set(session);
      this.epLoginForm.reset({ username: '', password: '' });
      this.pushToast(`Benvenuto ${op.name}, accesso portale riuscito.`, 'success');
    } finally {
      this.epLoginLoading.set(false);
    }
  }

  /** Logout e pulizia storage. */
  protected epLogout(): void {
    try { this.storage.removeItem(this.EP_SESSION_STORAGE_KEY); } catch { /* ignore */ }
    this.epSession.set(null);
    this.epActiveTab.set('dashboard');
  }

  /** Helper UUID compatibile. */
  private epUuid(): string {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch { /* ignore */ }
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  // ============ PORTALE DIPENDENTI v2 - Admin dipendenti: credenziali + revoca ============
  /** Stato modale "Crea/Resetta credenziali Portale" */
  protected readonly epCredentialsModalOpen = signal<boolean>(false);
  /** Id operatore che stiamo modificando */
  protected readonly epCredentialsTargetId = signal<string | null>(null);
  /** Username suggerito (modificabile) */
  protected readonly epCredentialsUsername = signal<string>('');
  /** Password generata: mostrata UNA SOLA VOLTA dopo il salvataggio. */
  protected readonly epCredentialsPassword = signal<string>('');
  /** True se l'utente ha già salvato e adesso sta vedendo la password. */
  protected readonly epCredentialsShowOnce = signal<boolean>(false);

  /** Normalizza un nome in username (minuscolo, no spazi, no accenti) → "marco.rossi" */
  protected epNormalizeUsername(name: string): string {
    const cleaned = String(name ?? '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s.-]/g, '')
      .trim()
      .replace(/\s+/g, '.');
    return cleaned || 'utente';
  }

  /** Genera password casuale. */
  protected epGeneratePassword(len = 12): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const nums = '23456789';
    const syms = '!@#$%*-_=+';
    const all = upper + lower + nums + syms;
    try {
      const bytes = new Uint8Array(len);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
      let pwd = '';
      for (let i = 0; i < len; i++) pwd += all[(bytes[i] ?? Math.floor(Math.random() * 256)) % all.length];
      return pwd;
    } catch {
      let pwd = '';
      for (let i = 0; i < len; i++) pwd += all[Math.floor(Math.random() * all.length)];
      return pwd;
    }
  }

  /** Apre modale credenziali per un operatore (tecnico).
   *  - Se l'operatore ha già una password salvata, il campo viene lasciato VUOTO:
   *    lasciandolo vuoto al salvataggio si MANTIENE la password attuale.
   *  - Se non ha credenziali, viene proposta una password generata automaticamente
   *    (modificabile a piacere).
   */
  protected epOpenCredentialsModal(operatorId: string): void {
    const op = this.data.cashOperators().find((o) => o.id === operatorId);
    if (!op) return;
    if (op.role !== 'tecnico') { this.pushToast('Il portale dipendenti è disponibile solo per i tecnici.', 'error'); return; }
    this.epCredentialsTargetId.set(operatorId);
    this.epCredentialsUsername.set(op.epPortalUsername || this.epNormalizeUsername(op.name));
    // Se l'operatore ha già una password, lasciamo vuoto il campo: l'utente potrà
    // mantenerla (non modificandola) oppure cambiarla. Generiamo solo se non esiste.
    if (op.epPortalPasswordHash) {
      this.epCredentialsPassword.set('');
    } else {
      this.epCredentialsPassword.set(this.epGeneratePassword(12));
    }
    this.epCredentialsShowOnce.set(false);
    this.epCredentialsModalOpen.set(true);
  }

  /** Genera una nuova password casuale e la inserisce nel campo (su richiesta). */
  protected epGenerateRandomPassword(): void {
    this.epCredentialsPassword.set(this.epGeneratePassword(12));
  }

  /** Chiude il modale credenziali (svuota subito la password per sicurezza). */
  protected epCloseCredentialsModal(): void {
    this.epCredentialsModalOpen.set(false);
    this.epCredentialsTargetId.set(null);
    this.epCredentialsUsername.set('');
    this.epCredentialsPassword.set('');
    this.epCredentialsShowOnce.set(false);
  }

  /** Salva le credenziali.
   *  - Se la password è valorizzata → viene cambiata e mostrata 1 sola volta (auto-copiata).
   *  - Se la password è vuota:
   *      • se l'operatore ha già una password → MANTIENE quella attuale (non la mostra).
   *      • se non ha password → errore (bisogna inserirne una).
   */
  protected async epSaveCredentialsAndShowOnce(): Promise<void> {
    const opId = this.epCredentialsTargetId();
    if (!opId) return;
    const op = this.data.cashOperators().find((o) => o.id === opId);
    if (!op) return;
    const user = this.epCredentialsUsername().trim();
    const pwd = this.epCredentialsPassword();
    if (!user) {
      this.pushToast('Inserisci uno username.', 'error');
      return;
    }
    // Password vuota: è consentito solo se l'operatore ha già una password salvata.
    if (!pwd && !op.epPortalPasswordHash) {
      this.pushToast('Inserisci una password (oppure genera quella automatica).', 'error');
      return;
    }
    const ok = await this.data.setEpPortalCredentials(opId, user, pwd);
    if (!ok) {
      this.pushToast('Impossibile salvare le credenziali.', 'error');
      return;
    }
    if (pwd) {
      // Password cambiata: mostrala una sola volta e auto-copiala.
      this.epCredentialsShowOnce.set(true);
      try {
        if (typeof navigator !== 'undefined' && (navigator as any).clipboard && typeof (navigator as any).clipboard.writeText === 'function') {
          await (navigator as any).clipboard.writeText(pwd).catch(() => undefined);
        }
      } catch { /* ignore */ }
      this.pushToast('Password aggiornata. Copia SUBITO: non la vedrai più!', 'success');
    } else {
      // Password invariata: chiudi il modale.
      this.pushToast('Credenziali aggiornate (password mantenuta).', 'success');
      this.epCloseCredentialsModal();
    }
  }

  /** Revoca immediatamente l'accesso dell'operatore (tempo zero). */
  protected epRevokePortalAccess(operatorId: string): void {
    const op = this.data.cashOperators().find((o) => o.id === operatorId);
    if (!op) return;
    const confirmMsg = `ATTENZIONE: stai revocando l'accesso a ${op.name}.\n` +
      `Da ADESSO non potrà più entrare nel Portale Dipendenti, vedere ordini/DDT/magazzino/agenda/comunicazioni, ` +
      `né scaricare materiale da magazzino tramite l'app.\n` +
      `Per riattivarlo dovrai assegnare una NUOVA password.\n\nConfermi revoca a TEMPO ZERO?`;
    if (!window.confirm(confirmMsg)) return;
    this.data.revokeEpPortalAccess(operatorId);
    this.pushToast(`Accesso revocato immediatamente per ${op.name}.`, 'success');
  }

  /** Ripristina accesso revocato (e auto-apre modale nuova password). */
  protected epRestorePortalAccess(operatorId: string): void {
    this.data.restoreEpPortalAccess(operatorId);
    this.pushToast('Accesso ripristinato. Assegna una nuova password.', 'success');
    this.epOpenCredentialsModal(operatorId);
  }

  /** Toggle "Abilita accesso portale" in anagrafica dipendente (solo abilita flag, non crea credenziali). */
  protected epTogglePortalEnabled(operatorId: string, enabled: boolean): void {
    const op = this.data.cashOperators().find((o) => o.id === operatorId);
    if (!op) return;
    this.data.updateCashOperator({ ...op, epPortalEnabled: !!enabled });
  }

  /** Ritornata la label di stato per l'accesso portale (usata nella lista riga operatore). */
  protected epPortalStatusBadge(op: CashOperatorRecord): { label: string; tone: 'ok' | 'warn' | 'err' | 'dim' } {
    if (op.role !== 'tecnico') return { label: 'Non tecnico', tone: 'dim' };
    if (op.epPortalAccessRevokedAt) return { label: '🛑 REVOCATO', tone: 'err' };
    if (op.epPortalEnabled && op.epPortalPasswordHash) return { label: '✅ Portale attivo', tone: 'ok' };
    if (op.epPortalEnabled) return { label: '⚙️ Credenziali da creare', tone: 'warn' };
    return { label: '🔒 Accesso disabilitato', tone: 'dim' };
  }

  // ============ PORTALE DIPENDENTI v2 - Agenda tecnico ============
  /** Appuntamenti del tecnico attuale (solo suo) ordinati per data. */
  protected readonly epMyAgendaAppts = computed(() => {
    const me = this.epSessionOperator();
    if (!me) return [] as AppointmentRecord[];
    return [...this.data.appointments()]
      .filter((a) => a.technician && a.technician === me.name)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  });

  /** Appuntamenti raggruppati per fascia: Oggi / Domani / Questa settimana / Dopo */
  protected readonly epMyAgendaGroups = computed(() => {
    const items = this.epMyAgendaAppts();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const tomorrowIso = tomorrow.toISOString().slice(0, 10);
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
    const groups: { label: string; items: AppointmentRecord[] }[] = [
      { label: 'Oggi', items: [] },
      { label: 'Domani', items: [] },
      { label: 'Questa settimana', items: [] },
      { label: 'Dopo', items: [] },
    ];
    for (const a of items) {
      const d = a.scheduledAt.slice(0, 10);
      if (d === todayIso) groups[0].items.push(a);
      else if (d === tomorrowIso) groups[1].items.push(a);
      else if (new Date(d).getTime() <= weekEnd.getTime()) groups[2].items.push(a);
      else groups[3].items.push(a);
    }
    return groups.filter((g) => g.items.length > 0);
  });

  // ============ DASHBOARD: statistiche rapide ============
  /** Numero di appuntamenti di oggi per il tecnico */
  protected readonly epDashboardTodayAppts = computed(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    return this.epMyAgendaAppts().filter((a) => a.scheduledAt.slice(0, 10) === todayIso).length;
  });

  /** Numero di articoli in giacenza sotto la soglia minima */
  protected readonly epDashboardLowStock = computed(() =>
    this.allInventoryItems().filter((it) => it.stock <= it.minStock).length,
  );

  /** Numero di ordini in attesa (pending/seen) creati dal tecnico */
  protected readonly epDashboardPendingOrders = computed(() =>
    this.epMieiOrdini().filter((o) => o.status === 'pending' || o.status === 'seen').length,
  );

  /** Numero di comunicazioni non lette per il tecnico */
  protected readonly epDashboardUnreadComms = computed(() => {
    const me = this.epSessionOperator();
    if (!me) return 0;
    return this.data.portalCommunications().filter(
      (c) => c.targetTechnicianIds.includes(me.id) && !c.readBy.some((r) => r.operatorId === me.id),
    ).length;
  });

  /** Data odierna formattata (per la dashboard) */
  protected readonly epDashboardToday = computed(() =>
    this.epFormatDate(new Date().toISOString()),
  );

  protected epAppointmentTypeLabel(t: AppointmentRecord['appointmentType']): string {
    switch (t) {
      case 'negozio': return 'In negozio';
      case 'uscita': return 'Uscita';
      case 'installazione': return 'Installazione';
      case 'assistenza': return 'Assistenza';
      case 'sopralluogo': return 'Sopralluogo';
      default: return String(t ?? '');
    }
  }
  protected epAppointmentLocationLabel(t: AppointmentRecord['locationType']): string {
    switch (t) {
      case 'showroom': return 'Showroom';
      case 'domicilio': return 'Domicilio';
      case 'officina': return 'Officina';
      default: return String(t ?? '');
    }
  }
  protected epAppointmentStatusLabel(s: AppointmentRecord['status']): string {
    switch (s) {
      case 'programmato': return 'Programmato';
      case 'in-corso': return 'In corso';
      case 'chiuso': return 'Chiuso';
      default: return String(s ?? 'Programmato');
    }
  }
  /** Formatta scheduledAt in orari "14:30 - 15:30". */
  protected epAppointmentTimeRange(a: AppointmentRecord): { start: string; end: string } {
    const start = new Date(a.scheduledAt);
    const end = new Date(start.getTime() + (Number(a.durationMinutes) || 0) * 60 * 1000);
    const fmt = (d: Date) => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false });
    return { start: fmt(start), end: fmt(end) };
  }

  // ============ PORTALE DIPENDENTI - Agenda: calendario mensile, dettaglio e creazione ============
  /** Converte una data locale in stringa ISO yyyy-mm-dd (senza slittamenti di fuso) */
  private epIsoDay(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;
  }

  /** Data odierna in formato ISO locale (yyyy-mm-dd) */
  protected epTodayIso(): string {
    return this.epIsoDay(new Date());
  }

  /** Vista agenda: elenco raggruppato oppure calendario mensile */
  protected readonly epAgendaView = signal<'lista' | 'calendario'>('lista');

  /** Primo giorno del mese mostrato nel calendario (ISO yyyy-mm-01) */
  protected readonly epAgendaMonthAnchor = signal<string>(
    (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    })(),
  );

  /** Etichetta del mese mostrato (es. "ottobre 2026") */
  protected readonly epAgendaMonthLabel = computed(() => {
    const [y, m] = this.epAgendaMonthAnchor().split('-').map(Number);
    const now = new Date();
    const d = new Date(y || now.getFullYear(), (m || 1) - 1, 1);
    return d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  });

  /** Settimane del mese per la griglia calendario: ogni cella è un giorno con i suoi appuntamenti */
  protected readonly epAgendaCalendarWeeks = computed(() => {
    const anchor = this.epAgendaMonthAnchor();
    const [y, m] = anchor.split('-').map(Number);
    const first = new Date(y, (m || 1) - 1, 1);
    // Settimana che inizia di lunedì (getDay(): domenica = 0)
    const startOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - startOffset);

    const byDay = new Map<string, AppointmentRecord[]>();
    for (const a of this.epMyAgendaAppts()) {
      const key = a.scheduledAt.slice(0, 10);
      const list = byDay.get(key) ?? [];
      list.push(a);
      byDay.set(key, list);
    }

    const todayIso = this.epTodayIso();
    const weeks: {
      key: string;
      days: {
        key: string;
        iso: string;
        dayNumber: number;
        inMonth: boolean;
        isToday: boolean;
        appts: AppointmentRecord[];
      }[];
    }[] = [];

    const cursor = new Date(gridStart);
    for (let w = 0; w < 6; w++) {
      const days: (typeof weeks)[number]['days'] = [];
      for (let i = 0; i < 7; i++) {
        const iso = this.epIsoDay(cursor);
        days.push({
          key: `${iso}-${i}`,
          iso,
          dayNumber: cursor.getDate(),
          inMonth: cursor.getMonth() === first.getMonth(),
          isToday: iso === todayIso,
          appts: byDay.get(iso) ?? [],
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push({ key: `w${w}`, days });
    }
    return weeks;
  });

  /** Giorno selezionato nel calendario (elenco appuntamenti sotto la griglia) */
  protected readonly epAgendaSelectedDay = signal<string | null>(null);

  /** Appuntamenti del giorno selezionato (o di oggi se nessun giorno è selezionato) */
  protected readonly epAgendaSelectedDayAppts = computed(() => {
    const day = this.epAgendaSelectedDay() ?? this.epTodayIso();
    return this.epMyAgendaAppts().filter((a) => a.scheduledAt.slice(0, 10) === day);
  });

  /** Cambia mese nel calendario (delta in mesi) */
  protected epAgendaShiftMonth(delta: number): void {
    const [y, m] = this.epAgendaMonthAnchor().split('-').map(Number);
    const d = new Date(y, (m || 1) - 1 + delta, 1);
    this.epAgendaMonthAnchor.set(this.epIsoDay(d));
  }

  /** Torna al mese corrente */
  protected epAgendaGoToday(): void {
    const now = new Date();
    this.epAgendaMonthAnchor.set(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
    this.epAgendaSelectedDay.set(this.epTodayIso());
  }

  /** Seleziona/deseleziona un giorno nel calendario (toggle) */
  protected epAgendaSelectDay(iso: string): void {
    this.epAgendaSelectedDay.update((cur) => (cur === iso ? null : iso));
  }

  /** Appuntamento aperto nel dettaglio */
  protected readonly epSelectedAppointmentId = signal<string | null>(null);

  /** Appuntamento selezionato risolto a partire dall'id */
  protected readonly epSelectedAppointment = computed(() => {
    const id = this.epSelectedAppointmentId();
    if (!id) return null;
    return this.epMyAgendaAppts().find((a) => a.id === id) ?? null;
  });

  /** Apre/chiude il dettaglio di un appuntamento */
  protected epToggleAppointmentDetail(id: string): void {
    this.epSelectedAppointmentId.update((cur) => (cur === id ? null : id));
  }

  /** Editor di creazione appuntamento dal portale */
  protected readonly epAppointmentEditorOpen = signal<boolean>(false);

  /** Form di creazione appuntamento (il tecnico è automaticamente l'utente attivo) */
  protected readonly epAppointmentForm = this.formBuilder.nonNullable.group({
    title: [''],
    customerName: ['', Validators.required],
    appointmentType: this.formBuilder.nonNullable.control<AppointmentRecord['appointmentType']>('uscita'),
    locationType: this.formBuilder.nonNullable.control<AppointmentRecord['locationType']>('domicilio'),
    address: [''],
    date: ['', Validators.required],
    time: ['09:00', Validators.required],
    durationMinutes: [60, [Validators.required, Validators.min(15)]],
  });

  /** Apre l'editor per un nuovo appuntamento (opzionalmente precompilando il giorno) */
  protected epOpenNewAppointment(prefillDate?: string): void {
    this.epAppointmentForm.reset({
      title: '',
      customerName: '',
      appointmentType: 'uscita',
      locationType: 'domicilio',
      address: '',
      date: prefillDate ?? this.epTodayIso(),
      time: '09:00',
      durationMinutes: 60,
    });
    this.epAppointmentEditorOpen.set(true);
  }

  /** Chiude l'editor appuntamento */
  protected epCloseAppointmentEditor(): void {
    this.epAppointmentEditorOpen.set(false);
  }

  /** Crea l'appuntamento dal portale, assegnandolo al tecnico attivo */
  protected epSubmitAppointment(): void {
    if (this.epAppointmentForm.invalid) {
      this.epAppointmentForm.markAllAsTouched();
      return;
    }
    const me = this.epSessionOperator();
    if (!me) {
      this.pushToast('Sessione scaduta, accedi di nuovo.', 'error');
      return;
    }
    const raw = this.epAppointmentForm.getRawValue();
    const customerName = raw.customerName.trim();
    this.data.addAppointment({
      title: raw.title.trim() || `${this.epAppointmentTypeLabel(raw.appointmentType)} · ${customerName}`,
      clientId: null,
      customerName,
      appointmentType: raw.appointmentType,
      locationType: raw.locationType,
      address: raw.address.trim(),
      scheduledAt: `${raw.date}T${raw.time || '09:00'}:00`,
      durationMinutes: raw.durationMinutes,
      technician: me.name,
      linkedQuoteId: null,
      status: 'programmato',
    });
    this.pushToast('Appuntamento creato', 'success');
    this.epAppointmentEditorOpen.set(false);
    this.epAgendaSelectedDay.set(raw.date);
  }

  // ============ PORTALE DIPENDENTI v3 - Modifica righe installazione da preventivo ============
  // Il tecnico, in fase di installazione, può aggiungere/rimuovere/modificare le righe
  // del preventivo (es. 3 spine preventivate, ne servono 2). Il costo finale viene ricalcolato
  // e salvato sul preventivo, che poi andrà in cassa con il valore corretto.

  /** ID dell'appuntamento di cui si sta modificando il preventivo (null = nessun editor aperto) */
  protected readonly epEditingQuoteApptId = signal<string | null>(null);

  /** Bozza locale delle righe del preventivo che il tecnico sta modificando */
  protected readonly epQuoteLineDraft = signal<QuoteLineRecord[]>([]);

  /** Insieme degli ID delle righe preventivo (portale dipendenti) in modalità testo libero */
  protected readonly epQuoteLineFreeTextIds = signal<Set<string>>(new Set());

  /** Restituisce il preventivo collegato a un appuntamento, se esiste */
  protected epQuoteForAppointment(appt: AppointmentRecord): QuoteRecord | null {
    if (!appt.linkedQuoteId) return null;
    return this.allQuotes().find((q) => q.id === appt.linkedQuoteId) ?? null;
  }

  /** Apre l'editor delle righe per il preventivo di un appuntamento */
  protected epOpenQuoteEditor(appt: AppointmentRecord): void {
    const quote = this.epQuoteForAppointment(appt);
    if (!quote) {
      this.pushToast('Nessun preventivo collegato a questo appuntamento', 'error');
      return;
    }
    // Copia profonda delle righe esistenti (o array vuoto)
    const lines = (quote.lines ?? []).map((l) => ({ ...l }));
    this.epQuoteLineDraft.set(lines);

    // Per ogni riga, verifica se la descrizione corrisponde a un articolo/servizio esistente.
    // Se non corrisponde, attiva la modalità testo libero per mostrare il valore originale.
    const freeTextIds = new Set<string>();
    for (const line of lines) {
      if (line.kind === 'materiale') {
        const match = this.allInventoryItems().some(
          (it) => it.name.toLowerCase() === line.description.toLowerCase(),
        );
        if (!match && line.description.trim()) freeTextIds.add(line.id);
      } else if (line.kind === 'servizio') {
        const match = this.services().some(
          (s) => s.name.toLowerCase() === line.description.toLowerCase(),
        );
        if (!match && line.description.trim()) freeTextIds.add(line.id);
      } else {
        // 'altro' è sempre testo libero
        freeTextIds.add(line.id);
      }
    }
    this.epQuoteLineFreeTextIds.set(freeTextIds);
    this.epEditingQuoteApptId.set(appt.id);
  }

  /** Chiude l'editor delle righe senza salvare */
  protected epCloseQuoteEditor(): void {
    this.epEditingQuoteApptId.set(null);
    this.epQuoteLineDraft.set([]);
    this.epQuoteLineFreeTextIds.set(new Set());
  }

  /** Attiva/disattiva la modalità testo libero per una riga (portale dipendenti) */
  protected epToggleQuoteLineFreeText(id: string): void {
    this.epQuoteLineFreeTextIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Restituisce true se la riga è in modalità testo libero (portale dipendenti) */
  protected epIsQuoteLineFreeText(id: string): boolean {
    return this.epQuoteLineFreeTextIds().has(id);
  }

  /** Aggiorna un campo di una riga della bozza */
  protected epUpdateDraftLine(
    id: string,
    field: 'description' | 'quantity' | 'unitPrice' | 'vatRate' | 'kind' | 'discountPercent',
    value: string,
  ): void {
    this.epQuoteLineDraft.update((lines) =>
      lines.map((line) => {
        if (line.id !== id) return line;
        if (field === 'description') {
          // Se l'utente seleziona "Altro (scrittura libera)" dal dropdown
          if (value === '__altro__') {
            this.epQuoteLineFreeTextIds.update((set) => {
              if (set.has(id)) return set;
              const next = new Set(set);
              next.add(id);
              return next;
            });
            return { ...line, description: '' };
          }
          return { ...line, description: value };
        }
        if (field === 'kind') {
          const newKind = value as QuoteLineRecord['kind'];
          if (newKind === 'altro') {
            this.epQuoteLineFreeTextIds.update((set) => {
              if (set.has(id)) return set;
              const next = new Set(set);
              next.add(id);
              return next;
            });
          } else {
            this.epQuoteLineFreeTextIds.update((set) => {
              if (!set.has(id)) return set;
              const next = new Set(set);
              next.delete(id);
              return next;
            });
          }
          return { ...line, kind: newKind };
        }
        const numeric = Number(value) || 0;
        if (field === 'quantity') return { ...line, quantity: Math.max(0, numeric) };
        if (field === 'unitPrice') return { ...line, unitPrice: Math.max(0, numeric) };
        if (field === 'discountPercent')
          return { ...line, discountPercent: Math.max(0, Math.min(100, numeric)) };
        return { ...line, vatRate: Math.max(0, numeric) };
      }),
    );
  }

  /** Aggiunge una nuova riga vuota alla bozza */
  protected epAddDraftLine(kind: QuoteLineRecord['kind'] = 'materiale'): void {
    this.epQuoteLineDraft.update((lines) => [
      ...lines,
      {
        id: `qline-${crypto.randomUUID()}`,
        kind,
        description: kind === 'materiale' ? 'Nuovo materiale' : kind === 'servizio' ? 'Nuovo servizio' : 'Altro',
        quantity: 1,
        unitPrice: 0,
        vatRate: 22,
      },
    ]);
  }

  /** Rimuove una riga dalla bozza */
  protected epRemoveDraftLine(id: string): void {
    // 🛡️ Conferma di sicurezza: evita eliminazioni accidentali
    const line = this.epQuoteLineDraft().find((l) => l.id === id);
    const msg = `Rimuovere la riga "${line?.description || '(senza descrizione)'}" dal preventivo?\n\nQuesta azione non può essere annullata.`;
    if (!window.confirm(msg)) return;
    this.epQuoteLineDraft.update((lines) => lines.filter((l) => l.id !== id));
  }

  /** Totale della bozza (somma dei totali riga, IVA inclusa) */
  protected readonly epDraftTotal = computed(() =>
    this.epQuoteLineDraft().reduce((sum, l) => sum + this.quoteLineTotal(l), 0),
  );

  /** Salva le righe modificate sul preventivo e aggiorna il valore totale */
  protected epSaveQuoteLines(): void {
    const me = this.epSessionOperator();
    if (!me) {
      this.pushToast('Sessione scaduta, ripeti il login', 'error');
      return;
    }
    // Check JIT revoca
    if (!this.data.isEpPortalSessionValid(me.id)) {
      this.pushToast('Accesso revocato dal titolare', 'error');
      this.epLogout();
      return;
    }

    const apptId = this.epEditingQuoteApptId();
    if (!apptId) return;
    const appt = this.epMyAgendaAppts().find((a) => a.id === apptId);
    const quote = appt ? this.epQuoteForAppointment(appt) : null;
    if (!quote) {
      this.pushToast('Preventivo non trovato', 'error');
      return;
    }

    const updatedQuote: QuoteRecord = {
      ...quote,
      lines: this.epQuoteLineDraft().map((l) => ({ ...l })),
      value: Math.round(this.epDraftTotal() * 100) / 100,
    };
    this.data.updateQuote(updatedQuote);
    this.pushToast(
      `Preventivo aggiornato: € ${updatedQuote.value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      'success',
    );
    this.epCloseQuoteEditor();
  }

  // ============ PORTALE DIPENDENTI v2 - Comunicazioni lato tecnico + campanella ============
  /** Comunicazioni destinate al tecnico attuale (target include me). Più recenti prima. */
  protected readonly epMyCommunications = computed(() => {
    const me = this.epSessionOperator();
    if (!me) return [] as PortalCommunicationRecord[];
    return [...this.data.portalCommunications()]
      .filter((c) => c.targetTechnicianIds.includes(me.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  /** Conteggio comunicazioni nuove/non-lette per la campanella. */
  protected readonly epBellUnreadCount = computed(() => {
    const me = this.epSessionOperator();
    if (!me) return 0;
    return this.epMyCommunications().filter((c) => {
      const alreadyRead = c.readBy.some((r) => r.operatorId === me.id);
      // Stato "inviata" e non ancora letta = nuova.
      return c.status === 'inviata' && !alreadyRead;
    }).length;
  });

  /** Comunicazione selezionata nel portale tecnico (dettaglio). */
  protected readonly epSelectedCommId = signal<string | null>(null);
  protected readonly epSelectedComm = computed(() => {
    const id = this.epSelectedCommId();
    if (!id) return null;
    return this.epMyCommunications().find((c) => c.id === id) ?? null;
  });

  /** Apre dettaglio comunicazione e marca come letta (solo se non già letta). */
  protected epOpenCommAndMarkRead(commId: string): void {
    const me = this.epSessionOperator();
    if (!me) return;
    this.epSelectedCommId.set(commId);
    this.data.markPortalCommunicationRead(commId, me.id);
  }
  protected epCloseCommDetail(): void { this.epSelectedCommId.set(null); }

  /** Trigger: tecnico conferma "carica materiale" → scarico FIFO immediato. */
  protected epLoadCommLine(line: PortalCommunicationLine): void {
    const me = this.epSessionOperator();
    const comm = this.epSelectedComm();
    if (!me || !comm) { this.pushToast('Sessione non valida o comunicazione non trovata.', 'error'); return; }
    // Check JIT revoca prima di qualunque cosa.
    if (!this.data.isEpPortalSessionValid(me.id)) { this.epLogout(); this.pushToast('Sessione scaduta o revocata.', 'error'); return; }
    if (line.loadedQuantity >= Math.max(1, line.requiredQuantity)) {
      this.pushToast('Riga già caricata.', 'error');
      return;
    }
    if (!line.inventoryItemId) {
      this.pushToast('Questa riga non è stata associata a un articolo di magazzino dal titolare: non puoi caricarla.', 'error');
      return;
    }
    const qty = this.data.loadPortalCommunicationLine({
      commId: comm.id,
      lineId: line.id,
      operatorId: me.id,
      operatorName: me.name,
    });
    if (!qty || qty <= 0) {
      this.pushToast('Impossibile caricare: scorte insufficienti in magazzino o accesso revocato.', 'error');
      return;
    }
    this.pushToast(`✅ Caricato ${qty} pz · "${line.description.slice(0, 40)}" · Scaricato da magazzino (FIFO).`, 'success');
  }

  /** Marca la comunicazione "completata" dal tecnico (solo dopo caricato materiale o se non ci sono righe). */
  protected epMarkCommCompleted(commId: string): void {
    const me = this.epSessionOperator();
    if (!me) return;
    if (!this.data.isEpPortalSessionValid(me.id)) { this.epLogout(); this.pushToast('Sessione scaduta o revocata.', 'error'); return; }
    const comm = this.data.portalCommunications().find((c) => c.id === commId);
    if (!comm) return;
    const loadableLines = comm.lines.filter((l) => l.inventoryItemId && l.requiredQuantity > 0);
    const allLoaded = loadableLines.every((l) => l.loadedQuantity >= l.requiredQuantity);
    if (loadableLines.length > 0 && !allLoaded && comm.status !== 'materiale-caricato') {
      this.pushToast('Devi prima caricare TUTTO il materiale previsto (righe verdi "✅").', 'error');
      return;
    }
    this.data.updatePortalCommunication({ ...comm, status: 'completata' });
    this.pushToast('Servizio segnato come completato 🎉', 'success');
  }

  /** Nome tecnico per readBy (label nel dettaglio). */
  protected epReadAtForMe(comm: PortalCommunicationRecord): string | null {
    const me = this.epSessionOperator();
    if (!me) return null;
    const found = comm.readBy.find((r) => r.operatorId === me.id);
    if (!found) return null;
    return new Date(found.at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  protected epPriorityLabel(p: PortalCommunicationRecord['priority']): string {
    return p === 'alta' ? 'ALTA' : p === 'bassa' ? 'bassa' : 'media';
  }
  protected epPriorityTone(p: PortalCommunicationRecord['priority']): 'ok' | 'warn' | 'err' | 'dim' | 'info' {
    return p === 'alta' ? 'err' : p === 'bassa' ? 'dim' : 'warn';
  }
  protected epCommStatusLabel(s: PortalCommunicationRecord['status']): string {
    switch (s) {
      case 'bozza': return 'Bozza';
      case 'inviata': return 'Inviata';
      case 'letta': return 'Letta';
      case 'materiale-caricato': return 'Materiale caricato';
      case 'completata': return 'Completata';
      default: return String(s ?? '');
    }
  }
  protected epCommStatusTone(s: PortalCommunicationRecord['status']): 'ok' | 'warn' | 'err' | 'dim' | 'info' {
    switch (s) {
      case 'bozza': return 'dim';
      case 'inviata': return 'warn';
      case 'letta': return 'info';
      case 'materiale-caricato': return 'info';
      case 'completata': return 'ok';
      default: return 'dim';
    }
  }
  /** Preventivo collegato (se esiste). */
  protected epQuoteById(id: string | null): QuoteRecord | null {
    if (!id) return null;
    return this.data.quotes().find((q) => q.id === id) ?? null;
  }
  /** Articolo di inventario per id (usato nel dettaglio riga). */
  protected epInventoryItemById(id: string | null): InventoryItemRecord | null {
    if (!id) return null;
    return this.data.inventoryItems().find((i) => i.id === id) ?? null;
  }

  // ============ PORTALE DIPENDENTI v2 - Sezione admin "Comunicazioni Portale" (titolare) ============
  /** Tutte le comunicazioni lato admin (più recenti prima). */
  protected readonly epAdminAllComms = computed(() =>
    [...this.data.portalCommunications()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );

  /** Stato editor "Nuova/Modifica comunicazione". */
  protected readonly epAdminCommEditorOpen = signal<boolean>(false);
  protected readonly epAdminCommEditingId = signal<string | null>(null);
  protected readonly epAdminCommTitle = signal<string>('');
  protected readonly epAdminCommPriority = signal<PortalCommunicationRecord['priority']>('media');
  protected readonly epAdminCommBody = signal<string>('');
  protected readonly epAdminCommLinkedQuoteId = signal<string | null>(null);
  protected readonly epAdminCommLinkedApptId = signal<string | null>(null);
  protected readonly epAdminCommTargetIds = signal<string[]>([]);
  /** Righe bozza della comunicazione (prima del salvataggio). */
  protected readonly epAdminCommLines = signal<PortalCommunicationLine[]>([]);
  /** Riga nuova in inserimento (aggiunta manuale). */
  protected epAdminNewLineForm: { description: string; requiredQuantity: number; inventoryItemId: string | null } = {
    description: '',
    requiredQuantity: 1,
    inventoryItemId: null,
  };

  protected epAdminOpenNewComm(): void {
    this.epAdminCommEditingId.set(null);
    this.epAdminCommTitle.set('');
    this.epAdminCommPriority.set('media');
    this.epAdminCommBody.set('');
    this.epAdminCommLinkedQuoteId.set(null);
    this.epAdminCommLinkedApptId.set(null);
    this.epAdminCommTargetIds.set([]);
    this.epAdminCommLines.set([]);
    this.epAdminNewLineForm.description = '';
    this.epAdminNewLineForm.requiredQuantity = 1;
    this.epAdminNewLineForm.inventoryItemId = null;
    this.epAdminCommEditorOpen.set(true);
  }
  protected epAdminCloseCommEditor(): void { this.epAdminCommEditorOpen.set(false); }

  /** Elenco dei soli tecnici attivi per il picker destinatari. */
  protected readonly epAdminTechnicians = computed(() =>
    this.data.activeCashOperators().filter((o) => o.role === 'tecnico'),
  );

  /** Toggle tecnico destinatario. */
  protected epAdminToggleTech(opId: string): void {
    const list = this.epAdminCommTargetIds();
    this.epAdminCommTargetIds.set(list.includes(opId) ? list.filter((x) => x !== opId) : [...list, opId]);
  }

  /**
   * Quando l'admin seleziona un preventivo dal picker:
   * auto-imposta titolo (se vuoto) + auto-importa righe kind="materiale"
   * con inventoryItemId=null (titolare DEVE scegliere esplicitamente).
   */
  protected epAdminOnLinkedQuoteChange(quoteId: string | null): void {
    this.epAdminCommLinkedQuoteId.set(quoteId);
    if (!quoteId) return;
    const q = this.data.quotes().find((x) => x.id === quoteId);
    if (!q) return;
    if (!this.epAdminCommTitle().trim()) {
      this.epAdminCommTitle.set(`Servizio ${q.id} · ${q.customerName}`);
    }
    if (!q.lines || q.lines.length === 0) return;
    const existing = this.epAdminCommLines();
    const fromQuote: PortalCommunicationLine[] = q.lines
      .filter((l) => l.kind === 'materiale')
      .map((l) => ({
        id: `com-line-${this.epUuid()}`,
        fromQuoteLineId: l.id,
        description: l.description,
        inventoryItemId: null,
        requiredQuantity: Number(l.quantity) || 1,
        loadedQuantity: 0,
        loadedByOperatorId: null,
        loadedAt: null,
        warehouseMovementId: null,
      }));
    if (fromQuote.length) {
      this.epAdminCommLines.set([...existing, ...fromQuote]);
      this.pushToast(`Importate ${fromQuote.length} righe materiale dal preventivo. Associa ORA ogni articolo di magazzino!`, 'success');
    }
  }

  /** Aggiungi riga manuale all'editor. */
  protected epAdminAddLine(): void {
    const desc = String(this.epAdminNewLineForm.description ?? '').trim();
    const qty = Math.max(1, Number(this.epAdminNewLineForm.requiredQuantity) || 1);
    if (!desc) { this.pushToast('Inserisci descrizione riga.', 'error'); return; }
    const line: PortalCommunicationLine = {
      id: `com-line-${this.epUuid()}`,
      fromQuoteLineId: null,
      description: desc,
      inventoryItemId: this.epAdminNewLineForm.inventoryItemId,
      requiredQuantity: qty,
      loadedQuantity: 0,
      loadedByOperatorId: null,
      loadedAt: null,
      warehouseMovementId: null,
    };
    this.epAdminCommLines.set([...this.epAdminCommLines(), line]);
    this.epAdminNewLineForm.description = '';
    this.epAdminNewLineForm.requiredQuantity = 1;
    this.epAdminNewLineForm.inventoryItemId = null;
  }

  /** Rimuove riga dall'editor. */
  protected epAdminRemoveLine(lineId: string): void {
    this.epAdminCommLines.set(this.epAdminCommLines().filter((l) => l.id !== lineId));
  }

  /** Aggiorna l'articolo di magazzino di una riga. */
  protected epAdminSetLineItem(lineId: string, itemId: string | null): void {
    this.epAdminCommLines.set(this.epAdminCommLines().map((l) =>
      l.id === lineId ? { ...l, inventoryItemId: itemId } : l,
    ));
  }

  /** Aggiorna qty richiesta (modifica riga). */
  protected epAdminSetLineQty(lineId: string, qty: number): void {
    const n = Math.max(1, Number(qty) || 1);
    this.epAdminCommLines.set(this.epAdminCommLines().map((l) =>
      l.id === lineId ? { ...l, requiredQuantity: n } : l,
    ));
  }

  /** Salva comunicazione: come bozza o invia (status='inviata'). */
  protected epAdminSaveComm(sendNow: boolean): void {
    const title = this.epAdminCommTitle().trim();
    const targets = this.epAdminCommTargetIds();
    const lines = this.epAdminCommLines();
    if (!title) { this.pushToast('Inserisci titolo.', 'error'); return; }
    if (sendNow && targets.length === 0) { this.pushToast('Seleziona almeno un tecnico destinatario.', 'error'); return; }
    if (sendNow && lines.length === 0 && !this.epAdminCommBody().trim()) {
      if (!window.confirm('Stai inviando una comunicazione senza righe materiale e senza testo note. Continuare?')) return;
    }
    if (sendNow) {
      const missing = lines.filter((l) => l.requiredQuantity > 0 && !l.inventoryItemId);
      if (missing.length > 0) {
        if (!window.confirm(
          `ATTENZIONE: ${missing.length} righe NON hanno un articolo di magazzino associato.\n` +
          `I tecnici NON potranno scaricarle da magazzino. Vuoi inviare comunque?`)) return;
      }
    }
    const status: PortalCommunicationRecord['status'] = sendNow ? 'inviata' : 'bozza';
    const editingId = this.epAdminCommEditingId();
    if (editingId) {
      const existing = this.data.portalCommunications().find((c) => c.id === editingId);
      if (existing) {
        this.data.updatePortalCommunication({
          ...existing,
          title,
          priority: this.epAdminCommPriority(),
          body: this.epAdminCommBody(),
          linkedQuoteId: this.epAdminCommLinkedQuoteId(),
          linkedAppointmentId: this.epAdminCommLinkedApptId(),
          targetTechnicianIds: targets,
          lines,
          status,
        });
        this.pushToast(sendNow ? 'Comunicazione inviata ai tecnici.' : 'Bozza aggiornata.', 'success');
        this.epAdminCloseCommEditor();
        return;
      }
    }
    this.data.addPortalCommunication({
      createdBy: 'Titolare',
      title,
      priority: this.epAdminCommPriority(),
      body: this.epAdminCommBody(),
      linkedQuoteId: this.epAdminCommLinkedQuoteId(),
      linkedAppointmentId: this.epAdminCommLinkedApptId(),
      targetTechnicianIds: targets,
      status,
      lines,
    });
    this.pushToast(sendNow ? 'Comunicazione creata e inviata ai tecnici.' : 'Bozza salvata.', 'success');
    this.epAdminCloseCommEditor();
  }

  /** Apre comunicazione esistente in modifica. */
  protected epAdminOpenExistingComm(commId: string): void {
    const c = this.data.portalCommunications().find((x) => x.id === commId);
    if (!c) return;
    this.epAdminCommEditingId.set(c.id);
    this.epAdminCommTitle.set(c.title);
    this.epAdminCommPriority.set(c.priority);
    this.epAdminCommBody.set(c.body);
    this.epAdminCommLinkedQuoteId.set(c.linkedQuoteId);
    this.epAdminCommLinkedApptId.set(c.linkedAppointmentId);
    this.epAdminCommTargetIds.set([...c.targetTechnicianIds]);
    this.epAdminCommLines.set(c.lines.map((l) => ({ ...l })));
    this.epAdminCommEditorOpen.set(true);
  }

  /** Comunicazione selezionata lato admin (pannello laterale dettaglio). */
  protected readonly epAdminSelectedCommId = signal<string | null>(null);
  protected readonly epAdminSelectedComm = computed(() => {
    const id = this.epAdminSelectedCommId();
    if (!id) return null;
    return this.data.portalCommunications().find((c) => c.id === id) ?? null;
  });
  protected epAdminSelectComm(id: string): void {
    this.epAdminSelectedCommId.set(id === this.epAdminSelectedCommId() ? null : id);
  }
  /** Etichetta "letti da:" per admin (lista nomi + orari). */
  protected epAdminReadersLabel(c: PortalCommunicationRecord): string {
    if (!c.readBy.length) return '—';
    const names = c.readBy.map((r) => {
      const op = this.data.cashOperators().find((o) => o.id === r.operatorId);
      const name = op?.name ?? 'Tecnico';
      const day = new Date(r.at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `${name} (${day})`;
    });
    return names.join(', ');
  }
  /** Nomi tecnici da lista id (destinatari, UI). */
  protected epAdminTechNames(ids: string[]): string {
    const names = ids
      .map((id) => this.data.cashOperators().find((o) => o.id === id)?.name)
      .filter(Boolean) as string[];
    return names.length ? names.join(', ') : '—';
  }

  /** Calcola le iniziali di un nome (es. "Marco Rossi" → "MR") */
  protected initialsOf(name: string): string {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '??';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /** Helper etichette stato DDT (spostato da template per evitare "as any") */
  protected epDdtStatusLabel(status: WarehouseDdtRecord['status']): string {
    switch (status) {
      case 'bozza': return 'Bozza';
      case 'emesso': return 'Emesso';
      case 'consegnato': return 'Consegnato';
      case 'annullato': return 'Annullato';
      default: return String(status ?? 'Bozza');
    }
  }

  /** Conteggio dei DDT per stato (usato dalla barra KPI cliccabile) */
  protected ddtStatusCount(status: WarehouseDdtRecord['status']): number {
    return this.ddtDocuments().filter((d) => d.status === status).length;
  }

  /** Imposta il filtro di stato dal pulsante KPI ('tutti' mostra l'elenco completo) */
  protected ddtSetStatusFilter(status: 'tutti' | WarehouseDdtRecord['status']): void {
    this.ddtFilterStatus.set(status);
  }

  /** Helper etichette tipo servizio */
  protected epServiceTypeLabel(type: PendingServiceRecord['type']): string {
    switch (type) {
      case 'installazione': return 'Installazione';
      case 'officina': return 'Officina';
      case 'sopralluogo': return 'Sopralluogo';
      case 'ritiro': return 'Ritiro';
      case 'altro': return 'Altro';
      default: return String(type ?? 'Altro');
    }
  }

  /** Helper etichette stato servizio */
  protected epServiceStatusLabel(status: PendingServiceRecord['status']): string {
    switch (status) {
      case 'inviato': return 'Inviato';
      case 'pagato': return 'Pagato';
      case 'annullato': return 'Annullato';
      default: return String(status ?? 'Inviato');
    }
  }

  /** Helper etichette urgenza ordine */
  protected epOrderUrgencyLabel(urgency: WarehouseOrderRecord['urgency']): string {
    switch (urgency) {
      case 'bassa': return 'Bassa';
      case 'media': return 'Media';
      case 'alta': return 'Alta';
      default: return String(urgency ?? 'Media');
    }
  }

  /** Helper etichette tipo ordine */
  protected epOrderTypeLabel(orderType: WarehouseOrderRecord['orderType']): string {
    switch (orderType) {
      case 'richiesta-cliente': return 'Richiesta cliente';
      case 'riordino': return 'Riordino';
      case 'uso-interno': return 'Uso interno';
      case 'altro': return 'Altro';
      default: return String(orderType ?? 'Altro');
    }
  }

  /** Helper etichette stato ordine */
  protected epOrderStatusLabel(status: WarehouseOrderRecord['status']): string {
    switch (status) {
      case 'pending': return 'In attesa';
      case 'seen': return 'Visto';
      case 'approved': return 'Approvato';
      case 'received': return 'Arrivato';
      case 'cancelled': return 'Cancellato';
      default: return String(status ?? 'In attesa');
    }
  }

  /** Cast valore input a numero (helper usabile da template, dove Number globale non è accessibile) */
  protected epToNum(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  // --- Modulo MAGAZZINO: ricerca + dettaglio + prelievo installazione ---------
  protected readonly epWarehouseSearch = signal<string>('');
  protected readonly epSelectedInventoryItem = signal<InventoryItemRecord | null>(null);

  /** Chiave storage degli articoli usati di recente nel portale */
  private readonly EP_RECENT_ITEMS_STORAGE_KEY = 'audiomax.ep.recentItems';
  /** Numero massimo di articoli recenti mostrati */
  private readonly EP_RECENT_ITEMS_MAX = 6;

  /** ID degli ultimi articoli usati (il più recente in testa), persistiti nel browser */
  protected readonly epRecentInventoryIds = (() => {
    let initial: string[] = [];
    try {
      const raw = this.storage.getItem(this.EP_RECENT_ITEMS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          initial = parsed.filter((value): value is string => typeof value === 'string');
        }
      }
    } catch {
      initial = [];
    }
    return signal<string[]>(initial);
  })();

  /** Articoli recenti risolti (ignora eventuali ID non più esistenti) */
  protected readonly epRecentInventoryItems = computed(() => {
    const items = this.allInventoryItems();
    return this.epRecentInventoryIds()
      .map((id) => items.find((it) => it.id === id) ?? null)
      .filter((it): it is InventoryItemRecord => it !== null);
  });

  /** Apre la scheda di prelievo partendo da un articolo recente */
  protected epSelectRecentItem(item: InventoryItemRecord): void {
    this.epResetPrelievoForm();
    this.epSelectedInventoryItem.set(item);
  }

  /** Memorizza un articolo tra i "usati di recente" (il più recente in testa) */
  private epRegisterRecentItem(id: string): void {
    this.epRecentInventoryIds.update((ids) => {
      const next = [id, ...ids.filter((value) => value !== id)].slice(0, this.EP_RECENT_ITEMS_MAX);
      try {
        this.storage.setItem(this.EP_RECENT_ITEMS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage non disponibile: ignora */
      }
      return next;
    });
  }

  /** Elenco articoli filtrati per ricerca testuale (nome, sku, categoria, fornitore) */
  protected readonly epFilteredInventoryItems = computed(() => {
    const q = this.epWarehouseSearch().trim().toLowerCase();
    const items = this.allInventoryItems();
    if (!q) return items;
    return items.filter((it) => {
      const haystack = `${it.name ?? ''} ${it.sku ?? ''} ${it.category ?? ''} ${it.supplier ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  });

  // --- Portale MAGAZZINO: editor articolo (creazione/modifica) gated dai permessi del titolare ---
  /** Editor articolo aperto nel portale (creazione o modifica) */
  protected readonly epInventoryEditorOpen = signal<boolean>(false);
  /** ID dell'articolo in modifica (null = nuovo articolo) */
  protected readonly epEditingInventoryId = signal<string | null>(null);

  /** Form compatto di creazione/modifica articolo dal portale */
  protected readonly epInventoryForm = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    sku: [''],
    barcode: [''],
    category: [''],
    stock: [0, [Validators.required, Validators.min(0)]],
    minStock: [0, [Validators.min(0)]],
    unitCost: [0, [Validators.min(0)]],
    salePrice: [0, [Validators.min(0)]],
    supplier: [''],
    location: [''],
  });

  /** Apre l'editor per un nuovo articolo (solo se il titolare ha abilitato l'inserimento) */
  protected epOpenNewInventoryItem(): void {
    if (!this.epCanAddInventory()) {
      this.pushToast('Inserimento nuovi articoli non abilitato dal titolare.', 'error');
      return;
    }
    this.epEditingInventoryId.set(null);
    this.epInventoryForm.reset({
      name: '',
      sku: '',
      barcode: '',
      category: '',
      stock: 0,
      minStock: 0,
      unitCost: 0,
      salePrice: 0,
      supplier: '',
      location: '',
    });
    this.epInventoryEditorOpen.set(true);
  }

  /** Apre l'editor per modificare un articolo esistente (solo se abilitato) */
  protected epOpenEditInventoryItem(item: InventoryItemRecord): void {
    if (!this.epCanEditInventory()) {
      this.pushToast('Modifica articoli non abilitata dal titolare.', 'error');
      return;
    }
    this.epEditingInventoryId.set(item.id);
    this.epInventoryForm.reset({
      name: item.name ?? '',
      sku: item.sku ?? '',
      barcode: item.barcode ?? '',
      category: item.category ?? '',
      stock: item.stock ?? 0,
      minStock: item.minStock ?? 0,
      unitCost: item.unitCost ?? 0,
      salePrice: item.salePrice ?? 0,
      supplier: item.supplier ?? '',
      location: item.location ?? '',
    });
    this.epInventoryEditorOpen.set(true);
  }

  /** Chiude l'editor articolo del portale */
  protected epCloseInventoryEditor(): void {
    this.epInventoryEditorOpen.set(false);
    this.epEditingInventoryId.set(null);
  }

  /** Salva l'articolo dal portale: crea o aggiorna in base ai permessi del titolare */
  protected epSubmitInventoryItem(): void {
    if (this.epInventoryForm.invalid) {
      this.epInventoryForm.markAllAsTouched();
      return;
    }
    const raw = this.epInventoryForm.getRawValue();
    const editingId = this.epEditingInventoryId();

    if (editingId) {
      if (!this.epCanEditInventory()) {
        this.pushToast('Modifica articoli non abilitata dal titolare.', 'error');
        return;
      }
      const existing = this.allInventoryItems().find((it) => it.id === editingId);
      if (!existing) {
        this.pushToast('Articolo non trovato.', 'error');
        return;
      }
      this.data.updateInventoryItem({
        ...existing,
        name: raw.name.trim(),
        sku: raw.sku.trim(),
        barcode: raw.barcode.trim(),
        category: raw.category.trim(),
        stock: raw.stock,
        minStock: raw.minStock,
        unitCost: raw.unitCost,
        salePrice: raw.salePrice,
        supplier: raw.supplier.trim(),
        location: raw.location.trim(),
      });
      this.pushToast(`Articolo "${raw.name.trim()}" aggiornato`, 'success');
    } else {
      if (!this.epCanAddInventory()) {
        this.pushToast('Inserimento nuovi articoli non abilitato dal titolare.', 'error');
        return;
      }
      this.data.addInventoryItem({
        name: raw.name.trim(),
        sku: raw.sku.trim(),
        barcode: raw.barcode.trim(),
        category: raw.category.trim(),
        usageType: 'rivendita',
        stock: raw.stock,
        cableRolls: null,
        cableMetersPerRoll: null,
        minStock: raw.minStock,
        unitCost: raw.unitCost,
        salePrice: raw.salePrice,
        supplier: raw.supplier.trim(),
        location: raw.location.trim(),
      });
      this.pushToast(`Articolo "${raw.name.trim()}" creato`, 'success');
    }
    this.epCloseInventoryEditor();
  }

  protected readonly epPrelievoClienteSearch = signal<string>('');

  /** Clienti suggeriti durante il prelievo (ricerca nome) */
  protected readonly epPrelievoClientiFiltrati = computed(() => {
    const q = this.epPrelievoClienteSearch().trim().toLowerCase();
    if (!q) return [];
    return this.allClients()
      .filter((c) => (c.name || '').toLowerCase().includes(q))
      .slice(0, 20);
  });

  protected readonly epPrelievoForm = this.formBuilder.nonNullable.group({
    quantity: [1, [Validators.required, Validators.min(1)]],
    clientSearch: [''],
    clientId: [''],
    note: [''],
  });
  protected readonly epPrelievoLastConfirmMessage = signal<string>('');

  /** Associa un cliente al prelievo corrente (clic sulla pill) */
  protected epPrelievoSelectClient(client: ClientRecord): void {
    this.epPrelievoForm.patchValue({ clientSearch: client.name, clientId: client.id });
    this.epPrelievoClienteSearch.set(client.name);
  }

  /** Ripristina il form di prelievo */
  protected epResetPrelievoForm(): void {
    this.epPrelievoForm.reset({ quantity: 1, clientSearch: '', clientId: '', note: '' });
    this.epPrelievoClienteSearch.set('');
  }

  /** Helper: sincronizza input search cliente Prelievo (signal + form reactive, evita warning ngModel+formControlName) */
  protected epPrelievoClientSearchInput(target: EventTarget | null): void {
    const val = (target as HTMLInputElement).value ?? '';
    this.epPrelievoClienteSearch.set(val);
    this.epPrelievoForm.get('clientSearch')?.setValue(val, { emitEvent: false });
  }

  /** Helper: sincronizza input search cliente DDT (signal + form reactive) */
  protected epDdtClientSearchInput(target: EventTarget | null): void {
    const val = (target as HTMLInputElement).value ?? '';
    this.epDdtClienteSearch.set(val);
    this.epDdtForm.get('clientSearch')?.setValue(val, { emitEvent: false });
  }

  /** Helper: sincronizza input search cliente Servizi (signal + form reactive) */
  protected epServiceClientSearchInput(target: EventTarget | null): void {
    const val = (target as HTMLInputElement).value ?? '';
    this.epServiceClienteSearch.set(val);
    this.epServiceForm.get('clientSearch')?.setValue(val, { emitEvent: false });
  }

  /** Helper: sincronizza input search cliente Ordini (signal + form reactive) */
  protected epOrderClientSearchInput(target: EventTarget | null): void {
    const val = (target as HTMLInputElement).value ?? '';
    this.epOrderClienteSearch.set(val);
    this.epOrderForm.get('clientSearch')?.setValue(val, { emitEvent: false });
  }

  // --- Modulo DDT CRM -------------------------------------------------------
  /** Identificativo operatore usato per i DDT creati dal gestionale CRM (visibili anche nel portale dipendenti) */
  protected readonly crmDdtOperatorId = 'crm-ddt';

  protected readonly ddtCauseOptions = [
    'Vendita',
    'Consegna merce',
    'Reso a fornitore',
    'Reso da cliente',
    'Trasferimento tra magazzini',
    'Conto visione',
    'Conto lavoro',
    'Riparazione o assistenza',
    'Materiale destinato a installazione',
    'Altro',
  ];

  private ddtMakeLineForm(): FormGroup {
    return this.formBuilder.nonNullable.group({
      search: [''],
      inventoryItemId: [''],
      itemCode: [''],
      description: [''],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      unitOfMeasure: ['pz'],
      note: [''],
      lotNumber: [''],
      serialNumber: [''],
      quoteLineId: [''],
      plannedQuantity: [0],
      alreadyDeliveredQuantity: [0],
      remainingQuantity: [0],
    });
  }

  protected readonly ddtLinesForm: FormArray = this.formBuilder.array([this.ddtMakeLineForm()]);
  protected get ddtLineGroups(): FormGroup[] {
    return this.ddtLinesForm.controls as FormGroup[];
  }

  protected readonly ddtForm = this.formBuilder.nonNullable.group({
    clientSearch: [''],
    clientId: [''],
    recipientMode: ['cliente'],
    recipientName: [''],
    recipientAddress: [''],
    recipientPostalCode: [''],
    recipientCity: [''],
    recipientProvince: [''],
    recipientVatNumber: [''],
    recipientTaxCode: [''],
    deliveryName: [''],
    deliveryAddress: [''],
    deliveryPostalCode: [''],
    deliveryCity: [''],
    deliveryProvince: [''],
    series: ['A'],
    documentDate: [new Date().toISOString().slice(0, 10), Validators.required],
    transportStartAt: [''],
    causale: ['Vendita', Validators.required],
    departurePlace: [''],
    destinationPlace: [''],
    carrierName: [''],
    vehicle: [''],
    transportMethod: [''],
    packageCount: [0],
    packagingType: [''],
    weight: [''],
    linkedQuoteId: [''],
    linkedQuoteNumber: [''],
    linkedTicketId: [''],
    linkedAppointmentId: [''],
    referenceOrder: [''],
    referenceJob: [''],
    referenceOther: [''],
    note: [''],
    internalNote: [''],
    inventoryMode: ['scarico'],
    alsoDeduct: [true],
    lines: this.ddtLinesForm,
  });

  protected readonly ddtClientSuggestions = computed(() => {
    const q = this.ddtForm.controls.clientSearch.value.trim().toLowerCase();
    if (!q) return [];
    return this.allClients()
      .filter((client) =>
        `${client.name} ${client.phone} ${client.email} ${client.city}`.toLowerCase().includes(q),
      )
      .slice(0, 10);
  });

  protected readonly ddtQuoteSuggestions = computed(() => {
    const q = this.ddtQuoteSearch().trim().toLowerCase();
    const quotes = [...this.allQuotes()].sort((left, right) =>
      String(right.issueDate ?? right.dueDate ?? '').localeCompare(String(left.issueDate ?? left.dueDate ?? '')),
    );
    if (!q) {
      return quotes.slice(0, 30);
    }
    return quotes.filter((quote) => {
      const haystack = [
        this.quoteCode(quote.id),
        quote.customerName,
        quote.projectType,
        quote.issueDate ?? '',
        quote.dueDate ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  });

  protected readonly ddtDocuments = computed(() =>
    [...this.data.warehouseDdts()].sort((left, right) =>
      String(right.documentDate || right.createdAt).localeCompare(String(left.documentDate || left.createdAt)),
    ),
  );

  protected readonly ddtSavedDraftDocuments = computed(() =>
    this.ddtDocuments().filter((record) => record.status === 'bozza'),
  );

  protected readonly ddtLocalDraft = computed<DdtLocalDraftSummary | null>(() => {
    const savedAt = this.formDrafts.savedAt('ddt');
    if (!savedAt) {
      return null;
    }

    const stored = this.formDrafts.peekDraft<{
      recipientName?: string;
      causale?: string;
      documentDate?: string;
      linkedQuoteNumber?: string;
      lines?: Array<unknown>;
    }>('ddt');
    if (!stored) {
      return null;
    }

    return {
      savedAt,
      recipientName: String(stored.value.recipientName ?? '').trim(),
      causale: String(stored.value.causale ?? '').trim(),
      documentDate: String(stored.value.documentDate ?? '').trim(),
      linkedQuoteNumber: String(stored.value.linkedQuoteNumber ?? '').trim(),
      lineCount: Array.isArray(stored.value.lines) ? stored.value.lines.length : 0,
    };
  });

  protected readonly ddtDraftCount = computed(
    () => this.ddtSavedDraftDocuments().length + (this.ddtLocalDraft() ? 1 : 0),
  );

  protected readonly selectedDdtSendRecord = computed(
    () => this.ddtDocuments().find((item) => item.id === this.ddtSendRecordId()) ?? null,
  );

  protected readonly ddtCauseFilterOptions = computed(() => {
    const found = new Set(this.ddtCauseOptions);
    for (const record of this.ddtDocuments()) {
      const cause = (record.causale ?? '').trim();
      if (cause) found.add(cause);
    }
    return ['tutte', ...Array.from(found)];
  });

  protected readonly filteredDdts = computed(() => {
    const q = this.ddtSearch().trim().toLowerCase();
    const clientId = this.ddtFilterClientId();
    const status = this.ddtFilterStatus();
    const cause = this.ddtFilterCause();
    const from = this.ddtFilterFrom();
    const to = this.ddtFilterTo();

    return this.ddtDocuments().filter((record) => {
      const docDate = String(record.documentDate || record.createdAt).slice(0, 10);
      if (clientId !== 'tutti' && record.clientId !== clientId) return false;
      if (status !== 'tutti' && record.status !== status) return false;
      if (cause !== 'tutte' && (record.causale ?? '') !== cause) return false;
      if (from && docDate < from) return false;
      if (to && docDate > to) return false;
      if (!q) return true;

      const haystack = [
        record.number,
        record.clientSnapshot,
        record.clientCode ?? '',
        record.causale ?? '',
        record.linkedQuoteNumber ?? '',
        ...record.lines.map((line) => `${line.itemCode ?? ''} ${line.itemSnapshot}`),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  });

  protected readonly selectedDdtRecord = computed(
    () => this.ddtDocuments().find((record) => record.id === this.ddtDetailId()) ?? null,
  );

  protected ddtClientSearchInput(target: EventTarget | null): void {
    const value = (target as HTMLInputElement | null)?.value ?? '';
    this.ddtForm.controls.clientSearch.setValue(value, { emitEvent: false });
  }

  protected ddtLineSuggestions(index: number): InventoryItemRecord[] {
    const ctrl = this.ddtLinesForm.at(index) as FormGroup;
    const q = String(ctrl.get('search')?.value ?? '').trim().toLowerCase();
    if (!q) return [];
    return this.allInventoryItems()
      .filter((item) => `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(q))
      .slice(0, 8);
  }

  protected ddtSelectClient(client: ClientRecord): void {
    const billing = client.privacyProfile.billingProfile;
    this.ddtForm.patchValue({
      clientSearch: client.name,
      clientId: client.id,
      recipientMode: 'cliente',
      recipientName: client.name,
      recipientAddress: billing?.billingAddress || client.address || '',
      recipientPostalCode: '',
      recipientCity: client.city || '',
      recipientProvince: '',
      recipientVatNumber: billing?.kind === 'azienda' ? billing?.taxId ?? '' : '',
      recipientTaxCode: billing?.kind !== 'azienda' ? billing?.taxId ?? '' : '',
      deliveryName: client.name,
      deliveryAddress: client.address || billing?.billingAddress || '',
      deliveryPostalCode: '',
      deliveryCity: client.city || '',
      deliveryProvince: '',
    });
  }

  protected ddtSelectInventoryItem(index: number, item: InventoryItemRecord): void {
    const ctrl = this.ddtLinesForm.at(index) as FormGroup;
    ctrl.patchValue({
      search: item.name,
      inventoryItemId: item.id,
      itemCode: item.sku || item.id,
      description: item.name,
      unitOfMeasure: 'pz',
    });
  }

  protected ddtAddLine(): void {
    this.ddtLinesForm.push(this.ddtMakeLineForm());
  }

  protected ddtRemoveLine(index: number): void {
    if (this.ddtLinesForm.length <= 1) return;
    const ctrl = this.ddtLinesForm.at(index) as FormGroup;
    const description = String(ctrl.get('description')?.value ?? 'riga DDT').trim() || 'riga DDT';
    if (!window.confirm(`Rimuovere "${description}" dal DDT?`)) return;
    this.ddtLinesForm.removeAt(index);
  }

  protected openDdtEditor(): void {
    this.ddtEditingId.set(null);
    this.resetDdtEditor();
    this.restoreFormDraft('ddt', this.ddtForm);
    this.ddtEditorModalOpen.set(true);
  }

  protected closeDdtEditor(): void {
    if (this.ddtForm.dirty && !window.confirm('Chiudere il DDT? Le modifiche non salvate resteranno in bozza locale.')) {
      return;
    }
    this.ddtEditorModalOpen.set(false);
    this.ddtEditingId.set(null);
  }

  protected openDdtDetail(recordId: string): void {
    this.ddtDetailId.set(recordId);
    this.ddtDetailModalOpen.set(true);
  }

  protected closeDdtDetail(): void {
    this.ddtDetailModalOpen.set(false);
    this.ddtDetailId.set(null);
  }

  protected openDdtQuotePicker(): void {
    this.ddtQuoteSearch.set('');
    this.ddtQuotePickerOpen.set(true);
  }

  protected closeDdtQuotePicker(): void {
    this.ddtQuotePickerOpen.set(false);
  }

  protected openDdtDrafts(): void {
    this.ddtDraftsModalOpen.set(true);
  }

  protected closeDdtDrafts(): void {
    this.ddtDraftsModalOpen.set(false);
  }

  protected resumeLocalDdtDraft(): void {
    this.ddtDraftsModalOpen.set(false);
    this.openDdtEditor();
  }

  protected deleteLocalDdtDraft(): void {
    if (!this.hasFormDraft('ddt')) {
      return;
    }
    if (!window.confirm('Eliminare la bozza locale del DDT non ancora salvata come documento?')) {
      return;
    }
    this.clearFormDraft('ddt');
    this.pushToast('Bozza locale DDT eliminata.', 'success');
  }

  protected openDdtFromQuoteRecord(quoteId: string): void {
    const quote = this.allQuotes().find((item) => item.id === quoteId) ?? null;
    if (!quote) {
      this.pushToast('Preventivo non trovato.', 'error');
      return;
    }

    this.ddtEditingId.set(null);
    this.resetDdtEditor();
    this.ddtForm.patchValue({
      linkedQuoteId: quote.id,
      linkedQuoteNumber: this.quoteCode(quote.id),
      clientSearch: quote.customerName,
      recipientName: quote.customerName,
      recipientAddress: quote.customerAddress || '',
      deliveryName: quote.customerName,
      deliveryAddress: quote.fulfillmentAddress || quote.customerAddress || '',
      documentDate: new Date().toISOString().slice(0, 10),
      causale: 'Materiale destinato a installazione',
      destinationPlace: quote.fulfillmentAddress || quote.customerAddress || '',
      note: quote.notes || '',
      inventoryMode: 'scarico',
      alsoDeduct: true,
    });

    const client = quote.clientId ? this.allClients().find((item) => item.id === quote.clientId) ?? null : null;
    if (client) {
      this.ddtSelectClient(client);
      this.ddtForm.patchValue({
        linkedQuoteId: quote.id,
        linkedQuoteNumber: this.quoteCode(quote.id),
        causale: 'Materiale destinato a installazione',
        destinationPlace: quote.fulfillmentAddress || quote.customerAddress || '',
        note: quote.notes || '',
      });
    }

    this.replaceDdtLinesFromQuote(quote);
    this.ddtEditorModalOpen.set(true);
    this.ddtQuotePickerOpen.set(false);
  }

  protected editDdtRecord(recordId: string): void {
    const record = this.ddtDocuments().find((item) => item.id === recordId) ?? null;
    if (!record) return;
    if (record.status !== 'bozza') {
      this.pushToast('Puoi modificare solo DDT in bozza. Duplica il documento per creare una variante.', 'error');
      return;
    }

    this.ddtEditingId.set(record.id);
    this.resetDdtEditor();
    this.patchDdtFormFromRecord(record);
    this.ddtEditorModalOpen.set(true);
  }

  protected duplicateDdtRecord(recordId: string): void {
    const record = this.ddtDocuments().find((item) => item.id === recordId) ?? null;
    if (!record) return;

    this.ddtEditingId.set(null);
    this.resetDdtEditor();
    this.patchDdtFormFromRecord(record, true);
    this.ddtEditorModalOpen.set(true);
  }

  protected deleteDdtDraftRecord(recordId: string): void {
    const record = this.ddtDocuments().find((item) => item.id === recordId) ?? null;
    if (!record || record.status !== 'bozza') {
      return;
    }
    if (!window.confirm(`Eliminare definitivamente la bozza ${record.number || 'senza numero'}?`)) {
      return;
    }
    this.data.deleteWarehouseDdt(record.id);
    if (this.ddtDetailId() === record.id) {
      this.closeDdtDetail();
    }
    this.pushToast('Bozza DDT eliminata.', 'success');
  }

  protected async submitDdtDocument(emit: boolean): Promise<void> {
    if (this.ddtForm.invalid) {
      this.pushToast('Completa i campi obbligatori del DDT.', 'error');
      return;
    }

    const raw = this.ddtForm.getRawValue();
    const lines = this.normalizeDdtLines(raw.lines as Array<Record<string, unknown>>);

    if (!lines.length) {
      this.pushToast('Inserisci almeno una riga merce valida.', 'error');
      return;
    }

    const existing = this.ddtEditingId()
      ? this.ddtDocuments().find((item) => item.id === this.ddtEditingId()) ?? null
      : null;

    if (existing && !window.confirm('Confermi il salvataggio delle modifiche al DDT?')) {
      return;
    }

    const client = raw.clientId ? this.allClients().find((item) => item.id === raw.clientId) ?? null : null;
    const payload = this.buildDdtRecordPayload(raw, lines, client, existing);

    let record = existing
      ? { ...existing, ...payload, number: existing.number, status: existing.status }
      : this.data.addWarehouseDdt(payload);

    if (existing) {
      this.data.updateWarehouseDdt(record);
    }

    if (emit) {
      if (!record.number) {
        const assignedNumber = await this.data.reserveWarehouseDdtNumber(record.documentDate, record.series ?? 'A');
        const emitted = this.data.updateWarehouseDdtStatus(record.id, 'emesso', {
          assignedNumber,
          operatorId: record.createdByOperatorId,
          operatorName: record.createdByOperatorName,
          note: 'Documento emesso dal modulo DDT',
        });
        record = emitted ?? record;
      } else if (record.status === 'bozza') {
        record = this.data.updateWarehouseDdtStatus(record.id, 'emesso', {
          operatorId: record.createdByOperatorId,
          operatorName: record.createdByOperatorName,
          note: 'Documento emesso dal modulo DDT',
        }) ?? record;
      }

      record = this.applyInventoryEffectsForDdt(record, 'emesso');
      this.pushToast(`DDT ${record.number || 'emesso'} salvato correttamente.`, 'success');
    } else {
      this.pushToast(existing ? 'Bozza DDT aggiornata.' : 'Bozza DDT salvata.', 'success');
    }

    this.clearFormDraft('ddt');
    this.ddtEditorModalOpen.set(false);
    this.ddtEditingId.set(null);
    this.ddtForm.markAsPristine();
  }

  protected ddtSetDelivered(recordId: string): void {
    const record = this.ddtDocuments().find((item) => item.id === recordId) ?? null;
    if (!record) return;
    if (!window.confirm('Confermi la marcatura del DDT come consegnato?')) return;
    this.data.updateWarehouseDdtStatus(record.id, 'consegnato', {
      operatorId: record.createdByOperatorId,
      operatorName: record.createdByOperatorName,
      note: 'Consegna confermata',
    });
    this.pushToast('DDT segnato come consegnato.', 'success');
  }

  protected cancelDdtRecord(recordId: string): void {
    const record = this.ddtDocuments().find((item) => item.id === recordId) ?? null;
    if (!record) return;
    const reason = window.prompt('Inserisci la motivazione dell’annullamento del DDT:', record.cancellationReason ?? '');
    if (reason === null) return;
    if (!reason.trim()) {
      this.pushToast('Inserisci una motivazione per annullare il DDT.', 'error');
      return;
    }
    if (!window.confirm(`Confermi l'annullamento del DDT ${record.number || 'in bozza'}?`)) return;

    const updated = this.data.updateWarehouseDdtStatus(record.id, 'annullato', {
      operatorId: record.createdByOperatorId,
      operatorName: record.createdByOperatorName,
      cancellationReason: reason.trim(),
      note: `Documento annullato: ${reason.trim()}`,
    });

    if (updated) {
      this.applyInventoryEffectsForDdt(updated, 'annullato');
      this.pushToast('DDT annullato con storico conservato.', 'success');
    }
  }

  protected ddtLinkedQuoteLabel(record: WarehouseDdtRecord): string {
    if (record.linkedQuoteNumber?.trim()) return record.linkedQuoteNumber;
    if (record.linkedQuoteId) return this.quoteCode(record.linkedQuoteId);
    return '—';
  }

  protected openDdtSendModal(recordId: string): void {
    const record = this.ddtDocuments().find((item) => item.id === recordId) ?? null;
    if (!record) {
      return;
    }
    const client = this.resolveDdtClient(record);
    this.ddtSendRecordId.set(record.id);
    this.ddtSendPhone.set(client?.phone ?? '');
    this.ddtSendEmail.set(client?.email && !client.email.endsWith('@cash.local') ? client.email : '');
    this.ddtSendModalOpen.set(true);
  }

  protected closeDdtSendModal(): void {
    this.ddtSendModalOpen.set(false);
    this.ddtSendRecordId.set(null);
    this.ddtSendPhone.set('');
    this.ddtSendEmail.set('');
  }

  protected updateDdtSendPhone(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.ddtSendPhone.set(target?.value ?? '');
  }

  protected updateDdtSendEmail(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.ddtSendEmail.set(target?.value ?? '');
  }

  protected async sendDdtWhatsapp(): Promise<void> {
    const record = this.selectedDdtSendRecord();
    if (!record) {
      return;
    }

    const normalizedPhone = this.privacyDispatch.normalizeWhatsappPhone(this.ddtSendPhone());
    if (!normalizedPhone) {
      this.pushToast('Numero WhatsApp non valido o mancante.', 'error');
      return;
    }

    const shareResult = await this.shareDdtPdf(record, this.buildDdtWhatsappMessage(record));
    if (shareResult === 'shared') {
      this.pushToast('PDF DDT pronto nella condivisione del dispositivo.', 'success');
      this.closeDdtSendModal();
      return;
    }
    if (shareResult === 'cancelled') {
      return;
    }

    const blob = this.buildDdtPdfBlob(record);
    this.downloadBlob(blob, this.ddtPdfFileName(record));
    const targetUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(this.buildDdtWhatsappMessage(record))}`;
    const opened = this.privacyDispatch.openExternalUrl(targetUrl);
    if (!opened) {
      this.pushToast('Popup bloccato dal browser: impossibile aprire WhatsApp.', 'error');
      return;
    }

    this.pushToast('PDF scaricato: allegalo al messaggio WhatsApp appena aperto.', 'success');
    this.closeDdtSendModal();
  }

  protected async sendDdtEmail(): Promise<void> {
    const record = this.selectedDdtSendRecord();
    if (!record) {
      return;
    }

    const email = this.ddtSendEmail().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.pushToast('Indirizzo email non valido o mancante.', 'error');
      return;
    }

    const shareResult = await this.shareDdtPdf(record, this.buildDdtEmailBody(record));
    if (shareResult === 'shared') {
      this.pushToast('PDF DDT pronto nella condivisione del dispositivo.', 'success');
      this.closeDdtSendModal();
      return;
    }
    if (shareResult === 'cancelled') {
      return;
    }

    const blob = this.buildDdtPdfBlob(record);
    this.downloadBlob(blob, this.ddtPdfFileName(record));
    const targetUrl =
      `mailto:${email}?subject=${encodeURIComponent(this.buildDdtEmailSubject(record))}` +
      `&body=${encodeURIComponent(this.buildDdtEmailBody(record))}`;
    this.privacyDispatch.openExternalUrl(targetUrl);
    this.pushToast('PDF scaricato: allegalo alla mail appena aperta.', 'success');
    this.closeDdtSendModal();
  }

  protected ddtDeliveredFromQuote(quoteId: string, quoteLineId: string, excludeRecordId: string | null = null): number {
    return this.ddtDocuments()
      .filter((record) => record.linkedQuoteId === quoteId && record.id !== excludeRecordId && record.status !== 'annullato')
      .flatMap((record) => record.lines)
      .filter((line) => line.quoteLineId === quoteLineId)
      .reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  }

  private resetDdtEditor(): void {
    // Sospende la sincronizzazione bozza: il reset a valori di default non deve creare una bozza locale
    this.runWithoutDraftSync('ddt', () => {
      while (this.ddtLinesForm.length) this.ddtLinesForm.removeAt(0);
      this.ddtLinesForm.push(this.ddtMakeLineForm());
      this.ddtForm.reset({
        clientSearch: '',
        clientId: '',
        recipientMode: 'cliente',
        recipientName: '',
        recipientAddress: '',
        recipientPostalCode: '',
        recipientCity: '',
        recipientProvince: '',
        recipientVatNumber: '',
        recipientTaxCode: '',
        deliveryName: '',
        deliveryAddress: '',
        deliveryPostalCode: '',
        deliveryCity: '',
        deliveryProvince: '',
        series: 'A',
        documentDate: new Date().toISOString().slice(0, 10),
        transportStartAt: '',
        causale: 'Vendita',
        departurePlace: '',
        destinationPlace: '',
        carrierName: '',
        vehicle: '',
        transportMethod: '',
        packageCount: 0,
        packagingType: '',
        weight: '',
        linkedQuoteId: '',
        linkedQuoteNumber: '',
        linkedTicketId: '',
        linkedAppointmentId: '',
        referenceOrder: '',
        referenceJob: '',
        referenceOther: '',
        note: '',
        internalNote: '',
        inventoryMode: 'scarico',
        alsoDeduct: true,
        lines: [this.ddtMakeLineForm().getRawValue()],
      });
      this.ddtForm.markAsPristine();
    });
  }

  private replaceDdtLinesFromQuote(quote: QuoteRecord, excludeRecordId: string | null = null): void {
    while (this.ddtLinesForm.length) this.ddtLinesForm.removeAt(0);
    const materialLines = (quote.lines ?? []).filter((line) => line.kind === 'materiale');

    for (const line of materialLines) {
      const alreadyDelivered = this.ddtDeliveredFromQuote(quote.id, line.id, excludeRecordId);
      const remaining = Math.max(0, Number(line.quantity || 0) - alreadyDelivered);
      const matched = this.allInventoryItems().find(
        (item) => item.name.trim().toLowerCase() === line.description.trim().toLowerCase(),
      );
      const ctrl = this.ddtMakeLineForm();
      ctrl.patchValue({
        search: line.description,
        inventoryItemId: matched?.id ?? '',
        itemCode: matched?.sku ?? '',
        description: line.description,
        quantity: remaining > 0 ? remaining : line.quantity,
        unitOfMeasure: 'pz',
        quoteLineId: line.id,
        plannedQuantity: line.quantity,
        alreadyDeliveredQuantity: alreadyDelivered,
        remainingQuantity: remaining,
      });
      this.ddtLinesForm.push(ctrl);
    }

    if (this.ddtLinesForm.length > 1) {
      this.ddtLinesForm.removeAt(0);
    }
  }

  private patchDdtFormFromRecord(record: WarehouseDdtRecord, duplicate = false): void {
    while (this.ddtLinesForm.length) this.ddtLinesForm.removeAt(0);
    for (const line of record.lines) {
      const ctrl = this.ddtMakeLineForm();
      ctrl.patchValue({
        search: line.itemSnapshot,
        inventoryItemId: line.inventoryItemId ?? '',
        itemCode: line.itemCode ?? '',
        description: line.itemSnapshot,
        quantity: line.quantity,
        unitOfMeasure: line.unitOfMeasure ?? 'pz',
        note: line.note ?? '',
        lotNumber: line.lotNumber ?? '',
        serialNumber: line.serialNumber ?? '',
        quoteLineId: line.quoteLineId ?? '',
        plannedQuantity: line.plannedQuantity ?? 0,
        alreadyDeliveredQuantity: line.alreadyDeliveredQuantity ?? 0,
        remainingQuantity: line.remainingQuantity ?? 0,
      });
      this.ddtLinesForm.push(ctrl);
    }
    if (this.ddtLinesForm.length > 1) {
      this.ddtLinesForm.removeAt(0);
    }

    this.ddtForm.patchValue({
      clientSearch: record.clientSnapshot || record.recipientSnapshot?.name || '',
      clientId: record.clientId ?? '',
      recipientMode: record.clientId ? 'cliente' : 'occasionale',
      recipientName: record.recipientSnapshot?.name ?? record.clientSnapshot ?? '',
      recipientAddress: record.recipientSnapshot?.address ?? '',
      recipientPostalCode: record.recipientSnapshot?.postalCode ?? '',
      recipientCity: record.recipientSnapshot?.city ?? '',
      recipientProvince: record.recipientSnapshot?.province ?? '',
      recipientVatNumber: record.recipientSnapshot?.vatNumber ?? '',
      recipientTaxCode: record.recipientSnapshot?.taxCode ?? '',
      deliveryName: record.deliverySnapshot?.name ?? '',
      deliveryAddress: record.deliverySnapshot?.address ?? record.destination ?? '',
      deliveryPostalCode: record.deliverySnapshot?.postalCode ?? '',
      deliveryCity: record.deliverySnapshot?.city ?? '',
      deliveryProvince: record.deliverySnapshot?.province ?? '',
      series: record.series ?? 'A',
      documentDate: duplicate ? new Date().toISOString().slice(0, 10) : record.documentDate,
      transportStartAt: duplicate ? '' : this.toDateTimeLocal(record.transportStartAt ?? ''),
      causale: record.causale ?? 'Vendita',
      departurePlace: record.departurePlace ?? '',
      destinationPlace: record.destinationPlace ?? record.destination ?? '',
      carrierName: record.carrierName ?? '',
      vehicle: record.vehicle ?? '',
      transportMethod: record.transportMethod ?? '',
      packageCount: record.packageCount ?? 0,
      packagingType: record.packagingType ?? '',
      weight: record.weight ?? '',
      linkedQuoteId: record.linkedQuoteId ?? '',
      linkedQuoteNumber: record.linkedQuoteNumber ?? '',
      linkedTicketId: record.linkedTicketId ?? '',
      linkedAppointmentId: record.linkedAppointmentId ?? '',
      referenceOrder: record.referenceOrder ?? '',
      referenceJob: record.referenceJob ?? '',
      referenceOther: record.referenceOther ?? '',
      note: record.note ?? '',
      internalNote: record.internalNote ?? '',
      inventoryMode: record.inventoryMode ?? 'nessuno',
      alsoDeduct: record.alsoDeduct ?? false,
    });
    this.ddtForm.markAsPristine();
  }

  private normalizeDdtLines(rawLines: Array<Record<string, unknown>>): WarehouseDdtLineRecord[] {
    return rawLines
      .filter((row) => Number(row['quantity']) > 0 && String(row['description'] ?? '').trim())
      .map((row) => {
        const inventoryItemId = String(row['inventoryItemId'] ?? '').trim();
        const linked = inventoryItemId
          ? this.allInventoryItems().find((item) => item.id === inventoryItemId)
          : null;
        return {
          id: `ddt-ln-${crypto.randomUUID()}`,
          inventoryItemId: inventoryItemId || null,
          itemCode: String(row['itemCode'] ?? '').trim() || linked?.sku || '',
          itemSnapshot: String(row['description'] ?? '').trim() || linked?.name || 'Articolo',
          quantity: Math.max(0.01, Number(row['quantity']) || 0),
          unitOfMeasure: String(row['unitOfMeasure'] ?? 'pz').trim() || 'pz',
          unitCost: Number(linked?.unitCost ?? 0),
          note: String(row['note'] ?? '').trim(),
          lotNumber: String(row['lotNumber'] ?? '').trim(),
          serialNumber: String(row['serialNumber'] ?? '').trim(),
          quoteLineId: String(row['quoteLineId'] ?? '').trim() || null,
          plannedQuantity: Number(row['plannedQuantity'] ?? 0) || null,
          alreadyDeliveredQuantity: Number(row['alreadyDeliveredQuantity'] ?? 0) || null,
          remainingQuantity: Number(row['remainingQuantity'] ?? 0) || null,
        };
      });
  }

  private buildDdtRecordPayload(
    raw: ReturnType<typeof this.ddtForm.getRawValue>,
    lines: WarehouseDdtLineRecord[],
    client: ClientRecord | null,
    existing: WarehouseDdtRecord | null,
  ): Omit<WarehouseDdtRecord, 'id' | 'number' | 'createdAt' | 'emittedAt' | 'deliveredAt' | 'status'> & {
    number?: string;
    createdAt?: string;
  } {
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    const senderSnapshot: WarehouseDdtPartySnapshot = {
      name: this.companyProfile().legalName ?? '',
      address: this.companyProfile().address ?? '',
      postalCode: this.companyProfile().postalCode ?? '',
      city: this.companyProfile().city ?? '',
      province: this.companyProfile().province ?? '',
      vatNumber: this.companyProfile().vatNumber ?? '',
      taxCode: this.companyProfile().taxCode ?? '',
    };
    const recipientSnapshot: WarehouseDdtPartySnapshot = {
      name: raw.recipientName,
      address: raw.recipientAddress,
      postalCode: raw.recipientPostalCode,
      city: raw.recipientCity,
      province: raw.recipientProvince,
      vatNumber: raw.recipientVatNumber,
      taxCode: raw.recipientTaxCode,
    };
    const deliverySnapshot: WarehouseDdtPartySnapshot = {
      name: raw.deliveryName || raw.recipientName,
      address: raw.deliveryAddress,
      postalCode: raw.deliveryPostalCode,
      city: raw.deliveryCity,
      province: raw.deliveryProvince,
      vatNumber: '',
      taxCode: '',
    };

    return {
      createdAt,
      documentDate: raw.documentDate,
      transportStartAt: raw.transportStartAt ? new Date(raw.transportStartAt).toISOString() : null,
      createdByOperatorId: existing?.createdByOperatorId ?? this.crmDdtOperatorId,
      createdByOperatorName: existing?.createdByOperatorName ?? 'CRM Audiomax',
      clientId: client?.id ?? null,
      clientCode: client?.id ?? '',
      clientSnapshot: recipientSnapshot.name || client?.name || 'Destinatario occasionale',
      originType: raw.linkedQuoteId ? 'preventivo' : 'manuale',
      series: raw.series || 'A',
      linkedQuoteId: raw.linkedQuoteId || null,
      linkedQuoteNumber: raw.linkedQuoteNumber || null,
      linkedTicketId: raw.linkedTicketId || null,
      linkedAppointmentId: raw.linkedAppointmentId || null,
      causale: raw.causale,
      departurePlace: raw.departurePlace,
      destinationPlace: raw.destinationPlace,
      carrierName: raw.carrierName,
      transportMethod: raw.transportMethod,
      packageCount: Number(raw.packageCount) > 0 ? Number(raw.packageCount) : null,
      packagingType: raw.packagingType,
      weight: raw.weight,
      vehicle: raw.vehicle,
      destination: raw.deliveryAddress || raw.destinationPlace || raw.recipientAddress || '',
      note: raw.note,
      internalNote: raw.internalNote,
      referenceOrder: raw.referenceOrder,
      referenceJob: raw.referenceJob,
      referenceOther: raw.referenceOther,
      lines,
      senderSnapshot,
      recipientSnapshot,
      deliverySnapshot,
      inventoryMode: (raw.alsoDeduct ? raw.inventoryMode : 'nessuno') as WarehouseDdtRecord['inventoryMode'],
      inventoryMovementAppliedAt: existing?.inventoryMovementAppliedAt ?? null,
      inventoryReturnAppliedAt: existing?.inventoryReturnAppliedAt ?? null,
      alsoDeduct: raw.alsoDeduct,
      cancellationReason: existing?.cancellationReason ?? '',
      statusHistory: existing?.statusHistory ?? [],
    };
  }

  private applyInventoryEffectsForDdt(record: WarehouseDdtRecord, nextStatus: WarehouseDdtRecord['status']): WarehouseDdtRecord {
    if (nextStatus === 'emesso' && record.alsoDeduct) {
      if (record.inventoryMode === 'scarico' && !record.inventoryMovementAppliedAt) {
        for (const line of record.lines) {
          if (!line.inventoryItemId) continue;
          this.data.consumeInventoryFifoByItemId({
            inventoryItemId: line.inventoryItemId,
            quantity: line.quantity,
            reason: `Scarico DDT ${record.number || ''} · ${record.causale || 'Trasporto merce'}`,
            documentNumber: record.number || record.id,
            operator: record.createdByOperatorName,
            sourceModule: 'magazzino',
          });
        }
        record = { ...record, inventoryMovementAppliedAt: new Date().toISOString() };
        this.data.updateWarehouseDdt(record);
      }

      if (record.inventoryMode === 'carico' && !record.inventoryReturnAppliedAt) {
        for (const line of record.lines) {
          if (!line.inventoryItemId) continue;
          this.data.returnInventoryStockByItemId({
            inventoryItemId: line.inventoryItemId,
            quantity: line.quantity,
            reason: `Carico DDT ${record.number || ''} · ${record.causale || 'Rientro merce'}`,
            documentNumber: record.number || record.id,
            operator: record.createdByOperatorName,
            sourceModule: 'magazzino',
          });
        }
        record = { ...record, inventoryReturnAppliedAt: new Date().toISOString() };
        this.data.updateWarehouseDdt(record);
      }
    }

    if (nextStatus === 'annullato' && record.inventoryMode === 'scarico' && record.inventoryMovementAppliedAt && !record.inventoryReturnAppliedAt) {
      for (const line of record.lines) {
        if (!line.inventoryItemId) continue;
        this.data.returnInventoryStockByItemId({
          inventoryItemId: line.inventoryItemId,
          quantity: line.quantity,
          reason: `Storno annullamento DDT ${record.number || ''}`,
          documentNumber: `ANN-${record.number || record.id}`,
          operator: record.createdByOperatorName,
          sourceModule: 'magazzino',
        });
      }
      record = { ...record, inventoryReturnAppliedAt: new Date().toISOString() };
      this.data.updateWarehouseDdt(record);
    }

    return record;
  }

  protected previewDdtPdf(recordId: string): void {
    const record = this.ddtDocuments().find((item) => item.id === recordId) ?? null;
    if (!record) return;
    this.openDdtPdfBlob(record, 'preview');
  }

  protected downloadDdtPdf(recordId: string): void {
    const record = this.ddtDocuments().find((item) => item.id === recordId) ?? null;
    if (!record) return;
    this.openDdtPdfBlob(record, 'download');
  }

  protected printDdtPdf(recordId: string): void {
    const record = this.ddtDocuments().find((item) => item.id === recordId) ?? null;
    if (!record) return;
    this.openDdtPdfBlob(record, 'print');
  }

  private openDdtPdfBlob(record: WarehouseDdtRecord, mode: 'preview' | 'download' | 'print'): void {
    const blob = this.buildDdtPdfBlob(record);
    const url = URL.createObjectURL(blob);
    const fileName = this.ddtPdfFileName(record);

    if (mode === 'download') {
      this.downloadBlob(blob, fileName);
      const timer = setTimeout(() => URL.revokeObjectURL(url), 4000);
      this.blobTimers.add(timer);
      return;
    }

    // In stampa apriamo senza "noopener": altrimenti window.open restituisce null e la stampa non parte
    const opened = mode === 'print'
      ? window.open(url, '_blank')
      : window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      this.pushToast(
        mode === 'print'
          ? 'Stampa bloccata dal browser: apri il PDF e usa il pulsante Stampa del visualizzatore.'
          : 'Popup bloccato dal browser: impossibile aprire il PDF del DDT.',
        'error',
      );
      return;
    }

    if (mode === 'print') {
      const timer = setTimeout(() => {
        try {
          opened.print();
        } finally {
          URL.revokeObjectURL(url);
          this.blobTimers.delete(timer);
        }
      }, 650);
      this.blobTimers.add(timer);
      return;
    }

    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      this.blobTimers.delete(timer);
    }, 120000);
    this.blobTimers.add(timer);
  }

  private ddtPdfFileName(record: WarehouseDdtRecord): string {
    return `${(record.number || `DDT-${record.id.slice(-6)}`).replace(/[^\w.-]+/g, '-')}.pdf`;
  }

  private async handleIssuedCashInvoice(transaction: CashTransactionRecord): Promise<void> {
    if (transaction.documentType !== 'fattura') {
      return;
    }

    const transmission = this.companyProfile().invoiceTransmission;
    if (
      transmission.providerCode === 'webhook'
      && transmission.mode === 'api'
      && transmission.apiUrl.trim()
      && transmission.apiKey.trim()
    ) {
      await this.sendCashInvoiceToProvider(transaction, false);
      return;
    }

    if (
      transmission.providerCode === 'nessuno'
      || transmission.mode === 'xml'
      || transmission.fallbackToXmlDownload
    ) {
      this.downloadCashInvoiceXml(transaction, false);
    }
  }

  private downloadCashInvoiceXml(transaction: CashTransactionRecord, showToast = true): void {
    try {
      const { xml, fileName } = this.buildFatturaElettronicaXml(transaction);
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
      this.downloadBlob(blob, fileName);
      if (showToast) {
        this.pushToast('XML fattura elettronica generato correttamente.', 'success');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossibile generare l XML fattura.';
      this.pushToast(message, 'error');
    }
  }

  private async sendCashInvoiceToProvider(
    transaction: CashTransactionRecord,
    requireConfirm: boolean,
  ): Promise<void> {
    const transmission = this.companyProfile().invoiceTransmission;

    if (transaction.documentType !== 'fattura') {
      this.pushToast('Solo le fatture possono essere inviate a un provider esterno.', 'error');
      return;
    }

    if (
      transmission.providerCode !== 'webhook'
      || transmission.mode !== 'api'
      || !transmission.apiUrl.trim()
      || !transmission.apiKey.trim()
    ) {
      this.pushToast('Configura prima URL API e API key del provider fatture.', 'error');
      return;
    }

    if (
      requireConfirm
      && !window.confirm('Inviare questa fattura al provider esterno configurato?')
    ) {
      return;
    }

    try {
      const { xml, fileName } = this.buildFatturaElettronicaXml(transaction);
      const response = await fetch(transmission.apiUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${transmission.apiKey.trim()}`,
          'X-API-Key': transmission.apiKey.trim(),
        },
        body: JSON.stringify({
          providerLabel: transmission.providerLabel.trim() || 'Provider fatture',
          format: 'fatturapa-fpr12',
          fileName,
          xml,
          invoiceNumber: transaction.invoiceNumber,
          reference: transaction.reference,
          customerName: transaction.customerName,
          total: Number(transaction.total.toFixed(2)),
          issuedAt: transaction.createdAt,
        }),
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(
          `Provider fatture non raggiungibile (${response.status}). ${responseText.slice(0, 180)}`.trim(),
        );
      }

      this.pushToast('Fattura inviata correttamente al provider esterno.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invio al provider fatture non riuscito.';
      if (transmission.fallbackToXmlDownload) {
        this.downloadCashInvoiceXml(transaction, false);
        this.pushToast(`${message} XML scaricato in fallback.`, 'error');
        return;
      }
      this.pushToast(message, 'error');
    }
  }

  private buildFatturaElettronicaXml(transaction: CashTransactionRecord): { xml: string; fileName: string } {
    if (transaction.documentType !== 'fattura' || !transaction.invoiceNumber) {
      throw new Error('Il documento selezionato non ha un numero fattura valido.');
    }

    const company = this.companyProfile();
    const transmission = company.invoiceTransmission;
    const client = this.resolveCashInvoiceClient(transaction);
    const billingProfile = client?.privacyProfile.billingProfile ?? null;

    if (!billingProfile) {
      throw new Error('Il cliente non ha un profilo di fatturazione completo in anagrafica.');
    }

    const companyCountry = this.normalizeInvoiceCountryCode(
      transmission.issuingCountryCode || company.country || 'IT',
    );
    const companyVat = this.normalizeVatIdentity(company.vatNumber, companyCountry);
    const companyTaxCode = this.normalizeFiscalCode(company.taxCode || companyVat.code);
    const companyName = (company.legalName || 'Audiomax').trim();
    const companyAddress = company.address.trim();
    const companyPostalCode = company.postalCode.trim();
    const companyCity = company.city.trim();
    const companyProvince = company.province.trim().toUpperCase();
    const companyPec = company.pec.trim();

    if (
      !companyVat.code
      || !companyTaxCode
      || !companyAddress
      || !companyPostalCode
      || !companyCity
      || !companyProvince
    ) {
      throw new Error(
        'Completa il profilo azienda nelle impostazioni fiscali: P.IVA, C.F., indirizzo, CAP, comune e provincia sono obbligatori.',
      );
    }

    const customerName = (client?.name || transaction.customerName).trim();
    const customerCity = (client?.city || '').trim();
    const customerTaxCode = this.normalizeFiscalCode(billingProfile.taxId);
    const customerCountry = this.normalizeInvoiceCountryCode(billingProfile.billingCountry || 'IT');
    const customerVat = this.normalizeVatIdentity(billingProfile.taxId, customerCountry);
    const customerAddress = billingProfile.billingAddress.trim();
    const customerPostalCode = billingProfile.billingPostalCode.trim();
    const customerProvince = billingProfile.billingProvince.trim().toUpperCase();
    const customerSdi = billingProfile.sdiCode.trim().toUpperCase();
    const customerPec = billingProfile.pec.trim();

    if (!customerName || !customerTaxCode || !customerAddress || !customerPostalCode || !customerProvince || !customerCity) {
      throw new Error(
        'Per generare l XML servono nome, codice fiscale o P.IVA, indirizzo, CAP, comune e provincia del cliente.',
      );
    }

    const preparedLines = this.prepareCashInvoiceXmlLines(transaction);
    if (!preparedLines.length) {
      throw new Error('La fattura non contiene righe valide da esportare in XML.');
    }

    const transmissionCode = customerSdi.length === 7 ? customerSdi : '0000000';
    const progressivoInvio = `FT${String(transaction.invoiceNumber).padStart(8, '0')}`.slice(0, 10);
    const invoiceDate = transaction.createdAt.slice(0, 10);
    const paymentDetails = this.buildCashInvoicePaymentDetails(transaction, invoiceDate);
    const totalDocument = this.formatXmlAmount(transaction.total);
    const paymentTerms = transaction.status === 'insoluto' ? 'TP02' : 'TP01';
    const customerAnagraphicXml =
      billingProfile.kind === 'azienda'
        ? `<Denominazione>${this.escapeXml(customerName)}</Denominazione>`
        : this.renderInvoiceCustomerPersonXml(customerName);

    const lineXml = preparedLines
      .map(
        (line) => `      <DettaglioLinee>
        <NumeroLinea>${line.lineNumber}</NumeroLinea>
        <Descrizione>${this.escapeXml(line.description)}</Descrizione>
        <Quantita>${this.formatXmlDecimal(line.quantity, 2)}</Quantita>
        <PrezzoUnitario>${this.formatXmlDecimal(line.unitNetAmount, 8)}</PrezzoUnitario>
        <PrezzoTotale>${this.formatXmlAmount(line.taxableAmount)}</PrezzoTotale>
        <AliquotaIVA>${this.formatXmlAmount(line.vatRate)}</AliquotaIVA>
${line.vatRate > 0 ? '' : '        <Natura>N2.2</Natura>\n'}      </DettaglioLinee>`,
      )
      .join('\n');

    const summaryXml = [...preparedLines.reduce((map, line) => {
      const key = line.vatRate.toFixed(2);
      const current = map.get(key) ?? { vatRate: line.vatRate, taxableAmount: 0, taxAmount: 0 };
      current.taxableAmount = this.roundCurrency(current.taxableAmount + line.taxableAmount);
      current.taxAmount = this.roundCurrency(current.taxAmount + line.taxAmount);
      map.set(key, current);
      return map;
    }, new Map<string, { vatRate: number; taxableAmount: number; taxAmount: number }>()).values()]
      .map(
        (group) => `      <DatiRiepilogo>
        <AliquotaIVA>${this.formatXmlAmount(group.vatRate)}</AliquotaIVA>
${group.vatRate > 0 ? '' : '        <Natura>N2.2</Natura>\n'}        <ImponibileImporto>${this.formatXmlAmount(group.taxableAmount)}</ImponibileImporto>
        <Imposta>${this.formatXmlAmount(group.taxAmount)}</Imposta>
${group.vatRate > 0 ? '        <EsigibilitaIVA>I</EsigibilitaIVA>\n' : ''}      </DatiRiepilogo>`,
      )
      .join('\n');

    const paymentXml = paymentDetails
      .map(
        (detail) => `      <DettaglioPagamento>
        <ModalitaPagamento>${detail.mode}</ModalitaPagamento>
        <DataScadenzaPagamento>${invoiceDate}</DataScadenzaPagamento>
        <ImportoPagamento>${this.formatXmlAmount(detail.amount)}</ImportoPagamento>
${detail.iban ? `        <IBAN>${this.escapeXml(detail.iban)}</IBAN>\n` : ''}      </DettaglioPagamento>`,
      )
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" versione="FPR12">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>${companyVat.country}</IdPaese>
        <IdCodice>${companyVat.code}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>${progressivoInvio}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${this.escapeXml(transmissionCode)}</CodiceDestinatario>
${customerPec ? `      <PECDestinatario>${this.escapeXml(customerPec)}</PECDestinatario>\n` : ''}    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>${companyVat.country}</IdPaese>
          <IdCodice>${companyVat.code}</IdCodice>
        </IdFiscaleIVA>
        <CodiceFiscale>${companyTaxCode}</CodiceFiscale>
        <Anagrafica>
          <Denominazione>${this.escapeXml(companyName)}</Denominazione>
        </Anagrafica>
        <RegimeFiscale>${this.escapeXml(transmission.taxRegime || 'RF01')}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${this.escapeXml(companyAddress)}</Indirizzo>
        <CAP>${this.escapeXml(companyPostalCode)}</CAP>
        <Comune>${this.escapeXml(companyCity)}</Comune>
        <Provincia>${this.escapeXml(companyProvince)}</Provincia>
        <Nazione>${companyVat.country}</Nazione>
      </Sede>
${company.phone.trim() || company.email.trim() || companyPec ? `      <Contatti>
${company.phone.trim() ? `        <Telefono>${this.escapeXml(company.phone.trim())}</Telefono>\n` : ''}${company.email.trim() ? `        <Email>${this.escapeXml(company.email.trim())}</Email>\n` : ''}      </Contatti>
` : ''}    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
${customerVat.code ? `        <IdFiscaleIVA>
          <IdPaese>${customerVat.country}</IdPaese>
          <IdCodice>${customerVat.code}</IdCodice>
        </IdFiscaleIVA>
` : ''}        <CodiceFiscale>${customerTaxCode}</CodiceFiscale>
        <Anagrafica>
          ${customerAnagraphicXml}
        </Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${this.escapeXml(customerAddress)}</Indirizzo>
        <CAP>${this.escapeXml(customerPostalCode)}</CAP>
        <Comune>${this.escapeXml(customerCity)}</Comune>
        <Provincia>${this.escapeXml(customerProvince)}</Provincia>
        <Nazione>${customerCountry}</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${invoiceDate}</Data>
        <Numero>${transaction.invoiceNumber}</Numero>
        <ImportoTotaleDocumento>${totalDocument}</ImportoTotaleDocumento>
${transaction.notes.trim() ? `        <Causale>${this.escapeXml(transaction.notes.trim())}</Causale>\n` : ''}${transaction.linkedQuoteId ? `        <Causale>${this.escapeXml(`Rif. preventivo ${this.quoteCode(transaction.linkedQuoteId)}`)}</Causale>\n` : ''}      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
${lineXml}
${summaryXml}
    </DatiBeniServizi>
    <DatiPagamento>
      <CondizioniPagamento>${paymentTerms}</CondizioniPagamento>
${paymentXml}
    </DatiPagamento>
  </FatturaElettronicaBody>
</p:FatturaElettronica>
`;

    const fileName = `${companyVat.country}${companyVat.code}_FT_${String(transaction.invoiceNumber).padStart(5, '0')}.xml`;
    return { xml, fileName };
  }

  private prepareCashInvoiceXmlLines(transaction: CashTransactionRecord): Array<{
    lineNumber: number;
    description: string;
    quantity: number;
    unitNetAmount: number;
    taxableAmount: number;
    taxAmount: number;
    vatRate: number;
  }> {
    const visibleLines = transaction.lines.filter((line) => !line.excludeFromReceipt);
    const totalGross = this.roundCurrency(visibleLines.reduce((sum, line) => sum + line.total, 0));
    const discountAmount = this.roundCurrency(transaction.discountAmount || 0);
    let allocatedDiscount = 0;

    return visibleLines.map((line, index) => {
      const vatRate = Math.max(0, Number(line.vatRate) || 22);
      const grossAmount = this.roundCurrency(line.total);
      const lineDiscount =
        index === visibleLines.length - 1
          ? this.roundCurrency(discountAmount - allocatedDiscount)
          : this.roundCurrency(totalGross > 0 ? (discountAmount * grossAmount) / totalGross : 0);
      allocatedDiscount = this.roundCurrency(allocatedDiscount + lineDiscount);
      const adjustedGrossAmount = this.roundCurrency(Math.max(grossAmount - lineDiscount, 0));
      const taxableAmount =
        vatRate > 0
          ? this.roundCurrency(adjustedGrossAmount / (1 + vatRate / 100))
          : adjustedGrossAmount;
      const taxAmount = this.roundCurrency(adjustedGrossAmount - taxableAmount);
      const quantity = Math.max(Number(line.quantity) || 1, 1);
      const unitNetAmount = taxableAmount / quantity;

      return {
        lineNumber: index + 1,
        description: line.name || `Riga ${index + 1}`,
        quantity,
        unitNetAmount,
        taxableAmount,
        taxAmount,
        vatRate,
      };
    });
  }

  private buildCashInvoicePaymentDetails(
    transaction: CashTransactionRecord,
    _invoiceDate: string,
  ): Array<{ mode: string; amount: number; iban?: string }> {
    if (transaction.paymentMethod === 'misto' && transaction.paymentSplit) {
      const details: Array<{ mode: string; amount: number; iban?: string }> = [];
      if (transaction.paymentSplit.contanti > 0) {
        details.push({ mode: 'MP01', amount: transaction.paymentSplit.contanti });
      }
      if (transaction.paymentSplit.elettronico > 0) {
        const isWire = transaction.paymentSplit.elettronicoMethod === 'bonifico';
        details.push({
          mode: isWire ? 'MP05' : 'MP08',
          amount: transaction.paymentSplit.elettronico,
          iban: isWire ? this.companyProfile().iban.trim() || undefined : undefined,
        });
      }
      return details.length ? details : [{ mode: 'MP12', amount: transaction.total }];
    }

    if (transaction.paymentMethod === 'contanti') {
      return [{ mode: 'MP01', amount: transaction.total }];
    }

    if (transaction.paymentMethod === 'bonifico') {
      return [{ mode: 'MP05', amount: transaction.total, iban: this.companyProfile().iban.trim() || undefined }];
    }

    return [{ mode: 'MP08', amount: transaction.total }];
  }

  private resolveCashInvoiceClient(transaction: CashTransactionRecord): ClientRecord | null {
    if (transaction.clientId) {
      return this.allClients().find((item) => item.id === transaction.clientId) ?? null;
    }

    return this.allClients().find(
      (item) => item.name.trim().toLowerCase() === transaction.customerName.trim().toLowerCase(),
    ) ?? null;
  }

  private renderInvoiceCustomerPersonXml(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const firstName = parts.slice(0, -1).join(' ');
      const lastName = parts[parts.length - 1];
      return `<Nome>${this.escapeXml(firstName)}</Nome><Cognome>${this.escapeXml(lastName)}</Cognome>`;
    }

    return `<Denominazione>${this.escapeXml(fullName || 'Cliente privato')}</Denominazione>`;
  }

  private normalizeInvoiceCountryCode(value: string): string {
    const normalized = value.trim().toUpperCase();
    if (normalized === 'ITALIA') {
      return 'IT';
    }
    return normalized.length === 2 ? normalized : 'IT';
  }

  private normalizeFiscalCode(value: string): string {
    return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  private normalizeVatIdentity(value: string, fallbackCountry: string): { country: string; code: string } {
    const normalized = value.trim().toUpperCase().replace(/\s+/g, '');
    if (!normalized) {
      return { country: fallbackCountry, code: '' };
    }

    const match = normalized.match(/^([A-Z]{2})?([A-Z0-9]+)$/);
    if (!match) {
      return { country: fallbackCountry, code: this.normalizeFiscalCode(normalized) };
    }

    return {
      country: match[1] || fallbackCountry,
      code: match[2],
    };
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private formatXmlAmount(value: number): string {
    return this.roundCurrency(value).toFixed(2);
  }

  private formatXmlDecimal(value: number, decimals: number): string {
    return Number(value || 0).toFixed(decimals);
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      this.blobTimers.delete(timer);
    }, 4000);
    this.blobTimers.add(timer);
  }

  private resolveDdtClient(record: WarehouseDdtRecord): ClientRecord | null {
    if (!record.clientId) {
      return null;
    }
    return this.allClients().find((item) => item.id === record.clientId) ?? null;
  }

  private buildDdtWhatsappMessage(record: WarehouseDdtRecord): string {
    const recipientName = record.clientSnapshot || record.recipientSnapshot?.name || 'cliente';
    const documentLabel = record.number || 'bozza DDT';
    return (
      `Ciao ${recipientName}, ti inviamo il DDT ${documentLabel} del ${this.formatIsoDateLabel(record.documentDate)}.` +
      `\nCausale: ${record.causale || 'Documento di trasporto'}.` +
      `\nIl PDF del documento è pronto per essere allegato.`
    );
  }

  private buildDdtEmailSubject(record: WarehouseDdtRecord): string {
    return `DDT ${record.number || 'bozza'} - ${record.clientSnapshot || record.recipientSnapshot?.name || 'Audiomax'}`;
  }

  private buildDdtEmailBody(record: WarehouseDdtRecord): string {
    const recipientName = record.clientSnapshot || record.recipientSnapshot?.name || 'cliente';
    return (
      `Gentile ${recipientName},\n\n` +
      `ti inviamo il DDT ${record.number || 'in bozza'} del ${this.formatIsoDateLabel(record.documentDate)}.\n` +
      `Causale: ${record.causale || 'Documento di trasporto'}.\n\n` +
      `Alleghiamo il PDF del documento.\n\n` +
      `Cordiali saluti,\nAudiomax`
    );
  }

  private async shareDdtPdf(
    record: WarehouseDdtRecord,
    text: string,
  ): Promise<'shared' | 'unsupported' | 'cancelled'> {
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
      share?: (data?: ShareData) => Promise<void>;
    };
    if (typeof File === 'undefined' || typeof nav.share !== 'function') {
      return 'unsupported';
    }

    const file = new File([this.buildDdtPdfBlob(record)], this.ddtPdfFileName(record), {
      type: 'application/pdf',
    });
    const data: ShareData = {
      title: this.buildDdtEmailSubject(record),
      text,
      files: [file],
    };

    if (typeof nav.canShare === 'function' && !nav.canShare(data)) {
      return 'unsupported';
    }

    try {
      await nav.share(data);
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled';
      }
      return 'unsupported';
    }
  }

  private buildDdtPdfBlob(record: WarehouseDdtRecord): Blob {
    const pageWidth = 595;
    const pageHeight = 842;
    const marginLeft = 42;
    const marginRight = 553;
    const footerY = 58;
    const sender = record.senderSnapshot ?? {
      name: this.companyProfile().legalName ?? 'Audiomax',
      address: this.companyProfile().address ?? '',
      postalCode: this.companyProfile().postalCode ?? '',
      city: this.companyProfile().city ?? '',
      province: this.companyProfile().province ?? '',
      vatNumber: this.companyProfile().vatNumber ?? '',
      taxCode: this.companyProfile().taxCode ?? '',
    };
    const recipient = record.recipientSnapshot ?? {
      name: record.clientSnapshot ?? '',
      address: '',
      postalCode: '',
      city: '',
      province: '',
      vatNumber: '',
      taxCode: '',
    };
    const delivery = record.deliverySnapshot ?? recipient;

    const escapePdf = (value: string) =>
      String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');
    const pdfValue = (value: unknown) => String(value ?? '').trim();
    const pdfDetail = (label: string, value: unknown) => {
      const normalized = pdfValue(value);
      return normalized ? `${label}: ${normalized}` : '';
    };
    const text = (font: 'F1' | 'F2', size: number, x: number, y: number, value: string) =>
      `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdf(value)}) Tj ET\n`;
    const line = (x1: number, y1: number, x2: number, y2: number) =>
      `${x1} ${y1} m ${x2} ${y2} l S\n`;

    const pages: string[] = [];
    let current = '';
    let y = 800;

    const flushPage = () => {
      pages.push(current);
      current = '';
      y = 800;
    };

    const header = (pageIndex: number) => {
      current += text('F2', 18, marginLeft, y, 'Documento di Trasporto');
      current += text('F1', 10, 390, y + 2, `Pagina ${pageIndex + 1}`);
      y -= 24;
      current += text('F2', 11, marginLeft, y, sender.name || 'Audiomax');
      current += text('F1', 10, 390, y, `Numero: ${record.number || 'BOZZA'}`);
      y -= 14;
      const senderRow = [sender.address, `${sender.postalCode} ${sender.city} ${sender.province}`.trim()]
        .filter(Boolean)
        .join(' - ');
      current += text('F1', 9, marginLeft, y, senderRow || 'Dati mittente non completi');
      current += text('F1', 10, 390, y, `Data: ${this.formatIsoDateLabel(record.documentDate)}`);
      y -= 14;
      const senderTaxRow = [sender.vatNumber ? `P.IVA ${sender.vatNumber}` : '', sender.taxCode ? `CF ${sender.taxCode}` : '']
        .filter(Boolean)
        .join(' - ');
      current += text('F1', 9, marginLeft, y, senderTaxRow);
      y -= 18;
      current += line(marginLeft, y, marginRight, y);
      y -= 18;
    };

    const ensureSpace = (needed: number) => {
      if (y - needed <= footerY) {
        flushPage();
        header(pages.length);
      }
    };

    header(0);

    current += text('F2', 11, marginLeft, y, 'Destinatario');
    current += text('F2', 11, 320, y, 'Consegna / Trasporto');
    y -= 15;
    current += text('F1', 10, marginLeft, y, recipient.name || 'Destinatario occasionale');
    current += text('F1', 10, 320, y, `Causale: ${record.causale || 'Vendita'}`);
    y -= 13;
    current += text('F1', 9, marginLeft, y, pdfValue(recipient.address));
    current += text('F1', 9, 320, y, pdfDetail('Partenza', record.departurePlace));
    y -= 13;
    current += text('F1', 9, marginLeft, y, `${recipient.postalCode || ''} ${recipient.city || ''} ${recipient.province || ''}`.trim());
    current += text('F1', 9, 320, y, pdfDetail('Destinazione', record.destinationPlace || delivery.address || record.destination));
    y -= 13;
    current += text('F1', 9, marginLeft, y, [recipient.vatNumber ? `P.IVA ${recipient.vatNumber}` : '', recipient.taxCode ? `CF ${recipient.taxCode}` : ''].filter(Boolean).join(' - '));
    current += text('F1', 9, 320, y, pdfDetail('Vettore', record.carrierName || record.vehicle));
    y -= 13;
    current += text('F1', 9, marginLeft, y, pdfDetail('Consegna a', delivery.name || recipient.name));
    current += text('F1', 9, 320, y, pdfDetail('Modalità', record.transportMethod));
    y -= 13;
    current += text('F1', 9, marginLeft, y, pdfDetail('Indirizzo consegna', delivery.address || record.destination));
    current += text(
      'F1',
      9,
      320,
      y,
      [
        record.packageCount != null ? `Colli: ${record.packageCount}` : '',
        record.packagingType ? `Imballo: ${record.packagingType}` : '',
        record.weight ? `Peso: ${record.weight}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    );
    y -= 20;

    current += line(marginLeft, y, marginRight, y);
    y -= 16;
    current += text('F2', 10, marginLeft, y, 'Codice');
    current += text('F2', 10, 118, y, 'Descrizione bene');
    current += text('F2', 10, 430, y, 'Q.tà');
    current += text('F2', 10, 475, y, 'UM');
    current += text('F2', 10, 515, y, 'Note');
    y -= 10;
    current += line(marginLeft, y, marginRight, y);
    y -= 14;

    for (const ddtLine of record.lines) {
      ensureSpace(30);
      current += text('F1', 9, marginLeft, y, pdfValue(ddtLine.itemCode));
      current += text('F1', 9, 118, y, (ddtLine.itemSnapshot || '').slice(0, 60));
      current += text('F1', 9, 430, y, String(ddtLine.quantity));
      current += text('F1', 9, 475, y, ddtLine.unitOfMeasure || 'pz');
      current += text('F1', 9, 515, y, pdfValue(ddtLine.note || ddtLine.lotNumber || ddtLine.serialNumber).slice(0, 14));
      y -= 12;

      const lineMeta = [
        ddtLine.lotNumber ? `Lotto ${ddtLine.lotNumber}` : '',
        ddtLine.serialNumber ? `S/N ${ddtLine.serialNumber}` : '',
        ddtLine.quoteLineId ? `rif. prev.` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      if (lineMeta) {
        current += text('F1', 8, 118, y, lineMeta.slice(0, 72));
        y -= 10;
      }

      current += line(marginLeft, y, marginRight, y);
      y -= 12;
    }

    ensureSpace(92);
    if (record.linkedQuoteId || record.linkedQuoteNumber) {
      current += text('F1', 9, marginLeft, y, `Preventivo di origine: ${this.ddtLinkedQuoteLabel(record)}`);
      y -= 14;
    }
    if (record.referenceOrder || record.referenceJob || record.referenceOther) {
      current += text(
        'F1',
        9,
        marginLeft,
        y,
        `Riferimenti: ${[record.referenceOrder, record.referenceJob, record.referenceOther].filter(Boolean).join(' · ')}`,
      );
      y -= 14;
    }
    if (record.note) {
      current += text('F2', 10, marginLeft, y, 'Annotazioni');
      y -= 12;
      current += text('F1', 9, marginLeft, y, record.note.slice(0, 92));
      y -= 16;
    }

    current += text('F1', 9, marginLeft, y, 'Firma consegnatario __________________________');
    current += text('F1', 9, 320, y, 'Firma ricevente __________________________');
    flushPage();

    const objects: string[] = [];
    const pageIds: number[] = [];
    const contentIds: number[] = [];
    let nextId = 5;

    for (let i = 0; i < pages.length; i += 1) {
      contentIds.push(nextId++);
      pageIds.push(nextId++);
    }

    objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
    objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
    objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
    objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;

    for (let i = 0; i < pages.length; i += 1) {
      objects[contentIds[i]] = `<< /Length ${pages[i].length} >>\nstream\n${pages[i]}endstream`;
      objects[pageIds[i]] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentIds[i]} 0 R >>`;
    }

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [];

    for (let id = 1; id < objects.length; id += 1) {
      offsets[id] = pdf.length;
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }

    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id += 1) {
      pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return new Blob([pdf], { type: 'application/pdf' });
  }

  /**
   * Conferma il prelievo di materiale per installazione:
   *  - registra scarico FIFO dal magazzino
   *  - scrive movimento con causale cliente + note
   */
  protected epSubmitPrelievo(item: InventoryItemRecord): void {
    if (this.epPrelievoForm.invalid) return;
    // ✅ Check JIT sessione (revoca immediata tempo zero)
    const me = this.epSessionOperator();
    if (!me || !this.data.isEpPortalSessionValid(me.id)) {
      this.epLogout();
      this.pushToast('Sessione scaduta o accesso revocato.', 'error');
      return;
    }
    const op = me;

    const payload = this.epPrelievoForm.getRawValue();
    const qty = Math.max(1, Number(payload.quantity) || 1);
    const client = this.allClients().find((c) => c.id === payload.clientId);
    const reasonParts = ['Prelievo portale dipendenti'];
    if (client) reasonParts.push(`per ${client.name}`);
    if (payload.note) reasonParts.push(payload.note);
    const docRef = client ? `PREL-${client.id.slice(-6)}` : 'PREL-DIP';

    this.data.consumeInventoryFifoByItemId({
      inventoryItemId: item.id,
      quantity: qty,
      reason: reasonParts.join(' · '),
      documentNumber: docRef,
      operator: op.name,
      sourceModule: 'magazzino',
    });

    const labelClient = client ? `a ${client.name}` : '';
    this.epPrelievoLastConfirmMessage.set(
      `✅ Prelievo confermato · ${qty} × ${item.name} ${labelClient}`,
    );
    this.epResetPrelievoForm();
    this.epSelectedInventoryItem.set(null);
    // Memorizza l'articolo tra i "usati di recente" per ritrovarlo in un tap
    this.epRegisterRecentItem(item.id);
    setTimeout(() => this.epPrelievoLastConfirmMessage.set(''), 3500);
  }

  // --- Modulo DDT (Documento di Trasporto) -----------------------------------
  protected readonly epDdtEditorVisible = signal<boolean>(false);
  protected readonly epDdtClienteSearch = signal<string>('');
  protected readonly epCompanyProfile = this.data.companyProfile;

  /** Helper: crea un FormGroup vuoto per una riga DDT */
  private epMakeDdtLine(): FormGroup {
    return this.formBuilder.nonNullable.group({
      search: [''],
      inventoryItemId: [''],
      description: [''],
      quantity: [1, [Validators.required, Validators.min(1)]],
      note: [''],
    });
  }

  protected readonly epDdtLines: FormArray = this.formBuilder.array([this.epMakeDdtLine()]);
  /** Helper TS per tipizzare come FormGroup[] ogni riga del FormArray DDT (evita cast in template) */
  protected get epDdtLineGroups(): FormGroup[] {
    return this.epDdtLines.controls as FormGroup[];
  }
  protected readonly epDdtForm = this.formBuilder.nonNullable.group({
    clientSearch: [''],
    clientId: [''],
    vehicle: [''],
    destination: [''],
    note: [''],
    alsoDeduct: [true],
    lines: this.epDdtLines,
  });

  protected epDdtClientiFiltrati = computed(() => {
    const q = this.epDdtClienteSearch().trim().toLowerCase();
    if (!q) return [];
    return this.allClients()
      .filter((c) => (c.name || '').toLowerCase().includes(q))
      .slice(0, 20);
  });

  protected epDdtSelectClient(c: ClientRecord): void {
    this.epDdtForm.patchValue({ clientSearch: c.name, clientId: c.id });
    this.epDdtClienteSearch.set(c.name);
  }

  protected epDdtAddLine(): void {
    this.epDdtLines.push(this.epMakeDdtLine());
  }

  protected epDdtRemoveLine(i: number): void {
    if (this.epDdtLines.length <= 1) return;
    // 🛡️ Conferma di sicurezza: evita eliminazioni accidentali
    const ctrl = this.epDdtLines.at(i) as FormGroup;
    const desc = ctrl?.get('description')?.value || '(senza descrizione)';
    const msg = `Rimuovere la riga "${desc}" dal DDT?\n\nQuesta azione non può essere annullata.`;
    if (!window.confirm(msg)) return;
    this.epDdtLines.removeAt(i);
  }

  protected epDdtLineSuggestions(i: number): InventoryItemRecord[] {
    const ctrl = this.epDdtLines.at(i) as FormGroup;
    const q = String(ctrl.get('search')?.value ?? '').trim().toLowerCase();
    if (!q) return [];
    return this.allInventoryItems()
      .filter((it) => {
        const hay = `${it.name ?? ''} ${it.sku ?? ''} ${it.category ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 10);
  }

  protected epDdtSelectItem(i: number, it: InventoryItemRecord): void {
    const ctrl = this.epDdtLines.at(i) as FormGroup;
    ctrl.patchValue({ inventoryItemId: it.id, description: it.name, search: it.name });
  }

  /** Apre l'editor del DDT (resetta il form) */
  protected epOpenDdtEditor(): void {
    // Resetta form in modo safe (non passa 'lines' che è un FormArray e non va incluso nelle primitive)
    const line = this.epMakeDdtLine();
    this.epDdtForm.setValue({
      clientSearch: '',
      clientId: '',
      vehicle: '',
      destination: '',
      note: '',
      alsoDeduct: true,
      lines: [line.getRawValue()],
    });
    while (this.epDdtLines.length) this.epDdtLines.removeAt(0);
    this.epDdtLines.push(line);
    this.epDdtClienteSearch.set('');
    this.epDdtEditorVisible.set(true);
  }

  /**
   * Crea un DDT precompilato a partire da un preventivo.
   * Vengono importate solo le righe di tipo 'materiale' (i servizi non vanno nel DDT).
   * Utile per le installazioni esterne: il tecnico apre il DDT già popolato e lo modifica in corso d'opera.
   */
  protected epOpenDdtFromQuote(quoteId: string): void {
    const quote = this.allQuotes().find((q) => q.id === quoteId);
    if (!quote) {
      this.pushToast('Preventivo non trovato', 'error');
      return;
    }

    // Filtra solo le righe materiale
    const materialLines = (quote.lines ?? []).filter((l) => l.kind === 'materiale');

    if (materialLines.length === 0) {
      this.pushToast('Il preventivo non contiene righe materiale da trasportare', 'error');
      return;
    }

    // Resetta il form e popola con i dati del preventivo
    while (this.epDdtLines.length) this.epDdtLines.removeAt(0);

    for (const line of materialLines) {
      const fg = this.epMakeDdtLine();
      // Cerca l'articolo corrispondente nel magazzino per nome
      const matched = this.allInventoryItems().find(
        (it) => it.name.toLowerCase() === line.description.toLowerCase(),
      );
      fg.patchValue({
        inventoryItemId: matched?.id ?? '',
        description: line.description,
        search: line.description,
        quantity: line.quantity,
      });
      this.epDdtLines.push(fg);
    }

    // Cerca il cliente collegato al preventivo
    const client = quote.clientId
      ? this.allClients().find((c) => c.id === quote.clientId) ?? null
      : null;

    this.epDdtForm.patchValue({
      clientSearch: client?.name ?? quote.customerName ?? '',
      clientId: client?.id ?? '',
      destination: quote.fulfillmentAddress || quote.customerAddress || '',
      note: `Installazione: ${quote.projectType}${quote.notes ? ' — ' + quote.notes : ''}`,
      alsoDeduct: true,
    });
    this.epDdtClienteSearch.set(client?.name ?? quote.customerName ?? '');
    this.epDdtEditorVisible.set(true);

    this.pushToast(
      `DDT precompilato dal preventivo (${materialLines.length} righe materiale). Modificalo se necessario.`,
      'success',
    );
  }

  protected epCloseDdtEditor(): void {
    this.epDdtEditorVisible.set(false);
  }

  /**
   * Salva o emette il DDT.
   * @param emitAndPrint true = emetti (assegna numero) + avvia stampa + scarico opzionale
   */
  protected epSubmitDdt(emitAndPrint: boolean): void {
    // ✅ Check JIT sessione (revoca immediata tempo zero)
    const me = this.epSessionOperator();
    if (!me || !this.data.isEpPortalSessionValid(me.id)) {
      this.epLogout();
      this.pushToast('Sessione scaduta o accesso revocato.', 'error');
      return;
    }
    const op = me;
    const raw = this.epDdtForm.getRawValue();
    const client = this.allClients().find((c) => c.id === raw.clientId);

    const lines = (raw.lines as any[])
      .filter((row) => Number(row.quantity) >= 1 && (row.inventoryItemId || row.description))
      .map((row) => {
        const linked = this.allInventoryItems().find((it) => it.id === row.inventoryItemId);
        return {
          id: `ddt-ln-${crypto.randomUUID()}`,
          inventoryItemId: row.inventoryItemId || null,
          itemSnapshot: row.description || linked?.name || 'Articolo',
          quantity: Math.max(1, Number(row.quantity) || 1),
          note: row.note || '',
        };
      });

    if (lines.length === 0) {
      this.pushToast('Aggiungi almeno una riga prodotto valida al DDT.', 'error');
      return;
    }
    if (emitAndPrint && !client) {
      this.pushToast('Per emettere un DDT seleziona il cliente.', 'error');
      return;
    }

    const base = {
      createdByOperatorId: op.id,
      createdByOperatorName: op.name,
      clientId: client?.id ?? null,
      clientSnapshot: client?.name ?? 'Cliente generico',
      vehicle: raw.vehicle ?? '',
      destination: raw.destination ?? '',
      note: raw.note ?? '',
      lines,
    };

    if (emitAndPrint) {
      // 1. crea come già emesso (assegna numero progressivo)
      const record = this.data.addWarehouseDdt(base as Parameters<typeof this.data.addWarehouseDdt>[0]);
      const emitted = this.data.updateWarehouseDdtStatus(record.id, 'emesso');

      // 2. scarico contestuale da magazzino se attivo
      if (raw.alsoDeduct && emitted) {
        for (const l of lines) {
          if (l.inventoryItemId) {
            this.data.consumeInventoryFifoByItemId({
              inventoryItemId: l.inventoryItemId,
              quantity: l.quantity,
              reason: `Scarico DDT ${emitted.number || ''}`,
              documentNumber: emitted.number || '',
              operator: op.name,
              sourceModule: 'magazzino',
            });
          }
        }
      }

      this.epCloseDdtEditor();
      if (emitted) this.epPrintDdt(emitted);
      this.pushToast('DDT emesso e stampato.', 'success');
    } else {
      // salva solo la bozza
      this.data.addWarehouseDdt(base as Parameters<typeof this.data.addWarehouseDdt>[0]);
      this.epCloseDdtEditor();
      this.pushToast('Bozza DDT salvata.', 'success');
    }
  }

  /** I miei DDT creati (eventualmente filtra per operatore) - ordinati per data decrescente */
  protected readonly epMieiDdt = computed(() => {
    const all = this.data.warehouseDdts();
    const op = this.epActiveOperator();
    return all
      // Mostra i DDT dell'operatore collegato e anche quelli creati dal gestionale CRM
      .filter((d) => !op || d.createdByOperatorId === op.id || d.createdByOperatorId === this.crmDdtOperatorId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  protected epDdtSetStatus(ddt: any, next: 'bozza' | 'emesso' | 'consegnato'): void {
    // 🛡️ Conferma per il cambio stato del DDT (modifica)
    const statusLabel = next === 'bozza' ? 'Bozza' : next === 'emesso' ? 'Emesso' : 'Consegnato';
    const msg = `Cambiare lo stato del DDT in "${statusLabel}"?`;
    if (!window.confirm(msg)) return;
    this.data.updateWarehouseDdtStatus(ddt.id, next);
  }

  protected epFormatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('it-IT');
    } catch {
      return '—';
    }
  }

  protected epFormatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '—';
    }
  }

  // ✅ Helper EP v2: formato data caricamento riga (template-safe, non usa "new Date")
  protected epFormatLoadedDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  }

  // ✅ Helper EP v2: imposta priorità da evento select template
  protected epAdminSetPriorityFromInput(v: string): void {
    const p: PortalCommunicationRecord['priority'] =
      v === 'alta' || v === 'media' || v === 'bassa' ? v : 'media';
    this.epAdminCommPriority.set(p);
  }

  /** Apre il PDF del DDT nella finestra di stampa del dispositivo (affidabile anche su smartphone) */
  protected epPrintDdt(ddt: WarehouseDdtRecord): void {
    this.openDdtPdfBlob(ddt, 'print');
  }

  // --- Modulo SERVIZI da inviare in CASSA ------------------------------------
  protected readonly epServiceEditorVisible = signal<boolean>(false);
  protected readonly epServiceClienteSearch = signal<string>('');
  protected readonly epServiceLastConfirmMessage = signal<string>('');

  protected readonly epServiceForm = this.formBuilder.nonNullable.group({
    type: ['installazione', Validators.required],
    serviceDate: ['', Validators.required],
    clientSearch: [''],
    clientId: ['', Validators.required],
    description: ['', [Validators.required, Validators.minLength(3)]],
    priceUnit: [0, [Validators.required, Validators.min(0)]],
    quantity: [1, [Validators.required, Validators.min(1)]],
    /** Operatore di cassa a cui assegnare il servizio ('' = chiunque) */
    cashOperatorId: [''],
  });

  /** Operatori attualmente presenti/attivi in cassa */
  protected readonly epServiceCashOperators = computed(() => this.data.activeCashOperators());

  /** Apre l'editor servizio preselezionando l'operatore eventualmente già attivo in cassa */
  protected epOpenNewService(): void {
    const currentName = this.cashCurrentOperator();
    const match = this.epServiceCashOperators().find((o) => o.name === currentName);
    this.epServiceForm.patchValue({ cashOperatorId: match?.id ?? '' });
    this.epServiceEditorVisible.set(true);
  }

  protected readonly epServiceClientiFiltrati = computed(() => {
    const q = this.epServiceClienteSearch().trim().toLowerCase();
    if (!q) return [];
    return this.allClients()
      .filter((c) => (c.name || '').toLowerCase().includes(q))
      .slice(0, 20);
  });

  protected epServiceSelectClient(c: ClientRecord): void {
    this.epServiceForm.patchValue({ clientSearch: c.name, clientId: c.id });
    this.epServiceClienteSearch.set(c.name);
  }

  protected readonly epServiceTotal = computed(() => {
    const r = this.epServiceForm.getRawValue();
    return (Number(r.priceUnit) || 0) * (Number(r.quantity) || 0);
  });

  /** Registra il servizio e lo invia in cassa come pending service */
  protected epSubmitService(): void {
    if (this.epServiceForm.invalid) return;
    // ✅ Check JIT sessione (revoca immediata tempo zero)
    const me = this.epSessionOperator();
    if (!me || !this.data.isEpPortalSessionValid(me.id)) {
      this.epLogout();
      this.pushToast('Sessione scaduta o accesso revocato.', 'error');
      return;
    }
    const op = me;
    const raw = this.epServiceForm.getRawValue();
    const client = this.allClients().find((c) => c.id === raw.clientId);
    if (!client) {
      this.pushToast('Seleziona un cliente esistente per inviare il servizio in cassa.', 'error');
      return;
    }
    const qty = Math.max(1, Number(raw.quantity) || 1);
    const price = Math.max(0, Number(raw.priceUnit) || 0);
    const total = qty * price;
    // Operatore di cassa assegnato (se selezionato)
    const targetOperator = raw.cashOperatorId
      ? this.epServiceCashOperators().find((o) => o.id === raw.cashOperatorId) ?? null
      : null;
    // Normalizza serviceDate
    const svcDate = raw.serviceDate
      ? (() => {
        try { return new Date(raw.serviceDate).toISOString(); } catch { return new Date().toISOString(); }
      })()
      : new Date().toISOString();

    this.data.addPendingService({
      createdByOperatorId: op.id,
      createdByOperatorName: op.name,
      serviceDate: svcDate,
      clientId: client.id,
      clientSnapshot: client.name,
      type: raw.type as any,
      description: raw.description,
      priceUnit: price,
      quantity: qty,
      totalAmount: total,
      targetCashOperatorId: targetOperator?.id ?? null,
      targetCashOperatorName: targetOperator?.name ?? null,
    });

    this.epServiceLastConfirmMessage.set(
      targetOperator
        ? `✅ Servizio inviato in cassa a ${targetOperator.name} · ${client.name} · € ${total.toFixed(2)}`
        : `✅ Servizio inviato in cassa · ${client.name} · € ${total.toFixed(2)}`,
    );
    this.epServiceEditorVisible.set(false);
    this.epServiceForm.reset({
      type: 'installazione',
      serviceDate: '',
      clientSearch: '',
      clientId: '',
      description: '',
      priceUnit: 0,
      quantity: 1,
      cashOperatorId: '',
    });
    this.epServiceClienteSearch.set('');
    setTimeout(() => this.epServiceLastConfirmMessage.set(''), 4000);
  }

  /** Storico dei miei servizi inviati */
  protected readonly epMieiServizi = computed(() => {
    const all = this.data.pendingServices();
    const op = this.epActiveOperator();
    return all
      .filter((s) => (op ? s.createdByOperatorId === op.id : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  // --- Modulo ORDINI da Portale Dipendenti (gestiti poi da sezione Magazzino)
  protected readonly epOrderEditorVisible = signal<boolean>(false);
  protected readonly epOrderClienteSearch = signal<string>('');
  protected readonly epOrderLastConfirmMessage = signal<string>('');

  // ===== SCANNER BARCODE / QR CODE (fotocamera) =====
  /** True se il modale scanner è aperto */
  protected readonly epScannerVisible = signal<boolean>(false);
  /** Indica dove applicare il risultato: 'ordini' (riga ordine corrente) o 'magazzino' (ricerca) */
  protected readonly epScannerTarget = signal<'ordini' | 'magazzino'>('ordini');
  /** Indice della riga ordine da riempire quando lo scanner è in target 'ordini' */
  protected readonly epScannerOrderLineIndex = signal<number>(0);
  /** Ultimo testo scannerizzato (mostrato in anteprima nel modale) */
  protected readonly epScannerDetected = signal<string>('');
  /** Contatore tentavi di retry (per mostrare istruzioni dopo il secondo tentativo fallito) */
  protected readonly epScannerRetryCount = signal<number>(0);
  /** Riferimento all'elemento video del modale scanner */
  @ViewChild('epScannerVideo') protected epScannerVideoRef?: ElementRef<HTMLVideoElement>;

  /** Restituisce le istruzioni per abilitare la fotocamera nel browser corrente */
  protected get epScannerPermissionSteps(): { browser: string; steps: string[] } {
    return this.epScanner.getPermissionInstructions();
  }

  /** Apre il modale scanner e avvia la fotocamera */
  protected epOpenScanner(target: 'ordini' | 'magazzino', orderLineIndex = 0): void {
    this.epScannerTarget.set(target);
    this.epScannerOrderLineIndex.set(orderLineIndex);
    this.epScannerDetected.set('');
    this.epScannerRetryCount.set(0);
    this.epScannerVisible.set(true);
    // Piccolo delay per assicurarsi che il video element sia renderizzato
    setTimeout(() => this.epStartScanner(), 150);
  }

  /** Avvia la decodifica sulla fotocamera */
  private epStartScanner(): void {
    const video = this.epScannerVideoRef?.nativeElement ?? null;
    if (!video) return;
    this.epScanner.start(video, (text) => this.epHandleScanResult(text));
  }

  /** Riprova ad avviare la fotocamera (dopo che l'utente ha abilitato i permessi) */
  protected epRetryScanner(): void {
    this.epScannerRetryCount.update((c) => c + 1);
    this.epScanner.error.set('');
    // Riavvio la scansione
    this.epStartScanner();
  }

  /** Chiude il modale scanner e ferma la fotocamera */
  protected epCloseScanner(): void {
    this.epScanner.stop();
    this.epScannerVisible.set(false);
  }

  /** Callback quando un codice viene rilevato: cerca l'articolo e lo applica al target */
  private epHandleScanResult(text: string): void {
    const code = String(text ?? '').trim();
    this.epScannerDetected.set(code);
    if (!code) return;

    // Cerco l'articolo per barcode o sku
    const item = this.data.inventoryItems().find(
      (it) =>
        it.barcode?.trim().toLowerCase() === code.toLowerCase() ||
        it.sku?.trim().toLowerCase() === code.toLowerCase(),
    );

    const target = this.epScannerTarget();
    if (target === 'ordini') {
      const idx = this.epScannerOrderLineIndex();
      const ctrl = this.epOrderLines.at(idx) as FormGroup | undefined;
      if (ctrl) {
        if (item) {
          ctrl.patchValue({
            inventoryItemId: item.id,
            description: item.name,
            search: item.name,
          });
          this.pushToast(`Articolo trovato: ${item.name}`, 'success');
        } else {
          // Codice non in anagrafica: uso come descrizione libera
          ctrl.patchValue({ description: code, search: code, inventoryItemId: '' });
          this.pushToast(`Codice ${code} non in catalogo, inserito come descrizione`, 'success');
        }
      }
    } else if (target === 'magazzino') {
      // Nel magazzino uso il codice come termine di ricerca
      this.epWarehouseSearch.set(code);
      if (item) {
        // Apro subito la scheda articolo con prelievo pronto: scan → quantità → conferma
        this.epResetPrelievoForm();
        this.epSelectedInventoryItem.set(item);
        this.pushToast(`${item.name}: conferma la quantità e preleva.`, 'success');
      } else {
        this.pushToast(`Nessun articolo per il codice ${code}`, 'error');
      }
    }

    // Chiudo automaticamente dopo una breve pausa per dare feedback visivo
    setTimeout(() => this.epCloseScanner(), 600);
  }

  private epMakeOrderLine(): FormGroup {
    return this.formBuilder.nonNullable.group({
      search: [''],
      inventoryItemId: [''],
      description: ['', [Validators.required, Validators.minLength(2)]],
      quantity: [1, [Validators.required, Validators.min(1)]],
      expectedUnitPrice: [0 as number | null],
      note: [''],
    });
  }

  protected readonly epOrderLines: FormArray = this.formBuilder.array([this.epMakeOrderLine()]);
  /** Helper TS per tipizzare come FormGroup[] ogni riga del FormArray Ordini (evita cast in template) */
  protected get epOrderLineGroups(): FormGroup[] {
    return this.epOrderLines.controls as FormGroup[];
  }
  protected readonly epOrderForm = this.formBuilder.nonNullable.group({
    orderType: ['richiesta-cliente', Validators.required],
    urgency: ['media', Validators.required],
    clientSearch: [''],
    clientId: [''],
    note: [''],
    expectedDeliveryDate: [''],
    lines: this.epOrderLines,
  });

  protected readonly epOrderClientiFiltrati = computed(() => {
    const q = this.epOrderClienteSearch().trim().toLowerCase();
    if (!q) return [];
    return this.allClients()
      .filter((c) => (c.name || '').toLowerCase().includes(q))
      .slice(0, 20);
  });

  protected epOrderSelectClient(c: ClientRecord): void {
    this.epOrderForm.patchValue({ clientSearch: c.name, clientId: c.id });
    this.epOrderClienteSearch.set(c.name);
  }

  protected epOrderAddLine(): void {
    this.epOrderLines.push(this.epMakeOrderLine());
  }

  protected epOrderRemoveLine(i: number): void {
    if (this.epOrderLines.length <= 1) return;
    this.epOrderLines.removeAt(i);
  }

  protected epOrderLineSuggestions(i: number): InventoryItemRecord[] {
    const ctrl = this.epOrderLines.at(i) as FormGroup;
    const q = String(ctrl.get('description')?.value ?? '').trim().toLowerCase();
    if (!q) return [];
    return this.allInventoryItems()
      .filter((it) => {
        const hay = `${it.name ?? ''} ${it.sku ?? ''} ${it.category ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 10);
  }

  protected epOrderSelectItem(i: number, it: InventoryItemRecord): void {
    const ctrl = this.epOrderLines.at(i) as FormGroup;
    ctrl.patchValue({
      inventoryItemId: it.id,
      description: it.name,
      search: it.name,
    });
  }

  /** Sincronizza il campo "search" con "description" per i suggerimenti */
  protected epOrderLineSyncSearch(i: number): void {
    const ctrl = this.epOrderLines.at(i) as FormGroup;
    const descVal = String(ctrl.get('description')?.value ?? '').trim();
    if (descVal !== ctrl.get('search')?.value) {
      ctrl.get('search')?.setValue(descVal, { emitEvent: false });
    }
  }

  /**
   * Invia un nuovo ordine al gestionale.
   * Le righe senza inventoryItemId passano come "descrizione libera".
   */
  protected epSubmitOrder(): void {
    if (this.epOrderForm.invalid) return;
    // ✅ Check JIT sessione (revoca immediata tempo zero)
    const me = this.epSessionOperator();
    if (!me || !this.data.isEpPortalSessionValid(me.id)) {
      this.epLogout();
      this.pushToast('Sessione scaduta o accesso revocato.', 'error');
      return;
    }
    const op = me;
    const raw = this.epOrderForm.getRawValue();
    const client = this.allClients().find((c) => c.id === raw.clientId);
    const lines = (raw.lines as any[])
      .filter((row) => Number(row.quantity) >= 1 && row.description.trim().length >= 2)
      .map((row) => ({
        id: `ord-ln-${crypto.randomUUID()}`,
        inventoryItemId: row.inventoryItemId || null,
        description: row.description,
        quantity: Math.max(1, Number(row.quantity) || 1),
        expectedUnitPrice: Number(row.expectedUnitPrice) || null,
        note: row.note || '',
      }));

    if (lines.length === 0) {
      this.pushToast('Aggiungi almeno una riga articolo valida all\'ordine.', 'error');
      return;
    }

    const orderType = raw.orderType as any;
    const needsClient = orderType === 'richiesta-cliente';
    if (needsClient && !client) {
      this.pushToast('Tipo "richiesta cliente": seleziona un cliente.', 'error');
      return;
    }

    const created = this.data.addWarehouseOrder({
      createdByOperatorId: op.id,
      createdByOperatorName: op.name,
      orderType,
      clientId: client?.id ?? null,
      clientSnapshot: client?.name ?? '',
      urgency: raw.urgency as any,
      note: raw.note ?? '',
      expectedDeliveryDate: raw.expectedDeliveryDate || null,
      lines,
    });

    this.epOrderLastConfirmMessage.set(`✅ Ordine ${created.number} inviato al gestionale`);
    this.epOrderEditorVisible.set(false);
    // reset form
    this.epOrderForm.reset({
      orderType: 'richiesta-cliente',
      urgency: 'media',
      clientSearch: '',
      clientId: '',
      note: '',
      expectedDeliveryDate: '',
    });
    while (this.epOrderLines.length) this.epOrderLines.removeAt(0);
    this.epOrderLines.push(this.epMakeOrderLine());
    this.epOrderClienteSearch.set('');
    setTimeout(() => this.epOrderLastConfirmMessage.set(''), 4000);
  }

  /** I miei ordini creati */
  protected readonly epMieiOrdini = computed(() => {
    const all = this.data.warehouseOrders();
    const op = this.epActiveOperator();
    return all
      .filter((o) => (op ? o.createdByOperatorId === op.id : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  /** Ordine selezionato (dettaglio espanso nella lista) */
  protected readonly epSelectedOrderId = signal<string | null>(null);
  protected readonly epSelectedOrder = computed(() => {
    const id = this.epSelectedOrderId();
    if (!id) return null;
    return this.epMieiOrdini().find((o) => o.id === id) ?? null;
  });

  /** Apre/chiude il dettaglio di un ordine (toggle) */
  protected epToggleOrderDetail(orderId: string): void {
    this.epSelectedOrderId.update((current) => (current === orderId ? null : orderId));
  }

  // --- Modulo "Apri portale sul telefono": IP + QR + clipboard ----------------
  /**
   * Prova a ricavare un IP locale di default. In ambiente browser non si può accedere
   * alla LAN via JS per motivi di sicurezza; lascia vuoto e lascia che l'utente lo inserisca.
   */
  protected readonly epLanIp = signal<string>('192.168.1.50');
  protected readonly epLanPort = signal<number>(4200);
  protected readonly epMobileLastMessage = signal<string>('');

  /** Valida l'IP e compone l'URL completo */
  protected readonly epLanUrl = computed(() => {
    const ip = this.epLanIp().trim();
    const port = Number(this.epLanPort()) || 0;
    const ipv4 = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/.test(ip);
    if (!ipv4 || port <= 0) return '';
    return `http://${ip}:${port}/portale-dipendenti`;
  });

  /** Sorgente immagine del QR code (api.qrserver.com - esterno) */
  protected readonly epQrSrc = computed(() => {
    const url = this.epLanUrl();
    if (!url) return '';
    const qs = encodeURIComponent(url);
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${qs}`;
  });

  /** Copia testo negli appunti e mostra messaggio di feedback */
  protected epCopyToClipboard(text: string, userMessage: string): void {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      this.epMobileLastMessage.set('⚠️ Clipboard non disponibile su questo browser');
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => this.epMobileLastMessage.set(userMessage || 'Copiato'),
      () => this.epMobileLastMessage.set('⚠️ Impossibile copiare negli appunti'),
    );
    setTimeout(() => this.epMobileLastMessage.set(''), 3500);
  }

  // ============ PORTALE DIPENDENTI: retroazione nelle sezioni principali (cassa + magazzino) ============
  // --- Task 6: Servizi pendenti da incassare nella /cassa
  protected readonly epCassaPendingServices = computed(() =>
    this.data
      .pendingServices()
      .filter((svc) => svc.status === 'inviato')
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)),
  );
  protected epPendingServiceClientLabel(svc: PendingServiceRecord): string {
    if (svc.clientSnapshot) return svc.clientSnapshot;
    if (svc.clientId) {
      const c = this.allClients().find((x) => x.id === svc.clientId);
      if (c) return c.name;
    }
    return 'Cliente generico';
  }
  protected epPendingServiceToCart(svc: PendingServiceRecord): void {
    const price = Number(svc.priceUnit) || 0;
    const qty = Number(svc.quantity) || 1;
    if (price <= 0) {
      this.pushToast('Prezzo servizio non valido per la cassa', 'error');
      return;
    }
    // Seleziona cliente in cassa
    if (svc.clientId) {
      this.cashCustomerMode.set('existing');
      this.selectedCashClientId.set(svc.clientId);
    } else {
      this.cashCustomerMode.set('walk-in');
      this.selectedCashClientId.set(null);
    }
    this.cashSalesMode.set('servizi');
    const label = this.epServiceTypeLabel(svc.type);
    const description = svc.description ? ` (${svc.description})` : '';
    const lineName = `${label} · Portale dipendenti${description}`;
    const total = +(price * qty).toFixed(2);
    // Operatore di cassa: usa quello assegnato dal portale, altrimenti il tecnico creatore
    const lineOperator =
      svc.targetCashOperatorName || svc.createdByOperatorName || this.cashCurrentOperator();
    this.cashCart.update((items) => [
      ...items,
      {
        id: `cash-line-ep-${crypto.randomUUID()}`,
        productId: `ep-svc-${svc.id}`,
        name: lineName,
        quantity: qty,
        unitPrice: price,
        originalUnitPrice: price,
        vatRate: 22,
        total,
        pricingMode: 'fisso',
        operatorName: lineOperator,
        excludeFromReceipt: false,
      },
    ]);
    this.data.deletePendingService(svc.id);
    this.pushToast(
      svc.targetCashOperatorName
        ? `Servizio assegnato a ${svc.targetCashOperatorName} caricato nel carrello · € ${total.toFixed(2).replace('.', ',')}`
        : `Servizio caricato nel carrello · € ${total.toFixed(2).replace('.', ',')}`,
      'success',
    );
  }

  protected epRemovePendingService(svc: PendingServiceRecord): void {
    const serviceLabel = this.epServiceTypeLabel(svc.type);
    const clientLabel = this.epPendingServiceClientLabel(svc);
    const confirmMessage =
      `Rimuovere il servizio "${serviceLabel}" di ${clientLabel} dalla lista da incassare?\n\n` +
      'L\'operazione elimina il servizio pendente dal feed della cassa.';
    if (!window.confirm(confirmMessage)) {
      return;
    }

    this.data.deletePendingService(svc.id);
    this.pushToast('Servizio rimosso dalla lista da incassare.', 'success');
  }

  // --- Task 7: Ordini portale dipendenti nel /magazzino
  protected readonly epMagazzinoOrdini = computed(() =>
    [...this.data.warehouseOrders()].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    ),
  );

  /**
   * Ordini ancora da gestire mostrati nel feed del magazzino.
   * Gli ordini ricevuti/annullati escono dal feed e restano solo nel Registro Ordini.
   */
  protected readonly epMagazzinoOrdiniAttivi = computed(() =>
    this.epMagazzinoOrdini().filter(
      (o) => o.status === 'pending' || o.status === 'seen' || o.status === 'approved',
    ),
  );

  /** --- Registro Ordini (log completo, separato dallo storico movimenti) --- */
  protected readonly epOrdersLogOpen = signal(false);
  protected readonly epOrdersLogFilter = signal<'tutti' | WarehouseOrderRecord['status']>('tutti');
  protected readonly epOrdersLogSearch = signal('');
  protected readonly epOrdersLogDateFrom = signal('');
  protected readonly epOrdersLogDateTo = signal('');
  protected readonly epOrdersLogExpandedId = signal<string | null>(null);

  /** Tutti gli ordini, dal più recente al più vecchio */
  protected readonly epOrdersLogAll = computed(() =>
    [...this.data.warehouseOrders()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    ),
  );

  protected readonly epOrdersLogFiltered = computed(() => {
    const filter = this.epOrdersLogFilter();
    const query = this.epOrdersLogSearch().trim().toLowerCase();
    const from = this.epOrdersLogDateFrom();
    const to = this.epOrdersLogDateTo();
    return this.epOrdersLogAll().filter((o) => {
      if (filter !== 'tutti' && o.status !== filter) {
        return false;
      }
      // Confronto per giorno (YYYY-MM-DD) sulla data di creazione dell'ordine
      const orderDay = (o.createdAt || '').slice(0, 10);
      if (from && orderDay < from) {
        return false;
      }
      if (to && orderDay > to) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        o.number,
        o.createdByOperatorName,
        o.clientSnapshot,
        o.note,
        this.epMagazzinoOrderClientLabel(o),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  });

  /** Ordine attualmente selezionato nella tabella del registro */
  protected readonly epOrdersLogSelectedOrder = computed(() => {
    const id = this.epOrdersLogExpandedId();
    return id ? this.epOrdersLogAll().find((o) => o.id === id) ?? null : null;
  });

  protected epOrdersLogCount(status: WarehouseOrderRecord['status']): number {
    return this.epOrdersLogAll().filter((o) => o.status === status).length;
  }

  protected epOpenOrdersLog(): void {
    this.epOrdersLogExpandedId.set(null);
    this.warehouseView.set('ordini');
  }

  protected epCloseOrdersLog(): void {
    this.warehouseView.set('ricerca');
  }

  protected epSetOrdersLogFilter(filter: 'tutti' | WarehouseOrderRecord['status']): void {
    this.epOrdersLogFilter.set(filter);
  }

  protected epSetOrdersLogSearch(value: string): void {
    this.epOrdersLogSearch.set(value);
  }

  protected epSetOrdersLogDateFrom(value: string): void {
    this.epOrdersLogDateFrom.set(value);
  }

  protected epSetOrdersLogDateTo(value: string): void {
    this.epOrdersLogDateTo.set(value);
  }

  protected epToggleOrdersLogRow(id: string): void {
    this.epOrdersLogExpandedId.set(this.epOrdersLogExpandedId() === id ? null : id);
  }

  /** Tutti gli ordini del portale sono tracciati con il prefisso ORD-EP */
  protected epOrderOriginLabel(o: WarehouseOrderRecord): string {
    return o.number.startsWith('ORD-EP-') ? 'Portale dipendenti' : 'Gestionale';
  }

  // ===== Export del Registro Ordini (solo gli ordini attualmente filtrati) =====

  /** Intestazioni colonne del registro ordini (riusate da CSV e PDF) */
  private readonly epOrdersLogHeaders: string[] = [
    'Numero',
    'Origine',
    'Data ordine',
    'Chi ha ordinato',
    'Cliente',
    'Tipo',
    'Urgenza',
    'Stato',
    'Consegna prevista',
    'Righe',
    'Totale €',
    'Note',
  ];

  /** Converte un ordine nelle celle testuali del registro */
  private epOrderToLogCells(o: WarehouseOrderRecord): string[] {
    return [
      o.number,
      this.epOrderOriginLabel(o),
      this.epFormatDate(o.createdAt),
      o.createdByOperatorName || 'Operatore',
      this.epMagazzinoOrderClientLabel(o),
      this.epOrderTypeLabel(o.orderType),
      this.epOrderUrgencyLabel(o.urgency),
      this.epOrderStatusLabel(o.status),
      o.expectedDeliveryDate ? this.epFormatDate(o.expectedDeliveryDate) : '',
      String(o.lines.length),
      this.epMagazzinoOrderLinesTotal(o).toFixed(2).replace('.', ','),
      o.note || '',
    ];
  }

  /** Esporta in CSV (apribile con Excel) gli ordini filtrati nel registro */
  protected epExportOrdersLogCsv(): void {
    const rows = this.epOrdersLogFiltered();
    if (!rows.length) {
      this.pushToast('Nessun ordine da esportare con i filtri selezionati.', 'error');
      return;
    }
    this.downloadCsv(
      [this.epOrdersLogHeaders, ...rows.map((o) => this.epOrderToLogCells(o))],
      `registro-ordini-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    this.pushToast(`Registro ordini esportato in CSV (${rows.length} ordini).`, 'success');
  }

  /** Apre la finestra di stampa con il registro ordini filtrato (Salva come PDF) */
  protected epExportOrdersLogPdf(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const rows = this.epOrdersLogFiltered();
    if (!rows.length) {
      this.pushToast('Nessun ordine da esportare con i filtri selezionati.', 'error');
      return;
    }

    const body = rows
      .map(
        (o) => `
          <tr>
            <td class="mono">${this.escapeHtml(o.number)}</td>
            <td>${this.escapeHtml(this.epFormatDate(o.createdAt))}</td>
            <td><strong>${this.escapeHtml(o.createdByOperatorName || 'Operatore')}</strong></td>
            <td>${this.escapeHtml(this.epMagazzinoOrderClientLabel(o))}</td>
            <td>${this.escapeHtml(this.epOrderTypeLabel(o.orderType))}</td>
            <td>${this.escapeHtml(this.epOrderStatusLabel(o.status))}</td>
            <td class="num">${o.lines.length}</td>
            <td class="num">€ ${this.escapeHtml(this.epMagazzinoOrderLinesTotal(o).toFixed(2).replace('.', ','))}</td>
          </tr>`,
      )
      .join('');

    const filterLabel = this.epOrdersLogFilter() === 'tutti'
      ? 'Tutti gli ordini'
      : `Stato: ${this.epOrderStatusLabel(this.epOrdersLogFilter() as WarehouseOrderRecord['status'])}`;
    const search = this.epOrdersLogSearch().trim();
    const rangeFrom = this.epOrdersLogDateFrom();
    const rangeTo = this.epOrdersLogDateTo();
    const rangeLabel = rangeFrom || rangeTo
      ? `Periodo: ${rangeFrom ? this.epFormatDate(rangeFrom) : 'inizio'} → ${rangeTo ? this.epFormatDate(rangeTo) : 'oggi'}`
      : '';
    const company = this.companyProfile();
    const popup = window.open('', '_blank', 'width=1180,height=780');
    if (!popup) {
      this.pushToast('Popup bloccato dal browser: impossibile aprire il registro ordini.', 'error');
      return;
    }

    popup.document.open();
    popup.document.write(`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Registro ordini</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:28px;color:#0f172a}
    header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #0f9f6d;padding-bottom:14px;margin-bottom:20px}
    h1{font-size:22px;margin:0 0 6px;letter-spacing:.02em}
    .brand{font-size:15px;font-weight:800;color:#0f9f6d;text-transform:uppercase;letter-spacing:.14em;margin:0 0 4px}
    .meta{font-size:12px;color:#475569;line-height:1.5;margin:0}
    .box{border:1px solid #cbd5e1;border-radius:12px;padding:12px 16px;text-align:right;font-size:12px;color:#475569;min-width:190px}
    .box strong{display:block;font-size:18px;color:#0f172a}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;border-bottom:1px solid #cbd5e1;padding:8px 10px}
    th.num{text-align:right}
    td{padding:9px 10px;font-size:13px;border-bottom:1px solid #eef2f7}
    td.num{text-align:right;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
    td.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700}
    footer{margin-top:18px;font-size:11px;color:#94a3b8;text-align:center}
    @media print{body{margin:14mm}@page{size:A4 landscape;margin:10mm}}
  </style>
</head>
<body>
  <header>
    <div>
      <p class="brand">${this.escapeHtml(company.legalName || 'AudioMax')}</p>
      <h1>Registro ordini</h1>
      <p class="meta">
        ${this.escapeHtml(filterLabel)}${rangeLabel ? ` · ${this.escapeHtml(rangeLabel)}` : ''}${search ? ` · Ricerca: ${this.escapeHtml(search)}` : ''}<br>
        ${this.escapeHtml([company.address, company.postalCode, company.city, company.province].filter((value) => !!value).join(' '))}
        ${company.phone ? ` · Tel. ${this.escapeHtml(company.phone)}` : ''}
      </p>
    </div>
    <div class="box">
      <span>Ordini esportati</span>
      <strong>${rows.length}</strong>
      <span>Valore indicativo € ${this.escapeHtml(
      rows.reduce((sum, o) => sum + this.epMagazzinoOrderLinesTotal(o), 0).toFixed(2).replace('.', ','),
    )}</span>
    </div>
  </header>
  <table>
    <thead>
      <tr>
        <th>Numero</th>
        <th>Data</th>
        <th>Chi ha ordinato</th>
        <th>Cliente</th>
        <th>Tipo</th>
        <th>Stato</th>
        <th class="num">Righe</th>
        <th class="num">Totale</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
  <footer>Registro generato il ${this.escapeHtml(new Date().toLocaleDateString('it-IT'))}</footer>
</body>
</html>`);
    popup.document.close();
    popup.focus();
    setTimeout(() => {
      popup.print();
    }, 250);
    this.pushToast('Registro pronto: usa "Salva come PDF" nella finestra di stampa.', 'success');
  }

  // ===== Carico magazzino da ordine del portale =====
  protected readonly epOrderReceiptOpen = signal(false);
  protected readonly epOrderReceiptOrderId = signal<string | null>(null);
  protected readonly epOrderReceiptSupplier = signal('');
  protected readonly epOrderReceiptCategory = signal('');
  protected readonly epOrderReceiptShelf = signal('');
  protected readonly epOrderReceiptDate = signal(new Date().toISOString().slice(0, 10));
  protected readonly epOrderReceiptOperator = signal('');
  protected readonly epOrderReceiptDoc = signal('');
  protected readonly epOrderReceiptLines = signal<OrderReceiptLineDraft[]>([]);

  protected readonly epOrderReceiptOrder = computed(() => {
    const id = this.epOrderReceiptOrderId();
    return id ? this.data.warehouseOrders().find((o) => o.id === id) ?? null : null;
  });

  protected readonly epOrderReceiptLinesActive = computed(() =>
    this.epOrderReceiptLines().filter((line) => !line.skip),
  );

  protected readonly epOrderReceiptTotalCost = computed(() =>
    this.epOrderReceiptLinesActive().reduce(
      (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
      0,
    ),
  );

  /** True quando ogni riga attiva è pronta (prodotto scelto o nome nuovo compilato) */
  protected readonly epOrderReceiptValid = computed(() =>
    this.epOrderReceiptLinesActive().length > 0 &&
    this.epOrderReceiptLinesActive().every(
      (line) => !!line.inventoryItemId || !!line.newName.trim(),
    ),
  );

  /** Apre la modale di carico precompilata con le righe dell'ordine */
  protected epOpenOrderReceipt(order: WarehouseOrderRecord): void {
    this.epOrderReceiptOrderId.set(order.id);
    this.epOrderReceiptSupplier.set('');
    this.epOrderReceiptCategory.set(this.productCategories()[0] ?? 'Da classificare');
    this.epOrderReceiptShelf.set('');
    this.epOrderReceiptDate.set(new Date().toISOString().slice(0, 10));
    this.epOrderReceiptOperator.set(this.cashCurrentOperator() || 'Magazzino');
    this.epOrderReceiptDoc.set('');
    this.epOrderReceiptLines.set(
      order.lines.map((line) => {
        const item = line.inventoryItemId
          ? this.allInventoryItems().find((it) => it.id === line.inventoryItemId) ?? null
          : null;
        const requestedPrice = Number(line.expectedUnitPrice) || 0;
        return {
          lineId: line.id,
          description: line.description || 'Articolo',
          inventoryItemId: item?.id ?? '',
          newName: line.description || 'Articolo',
          quantity: Math.max(1, Number(line.quantity) || 1),
          unitCost: item ? item.unitCost : requestedPrice,
          salePrice: item ? item.salePrice : requestedPrice,
          skip: false,
        };
      }),
    );
    this.epOrderReceiptOpen.set(true);
  }

  protected epCloseOrderReceipt(): void {
    this.epOrderReceiptOpen.set(false);
  }

  protected epPatchOrderReceiptLine(index: number, patch: Partial<OrderReceiptLineDraft>): void {
    this.epOrderReceiptLines.update((lines) =>
      lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  /** Registra il carico di tutte le righe attive e marca l'ordine come ricevuto */
  protected epSubmitOrderReceipt(): void {
    const order = this.epOrderReceiptOrder();
    if (!order) {
      return;
    }
    const lines = this.epOrderReceiptLinesActive();
    if (!lines.length) {
      this.pushToast('Abilita almeno una riga da caricare.', 'error');
      return;
    }
    if (!this.epOrderReceiptValid()) {
      this.pushToast('Completa i dati delle righe (prodotto o nome nuovo).', 'error');
      return;
    }

    const totalCost = this.epOrderReceiptTotalCost();
    const msg = [
      '⚠️ CARICO MAGAZZINO DA ORDINE DEFINITIVO.',
      '',
      `Ordine ${order.number} · ${lines.length} righe`,
      `Totale costo stimato: € ${totalCost.toFixed(2)}`,
      this.epOrderReceiptSupplier() ? `Fornitore: ${this.epOrderReceiptSupplier()}` : '',
      '',
      'Verranno creati/aggiornati i prodotti, i movimenti di carico e i lotti.',
      'L\'ordine verrà marcato come RICEVUTO e uscirà dalla lista da gestire.',
      '',
      'Confermi?',
    ].filter(Boolean).join('\n');
    const ok = typeof window !== 'undefined' ? window.confirm(msg) : true;
    if (!ok) {
      this.pushToast('Carico annullato · nessun movimento scritto.', 'success');
      return;
    }

    const receivedDate = this.epOrderReceiptDate();
    const supplier = this.epOrderReceiptSupplier();
    const category = this.epOrderReceiptCategory().trim() || 'Da classificare';
    const shelf = this.epOrderReceiptShelf().trim();
    const operator = this.epOrderReceiptOperator().trim() || 'Magazzino';
    const docNumber = this.epOrderReceiptDoc().trim();

    let created = 0;
    try {
      lines.forEach((line, index) => {
        const isNew = !line.inventoryItemId;
        this.data.receiveWarehouseStock({
          inventoryItemId: line.inventoryItemId || null,
          sku: isNew ? `${order.number}-${index + 1}` : '',
          name: isNew ? line.newName.trim() : '',
          description: isNew ? `Carico da ordine ${order.number}` : '',
          category,
          usageType: 'rivendita',
          unitOfMeasure: 'pz',
          quantity: Math.max(1, Number(line.quantity) || 1),
          unitCost: Number(line.unitCost) || 0,
          salePrice: Number(line.salePrice) || 0,
          receivedDate,
          supplier,
          lotNumber: '',
          expiryDate: null,
          shelfCode: shelf,
          minStock: 0,
          purchaseDocumentNumber: docNumber,
          operator,
          transportCost: 0,
          customsCost: 0,
          packagingCost: 0,
        });
        created += 1;
      });

      this.data.updateWarehouseOrderStatus(order.id, 'received');
      this.pushToast(`Ordine ${order.number} · caricate ${created} righe in magazzino.`, 'success');
      this.epOrderReceiptOpen.set(false);
    } catch {
      this.pushToast('Errore durante il carico da ordine.', 'error');
    }
  }

  protected readonly epMagazzinoExpandedOrderId = signal<string | null>(null);
  protected epOrderNextAction(status: WarehouseOrderRecord['status']): {
    label: string;
    next: WarehouseOrderRecord['status'];
  } | null {
    switch (status) {
      case 'pending':
        return { label: 'Segna come visto', next: 'seen' };
      case 'seen':
        return { label: 'Approva ordine', next: 'approved' };
      case 'approved':
        return { label: 'Marca ricevuto', next: 'received' };
      default:
        return null;
    }
  }
  protected epOrderCanCancel(status: WarehouseOrderRecord['status']): boolean {
    return status !== 'cancelled' && status !== 'received';
  }

  /** L'ordine può essere caricato in magazzino finché non è ricevuto o annullato */
  protected epOrderCanReceive(status: WarehouseOrderRecord['status']): boolean {
    return status !== 'received' && status !== 'cancelled';
  }
  protected epMagazzinoUpdateOrderStatus(
    order: WarehouseOrderRecord,
    next: WarehouseOrderRecord['status'],
  ): void {
    this.data.updateWarehouseOrderStatus(order.id, next);
    this.pushToast(`Ordine ${order.number} · ${this.epOrderStatusLabel(next)}`, 'success');
  }
  protected epMagazzinoOrderClientLabel(o: WarehouseOrderRecord): string {
    if (o.orderType === 'uso-interno') return 'Uso interno';
    if (o.clientSnapshot) return o.clientSnapshot;
    if (o.clientId) {
      const c = this.allClients().find((x) => x.id === o.clientId);
      if (c) return c.name;
    }
    return 'Nessun cliente';
  }
  protected epMagazzinoOrderLinesTotal(o: WarehouseOrderRecord): number {
    if (!o.lines?.length) return 0;
    return +o.lines
      .reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.expectedUnitPrice) || 0), 0)
      .toFixed(2);
  }
  // ============ FINE PORTALE DIPENDENTI v1 ============

  protected readonly cashProductForm = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    category: ['Servizi audio', Validators.required],
    newCategory: [''],
    price: [0, [Validators.required, Validators.min(0.01)]],
    shortcut: [true],
    pricingMode: this.formBuilder.nonNullable.control<CashRegisterProductRecord['pricingMode']>('fisso'),
    linkedInventoryItemId: [''],
  });
  protected readonly cashOperatorForm = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    role: this.formBuilder.nonNullable.control<CashOperatorRecord['role']>('vendita'),
    active: [true],
    employmentType: this.formBuilder.nonNullable.control<CashOperatorRecord['employmentType']>('dipendente'),
    jobTitle: [''],
    contractHoursWeekly: [40, [Validators.min(0), Validators.max(60)]],
  });

  // ⭐ Payment Provider (Impostazioni → Pagamenti): gestisce l'editor
  protected readonly paymentProviderEditingId = signal<string | null>(null);
  protected readonly paymentProviderForm = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    kind: this.formBuilder.nonNullable.control<PaymentProviderKind>('integrato'),
    code: ['stripe', Validators.required],
    description: [''],
    apiPublishableKey: [''],
    connectedBankAccountIban: [''],
    connectedBankAccountLabel: [''],
    autoSupported: [true, Validators.required],
    active: [true, Validators.required],
  });
  protected openPaymentProviderEditor(provider?: PaymentProviderRecord): void {
    if (provider) {
      this.paymentProviderEditingId.set(provider.id);
      this.paymentProviderForm.reset({
        name: provider.name,
        kind: provider.kind,
        code: provider.code,
        description: provider.description ?? '',
        apiPublishableKey: provider.apiPublishableKey ?? '',
        connectedBankAccountIban: provider.connectedBankAccountIban ?? '',
        connectedBankAccountLabel: provider.connectedBankAccountLabel ?? '',
        autoSupported: provider.autoSupported,
        active: provider.active,
      });
    } else {
      this.paymentProviderEditingId.set(null);
      this.paymentProviderForm.reset({
        name: '',
        kind: 'integrato',
        code: 'stripe',
        description: '',
        apiPublishableKey: '',
        connectedBankAccountIban: '',
        connectedBankAccountLabel: '',
        autoSupported: true,
        active: true,
      });
    }
  }
  protected savePaymentProvider(): void {
    if (this.paymentProviderForm.invalid) {
      this.paymentProviderForm.markAllAsTouched();
      return;
    }
    const raw = this.paymentProviderForm.getRawValue();
    const editingId = this.paymentProviderEditingId();
    const payload: Omit<PaymentProviderRecord, 'id' | 'createdAt'> = {
      name: raw.name.trim(),
      kind: raw.kind,
      code: raw.code.trim() || 'custom',
      description: raw.description.trim() || undefined,
      apiPublishableKey: raw.apiPublishableKey.trim() || undefined,
      connectedBankAccountIban: raw.connectedBankAccountIban.trim() || undefined,
      connectedBankAccountLabel: raw.connectedBankAccountLabel.trim() || undefined,
      autoSupported: Boolean(raw.autoSupported),
      active: Boolean(raw.active),
    };
    if (editingId) {
      this.data.updatePaymentProvider(editingId, payload);
      this.pushToast('Metodo di pagamento aggiornato.', 'success');
    } else {
      this.data.addPaymentProvider(payload);
      this.pushToast('Nuovo metodo di pagamento aggiunto.', 'success');
    }
    this.openPaymentProviderEditor(undefined);
  }
  protected deletePaymentProvider(id: string): void {
    const provider = this.data.paymentProviders().find((pp) => pp.id === id);
    if (!provider) return;
    if (!confirm(`Eliminare definitivamente il metodo di pagamento "${provider.name}"?`)) return;
    this.data.removePaymentProvider(id);
    if (this.paymentProviderEditingId() === id) {
      this.openPaymentProviderEditor(undefined);
    }
    this.pushToast('Metodo di pagamento rimosso.', 'success');
  }

  protected readonly ticketForm = this.formBuilder.nonNullable.group({
    title: ['', Validators.required],
    customerName: ['', Validators.required],
    insertedAt: [new Date().toISOString().slice(0, 10), Validators.required],
    serviceType: this.formBuilder.nonNullable.control<ServiceTicketRecord['serviceType']>(
      'installazione',
    ),
    locationType: this.formBuilder.nonNullable.control<ServiceTicketRecord['locationType']>(
      'domicilio',
    ),
    priority: this.formBuilder.nonNullable.control<ServiceTicketRecord['priority']>('media'),
    status: this.formBuilder.nonNullable.control<ServiceTicketRecord['status']>('aperto'),
    technician: ['', Validators.required],
    linkedQuoteId: this.formBuilder.nonNullable.control<string>(''),
    linkedAppointmentId: this.formBuilder.nonNullable.control<string>(''),
    materialSummary: [''],
    materialCost: [0],
    workSummary: [''],
    notes: [''],
    resolutionStatus: this.formBuilder.nonNullable.control<ServiceTicketRecord['resolutionStatus']>(
      'da-verificare',
    ),
  });
  protected readonly ticketMaterialForm = this.formBuilder.nonNullable.group({
    inventoryItemId: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1)]],
  });

  constructor() {
    this.setupFormDraftSync();
    this.applyCashHandoffFromNavigation();
    this.setupWarehouseReceiptDerivedSync();
    effect(() => {
      if (this.section().id !== 'orari' || this.employeePanelView() !== 'turni') {
        return;
      }

      this.employeeScheduleMonth.set(this.startOfMonthIso(this.toIsoDate(new Date())));
      this.syncAutomaticEmployeeAttendanceForVisibleRange();
    });

    // All'apertura di una cella nel planner turni, popola i campi custom editor
    // con i valori correnti della cella (se già compilata)
    effect(() => {
      const sel = this.plannerSelectedCell();
      if (!sel) return;
      const employee = this.allCashOperators().find((op) => op.id === sel.employeeId);
      if (!employee) return;
      const cell = this.plannerParseCell(employee, sel.weekIndex, sel.dayKey);
      if (cell.tone === 'standard' && cell.startMinutes != null && cell.endMinutes != null) {
        const start = this.planner30MinSlots[this.plannerSlotIndex(cell.startMinutes)] ?? '08:30';
        const end = this.planner30MinSlots[this.plannerSlotIndex(cell.endMinutes)] ?? '17:00';
        const hasBreak = cell.breakStart != null && cell.breakEnd != null;
        const breakFrom = hasBreak && cell.breakStart != null ? (this.planner30MinSlots[this.plannerSlotIndex(cell.breakStart)] ?? '13:00') : '13:00';
        const breakTo = hasBreak && cell.breakEnd != null ? (this.planner30MinSlots[this.plannerSlotIndex(cell.breakEnd)] ?? '14:00') : '14:00';
        this.plannerEditorTmp.set({ start, end, hasBreak, breakFrom, breakTo });
      } else {
        // Per Ferie/Permesso/Malattia/Riposo metto default comodo
        this.plannerEditorTmp.set({ start: '08:30', end: '17:00', hasBreak: true, breakFrom: '13:00', breakTo: '14:00' });
      }
    });

    // Promemoria paghe 1° del mese (dopo init asincrono)
    // ✅ Fix ISS-28: salvo l'handle del timer per poterlo cancellare
    // in caso di distruzione del component prima dei 400ms (memory leak).
    this.pagheReminderTimer = setTimeout(() => {
      this.checkPagheReminderOnStartup();
      // Timer concluso, reset dell'handle
      this.pagheReminderTimer = null;
    }, 400);
    // Cleanup sicuro su distruzione component (DestroyRef)
    this.destroyRef.onDestroy(() => {
      if (this.pagheReminderTimer !== null) {
        clearTimeout(this.pagheReminderTimer);
        this.pagheReminderTimer = null;
      }
      // ✅ Fix REV-007: cleanup toastTimer
      if (this.toastTimer !== undefined) {
        clearTimeout(this.toastTimer);
        this.toastTimer = undefined;
      }
      // ✅ Fix REV-008: cleanup tutti i blob timers (revoke URL)
      this.blobTimers.forEach((h) => clearTimeout(h));
      this.blobTimers.clear();
    });
  }

  protected updatePrivacyBaseUrlOverride(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.privacyDispatch.updateBaseUrlOverride(target?.value ?? '');
  }

  protected resetPrivacyBaseUrlOverride(): void {
    this.privacyDispatch.resetBaseUrlOverride();
  }

  private applyCashHandoffFromNavigation(): void {
    const sectionId = (this.route.snapshot?.data as { sectionId?: string } | null)?.sectionId;
    if (sectionId !== 'cassa') {
      return;
    }

    const navigation = this.router.getCurrentNavigation();
    const state = (navigation?.extras.state ?? null) as
      | { cashPendingTransactionId?: unknown; cashClientId?: unknown; cashTicketId?: unknown; cashQuoteId?: unknown }
      | null;
    if (!state) {
      return;
    }

    const pendingTransactionId =
      typeof state.cashPendingTransactionId === 'string' ? state.cashPendingTransactionId : null;
    const clientId = typeof state.cashClientId === 'string' ? state.cashClientId : null;
    const ticketId = typeof state.cashTicketId === 'string' ? state.cashTicketId : null;
    const quoteId = typeof state.cashQuoteId === 'string' ? state.cashQuoteId : null;

    if (pendingTransactionId) {
      this.loadPendingCashTransaction(pendingTransactionId);
      return;
    }

    if (ticketId) {
      this.loadTicketToCash(ticketId);
      return;
    }

    if (quoteId) {
      // ✅ Handoff diretto da dettaglio preventivo: carica righe, cliente, link
      this.cashSalesMode.set('preventivi');
      this.loadQuoteToCash(quoteId);
      return;
    }

    if (clientId) {
      this.selectCashClient(clientId);
    }
  }

  protected openCashSettlementForClient(clientId: string): void {
    const pending = this.cashPendingTransactions()
      .filter((transaction) => transaction.clientId === clientId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    if (!pending.length) {
      this.pushToast('Nessun insoluto trovato per questo contatto.', 'error');
      return;
    }

    const preferred =
      pending.find((transaction) => transaction.status === 'insoluto') ?? pending[0];

    this.closeClientDetailModal();
    void this.router.navigate(['/cassa'], {
      state: {
        cashClientId: clientId,
        cashPendingTransactionId: preferred.id,
      },
    });
  }

  protected addClient(): void {
    if (this.contactModalKind() === 'fornitore') {
      if (this.expenseSupplierForm.invalid) {
        this.expenseSupplierForm.markAllAsTouched();
        return;
      }

      const payload = this.expenseSupplierForm.getRawValue();
      const createdSupplier = this.data.addExpenseSupplier(payload);
      this.expenseSupplierForm.reset({
        businessName: '',
        vatNumber: '',
        address: '',
        contactName: '',
        email: '',
        phone: '',
        supplyType: '',
        active: true,
      });
      this.clientModalOpen.set(false);
      this.pushToast('Nuovo contatto fornitore salvato.', 'success');
      if (createdSupplier) {
        this.applyWarehouseSupplierHandoff(createdSupplier);
        this.applyExpenseSupplierHandoff(createdSupplier);
      }
      return;
    }

    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      return;
    }

    const payload = this.clientForm.getRawValue();
    const billingProfile: ClientBillingProfile = {
      kind: payload.kind as 'privato' | 'azienda',
      taxId: payload.taxId || '',
      sdiCode: payload.sdiCode || '',
      pec: payload.pec || '',
      billingAddress: payload.billingAddress || '',
      billingPostalCode: payload.billingPostalCode || '',
      billingProvince: (payload.billingProvince || '').toUpperCase(),
      billingCountry: (payload.billingCountry || 'IT').toUpperCase(),
    };
    const { kind, taxId, sdiCode, pec, billingAddress, billingPostalCode, billingProvince, billingCountry, ...clientData } = payload;
    const normalizedName = clientData.name.trim();

    if (!normalizedName) {
      this.clientForm.controls.name.setErrors({ required: true });
      this.clientForm.markAllAsTouched();
      return;
    }

    const fallbackEmail = `${normalizedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')}.${Date.now()}@crm.local`;
    const normalizedPayload = {
      ...clientData,
      name: normalizedName,
      phone: clientData.phone.trim() || 'Non indicato',
      email: clientData.email.trim() || fallbackEmail,
      city: clientData.city.trim() || 'Non indicata',
      address: clientData.address.trim() || 'Non indicato',
      segment: clientData.segment.trim() || (kind === 'azienda' ? 'Azienda' : 'Cliente'),
    };

    let handledClient: ClientRecord | null = null;

    if (this.editingClientId()) {
      const current = this.allClients().find((entry) => entry.id === this.editingClientId()) ?? null;
      if (!current) {
        return;
      }

      const updatedPrivacyProfile = this.buildCashPrivacyProfile({
        channel: 'crm',
        operator: 'Backoffice',
        dispatchChannel: this.cashPrivacyDispatchChannel(),
        noticeAcknowledged: this.cashPrivacyNoticeAcknowledged(),
        emailMarketing: this.cashPrivacyEmailMarketing(),
        whatsappMarketing: this.cashPrivacyWhatsappMarketing(),
        fidelityProfiling: this.cashPrivacyFidelityProfiling(),
        billingProfile,
        existingProfile: current.privacyProfile,
      });

      const updatedClient: ClientRecord = {
        ...current,
        ...normalizedPayload,
        lastContact: new Date().toISOString().slice(0, 10),
        privacyProfile: updatedPrivacyProfile,
      };
      this.data.updateClient(updatedClient);
      this.selectedClientId.set(this.editingClientId());

      if (this.cashPrivacyDispatchChannel() !== 'firma') {
        this.dispatchCashPrivacyConsent(updatedClient);
      }
      handledClient = updatedClient;
    } else {
      const newPrivacyProfile = this.buildCashPrivacyProfile({
        channel: 'crm',
        operator: 'Backoffice',
        dispatchChannel: this.cashPrivacyDispatchChannel(),
        noticeAcknowledged: this.cashPrivacyNoticeAcknowledged(),
        emailMarketing: this.cashPrivacyEmailMarketing(),
        whatsappMarketing: this.cashPrivacyWhatsappMarketing(),
        fidelityProfiling: this.cashPrivacyFidelityProfiling(),
        billingProfile,
      });

      const createdClient = this.data.addClient({
        ...normalizedPayload,
        privacyProfile: newPrivacyProfile,
      });

      let updatedClient = createdClient;
      if (createdClient.privacyProfile.remoteConsentUrl?.startsWith('/privacy-consent/temp-')) {
        updatedClient = {
          ...createdClient,
          privacyProfile: {
            ...createdClient.privacyProfile,
            remoteConsentUrl: `/privacy-consent/${createdClient.id}`,
          },
        };
        this.data.updateClient(updatedClient);
      }

      this.selectedClientId.set(updatedClient.id);
      if (this.cashPrivacyDispatchChannel() !== 'firma') {
        this.dispatchCashPrivacyConsent(updatedClient);
      }
      handledClient = updatedClient;
    }

    if (handledClient) {
      this.applyTicketClientHandoff(handledClient);
    }

    this.clearFormDraft('client');
    this.resetClientForm();
    this.clientModalOpen.set(false);
  }

  protected addQuote(): void {
    if (this.quoteForm.invalid) {
      this.quoteForm.markAllAsTouched();
      return;
    }

    const payload = this.quoteForm.getRawValue();
    let computedValue = Number(payload.value) || 0;
    const normalizedLines = this.quoteDraftLines()
      .map((line) => ({
        ...line,
        description: line.description.trim(),
        quantity: Math.max(0, Number(line.quantity) || 0),
        unitPrice: Math.max(0, Number(line.unitPrice) || 0),
        vatRate: Math.max(0, Number(line.vatRate) || 0),
      }))
      .filter((line) => line.description && line.quantity > 0);

    if (normalizedLines.length) {
      computedValue = normalizedLines.reduce((total, line) => {
        const net = line.quantity * line.unitPrice;
        return total + net + net * (line.vatRate / 100);
      }, 0);
    }

    if (payload.serviceId) {
      const service = this.allCashProducts().find((item) => item.id === payload.serviceId);
      const units = Math.max(1, Number(payload.units) || 1);

      if (service) {
        if (service.pricingMode === 'fisso') {
          computedValue = service.price;
        } else {
          computedValue = service.price * units;
        }
      }
    }

    const normalizedQuote = {
      issueDate: payload.issueDate,
      customerName: payload.customerName,
      isAnonymous: payload.isAnonymous || false,
      discountAmount: Number(payload.discountAmount) || 0,
      customerPhone: payload.customerPhone,
      customerEmail: payload.customerEmail,
      customerAddress: payload.customerAddress,
      customerTaxId: payload.customerTaxId,
      customerPec: payload.customerPec,
      customerSdiCode: payload.customerSdiCode,
      attachmentName: payload.attachmentName,
      fulfillmentType: payload.fulfillmentType,
      fulfillmentAddress: payload.fulfillmentAddress,
      paymentPlan: payload.paymentPlan,
      installmentCount: Number(payload.installmentCount) || 0,
      installmentCadence: payload.installmentCadence,
      financingProvider: payload.financingProvider,
      paymentAlertDays: Number(payload.paymentAlertDays) || 7,
      paymentNotes: payload.paymentNotes,
      projectType: payload.projectType,
      value: computedValue,
      dueDate: payload.dueDate,
      stage: payload.stage,
      notes: payload.notes,
      lines: normalizedLines,
    } satisfies Omit<QuoteRecord, 'id'>;

    this.syncQuoteClientToRegistry(normalizedQuote);

    if (this.editingQuoteId()) {
      this.data.updateQuote({
        id: this.editingQuoteId()!,
        ...normalizedQuote,
      });
      this.selectedQuoteId.set(this.editingQuoteId());
    } else {
      this.data.addQuote(normalizedQuote);
    }

    this.clearFormDraft('quote');
    this.resetQuoteForm();
    this.quoteModalOpen.set(false);
  }

  /** Verifica se serve conferma override per salvataggio appuntamento (negozio chiuso o tecnici in riposo). */
  protected _appointmentNeedsOverride(): { required: boolean; motivi: string[] } {
    const motivi: string[] = [];
    const d = this._appointmentDateOrNull();
    if (d) {
      const s = this.storeOpenStatusForDate(d);
      if (s.kind === 'closed-weekly' || s.kind === 'bulk-closure') {
        motivi.push(s.kind === 'bulk-closure' ? `Chiusura collettiva ${s.from}→${s.to} (${s.reason})` : `Negozio chiuso · ${s.dayLabel}`);
      }
    }
    for (const op of this.selectedAppointmentOperators()) {
      const st = this.getAppointmentOperatorStatus(op);
      if (st.level === 1) motivi.push(`${op}: 🔒 NEGOZIO CHIUSO`);
      if (st.level === 4) motivi.push(`${op}: 💤 Riposo (nessun turno)`);
    }
    // deduplica motivi
    const dedup = Array.from(new Set(motivi));
    return { required: dedup.length > 0, motivi: dedup };
  }

  protected addAppointment(): void {
    if (this.appointmentForm.invalid) {
      this.appointmentForm.markAllAsTouched();
      return;
    }

    // ===== GUARD OVERRIDE (negozio chiuso o riposo tecnico) =====
    const ov = this._appointmentNeedsOverride();
    if (ov.required) {
      const msg = [
        '⚠️ STAI SALVANDO UN APPUNTAMENTO SPECIALE (OVERRIDE).',
        'Motivo/i:',
        ...ov.motivi.map((m) => '  · ' + m),
        '',
        'Confermi forzatamente il salvataggio?',
      ].join('\n');
      const ok = typeof window !== 'undefined' ? window.confirm(msg) : true;
      if (!ok) {
        this.pushToast('Salvataggio annullato · appuntamento NON salvato.', 'success');
        return;
      }
    }

    const payload = this.appointmentForm.getRawValue();
    const normalizedPayload = {
      ...payload,
      technician: Array.isArray(payload.technician) ? payload.technician.join(', ') : payload.technician,
      address: payload.address || '',
      durationMinutes: Number(payload.durationMinutes) || 60,
      linkedQuoteId: payload.linkedQuoteId || null,
    };

    if (this.editingAppointmentId()) {
      this.data.updateAppointment({
        id: this.editingAppointmentId()!,
        ...normalizedPayload,
      });
      this.selectedAppointmentId.set(this.editingAppointmentId());
    } else {
      this.data.addAppointment(normalizedPayload);
    }

    this.clearFormDraft('appointment');
    this.resetAppointmentForm();
    this.appointmentModalOpen.set(false);
  }

  protected addInventoryItem(): void {
    if (this.inventoryForm.invalid) {
      this.inventoryForm.markAllAsTouched();
      return;
    }

    const payload = this.inventoryForm.getRawValue();
    const normalizedPayload = this.normalizeInventoryPayload(payload);

    if (!normalizedPayload) {
      return;
    }

    // ===== CONFERMA OBBLIGATORIA QUANDO SI SALVA UNA MODIFICA (non un nuovo inserimento) =====
    // L'utente vuole protezione su "Salva modifica" per evitare di sovrascrivere dati dell'anagrafica per sbaglio.
    if (this.editingInventoryId()) {
      const target = this.allInventoryItems().find((item) => item.id === this.editingInventoryId());
      const nameLabel = target?.name ?? normalizedPayload.name;
      const msg = [
        '⚠️ SALVATAGGIO MODIFICHE PRODOTTO.',
        '',
        `Applica definitivamente le modifiche a "${nameLabel}"?`,
        '',
        'Tutti i campi anagrafici (SKU, barcode, prezzi, scorta, fornitore, collocazione, ecc.) verranno aggiornati.',
        '',
        'Confermi?',
      ].join('\n');
      const ok = typeof window !== 'undefined' ? window.confirm(msg) : true;
      if (!ok) {
        this.pushToast('Salvataggio annullato · modifiche NON applicate.', 'success');
        return;
      }
    }

    if (this.editingInventoryId()) {
      // ✅ Fix ISS-08: passa il flag della checkbox UI.
      const syncPrices = !!this.inventoryForm.get('syncCashPrices')?.value;
      this.data.updateInventoryItem({
        id: this.editingInventoryId()!,
        status: this.selectedInventoryItem()?.status ?? 'disponibile',
        ...normalizedPayload,
      }, syncPrices);
      this.selectedInventoryId.set(this.editingInventoryId());
    } else {
      this.data.addInventoryItem(normalizedPayload);
    }

    this.inventoryEditModalOpen.set(false);
    this.resetInventoryForm();
  }

  protected receiveWarehouseStock(): void {
    this.submitWarehouseReceipt(false);
  }

  /**
   * Registra il carico e prepara subito il form per il prodotto successivo.
   * Mantiene i dati condivisi (fornitore, categoria, data, operatore, scaffale)
   * per velocizzare il popolamento di più articoli consecutivi.
   */
  protected receiveWarehouseStockAndNew(): void {
    this.submitWarehouseReceipt(true);
  }

  private submitWarehouseReceipt(createAnother: boolean): void {
    if (this.warehouseReceiptForm.invalid) {
      this.warehouseReceiptForm.markAllAsTouched();
      return;
    }

    const payload = this.warehouseReceiptForm.getRawValue();

    // ===== CONFERMA OBBLIGATORIA CARICO / RICARICA MAGAZZINO =====
    // Scrive un movimento permanente, i lotti e una eventuale spesa:
    // chiediamo conferma per evitare carichi sbagliati (es. quantità sbagliate, costo sbagliato).
    const isRestock = !!payload.inventoryItemId;
    const baseTarget = this.allInventoryItems().find((item) => item.id === payload.inventoryItemId);
    const productLabel = isRestock
      ? `Ricarica ${baseTarget?.name ?? 'prodotto'} · ${Number(payload.quantity) || 0} unità`
      : `Nuovo prodotto: ${payload.name.trim() || '(senza nome)'} · q.ta ${Number(payload.quantity) || 0}`;
    const costLabel = `Costo u. € ${(Number(payload.unitCost) || 0).toFixed(2)} · Totale: € ${(((Number(payload.unitCost) || 0) * (Number(payload.quantity) || 0)) + (Number(payload.transportCost) || 0) + (Number(payload.customsCost) || 0) + (Number(payload.packagingCost) || 0)).toFixed(2)}`;
    const msg = [
      '⚠️ CARICO MAGAZZINO DEFINITIVO.',
      '',
      productLabel,
      costLabel,
      payload.supplier ? `Fornitore: ${payload.supplier}` : '',
      payload.purchaseDocumentNumber ? `Doc.: ${payload.purchaseDocumentNumber}` : '',
      this.isWarehouseExpenseMode() ? 'Modalità: registra anche come spesa di acquisto.' : '',
      '',
      'Verranno creati uno o più movimenti, i lotti e (se attivo) la registrazione contabile di spesa.',
      '',
      'Confermi il salvataggio?',
    ].filter(Boolean).join('\n');
    const ok = typeof window !== 'undefined' ? window.confirm(msg) : true;
    if (!ok) {
      this.pushToast('Carico annullato · nessun movimento scritto.', 'success');
      return;
    }

    let resolvedCategory = payload.category.trim();
    if (resolvedCategory === '__new__') {
      const fresh = (payload.newCategory ?? '').trim();
      if (!fresh) {
        this.warehouseReceiptForm.controls.newCategory.setErrors({ required: true });
        this.warehouseReceiptForm.markAllAsTouched();
        this.pushToast('Indica il nome della nuova categoria prodotto.', 'error');
        return;
      }
      this.data.addProductCategory(fresh);
      resolvedCategory = fresh;
    }

    const resolvedCabling = this.normalizeWarehouseReceiptPayload(payload, resolvedCategory);

    if (!resolvedCabling) {
      return;
    }

    try {
      if (this.isWarehouseExpenseMode()) {
        this.createStoreSupplyExpense(payload, resolvedCategory);
        this.pushToast('Prodotto uso negozio registrato come spesa di acquisto.', 'success');
      } else {
        // ✅ Fix ISS-08: passa il flag della checkbox UI.
        const syncPrices = !!this.warehouseReceiptForm.get('syncCashPrices')?.value;
        this.data.receiveWarehouseStock({
          ...payload,
          inventoryItemId: payload.inventoryItemId || null,
          category: resolvedCategory,
          unitOfMeasure: resolvedCabling.unitOfMeasure,
          quantity: resolvedCabling.quantity,
          cableRolls: resolvedCabling.cableRolls,
          cableMetersPerRoll: resolvedCabling.cableMetersPerRoll,
          unitCost: Number(payload.unitCost) || 0,
          salePrice: Number(payload.salePrice) || 0,
          minStock: Number(payload.minStock) || 0,
          transportCost: Number(payload.transportCost) || 0,
          customsCost: Number(payload.customsCost) || 0,
          packagingCost: Number(payload.packagingCost) || 0,
          expiryDate: payload.expiryDate || null,
        }, syncPrices);
        this.pushToast(
          payload.usageType === 'uso-negozio'
            ? 'Prodotto uso negozio registrato in inventario.'
            : 'Carico magazzino registrato.',
          'success',
        );
      }
      this.clearFormDraft('warehouse');
      if (!createAnother) {
        this.warehouseModalOpen.set(false);
      }
    } catch {
      this.pushToast('Errore durante il salvataggio del prodotto.', 'error');
      return;
    }

    // "Salva e crea nuovo": resta nel modale e azzera solo i campi del prodotto
    // mantenendo i dati condivisi (fornitore, categoria, data, operatore, scaffale).
    if (createAnother) {
      this.prepareWarehouseReceiptForNextProduct();
      this.pushToast('Prodotto salvato · pronto per il prossimo carico.', 'success');
      return;
    }

    if (this.isWarehouseExpenseMode()) {
      this.resetWarehouseForm();
      return;
    }

    const receivedItem =
      this.allInventoryItems().find((item) => item.id === payload.inventoryItemId) ??
      this.allInventoryItems().find((item) => item.sku === payload.sku) ??
      null;

    if (receivedItem) {
      this.selectedInventoryId.set(receivedItem.id);
      this.warehouseAdjustmentForm.patchValue({
        inventoryItemId: receivedItem.id,
        actualQuantity: receivedItem.stock,
      });
    }

    this.warehouseReceiptForm.patchValue({
      inventoryItemId: payload.inventoryItemId || '',
      quantity: 0,
      cableRolls: 0,
      cableMetersPerRoll: receivedItem?.cableMetersPerRoll ?? 0,
      unitCost: 0,
      salePrice: receivedItem?.salePrice ?? (Number(payload.salePrice) || 0),
      transportCost: 0,
      customsCost: 0,
      packagingCost: 0,
      lotNumber: '',
      purchaseDocumentNumber: '',
      expiryDate: '',
      receivedDate: new Date().toISOString().slice(0, 10),
    });
  }

  /**
   * Azzera i soli campi del prodotto per iniziare un nuovo carico,
   * conservando i dati condivisi dell'ultimo salvataggio.
   */
  private prepareWarehouseReceiptForNextProduct(): void {
    const keep = this.warehouseReceiptForm.getRawValue();
    this.warehouseReceiptMode.set('new');
    this.warehouseReceiptTargetId.set(null);
    this.runWithoutDraftSync('warehouse', () => {
      this.warehouseReceiptForm.reset({
        // Campi condivisi mantenuti
        category: keep.category,
        newCategory: '',
        usageType: keep.usageType,
        registrationMode: keep.registrationMode,
        unitOfMeasure: keep.unitOfMeasure,
        supplier: keep.supplier,
        receivedDate: keep.receivedDate,
        shelfCode: keep.shelfCode,
        minStock: keep.minStock,
        operator: keep.operator,
        syncCashPrices: false,
        // Campi del prodotto azzerati
        inventoryItemId: '',
        sku: '',
        barcode: '',
        name: '',
        description: '',
        quantity: 0,
        cableRolls: 0,
        cableMetersPerRoll: 0,
        unitCost: 0,
        salePrice: 0,
        lotNumber: '',
        expiryDate: '',
        purchaseDocumentNumber: '',
        transportCost: 0,
        customsCost: 0,
        packagingCost: 0,
      });
    });
    this.syncWarehouseReceiptCategoryState();
  }

  protected applyInventoryAdjustment(): void {
    if (this.warehouseAdjustmentForm.invalid) {
      this.warehouseAdjustmentForm.markAllAsTouched();
      return;
    }

    const payload = this.warehouseAdjustmentForm.getRawValue();

    // ===== CONFERMA OBBLIGATORIA RETTIFICA GIACENZA =====
    // Modificare la quantità reale scrive un movimento permanente nel registro:
    // chiediamo conferma all'utente per evitare rettifiche sbagliate (es. inventario errato).
    const target = this.allInventoryItems().find((item) => item.id === payload.inventoryItemId);
    const itemLabel = target ? `${target.name} · attuali ${target.stock}` : 'questo articolo';
    const actualQty = Number(payload.actualQuantity) || 0;
    const delta = target ? actualQty - target.stock : actualQty;
    const deltaLabel = delta >= 0 ? `+${delta}` : `${delta}`;
    const msg = [
      '⚠️ RETTIFICA PERMANENTE GIACENZA.',
      '',
      `Imposta "${itemLabel}" a ${actualQty} unità (diff: ${deltaLabel}).`,
      payload.reason ? `Causale dichiarata: ${payload.reason}` : '',
      '',
      'Questa operazione scrive un movimento nel registro e NON è reversibile senza una nuova rettifica.',
      '',
      'Confermi?',
    ].filter(Boolean).join('\n');
    const ok = typeof window !== 'undefined' ? window.confirm(msg) : true;
    if (!ok) {
      this.pushToast('Rettifica annullata · giacenza NON modificata.', 'success');
      return;
    }

    this.data.adjustInventoryQuantity({
      inventoryItemId: payload.inventoryItemId,
      actualQuantity: Number(payload.actualQuantity) || 0,
      reason: payload.reason,
      operator: payload.operator,
    });

    this.warehouseAdjustmentForm.patchValue({
      reason: '',
    });
  }

  protected addExpense(): void {
    if (this.expenseForm.invalid) {
      this.expenseForm.markAllAsTouched();
      return;
    }

    const payload = this.expenseForm.getRawValue();
    // ⭐ Calcolo finale Netto / IVA (stessi valori della preview live)
    // Valori arrotondati a 2 decimali: usati come source of truth nel record.
    const netFinal = Number(this.expenseFormNetPreview().toFixed(2));
    const vatFinal = Number(this.expenseFormVatPreview().toFixed(2));
    // Gross finale = Netto + IVA (corregge eventuali 0.01 derivanti da scorporo classico)
    const grossFinal = Number((netFinal + vatFinal).toFixed(2));
    const gross =
      Math.abs(grossFinal - (Number(payload.amountGross) || 0)) > 0.02
        ? Number(payload.amountGross || 0)
        : grossFinal;

    const recurringFrequency =
      payload.paymentMode === 'ricorrente' ? payload.recurringFrequency : null;

    const baseValues = {
      description: payload.description,
      categoryId: payload.categoryId,
      supplierId: payload.supplierId || null,
      genericSupplierLabel: payload.genericSupplierLabel || null,
      paymentMode: payload.paymentMode,
      recurringFrequency,
      paymentMethodId: payload.paymentMethodId,
      amountGross: gross,
      vatRate: Number(payload.vatRate) || 0,
      amountNet: netFinal,
      amountVat: vatFinal,
      expenseDate: payload.expenseDate,
      dueDate: payload.dueDate,
      notes: payload.notes,
      attachmentName: payload.attachmentName || null,
      projectCode: payload.projectCode || null,
      costCenterCode: payload.costCenterCode || null,
      // ⭐ 3 flag metodo IVA
      amountAlreadyIvato: Boolean(payload.amountAlreadyIvato),
      amountSplitVat: Boolean(payload.amountSplitVat),
      amountIsReverseCharge: Boolean(payload.amountIsReverseCharge),
      // ⭐ Provider pagamento + manuale/automatico (SEMPRE modificabile post save)
      // Cast: paymentProviderId può essere '' (empty string) → null, oppure id valido.
      // @ts-ignore - paymentProviderId FC tipizzato con as never per aggirare strict iniziale
      paymentProviderId: (payload.paymentProviderId as string | null | '')
        ? (payload.paymentProviderId as string) || null
        : null,
      paymentExecution: (payload.paymentExecution || 'manuale') as PaymentExecutionMode,
      paymentAutoStartDate:
        payload.paymentExecution === 'automatico' ? (payload.paymentAutoStartDate || payload.dueDate) : null,
      paymentNotes: payload.paymentNotes || null,
    };

    const editingId = this.expenseEditingId();
    try {
      if (editingId) {
        // ==== UPDATE (modalità modifica post save) ====
        this.data.updateExpense(editingId, {
          ...baseValues,
        });
        this.pushToast('Spesa aggiornata. Le impostazioni di pagamento sono state salvate.', 'success');
      } else {
        // ==== CREATE (nuova spesa) ====
        this.data.createExpense({
          ...baseValues,
          createdBy: payload.createdBy,
          sourceType: 'manuale',
          sourceReferenceId: null,
          installmentsCount: Number(payload.installmentsCount) || 1,
          noticeDaysBefore: Number(payload.noticeDaysBefore) || 7,
          amountNetFinal: netFinal,
          amountVatFinal: vatFinal,
        });
        this.pushToast('Spesa registrata con successo.', 'success');
      }
      this.clearFormDraft('expense');
      this.expenseEditingId.set(null);
      this.expenseModalOpen.set(false);
    } catch {
      this.pushToast(
        editingId
          ? 'Errore durante l\'aggiornamento della spesa.'
          : 'Errore durante il salvataggio della spesa.',
        'error',
      );
      return;
    }

    this.resetExpenseForm();
  }

  protected addExpenseSupplier(): void {
    if (this.expenseSupplierForm.invalid) {
      this.expenseSupplierForm.markAllAsTouched();
      return;
    }

    const payload = this.expenseSupplierForm.getRawValue();
    const created = this.data.addExpenseSupplier(payload);
    this.expenseSupplierForm.patchValue({
      businessName: '',
      vatNumber: '',
      address: '',
      contactName: '',
      email: '',
      phone: '',
      supplyType: '',
      active: true,
    });

    // ⭐ Auto-selezione nuovo fornitore nella spesa CORRENTE
    // (se utente ha creato il fornitore partendo dal popup "Nuova spesa").
    // Alla chiusura del tab fornitore o della modale inline il combo fornitore
    // avrà già il nuovo valore selezionato (nessuna "Utenza generica" dopo save).
    if (created && this.expenseModalOpen()) {
      this.runWithoutDraftSync('expense', () => {
        this.expenseForm.patchValue({ supplierId: created.id });
      });
      this.pushToast(
        `Fornitore "${created.businessName}" creato e selezionato automaticamente nella spesa.`,
        'success',
      );
    }
  }

  protected markInstallmentAsPaid(installmentId: string): void {
    this.data.markExpenseInstallmentPaid(installmentId, 'Amministrazione');
  }

  protected setExpenseUserRole(role: 'admin' | 'finance' | 'operations' | 'viewer'): void {
    this.data.setCurrentUserRole(role);
  }

  protected runExpenseReminderSweep(): void {
    const today = new Date().toISOString().slice(0, 10);
    const existingCount = this.allExpenseNotifications().length;
    this.data.runExpenseReminderSweep(today);
    const generated = this.allExpenseNotifications().length - existingCount;

    if (
      generated > 0 &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      new Notification(`Promemoria spese`, {
        body: `Generate ${generated} notifiche pagamento`,
      });
    }
  }

  protected requestExpenseBrowserNotifications(): void {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }

  protected markExpenseNotificationRead(notificationId: string): void {
    this.data.markExpenseNotificationRead(notificationId);
  }

  protected exportExpensesCsv(): void {
    const rows = [
      [
        'ID',
        'Descrizione',
        'Data',
        'Categoria',
        'Fornitore',
        'Pagamento',
        'Stato',
        'Importo Lordo',
        'Imponibile',
        'IVA',
      ],
      ...this.filteredExpenseRecords().map((expense) => [
        expense.id,
        expense.description,
        expense.expenseDate,
        expense.categoryLabel,
        expense.supplierLabel,
        expense.paymentMode,
        expense.status,
        expense.amountGross.toFixed(2),
        expense.amountNet.toFixed(2),
        expense.amountVat.toFixed(2),
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((field) => `"${String(field).replaceAll('"', '""')}"`)
          .join(';'),
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `registro-spese-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected exportExpensesPdf(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const printableRows = this.filteredExpenseRecords()
      .map(
        (expense) =>
          `<tr><td>${expense.expenseDate}</td><td>${expense.description}</td><td>${expense.categoryLabel}</td><td>${expense.supplierLabel}</td><td>${expense.status}</td><td>€ ${expense.amountGross.toLocaleString('it-IT')}</td></tr>`,
      )
      .join('');
    const popup = window.open('', '_blank', 'width=1080,height=720');

    if (!popup) {
      return;
    }

    popup.document.write(
      `<html><head><title>Registro Spese</title><style>body{font-family:Arial;padding:24px;color:#0f172a}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}th{background:#f1f5f9}</style></head><body><h1>Registro Spese</h1><p>Data export: ${new Date().toLocaleString('it-IT')}</p><table><thead><tr><th>Data</th><th>Descrizione</th><th>Categoria</th><th>Fornitore</th><th>Stato</th><th>Importo</th></tr></thead><tbody>${printableRows}</tbody></table></body></html>`,
    );
    popup.document.close();
    popup.focus();
    setTimeout(() => {
      popup.print();
    }, 250);
  }

  protected addServiceCategory(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    this.data.addServiceCategory(trimmed);
  }

  /** Elimina una categoria servizi con conferma esplicita (le voci di listino restano invariate) */
  protected removeServiceCategory(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const confirmed = window.confirm(
      `Eliminare la categoria "${trimmed}"?\n\nI servizi già associati restano nel listino, ma la categoria non sarà più disponibile per i nuovi inserimenti.`,
    );
    if (!confirmed) {
      return;
    }
    this.data.removeServiceCategory(trimmed);
    if (this.cashCategoryFilter() === trimmed) {
      this.cashCategoryFilter.set('tutte');
    }
  }

  protected addProductCategory(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    this.data.addProductCategory(trimmed);
  }

  protected addCashProduct(createAnother = false): void {
    if (this.cashProductForm.invalid) {
      this.cashProductForm.markAllAsTouched();
      return;
    }

    const isEditing = Boolean(this.editingCashProductId());
    const payload = this.cashProductForm.getRawValue();
    let resolvedCategory = payload.category.trim();
    if (resolvedCategory === '__new__') {
      const fresh = (payload.newCategory ?? '').trim();
      if (!fresh) {
        this.cashProductForm.controls.newCategory.setErrors({ required: true });
        this.cashProductForm.markAllAsTouched();
        this.pushToast('Indica il nome della nuova categoria.', 'error');
        return;
      }
      this.data.addServiceCategory(fresh);
      resolvedCategory = fresh;
    }
    const linkedInventoryItem = payload.linkedInventoryItemId
      ? this.allInventoryItems().find((item) => item.id === payload.linkedInventoryItemId) ?? null
      : null;
    const normalizedRecord: CashRegisterProductRecord = {
      id: this.editingCashProductId() ?? `cash-prod-${crypto.randomUUID()}`,
      name: payload.name.trim(),
      category: resolvedCategory || 'Servizi audio',
      price: linkedInventoryItem ? linkedInventoryItem.salePrice : Math.max(0, Number(payload.price) || 0),
      shortcut: Boolean(payload.shortcut),
      pricingMode: payload.pricingMode,
      linkedInventoryItemId: payload.linkedInventoryItemId || null,
    };

    try {
      if (this.editingCashProductId()) {
        this.data.updateCashProduct(normalizedRecord);
      } else {
        this.data.addCashProduct({
          name: normalizedRecord.name,
          category: normalizedRecord.category,
          price: normalizedRecord.price,
          shortcut: normalizedRecord.shortcut,
          pricingMode: normalizedRecord.pricingMode,
          linkedInventoryItemId: normalizedRecord.linkedInventoryItemId,
        });
      }
      this.clearFormDraft('service');
    } catch {
      this.pushToast('Errore durante il salvataggio del servizio.', 'error');
      return;
    }

    // Salvataggio in serie: la modale resta aperta e conserva la categoria,
    // così il catalogo si popola senza riaprire ogni volta la finestra.
    if (createAnother && !isEditing) {
      this.resetCashProductForm();
      this.cashProductForm.controls.category.setValue(resolvedCategory || 'Servizi audio');
      this.pushToast('Servizio salvato. Inserisci il prossimo.', 'success');
      return;
    }

    this.pushToast('Servizio salvato correttamente.', 'success');
    this.resetCashProductForm();
    this.serviceModalOpen.set(false);
  }

  protected editCashProduct(id: string): void {
    const product = this.allCashProducts().find((entry) => entry.id === id);

    if (!product) {
      return;
    }

    this.editingCashProductId.set(product.id);
    if (product.category && !this.cashCategories().includes(product.category)) {
      this.data.addServiceCategory(product.category);
    }
    this.cashProductForm.patchValue({
      name: product.name,
      category: product.category,
      newCategory: '',
      price: product.price,
      shortcut: product.shortcut,
      pricingMode: product.pricingMode,
      linkedInventoryItemId: product.linkedInventoryItemId ?? '',
    });
    this.selectedCashProductId.set(product.id);
    this.serviceModalOpen.set(true);
    this.closeServiceMenu();
  }

  protected duplicateCashProduct(id: string): void {
    const product = this.allCashProducts().find((entry) => entry.id === id);

    if (!product) {
      return;
    }

    this.data.addCashProduct({
      name: `${product.name} (copia)`,
      category: product.category,
      price: product.price,
      shortcut: false,
      pricingMode: product.pricingMode,
      linkedInventoryItemId: product.linkedInventoryItemId,
    });
    this.closeServiceMenu();
  }

  protected toggleServiceMenu(id: string): void {
    this.serviceMenuOpenId.set(this.serviceMenuOpenId() === id ? null : id);
  }

  protected closeServiceMenu(): void {
    this.serviceMenuOpenId.set(null);
  }

  protected toggleServiceRow(id: string): void {
    const nextValue = this.serviceMenuOpenId() === id ? null : id;
    this.serviceMenuOpenId.set(nextValue);
    this.selectedCashProductId.set(id);
  }

  protected isServiceRowExpanded(id: string): boolean {
    return this.serviceMenuOpenId() === id;
  }

  protected addCashOperator(): void {
    if (this.cashOperatorForm.invalid) {
      this.cashOperatorForm.markAllAsTouched();
      return;
    }

    const payload = this.cashOperatorForm.getRawValue();
    this.data.addCashOperator({
      ...payload,
      jobTitle: payload.jobTitle.trim() || payload.role,
      contractHoursWeekly:
        payload.employmentType === 'titolare' ? 0 : Math.max(0, Number(payload.contractHoursWeekly) || 40),
      shiftPatterns: [{ lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' }],
      shiftCycleStartDate: this.toIsoDate(new Date()),
      defaultWeeklyShift: { lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' },
      // ✅ EP v2 campi portale (default)
      epPortalEnabled: false,
      epPortalUsername: null,
      epPortalPasswordHash: null,
      epPortalAccessRevokedAt: null,
      epPortalLastLoginAt: null,
    });

    if (!this.cashOperators().length || this.cashCurrentOperator() === 'Banco') {
      this.cashCurrentOperator.set(payload.name);
    }

    this.cashOperatorForm.reset({
      name: '',
      role: 'vendita',
      active: true,
      employmentType: 'dipendente',
      jobTitle: '',
      contractHoursWeekly: 40,
    });
    this.pushToast('Dipendente aggiunto con successo', 'success');
    this.closeEmployeeModal();
  }

  protected removeCashProduct(id: string): void {
    // Conferma esplicita prima di eliminare una voce dal listino (regola operativa di sicurezza)
    const product = this.allCashProducts().find((entry) => entry.id === id);
    const confirmed = window.confirm(
      `Eliminare la voce di listino "${product?.name ?? id}"?\n\nL'operazione non è reversibile.`,
    );
    if (!confirmed) {
      return;
    }

    this.data.deleteCashProduct(id);

    if (this.selectedCashProductId() === id) {
      this.selectedCashProductId.set(null);
    }

    if (this.editingCashProductId() === id) {
      this.resetCashProductForm();
    }

    this.closeServiceMenu();
  }

  protected addServiceTicket(): void {
    this.persistServiceTicket();
  }

  protected saveServiceTicketAndGoToCash(): void {
    const savedTicketId = this.persistServiceTicket();
    if (!savedTicketId) {
      return;
    }

    this.openTicketInCash(savedTicketId);
  }

  private persistServiceTicket(): string | null {
    if (this.ticketForm.invalid) {
      this.ticketForm.markAllAsTouched();
      return null;
    }

    const payload = this.ticketForm.getRawValue();
    const existingTicket = this.selectedServiceTicket();
    const now = new Date().toISOString();
    const normalizedPayload: Omit<ServiceTicketRecord, 'id' | 'createdAt'> = {
      ...payload,
      insertedAt: payload.insertedAt || now.slice(0, 10),
      linkedQuoteId: payload.linkedQuoteId || null,
      linkedAppointmentId: payload.linkedAppointmentId || null,
      materialCost: Number(payload.materialCost) || 0,
      notes: payload.notes.trim(),
      materialLines: existingTicket?.materialLines ?? [],
      updatedAt: now,
      closedAt:
        payload.status === 'chiuso'
          ? existingTicket?.closedAt ?? now
          : null,
    };

    let savedTicketId: string | null = null;

    if (this.editingTicketId()) {
      this.data.updateServiceTicket({
        id: this.editingTicketId()!,
        createdAt: existingTicket?.createdAt ?? now,
        ...normalizedPayload,
      });
      this.selectedTicketId.set(this.editingTicketId());
      savedTicketId = this.editingTicketId();
    } else {
      const createdTicket = this.data.addServiceTicket(normalizedPayload);
      this.selectedTicketId.set(createdTicket.id);
      savedTicketId = createdTicket.id;
    }

    this.clearFormDraft('ticket');
    this.resetTicketForm();
    this.ticketModalOpen.set(false);
    return savedTicketId;
  }

  protected openClientModal(): void {
    const segment = this.contactsSegment();
    const defaultKind = segment === 'fornitori' ? 'fornitore' : segment === 'aziende' ? 'azienda' : 'cliente';
    this.openContactModal(defaultKind);
  }

  protected openContactModal(kind: 'cliente' | 'azienda' | 'fornitore'): void {
    this.contactModalKind.set(kind);
    this.cashPrivacyDispatchChannel.set('whatsapp');
    this.cashPrivacyNoticeAcknowledged.set(false);
    this.cashPrivacyEmailMarketing.set(false);
    this.cashPrivacyWhatsappMarketing.set(false);
    this.cashPrivacyFidelityProfiling.set(false);

    if (kind === 'fornitore') {
      this.expenseSupplierForm.reset({
        businessName: '',
        vatNumber: '',
        address: '',
        contactName: '',
        email: '',
        phone: '',
        supplyType: '',
        active: true,
      });
      // ⭐ AUTO-HANDOFF: se l'utente sta creando un fornitore DAL POPUP NUOVA SPESA,
      // prendiamo snapshot del form spesa. Alla fine della creazione del fornitore
      // (saveContact L5590 oggi già chiama applyExpenseSupplierHandoff) il nuovo
      // fornitore verrà auto-selezionato nel combo supplierId della spesa.
      if (this.expenseModalOpen()) {
        this.expenseSupplierHandoff.set({
          active: true,
          draft: { ...this.expenseForm.getRawValue() },
        });
      }
      this.clientModalOpen.set(true);
      return;
    }

    this.resetClientForm();
    this.clientForm.patchValue({
      kind: kind === 'azienda' ? 'azienda' : 'privato',
    });
    this.restoreFormDraft('client', this.clientForm);
    this.clientModalOpen.set(true);
  }

  protected setContactsSegment(segment: 'clienti' | 'aziende' | 'fornitori'): void {
    this.contactsSegment.set(segment);
    this.clientQuery.set('');
    this.selectedClientId.set(null);
    this.selectedSupplierId.set(null);
  }

  protected updateContactModalKind(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    const value = (target?.value as 'cliente' | 'azienda' | 'fornitore' | undefined) ?? 'cliente';
    this.openContactModal(value);
  }

  protected closeClientModal(): void {
    this.clientModalOpen.set(false);

    const ticketHandoff = this.ticketClientHandoff();
    if (ticketHandoff.active && ticketHandoff.draft) {
      this.ticketForm.reset(ticketHandoff.draft);
      this.ticketClientLookup.set(
        typeof ticketHandoff.draft.customerName === 'string' ? ticketHandoff.draft.customerName : '',
      );
      this.ticketClientHandoff.set({ active: false, draft: null });
      this.ticketModalOpen.set(true);
      return;
    }

    const handoff = this.warehouseSupplierHandoff();
    if (handoff.active && handoff.draft) {
      this.warehouseReceiptForm.reset({
        ...handoff.draft,
        // ✅ Fix ISS-08: default OFF per sicurezza (non sovrascrive listino cassa se non esplicitato)
        syncCashPrices: (handoff.draft as { syncCashPrices?: boolean }).syncCashPrices ?? false,
      });
      this.warehouseSupplierHandoff.set({ active: false, draft: null });
      this.warehouseModalOpen.set(true);
      return;
    }

    const expenseHandoff = this.expenseSupplierHandoff();
    if (expenseHandoff.active && expenseHandoff.draft) {
      this.expenseForm.reset(expenseHandoff.draft);
      this.expenseSupplierHandoff.set({ active: false, draft: null });
      this.expenseModalOpen.set(true);
    }
  }

  protected openQuoteModal(): void {
    this.resetQuoteForm();
    this.restoreFormDraft('quote', this.quoteForm);
    this.quoteLineFreeTextIds.set(new Set());
    this.quoteModalOpen.set(true);
  }

  protected closeQuoteModal(): void {
    this.quoteModalOpen.set(false);
  }

  protected editQuote(id: string): void {
    const quote = this.allQuotes().find((item) => item.id === id);
    if (!quote) return;

    this.editingQuoteId.set(quote.id);
    this.quoteForm.patchValue({
      issueDate: quote.issueDate,
      customerName: quote.customerName,
      isAnonymous: quote.isAnonymous || false,
      discountAmount: quote.discountAmount || 0,
      customerPhone: quote.customerPhone,
      customerEmail: quote.customerEmail,
      customerAddress: quote.customerAddress,
      customerTaxId: quote.customerTaxId,
      customerPec: quote.customerPec,
      customerSdiCode: quote.customerSdiCode,
      attachmentName: quote.attachmentName || '',
      fulfillmentType: quote.fulfillmentType,
      fulfillmentAddress: quote.fulfillmentAddress,
      paymentPlan: quote.paymentPlan,
      installmentCount: quote.installmentCount,
      installmentCadence: quote.installmentCadence,
      financingProvider: quote.financingProvider,
      paymentAlertDays: quote.paymentAlertDays,
      paymentNotes: quote.paymentNotes,
      projectType: quote.projectType,
      value: quote.value,
      dueDate: quote.dueDate,
      stage: quote.stage,
      notes: quote.notes,
    });

    this.quoteDraftLines.set(quote.lines || []);

    // Imposta la modalità testo libero per le righe che non corrispondono a
    // articoli/servizi esistenti (per mostrare il valore originale nel dropdown)
    const freeTextIds = new Set<string>();
    for (const line of (quote.lines || [])) {
      if (line.kind === 'materiale') {
        const match = this.allInventoryItems().some(
          (it) => it.name.toLowerCase() === line.description.toLowerCase(),
        );
        if (!match && line.description.trim()) freeTextIds.add(line.id);
      } else if (line.kind === 'servizio') {
        const match = this.services().some(
          (s) => s.name.toLowerCase() === line.description.toLowerCase(),
        );
        if (!match && line.description.trim()) freeTextIds.add(line.id);
      } else {
        freeTextIds.add(line.id);
      }
    }
    this.quoteLineFreeTextIds.set(freeTextIds);

    this.quoteModalOpen.set(true);
  }

  protected openDdtModal(quoteId: string): void {
    const quote = this.allQuotes().find((item) => item.id === quoteId);
    if (!quote) {
      return;
    }

    this.ddtQuoteId.set(quote.id);
    this.ddtCreatedAt.set(new Date().toISOString());
    this.ddtNumber.set(this.generateDdtNumber());
    this.ddtModalOpen.set(true);
  }

  protected closeDdtModal(): void {
    this.ddtModalOpen.set(false);
    this.ddtQuoteId.set(null);
    this.ddtNumber.set('');
    this.ddtCreatedAt.set('');
  }

  protected printDdt(): void {
    const quote = this.ddtQuote();
    if (!quote) {
      return;
    }

    const deliveryAddress = (quote.fulfillmentAddress || quote.customerAddress || '').trim();
    const lines = this.ddtLines();
    const createdAt = this.ddtCreatedAt() || new Date().toISOString();
    const createdAtLabel = createdAt.slice(0, 10);
    const title = `DDT ${this.ddtNumber() || this.quoteCode(quote.id)}`;
    const rows =
      lines.length
        ? lines
          .map(
            (line) =>
              `<tr><td>${this.escapeHtml(line.description)}</td><td style="text-align:right">${line.quantity}</td></tr>`,
          )
          .join('')
        : `<tr><td colspan="2">Nessun prodotto inserito (solo servizi).</td></tr>`;

    const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${this.escapeHtml(title)}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:24px;color:#0f172a}
    h1{font-size:18px;margin:0 0 12px}
    .meta{display:flex;justify-content:space-between;gap:12px;margin-bottom:16px}
    .box{border:1px solid #cbd5e1;border-radius:12px;padding:12px;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}
    th,td{border-bottom:1px solid #e2e8f0;padding:10px 8px;font-size:13px}
    th{text-align:left;color:#334155;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
  </style>
</head>
<body>
  <div class="meta">
    <div><h1>Documento di trasporto (DDT)</h1><div>${this.escapeHtml(this.ddtNumber() || this.quoteCode(quote.id))}</div></div>
    <div style="text-align:right"><div>Data</div><strong>${this.escapeHtml(createdAtLabel)}</strong></div>
  </div>
  <div class="box">
    <div><strong>Cliente</strong></div>
    <div>${this.escapeHtml(quote.customerName)}</div>
    <div>${this.escapeHtml(deliveryAddress || 'Indirizzo non indicato')}</div>
  </div>
  <div class="box">
    <div><strong>Oggetto</strong></div>
    <div>${this.escapeHtml(quote.projectType)}</div>
  </div>
  <div class="box">
    <table>
      <thead><tr><th>Articolo</th><th style="text-align:right">Qta</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</body>
</html>`;

    const opened = window.open('', '_blank', 'noopener,noreferrer');
    if (!opened) {
      this.pushToast('Popup bloccato dal browser: impossibile aprire la stampa DDT.', 'error');
      return;
    }

    opened.document.open();
    opened.document.write(html);
    opened.document.close();
    opened.focus();
    setTimeout(() => {
      opened.print();
    }, 250);
  }

  protected openAppointmentModal(): void {
    this.resetAppointmentForm();
    this.restoreFormDraft('appointment', this.appointmentForm);
    this.appointmentModalOpen.set(true);
  }

  protected openAppointmentModalForDate(
    isoDate: string,
    presetType: AppointmentRecord['appointmentType'] = 'negozio',
    hour: number = 9
  ): void {
    this.resetAppointmentForm();
    const formattedHour = hour.toString().padStart(2, '0');
    this.appointmentForm.patchValue({
      appointmentType: presetType,
      locationType: presetType === 'negozio' ? 'showroom' : 'domicilio',
      scheduledAt: `${isoDate}T${formattedHour}:00`,
      durationMinutes: 60,
      status: 'programmato',
    });
    this.restoreFormDraft('appointment', this.appointmentForm);
    this.appointmentModalOpen.set(true);
  }

  protected canAdvancePipelineQuote(stage: QuoteRecord['stage']): boolean {
    return stage !== 'ordine' && stage !== 'confermato';
  }

  protected canGenerateDdt(quote: QuoteRecord): boolean {
    return (
      (quote.stage === 'ordine' || quote.stage === 'confermato') &&
      quote.fulfillmentType === 'esterno'
    );
  }

  protected isCashWalkInWithoutSelectedClient(): boolean {
    return this.cashCustomerMode() === 'walk-in' && !this.selectedCashClient();
  }

  protected closeAppointmentModal(): void {
    this.appointmentModalOpen.set(false);
  }

  protected selectedAppointmentOperators(): string[] {
    // ✅ Fix ISS-01: legge dal signal dedicato selectedTechnicians
    // invece che da appointmentForm.value.technician (ora stringa semplice).
    return this.selectedTechnicians().filter(Boolean);
  }

  protected toggleAppointmentOperator(operator: string): void {
    const current = this.selectedTechnicians();
    const index = current.indexOf(operator);
    let next: string[];
    if (index === -1) {
      next = [...current, operator];
    } else {
      next = current.filter((item) => item !== operator);
    }
    this.selectedTechnicians.set(next);
    // ✅ Sync bidirezionale: scrive nel FormControl<string> del form
    this.appointmentForm.patchValue({ technician: next.join(', ') });
  }

  protected selectAppointmentType(type: AppointmentRecord['appointmentType']): void {
    const locationType =
      type === 'negozio' ? 'showroom' : type === 'installazione' || type === 'uscita' || type === 'sopralluogo'
        ? 'domicilio'
        : this.appointmentForm.value.locationType || 'showroom';
    this.appointmentForm.patchValue({ appointmentType: type, locationType });
  }

  protected isAppointmentTypeSelected(type: AppointmentRecord['appointmentType']): boolean {
    return this.appointmentForm.value.appointmentType === type;
  }

  protected setAppointmentQuickSlot(time: string): void {
    const currentValue = this.appointmentForm.value.scheduledAt;
    const baseDate = currentValue?.slice(0, 10) || this.agendaCurrentDate();
    this.appointmentForm.patchValue({ scheduledAt: `${baseDate}T${time}` });
  }

  protected shiftAppointmentDate(days: number): void {
    const currentValue = this.appointmentForm.value.scheduledAt;
    const baseValue = currentValue || `${this.agendaCurrentDate()}T09:00`;
    const [datePart, timePart = '09:00'] = baseValue.split('T');
    const date = new Date(`${datePart}T12:00:00`);
    if (Number.isNaN(date.getTime())) {
      return;
    }
    date.setDate(date.getDate() + days);
    const isoDate = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
    this.appointmentForm.patchValue({ scheduledAt: `${isoDate}T${timePart.slice(0, 5)}` });
  }

  protected setAppointmentDay(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const value = target?.value;
    if (!value) {
      return;
    }
    const currentValue = this.appointmentForm.value.scheduledAt;
    const timePart = currentValue?.slice(11, 16) || '09:00';
    this.appointmentForm.patchValue({ scheduledAt: `${value}T${timePart}` });
  }

  protected isAppointmentQuickSlotSelected(time: string): boolean {
    return this.appointmentForm.value.scheduledAt?.slice(11, 16) === time;
  }

  protected setAppointmentDuration(minutes: number): void {
    this.appointmentForm.patchValue({ durationMinutes: minutes });
  }

  protected isAppointmentDurationSelected(minutes: number): boolean {
    return Number(this.appointmentForm.value.durationMinutes) === minutes;
  }

  protected isExternalAppointmentLocation(): boolean {
    const location = this.appointmentForm.value.locationType;
    return location === 'domicilio';
  }

  protected appointmentScheduledDate(): string {
    return this.appointmentForm.value.scheduledAt?.slice(0, 10) || this.agendaCurrentDate();
  }

  protected appointmentLocationLabel(): string {
    const location = this.appointmentForm.value.locationType;
    switch (location) {
      case 'showroom':
        return 'Showroom';
      case 'domicilio':
        return 'Esterno';
      case 'officina':
        return 'Laboratorio';
      default:
        return 'Da definire';
    }
  }

  protected appointmentStatusLabel(): string {
    const status = this.appointmentForm.value.status;
    switch (status) {
      case 'programmato':
        return 'Programmato';
      case 'in-corso':
        return 'In corso';
      case 'chiuso':
        return 'Chiuso';
      default:
        return 'Bozza';
    }
  }

  protected appointmentScheduledSummary(): string {
    const value = this.appointmentForm.value.scheduledAt;
    if (!value) {
      return 'Data da definire';
    }
    const [datePart, timePart = ''] = value.split('T');
    const [year, month, day] = datePart.split('-');
    return `${day}/${month}/${year} ${timePart.slice(0, 5)}`;
  }

  protected appointmentsForDraftDate(): AppointmentRecord[] {
    const value = this.appointmentForm.value.scheduledAt;
    const isoDate = value?.slice(0, 10);
    if (!isoDate) {
      return [];
    }
    return [...this.allAppointments()]
      .filter((item) => item.scheduledAt.slice(0, 10) === isoDate)
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
  }

  protected applyAppointmentLinkedQuote(quoteId: string): void {
    const quote = this.allQuotes().find((item) => item.id === quoteId) ?? null;
    if (!quote) {
      return;
    }
    const currentTitle = this.appointmentForm.controls.title.value.trim();
    const currentAddress = this.appointmentForm.controls.address.value.trim();
    const resolvedAddress = quote.fulfillmentAddress?.trim() || quote.customerAddress?.trim() || '';
    this.appointmentForm.patchValue({
      customerName: quote.customerName,
      title: currentTitle || quote.projectType,
      address: currentAddress || resolvedAddress,
    });
  }

  protected openMap(provider: 'google' | 'apple' | 'waze'): void {
    const address = this.appointmentForm.value.address;
    if (!address) return;
    const query = encodeURIComponent(address);
    let url = '';
    if (provider === 'google') url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    if (provider === 'apple') url = `http://maps.apple.com/?q=${query}`;
    if (provider === 'waze') url = `https://waze.com/ul?q=${query}`;
    if (url) window.open(url, '_blank');
  }

  protected openTicketModal(): void {
    this.ticketDetailModalOpen.set(false);
    this.resetTicketForm();
    this.restoreFormDraft('ticket', this.ticketForm);
    this.ticketClientLookup.set(this.ticketForm.controls.customerName.value);
    this.ticketModalOpen.set(true);
  }

  protected closeTicketModal(): void {
    this.ticketModalOpen.set(false);
    this.ticketClientHandoff.set({ active: false, draft: null });
  }

  protected openSupplierFromExpense(): void {
    this.expenseSupplierHandoff.set({
      active: true,
      draft: this.expenseForm.getRawValue(),
    });
    this.expenseModalOpen.set(false);
    this.openContactModal('fornitore');
  }

  protected openExpenseModal(): void {
    // Reset modalità editing (apertura standard = nuova spesa)
    this.expenseEditingId.set(null);
    this.resetExpenseForm();
    this.restoreFormDraft('expense', this.expenseForm);
    this.expenseModalOpen.set(true);
  }

  // ⭐ Apre popup in MODALITÀ MODIFICA (edit post save della spesa)
  // Tutti i campi pagamento sono modificabili in questo modo come richiesto
  // (es. fermare pagamento automatico dopo N mesi, cambiare provider, switch a manuale).
  protected openEditExpense(expenseId: string): void {
    const existing = this.data.expenseRecords().find((r) => r.id === expenseId);
    if (!existing) return;
    this.expenseEditingId.set(expenseId);
    this.runWithoutDraftSync('expense', () => {
      this.expenseForm.reset({
        description: existing.description ?? '',
        amountGross: existing.amountGross ?? 0,
        vatRate: existing.vatRate ?? 22,
        amountAlreadyIvato: Boolean(existing.amountAlreadyIvato ?? true),
        amountSplitVat: Boolean(existing.amountSplitVat ?? true),
        amountIsReverseCharge: Boolean(existing.amountIsReverseCharge ?? false),
        expenseDate: existing.expenseDate ?? new Date().toISOString().slice(0, 10),
        dueDate: existing.dueDate ?? new Date().toISOString().slice(0, 10),
        categoryId: existing.categoryId ?? '',
        supplierId: existing.supplierId ?? '',
        genericSupplierLabel: existing.genericSupplierLabel ?? '',
        paymentMode: existing.paymentMode ?? 'singolo',
        recurringFrequency: existing.recurringFrequency ?? null,
        paymentMethodId: existing.paymentMethodId ?? '',
        // Campi pagamento integrato (sempre modificabili post save)
        paymentProviderId: existing.paymentProviderId ?? '',
        paymentExecution: existing.paymentExecution ?? 'manuale',
        paymentAutoStartDate:
          existing.paymentAutoStartDate ?? existing.dueDate ?? new Date().toISOString().slice(0, 10),
        paymentNotes: existing.paymentNotes ?? '',
        installmentsCount: 1,
        noticeDaysBefore: 7,
        notes: existing.notes ?? '',
        attachmentName: existing.attachmentName ?? '',
        projectCode: existing.projectCode ?? '',
        costCenterCode: existing.costCenterCode ?? '',
        createdBy: existing.createdBy ?? 'Amministrazione',
      });
    });
    this.expenseModalOpen.set(true);
  }

  protected closeExpenseModal(): void {
    this.expenseModalOpen.set(false);
  }

  protected openWarehouseModal(): void {
    this.resetWarehouseForm('new');
    this.restoreFormDraft('warehouse', this.warehouseReceiptForm);
    this.warehouseModalOpen.set(true);
  }

  protected openWarehouseRestockModal(id: string): void {
    const item = this.allInventoryItems().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    this.resetWarehouseForm('restock');
    this.warehouseReceiptTargetId.set(item.id);
    this.warehouseReceiptForm.patchValue({
      inventoryItemId: item.id,
      sku: item.sku,
      barcode: '',
      name: item.name,
      category: item.category,
      usageType: item.usageType,
      registrationMode: 'inventario',
      unitOfMeasure: this.isWarehouseCablingCategory(item.category) ? 'm' : 'pz',
      cableRolls: 0,
      cableMetersPerRoll: item.cableMetersPerRoll ?? 0,
      unitCost: item.unitCost,
      salePrice: item.salePrice,
      supplier: item.supplier,
      shelfCode: item.location,
      minStock: item.minStock,
      purchaseDocumentNumber: `RIC-${today.replaceAll('-', '')}`,
    });
    this.syncWarehouseReceiptCategoryState();
    this.warehouseModalOpen.set(true);
  }

  protected closeWarehouseModal(): void {
    this.warehouseModalOpen.set(false);
  }

  protected openSupplierFromWarehouse(): void {
    this.warehouseSupplierHandoff.set({
      active: true,
      draft: this.warehouseReceiptForm.getRawValue(),
    });
    this.warehouseModalOpen.set(false);
    this.openContactModal('fornitore');
  }

  private applyWarehouseSupplierHandoff(supplier: ExpenseSupplierRecord): void {
    const handoff = this.warehouseSupplierHandoff();
    if (!handoff.active || !handoff.draft) {
      return;
    }

    this.warehouseReceiptForm.reset({
      ...handoff.draft,
      supplier: supplier.businessName,
      // ✅ Fix ISS-08: default OFF
      syncCashPrices: (handoff.draft as { syncCashPrices?: boolean }).syncCashPrices ?? false,
    });
    this.warehouseSupplierHandoff.set({ active: false, draft: null });
    this.warehouseModalOpen.set(true);
  }

  private applyExpenseSupplierHandoff(supplier: ExpenseSupplierRecord): void {
    const handoff = this.expenseSupplierHandoff();
    if (!handoff.active || !handoff.draft) {
      return;
    }

    this.expenseForm.reset({
      ...handoff.draft,
      supplierId: supplier.id,
      genericSupplierLabel: '',
    });
    this.expenseSupplierHandoff.set({ active: false, draft: null });
    this.expenseModalOpen.set(true);
  }

  private applyTicketClientHandoff(client: ClientRecord): void {
    const handoff = this.ticketClientHandoff();
    if (!handoff.active || !handoff.draft) {
      return;
    }

    const currentTitle =
      typeof handoff.draft.title === 'string' ? handoff.draft.title.trim() : '';
    this.ticketForm.reset({
      ...handoff.draft,
      customerName: client.name,
      title: currentTitle || `Intervento ${client.name}`,
    });
    this.ticketClientLookup.set(client.name);
    this.ticketClientHandoff.set({ active: false, draft: null });
    this.ticketModalOpen.set(true);
  }

  protected openServiceModal(): void {
    this.resetCashProductForm();
    this.restoreFormDraft('service', this.cashProductForm);
    this.serviceModalOpen.set(true);
  }

  protected closeServiceModal(): void {
    this.serviceModalOpen.set(false);
  }

  protected discardExpenseModal(): void {
    this.clearFormDraft('expense');
    this.resetExpenseForm();
    // Quando chiudo il modale, resetto anche editingId
    // (così il prossimo openExpenseModal torna in modalità nuova spesa).
    this.expenseEditingId.set(null);
    this.expenseModalOpen.set(false);
  }

  protected discardWarehouseModal(): void {
    this.clearFormDraft('warehouse');
    this.resetWarehouseForm();
    this.warehouseModalOpen.set(false);
  }


  protected advanceQuote(id: string): void {
    this.data.advanceQuote(id);
  }

  protected removeQuote(id: string): void {
    if (confirm('Sei sicuro di voler eliminare questo preventivo?')) {
      this.data.deleteQuote(id);
      if (this.selectedQuoteId() === id) {
        this.selectedQuoteId.set(null);
      }
    }
  }

  protected setQuoteStage(id: string, stage: QuoteRecord['stage']): void {
    const quote = this.allQuotes().find((item) => item.id === id);
    if (!quote || quote.stage === stage) {
      return;
    }

    this.data.updateQuote({
      ...quote,
      stage,
    });
  }

  protected startQuoteDrag(id: string): void {
    this.draggedQuoteId.set(id);
  }

  protected allowQuoteDrop(event: DragEvent): void {
    event.preventDefault();
  }

  protected dropQuoteOnStage(stage: QuoteRecord['stage']): void {
    const quoteId = this.draggedQuoteId();
    this.draggedQuoteId.set(null);

    if (!quoteId) {
      return;
    }

    this.setQuoteStage(quoteId, stage);
  }

  protected onQuoteDiscountChange(): void {
    const discount = this.quoteForm.controls.discountAmount.value || 0;
    if (discount > 0) {
      const currentDue = this.quoteForm.controls.dueDate.value;
      if (!currentDue) {
        const today = new Date();
        today.setDate(today.getDate() + 7);
        this.quoteForm.patchValue({ dueDate: today.toISOString().slice(0, 10) });
      } else {
        const confirmChange = confirm('Hai inserito uno sconto. Vuoi prolungare o modificare la data di scadenza del preventivo?');
        if (confirmChange) {
          const dueDateEl = document.querySelector('input[formControlName="dueDate"]') as HTMLInputElement;
          if (dueDateEl) {
            dueDateEl.focus();
          }
        }
      }
    }
  }

  protected endQuoteDrag(): void {
    this.draggedQuoteId.set(null);
  }

  protected completeAppointment(id: string): void {
    this.data.completeAppointment(id);
  }

  protected progressTicket(id: string): void {
    this.data.progressServiceTicket(id);
  }

  protected assignMaterialToSelectedTicket(): void {
    if (this.ticketMaterialForm.invalid || !this.selectedTicketId()) {
      this.ticketMaterialForm.markAllAsTouched();
      return;
    }

    const payload = this.ticketMaterialForm.getRawValue();
    this.data.assignInventoryToTicket(
      this.selectedTicketId()!,
      payload.inventoryItemId,
      Number(payload.quantity),
    );
    this.ticketMaterialForm.reset({
      inventoryItemId: '',
      quantity: 1,
    });
  }

  protected loadQuoteToCash(quoteId: string): void {
    const quote = this.allQuotes().find((item) => item.id === quoteId);
    if (!quote) return;

    if (
      this.cashHasSessionContent() &&
      (this.selectedCashClientId() !== quote.clientId || !this.selectedCashClientId())
    ) {
      this.stashCurrentCashSession();
      this.pushToast('La lavorazione corrente è stata messa in attesa.', 'success');
    }

    this.cashLinkedQuoteId.set(quote.id);
    this.cashNotes.set(`Saldo preventivo ${this.quoteCode(quote.id)}`);

    if (quote.clientId) {
      this.selectCashClient(quote.clientId);
    } else {
      const matchedClient = this.allClients().find((client) => client.name === quote.customerName);
      if (matchedClient) {
        this.selectCashClient(matchedClient.id);
      } else {
        this.cashCustomerName.set(quote.customerName);
        this.cashCustomerMode.set('walk-in');
      }
    }

    const lines = quote.lines || [];
    const cartLines: CashTransactionLine[] = lines.map((line) => {
      const discount = line.discountPercent || 0;
      const finalUnitPrice = line.unitPrice * (1 - discount / 100);
      return {
        id: `cash-line-${crypto.randomUUID()}`,
        productId: 'quote-line',
        name: line.description || quote.projectType,
        quantity: line.quantity,
        unitPrice: parseFloat(finalUnitPrice.toFixed(2)),
        originalUnitPrice: line.unitPrice,
        vatRate: Math.max(0, Number(line.vatRate) || 22),
        discountPercentage: discount,
        total: line.quantity * parseFloat(finalUnitPrice.toFixed(2)),
        pricingMode: line.kind === 'servizio' ? 'ora' : 'fisso',
        operatorName: this.cashCurrentOperator(),
        excludeFromReceipt: false,
      };
    });

    if (cartLines.length === 0) {
      cartLines.push({
        id: `cash-line-${crypto.randomUUID()}`,
        productId: 'quote-summary',
        name: `Saldo preventivo: ${quote.projectType}`,
        quantity: 1,
        unitPrice: quote.value,
        originalUnitPrice: quote.value,
        vatRate: 22,
        total: quote.value,
        pricingMode: 'fisso',
        operatorName: this.cashCurrentOperator(),
        excludeFromReceipt: false,
      });
    }

    this.cashCart.set(cartLines);
  }

  protected loadTicketToCash(ticketId: string): void {
    const ticket = this.allServiceTickets().find((item) => item.id === ticketId) ?? null;
    if (!ticket) {
      return;
    }

    const matchedClient = this.allClients().find(
      (client) => client.name.trim().toLowerCase() === ticket.customerName.trim().toLowerCase(),
    );

    if (
      this.cashHasSessionContent() &&
      (!matchedClient || this.selectedCashClientId() !== matchedClient.id || !this.selectedCashClientId())
    ) {
      this.stashCurrentCashSession();
      this.pushToast('La lavorazione corrente è stata messa in attesa.', 'success');
    }

    this.cashSalesMode.set('servizi');
    this.cashLinkedQuoteId.set(ticket.linkedQuoteId);
    this.cashNotes.set(this.ticketCashNote(ticket));

    if (matchedClient) {
      this.selectCashClient(matchedClient.id);
    } else {
      this.cashCustomerName.set(ticket.customerName);
      this.cashCustomerMode.set('walk-in');
    }

    const operatorName = ticket.technician || this.cashCurrentOperator();
    const cartLines: CashTransactionLine[] = [
      {
        id: `cash-line-${crypto.randomUUID()}`,
        productId: 'ticket-service',
        name: `Intervento tecnico: ${ticket.title}`,
        quantity: 1,
        unitPrice: 0,
        originalUnitPrice: 0,
        vatRate: 22,
        total: 0,
        pricingMode: 'fisso',
        operatorName,
        excludeFromReceipt: false,
      },
    ];

    if (ticket.materialLines.length) {
      for (const line of ticket.materialLines) {
        cartLines.push({
          id: `cash-line-${crypto.randomUUID()}`,
          productId: line.inventoryItemId || 'ticket-material',
          name: `Materiale: ${line.itemName}`,
          quantity: line.quantity,
          unitPrice: line.unitCost,
          originalUnitPrice: line.unitCost,
          vatRate: 22,
          total: line.totalCost,
          pricingMode: 'fisso',
          operatorName,
          excludeFromReceipt: false,
        });
      }
    } else if (ticket.materialCost > 0) {
      cartLines.push({
        id: `cash-line-${crypto.randomUUID()}`,
        productId: 'ticket-material-summary',
        name: ticket.materialSummary?.trim() ? `Materiali: ${ticket.materialSummary}` : 'Materiali ticket tecnico',
        quantity: 1,
        unitPrice: ticket.materialCost,
        originalUnitPrice: ticket.materialCost,
        vatRate: 22,
        total: ticket.materialCost,
        pricingMode: 'fisso',
        operatorName,
        excludeFromReceipt: false,
      });
    }

    this.cashCart.set(cartLines);
  }

  private ticketCashNote(ticket: ServiceTicketRecord): string {
    const notes = [`Ticket tecnico ${this.ticketCode(ticket.id)}`];

    if (ticket.linkedQuoteId) {
      notes.push(`rif. preventivo ${this.quoteCode(ticket.linkedQuoteId)}`);
    }

    if (ticket.linkedAppointmentId) {
      const appointment = this.allAppointments().find((item) => item.id === ticket.linkedAppointmentId) ?? null;
      if (appointment) {
        notes.push(`appuntamento ${appointment.scheduledAt.slice(0, 16).replace('T', ' ')}`);
      }
    }

    return notes.join(' · ');
  }

  protected addCashProductToCart(productId: string): void {
    const product = this.allCashProducts().find((item) => item.id === productId);

    if (!product) {
      return;
    }

    this.selectedCashProductId.set(product.id);
    const productPrice = this.resolveCashProductPrice(product);
    this.cashCart.update((items) => {
      const existingLine = items.find(
        (line) =>
          line.productId === product.id &&
          line.operatorName === this.cashCurrentOperator() &&
          line.pricingMode === product.pricingMode,
      );

      if (!existingLine) {
        return [
          ...items,
          {
            id: `cash-line-${crypto.randomUUID()}`,
            productId: product.id,
            name: product.name,
            quantity: 1,
            unitPrice: productPrice,
            originalUnitPrice: productPrice,
            vatRate: 22,
            total: productPrice,
            pricingMode: product.pricingMode,
            operatorName: this.cashCurrentOperator(),
            excludeFromReceipt: false,
          },
        ];
      }

      return items.map((line) =>
        line.id === existingLine.id
          ? {
            ...line,
            quantity: line.quantity + 1,
            total: (line.quantity + 1) * line.unitPrice,
          }
          : line,
      );
    });
  }

  protected cashProductStock(product: CashRegisterProductRecord): number | null {
    if (!product.linkedInventoryItemId) {
      return null;
    }

    return this.cashInventoryById().get(product.linkedInventoryItemId)?.stock ?? null;
  }

  protected resolveCashProductPrice(product: CashRegisterProductRecord): number {
    if (!product.linkedInventoryItemId) {
      return product.price;
    }

    return this.cashInventoryById().get(product.linkedInventoryItemId)?.salePrice ?? product.price;
  }

  protected cashProductInventoryStatus(product: CashRegisterProductRecord): InventoryItemRecord['status'] | null {
    if (!product.linkedInventoryItemId) {
      return null;
    }

    return this.cashInventoryById().get(product.linkedInventoryItemId)?.status ?? null;
  }

  protected cashProductStockLabel(product: CashRegisterProductRecord): string {
    const stock = this.cashProductStock(product);

    if (stock === null) {
      return 'Magazzino non collegato';
    }

    if (stock === 1) {
      return 'Giacenza: 1 pezzo';
    }

    return `Giacenza: ${stock} pezzi`;
  }

  protected increaseCashLine(lineId: string): void {
    this.cashCart.update((items) =>
      items.map((line) =>
        line.id === lineId
          ? { ...line, quantity: line.quantity + 1, total: (line.quantity + 1) * line.unitPrice }
          : line,
      ),
    );
  }

  protected decreaseCashLine(lineId: string): void {
    this.cashCart.update((items) =>
      items
        .map((line) =>
          line.id === lineId
            ? {
              ...line,
              quantity: line.quantity - 1,
              total: Math.max((line.quantity - 1) * line.unitPrice, 0),
            }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  protected removeCashLine(lineId: string): void {
    this.cashCart.update((items) => items.filter((line) => line.id !== lineId));
  }

  protected assignOperatorToCashLine(lineId: string, operatorName: string): void {
    this.cashCart.update((items) =>
      items.map((line) => (line.id === lineId ? { ...line, operatorName } : line)),
    );
  }

  protected toggleCashLineReceipt(lineId: string): void {
    this.cashCart.update((items) =>
      items.map((line) =>
        line.id === lineId
          ? { ...line, excludeFromReceipt: !line.excludeFromReceipt }
          : line,
      ),
    );
  }

  protected updateCashLineUnitPrice(lineId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    let newPrice = parseFloat(input.value);
    if (isNaN(newPrice) || newPrice < 0) {
      newPrice = 0;
    }
    this.cashCart.update((items) =>
      items.map((line) => {
        if (line.id === lineId) {
          const discountPercentage = line.originalUnitPrice > 0
            ? ((line.originalUnitPrice - newPrice) / line.originalUnitPrice) * 100
            : 0;
          return {
            ...line,
            unitPrice: newPrice,
            discountPercentage: parseFloat(discountPercentage.toFixed(2)),
            total: line.quantity * newPrice
          };
        }
        return line;
      }),
    );
  }

  protected updateCashLineDiscount(lineId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    let discountPercentage = parseFloat(input.value);
    if (isNaN(discountPercentage) || discountPercentage < 0) {
      discountPercentage = 0;
    } else if (discountPercentage > 100) {
      discountPercentage = 100;
    }

    this.cashCart.update((items) =>
      items.map((line) => {
        if (line.id === lineId) {
          const newPrice = line.originalUnitPrice * (1 - discountPercentage / 100);
          return {
            ...line,
            unitPrice: parseFloat(newPrice.toFixed(2)),
            discountPercentage: discountPercentage,
            total: line.quantity * parseFloat(newPrice.toFixed(2))
          };
        }
        return line;
      }),
    );
  }

  protected completeCashSale(status: CashTransactionRecord['status']): void {
    if (!this.cashCart().length) {
      return;
    }

    let finalStatus = status;
    const paymentMethod = this.cashPaymentMethod();

    if (finalStatus === 'pagato') {
      if (paymentMethod === 'contanti' && this.cashReceivedAmount() < this.cashEffectiveTotal()) {
        if (!this.cashCanMarkAsInsoluto()) {
          this.pushToast('Importo ricevuto insufficiente. Per registrare un insoluto parziale, seleziona un cliente.', 'error');
          return;
        }
        finalStatus = 'insoluto';
      }

      if (paymentMethod === 'misto' && !this.cashMixedIsValid()) {
        this.pushToast('Controlla la suddivisione tra contanti ed elettronico.', 'error');
        return;
      }
    }

    if (finalStatus === 'insoluto' && !this.cashCanMarkAsInsoluto()) {
      this.pushToast('Per registrare un insoluto seleziona un cliente in anagrafica.', 'error');
      return;
    }

    let actualPaymentMethod = paymentMethod;
    const hasOffReceipt = this.cashHasOffReceiptItems();
    if (hasOffReceipt && actualPaymentMethod !== 'contanti') {
      actualPaymentMethod = 'contanti';
    }

    const notes = this.cashNotes().trim();
    const paymentSplit =
      finalStatus === 'pagato' && actualPaymentMethod === 'misto' ? this.cashActivePaymentSplit() : null;
    let electronicMethod: CashTransactionRecord['electronicMethod'] = null;
    if (actualPaymentMethod === 'pos') {
      electronicMethod = this.cashPosElectronicMethod();
    } else if (actualPaymentMethod === 'misto') {
      const mixedMethod = this.cashMixedElectronicMethod();
      electronicMethod = mixedMethod === 'bonifico' ? null : mixedMethod;
    }

    // If it's insoluto but they typed a received amount in contanti, we record it.
    let receivedAmount = 0;
    if (finalStatus === 'pagato') {
      receivedAmount = this.cashRegisteredReceivedAmount();
    } else if (finalStatus === 'insoluto') {
      if (actualPaymentMethod === 'contanti') {
        receivedAmount = this.cashReceivedAmount();
      } else if (actualPaymentMethod === 'misto') {
        receivedAmount = this.cashMixedCashAmount() + this.cashMixedElectronicAmount();
      }
    }

    if (this.cashPendingTransactionId()) {
      if (finalStatus !== 'pagato') {
        this.pushToast('Un insoluto aperto può essere solo saldato.', 'error');
        return;
      }

      const settled = this.data.settleCashTransaction(this.cashPendingTransactionId()!, {
        paymentMethod: actualPaymentMethod,
        electronicMethod,
        receivedAmount,
        notes,
        paymentSplit,
      });

      if (!settled) {
        this.pushToast('Errore durante il saldo dell insoluto.', 'error');
        return;
      }

      this.selectedCashTransactionId.set(settled.id);
      this.pushToast('Insoluto saldato correttamente.', 'success');
      this.clearCashCart();
      return;
    }

    const editingTransaction = this.cashEditingTransaction();
    const basePayload = {
      clientId: this.selectedCashClientId(),
      customerName:
        this.cashCustomerMode() === 'walk-in'
          ? this.cashCustomerName().trim() || 'Cliente di passaggio'
          : this.cashCustomerName().trim(),
      documentType: this.cashDocumentType(),
      paymentMethod: actualPaymentMethod,
      electronicMethod,
      status: finalStatus,
      notes,
      receivedAmount,
      discountAmount: this.cashDiscountAmount(),
      discountNote: this.cashDiscountNote().trim(),
      linkedQuoteId: this.cashLinkedQuoteId(),
      paymentSplit,
      lines: this.cashCart(),
    };

    if (editingTransaction) {
      const linesTotal = this.cashCart().reduce((sum, line) => sum + line.total, 0);
      const total = Math.max(linesTotal - this.cashDiscountAmount(), 0);
      const fiscal = this.cashFiscalSettings();
      const electronicAmount =
        actualPaymentMethod === 'pos'
          ? total
          : actualPaymentMethod === 'misto'
            ? paymentSplit?.elettronico ?? 0
            : 0;
      const electronicFeePercent =
        electronicMethod === 'bancomat'
          ? fiscal.posDebitFeePercent
          : electronicMethod === 'carta'
            ? fiscal.posCreditFeePercent
            : 0;
      const electronicFeeAmount =
        electronicMethod && electronicFeePercent > 0
          ? Math.round((electronicAmount * electronicFeePercent) / 100 * 100) / 100
          : 0;
      const updatedTransaction: CashTransactionRecord = {
        ...editingTransaction,
        clientId: this.selectedCashClientId(),
        customerName: basePayload.customerName,
        documentType: this.cashDocumentType(),
        paymentMethod: actualPaymentMethod,
        electronicMethod,
        electronicFeePercent,
        electronicFeeAmount,
        status: finalStatus,
        notes,
        receivedAmount,
        total,
        changeAmount:
          actualPaymentMethod === 'contanti'
            ? Math.max(receivedAmount - total, 0)
            : 0,
        discountAmount: this.cashDiscountAmount(),
        discountNote: this.cashDiscountNote().trim(),
        linkedQuoteId: this.cashLinkedQuoteId(),
        paymentSplit,
        settledAt: finalStatus === 'pagato' ? new Date().toISOString() : editingTransaction.settledAt,
        lines: this.cashCart().map((line) => ({ ...line })),
      };

      this.data.reviseCashTransaction(updatedTransaction, editingTransaction);
      this.selectedCashTransactionId.set(updatedTransaction.id);
      this.pushToast('Documento aggiornato e riportato correttamente in archivio.', 'success');
    } else {
      const transaction = this.data.completeCashTransaction(basePayload);
      this.selectedCashTransactionId.set(transaction.id);
      this.pushToast(
        status === 'insoluto' ? 'Insoluto registrato e collegato al cliente.' : 'Vendita registrata.',
        'success',
      );
      void this.handleIssuedCashInvoice(transaction);
    }

    this.clearCashCart();
  }

  protected clearCashCart(): void {
    this.resetCashCurrentSession();
  }

  protected setCashPaymentMethod(method: CashTransactionRecord['paymentMethod']): void {
    this.cashPaymentMethod.set(method);
    if (method !== 'misto') {
      this.cashMixedCashAmount.set(0);
      this.cashMixedElectronicAmount.set(0);
      this.cashMixedElectronicMethod.set('bancomat');
    } else {
      // Quando passi a MISTO: se ci sono voci fuori scontrino
      // prepopola la quota CONTANTI = importo fuori scontrino
      // (obbligo di legge) e il resto lo mette in elettronico.
      if (this.cashHasOffReceiptItems() && this.cashEffectiveTotal() > 0) {
        const minCash = this.cashHiddenReceiptTotal();
        const cash = Math.max(minCash, this.cashMixedCashAmount());
        const electronic = Math.max(Number((this.cashEffectiveTotal() - cash).toFixed(2)), 0);
        this.cashMixedCashAmount.set(cash);
        this.cashMixedElectronicAmount.set(electronic);
        this.cashReceivedAmount.set(cash);
      } else if (this.cashMixedCashAmount() === 0 && this.cashEffectiveTotal() > 0) {
        // Valore di default Misto senza fuori scontrino: metà contanti / metà elettronico
        const half = Number((this.cashEffectiveTotal() / 2).toFixed(2));
        this.cashMixedCashAmount.set(half);
        this.cashMixedElectronicAmount.set(Number((this.cashEffectiveTotal() - half).toFixed(2)));
        this.cashReceivedAmount.set(half);
      }
    }
  }

  protected applyQuickReceivedAmount(amount: number): void {
    this.cashReceivedAmount.set(amount);
    // Nel pagamento MISTO quando applichiamo un importo rapido ("Esatto",
    // €50, €100, €200) garantiamo SEMPRE che la quota contanti copra
    // il totale delle voci fuori scontrino, per rispettare l'obbligo.
    if (this.cashPaymentMethod() === 'misto' && this.cashEffectiveTotal() > 0) {
      const minCash = this.cashHasOffReceiptItems() ? this.cashHiddenReceiptTotal() : 0;
      const desiredCash = Math.max(minCash, Math.min(amount, this.cashEffectiveTotal()));
      const electronic = Math.max(Number((this.cashEffectiveTotal() - desiredCash).toFixed(2)), 0);
      this.cashMixedCashAmount.set(desiredCash);
      this.cashMixedElectronicAmount.set(electronic);
    }
  }

  protected updateCashMixedCashAmount(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const value = Math.max(0, Number(target?.value ?? 0));
    this.cashMixedCashAmount.set(value);
    this.cashMixedElectronicAmount.set(
      Math.max(Number((this.cashEffectiveTotal() - value).toFixed(2)), 0),
    );
    this.cashReceivedAmount.set(value);
  }

  protected updateCashMixedElectronicAmount(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const value = Math.max(0, Number(target?.value ?? 0));
    this.cashMixedElectronicAmount.set(value);
  }

  protected setCashMixedElectronicMethod(method: 'bancomat' | 'carta' | 'bonifico'): void {
    this.cashMixedElectronicMethod.set(method);
  }

  protected setCashPosElectronicMethod(method: 'bancomat' | 'carta'): void {
    this.cashPosElectronicMethod.set(method);
  }

  protected syncCashMixedAmounts(): void {
    const cashAmount = Math.max(
      0,
      Number((this.cashEffectiveTotal() - this.cashMixedElectronicAmount()).toFixed(2)),
    );
    this.cashMixedCashAmount.set(cashAmount);
    this.cashReceivedAmount.set(cashAmount);
  }

  protected setCashCurrentOperator(operatorName: string): void {
    this.cashCurrentOperator.set(operatorName);
  }

  protected toggleCashOperatorActive(id: string): void {
    const operator = this.allCashOperators().find((item) => item.id === id);

    if (!operator) {
      return;
    }

    const nuovoStato = !operator.active;
    this.data.updateCashOperator({
      ...operator,
      active: nuovoStato,
    });

    if (this.cashCurrentOperator() === operator.name && !nuovoStato) {
      const fallbackOperator = this.data
        .activeCashOperators()
        .find((item) => item.id !== operator.id)?.name;

      this.cashCurrentOperator.set(fallbackOperator ?? 'Banco');
    }

    this.pushToast(
      nuovoStato
        ? `Dipendente ${operator.name} è nuovamente visibile`
        : `Dipendente ${operator.name} nascosto (non eliminato — rimane nel gestionale per storico e fatturato)`,
      'success',
    );
  }

  protected removeCashOperator(id: string): void {
    const operator = this.allCashOperators().find((item) => item.id === id);

    if (!operator) {
      return;
    }

    // Conferma esplicita: il dipendente esce dalle liste attive e perde l'accesso al portale
    const confirmed = window.confirm(
      `Disattivare il dipendente "${operator.name}"?\n\nNon comparirà più tra i dipendenti attivi e l'accesso al portale dipendenti viene revocato. I dati restano in archivio.`,
    );
    if (!confirmed) {
      return;
    }

    this.data.deleteCashOperator(id);

    if (this.selectedEmployeeId() === id) {
      this.selectedEmployeeId.set(null);
    }

    if (this.cashCurrentOperator() === operator.name) {
      const fallbackOperator = this.data.activeCashOperators()[0]?.name ?? 'Banco';
      this.cashCurrentOperator.set(fallbackOperator);
    }
  }

  protected selectEmployee(id: string): void {
    this.selectedEmployeeId.set(id);
  }

  protected openEmployeeModal(id: string, tab: 'anagrafica' | 'turni-standard' | 'turni-settimanali' = 'anagrafica'): void {
    this.selectEmployee(id);
    this.isCreatingEmployee.set(false);
    this.employeeModalTab.set(tab);

    const employee = this.allCashOperators().find((item) => item.id === id);
    if (employee) {
      this.employeeDraft.set(JSON.parse(JSON.stringify(employee)));
      this.selectedShiftPatternIndex.set(0);
      this.employeeShiftDrafts.set(this.seedEmployeeShiftDrafts(employee, 0));
      this.employeeDefaultShiftDrafts.set(this.seedEmployeeDefaultShiftDrafts(employee));
    } else {
      this.employeeDraft.set(null);
      this.employeeShiftDrafts.set(this.emptyEmployeeShiftDrafts());
      this.employeeDefaultShiftDrafts.set(this.emptyEmployeeShiftDrafts());
    }

    this.employeeModalOpen.set(true);
  }

  protected saveEmployeeModal(): void {
    const draft = this.employeeDraft();
    if (draft) {
      // Prima di salvare, sincronizza qualsiasi default shift draft residuo nel record defaultWeeklyShift
      const syncDefault = draft.defaultWeeklyShift ?? this.emptyWeeklyShiftRecord();
      const newDefaults = { ...syncDefault };
      const currentDrafts = this.employeeDefaultShiftDrafts();
      for (const k of Object.keys(currentDrafts) as EmployeeShiftDayKey[]) {
        const formatted = this.formatShiftDraft(currentDrafts[k]);
        // Preserva i valori speciali [riposo] [chiusura] se presenti
        const existing = syncDefault[k] ?? '';
        if (/^\[(riposo|chiusura)\]\s*$/i.test(existing.trim())) {
          newDefaults[k] = existing;
        } else {
          newDefaults[k] = formatted;
        }
      }
      this.data.updateCashOperator({ ...draft, defaultWeeklyShift: newDefaults });
      this.pushToast('Modifiche salvate correttamente', 'success');
    }
    this.closeEmployeeModal();
  }

  // ═══ Helpers Turni Standard Settimanali (Profilo Dipendente) ═══
  private emptyWeeklyShiftRecord(): Record<EmployeeShiftDayKey, string> {
    return { lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' };
  }

  protected seedEmployeeDefaultShiftDrafts(
    employee: CashOperatorRecord,
  ): Record<EmployeeShiftDayKey, EmployeeShiftDraft> {
    const def = employee.defaultWeeklyShift ?? this.emptyWeeklyShiftRecord();
    return {
      lun: this.parseShiftText(def.lun),
      mar: this.parseShiftText(def.mar),
      mer: this.parseShiftText(def.mer),
      gio: this.parseShiftText(def.gio),
      ven: this.parseShiftText(def.ven),
      sab: this.parseShiftText(def.sab),
      dom: this.parseShiftText(def.dom),
    };
  }

  protected persistEmployeeDefaultShiftDraft(day: EmployeeShiftDayKey, draft: EmployeeShiftDraft): void {
    const employee = this.selectedEmployee();
    if (!employee) return;
    const nextDrafts = { ...this.employeeDefaultShiftDrafts(), [day]: draft };
    this.employeeDefaultShiftDrafts.set(nextDrafts);

    const formatted = this.formatShiftDraft(draft);
    const currentDefaults = employee.defaultWeeklyShift ?? this.emptyWeeklyShiftRecord();
    const updated = { ...currentDefaults, [day]: formatted };
    this.employeeDraft.set({ ...employee, defaultWeeklyShift: updated });
  }

  protected updateDefaultShiftField(
    day: EmployeeShiftDayKey,
    field: keyof EmployeeShiftDraft,
    value: string | boolean,
  ): void {
    const current = this.employeeDefaultShiftDrafts()[day];
    const next: EmployeeShiftDraft = { ...current, [field]: value };
    this.persistEmployeeDefaultShiftDraft(day, next);
  }

  protected setDefaultShiftDayTone(
    day: EmployeeShiftDayKey,
    tone: 'standard' | 'riposo' | 'chiusura',
  ): void {
    const employee = this.selectedEmployee();
    if (!employee) return;
    let value = '';
    if (tone === 'riposo') value = '[riposo]';
    if (tone === 'chiusura') value = '[chiusura]';
    const currentDefaults = employee.defaultWeeklyShift ?? this.emptyWeeklyShiftRecord();
    const updated = { ...currentDefaults, [day]: value };
    this.employeeDraft.set({ ...employee, defaultWeeklyShift: updated });
    const blank = this.emptyEmployeeShiftDraft();
    this.employeeDefaultShiftDrafts.update((d) => ({ ...d, [day]: blank }));
  }

  protected getDefaultShiftDayTone(day: EmployeeShiftDayKey): 'standard' | 'riposo' | 'chiusura' {
    const employee = this.selectedEmployee();
    const raw = ((employee?.defaultWeeklyShift ?? this.emptyWeeklyShiftRecord())[day] ?? '').trim();
    if (/^\[(riposo)\]\s*$/i.test(raw)) return 'riposo';
    if (/^\[(chiusura)\]\s*$/i.test(raw)) return 'chiusura';
    return 'standard';
  }

  protected applyDefaultShiftPreset(
    presetKey: 'mattina' | 'pomeriggio' | 'continuato' | 'serale',
    days: EmployeeShiftDayKey[] = ['lun', 'mar', 'mer', 'gio', 'ven'],
  ): void {
    const employee = this.selectedEmployee();
    if (!employee) return;
    // Mappa chiavi UI → chiavi interne plannerShiftPresets
    const keyMap: Record<typeof presetKey, string> = {
      mattina: 'mattutino',
      pomeriggio: 'pomeridiano',
      continuato: 'split',
      serale: 'serale',
    };
    const preset = this.plannerShiftPresets.find((p) => p.key === keyMap[presetKey]);
    if (!preset) return;
    const currentDefaults = employee.defaultWeeklyShift ?? this.emptyWeeklyShiftRecord();
    const updated = { ...currentDefaults };
    const nextDrafts = { ...this.employeeDefaultShiftDrafts() };
    // Calcola start/end minuti
    let endForCalc = preset.end;
    // Per lo split "Continuato" l'end è "13:00 15:00 19:00" → usiamo l'ultimo orario
    if (/\s/.test(endForCalc)) {
      const parts = endForCalc.split(/\s+/).filter(Boolean);
      endForCalc = parts[parts.length - 1] ?? endForCalc;
    }
    const startMin = this.hhmmToMinutes(preset.start);
    const endMin = this.hhmmToMinutes(endForCalc);
    const hasBreak = !!(preset.breakFrom && preset.breakTo);
    const breakFromMin = hasBreak ? this.hhmmToMinutes(preset.breakFrom) : 0;
    const breakToMin = hasBreak ? this.hhmmToMinutes(preset.breakTo) : 0;
    for (const day of days) {
      const draft: EmployeeShiftDraft = {
        ...this.emptyEmployeeShiftDraft(),
        startHour: String(Math.floor(startMin / 60)).padStart(2, '0'),
        startMinute: String(startMin % 60).padStart(2, '0'),
        endHour: String(Math.floor(endMin / 60)).padStart(2, '0'),
        endMinute: String(endMin % 60).padStart(2, '0'),
        hasBreak,
        breakFromHour: hasBreak ? String(Math.floor(breakFromMin / 60)).padStart(2, '0') : '00',
        breakFromMinute: hasBreak ? String(breakFromMin % 60).padStart(2, '0') : '00',
        breakToHour: hasBreak ? String(Math.floor(breakToMin / 60)).padStart(2, '0') : '00',
        breakToMinute: hasBreak ? String(breakToMin % 60).padStart(2, '0') : '00',
      };
      nextDrafts[day] = draft;
      updated[day] = this.formatShiftDraft(draft);
    }
    this.employeeDefaultShiftDrafts.set(nextDrafts);
    this.employeeDraft.set({ ...employee, defaultWeeklyShift: updated });
    this.pushToast(`Preset ${preset.label} applicato a ${days.length} giorni`, 'success');
  }

  // ═══ Esporta PDF (stampa browser) ═══
  protected plannerExportPdf(): void {
    // Attendiamo 50ms per permettere al browser di riapplicare stili prima del print
    setTimeout(() => {
      window.print();
    }, 50);
  }

  // ═══ Gestione Promemoria Paghe 1° del mese ═══
  private readonly PAGHE_REMINDER_KEY = 'audiomax_paghe_reminder_last_date';

  protected checkPagheReminderOnStartup(): void {
    try {
      const oggi = new Date();
      const giornoMese = oggi.getDate();
      if (giornoMese !== 1) return;
      const isoOggi = oggi.toISOString().slice(0, 7); // YYYY-MM
      const lastShown = this.storage.getItem(this.PAGHE_REMINDER_KEY) ?? '';
      if (lastShown === isoOggi) return; // già mostrato questo mese
      this.storage.setItem(this.PAGHE_REMINDER_KEY, isoOggi);
      this.pagheReminderOpen.set(true);
    } catch {
      // ignore storage errors
    }
  }

  protected acknowledgePagheReminder(): void {
    this.pagheReminderOpen.set(false);
  }

  // ══════════════════════════════════════════════════════
  //  EXPORT PDF MENSILE · TABELLA UFFICIO PAGHE (31 giorni)
  // ══════════════════════════════════════════════════════
  // (interfaces: PagheGridCell, PagheGridRow, PagheNoteRow — definite FUORI dalla classe, prima di @Component)

  // Date del calendario del mese/anno corrente selezionato:
  protected readonly pagheDatesComputed = computed<{ iso: string; dayNum: number; dow: number }[]>(() => {
    const m = this.pagheMese();
    const a = this.pagheAnno();
    const arr: { iso: string; dayNum: number; dow: number }[] = [];
    const daysInMonth = new Date(a, m + 1, 0).getDate();
    for (let d = 1; d <= 31; d++) {
      if (d <= daysInMonth) {
        const dt = new Date(a, m, d);
        arr.push({ iso: this.toIsoDate(dt), dayNum: d, dow: dt.getDay() });
      } else {
        arr.push({ iso: '', dayNum: d, dow: -1 });
      }
    }
    return arr;
  });

  protected readonly pagheExportGrid = computed<PagheGridRow[]>(() => {
    const dates = this.pagheDatesComputed();
    const ops = this.allCashOperators().filter(o => o.active);
    const dowShort = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];  // Sunday=0 → D
    const risultato: PagheGridRow[] = [];
    const noteTutte: PagheNoteRow[] = []; // temporaneo (riempito dopo in computed note)
    for (const op of ops) {
      let sommaLavoro = 0;
      let sommaFerie = 0;
      let sommaPermesso = 0;
      let sommaMalattia = 0;
      const cells: PagheGridCell[] = dates.map(d => {
        if (d.dow === -1 || !d.iso) {
          return { dayNumber: d.dayNum, isoDate: '', weekdayShort: '', isWeekend: false, display: '', kind: 'fuori', minutes: 0 };
        }

        // TASK 6: Valutazione chiusure negozio PRIMA di ogni altra logica
        const storeStatus = this.storeOpenStatusForDate(d.iso);
        // P0 = apertura straordinaria: niente si forza, comportamento resolver standard
        // P1 = chiusura collettiva → FERIE (F) per TUTTI i dipendenti, sovrascrive qualsiasi altro valore
        if (storeStatus.kind === 'bulk-closure') {
          const minuti = 480; // 8h giornata standard contratto
          sommaFerie += minuti;
          return {
            dayNumber: d.dayNum, isoDate: d.iso,
            weekdayShort: dowShort[d.dow] ?? '',
            isWeekend: d.dow === 0 || d.dow === 6,
            display: 'F', kind: 'ferie', minutes: minuti,
            note: `[Chiusura collettiva] ${storeStatus.reason} · ${storeStatus.from} → ${storeStatus.to}`
          };
        }

        const dowShortTxt = dowShort[d.dow] ?? '';
        const isWeekend = d.dow === 0 || d.dow === 6;
        const att = this.resolveEmployeeAttendance(op, d.iso);
        let kind: PagheGridCell['kind'] = 'vuoto';
        let display = '·';
        let minuti = 0;
        if (att.isLeave) {
          // Assenza gestita da leave record:
          if (att.status === 'ferie') { kind = 'ferie'; display = 'F'; minuti = att.plannedMinutes > 0 ? att.plannedMinutes : (op.contractHoursWeekly ? (op.contractHoursWeekly * 60 / 5) : 480); sommaFerie += minuti; }
          else if (att.status === 'malattia') { kind = 'malattia'; display = 'M'; minuti = att.plannedMinutes > 0 ? att.plannedMinutes : (op.contractHoursWeekly ? (op.contractHoursWeekly * 60 / 5) : 480); sommaMalattia += minuti; }
          else if (att.status === 'permesso') {
            kind = 'permesso';
            // Task7: Permesso ORARIO - priorità a leaveHours, poi plannedMinutes
            let hoursVal: number | null = null;
            if (att.leaveHours != null && att.leaveHours > 0) hoursVal = att.leaveHours;
            else if (att.plannedMinutes > 0) hoursVal = att.plannedMinutes / 60;
            // Formato display: P intero giornata vs P(2h) orario parziale (< 8h)
            if (hoursVal != null && hoursVal > 0 && hoursVal < 8) {
              const isIntero = Math.round(hoursVal * 10) / 10 === Math.floor(hoursVal);
              const strOre = isIntero ? String(Math.round(hoursVal)) : hoursVal.toFixed(1).replace('.', ',');
              display = `P(${strOre}h)`;
              minuti = Math.round(hoursVal * 60);
            } else {
              display = 'P';
              minuti = hoursVal != null ? Math.round(hoursVal * 60) : 0;
            }
            sommaPermesso += minuti;
          }
          else { kind = 'vuoto'; display = '·'; }
          if (att.note?.trim()) noteTutte.push({ employeeName: op.name, assenzaPer: att.status === 'ferie' ? 'Ferie' : att.status === 'malattia' ? 'Malattia' : 'Permesso', dal: d.iso, al: d.iso, oreN: (minuti / 60).toFixed(1) });
        } else if (att.status === 'lavorato' || att.status === 'programmato') {
          const min = att.workedMinutes || att.plannedMinutes || 0;
          if (min <= 0) {
            // Non ha turno = riposo
            kind = 'riposo'; display = 'R'; minuti = 0;
          } else {
            kind = 'lavorato';
            sommaLavoro += min;
            const ore = min / 60;
            if (Math.round(ore * 2) / 2 === Math.floor(ore)) {
              display = String(Math.round(ore));
            } else {
              display = ore.toFixed(1).replace('.', ',');
            }
          }
        } else if (att.status === 'ferie' || att.status === 'malattia' || att.status === 'permesso') {
          // manual override → attendances
          const mBase = att.plannedMinutes || 0;
          minuti = mBase;
          if (att.status === 'ferie') { kind = 'ferie'; display = 'F'; sommaFerie += minuti || 480; if (!minuti) minuti = 480; }
          else if (att.status === 'malattia') { kind = 'malattia'; display = 'M'; sommaMalattia += minuti || 480; if (!minuti) minuti = 480; }
          else {
            kind = 'permesso';
            // Task7: uniforma display permesso orario a P(Xh) per manual override
            if (minuti > 0 && minuti < 480) {
              const h = minuti / 60;
              const isIntero = Math.round(h * 10) / 10 === Math.floor(h);
              const strOre = isIntero ? String(Math.round(h)) : h.toFixed(1).replace('.', ',');
              display = `P(${strOre}h)`;
            } else {
              display = minuti ? 'P' : 'P';
            }
            sommaPermesso += minuti;
          }
        }

        // TASK 6 P2: Chiusura settimanale (Domenica, ecc.) → se nessuna assenza/ferie già assegnata, forza R (Riposo).
        // Non sovrascrive F/P/M leave record (utente può voler indicare malattia in Domenica per forza)
        if (storeStatus.kind === 'closed-weekly') {
          if ((kind === 'vuoto' || (kind === 'riposo')) && minuti === 0) {
            kind = 'riposo'; display = 'R'; minuti = 0;
            const noteAuto = `[Negozio chiuso · ${storeStatus.dayLabel}]`;
            const finalNote = att.note?.trim() ? `${att.note} · ${noteAuto}` : noteAuto;
            return {
              dayNumber: d.dayNum, isoDate: d.iso,
              weekdayShort: dowShortTxt, isWeekend,
              display, kind, minutes: minuti, note: finalNote
            };
          }
        }

        return {
          dayNumber: d.dayNum,
          isoDate: d.iso,
          weekdayShort: dowShortTxt,
          isWeekend,
          display,
          kind,
          minutes: minuti,
          note: att.note || ''
        };
      });
      // Calcolo ore contratto + straordinari:
      const workedHrs = Math.round(sommaLavoro / 60 * 10) / 10;
      // Calcolo il monte ore contrattuale previsto per questo dipendente in questo mese:
      // numero di "giorni lavorativi" = giorni non weekend dove il dipendente ha turni standard
      let giorniLavAttesi = 0;
      for (let d = 1; d <= 31; d++) {
        const info = dates[d - 1];
        if (info.dow === -1) continue;
        if (info.dow === 0 || info.dow === 6) continue; // ignore weekend per default
        const stdShift = (op.defaultWeeklyShift ?? {})[['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'][info.dow === 0 ? 6 : info.dow - 1] as keyof typeof op.defaultWeeklyShift] ?? '';
        if (stdShift && !/^\[(riposo|chiusura)\]\s*$/i.test(stdShift)) {
          giorniLavAttesi++;
        } else if (info.dow >= 1 && info.dow <= 5) {
          // Niente default shift → fallback: considera il giorno se esiste uno shift programmato
          const prog = this.getShiftForDate(op, info.iso) ?? '';
          if (prog && !/^\[(riposo|chiusura)\]\s*$/i.test(prog)) giorniLavAttesi++;
        }
      }
      const hrsPerDay = op.contractHoursWeekly ? op.contractHoursWeekly / 5 : 8;
      const contrHrs = Math.round(giorniLavAttesi * hrsPerDay * 10) / 10;
      const overHrs = Math.max(0, Math.round((workedHrs - contrHrs) * 10) / 10);
      risultato.push({
        employeeId: op.id,
        employeeName: op.name,
        jobTitle: op.jobTitle,
        cells,
        workedMinutes: sommaLavoro,
        leaveMinutes: { ferie: sommaFerie, permesso: sommaPermesso, malattia: sommaMalattia },
        contractHoursWeekly: op.contractHoursWeekly,
        contractHours: contrHrs,
        workedHours: workedHrs,
        overtimeHours: overHrs
      });
    }
    return risultato;
  });

  // Tabella NOTE (ferie/permessi/malattie aggregati):
  protected readonly pagheNoteList = computed<PagheNoteRow[]>(() => {
    const res: PagheNoteRow[] = [];
    const dates = this.pagheDatesComputed();
    const ops = this.allCashOperators().filter(o => o.active);
    for (const op of ops) {
      // Raggruppa per (employee, tipo) → intervalli consecutivi
      type K = { kind: 'ferie' | 'permesso' | 'malattia'; start: string; end: string; minutes: number };
      const gruppi: K[] = [];
      let corrente: K | null = null;
      for (let d = 0; d < 31; d++) {
        const info = dates[d];
        if (!info.iso) { if (corrente) { res.push(this._pagheNota(op.name, corrente)); corrente = null; } continue; }
        const att = this.resolveEmployeeAttendance(op, info.iso);
        let kindCurr: 'ferie' | 'permesso' | 'malattia' | null = null;
        if (att.status === 'ferie' || att.status === 'permesso' || att.status === 'malattia') kindCurr = att.status;
        if (kindCurr) {
          const minuti = att.plannedMinutes || (op.contractHoursWeekly ? op.contractHoursWeekly * 12 : 480);
          if (corrente && corrente.kind === kindCurr) {
            corrente.end = info.iso;
            corrente.minutes += minuti;
          } else {
            if (corrente) res.push(this._pagheNota(op.name, corrente));
            corrente = { kind: kindCurr, start: info.iso, end: info.iso, minutes: minuti };
          }
        } else {
          if (corrente) { res.push(this._pagheNota(op.name, corrente)); corrente = null; }
        }
      }
      if (corrente) res.push(this._pagheNota(op.name, corrente));
    }
    return res;
  });
  private _pagheNota(name: string, g: { kind: 'ferie' | 'permesso' | 'malattia'; start: string; end: string; minutes: number }): PagheNoteRow {
    const tipMap = { ferie: 'Ferie', permesso: 'Permesso', malattia: 'Malattia' } as const;
    return { employeeName: name, assenzaPer: tipMap[g.kind], dal: g.start, al: g.end, oreN: (g.minutes / 60).toFixed(1).replace('.', ',') + 'h' };
  }

  // Titolo da stampare: "Presenze · Mese di Settembre 2026"
  protected readonly pagheTitolo = computed(() => {
    return `Presenze dipendenti · ${this.pagheMesi[this.pagheMese()]} ${this.pagheAnno()}`;
  });

  protected onPagheMeseChange(e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    this.pagheMese.set(Number(v));
  }
  protected onPagheAnnoChange(e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    this.pagheAnno.set(Number(v));
  }

  protected pagheAnniRange(): number[] {
    const y = new Date().getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }

  protected fmtNumOre(n: number): string {
    if (!n || !isFinite(n)) return '0';
    const rounded = Math.round(n * 10) / 10;
    if (rounded === Math.floor(rounded)) return String(Math.round(rounded));
    return rounded.toFixed(1).replace('.', ',');
  }

  protected plannerExportPdfPaghe(): void {
    // Aggiungo classe al body per indicare al @media print di usare il layout PAGHE
    document.body.classList.add('printing-paghe');
    setTimeout(() => {
      try { window.print(); } finally {
        // rimuovi classe dopo un attimo (la preview stampa si è già scattata)
        setTimeout(() => { document.body.classList.remove('printing-paghe'); }, 600);
      }
    }, 80);
  }

  protected toggleAnonymousQuote(event: Event): void {
    const input = event.target as HTMLInputElement;
    const isAnon = input.checked;

    if (isAnon) {
      this.quoteForm.patchValue({
        customerEmail: '',
        customerPhone: '',
        customerAddress: '',
        customerTaxId: '',
        customerSdiCode: '',
        customerPec: '',
      });

      this.quoteForm.controls.customerEmail.disable();
      this.quoteForm.controls.customerPhone.disable();
      this.quoteForm.controls.customerAddress.disable();
      this.quoteForm.controls.customerTaxId.disable();
      this.quoteForm.controls.customerSdiCode.disable();
      this.quoteForm.controls.customerPec.disable();
    } else {
      this.quoteForm.controls.customerEmail.enable();
      this.quoteForm.controls.customerPhone.enable();
      this.quoteForm.controls.customerAddress.enable();
      this.quoteForm.controls.customerTaxId.enable();
      this.quoteForm.controls.customerSdiCode.enable();
      this.quoteForm.controls.customerPec.enable();
    }
  }

  protected updateCompanyProfileSetting(field: keyof CompanyProfileRecord, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!target) return;
    this.data.updateCompanyProfile({ [field]: target.value });
  }

  protected updateInvoiceTransmissionSetting(
    field: keyof CompanyProfileRecord['invoiceTransmission'],
    event: Event,
  ): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!target) return;
    this.data.updateCompanyProfile({
      invoiceTransmission: {
        ...this.companyProfile().invoiceTransmission,
        [field]: target.value,
      },
    });
  }

  protected updateInvoiceTransmissionBoolean(
    field: 'fallbackToXmlDownload',
    event: Event,
  ): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    this.data.updateCompanyProfile({
      invoiceTransmission: {
        ...this.companyProfile().invoiceTransmission,
        [field]: target.checked,
      },
    });
  }

  protected invoiceProviderConfigured(): boolean {
    const transmission = this.companyProfile().invoiceTransmission;
    return transmission.providerCode === 'webhook'
      && transmission.mode === 'api'
      && !!transmission.apiUrl.trim()
      && !!transmission.apiKey.trim();
  }

  protected onCompanyLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Logo = e.target?.result as string;
        this.data.updateCompanyProfile({ logoUrl: base64Logo });
      };
      reader.readAsDataURL(file);
    }
  }

  protected removeCompanyLogo(): void {
    this.data.updateCompanyProfile({ logoUrl: null });
  }

  protected closeEmployeeModal(): void {
    this.employeeModalOpen.set(false);
    this.isCreatingEmployee.set(false);
    this.employeeDraft.set(null);
    this.employeeDefaultShiftDrafts.set(this.emptyEmployeeShiftDrafts());
    this.employeeModalTab.set('anagrafica');
  }

  protected openCreateEmployeeModal(): void {
    this.cashOperatorForm.reset({
      active: true,
      employmentType: 'dipendente',
      role: 'vendita',
      jobTitle: '',
      contractHoursWeekly: 40,
      name: '',
    });
    this.isCreatingEmployee.set(true);
    this.employeeModalTab.set('anagrafica');
    this.employeeDefaultShiftDrafts.set(this.emptyEmployeeShiftDrafts());
    this.employeeModalOpen.set(true);
  }

  protected employeeRoleLabel(role: CashOperatorRecord['role']): string {
    switch (role) {
      case 'vendita':
        return 'Vendita';
      case 'tecnico':
        return 'Tecnico';
      case 'amministrazione':
        return 'Amministrazione';
      case 'magazzino':
        return 'Magazzino';
      default:
        return 'Operatore';
    }
  }

  protected employeeEmploymentLabel(type: CashOperatorRecord['employmentType']): string {
    return type === 'titolare' ? 'Titolare' : 'Dipendente';
  }

  protected employeeStatusLabel(active: boolean): string {
    return active ? 'Attivo' : 'Disattivato';
  }

  protected employeeContractLabel(hours: number): string {
    return hours > 0 ? `${hours} ore / settimana` : 'Fuori contratto';
  }

  protected formatMinutesToHoursLabel(minutes: number): string {
    if (!minutes) {
      return '0 h';
    }

    const rounded = Math.round((minutes / 60) * 10) / 10;
    return `${String(rounded).replace('.', ',')} h`;
  }

  protected openEmployeeAttendanceModal(employeeId: string, date: string): void {
    const employee = this.allCashOperators().find((item) => item.id === employeeId);
    if (!employee) {
      return;
    }

    const entry = this.resolveEmployeeAttendance(employee, date);
    this.selectedAttendanceEmployeeId.set(employeeId);
    this.selectedAttendanceDate.set(date);
    this.employeeAttendanceForm.reset({
      status: entry.status === 'riposo' || entry.status === 'assenza' ? entry.status : 'lavorato',
      actualStartTime: entry.actualStartTime,
      actualEndTime: entry.actualEndTime,
      breakMinutes: entry.breakMinutes,
      note: entry.note,
    });
    this.employeeAttendanceModalOpen.set(true);
  }

  protected closeEmployeeAttendanceModal(): void {
    this.employeeAttendanceModalOpen.set(false);
    this.selectedAttendanceEmployeeId.set(null);
    this.selectedAttendanceDate.set('');
    this.employeeAttendanceForm.reset({
      status: 'lavorato',
      actualStartTime: '',
      actualEndTime: '',
      breakMinutes: 0,
      note: '',
    });
  }

  protected saveEmployeeAttendanceModal(): void {
    const context = this.selectedAttendanceContext();
    if (!context) {
      return;
    }

    if (context.isLeave) {
      this.pushToast('Le ferie, i permessi e le malattie si gestiscono dal registro assenze.', 'error');
      return;
    }

    const value = this.employeeAttendanceForm.getRawValue();
    const status = value.status;

    if (status === 'lavorato' && (!value.actualStartTime || !value.actualEndTime)) {
      this.pushToast('Indica orario di ingresso e uscita per registrare la giornata.', 'error');
      return;
    }

    const breakMinutes = Math.max(0, Number(value.breakMinutes) || 0);
    const workedMinutes =
      status === 'lavorato'
        ? Math.max(
          this.diffMinutesBetweenTimes(value.actualStartTime || '00:00', value.actualEndTime || '00:00') - breakMinutes,
          0,
        )
        : 0;

    this.data.upsertEmployeeAttendanceRecord({
      employeeId: context.employee.id,
      employeeName: context.employee.name,
      date: context.date,
      status,
      plannedShift: context.plannedShift,
      plannedMinutes: context.plannedMinutes,
      actualStartTime: status === 'lavorato' ? value.actualStartTime : '',
      actualEndTime: status === 'lavorato' ? value.actualEndTime : '',
      breakMinutes,
      workedMinutes,
      overtimeMinutes: status === 'lavorato' ? Math.max(workedMinutes - context.plannedMinutes, 0) : 0,
      note: value.note.trim(),
      manualOverride: true,
    });

    this.pushToast('Presenza aggiornata nel registro mensile.', 'success');
    this.closeEmployeeAttendanceModal();
  }

  protected resetEmployeeAttendanceModal(): void {
    const context = this.selectedAttendanceContext();
    if (!context) {
      return;
    }

    this.data.deleteEmployeeAttendanceRecord(context.employee.id, context.date);
    this.pushToast('Giornata ripristinata al calcolo automatico.', 'success');
    this.closeEmployeeAttendanceModal();
  }

  protected employeeFilledShiftDays(employee: CashOperatorRecord): number {
    const pattern = employee.shiftPatterns?.[0] ?? { lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' };
    return Object.values(pattern).filter((value) => typeof value === 'string' && value.trim().length > 0).length;
  }

  protected employeeShiftDraft(day: EmployeeShiftDayKey, patternIndex: number = 0): EmployeeShiftDraft {
    return this.employeeShiftDrafts()[day];
  }

  protected employeeShiftHasUnparsedText(day: EmployeeShiftDayKey): boolean {
    return !!this.employeeShiftDraft(day).unparsedText;
  }

  protected updateEmployeeShiftField(
    day: EmployeeShiftDayKey,
    field:
      | 'startHour'
      | 'startMinute'
      | 'endHour'
      | 'endMinute'
      | 'breakFromHour'
      | 'breakFromMinute'
      | 'breakToHour'
      | 'breakToMinute',
    event: Event,
  ): void {
    const target = event.target as HTMLSelectElement | null;
    if (!target) {
      return;
    }

    const currentDraft = this.employeeShiftDraft(day);
    this.persistEmployeeShiftDraft(day, {
      ...currentDraft,
      [field]: target.value,
      unparsedText: '',
    });
  }

  protected toggleEmployeeShiftBreak(day: EmployeeShiftDayKey, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
      return;
    }

    const currentDraft = this.employeeShiftDraft(day);
    const hasBreak = target.checked;
    this.persistEmployeeShiftDraft(day, {
      ...currentDraft,
      hasBreak,
      breakFromHour: hasBreak ? currentDraft.breakFromHour : '',
      breakFromMinute: hasBreak ? currentDraft.breakFromMinute : '',
      breakToHour: hasBreak ? currentDraft.breakToHour : '',
      breakToMinute: hasBreak ? currentDraft.breakToMinute : '',
      unparsedText: '',
    });
  }

  // Wrapper per toggle usabile da button-switch (senza input checkbox checked)
  protected toggleEmployeeShiftBreakSwitch(day: EmployeeShiftDayKey): void {
    const currentDraft = this.employeeShiftDraft(day);
    const hasBreak = !currentDraft.hasBreak;
    this.persistEmployeeShiftDraft(day, {
      ...currentDraft,
      hasBreak,
      breakFromHour: hasBreak ? (currentDraft.breakFromHour || '13') : '',
      breakFromMinute: hasBreak ? (currentDraft.breakFromMinute || '00') : '',
      breakToHour: hasBreak ? (currentDraft.breakToHour || '14') : '',
      breakToMinute: hasBreak ? (currentDraft.breakToMinute || '00') : '',
      unparsedText: '',
    });
  }

  protected clearEmployeeShift(day: EmployeeShiftDayKey): void {
    this.persistEmployeeShiftDraft(day, this.emptyEmployeeShiftDraft());
  }

  protected updateSelectedEmployeeEmploymentType(event: Event): void {
    const employee = this.selectedEmployee();
    const target = event.target as HTMLSelectElement | null;
    if (!employee || !target) {
      return;
    }

    this.employeeDraft.set({
      ...employee,
      employmentType: target.value === 'titolare' ? 'titolare' : 'dipendente',
      contractHoursWeekly:
        target.value === 'titolare' ? 0 : employee.contractHoursWeekly > 0 ? employee.contractHoursWeekly : 40,
    });
  }

  protected updateSelectedEmployeeName(event: Event): void {
    const employee = this.selectedEmployee();
    const target = event.target as HTMLInputElement | null;
    if (!employee || !target) {
      return;
    }

    this.employeeDraft.set({
      ...employee,
      name: target.value,
    });
  }

  protected updateSelectedEmployeeActive(event: Event): void {
    const employee = this.selectedEmployee();
    const target = event.target as HTMLSelectElement | null;
    if (!employee || !target) {
      return;
    }

    this.employeeDraft.set({
      ...employee,
      active: target.value === 'true',
    });
  }

  protected updateSelectedEmployeeJobTitle(event: Event): void {
    const employee = this.selectedEmployee();
    const target = event.target as HTMLInputElement | null;
    if (!employee || !target) {
      return;
    }

    this.employeeDraft.set({
      ...employee,
      jobTitle: target.value,
    });
  }

  protected updateSelectedEmployeeRole(event: Event): void {
    const employee = this.selectedEmployee();
    const target = event.target as HTMLSelectElement | null;
    if (!employee || !target) {
      return;
    }

    this.employeeDraft.set({
      ...employee,
      role: target.value as CashOperatorRecord['role'],
    });
  }

  protected updateSelectedEmployeeContractHours(event: Event): void {
    const employee = this.selectedEmployee();
    const target = event.target as HTMLInputElement | null;
    if (!employee || !target) {
      return;
    }

    this.employeeDraft.set({
      ...employee,
      contractHoursWeekly: Math.max(0, Number(target.value) || 0),
    });
  }

  private persistEmployeeShiftDraft(day: EmployeeShiftDayKey, draft: EmployeeShiftDraft): void {
    const employee = this.selectedEmployee();
    if (!employee || employee.employmentType !== 'dipendente') {
      this.employeeShiftDrafts.update((current) => ({ ...current, [day]: draft }));
      return;
    }

    const nextDrafts = { ...this.employeeShiftDrafts(), [day]: draft };
    this.employeeShiftDrafts.set(nextDrafts);

    const formattedShift = this.formatShiftDraft(draft);
    if (!formattedShift && !this.isEmployeeShiftDraftBlank(draft)) {
      return;
    }

    const currentPatternIndex = this.selectedShiftPatternIndex();
    const currentPattern = employee.shiftPatterns?.[currentPatternIndex] ?? { lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' };
    const updatedPattern = { ...currentPattern, [day]: formattedShift };

    const newPatterns = [...(employee.shiftPatterns || [])];
    newPatterns[currentPatternIndex] = updatedPattern;

    this.employeeDraft.set({
      ...employee,
      shiftPatterns: newPatterns,
    });
  }

  private isEmployeeShiftDraftBlank(draft: EmployeeShiftDraft): boolean {
    return (
      !draft.startHour &&
      !draft.startMinute &&
      !draft.endHour &&
      !draft.endMinute &&
      !draft.hasBreak &&
      !draft.breakFromHour &&
      !draft.breakFromMinute &&
      !draft.breakToHour &&
      !draft.breakToMinute
    );
  }

  private formatShiftDraft(draft: EmployeeShiftDraft): string {
    if (!draft.startHour || !draft.startMinute || !draft.endHour || !draft.endMinute) {
      return '';
    }

    const base = `${draft.startHour}:${draft.startMinute}-${draft.endHour}:${draft.endMinute}`;
    if (
      !draft.hasBreak ||
      !draft.breakFromHour ||
      !draft.breakFromMinute ||
      !draft.breakToHour ||
      !draft.breakToMinute
    ) {
      return base;
    }

    return `${base} pausa ${draft.breakFromHour}:${draft.breakFromMinute}-${draft.breakToHour}:${draft.breakToMinute}`;
  }

  protected selectedShiftPatternIndex = signal<number>(0);

  protected seedEmployeeShiftDrafts(employee: CashOperatorRecord, patternIndex: number = 0): Record<EmployeeShiftDayKey, EmployeeShiftDraft> {
    const pattern = employee.shiftPatterns?.[patternIndex] ?? { lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' };
    return {
      lun: this.parseShiftText(pattern.lun),
      mar: this.parseShiftText(pattern.mar),
      mer: this.parseShiftText(pattern.mer),
      gio: this.parseShiftText(pattern.gio),
      ven: this.parseShiftText(pattern.ven),
      sab: this.parseShiftText(pattern.sab),
      dom: this.parseShiftText(pattern.dom),
    };
  }

  protected updateShiftPatternStartDate(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const employee = this.selectedEmployee();
    if (!target || !employee) return;
    this.employeeDraft.set({
      ...employee,
      shiftCycleStartDate: target.value
    });
  }

  protected addShiftPattern(): void {
    const employee = this.selectedEmployee();
    if (!employee) return;
    const newPatterns = [...(employee.shiftPatterns || []), { lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' }];
    const draftEmployee = {
      ...employee,
      shiftPatterns: newPatterns
    };
    this.employeeDraft.set(draftEmployee);
    this.selectedShiftPatternIndex.set(newPatterns.length - 1);
    this.employeeShiftDrafts.set(this.seedEmployeeShiftDrafts(draftEmployee, newPatterns.length - 1));
  }

  protected removeShiftPattern(index: number): void {
    const employee = this.selectedEmployee();
    if (!employee || !employee.shiftPatterns || employee.shiftPatterns.length <= 1) return;

    const newPatterns = employee.shiftPatterns.filter((_, i) => i !== index);
    const draftEmployee = {
      ...employee,
      shiftPatterns: newPatterns
    };
    this.employeeDraft.set(draftEmployee);

    const nextIndex = Math.max(0, index - 1);
    this.selectedShiftPatternIndex.set(nextIndex);
    this.employeeShiftDrafts.set(this.seedEmployeeShiftDrafts(draftEmployee, nextIndex));
  }

  protected selectShiftPattern(index: number): void {
    const employee = this.selectedEmployee();
    if (!employee) return;
    this.selectedShiftPatternIndex.set(index);
    this.employeeShiftDrafts.set(this.seedEmployeeShiftDrafts(employee, index));
  }

  private parseShiftText(value: string): EmployeeShiftDraft {
    const raw = (value ?? '').trim();
    if (!raw) {
      return this.emptyEmployeeShiftDraft();
    }

    const match = raw.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!match) {
      return { ...this.emptyEmployeeShiftDraft(), unparsedText: raw };
    }

    const startHour = match[1].padStart(2, '0');
    const startMinute = match[2];
    const endHour = match[3].padStart(2, '0');
    const endMinute = match[4];

    const breakMatch = raw.match(/pausa\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/i);
    if (!breakMatch) {
      return {
        ...this.emptyEmployeeShiftDraft(),
        startHour,
        startMinute,
        endHour,
        endMinute,
      };
    }

    return {
      ...this.emptyEmployeeShiftDraft(),
      startHour,
      startMinute,
      endHour,
      endMinute,
      hasBreak: true,
      breakFromHour: breakMatch[1].padStart(2, '0'),
      breakFromMinute: breakMatch[2],
      breakToHour: breakMatch[3].padStart(2, '0'),
      breakToMinute: breakMatch[4],
    };
  }

  private emptyEmployeeShiftDrafts(): Record<EmployeeShiftDayKey, EmployeeShiftDraft> {
    return {
      lun: this.emptyEmployeeShiftDraft(),
      mar: this.emptyEmployeeShiftDraft(),
      mer: this.emptyEmployeeShiftDraft(),
      gio: this.emptyEmployeeShiftDraft(),
      ven: this.emptyEmployeeShiftDraft(),
      sab: this.emptyEmployeeShiftDraft(),
      dom: this.emptyEmployeeShiftDraft(),
    };
  }

  private emptyEmployeeShiftDraft(): EmployeeShiftDraft {
    return {
      startHour: '',
      startMinute: '',
      endHour: '',
      endMinute: '',
      hasBreak: false,
      breakFromHour: '',
      breakFromMinute: '',
      breakToHour: '',
      breakToMinute: '',
      unparsedText: '',
    };
  }

  private getShiftForDate(employee: CashOperatorRecord, dateIso: string): string | undefined {
    if (!employee.shiftPatterns || employee.shiftPatterns.length === 0) {
      return '';
    }
    if (employee.shiftPatterns.length === 1) {
      const dayKey = this.weekdayKeyFromDate(this.parseIsoDate(dateIso));
      return employee.shiftPatterns[0][dayKey];
    }

    let anchorDate = employee.shiftCycleStartDate || this.toIsoDate(new Date());
    let anchorIndex = 0;

    const pastLeaves = this.employeeLeaves()
      .filter((l: EmployeeLeaveRecord) => l.employeeId === employee.id && l.endDate < dateIso && l.returnShiftPatternIndex != null)
      .sort((a: EmployeeLeaveRecord, b: EmployeeLeaveRecord) => b.endDate.localeCompare(a.endDate));

    if (pastLeaves.length > 0) {
      anchorDate = this.toIsoDate(new Date(new Date(pastLeaves[0].endDate).getTime() + 86400000));
      anchorIndex = pastLeaves[0].returnShiftPatternIndex!;
    }

    const diffDays = this.countInclusiveIsoDays(anchorDate, dateIso) - 1;
    let patternIndex = 0;

    if (dateIso >= anchorDate) {
      const diffWeeks = Math.floor(diffDays / 7);
      patternIndex = (anchorIndex + diffWeeks) % employee.shiftPatterns.length;
    } else {
      const pastDiffDays = this.countInclusiveIsoDays(dateIso, anchorDate) - 1;
      const pastDiffWeeks = Math.ceil(pastDiffDays / 7);
      patternIndex = (anchorIndex - (pastDiffWeeks % employee.shiftPatterns.length)) % employee.shiftPatterns.length;
      if (patternIndex < 0) patternIndex += employee.shiftPatterns.length;
    }

    const dayKey = this.weekdayKeyFromDate(this.parseIsoDate(dateIso));
    return employee.shiftPatterns[patternIndex][dayKey];
  }

  private resolveEmployeeAttendance(employee: CashOperatorRecord, date: string): EmployeeResolvedAttendanceEntry {
    const leave = this.employeeLeaveForEmployeeDate(employee.id, date);
    const explicit = this.allEmployeeAttendanceRecords().find(
      (item) => item.employeeId === employee.id && item.date === date,
    );
    const plannedShiftText = this.getShiftForDate(employee, date) ?? '';
    const shiftInfo = this.shiftInfoFromText(plannedShiftText);
    const today = this.toIsoDate(new Date());

    if (explicit?.manualOverride) {
      return {
        employee,
        date,
        status: explicit.status,
        plannedShift: explicit.plannedShift,
        plannedMinutes: explicit.plannedMinutes,
        actualStartTime: explicit.actualStartTime,
        actualEndTime: explicit.actualEndTime,
        breakMinutes: explicit.breakMinutes,
        workedMinutes: explicit.workedMinutes,
        overtimeMinutes: explicit.overtimeMinutes,
        note: explicit.note,
        manualOverride: explicit.manualOverride,
        isLeave: false,
        isFuture: date >= today,
      };
    }

    if (leave) {
      // Task7: permesso orario parziale → popola leaveHours (e leave plannedMinutes)
      const hours = (leave as any).hours ?? null;
      const startMin = (leave as any).startTimeMinutes ?? null;
      const endMin = (leave as any).endTimeMinutes ?? null;
      const isPartialPermit = leave.leaveType === 'permesso' && hours != null && hours > 0 && hours < 8;
      return {
        employee,
        date,
        status: leave.leaveType,
        plannedShift: startMin != null && endMin != null && isPartialPermit ? `Permesso ${this.minutesToHHMM(startMin)}-${this.minutesToHHMM(endMin)}` : '',
        plannedMinutes: isPartialPermit && hours != null ? Math.round(hours * 60) : 0,
        actualStartTime: '',
        actualEndTime: '',
        breakMinutes: 0,
        workedMinutes: 0,
        overtimeMinutes: 0,
        note: leave.note,
        manualOverride: false,
        isLeave: true,
        isFuture: date >= today,
        leaveHours: hours,
        leaveStartTimeMinutes: startMin,
        leaveEndTimeMinutes: endMin,
      };
    }

    if (explicit) {
      return {
        employee,
        date,
        status: explicit.status,
        plannedShift: explicit.plannedShift,
        plannedMinutes: explicit.plannedMinutes,
        actualStartTime: explicit.actualStartTime,
        actualEndTime: explicit.actualEndTime,
        breakMinutes: explicit.breakMinutes,
        workedMinutes: explicit.workedMinutes,
        overtimeMinutes: explicit.overtimeMinutes,
        note: explicit.note,
        manualOverride: explicit.manualOverride,
        isLeave: false,
        isFuture: date >= today,
      };
    }

    if (shiftInfo) {
      return {
        employee,
        date,
        status: date < today ? 'lavorato' : 'programmato',
        plannedShift: plannedShiftText,
        plannedMinutes: shiftInfo.netMinutes,
        actualStartTime: date < today ? shiftInfo.startTime : '',
        actualEndTime: date < today ? shiftInfo.endTime : '',
        breakMinutes: shiftInfo.breakMinutes,
        workedMinutes: date < today ? shiftInfo.netMinutes : 0,
        overtimeMinutes: 0,
        note: '',
        manualOverride: false,
        isLeave: false,
        isFuture: date >= today,
      };
    }

    return {
      employee,
      date,
      status: 'riposo',
      plannedShift: '',
      plannedMinutes: 0,
      actualStartTime: '',
      actualEndTime: '',
      breakMinutes: 0,
      workedMinutes: 0,
      overtimeMinutes: 0,
      note: '',
      manualOverride: false,
      isLeave: false,
      isFuture: date >= today,
    };
  }

  private employeeAttendancePrimaryLabel(entry: EmployeeResolvedAttendanceEntry): string {
    switch (entry.status) {
      case 'ferie':
        return 'F';
      case 'permesso':
        // Task7: permesso orario parziale mostra P(2h) se 0<hours<8
        if (entry.leaveHours != null && entry.leaveHours > 0 && entry.leaveHours < 8) {
          return `P(${entry.leaveHours % 1 === 0 ? String(entry.leaveHours) : entry.leaveHours.toFixed(1)}h)`;
        }
        return 'P';
      case 'malattia':
        return 'M';
      case 'assenza':
        return 'A';
      case 'riposo':
        return 'R';
      case 'programmato':
        return entry.plannedMinutes ? this.formatMinutesForCell(entry.plannedMinutes) : '·';
      case 'lavorato':
      default:
        return entry.workedMinutes ? this.formatMinutesForCell(entry.workedMinutes) : '0';
    }
  }

  private employeeAttendanceSecondaryLabel(entry: EmployeeResolvedAttendanceEntry): string {
    if (entry.overtimeMinutes > 0) {
      return `+${this.formatMinutesForCell(entry.overtimeMinutes)}`;
    }

    if (entry.status === 'programmato' && entry.plannedShift) {
      return 'prev.';
    }

    if (entry.manualOverride) {
      return 'mod.';
    }

    return '';
  }

  private employeeAttendanceTone(
    entry: EmployeeResolvedAttendanceEntry,
  ): EmployeeAttendanceRegisterCell['tone'] {
    switch (entry.status) {
      case 'ferie':
      case 'permesso':
      case 'malattia':
        return 'leave';
      case 'assenza':
        return 'absence';
      case 'riposo':
        return 'rest';
      case 'programmato':
        return 'future';
      case 'lavorato':
      default:
        return 'worked';
    }
  }

  private employeeLeaveForEmployeeDate(employeeId: string, date: string): EmployeeLeaveRecord | null {
    return (
      this.employeeLeaves().find(
        (leave) => leave.employeeId === employeeId && date >= leave.startDate && date <= leave.endDate,
      ) ?? null
    );
  }

  private shiftInfoFromText(value: string): {
    startTime: string;
    endTime: string;
    breakMinutes: number;
    netMinutes: number;
  } | null {
    const draft = this.parseShiftText(value);
    if (!draft.startHour || !draft.startMinute || !draft.endHour || !draft.endMinute || draft.unparsedText) {
      return null;
    }

    const startTime = `${draft.startHour}:${draft.startMinute}`;
    const endTime = `${draft.endHour}:${draft.endMinute}`;
    let breakMinutes = 0;

    if (
      draft.hasBreak &&
      draft.breakFromHour &&
      draft.breakFromMinute &&
      draft.breakToHour &&
      draft.breakToMinute
    ) {
      breakMinutes = Math.max(
        this.diffMinutesBetweenTimes(
          `${draft.breakFromHour}:${draft.breakFromMinute}`,
          `${draft.breakToHour}:${draft.breakToMinute}`,
        ),
        0,
      );
    }

    const totalMinutes = Math.max(this.diffMinutesBetweenTimes(startTime, endTime), 0);
    return {
      startTime,
      endTime,
      breakMinutes,
      netMinutes: Math.max(totalMinutes - breakMinutes, 0),
    };
  }

  private diffMinutesBetweenTimes(startTime: string, endTime: string): number {
    const [startHour, startMinute] = startTime.split(':').map((value) => Number(value));
    const [endHour, endMinute] = endTime.split(':').map((value) => Number(value));
    let start = startHour * 60 + startMinute;
    let end = endHour * 60 + endMinute;
    if (end < start) {
      end += 24 * 60;
    }
    return end - start;
  }

  private formatMinutesForCell(minutes: number): string {
    const rounded = Math.round((minutes / 60) * 10) / 10;
    return String(rounded).replace('.0', '').replace('.', ',');
  }

  private employeeAttendanceStatusLabel(status: EmployeeAttendanceDisplayStatus): string {
    switch (status) {
      case 'lavorato':
        return 'Lavorato';
      case 'riposo':
        return 'Riposo';
      case 'assenza':
        return 'Assenza';
      case 'ferie':
      case 'permesso':
      case 'malattia':
        return this.employeeLeaveTypeLabel(status);
      case 'programmato':
      default:
        return 'Programmato';
    }
  }

  private syncAutomaticEmployeeAttendanceForVisibleRange(): void {
    const range = this.employeeScheduleRange();
    const today = this.toIsoDate(new Date());
    const lastCompletedDate = this.previousIsoDate(today);

    if (!range.from || !range.to || lastCompletedDate < range.from) {
      return;
    }

    const syncTo = this.minIsoDate(range.to, lastCompletedDate);
    const daysToSync = this.expandDateRange(range.from, syncTo);
    if (!daysToSync.length) {
      return;
    }

    const existingKeys = new Set(
      this.allEmployeeAttendanceRecords().map((record) => `${record.employeeId}__${record.date}`),
    );
    const leaveKeys = new Set(
      this.employeeLeaves()
        .filter((leave) => this.isoRangesOverlap(leave.startDate, leave.endDate, range.from, syncTo))
        .flatMap((leave) =>
          this.expandDateRange(
            this.maxIsoDate(leave.startDate, range.from),
            this.minIsoDate(leave.endDate, syncTo),
          ).map((date) => `${leave.employeeId}__${date}`),
        ),
    );
    const payloads = this.allCashOperators()
      .filter((employee) => employee.employmentType === 'dipendente' && employee.active)
      .flatMap((employee) =>
        daysToSync.flatMap((date) => {
          const key = `${employee.id}__${date}`;
          if (existingKeys.has(key) || leaveKeys.has(key)) {
            return [];
          }

          const plannedShift = this.getShiftForDate(employee, date) ?? '';
          const shiftInfo = this.shiftInfoFromText(plannedShift);
          if (!shiftInfo) {
            return [];
          }

          return [
            {
              employeeId: employee.id,
              employeeName: employee.name,
              date,
              status: 'lavorato' as EmployeeAttendanceRecord['status'],
              plannedShift,
              plannedMinutes: shiftInfo.netMinutes,
              actualStartTime: shiftInfo.startTime,
              actualEndTime: shiftInfo.endTime,
              breakMinutes: shiftInfo.breakMinutes,
              workedMinutes: shiftInfo.netMinutes,
              overtimeMinutes: 0,
              note: '',
              manualOverride: false,
            },
          ];
        }),
      );

    this.data.upsertEmployeeAttendanceRecords(payloads);
  }

  protected updateSelectedEmployeeShift(
    day: EmployeeShiftDayKey,
    event: Event,
  ): void {
    const employee = this.selectedEmployee();
    const target = event.target as HTMLInputElement | null;
    if (!employee || !target || employee.employmentType !== 'dipendente') {
      return;
    }

    const currentPattern = employee.shiftPatterns?.[0] ?? { lun: '', mar: '', mer: '', gio: '', ven: '', sab: '', dom: '' };
    const updatedPattern = { ...currentPattern, [day]: target.value };

    this.data.updateCashOperator({
      ...employee,
      shiftPatterns: [updatedPattern, ...(employee.shiftPatterns?.slice(1) ?? [])],
    });
  }

  protected setCashSalesMode(mode: CashSalesMode): void {
    if (mode === 'storico') {
      this.openCashHistoryModal();
      this.cashSalesMode.set('tutti');
      return;
    }
    if (mode !== this.cashSalesMode()) {
      this.cashCategoryFilter.set('tutte');
      this.cashProductQuery.set('');
    }
    this.cashSalesMode.set(mode);
  }

  protected openCashClientModal(): void {
    this.resetClientForm();
    this.cashPrivacyDispatchChannel.set('whatsapp');
    this.cashPrivacyNoticeAcknowledged.set(false);
    this.cashPrivacyEmailMarketing.set(false);
    this.cashPrivacyWhatsappMarketing.set(false);
    this.cashPrivacyFidelityProfiling.set(false);
    this.cashClientModalOpen.set(true);
  }

  protected openCashHistoryModal(): void {
    this.cashHistoryModalOpen.set(true);
  }

  protected closeCashHistoryModal(): void {
    this.cashHistoryModalOpen.set(false);
  }

  /** Apre il popup con l'elenco dei clienti in attesa */
  protected openCashWaitingModal(): void {
    this.cashWaitingModalOpen.set(true);
  }

  protected closeCashWaitingModal(): void {
    this.cashWaitingModalOpen.set(false);
  }

  protected openCashReceiptPreviewModal(): void {
    this.cashReceiptPreviewModalOpen.set(true);
  }

  protected closeCashReceiptPreviewModal(): void {
    this.cashReceiptPreviewModalOpen.set(false);
  }

  protected closeCashClientModal(): void {
    this.cashClientModalOpen.set(false);
    this.cashNewClientName.set('');
    this.cashNewClientPhone.set('');
    this.cashNewClientCity.set('');
    this.cashNewClientEmail.set('');
    this.cashNewClientIsCompany.set(false);
    this.cashNewClientTaxId.set('');
    this.cashNewClientSdiCode.set('');
    this.cashNewClientPec.set('');
    this.cashNewClientBillingAddress.set('');
    this.cashNewClientBillingPostalCode.set('');
    this.cashNewClientBillingProvince.set('');
    this.cashNewClientBillingCountry.set('IT');
    this.cashPrivacyDispatchChannel.set('whatsapp');
    this.cashPrivacyNoticeAcknowledged.set(false);
    this.cashPrivacyEmailMarketing.set(false);
    this.cashPrivacyWhatsappMarketing.set(false);
    this.cashPrivacyFidelityProfiling.set(false);
    this.resetClientForm();
  }

  protected setCashCustomerMode(mode: 'existing' | 'walk-in'): void {
    this.cashCustomerMode.set(mode);
    this.selectedCashClientId.set(null);
    this.cashCustomerName.set(mode === 'walk-in' ? 'Cliente di passaggio' : '');
    this.cashClientLookup.set('');
    this.cashCustomerPhone.set('');
    this.cashCustomerCity.set('');
    this.cashCustomerEmail.set('');
    this.cashPrivacyNoticeAcknowledged.set(false);
    this.cashPrivacyEmailMarketing.set(false);
    this.cashPrivacyWhatsappMarketing.set(false);
    this.cashPrivacyFidelityProfiling.set(false);
  }

  protected setCashPrivacyDispatchChannel(channel: 'whatsapp' | 'email' | 'firma'): void {
    this.cashPrivacyDispatchChannel.set(channel);
  }

  protected selectCashClient(id: string): void {
    const client = this.allClients().find((item) => item.id === id);

    if (!client) {
      return;
    }

    this.selectedCashClientId.set(client.id);
    this.cashCustomerMode.set('existing');
    this.cashCustomerName.set(client.name);
    this.cashClientLookup.set('');
    this.cashCustomerPhone.set(client.phone);
    this.cashCustomerCity.set(client.city);
    this.cashCustomerEmail.set(client.email);
  }

  protected startNewCashSession(): void {
    if (this.stashCurrentCashSession()) {
      this.pushToast('Cliente corrente spostato in attesa. Cassa pronta per il prossimo.', 'success');
      return;
    }

    this.resetCashCurrentSession();
  }

  protected queueCurrentCashSession(): void {
    if (!this.stashCurrentCashSession()) {
      return;
    }

    this.pushToast('Cliente messo in attesa sotto la sezione operatore.', 'success');
  }

  protected resumeCashQueuedSession(sessionId: string): void {
    const session = this.cashQueuedSessions().find((item) => item.id === sessionId);
    if (!session) {
      return;
    }

    const hasCurrentSession = this.currentCashSessionHasContent();

    if (hasCurrentSession) {
      this.stashCurrentCashSession();
    }

    this.cashQueuedSessions.update((items) => items.filter((item) => item.id !== sessionId));
    this.restoreCashQueuedSession(session);
    this.cashWaitingModalOpen.set(false);
    this.pushToast('Cliente ripreso dalla lista attese.', 'success');
  }

  protected removeCashQueuedSession(sessionId: string): void {
    this.cashQueuedSessions.update((items) => items.filter((item) => item.id !== sessionId));
  }

  protected cashQueuedSessionLabel(session: CashDeskSessionDraft): string {
    return session.customerMode === 'walk-in'
      ? session.customerName.trim() || 'Cliente di passaggio'
      : session.customerName.trim() || 'Cliente registrato';
  }

  protected cashQueuedSessionMeta(session: CashDeskSessionDraft): string {
    const details = [session.customerPhone, session.customerCity].filter(Boolean);
    if (details.length) {
      return details.join(' · ');
    }

    if (session.linkedQuoteId) {
      return `Preventivo ${this.quoteCode(session.linkedQuoteId)}`;
    }

    return session.customerMode === 'walk-in' ? 'Cliente banco rapido' : 'Cliente registrato';
  }

  protected cashQueuedSessionTotal(session: CashDeskSessionDraft): number {
    return session.cart.reduce((sum, line) => sum + line.total, 0);
  }

  protected cashReportDocumentLabel(transaction: CashTransactionRecord): string {
    if (transaction.documentType === 'fattura') {
      return `Ft. ${transaction.invoiceNumber}`;
    }

    return `Sc. ${transaction.receiptNumber}`;
  }

  protected loadPendingCashTransaction(id: string): void {
    const transaction = this.allCashTransactions().find((item) => item.id === id);
    if (!transaction) {
      return;
    }

    this.cashPendingTransactionId.set(transaction.id);
    this.cashPaymentMethod.set(transaction.paymentMethod === 'misto' ? 'misto' : 'contanti');
    this.cashDocumentType.set(transaction.documentType);
    this.cashLinkedQuoteId.set(transaction.linkedQuoteId);
    this.cashDiscountValue.set(transaction.discountAmount);
    this.cashDiscountNote.set(transaction.discountNote);
    this.cashNotes.set(`Saldo insoluto ${transaction.reference}`);
    this.cashCart.set(
      transaction.lines.map((line) => ({
        ...line,
        id: `cash-line-${crypto.randomUUID()}`,
      })),
    );
    const unpaidAmount = transaction.total - (transaction.receivedAmount || 0);
    this.cashReceivedAmount.set(0);
    this.cashMixedCashAmount.set(0);
    this.cashMixedElectronicAmount.set(unpaidAmount);
    this.cashMixedElectronicMethod.set('bancomat');

    if (transaction.clientId) {
      this.selectCashClient(transaction.clientId);
    }
  }

  protected setCashPrivacyNoticeAcknowledged(value: boolean): void {
    this.cashPrivacyNoticeAcknowledged.set(value);
  }

  protected setCashPrivacyEmailMarketing(value: boolean): void {
    this.cashPrivacyEmailMarketing.set(value);
  }

  protected setCashPrivacyWhatsappMarketing(value: boolean): void {
    this.cashPrivacyWhatsappMarketing.set(value);
  }



  protected setCashPrivacyFidelityProfiling(value: boolean): void {
    this.cashPrivacyFidelityProfiling.set(value);
  }

  protected generateRemoteConsentLinkForSelectedClient(): void {
    const client = this.selectedClient();

    if (!client) {
      return;
    }

    const remoteConsentUrl = `/privacy-consent/${client.id}`;
    const timestamp = new Date().toISOString();

    this.data.updateClient({
      ...client,
      privacyProfile: {
        ...client.privacyProfile,
        remoteConsentStatus: 'inviato',
        remoteConsentUrl,
        audit: [
          {
            id: `privacy-audit-${crypto.randomUUID()}`,
            action: 'link-generato',
            detail: `Generato link di consenso remoto ${remoteConsentUrl}`,
            operator: this.cashCurrentOperator(),
            channel: 'link-remoto',
            createdAt: timestamp,
          },
          ...client.privacyProfile.audit,
        ],
        archive: [
          {
            id: `privacy-archive-${crypto.randomUUID()}`,
            type: 'consenso-remoto',
            title: 'Link consenso remoto generato',
            status: 'inviato',
            channel: 'link-remoto',
            url: remoteConsentUrl,
            createdAt: timestamp,
          },
          ...client.privacyProfile.archive,
        ],
      },
    });
  }

  protected confirmRemoteConsentForSelectedClient(): void {
    const client = this.selectedClient();

    if (!client) {
      return;
    }

    const timestamp = new Date().toISOString();

    this.data.updateClient({
      ...client,
      privacyProfile: {
        ...client.privacyProfile,
        remoteConsentStatus: 'completato',
        audit: [
          {
            id: `privacy-audit-${crypto.randomUUID()}`,
            action: 'consenso-confermato',
            detail: 'Conferma remota registrata per i consensi privacy opzionali.',
            operator: 'Conferma remota cliente',
            channel: 'link-remoto',
            createdAt: timestamp,
          },
          ...client.privacyProfile.audit,
        ],
        archive: [
          {
            id: `privacy-archive-${crypto.randomUUID()}`,
            type: 'conferma-consenso',
            title: 'Conferma consensi ricevuta dal cliente',
            status: 'confermato',
            channel: 'link-remoto',
            url: client.privacyProfile.remoteConsentUrl,
            createdAt: timestamp,
          },
          ...client.privacyProfile.archive,
        ],
      },
    });
  }

  protected revokeRemoteConsentForSelectedClient(): void {
    const client = this.selectedClient();

    if (!client) {
      return;
    }

    const timestamp = new Date().toISOString();

    this.data.updateClient({
      ...client,
      privacyProfile: {
        ...client.privacyProfile,
        remoteConsentStatus: 'revocato',
        emailMarketing: {
          granted: false,
          grantedAt: null,
          channel: null,
        },
        whatsappMarketing: {
          granted: false,
          grantedAt: null,
          channel: null,
        },
        fidelityProfiling: {
          granted: false,
          grantedAt: null,
          channel: null,
        },
        audit: [
          {
            id: `privacy-audit-${crypto.randomUUID()}`,
            action: 'consenso-revocato',
            detail: 'Consensi privacy revocati e storico aggiornato.',
            operator: 'Revoca cliente',
            channel: 'link-remoto',
            createdAt: timestamp,
          },
          ...client.privacyProfile.audit,
        ],
        archive: [
          {
            id: `privacy-archive-${crypto.randomUUID()}`,
            type: 'revoca-consenso',
            title: 'Revoca consensi cliente',
            status: 'revocato',
            channel: 'link-remoto',
            url: client.privacyProfile.remoteConsentUrl,
            createdAt: timestamp,
          },
          ...client.privacyProfile.archive,
        ],
      },
    });
  }

  protected saveCashClient(): void {
    if (!this.cashCanSaveWalkInClient()) {
      return;
    }

    const customerName = this.cashNewClientName().trim();
    const customerPhone = this.cashNewClientPhone().trim();
    const customerCity = this.cashNewClientCity().trim();
    const customerEmail = this.cashNewClientEmail().trim();
    const billingProfile: ClientBillingProfile | undefined = this.cashNewClientIsCompany()
      ? {
        kind: 'azienda',
        taxId: this.cashNewClientTaxId().trim(),
        sdiCode: this.cashNewClientSdiCode().trim(),
        pec: this.cashNewClientPec().trim(),
        billingAddress: this.cashNewClientBillingAddress().trim(),
        billingPostalCode: this.cashNewClientBillingPostalCode().trim(),
        billingProvince: this.cashNewClientBillingProvince().trim().toUpperCase(),
        billingCountry: this.cashNewClientBillingCountry().trim().toUpperCase() || 'IT',
      }
      : {
        kind: 'privato',
        taxId: '',
        sdiCode: '',
        pec: '',
        billingAddress: '',
        billingPostalCode: '',
        billingProvince: '',
        billingCountry: 'IT',
      };
    const existingClient =
      this.allClients().find(
        (client) =>
          client.name.trim().toLowerCase() === customerName.toLowerCase() ||
          (!!customerPhone && client.phone.trim() === customerPhone),
      ) ?? null;

    if (existingClient) {
      this.selectCashClient(existingClient.id);
      this.closeCashClientModal();
      this.pushToast('Cliente già presente: anagrafica collegata alla cassa.', 'success');
      return;
    }

    const fallbackEmail = `${customerName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')}.${Date.now()}@cash.local`;
    const createdClient = this.data.addClient({
      name: customerName,
      phone: customerPhone || 'Non indicato',
      email: customerEmail || fallbackEmail,
      city: customerCity || 'Non indicata',
      address: 'Creato da cassa',
      segment: this.cashNewClientIsCompany() ? 'Azienda' : 'Cliente banco',
      preferredContact: customerPhone ? 'telefono' : customerEmail ? 'email' : 'whatsapp',
      notes: `Cliente creato rapidamente dalla cassa · privacy via ${this.cashPrivacyDispatchLabel().toLowerCase()}`,
      favoriteBrands: '',
      status: 'occasionale',
      privacyProfile: this.buildCashPrivacyProfile({
        dispatchChannel: this.cashPrivacyDispatchChannel(),
        noticeAcknowledged: this.cashPrivacyNoticeAcknowledged(),
        emailMarketing: this.cashPrivacyEmailMarketing(),
        whatsappMarketing: this.cashPrivacyWhatsappMarketing(),
        fidelityProfiling: this.cashPrivacyFidelityProfiling(),
        billingProfile,
      }),
    });

    let updatedClient = createdClient;

    if (createdClient.privacyProfile.remoteConsentUrl?.startsWith('/privacy-consent/temp-')) {
      updatedClient = {
        ...createdClient,
        privacyProfile: {
          ...createdClient.privacyProfile,
          remoteConsentUrl: `/privacy-consent/${createdClient.id}`,
        },
      };
      this.data.updateClient(updatedClient);
    }

    this.selectCashClient(createdClient.id);
    this.dispatchCashPrivacyConsent(updatedClient);
    this.closeCashClientModal();
    this.pushToast(
      `Nuovo cliente creato. Privacy pronta via ${this.cashPrivacyDispatchLabel().toLowerCase()}.`,
      'success',
    );
  }

  protected selectCashTransaction(id: string): void {
    this.selectedCashTransactionId.set(id);
  }

  protected openCashReceiptsModal(): void {
    this.cashReceiptSearch.set('');
    this.cashDocumentListFilter.set('scontrini');
    this.cashReceiptsModalOpen.set(true);

    const firstReceipt = this.cashReceiptTransactions()[0] ?? null;
    this.selectedCashReceiptId.set(firstReceipt?.id ?? null);
    this.syncCashReceiptEditForm(firstReceipt);
  }

  protected closeCashReceiptsModal(): void {
    this.cashReceiptsModalOpen.set(false);
    this.selectedCashReceiptId.set(null);
    this.cashReceiptSearch.set('');
    this.cashReceiptEditForm.reset({
      customerName: '',
      paymentMethod: 'pos',
      status: 'pagato',
      notes: '',
    });
  }

  protected openCashReportModal(
    view: 'incassi' | 'operatori' | 'categorie' | 'numerazione' | 'chiusure' | 'clienti-top',
  ): void {
    this.cashReportModalView.set(view);
    this.cashReportModalOpen.set(true);

    if (view === 'chiusure') {
      this.cashShiftSearch.set('');
      const firstShift = this.filteredCashShifts()[0] ?? null;
      this.selectedCashReportShiftId.set(firstShift?.id ?? null);
      const firstTransaction = this.selectedCashReportShiftTransactions()[0] ?? null;
      this.selectedCashReportTransactionId.set(firstTransaction?.id ?? null);
    }

    if (view === 'clienti-top') {
      this.selectedCashTopClientId.set(this.loyalClients()[0]?.client.id ?? null);
    }
  }

  protected closeCashReportModal(): void {
    this.cashReportModalOpen.set(false);
    this.cashShiftSearch.set('');
    this.selectedCashReportShiftId.set(null);
    this.selectedCashReportTransactionId.set(null);
    this.selectedCashTopClientId.set(null);
  }

  protected navigateToCash(): void {
    void this.router.navigate(['/cassa']);
  }

  protected openCashReceiptsFromReport(): void {
    this.closeCashReportModal();
    this.openCashReceiptsModal();
  }

  protected setCashDocumentListFilter(filter: 'scontrini' | 'fatture'): void {
    this.cashDocumentListFilter.set(filter);
    const firstDocument = this.cashReceiptTransactions()[0] ?? null;
    this.selectedCashReceiptId.set(firstDocument?.id ?? null);
    this.syncCashReceiptEditForm(firstDocument);
  }

  protected selectCashReceipt(id: string): void {
    const receipt = this.allCashTransactions().find((item) => item.id === id) ?? null;
    this.selectedCashReceiptId.set(id);
    this.syncCashReceiptEditForm(receipt);
  }

  protected updateCashReceiptSearch(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashReceiptSearch.set(target?.value ?? '');

    const selectedId = this.selectedCashReceiptId();
    const hasSelectedInList = this.cashReceiptTransactions().some((item) => item.id === selectedId);

    if (!hasSelectedInList) {
      const firstReceipt = this.cashReceiptTransactions()[0] ?? null;
      this.selectedCashReceiptId.set(firstReceipt?.id ?? null);
      this.syncCashReceiptEditForm(firstReceipt);
    }
  }

  protected saveCashReceiptEdit(): void {
    const receipt = this.selectedCashReceipt();

    if (!receipt || this.cashReceiptEditForm.invalid) {
      this.cashReceiptEditForm.markAllAsTouched();
      return;
    }

    const payload = this.cashReceiptEditForm.getRawValue();
    const updatedReceipt: CashTransactionRecord = {
      ...receipt,
      customerName: payload.customerName.trim() || receipt.customerName,
      paymentMethod: payload.paymentMethod,
      status: payload.status,
      notes: payload.notes.trim(),
    };

    this.data.updateCashTransaction(updatedReceipt);
    this.selectedCashTransactionId.set(updatedReceipt.id);
    this.pushToast('Documento aggiornato correttamente.', 'success');
  }

  protected downloadSelectedCashInvoiceXml(): void {
    const receipt = this.selectedCashReceipt();
    if (!receipt) {
      return;
    }
    this.downloadCashInvoiceXml(receipt);
  }

  protected async sendSelectedCashInvoiceToProvider(): Promise<void> {
    const receipt = this.selectedCashReceipt();
    if (!receipt) {
      return;
    }
    await this.sendCashInvoiceToProvider(receipt, true);
  }

  protected restoreCashReceiptToDesk(): void {
    const receipt = this.selectedCashReceipt();
    if (!receipt) {
      return;
    }

    if (this.currentCashSessionHasContent()) {
      this.stashCurrentCashSession();
    }

    this.cashEditingTransactionId.set(receipt.id);
    this.cashPendingTransactionId.set(null);
    this.selectedCashClientId.set(receipt.clientId);
    this.cashCustomerMode.set(receipt.clientId ? 'existing' : 'walk-in');
    this.cashCustomerName.set(receipt.customerName);
    this.cashClientLookup.set('');
    const selectedClient = receipt.clientId
      ? this.allClients().find((item) => item.id === receipt.clientId) ?? null
      : null;
    this.cashCustomerPhone.set(selectedClient?.phone ?? '');
    this.cashCustomerCity.set(selectedClient?.city ?? '');
    this.cashCustomerEmail.set(selectedClient?.email ?? '');
    this.cashNotes.set(receipt.notes);
    this.cashReceivedAmount.set(receipt.receivedAmount);
    this.cashDiscountValue.set(receipt.discountAmount);
    this.cashDiscountNote.set(receipt.discountNote);
    this.cashLinkedQuoteId.set(receipt.linkedQuoteId);
    this.cashPaymentMethod.set(receipt.paymentMethod);
    this.cashMixedCashAmount.set(receipt.paymentSplit?.contanti ?? 0);
    this.cashMixedElectronicAmount.set(receipt.paymentSplit?.elettronico ?? 0);
    this.cashMixedElectronicMethod.set(receipt.paymentSplit?.elettronicoMethod ?? 'bancomat');
    this.cashPosElectronicMethod.set(receipt.electronicMethod ?? 'bancomat');
    this.cashDocumentType.set(receipt.documentType);
    this.cashSalesMode.set(
      receipt.lines.some((line) => {
        const product = this.allCashProducts().find((item) => item.id === line.productId);
        return !!product?.linkedInventoryItemId;
      })
        ? 'rivendita'
        : 'servizi',
    );
    this.cashCart.set(
      receipt.lines.map((line) => ({
        ...line,
        id: `cash-line-${crypto.randomUUID()}`,
      })),
    );
    this.closeCashReceiptsModal();
    this.pushToast('Documento riportato in cassa per la correzione.', 'success');
  }

  protected updateCashShiftSearch(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashShiftSearch.set(target?.value ?? '');

    const selectedId = this.selectedCashReportShiftId();
    const hasSelected = this.filteredCashShifts().some((item) => item.id === selectedId);

    if (!hasSelected) {
      const firstShift = this.filteredCashShifts()[0] ?? null;
      this.selectedCashReportShiftId.set(firstShift?.id ?? null);
      const firstTransaction = this.selectedCashReportShiftTransactions()[0] ?? null;
      this.selectedCashReportTransactionId.set(firstTransaction?.id ?? null);
    }
  }

  protected selectCashReportShift(shiftId: string): void {
    this.selectedCashReportShiftId.set(shiftId);
    const firstTransaction = this.selectedCashReportShiftTransactions()[0] ?? null;
    this.selectedCashReportTransactionId.set(firstTransaction?.id ?? null);
  }

  protected selectCashReportTransaction(transactionId: string): void {
    this.selectedCashReportTransactionId.set(transactionId);
  }

  protected selectCashTopClient(clientId: string): void {
    this.selectedCashTopClientId.set(clientId);
  }

  protected closeCashShift(): void {
    this.data.closeCashShift(this.cashShiftLabel().trim() || 'Chiusura turno');
    this.cashClosureModalOpen.set(false);
  }

  protected updateCashShiftLabel(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashShiftLabel.set(target?.value ?? 'Chiusura giornaliera');
  }

  protected setCashDocumentType(type: CashTransactionRecord['documentType']): void {
    // ✅ Se passi a FATTURA e mancano i dati identificativi, apri il pop-up prima di switchare
    if (type === 'fattura' && this.cashNeedsInvoiceData()) {
      this.openCashInvoiceDataModal('fattura');
      return;
    }
    this.cashDocumentType.set(type);
  }

  // ⚖️ Verifica se mancano i dati fiscali per emettere fattura valida
  protected cashNeedsInvoiceData(): boolean {
    if (this.cashCustomerMode() === 'existing' && this.selectedCashClient()) {
      const client = this.selectedCashClient()!;
      const bp = client.privacyProfile?.billingProfile;
      if (!bp) return true;
      if (bp.kind === 'azienda') {
        // P.IVA + almeno un canale di invio (SDI o PEC)
        return !(bp.taxId && (bp.sdiCode || bp.pec));
      }
      // Privato: CF o almeno indirizzo completo
      return !(bp.taxId || (bp.billingAddress && client.city !== 'Non indicata'));
    }
    // Walk-in o cliente non selezionato: serve sempre
    return true;
  }

  // ✅ Apre il pop-up dati fattura (pre-compila con dati già in possesso)
  protected openCashInvoiceDataModal(captureFor: CashTransactionRecord['documentType']): void {
    const selected = this.selectedCashClient();
    const modeWalkIn = this.cashCustomerMode() === 'walk-in';

    // Preleva dati esistenti (cliente esistente o walk-in)
    const existingName = modeWalkIn ? this.cashCustomerName() : selected?.name ?? '';
    const existingPhone = modeWalkIn ? this.cashCustomerPhone() : selected?.phone ?? '';
    const existingCity = modeWalkIn ? this.cashCustomerCity() : selected?.city ?? '';
    const existingEmail = modeWalkIn ? this.cashCustomerEmail() : selected?.email ?? '';
    const bp = selected?.privacyProfile?.billingProfile ?? null;

    const isCompany = bp?.kind === 'azienda' || false;

    this.cashInvIsCompany.set(isCompany);
    this.cashInvName.set(existingName === 'Cliente di passaggio' ? '' : existingName);
    this.cashInvPhone.set(existingPhone && existingPhone !== 'Non indicato' ? existingPhone : '');
    this.cashInvCity.set(existingCity && existingCity !== 'Non indicata' ? existingCity : '');
    this.cashInvEmail.set(existingEmail && !existingEmail.endsWith('@cash.local') ? existingEmail : '');
    this.cashInvTaxId.set(bp?.taxId ?? '');
    this.cashInvSdiCode.set(bp?.sdiCode ?? '');
    this.cashInvPec.set(bp?.pec ?? '');
    this.cashInvBillingAddress.set(bp?.billingAddress ?? '');
    this.cashInvBillingPostalCode.set(bp?.billingPostalCode ?? '');
    this.cashInvBillingProvince.set(bp?.billingProvince ?? '');
    this.cashInvBillingCountry.set(bp?.billingCountry ?? 'IT');
    this.cashInvCapturedType.set(captureFor);
    this.cashInvoiceDataModalOpen.set(true);
  }

  protected closeCashInvoiceDataModal(): void {
    this.cashInvoiceDataModalOpen.set(false);
    this.cashInvCapturedType.set(null);
    // Reset campi
    this.cashInvIsCompany.set(false);
    this.cashInvName.set('');
    this.cashInvPhone.set('');
    this.cashInvCity.set('');
    this.cashInvEmail.set('');
    this.cashInvTaxId.set('');
    this.cashInvSdiCode.set('');
    this.cashInvPec.set('');
    this.cashInvBillingAddress.set('');
    this.cashInvBillingPostalCode.set('');
    this.cashInvBillingProvince.set('');
    this.cashInvBillingCountry.set('IT');
  }

  // ✅ Salva i dati, crea/aggiorna l'anagrafica e switcha a FATTURA (o tipo catturato)
  protected saveCashInvoiceDataAndSwitch(): void {
    const name = this.cashInvName().trim();
    const taxId = this.cashInvTaxId().trim();
    const billingAddress = this.cashInvBillingAddress().trim();
    const email = this.cashInvEmail().trim();
    const pec = this.cashInvPec().trim();
    const sdiCode = this.cashInvSdiCode().trim();

    if (!name) {
      this.pushToast('Inserisci nome o ragione sociale.', 'error');
      return;
    }
    if (!taxId) {
      this.pushToast('Inserisci P.IVA o C.F. per la fattura.', 'error');
      return;
    }
    if (!billingAddress) {
      this.pushToast('Inserisci indirizzo di fatturazione.', 'error');
      return;
    }
    if (!this.cashInvBillingPostalCode().trim() || !this.cashInvBillingProvince().trim()) {
      this.pushToast('Inserisci CAP e provincia per generare una fattura XML valida.', 'error');
      return;
    }
    if (!email && !pec && !sdiCode) {
      this.pushToast('Inserisci almeno un canale di invio: email, PEC o SDI.', 'error');
      return;
    }

    const billingProfile: ClientBillingProfile = {
      kind: this.cashInvIsCompany() ? 'azienda' : 'privato',
      taxId,
      sdiCode,
      pec,
      billingAddress,
      billingPostalCode: this.cashInvBillingPostalCode().trim(),
      billingProvince: this.cashInvBillingProvince().trim().toUpperCase(),
      billingCountry: this.cashInvBillingCountry().trim().toUpperCase() || 'IT',
    };

    const selected = this.selectedCashClient();
    const isExisting = this.cashCustomerMode() === 'existing' && !!selected;

    if (isExisting) {
      // ✅ Aggiorna il profilo di fatturazione del cliente esistente
      const updated: ClientRecord = {
        ...selected!,
        phone: this.cashInvPhone().trim() || selected!.phone,
        email: email || selected!.email,
        city: this.cashInvCity().trim() || selected!.city,
        privacyProfile: {
          ...selected!.privacyProfile,
          billingProfile,
        },
      };
      this.data.updateClient(updated);
      this.selectCashClient(selected!.id);
      this.pushToast('Dati fattura aggiornati in anagrafica.', 'success');
    } else {
      // ✅ Crea un nuovo cliente o aggiornalo se trovato per nome
      const existingMatch = this.allClients().find(
        (c) => c.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (existingMatch) {
        const updated: ClientRecord = {
          ...existingMatch,
          phone: this.cashInvPhone().trim() || existingMatch.phone,
          email: email || existingMatch.email,
          city: this.cashInvCity().trim() || existingMatch.city,
          privacyProfile: {
            ...existingMatch.privacyProfile,
            billingProfile,
          },
        };
        this.data.updateClient(updated);
        this.selectCashClient(existingMatch.id);
        this.pushToast('Cliente trovato: dati fattura aggiunti.', 'success');
      } else {
        const fallbackEmail = email ||
          `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${Date.now()}@cash.local`;
        const created = this.data.addClient({
          name,
          phone: this.cashInvPhone().trim() || 'Non indicato',
          email: fallbackEmail,
          city: this.cashInvCity().trim() || 'Non indicata',
          address: billingAddress,
          segment: this.cashInvIsCompany() ? 'Azienda' : 'Cliente banco',
          preferredContact: email ? 'email' : 'whatsapp',
          notes: 'Cliente creato da modale dati fattura.',
          favoriteBrands: '',
          status: 'occasionale',
          privacyProfile: this.buildCashPrivacyProfile({
            dispatchChannel: 'firma',
            noticeAcknowledged: true,
            emailMarketing: false,
            whatsappMarketing: false,
            fidelityProfiling: false,
            billingProfile,
          }),
        });
        if (created) {
          this.selectCashClient(created.id);
          this.pushToast('Cliente creato e dati fattura salvati.', 'success');
        }
      }
    }

    const captured = this.cashInvCapturedType();
    this.closeCashInvoiceDataModal();
    if (captured) {
      this.cashDocumentType.set(captured);
    }
  }

  protected updateCashDiscountValue(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashDiscountValue.set(Math.max(0, Number(target?.value ?? 0)));
  }

  protected updateCashDiscountNote(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashDiscountNote.set(target?.value ?? '');
  }



  protected openCashClosureModal(): void {
    this.cashClosureModalOpen.set(true);
  }

  protected closeCashClosureModal(): void {
    this.cashClosureModalOpen.set(false);
  }

  // NOTA: il pulsante "Report giornaliero" nel banner in alto non naviga piu' via
  // (come prima faceva navigateToReports), ma adesso apre il modale report giornaliero
  // gia' presente nel template. NavigateToReports resta per altri percorsi.
  protected navigateToReports(): void {
    void this.router.navigate(['/report']);
  }

  protected updateFiscalSetting(field: string, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const value = target?.value ?? '';
    if (field === 'registerType') {
      this.data.updateCashFiscalSettings({ registerType: value });
    } else if (field === 'registerSerial') {
      this.data.updateCashFiscalSettings({ registerSerial: value });
    } else if (field === 'nextReceiptNumber') {
      this.data.updateCashFiscalSettings({ nextReceiptNumber: Math.max(1, Number(value) || 1) });
    } else if (field === 'nextInvoiceNumber') {
      this.data.updateCashFiscalSettings({ nextInvoiceNumber: Math.max(1, Number(value) || 1) });
    } else if (field === 'nextClosureNumber') {
      this.data.updateCashFiscalSettings({ nextClosureNumber: Math.max(1, Number(value) || 1) });
    } else if (field === 'posDebitFeePercent') {
      this.data.updateCashFiscalSettings({ posDebitFeePercent: Math.max(0, Number(value) || 0) });
    } else if (field === 'posCreditFeePercent') {
      this.data.updateCashFiscalSettings({ posCreditFeePercent: Math.max(0, Number(value) || 0) });
    }
  }

  protected closeSelectedTicket(): void {
    if (!this.selectedTicketId()) {
      return;
    }

    this.data.closeServiceTicket(this.selectedTicketId()!);
  }

  protected closeTicketDetailModal(): void {
    this.ticketDetailModalOpen.set(false);
    this.selectedTicketId.set(null);
  }

  protected createTicketFromSelectedQuote(): void {
    if (!this.selectedQuoteId()) {
      return;
    }

    this.data.createServiceTicketFromQuote(this.selectedQuoteId()!);
  }

  protected scheduleFromSelectedTicket(): void {
    if (!this.selectedTicketId()) {
      return;
    }

    this.data.scheduleAppointmentFromTicket(this.selectedTicketId()!);
  }

  protected openTicketInCash(ticketId: string): void {
    if (this.section().id === 'cassa') {
      this.loadTicketToCash(ticketId);
      return;
    }

    void this.router.navigate(['/cassa'], {
      state: {
        cashTicketId: ticketId,
      },
    });
  }

  protected exportServiceTicketPdf(ticketId: string): void {
    const ticket = this.allServiceTickets().find((item) => item.id === ticketId) ?? null;

    if (!ticket) {
      return;
    }

    const company = this.companyProfile();
    const linkedQuote = ticket.linkedQuoteId
      ? this.allQuotes().find((item) => item.id === ticket.linkedQuoteId) ?? null
      : null;
    const linkedAppointment = ticket.linkedAppointmentId
      ? this.allAppointments().find((item) => item.id === ticket.linkedAppointmentId) ?? null
      : null;
    const linkedClient = this.allClients().find((item) => item.name === ticket.customerName) ?? null;
    const materialRows = ticket.materialLines.length
      ? ticket.materialLines
        .map(
          (line) => `<tr>
              <td>${this.escapeHtml(line.itemName)}</td>
              <td style="text-align:right">${line.quantity}</td>
              <td style="text-align:right">€ ${line.unitCost.toLocaleString('it-IT')}</td>
              <td style="text-align:right">€ ${line.totalCost.toLocaleString('it-IT')}</td>
            </tr>`,
        )
        .join('')
      : '<tr><td colspan="4">Nessun materiale assegnato.</td></tr>';
    const popup = window.open('', '_blank', 'width=1120,height=860');

    if (!popup) {
      this.pushToast('Popup bloccato dal browser: impossibile aprire il PDF del ticket tecnico.', 'error');
      return;
    }

    const companyHeaderLines = [
      company.address,
      `${company.postalCode} ${company.city} ${company.province}`.trim(),
      company.country,
    ].filter((value) => value.trim().length > 0);
    const companyContactLines = [
      company.phone ? `Tel. ${company.phone}` : '',
      company.email,
      company.website,
      company.pec ? `PEC ${company.pec}` : '',
      company.vatNumber ? `P. IVA ${company.vatNumber}` : '',
    ].filter((value) => value.trim().length > 0);
    const footerNote = company.invoiceFooterNote?.trim() || 'Documento tecnico interno ad uso aziendale.';

    const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${this.escapeHtml(`Ticket tecnico ${this.ticketCode(ticket.id)}`)}</title>
  <style>
    body{font-family:Inter,Arial,sans-serif;margin:0;padding:24px;background:#eef3f9;color:#0f172a}
    .sheet{max-width:1180px;margin:0 auto}
    .letterhead,.hero,.summary-card,.panel,.table-shell,.footer-bar{border:1px solid #d6e0ee;border-radius:20px;background:#fff;box-shadow:0 18px 40px rgba(15,23,42,0.08)}
    .letterhead{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:18px;align-items:center;padding:20px 24px;margin-bottom:16px}
    .letterhead-logo{width:78px;height:78px;border-radius:18px;border:1px solid #d6e0ee;background:#f8fbff;display:grid;place-items:center;overflow:hidden}
    .letterhead-logo img{width:100%;height:100%;object-fit:contain}
    .letterhead-logo-fallback{font-size:22px;font-weight:800;letter-spacing:.08em;color:#1d4ed8}
    .letterhead h1{margin:0;font-size:24px;color:#0f172a}
    .letterhead p{margin:3px 0 0;color:#475569;font-size:13px;line-height:1.45}
    .letterhead-side{text-align:right}
    .doc-badge{display:inline-block;padding:8px 12px;border-radius:999px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    .doc-code{margin-top:10px;font-size:22px;font-weight:800;color:#0f172a}
    .hero{display:grid;grid-template-columns:1.35fr .95fr;gap:18px;padding:24px;margin-bottom:16px;background:linear-gradient(135deg,#f6faff 0%,#ffffff 58%,#f8fbff 100%)}
    .hero h2{margin:0 0 12px;font-size:30px;line-height:1.06;color:#1d4ed8}
    .hero p{margin:0;color:#475569;line-height:1.6}
    .hero-kicker,.section-kicker{display:inline-block;margin-bottom:10px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#2563eb}
    .hero-meta{display:grid;gap:12px}
    .hero-pill{padding:14px 16px;border-radius:16px;background:#f8fbff;border:1px solid #d9e7f5;font-size:13px;color:#334155}
    .hero-pill strong{display:block;margin-bottom:6px;font-size:16px;color:#0f172a}
    .summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
    .summary-card{padding:14px 16px}
    .summary-card span{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b}
    .summary-card strong{display:block;margin-top:8px;font-size:18px;color:#0f172a}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
    .panel{padding:18px 20px}
    .panel h3{margin:0 0 12px;font-size:18px;color:#0f172a}
    .fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .field{padding:12px 14px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0}
    .field span{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b}
    .field strong{display:block;margin-top:8px;font-size:14px;color:#0f172a}
    .note{margin-top:14px;padding:14px 16px;border-radius:16px;background:#f8fbff;border:1px solid #dbe7f3;color:#334155;line-height:1.6;white-space:pre-wrap}
    .note strong{display:block;margin-bottom:8px;color:#0f172a}
    .table-shell{padding:18px 20px;margin-top:16px}
    table{width:100%;border-collapse:collapse}
    th,td{padding:10px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;text-align:left}
    th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b}
    .footer-bar{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-top:16px;padding:16px 18px;font-size:11px;color:#64748b}
    .footer-bar strong{display:block;margin-bottom:4px;color:#0f172a}
    @media print{
      body{background:#fff;padding:0}
      .sheet{max-width:none}
      .letterhead,.hero,.summary-card,.panel,.table-shell,.footer-bar{box-shadow:none}
    }
  </style>
</head>
<body>
  <div class="sheet">
    <section class="letterhead">
      <div class="letterhead-logo">
        ${company.logoUrl
        ? `<img src="${company.logoUrl}" alt="Logo aziendale">`
        : `<span class="letterhead-logo-fallback">AM</span>`
      }
      </div>
      <div>
        <h1>${this.escapeHtml(company.legalName || 'AudioMax')}</h1>
        <p>${companyHeaderLines.map((line) => this.escapeHtml(line)).join('<br>')}</p>
        <p>${companyContactLines.map((line) => this.escapeHtml(line)).join(' · ')}</p>
      </div>
      <div class="letterhead-side">
        <span class="doc-badge">Scheda tecnica aziendale</span>
        <div class="doc-code">${this.escapeHtml(this.ticketCode(ticket.id))}</div>
        <p>Export del ${this.escapeHtml(new Date().toLocaleString('it-IT'))}</p>
      </div>
    </section>

    <section class="hero">
      <div>
        <span class="hero-kicker">Servizio tecnico</span>
        <h2>${this.escapeHtml(ticket.title)}</h2>
        <p>${this.escapeHtml(ticket.customerName)} · ${this.escapeHtml(ticket.serviceType)} · ${this.escapeHtml(ticket.locationType)}</p>
        <div class="note">
          <strong>Report tecnico</strong>
          ${this.escapeHtml(ticket.workSummary || 'Nessun report tecnico inserito.')}
        </div>
      </div>
      <div class="hero-meta">
        <div class="hero-pill"><strong>${this.escapeHtml(this.formatIsoDateLabel(ticket.insertedAt))}</strong>Inserito il</div>
        <div class="hero-pill"><strong>${this.escapeHtml(this.formatIsoDateTimeLabel(ticket.updatedAt ?? ticket.createdAt))}</strong>Ultima modifica il</div>
        <div class="hero-pill"><strong>${this.escapeHtml(this.formatIsoDateTimeLabel(ticket.createdAt))}</strong>Creato il</div>
        <div class="hero-pill"><strong>${this.escapeHtml(this.formatIsoDateTimeLabel(ticket.closedAt))}</strong>Chiuso il</div>
      </div>
    </section>

    <section class="summary-grid">
      <div class="summary-card"><span>Stato</span><strong>${this.escapeHtml(ticket.status)}</strong></div>
      <div class="summary-card"><span>Priorità</span><strong>${this.escapeHtml(ticket.priority)}</strong></div>
      <div class="summary-card"><span>Tecnico</span><strong>${this.escapeHtml(ticket.technician || 'Da assegnare')}</strong></div>
      <div class="summary-card"><span>Costo materiali</span><strong>€ ${ticket.materialCost.toLocaleString('it-IT')}</strong></div>
    </section>

    <section class="grid">
      <div class="panel">
        <span class="section-kicker">Scheda ticket</span>
        <h3>Dati principali</h3>
        <div class="fields">
          <div class="field"><span>Cliente</span><strong>${this.escapeHtml(ticket.customerName)}</strong></div>
          <div class="field"><span>Esito</span><strong>${this.escapeHtml(ticket.resolutionStatus)}</strong></div>
          <div class="field"><span>Inserito il</span><strong>${this.escapeHtml(this.formatIsoDateLabel(ticket.insertedAt))}</strong></div>
          <div class="field"><span>Ultima modifica il</span><strong>${this.escapeHtml(this.formatIsoDateTimeLabel(ticket.updatedAt ?? ticket.createdAt))}</strong></div>
          <div class="field"><span>Creato il</span><strong>${this.escapeHtml(this.formatIsoDateTimeLabel(ticket.createdAt))}</strong></div>
          <div class="field"><span>Chiuso il</span><strong>${this.escapeHtml(this.formatIsoDateTimeLabel(ticket.closedAt))}</strong></div>
        </div>
        <div class="note">
          <strong>Note operative</strong>
          ${this.escapeHtml(ticket.notes || 'Nessuna nota operativa inserita.')}
        </div>
      </div>
      <div class="panel">
        <span class="section-kicker">Collegamenti</span>
        <h3>Riferimenti utili</h3>
        <div class="fields">
          <div class="field"><span>Preventivo</span><strong>${this.escapeHtml(linkedQuote ? this.quoteCode(linkedQuote.id) : 'Nessuno')}</strong></div>
          <div class="field"><span>Appuntamento</span><strong>${this.escapeHtml(linkedAppointment ? linkedAppointment.scheduledAt.slice(0, 16).replace('T', ' ') : 'Nessuno')}</strong></div>
          <div class="field"><span>Telefono</span><strong>${this.escapeHtml(linkedClient?.phone || 'Non disponibile')}</strong></div>
          <div class="field"><span>Email</span><strong>${this.escapeHtml(linkedClient?.email || 'Non disponibile')}</strong></div>
        </div>
        ${ticket.materialSummary ? `<div class="note"><strong>Materiali sintetici</strong>${this.escapeHtml(ticket.materialSummary)}</div>` : ''}
      </div>
    </section>

    <section class="table-shell">
      <span class="section-kicker">Materiali</span>
      <h3>Materiale assegnato al ticket</h3>
      <table>
        <thead>
          <tr>
            <th>Articolo</th>
            <th style="text-align:right">Qta</th>
            <th style="text-align:right">Costo unit.</th>
            <th style="text-align:right">Totale</th>
          </tr>
        </thead>
        <tbody>${materialRows}</tbody>
      </table>
    </section>

    <section class="footer-bar">
      <div>
        <strong>Documento tecnico ${this.escapeHtml(this.ticketCode(ticket.id))}</strong>
        ${this.escapeHtml(footerNote)}
      </div>
      <div>
        <strong>Cliente</strong>
        ${this.escapeHtml(ticket.customerName)}
      </div>
    </section>
  </div>
</body>
</html>`;
    const popupDocument = popup.document;

    if (popupDocument && typeof popupDocument.write === 'function') {
      if (typeof popupDocument.open === 'function') {
        popupDocument.open();
      }
      popupDocument.write(html);
      if (typeof popupDocument.close === 'function') {
        popupDocument.close();
      }
    } else {
      const htmlBlobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));

      try {
        if (popup.location && typeof popup.location.replace === 'function') {
          popup.location.replace(htmlBlobUrl);
        } else if (popup.location) {
          popup.location.href = htmlBlobUrl;
        } else {
          throw new Error('Popup senza location disponibile');
        }
      } catch {
        URL.revokeObjectURL(htmlBlobUrl);
        this.pushToast('Impossibile generare il PDF del ticket tecnico in questa anteprima.', 'error');
        return;
      }

      // ✅ Fix REV-008: salva handle timeout Blob 60s per cleanup DestroyRef
      const t60 = setTimeout(() => {
        URL.revokeObjectURL(htmlBlobUrl);
      }, 60_000);
      this.blobTimers.add(t60);
    }

    if (typeof popup.focus === 'function') {
      popup.focus();
    }
    setTimeout(() => {
      if (typeof popup.print === 'function') {
        popup.print();
      }
    }, 300);
  }

  protected editClient(id: string): void {
    const record = this.allClients().find((item) => item.id === id);

    if (!record) {
      return;
    }

    this.editingClientId.set(record.id);
    this.selectedClientId.set(record.id);
    this.cashPrivacyDispatchChannel.set(
      record.privacyProfile.remoteConsentStatus === 'non-inviato'
        ? 'firma'
        : record.preferredContact === 'email'
          ? 'email'
          : 'whatsapp',
    );
    this.cashPrivacyNoticeAcknowledged.set(record.privacyProfile.noticeAcknowledged);
    this.cashPrivacyEmailMarketing.set(record.privacyProfile.emailMarketing.granted);
    this.cashPrivacyWhatsappMarketing.set(record.privacyProfile.whatsappMarketing.granted);
    this.cashPrivacyFidelityProfiling.set(record.privacyProfile.fidelityProfiling.granted);
    this.clientForm.setValue({
      kind: record.privacyProfile.billingProfile?.kind ?? 'privato',
      name: record.name,
      phone: record.phone,
      email: record.email,
      city: record.city,
      address: record.address,
      segment: record.segment,
      preferredContact: record.preferredContact,
      notes: record.notes,
      favoriteBrands: record.favoriteBrands,
      status: record.status,
      taxId: record.privacyProfile.billingProfile?.taxId ?? '',
      sdiCode: record.privacyProfile.billingProfile?.sdiCode ?? '',
      pec: record.privacyProfile.billingProfile?.pec ?? '',
      billingAddress: record.privacyProfile.billingProfile?.billingAddress ?? '',
      billingPostalCode: record.privacyProfile.billingProfile?.billingPostalCode ?? '',
      billingProvince: record.privacyProfile.billingProfile?.billingProvince ?? '',
      billingCountry: record.privacyProfile.billingProfile?.billingCountry ?? 'IT',
    });
    this.clientModalOpen.set(true);
  }

  protected removeClient(id: string): void {
    this.data.deleteClient(id);

    if (this.editingClientId() === id) {
      this.resetClientForm();
    }

    if (this.selectedClientId() === id) {
      this.selectedClientId.set(null);
    }
  }




  protected editAppointment(id: string): void {
    const record = this.allAppointments().find((item) => item.id === id);

    if (!record) {
      return;
    }

    this.editingAppointmentId.set(record.id);
    this.selectedAppointmentId.set(record.id);
    // ✅ Fix ISS-01: valorizza il signal multi-select dei tecnici
    // (invece di passare un array al form control, che ora è stringa semplice)
    const techniciansArr = record.technician
      ? record.technician.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    this.selectedTechnicians.set(techniciansArr);
    this.appointmentForm.setValue({
      title: record.title,
      customerName: record.customerName,
      appointmentType: record.appointmentType,
      locationType: record.locationType,
      address: record.address || '',
      scheduledAt: this.toDateTimeLocal(record.scheduledAt),
      durationMinutes: record.durationMinutes,
      // ✅ Fix ISS-01: technician è ora stringa semplice (es. "Marco, Luca")
      technician: techniciansArr.join(', '),
      linkedQuoteId: record.linkedQuoteId ?? '',
      status: record.status,
    });
    this.appointmentModalOpen.set(true);
  }

  protected editInventoryItem(id: string): void {
    // ===== TOGGLE SELEZIONE: se il prodotto è già quello aperto, chiude il dettaglio =====
    // L'utente vuole che cliccando due volte la stessa riga, il pannello si chiuda invece di rimanere fermo.
    // Uso selectedInventoryId per decidere lo stato: se combacia, resetto sia selezione che eventuale editing in corso.
    if (this.selectedInventoryId() === id) {
      this.selectedInventoryId.set(null);
      this.editingInventoryId.set(null);
      this.resetInventoryForm();
      return;
    }

    const record = this.allInventoryItems().find((item) => item.id === id);

    if (!record) {
      return;
    }

    this.editingInventoryId.set(record.id);
    this.selectedInventoryId.set(record.id);
    this.inventoryForm.setValue({
      sku: record.sku,
      barcode: record.barcode,
      name: record.name,
      category: record.category,
      usageType: record.usageType,
      stock: record.stock,
      cableRolls: record.cableRolls ?? 0,
      cableMetersPerRoll: record.cableMetersPerRoll ?? 0,
      minStock: record.minStock,
      unitCost: record.unitCost,
      salePrice: record.salePrice,
      supplier: record.supplier,
      location: record.location,
      // ✅ Fix ISS-08: default OFF quando si modifica un prodotto esistente
      syncCashPrices: false,
    });
  }

  /** Apre il modale di modifica anagrafica del prodotto (pulsante "Modifica" nel dettaglio). */
  protected openInventoryEditModal(id: string): void {
    const record = this.allInventoryItems().find((item) => item.id === id);
    if (!record) {
      return;
    }
    this.editingInventoryId.set(record.id);
    this.selectedInventoryId.set(record.id);
    this.inventoryForm.setValue({
      sku: record.sku,
      barcode: record.barcode,
      name: record.name,
      category: record.category,
      usageType: record.usageType,
      stock: record.stock,
      cableRolls: record.cableRolls ?? 0,
      cableMetersPerRoll: record.cableMetersPerRoll ?? 0,
      minStock: record.minStock,
      unitCost: record.unitCost,
      salePrice: record.salePrice,
      supplier: record.supplier,
      location: record.location,
      // ✅ Fix ISS-08: default OFF quando si modifica un prodotto esistente
      syncCashPrices: false,
    });
    this.inventoryEditModalOpen.set(true);
  }

  protected closeInventoryEditModal(): void {
    this.inventoryEditModalOpen.set(false);
  }

  protected discardInventoryEditModal(): void {
    this.inventoryEditModalOpen.set(false);
    this.resetInventoryForm();
  }

  protected removeInventoryItem(id: string): void {
    // ===== CONFERMA OBBLIGATORIA PRIMA DI ELIMINARE UN PRODOTTO =====
    // L'utente ha chiesto popup di conferma sui tasti distruttivi per evitare cancellazioni per sbaglio.
    const target = this.allInventoryItems().find((item) => item.id === id);
    const label = target ? `${target.name}${target.barcode ? ' · ' + target.barcode : ''}` : 'questo prodotto';
    const msg = [
      '⚠️ ELIMINAZIONE PRODOTTO DEFINITIVA.',
      '',
      `Rimuovi "${label}" da magazzino?`,
      '',
      'Questa operazione NON è reversibile: movimenti, lotti e rettifiche collegate potrebbero perdere l\'aggancio all\'articolo.',
      '',
      'Confermi definitivamente?',
    ].join('\n');
    const ok = typeof window !== 'undefined' ? window.confirm(msg) : true;
    if (!ok) {
      this.pushToast('Eliminazione annullata · prodotto NON rimosso.', 'success');
      return;
    }

    this.data.deleteInventoryItem(id);

    if (this.editingInventoryId() === id) {
      this.resetInventoryForm();
    }

    if (this.selectedInventoryId() === id) {
      this.selectedInventoryId.set(null);
    }
  }

  protected removeAppointment(id: string): void {
    this.data.deleteAppointment(id);

    if (this.editingAppointmentId() === id) {
      this.resetAppointmentForm();
    }

    if (this.selectedAppointmentId() === id) {
      this.selectedAppointmentId.set(null);
    }
  }

  protected editServiceTicket(id: string): void {
    const record = this.allServiceTickets().find((item) => item.id === id);

    if (!record) {
      return;
    }

    this.editingTicketId.set(record.id);
    this.selectedTicketId.set(record.id);
    this.ticketForm.setValue({
      title: record.title,
      customerName: record.customerName,
      insertedAt: record.insertedAt || record.createdAt.slice(0, 10),
      serviceType: record.serviceType,
      locationType: record.locationType,
      priority: record.priority,
      status: record.status,
      technician: record.technician,
      linkedQuoteId: record.linkedQuoteId ?? '',
      linkedAppointmentId: record.linkedAppointmentId ?? '',
      materialSummary: record.materialSummary,
      materialCost: record.materialCost,
      workSummary: record.workSummary,
      notes: record.notes ?? '',
      resolutionStatus: record.resolutionStatus,
    });
    this.ticketClientLookup.set(record.customerName);
    this.ticketDetailModalOpen.set(false);
    this.ticketModalOpen.set(true);
  }

  protected removeServiceTicket(id: string): void {
    this.data.deleteServiceTicket(id);

    if (this.editingTicketId() === id) {
      this.resetTicketForm();
    }

    if (this.selectedTicketId() === id) {
      this.selectedTicketId.set(null);
    }
  }

  protected cancelClientEdit(): void {
    this.resetClientForm();
    this.closeClientModal();
  }

  protected cancelQuoteEdit(): void {
    this.resetQuoteForm();
    this.quoteModalOpen.set(false);
  }

  protected cancelAppointmentEdit(): void {
    this.resetAppointmentForm();
    this.appointmentModalOpen.set(false);
  }

  protected cancelInventoryEdit(): void {
    this.resetInventoryForm();
  }

  protected cancelCashProductEdit(): void {
    this.resetCashProductForm();
  }

  protected cancelTicketEdit(): void {
    this.resetTicketForm();
    this.ticketModalOpen.set(false);
  }

  protected selectClient(id: string): void {
    this.selectedSupplierId.set(null);
    this.selectedClientId.set(id);
    this.clientDetailModalOpen.set(true);
  }

  protected selectSupplier(id: string): void {
    this.selectedClientId.set(null);
    this.selectedSupplierId.set(id);
    this.clientDetailModalOpen.set(true);
  }

  protected closeClientDetailModal(): void {
    this.clientDetailModalOpen.set(false);
  }

  protected selectQuote(id: string): void {
    this.selectedQuoteId.set(id);
    this.quoteDetailModalOpen.set(true);
  }

  protected closeQuoteDetailModal(): void {
    this.quoteDetailModalOpen.set(false);
  }

  protected selectAppointment(id: string): void {
    this.selectedAppointmentId.set(id);
  }

  protected selectInventoryItem(id: string): void {
    this.selectedInventoryId.set(id);
    const item = this.allInventoryItems().find((entry) => entry.id === id);

    if (item) {
      this.warehouseAdjustmentForm.patchValue({
        inventoryItemId: item.id,
        actualQuantity: item.stock,
      });
    }
  }

  protected selectTicket(id: string): void {
    this.selectedTicketId.set(id);
    this.ticketDetailModalOpen.set(true);
  }

  protected selectCashProduct(id: string): void {
    this.selectedCashProductId.set(id);
  }

  protected focusClientSearch(): void {
    const el = document.querySelector('.filter-input') as HTMLInputElement;
    if (el) {
      el.focus();
    }
  }

  protected updateClientQuery(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.clientQuery.set(target?.value ?? '');
  }

  protected updateClientStatusFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.clientStatusFilter.set((target?.value as 'tutti' | ClientRecord['status']) ?? 'tutti');
  }

  protected setClientView(
    view: 'dashboard' | 'contatti' | 'interazioni' | 'pipeline' | 'report' | 'automazioni',
  ): void {
    this.clientView.set(view);
  }

  protected updateInteractionKindFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.interactionKindFilter.set(
      (target?.value as 'tutti' | 'appuntamento' | 'ticket') ?? 'tutti',
    );
  }

  protected updateInteractionOwnerFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.interactionOwnerFilter.set(target?.value ?? 'tutti');
  }

  protected updateInteractionDateFilter(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.interactionDateFilter.set(target?.value ?? '');
  }

  protected updateClientCityFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.clientCityFilter.set(target?.value ?? 'tutte');
  }

  protected updateQuoteQuery(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.quoteQuery.set(target?.value ?? '');
  }

  protected updateQuoteStageFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.quoteStageFilter.set((target?.value as 'tutte' | QuoteRecord['stage']) ?? 'tutte');
  }

  protected setQuoteStageFilter(stage: 'tutte' | QuoteRecord['stage']): void {
    this.quoteStageFilter.set(stage);
  }

  protected updateQuoteClientLookup(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.quoteClientLookup.set(target?.value ?? '');
  }

  // Mostra/nascondi il blocco dati fiscali del preventivo
  protected toggleQuoteBilling(): void {
    this.quoteBillingOpen.update((open) => !open);
  }

  protected importQuoteClient(clientId: string): void {
    const client = this.allClients().find((item) => item.id === clientId);

    if (!client) {
      return;
    }

    const billingProfile = client.privacyProfile.billingProfile;
    this.quoteForm.patchValue({
      customerName: client.name,
      customerPhone: client.phone !== 'Non indicato' ? client.phone : '',
      customerEmail: client.email && !client.email.endsWith('@cash.local') ? client.email : '',
      customerAddress: billingProfile?.billingAddress || client.address || '',
      customerTaxId: billingProfile?.taxId || '',
      customerPec: billingProfile?.pec || '',
      customerSdiCode: billingProfile?.sdiCode || '',
    });
    // Se il cliente ha dati fiscali salvati, apri il blocco per mostrarli subito
    if (billingProfile && (billingProfile.taxId || billingProfile.sdiCode || billingProfile.pec)) {
      this.quoteBillingOpen.set(true);
    }
    this.quoteClientLookup.set('');
  }

  protected updateTicketClientLookup(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.ticketClientLookup.set(target?.value ?? '');
  }

  protected applyTicketClient(client: ClientRecord): void {
    const currentTitle = this.ticketForm.controls.title.value.trim();
    this.ticketForm.patchValue({
      customerName: client.name,
      title: currentTitle || `Intervento ${client.name}`,
    });
    this.ticketClientLookup.set(client.name);
  }

  protected openTicketClientCreation(kind: 'cliente' | 'azienda'): void {
    this.ticketClientHandoff.set({
      active: true,
      draft: this.ticketForm.getRawValue(),
    });
    this.ticketModalOpen.set(false);
    this.openContactModal(kind);
  }

  protected isTicketServiceTypeSelected(type: ServiceTicketRecord['serviceType']): boolean {
    return this.ticketForm.controls.serviceType.value === type;
  }

  protected selectTicketServiceType(type: ServiceTicketRecord['serviceType']): void {
    this.ticketForm.patchValue({ serviceType: type });
  }

  protected isTicketPrioritySelected(priority: ServiceTicketRecord['priority']): boolean {
    return this.ticketForm.controls.priority.value === priority;
  }

  protected selectTicketPriority(priority: ServiceTicketRecord['priority']): void {
    this.ticketForm.patchValue({ priority });
  }

  protected isTicketStatusSelected(status: ServiceTicketRecord['status']): boolean {
    return this.ticketForm.controls.status.value === status;
  }

  protected selectTicketStatus(status: ServiceTicketRecord['status']): void {
    this.ticketForm.patchValue({ status });
  }

  protected isTicketTechnicianSelected(operator: string): boolean {
    return this.ticketForm.controls.technician.value === operator;
  }

  protected setTicketTechnician(operator: string): void {
    this.ticketForm.patchValue({ technician: operator });
  }

  protected applyTicketLinkedQuote(quoteId: string): void {
    const quote = this.allQuotes().find((item) => item.id === quoteId) ?? null;
    if (!quote) {
      return;
    }

    const currentTitle = this.ticketForm.controls.title.value.trim();
    this.ticketForm.patchValue({
      customerName: quote.customerName,
      title: currentTitle || quote.projectType,
      linkedAppointmentId: this.ticketForm.controls.linkedAppointmentId.value || '',
    });
    this.ticketClientLookup.set(quote.customerName);
  }

  protected exportQuotePdf(quoteId: string): void {
    const quote = this.allQuotes().find((item) => item.id === quoteId);
    if (!quote) {
      return;
    }

    const lines =
      quote.lines?.length
        ? quote.lines
          .map(
            (line) => `
                <tr>
                  <td>${this.escapeHtml(line.kind)}</td>
                  <td>${this.escapeHtml(line.description)}</td>
                  <td style="text-align:right">${line.quantity}</td>
                  <td style="text-align:right">€ ${line.unitPrice.toLocaleString('it-IT')}</td>
                  <td style="text-align:right">${line.vatRate}%</td>
                  <td style="text-align:right">€ ${this.quoteLineTotal(line).toLocaleString('it-IT')}</td>
                </tr>`,
          )
          .join('')
        : '<tr><td colspan="6">Nessuna riga inserita.</td></tr>';

    const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${this.escapeHtml(this.quoteCode(quote.id))}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:28px;color:#0f172a}
    h1{margin:0;font-size:22px}
    .top{display:flex;justify-content:space-between;gap:16px;margin-bottom:20px}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:16px}
    .box{border:1px solid #cbd5e1;border-radius:14px;padding:14px}
    .box span{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:6px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{padding:10px 8px;border-bottom:1px solid #e2e8f0;font-size:13px;vertical-align:top}
    th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#475569}
    .note{margin-top:16px;border:1px solid #cbd5e1;border-radius:14px;padding:14px;background:#f8fafc;white-space:pre-wrap}
  </style>
</head>
<body>
  <div class="top">
    <div>
      <h1>Preventivo ${this.escapeHtml(this.quoteCode(quote.id))}</h1>
      <div>${this.escapeHtml(quote.projectType)}</div>
    </div>
    <div style="text-align:right">
      <div>Data: ${this.escapeHtml(quote.issueDate || '-')}</div>
      <div>Scadenza: ${this.escapeHtml(quote.dueDate)}</div>
      <div>Stato: ${this.escapeHtml(this.quoteStageLabel(quote.stage))}</div>
    </div>
  </div>
  <div class="grid">
    <div class="box">
      <span>Cliente</span>
      <strong>${this.escapeHtml(quote.customerName)}</strong><br>
      ${this.escapeHtml(quote.customerAddress || '-')}<br>
      ${this.escapeHtml(quote.customerPhone || '-')} · ${this.escapeHtml(quote.customerEmail || '-')}
    </div>
    <div class="box">
      <span>Pagamento</span>
      <strong>${this.escapeHtml(this.quotePaymentPlanLabel(quote.paymentPlan || 'unica'))}</strong><br>
      ${this.escapeHtml(this.quotePaymentSummary(quote))}
    </div>
  </div>
  <table>
    <thead>
      <tr><th>Tipo</th><th>Descrizione</th><th style="text-align:right">Qta</th><th style="text-align:right">Prezzo</th><th style="text-align:right">IVA</th><th style="text-align:right">Totale</th></tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>
  <div class="box" style="margin-top:16px">
    <span>Totale preventivo</span>
    <strong>€ ${quote.value.toLocaleString('it-IT')}</strong>
  </div>
  ${quote.notes
        ? `<div class="note"><strong>Note</strong><br>${this.escapeHtml(quote.notes)}</div>`
        : ''
      }
</body>
</html>`;

    const opened = window.open('', '_blank', 'noopener,noreferrer');
    if (!opened) {
      this.pushToast('Popup bloccato dal browser: impossibile aprire il PDF di stampa.', 'error');
      return;
    }

    opened.document.open();
    opened.document.write(html);
    opened.document.close();
    opened.focus();
    opened.print();
  }

  protected sendQuoteWhatsapp(quoteId: string): void {
    const quote = this.allQuotes().find((item) => item.id === quoteId);
    if (!quote) {
      return;
    }

    const normalizedPhone = this.privacyDispatch.normalizeWhatsappPhone(quote.customerPhone || '');
    if (!normalizedPhone) {
      this.pushToast('Numero cliente non valido per WhatsApp.', 'error');
      return;
    }

    const message =
      `Ciao ${quote.customerName}, ti inviamo il preventivo ${this.quoteCode(quote.id)} ` +
      `per "${quote.projectType}" di € ${quote.value.toLocaleString('it-IT')}.\n` +
      `Scadenza: ${quote.dueDate}.\n` +
      `Pagamento: ${this.quotePaymentSummary(quote)}.\n` +
      `Se vuoi, possiamo condividere anche la copia PDF del preventivo.`;
    const targetUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
    const opened = this.privacyDispatch.openExternalUrl(targetUrl);
    if (!opened) {
      this.pushToast('Popup bloccato dal browser: impossibile aprire WhatsApp.', 'error');
    }
  }

  protected sendQuoteEmail(quoteId: string): void {
    const quote = this.allQuotes().find((item) => item.id === quoteId);
    if (!quote) {
      return;
    }

    if (!quote.customerEmail) {
      this.pushToast('Indirizzo email non presente per questo preventivo.', 'error');
      return;
    }

    const subject = `Preventivo ${this.quoteCode(quote.id)} - ${quote.projectType}`;
    const body =
      `Gentile ${quote.customerName},\n\n` +
      `In allegato trovi il riepilogo del preventivo per "${quote.projectType}" per un totale di € ${quote.value.toLocaleString('it-IT')}.\n\n` +
      `Il preventivo è valido fino al ${quote.dueDate}.\n\n` +
      `Restiamo a disposizione per qualsiasi chiarimento.\n\n` +
      `Cordiali saluti,\nAudiomax`;

    const targetUrl = `mailto:${quote.customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    this.privacyDispatch.openExternalUrl(targetUrl);
  }

  protected proposeInstallation(quoteId: string): void {
    const quote = this.allQuotes().find((item) => item.id === quoteId);
    if (!quote) {
      return;
    }

    const normalizedPhone = this.privacyDispatch.normalizeWhatsappPhone(quote.customerPhone || '');
    if (!normalizedPhone) {
      this.pushToast('Numero cliente non valido per proporre l\'installazione via WhatsApp.', 'error');
      return;
    }

    const message =
      `Ciao ${quote.customerName}, grazie per aver confermato il preventivo ${this.quoteCode(quote.id)}!\n` +
      `Per procedere con i lavori per "${quote.projectType}", dobbiamo fissare la data di intervento.\n` +
      `Puoi confermarci la tua disponibilità per [INSERIRE DATA QUI]?\n` +
      `Ti invitiamo a confermare tramite questo link al nostro portale: https://audiomax.app/conferma-appuntamento/${quote.id}\n\n` +
      `A presto!`;
    const targetUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
    const opened = this.privacyDispatch.openExternalUrl(targetUrl);
    if (!opened) {
      this.pushToast('Popup bloccato dal browser.', 'error');
    }
  }

  protected openQuotePaymentModal(quoteId: string): void {
    const quote = this.allQuotes().find((item) => item.id === quoteId);
    if (!quote) {
      return;
    }
    this.quotePaymentQuoteId.set(quote.id);
    this.quotePaymentForm.reset({
      paymentMethod: 'sul_posto',
      operatorName: 'Portale Esterno',
      amount: quote.value,
      notes: '',
    });
    this.quotePaymentModalOpen.set(true);
  }

  // ✅ Handoff diretto: Naviga in /cassa con TUTTI gli importi del preventivo già caricati
  //    (righe articolo, cliente collegato, linkedQuoteId, modalità "preventivi")
  protected navigateQuoteToCash(quoteId: string): void {
    const quote = this.allQuotes().find((item) => item.id === quoteId);
    if (!quote) {
      this.pushToast('Preventivo non trovato.', 'error');
      return;
    }
    this.closeQuoteDetailModal();
    this.closeQuotePaymentModal();
    void this.router.navigate(['/cassa'], {
      state: { cashQuoteId: quote.id },
    });
  }

  protected closeQuotePaymentModal(): void {
    this.quotePaymentModalOpen.set(false);
    this.quotePaymentQuoteId.set(null);
  }

  protected submitQuotePayment(): void {
    if (this.quotePaymentForm.invalid) {
      this.quotePaymentForm.markAllAsTouched();
      return;
    }

    const quoteId = this.quotePaymentQuoteId();
    const quote = this.allQuotes().find((item) => item.id === quoteId);
    if (!quote) {
      return;
    }

    const payload = this.quotePaymentForm.getRawValue();

    const client = this.allClients().find(c => c.name === quote.customerName);

    if (payload.paymentMethod === 'sul_posto') {
      // Registra in cassa
      const total = payload.amount;
      const vatRate = 22; // Assumiamo 22% default
      const net = total / (1 + vatRate / 100);
      const tax = total - net;

      this.data.completeCashTransaction({
        clientId: client?.id || null,
        customerName: quote.customerName,
        documentType: 'scontrino',
        paymentMethod: 'pos',
        electronicMethod: 'bancomat',
        status: 'pagato',
        notes: payload.notes || `Saldato in loco (Rif. Prev. ${this.quoteCode(quote.id)})`,
        receivedAmount: total,
        discountAmount: 0,
        discountNote: '',
        linkedQuoteId: quote.id,
        paymentSplit: null,
        lines: [
          {
            id: crypto.randomUUID(),
            productId: '',
            name: `Saldo Lavoro - ${quote.projectType}`,
            quantity: 1,
            unitPrice: total,
            originalUnitPrice: total,
            vatRate: 22,
            total: total,
            pricingMode: 'fisso',
            operatorName: payload.operatorName,
            excludeFromReceipt: false,
          }
        ],
      });

      this.pushToast(`Pagamento di € ${total.toLocaleString('it-IT')} registrato in cassa con scontrino.`, 'success');
    } else {
      this.pushToast(`Metodo di pagamento impostato su ${payload.paymentMethod}.`, 'success');
    }

    // Mark quote as confirmed/done? Just add a note for now.
    // Real CRM might move it to 'chiuso' or 'fatturato'.
    this.closeQuotePaymentModal();
  }

  protected updateAppointmentQuery(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.appointmentQuery.set(target?.value ?? '');
  }

  protected updateAppointmentStatusFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.appointmentStatusFilter.set(
      (target?.value as 'tutti' | AppointmentRecord['status']) ?? 'tutti',
    );
  }

  protected updateAppointmentLocationFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.appointmentLocationFilter.set(
      (target?.value as 'tutti' | AppointmentRecord['locationType']) ?? 'tutti',
    );
  }

  protected updateAppointmentTypeFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.appointmentTypeFilter.set(
      (target?.value as 'tutti' | AppointmentRecord['appointmentType']) ?? 'tutti',
    );
  }

  protected updateTicketQuery(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.ticketQuery.set(target?.value ?? '');
  }

  protected updateTicketStatusFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.ticketStatusFilter.set(
      (target?.value as 'tutti' | ServiceTicketRecord['status']) ?? 'tutti',
    );
  }

  protected updateTicketPriorityFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.ticketPriorityFilter.set(
      (target?.value as 'tutte' | ServiceTicketRecord['priority']) ?? 'tutte',
    );
  }

  protected applyTicketCommandFilter(
    filterType: 'all' | 'status' | 'priority',
    filterValue: 'tutti' | 'tutte' | ServiceTicketRecord['status'] | ServiceTicketRecord['priority'],
  ): void {
    if (filterType === 'all') {
      this.ticketStatusFilter.set('tutti');
      this.ticketPriorityFilter.set('tutte');
      return;
    }

    if (filterType === 'status') {
      this.ticketStatusFilter.set(filterValue as 'tutti' | ServiceTicketRecord['status']);
      this.ticketPriorityFilter.set('tutte');
      return;
    }

    this.ticketPriorityFilter.set(filterValue as 'tutte' | ServiceTicketRecord['priority']);
    this.ticketStatusFilter.set('tutti');
  }

  protected isTicketCommandFilterActive(
    filterType: 'all' | 'status' | 'priority',
    filterValue: 'tutti' | 'tutte' | ServiceTicketRecord['status'] | ServiceTicketRecord['priority'],
  ): boolean {
    if (filterType === 'all') {
      return this.ticketStatusFilter() === 'tutti' && this.ticketPriorityFilter() === 'tutte';
    }

    if (filterType === 'status') {
      return this.ticketStatusFilter() === filterValue && this.ticketPriorityFilter() === 'tutte';
    }

    return this.ticketPriorityFilter() === filterValue && this.ticketStatusFilter() === 'tutti';
  }

  protected updateInventoryQuery(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.inventoryQuery.set(target?.value ?? '');
  }

  protected updateInventoryStatusFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.inventoryStatusFilter.set(
      (target?.value as 'tutti' | InventoryItemRecord['status']) ?? 'tutti',
    );
  }

  protected updateWarehouseCategoryFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.warehouseCategoryFilter.set(target?.value ?? 'tutte');
  }

  protected updateWarehouseSupplierQuery(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.warehouseSupplierQuery.set(target?.value ?? '');
  }

  protected setWarehouseView(
    view:
      | 'ricerca'
      | 'acquisto'
      | 'consumi'
      | 'utilizzo'
      | 'sottoscorta'
      | 'valore'
      | 'movimenti'
      | 'ordini'
      | 'fornitori',
  ): void {
    this.warehouseView.set(view);

    if (view !== 'movimenti') {
      this.warehouseMovementTypeFilter.set('tutti');
      this.warehouseOperatorFilter.set('tutti');
      this.warehouseMovementDateFrom.set('');
      this.warehouseMovementDateTo.set('');
    }

    if (view !== 'fornitori') {
      this.closeWarehouseSupplierDetail();
    }
  }

  protected openWarehouseSupplierDetail(supplier: string): void {
    this.warehouseSupplierDetailName.set(supplier);
  }

  protected closeWarehouseSupplierDetail(): void {
    this.warehouseSupplierDetailName.set(null);
  }

  protected warehouseUsageTypeLabel(value: InventoryItemRecord['usageType']): string {
    return value === 'uso-negozio' ? 'Uso negozio' : 'Rivendita';
  }

  protected isWarehouseCablingCategory(value: string | null | undefined): boolean {
    return (value ?? '').trim().toLowerCase() === 'cablaggio';
  }

  protected resolvedWarehouseReceiptCategory(): string {
    const category = this.warehouseReceiptForm.controls.category.value;
    return category === '__new__' ? this.warehouseReceiptForm.controls.newCategory.value : category;
  }

  protected hasInventoryCableBreakdown(item: InventoryItemRecord | null | undefined): boolean {
    return (
      !!item &&
      this.isWarehouseCablingCategory(item.category) &&
      (Number(item.cableMetersPerRoll) || 0) > 0
    );
  }

  protected warehouseReceiptIsCabling(): boolean {
    return this.isWarehouseCablingCategory(this.resolvedWarehouseReceiptCategory());
  }

  protected warehouseReceiptTotalMeters(): number {
    const rolls = Number(this.warehouseReceiptForm.controls.cableRolls.value) || 0;
    const metersPerRoll = Number(this.warehouseReceiptForm.controls.cableMetersPerRoll.value) || 0;
    return Math.max(0, rolls * metersPerRoll);
  }

  protected inventoryQuantityDisplay(item: InventoryItemRecord): string {
    if (this.hasInventoryCableBreakdown(item)) {
      return `${this.formatCurrency(item.stock)} m`;
    }

    return `${this.formatCurrency(item.stock)}`;
  }

  protected inventoryMinStockDisplay(item: InventoryItemRecord): string {
    if (this.hasInventoryCableBreakdown(item)) {
      return `${this.formatCurrency(item.minStock)} m`;
    }

    return `${this.formatCurrency(item.minStock)}`;
  }

  protected inventoryCableRollCountDisplay(item: InventoryItemRecord): string {
    if (!this.hasInventoryCableBreakdown(item)) {
      return '';
    }

    const metersPerRoll = Math.max(0, Number(item.cableMetersPerRoll) || 0);
    const stock = Math.max(0, Number(item.stock) || 0);

    if (!metersPerRoll) {
      return '';
    }

    return this.formatCurrency(stock / metersPerRoll);
  }

  protected inventoryUnitCostDisplay(item: InventoryItemRecord): string {
    if (this.hasInventoryCableBreakdown(item)) {
      return `€ ${this.formatCurrency(item.unitCost)} / m`;
    }

    return `€ ${this.formatCurrency(item.unitCost)}`;
  }

  protected inventorySalePriceDisplay(item: InventoryItemRecord): string {
    if (this.hasInventoryCableBreakdown(item)) {
      return `€ ${this.formatCurrency(item.salePrice)} / m`;
    }

    return `€ ${this.formatCurrency(item.salePrice)}`;
  }

  protected inventoryCableBreakdownLabel(item: InventoryItemRecord): string {
    if (!this.hasInventoryCableBreakdown(item)) {
      return '';
    }

    const metersPerRoll = Math.max(0, Number(item.cableMetersPerRoll) || 0);
    const stock = Math.max(0, Number(item.stock) || 0);
    const fullRolls = Math.floor(stock / metersPerRoll);
    const looseMeters = stock % metersPerRoll;

    if (!looseMeters) {
      return `${this.formatCurrency(fullRolls)} rotoli da ${this.formatCurrency(metersPerRoll)} m`;
    }

    if (!fullRolls) {
      return `${this.formatCurrency(stock)} m disponibili su rotoli da ${this.formatCurrency(metersPerRoll)} m`;
    }

    return `${this.formatCurrency(fullRolls)} rotoli da ${this.formatCurrency(metersPerRoll)} m + ${this.formatCurrency(looseMeters)} m residui`;
  }

  protected inventoryLotQuantityDisplay(lot: WarehouseLotRecord): string {
    const item = this.allInventoryItems().find((entry) => entry.id === lot.inventoryItemId) ?? null;
    return this.hasInventoryCableBreakdown(item)
      ? `${this.formatCurrency(lot.availableQuantity)} m`
      : `${this.formatCurrency(lot.availableQuantity)}`;
  }

  protected isWarehouseExpenseMode(): boolean {
    return (
      this.warehouseReceiptMode() === 'new' &&
      this.warehouseReceiptForm.controls.usageType.value === 'uso-negozio' &&
      this.warehouseReceiptForm.controls.registrationMode.value === 'spesa'
    );
  }

  protected updateWarehouseUsageType(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    const usageType = (target?.value as InventoryItemRecord['usageType'] | null) ?? 'rivendita';

    this.warehouseReceiptForm.patchValue({
      usageType,
      registrationMode: usageType === 'uso-negozio' ? this.warehouseReceiptForm.controls.registrationMode.value : 'inventario',
    });

    if (usageType !== 'uso-negozio') {
      this.warehouseReceiptForm.patchValue({
        salePrice: Math.max(0, Number(this.warehouseReceiptForm.controls.salePrice.value) || 0),
      });
    }
  }

  protected updateWarehouseCategory(): void {
    this.syncWarehouseReceiptCategoryState();
  }

  protected updateWarehouseCableFields(): void {
    this.syncWarehouseReceiptCableQuantity();
  }

  protected updateWarehouseRegistrationMode(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    const registrationMode = (target?.value as 'inventario' | 'spesa' | null) ?? 'inventario';
    this.warehouseReceiptForm.patchValue({
      registrationMode,
    });

    if (registrationMode === 'spesa') {
      this.warehouseReceiptForm.patchValue({
        salePrice: 0,
        shelfCode: '',
        minStock: 0,
      });
    }
  }

  protected formatCurrency(value: number | null | undefined): string {
    return (Number(value) || 0).toLocaleString('it-IT');
  }

  protected formatReportMetric(value: number, kind: 'currency' | 'number' = 'number'): string {
    return kind === 'currency' ? `€ ${this.formatCurrency(value)}` : `${value}`;
  }

  private reportCashDocumentTypeLabel(type: CashTransactionRecord['documentType']): string {
    return type === 'fattura' ? 'Fattura' : 'Scontrino';
  }

  private reportCashPaymentMethodLabel(method: CashTransactionRecord['paymentMethod']): string {
    switch (method) {
      case 'contanti':
        return 'Contanti';
      case 'pos':
        return 'POS';
      case 'bonifico':
        return 'Bonifico';
      case 'misto':
        return 'Misto';
      default:
        return method;
    }
  }

  private reportTotalsByPaymentMethod(
    transactions: CashTransactionRecord[],
  ): Record<CashTransactionRecord['paymentMethod'], number> {
    return transactions.reduce(
      (totals, transaction) => {
        totals[transaction.paymentMethod] += transaction.total;
        return totals;
      },
      { contanti: 0, pos: 0, bonifico: 0, misto: 0 },
    );
  }

  private buildReportPeriodRange(
    preset: ReportPeriodPreset,
    customFrom: string,
    customTo: string,
    compareEnabled: boolean,
  ): ReportPeriodRange {
    const today = new Date();
    const todayIso = this.toIsoDateOnly(today);
    let from = todayIso;
    let to = todayIso;
    let label = 'Oggi';

    switch (preset) {
      case 'oggi':
        break;
      case 'ultimi-7':
        from = this.addDaysIso(todayIso, -6);
        label = 'Ultimi 7 giorni';
        break;
      case 'ultimi-30':
        from = this.addDaysIso(todayIso, -29);
        label = 'Ultimi 30 giorni';
        break;
      case 'mese-corrente':
        from = this.startOfMonthIso(todayIso);
        to = this.endOfMonthIso(todayIso);
        label = 'Mese corrente';
        break;
      case 'mese-precedente': {
        const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const previousIso = this.toIsoDateOnly(previousMonth);
        from = this.startOfMonthIso(previousIso);
        to = this.endOfMonthIso(previousIso);
        label = 'Mese precedente';
        break;
      }
      case 'trimestre-corrente':
        from = this.startOfQuarterIso(todayIso);
        to = this.endOfQuarterIso(todayIso);
        label = 'Trimestre corrente';
        break;
      case 'anno-corrente':
        from = this.startOfYearIso(todayIso);
        to = this.endOfYearIso(todayIso);
        label = 'Anno corrente';
        break;
      case 'anno-precedente': {
        const year = today.getFullYear() - 1;
        from = `${year}-01-01`;
        to = `${year}-12-31`;
        label = 'Anno precedente';
        break;
      }
      case 'custom':
        from = customFrom || this.addDaysIso(todayIso, -29);
        to = customTo || todayIso;
        label = from === to ? `Data ${this.epFormatDate(from)}` : `${this.epFormatDate(from)} - ${this.epFormatDate(to)}`;
        break;
    }

    if (from > to) {
      [from, to] = [to, from];
    }

    const spanDays = Math.max(1, this.diffDaysInclusive(from, to));
    const previousTo = this.addDaysIso(from, -1);
    const previousFrom = this.addDaysIso(previousTo, -(spanDays - 1));

    return {
      label,
      from,
      to,
      previousLabel: compareEnabled
        ? previousFrom === previousTo
          ? `Confronto ${this.epFormatDate(previousFrom)}`
          : `${this.epFormatDate(previousFrom)} - ${this.epFormatDate(previousTo)}`
        : 'Confronto disattivato',
      previousFrom,
      previousTo,
      compareEnabled,
    };
  }

  private buildReportOverviewCard(
    input: Omit<ReportOverviewCard, 'delta' | 'deltaPercent' | 'trend'>,
  ): ReportOverviewCard {
    const compareEnabled = this.reportPeriodRange().compareEnabled;
    const previousValue = compareEnabled ? input.previousValue ?? 0 : null;
    const delta = compareEnabled && previousValue !== null ? input.value - previousValue : null;
    const deltaPercent =
      compareEnabled && previousValue !== null
        ? previousValue === 0
          ? input.value === 0
            ? 0
            : 100
          : Math.round((delta! / previousValue) * 100)
        : null;
    const trend =
      delta === null
        ? 'none'
        : delta > 0
          ? 'up'
          : delta < 0
            ? 'down'
            : 'flat';

    return {
      ...input,
      previousValue,
      delta,
      deltaPercent,
      trend,
    };
  }

  private filterRecordsByIsoDate<T>(
    records: T[],
    extractor: (record: T) => string | null | undefined,
    from: string,
    to: string,
  ): T[] {
    return records.filter((record) => {
      const iso = this.extractIsoDateOnly(extractor(record));
      return !!iso && iso >= from && iso <= to;
    });
  }

  private buildReportDonutChart(
    key: string,
    title: string,
    subtitle: string,
    sourceSegments: Array<{
      label: string;
      value: number;
      detail: string;
      color: string;
    }>,
    kind: 'currency' | 'number',
  ): ReportDonutChart {
    const validSegments = sourceSegments.filter((segment) => segment.value > 0);
    const fallbackSegments = validSegments.length
      ? validSegments
      : [
        {
          label: 'Nessun dato',
          value: 1,
          detail: 'Nessun valore disponibile al momento',
          color: '#cbd5e1',
        },
      ];
    const total = validSegments.reduce((sum, segment) => sum + segment.value, 0);
    let cursor = 0;

    const segments = fallbackSegments.map((segment, index, allSegments) => {
      const share =
        index === allSegments.length - 1
          ? Math.max(0, 100 - cursor)
          : Math.round((segment.value / allSegments.reduce((sum, item) => sum + item.value, 0)) * 100);
      const normalizedShare = Math.max(share, 0);
      const start = cursor;
      cursor += normalizedShare;

      return {
        ...segment,
        share: normalizedShare,
        _start: start,
        _end: cursor,
      };
    });

    const gradient = `conic-gradient(${segments
      .map((segment) => `${segment.color} ${segment._start}% ${segment._end}%`)
      .join(', ')})`;
    const searchableText = segments
      .map((segment) => `${segment.label} ${segment.detail} ${segment.value}`)
      .join(' ');

    return {
      key,
      title,
      subtitle,
      kind,
      total,
      totalLabel: this.formatReportMetric(total, kind),
      searchableText,
      gradient,
      segments: segments.map(({ _start, _end, ...segment }) => segment),
    };
  }

  private parseReportPage(value: string | null): ReportPageKey {
    switch (value) {
      case 'economici':
      case 'clienti':
      case 'preventivi':
      case 'servizi':
      case 'documenti':
      case 'magazzino':
      case 'altre':
        return value;
      default:
        return 'dashboard';
    }
  }

  private reportPageForSection(section: ReportSectionKey): ReportPageKey {
    switch (section) {
      case 'overview':
        return 'dashboard';
      case 'cross':
        return 'altre';
      case 'commerciale':
        return 'preventivi';
      case 'operatività':
        return 'servizi';
      case 'amministrazione':
        return 'documenti';
      case 'alert':
        return 'altre';
      default:
        return 'dashboard';
    }
  }

  private filterReportOverviewCardsByLabels(labels: string[]): ReportOverviewCard[] {
    const allowed = new Set(labels);
    return this.reportOverviewCards().filter((card) => allowed.has(card.label));
  }

  private buildReportTrendChart(transactions: CashTransactionRecord[]): ReportTrendChart {
    const range = this.reportPeriodRange();
    const totalDays = Math.max(1, this.diffDaysInclusive(range.from, range.to));
    const bucketMode: 'day' | 'week' | 'month' =
      totalDays <= 14 ? 'day' : totalDays <= 90 ? 'week' : 'month';
    const buckets: Array<{ label: string; total: number }> = [];

    if (bucketMode === 'day') {
      let cursor = range.from;
      while (cursor <= range.to) {
        buckets.push({
          label: this.reportTrendLabel(cursor, cursor, 'day'),
          total: 0,
        });
        cursor = this.addDaysIso(cursor, 1);
      }
    } else if (bucketMode === 'week') {
      let cursor = range.from;
      while (cursor <= range.to) {
        const weekEnd = this.addDaysIso(cursor, Math.min(6, Math.max(0, this.diffDaysInclusive(cursor, range.to) - 1)));
        buckets.push({
          label: this.reportTrendLabel(cursor, weekEnd, 'week'),
          total: 0,
        });
        cursor = this.addDaysIso(weekEnd, 1);
      }
    } else {
      const start = new Date(`${range.from}T12:00:00`);
      const end = new Date(`${range.to}T12:00:00`);
      let current = new Date(start.getFullYear(), start.getMonth(), 1);
      while (current <= end) {
        const monthStart = this.toIsoDateOnly(current);
        const nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        const monthEndDate = new Date(nextMonth.getTime() - 86400000);
        const monthEnd = this.toIsoDateOnly(monthEndDate);
        buckets.push({
          label: this.reportTrendLabel(monthStart, monthEnd, 'month'),
          total: 0,
        });
        current = nextMonth;
      }
    }

    transactions.forEach((transaction) => {
      const isoDate = this.extractIsoDateOnly(transaction.settledAt || transaction.createdAt);
      if (!isoDate) {
        return;
      }

      if (bucketMode === 'day') {
        const bucketIndex = Math.max(0, this.diffDaysInclusive(range.from, isoDate) - 1);
        if (bucketIndex < buckets.length) {
          buckets[bucketIndex].total += transaction.total;
        }
        return;
      }

      if (bucketMode === 'week') {
        let cursor = range.from;
        let bucketIndex = 0;
        while (cursor <= range.to && bucketIndex < buckets.length) {
          const weekEnd = this.addDaysIso(cursor, Math.min(6, Math.max(0, this.diffDaysInclusive(cursor, range.to) - 1)));
          if (isoDate >= cursor && isoDate <= weekEnd) {
            buckets[bucketIndex].total += transaction.total;
            return;
          }
          cursor = this.addDaysIso(weekEnd, 1);
          bucketIndex += 1;
        }
        return;
      }

      const txDate = new Date(`${isoDate}T12:00:00`);
      const bucketIndex =
        (txDate.getFullYear() - new Date(`${range.from}T12:00:00`).getFullYear()) * 12 +
        txDate.getMonth() -
        new Date(`${range.from}T12:00:00`).getMonth();
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        buckets[bucketIndex].total += transaction.total;
      }
    });

    const values = buckets.map((bucket) => bucket.total);
    const maxValue = Math.max(...values, 1);
    const chartWidth = 216;
    const chartHeight = 72;
    const points = buckets.map((bucket, index, allBuckets) => {
      const x = allBuckets.length === 1 ? chartWidth / 2 : (index / Math.max(allBuckets.length - 1, 1)) * chartWidth;
      const y = chartHeight - (bucket.total / maxValue) * (chartHeight - 12) - 6;
      return {
        label: bucket.label,
        value: bucket.total,
        valueLabel: this.formatReportMetric(bucket.total, 'currency'),
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
      };
    });
    const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
    const area = points.length
      ? `0,${chartHeight} ${polyline} ${chartWidth},${chartHeight}`
      : '';

    return {
      title: 'Andamento incassi',
      subtitle:
        bucketMode === 'day'
          ? 'Distribuzione giornaliera del periodo'
          : bucketMode === 'week'
            ? 'Distribuzione settimanale del periodo'
            : 'Distribuzione mensile del periodo',
      totalLabel: this.formatReportMetric(values.reduce((sum, value) => sum + value, 0), 'currency'),
      maxLabel: this.formatReportMetric(maxValue, 'currency'),
      polyline,
      area,
      points,
    };
  }

  private reportTrendLabel(from: string, to: string, mode: 'day' | 'week' | 'month'): string {
    const date = new Date(`${from}T12:00:00`);
    const monthLabels = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    if (mode === 'month') {
      return `${monthLabels[date.getMonth()]}`;
    }
    if (mode === 'week') {
      return `${from.slice(8, 10)}-${to.slice(8, 10)} ${monthLabels[date.getMonth()]}`;
    }
    return `${from.slice(8, 10)}/${from.slice(5, 7)}`;
  }

  private extractIsoDateOnly(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    return String(value).slice(0, 10);
  }

  private toIsoDateOnly(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private addDaysIso(isoDate: string, days: number): string {
    const date = new Date(`${isoDate}T12:00:00`);
    date.setDate(date.getDate() + days);
    return this.toIsoDateOnly(date);
  }

  private diffDaysInclusive(from: string, to: string): number {
    const start = new Date(`${from}T12:00:00`).getTime();
    const end = new Date(`${to}T12:00:00`).getTime();
    return Math.round((end - start) / 86400000) + 1;
  }

  private startOfQuarterIso(isoDate: string): string {
    const date = new Date(`${isoDate}T12:00:00`);
    const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
    date.setMonth(quarterMonth, 1);
    return this.toIsoDateOnly(date);
  }

  private endOfQuarterIso(isoDate: string): string {
    const date = new Date(`${isoDate}T12:00:00`);
    const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
    date.setMonth(quarterMonth + 3, 0);
    return this.toIsoDateOnly(date);
  }

  private startOfYearIso(isoDate: string): string {
    const date = new Date(`${isoDate}T12:00:00`);
    date.setMonth(0, 1);
    return this.toIsoDateOnly(date);
  }

  private endOfYearIso(isoDate: string): string {
    const date = new Date(`${isoDate}T12:00:00`);
    date.setMonth(11, 31);
    return this.toIsoDateOnly(date);
  }

  private reportSearchTokens(): string[] {
    return this.reportSearch()
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
  }

  protected reportMatchesSearch(...values: Array<string | number | null | undefined>): boolean {
    const tokens = this.reportSearchTokens();
    if (!tokens.length) {
      return true;
    }

    const haystack = values
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value).toLowerCase())
      .join(' ');

    return tokens.every((token) => haystack.includes(token));
  }

  private reportSectionSearchKeywords(section: ReportSectionKey): string {
    switch (section) {
      case 'overview':
        return 'kpi overview dashboard cassa preventivi magazzino spese clienti ticket';
      case 'cross':
        return 'incroci moduli collegamenti fornitori servizi clienti magazzino cassa';
      case 'commerciale':
        return 'commerciale crm clienti preventivi conversione servizi vendite fidelizzazione';
      case 'operatività':
        return 'operatività agenda ticket tecnico magazzino consumi movimenti stock';
      case 'amministrazione':
        return 'amministrazione cassa contanti pos bonifico misto spese fornitori rate';
      case 'alert':
        return 'alert priorità insoluti urgenze scorte agenda criticità';
    }
  }

  protected warehouseMovementTypeLabel(type: WarehouseMovementRecord['movementType']): string {
    if (type === 'carico') {
      return 'Carico';
    }

    if (type === 'scarico') {
      return 'Scarico';
    }

    if (type === 'prenotazione') {
      return 'Prenotazione';
    }

    return 'Rettifica';
  }

  protected warehouseSourceModuleLabel(source: WarehouseMovementRecord['sourceModule']): string {
    if (source === 'magazzino') {
      return 'Acquisto';
    }

    if (source === 'cassa') {
      return 'Cassa';
    }

    if (source === 'tecnico') {
      return 'Servizio tecnico';
    }

    return 'Uso interno';
  }

  protected downloadWarehouseTemplateCsv(): void {
    const rows = [
      [
        'sku',
        'barcode',
        'nome',
        'categoria',
        'destinazione',
        'rotoli',
        'metri_per_rotolo',
        'quantità',
        'prezzo_acquisto',
        'prezzo_rivendita',
        'fornitore',
        'scaffale',
        'sottoscorta',
        'documento_acquisto',
        'data_ricevimento',
      ],
      [
        'SKU-001',
        '8050000000001',
        'Prodotto esempio',
        'Cablaggio',
        'rivendita',
        '2',
        '100',
        '200',
        '2.80',
        '5.40',
        'Nome fornitore',
        'A-01-01',
        '80',
        'DDT-001',
        new Date().toISOString().slice(0, 10),
      ],
    ];
    this.downloadCsv(rows, `template-magazzino-${new Date().toISOString().slice(0, 10)}.csv`);
    this.pushToast('Template magazzino scaricato.', 'success');
  }

  protected warehouseValuationDateLabel(): string {
    return this.warehouseValuationDate() || new Date().toISOString().slice(0, 10);
  }

  protected exportWarehouseInventoryCsv(): void {
    const rows = [
      ['SKU', 'Barcode', 'Prodotto', 'Categoria', 'Destinazione', 'Rotoli', 'Metri per rotolo', 'Giacenza', 'Sottoscorta', 'Prezzo acquisto', 'Prezzo rivendita', 'Valore stock', 'Fornitore', 'Scaffale', 'Anomalia'],
      ...this.warehouseInventoryExportRows().map((entry) => [
        entry.item.sku,
        entry.item.barcode || '',
        entry.item.name,
        entry.item.category,
        this.warehouseUsageTypeLabel(entry.item.usageType),
        this.inventoryCableRollCountDisplay(entry.item),
        entry.item.cableMetersPerRoll ?? '',
        this.inventoryQuantityDisplay(entry.item),
        this.inventoryMinStockDisplay(entry.item),
        this.inventoryUnitCostDisplay(entry.item),
        this.inventorySalePriceDisplay(entry.item),
        Number(entry.valuation || 0).toFixed(2),
        entry.item.supplier,
        entry.item.location,
        entry.anomaly,
      ]),
    ];
    this.downloadCsv(rows, `giacenze-magazzino-${this.warehouseValuationDateLabel()}.csv`);
    this.pushToast('Giacenze magazzino esportate in CSV.', 'success');
  }

  protected exportWarehouseInventoryPdf(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const rows = this.warehouseInventoryExportRows()
      .map(
        (entry) => `
          <tr class="${entry.item.stock < 0 ? 'negative' : ''}">
            <td>${this.escapeHtml(entry.item.sku)}</td>
            <td>${this.escapeHtml(entry.item.name)}</td>
            <td>${this.escapeHtml(this.warehouseUsageTypeLabel(entry.item.usageType))}</td>
            <td>${this.escapeHtml(this.inventoryCableBreakdownLabel(entry.item) || '-')}</td>
            <td style="text-align:right">${this.escapeHtml(this.inventoryQuantityDisplay(entry.item))}</td>
            <td style="text-align:right">${this.escapeHtml(this.inventoryUnitCostDisplay(entry.item))}</td>
            <td style="text-align:right">€ ${this.formatCurrency(entry.valuation)}</td>
            <td>${this.escapeHtml(entry.item.location)}</td>
          </tr>`,
      )
      .join('');
    const popup = window.open('', '_blank', 'width=1180,height=780');

    if (!popup) {
      this.pushToast('Popup bloccato dal browser: impossibile aprire il PDF inventario.', 'error');
      return;
    }

    popup.document.open();
    popup.document.write(`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Inventario magazzino</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:24px;color:#0f172a}
    h1{font-size:20px;margin:0 0 8px}
    p{margin:0 0 16px;color:#475569}
    table{width:100%;border-collapse:collapse}
    th,td{border-bottom:1px solid #e2e8f0;padding:10px 8px;font-size:12px}
    th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#475569}
    .meta{display:flex;justify-content:space-between;gap:12px;margin-bottom:18px}
    .box{padding:12px 14px;border:1px solid #cbd5e1;border-radius:12px}
    .negative td{background:#fff1f2;color:#991b1b;font-weight:700}
  </style>
</head>
<body>
  <div class="meta">
    <div>
      <h1>Inventario magazzino</h1>
      <p>Situazione valorizzata al ${this.escapeHtml(this.warehouseValuationDateLabel())}</p>
    </div>
    <div class="box">
      <div><strong>Valore totale</strong></div>
      <div>€ ${this.formatCurrency(this.warehouseValuationTotalValue())}</div>
      <div>Articoli: ${this.warehouseInventoryExportRows().length}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>SKU</th>
        <th>Prodotto</th>
        <th>Destinazione</th>
        <th>Cablaggio</th>
        <th style="text-align:right">Giacenza</th>
        <th style="text-align:right">Acquisto</th>
        <th style="text-align:right">Valore</th>
        <th>Scaffale</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`);
    popup.document.close();
    popup.focus();
    setTimeout(() => {
      popup.print();
    }, 250);
  }

  protected updateExpenseQuery(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.expenseQuery.set(target?.value ?? '');
  }

  protected updateExpenseStatusFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.expenseStatusFilter.set((target?.value as 'tutte' | ExpenseRecord['status']) ?? 'tutte');
  }

  protected updateExpensePaymentModeFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.expensePaymentModeFilter.set(
      (target?.value as 'tutte' | ExpenseRecord['paymentMode']) ?? 'tutte',
    );
  }

  protected updateExpenseSupplierFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.expenseSupplierFilter.set(target?.value ?? 'tutti');
  }

  protected setExpenseView(view: 'registro' | 'scadenze' | 'fornitori' | 'audit' | 'statistiche'): void {
    this.expenseView.set(view);
  }

  protected selectExpense(id: string): void {
    this.selectedExpenseId.set(id);
  }

  protected updateWarehouseMovementTypeFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.warehouseMovementTypeFilter.set(
      (target?.value as 'tutti' | WarehouseMovementRecord['movementType']) ?? 'tutti',
    );
  }

  protected updateWarehouseOperatorFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.warehouseOperatorFilter.set(target?.value ?? 'tutti');
  }

  protected updateWarehouseMovementDateFrom(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.warehouseMovementDateFrom.set(target?.value ?? '');
  }

  protected updateWarehouseMovementDateTo(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.warehouseMovementDateTo.set(target?.value ?? '');
  }

  protected updateCashProductQuery(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashProductQuery.set(target?.value ?? '');
  }

  protected updateCashCategoryFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.cashCategoryFilter.set(
      target?.value ?? 'tutte',
    );
  }

  protected updateListinoQuery(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.listinoQuery.set(target?.value ?? '');
  }

  protected updateListinoCategoryFilter(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.listinoCategoryFilter.set(target?.value ?? 'tutte');
  }

  protected isListinoSelected(id: string): boolean {
    return this.listinoSelectedIds().includes(id);
  }

  protected toggleListinoSelection(id: string): void {
    this.listinoSelectedIds.update((ids) => (ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id]));
  }

  /** Seleziona tutte le voci attualmente visibili con i filtri attivi */
  protected listinoSelectAllVisible(): void {
    const visibleIds = this.listinoFilteredProducts().map((item) => item.id);
    this.listinoSelectedIds.update((ids) => [...new Set([...ids, ...visibleIds])]);
  }

  protected listinoClearSelection(): void {
    this.listinoSelectedIds.set([]);
  }

  /** Esporta le voci selezionate in un listino pronto per la stampa o il salvataggio in PDF */
  protected exportListinoPdf(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const selected = this.listinoSelectedProducts();
    if (!selected.length) {
      this.pushToast('Seleziona almeno una voce di listino da esportare.', 'error');
      return;
    }

    // Raggruppo per categoria: il listino si legge a colpo d'occhio
    const grouped = new Map<string, CashRegisterProductRecord[]>();
    for (const product of selected) {
      const key = product.category?.trim() || 'Senza categoria';
      const bucket = grouped.get(key) ?? [];
      bucket.push(product);
      grouped.set(key, bucket);
    }

    const rows = [...grouped.entries()]
      .map(
        ([category, items]) => `
          <tr class="group"><td colspan="3">${this.escapeHtml(category)}</td></tr>
          ${items
            .map(
              (item) => `
          <tr>
            <td>${this.escapeHtml(item.name)}</td>
            <td>${this.escapeHtml(this.pricingModeLabel(item.pricingMode))}</td>
            <td class="price">€ ${this.escapeHtml(this.formatCurrency(this.resolveCashProductPrice(item)))}</td>
          </tr>`,
            )
            .join('')}`,
      )
      .join('');

    const company = this.companyProfile();
    const popup = window.open('', '_blank', 'width=1180,height=780');
    if (!popup) {
      this.pushToast('Popup bloccato dal browser: impossibile aprire il listino.', 'error');
      return;
    }

    popup.document.open();
    popup.document.write(`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Listino servizi</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:28px;color:#0f172a}
    header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #0f9f6d;padding-bottom:14px;margin-bottom:20px}
    h1{font-size:22px;margin:0 0 6px;letter-spacing:.02em}
    .brand{font-size:15px;font-weight:800;color:#0f9f6d;text-transform:uppercase;letter-spacing:.14em;margin:0 0 4px}
    .meta{font-size:12px;color:#475569;line-height:1.5;margin:0}
    .box{border:1px solid #cbd5e1;border-radius:12px;padding:12px 16px;text-align:right;font-size:12px;color:#475569;min-width:190px}
    .box strong{display:block;font-size:18px;color:#0f172a}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;border-bottom:1px solid #cbd5e1;padding:8px 10px}
    th.right{text-align:right}
    td{padding:9px 10px;font-size:13px;border-bottom:1px solid #eef2f7}
    td.price{text-align:right;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
    tr.group td{background:#f1faf6;color:#0f9f6d;font-weight:900;text-transform:uppercase;letter-spacing:.06em;font-size:11px;border-bottom:1px solid #d7ece2}
    footer{margin-top:18px;font-size:11px;color:#94a3b8;text-align:center}
    @media print{body{margin:14mm}@page{size:A4 portrait;margin:10mm}}
  </style>
</head>
<body>
  <header>
    <div>
      <p class="brand">${this.escapeHtml(company.legalName || 'AudioMax')}</p>
      <h1>Listino servizi</h1>
      <p class="meta">
        ${this.escapeHtml([company.address, company.postalCode, company.city, company.province].filter((value) => !!value).join(' '))}<br>
        ${company.vatNumber ? `P.IVA ${this.escapeHtml(company.vatNumber)}` : ''}
        ${company.phone ? ` · Tel. ${this.escapeHtml(company.phone)}` : ''}
      </p>
    </div>
    <div class="box">
      <span>Voci selezionate</span>
      <strong>${selected.length}</strong>
      <span>Totale listino € ${this.escapeHtml(this.formatCurrency(this.listinoSelectionTotal()))}</span>
    </div>
  </header>
  <table>
    <thead>
      <tr>
        <th>Voce</th>
        <th>Tariffazione</th>
        <th class="right">Prezzo</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <footer>Listino generato il ${this.escapeHtml(new Date().toLocaleDateString('it-IT'))}</footer>
</body>
</html>`);
    popup.document.close();
    popup.focus();
    setTimeout(() => {
      popup.print();
    }, 250);
    this.pushToast('Listino pronto: usa "Salva come PDF" nella finestra di stampa.', 'success');
  }

  protected dismissToast(): void {
    this.toastMessage.set(null);
  }

  protected hasFieldError(form: FormGroup, controlName: string): boolean {
    const control = form.get(controlName);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  protected shouldShowFormValidation(form: FormGroup): boolean {
    return form.invalid && (form.touched || form.dirty);
  }

  protected hasCashDiscount(): boolean {
    return this.cashDiscountAmount() > 0;
  }

  protected hasCashHiddenReceiptTotal(): boolean {
    return this.cashHiddenReceiptTotal() > 0;
  }

  protected hasCashDailyDiscounts(): boolean {
    return this.cashTodayDiscountTotal() > 0;
  }

  protected fieldError(form: FormGroup, controlName: string, label: string): string {
    const control = form.get(controlName);
    if (!control?.errors) {
      return '';
    }

    if (control.errors['required']) {
      return `${label} obbligatorio.`;
    }
    if (control.errors['email']) {
      return `${label} non valido.`;
    }
    if (control.errors['min']) {
      return `${label} inferiore al minimo consentito.`;
    }
    if (control.errors['max']) {
      return `${label} superiore al massimo consentito.`;
    }
    return `${label} non valido.`;
  }

  protected hasFormDraft(key: string): boolean {
    return this.formDrafts.hasDraft(key);
  }

  protected formDraftLabel(key: string): string {
    const savedAt = this.formDrafts.savedAt(key);
    if (!savedAt) {
      return '';
    }

    return `Bozza salvata ${new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(savedAt))}`;
  }

  protected updateCashCustomerName(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashClientLookup.set(target?.value ?? '');
  }

  protected updateCashNewClientName(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashNewClientName.set(target?.value ?? '');
  }

  protected updateCashNewClientPhone(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashNewClientPhone.set(target?.value ?? '');
  }

  protected updateCashNewClientCity(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashNewClientCity.set(target?.value ?? '');
  }

  protected updateCashNewClientEmail(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashNewClientEmail.set(target?.value ?? '');
  }

  protected setCashNewClientIsCompany(value: boolean): void {
    this.cashNewClientIsCompany.set(value);
    if (!value) {
      this.cashNewClientTaxId.set('');
      this.cashNewClientSdiCode.set('');
      this.cashNewClientPec.set('');
      this.cashNewClientBillingAddress.set('');
    }
  }

  protected updateCashNewClientTaxId(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashNewClientTaxId.set(target?.value ?? '');
  }

  protected updateCashNewClientSdiCode(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashNewClientSdiCode.set(target?.value ?? '');
  }

  protected updateCashNewClientPec(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashNewClientPec.set(target?.value ?? '');
  }

  protected updateCashNewClientBillingAddress(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashNewClientBillingAddress.set(target?.value ?? '');
  }

  protected updateCashCustomerPhone(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashCustomerPhone.set(target?.value ?? '');
  }

  protected updateCashCustomerCity(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashCustomerCity.set(target?.value ?? '');
  }

  protected updateCashCustomerEmail(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashCustomerEmail.set(target?.value ?? '');
  }

  protected updateCashNotes(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
    this.cashNotes.set(target?.value ?? '');
  }

  protected updateCashReceivedAmount(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.cashReceivedAmount.set(Number(target?.value ?? 0));
  }

  protected clientPendingAmount(clientId: string): number {
    return this.cashPendingSummaryByClientId().get(clientId)?.total ?? 0;
  }

  protected clientPendingCount(clientId: string): number {
    return this.cashPendingSummaryByClientId().get(clientId)?.count ?? 0;
  }

  protected clientHasPendingTransactions(clientId: string): boolean {
    return this.clientPendingCount(clientId) > 0;
  }

  protected cashStatusLabel(status: CashTransactionRecord['status']): string {
    if (status === 'insoluto') {
      return 'insoluto';
    }
    if (status === 'sospeso') {
      return 'in attesa';
    }
    return 'pagato';
  }

  private syncCashReceiptEditForm(receipt: CashTransactionRecord | null): void {
    this.cashReceiptEditForm.reset({
      customerName: receipt?.customerName ?? '',
      paymentMethod: receipt?.paymentMethod ?? 'pos',
      status: receipt?.status ?? 'pagato',
      notes: receipt?.notes ?? '',
    });
  }

  private currentCashSessionHasContent(): boolean {
    const normalizedName = this.cashCustomerName().trim().toLowerCase();

    return (
      this.cashCart().length > 0 ||
      !!this.selectedCashClientId() ||
      (!!normalizedName && normalizedName !== 'cliente di passaggio') ||
      !!this.cashLinkedQuoteId() ||
      !!this.cashNotes().trim()
    );
  }

  private buildCashQueuedSession(): CashDeskSessionDraft {
    return {
      id: `cash-queue-${crypto.randomUUID()}`,
      queuedAt: new Date().toISOString(),
      customerMode: this.cashCustomerMode(),
      clientId: this.selectedCashClientId(),
      customerName: this.cashCustomerName(),
      customerPhone: this.cashCustomerPhone(),
      customerCity: this.cashCustomerCity(),
      customerEmail: this.cashCustomerEmail(),
      notes: this.cashNotes(),
      receivedAmount: this.cashReceivedAmount(),
      discountValue: this.cashDiscountValue(),
      discountType: this.cashDiscountType(),
      discountNote: this.cashDiscountNote(),
      linkedQuoteId: this.cashLinkedQuoteId(),
      pendingTransactionId: this.cashPendingTransactionId(),
      paymentMethod: this.cashPaymentMethod(),
      mixedCashAmount: this.cashMixedCashAmount(),
      mixedElectronicAmount: this.cashMixedElectronicAmount(),
      mixedElectronicMethod: this.cashMixedElectronicMethod(),
      documentType: this.cashDocumentType(),
      salesMode: this.cashSalesMode(),
      currentOperator: this.cashCurrentOperator(),
      cart: this.cashCart().map((line) => ({ ...line })),
    };
  }

  private restoreCashQueuedSession(session: CashDeskSessionDraft): void {
    this.cashCustomerMode.set(session.customerMode);
    this.selectedCashClientId.set(session.clientId);
    this.cashCustomerName.set(session.customerName);
    this.cashClientLookup.set('');
    this.cashCustomerPhone.set(session.customerPhone);
    this.cashCustomerCity.set(session.customerCity);
    this.cashCustomerEmail.set(session.customerEmail);
    this.cashNotes.set(session.notes);
    this.cashReceivedAmount.set(session.receivedAmount);
    this.cashDiscountValue.set(session.discountValue);
    this.cashDiscountType.set(session.discountType);
    this.cashDiscountNote.set(session.discountNote);
    this.cashLinkedQuoteId.set(session.linkedQuoteId);
    this.cashPendingTransactionId.set(session.pendingTransactionId);
    this.cashPaymentMethod.set(session.paymentMethod);
    this.cashMixedCashAmount.set(session.mixedCashAmount);
    this.cashMixedElectronicAmount.set(session.mixedElectronicAmount);
    this.cashMixedElectronicMethod.set(session.mixedElectronicMethod);
    this.cashDocumentType.set(session.documentType);
    this.cashSalesMode.set(session.salesMode === 'storico' ? 'tutti' : session.salesMode);
    this.cashCurrentOperator.set(session.currentOperator);
    this.cashCart.set(session.cart.map((line) => ({ ...line })));
    this.selectedCashProductId.set(null);
  }

  private stashCurrentCashSession(): boolean {
    if (!this.currentCashSessionHasContent() || this.cashIsSettlingPending()) {
      return false;
    }

    const snapshot = this.buildCashQueuedSession();
    this.cashQueuedSessions.update((items) => [snapshot, ...items]);
    this.resetCashCurrentSession();
    return true;
  }

  private resetCashCurrentSession(): void {
    this.cashCart.set([]);
    this.cashCustomerName.set('Cliente di passaggio');
    this.cashClientLookup.set('');
    this.cashCustomerPhone.set('');
    this.cashCustomerCity.set('');
    this.cashCustomerEmail.set('');
    this.cashPrivacyNoticeAcknowledged.set(false);
    this.cashPrivacyEmailMarketing.set(false);
    this.cashPrivacyWhatsappMarketing.set(false);
    this.cashPrivacyFidelityProfiling.set(false);
    this.cashNotes.set('');
    this.cashReceivedAmount.set(0);
    this.cashMixedCashAmount.set(0);
    this.cashMixedElectronicAmount.set(0);
    this.cashMixedElectronicMethod.set('bancomat');
    this.cashPosElectronicMethod.set('bancomat');
    this.cashDiscountValue.set(0);
    this.cashDiscountNote.set('');
    this.cashLinkedQuoteId.set(null);
    this.cashEditingTransactionId.set(null);
    this.cashPendingTransactionId.set(null);
    this.cashPaymentMethod.set('pos');
    this.cashDocumentType.set('scontrino');
    this.selectedCashProductId.set(null);
    this.selectedCashClientId.set(null);
    this.cashCustomerMode.set('walk-in');
    this.cashSalesMode.set('tutti');
  }

  private resetClientForm(): void {
    this.editingClientId.set(null);
    this.runWithoutDraftSync('client', () => {
      this.clientForm.reset({
        kind: 'privato',
        name: '',
        phone: '',
        email: '',
        city: '',
        address: '',
        segment: '',
        preferredContact: 'telefono',
        notes: '',
        favoriteBrands: '',
        status: 'lead',
        taxId: '',
        sdiCode: '',
        pec: '',
        billingAddress: '',
        billingPostalCode: '',
        billingProvince: '',
        billingCountry: 'IT',
      });
    });
  }

  /** Operatore da proporre di default nel preventivo: quello attivo se presente in elenco. */
  private defaultQuoteOperator(): string {
    const current = this.cashCurrentOperator();
    const operators = this.cashOperators();
    if (current && operators.includes(current)) {
      return current;
    }
    return operators[0] ?? '';
  }

  /** Scadenza proposta di default per un nuovo preventivo (oggi + 30 giorni). */
  private defaultQuoteDueDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().slice(0, 10);
  }

  private resetQuoteForm(): void {
    this.editingQuoteId.set(null);
    this.quoteClientLookup.set('');
    this.quoteBillingOpen.set(false);
    this.runWithoutDraftSync('quote', () => {
      this.quoteForm.reset({
        issueDate: new Date().toISOString().slice(0, 10),
        // Operatore precompilato con quello attivo (evita di doverlo scegliere ogni volta)
        operatorName: this.defaultQuoteOperator(),
        customerName: '',
        isAnonymous: false,
        discountAmount: 0,
        customerPhone: '',
        customerEmail: '',
        customerAddress: '',
        customerTaxId: '',
        customerPec: '',
        customerSdiCode: '',
        attachmentName: '',
        fulfillmentType: 'showroom',
        fulfillmentAddress: '',
        paymentPlan: 'unica',
        installmentCount: 3,
        installmentCadence: 'mensile',
        financingProvider: '',
        paymentAlertDays: 7,
        paymentNotes: '',
        projectType: '',
        value: 0,
        // Scadenza proposta a 30 giorni: modificabile, ma non più obbligatoria da digitare
        dueDate: this.defaultQuoteDueDate(),
        stage: 'bozza',
        serviceId: '',
        units: 1,
        notes: '',
      });
    });
    this.quoteDraftLines.set([
      {
        id: `qline-${crypto.randomUUID()}`,
        kind: 'servizio',
        description: '',
        quantity: 1,
        unitPrice: 0,
        vatRate: 22,
      },
    ]);
    this.quoteQuickServiceId.set('');
    this.quoteQuickProductId.set('');
  }

  protected updateQuoteValueFromService(): void {
    const controls = this.quoteForm.controls;
    const serviceId = controls.serviceId.value || '';
    const units = Math.max(1, Number(controls.units.value) || 1);

    if (!serviceId) {
      return;
    }

    const service = this.allCashProducts().find((item) => item.id === serviceId);

    if (!service) {
      return;
    }

    const nextValue = service.pricingMode === 'fisso' ? service.price : service.price * units;
    controls.value.setValue(nextValue);
  }

  protected addQuoteDraftLine(kind: QuoteLineRecord['kind'] = 'servizio'): void {
    this.quoteDraftLines.update((lines) => [
      ...lines,
      {
        id: `qline-${crypto.randomUUID()}`,
        kind,
        description: '',
        quantity: 1,
        unitPrice: 0,
        vatRate: 22,
      },
    ]);
  }

  protected removeQuoteDraftLine(id: string): void {
    // 🛡️ Conferma di sicurezza: evita eliminazioni accidentali
    const line = this.quoteDraftLines().find((l) => l.id === id);
    if (line && this.quoteDraftLines().length > 1) {
      const msg = `Eliminare la riga "${line.description || '(senza descrizione)'}"?\n\nQuesta azione non può essere annullata.`;
      if (!window.confirm(msg)) return;
    }
    this.quoteDraftLines.update((lines) => {
      const next = lines.filter((line) => line.id !== id);
      return next.length ? next : lines;
    });
    // Pulisce anche l'ID dal set delle righe in modalità testo libero
    this.quoteLineFreeTextIds.update((set) => {
      if (!set.has(id)) return set;
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }

  /**
   * Attiva/disattiva la modalità testo libero per una riga preventivo.
   * Quando attiva, la riga usa un input testo invece del dropdown dei servizi/prodotti.
   */
  protected toggleQuoteLineFreeText(id: string): void {
    this.quoteLineFreeTextIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  /** Restituisce true se la riga è in modalità testo libero ("Altro") */
  protected isQuoteLineFreeText(id: string): boolean {
    return this.quoteLineFreeTextIds().has(id);
  }

  protected updateQuoteDraftLine(
    id: string,
    field: 'description' | 'quantity' | 'unitPrice' | 'vatRate' | 'kind' | 'discountPercent',
    value: string,
  ): void {
    this.quoteDraftLines.update((lines) =>
      lines.map((line) => {
        if (line.id !== id) {
          return line;
        }

        if (field === 'description') {
          // Se l'utente seleziona "Altro (scrittura libera)" dal dropdown,
          // attiva la modalità testo libero e pulisce la descrizione
          if (value === '__altro__') {
            this.quoteLineFreeTextIds.update((set) => {
              if (set.has(id)) return set;
              const next = new Set(set);
              next.add(id);
              return next;
            });
            return { ...line, description: '' };
          }
          // Auto-compilazione: scegliendo un servizio o un articolo dal listino
          // proponiamo subito il prezzo, così non va digitato a mano.
          const listPrice = this.quoteLineListPrice(line.kind, value);
          if (listPrice !== null) {
            return { ...line, description: value, unitPrice: listPrice };
          }
          return { ...line, description: value };
        }

        if (field === 'kind') {
          const newKind = value as QuoteLineRecord['kind'];
          // Se il tipo è 'altro', attiva automaticamente la modalità testo libero
          if (newKind === 'altro') {
            this.quoteLineFreeTextIds.update((set) => {
              if (set.has(id)) return set;
              const next = new Set(set);
              next.add(id);
              return next;
            });
          } else {
            // Se torna a servizio/materiale, disattiva il testo libero
            this.quoteLineFreeTextIds.update((set) => {
              if (!set.has(id)) return set;
              const next = new Set(set);
              next.delete(id);
              return next;
            });
          }
          return { ...line, kind: newKind };
        }

        const numeric = Number(value) || 0;
        if (field === 'quantity') {
          return { ...line, quantity: Math.max(0, numeric) };
        }
        if (field === 'unitPrice') {
          return { ...line, unitPrice: Math.max(0, numeric) };
        }
        if (field === 'discountPercent') {
          return { ...line, discountPercent: Math.max(0, Math.min(100, numeric)) };
        }
        return { ...line, vatRate: Math.max(0, numeric) };
      }),
    );
  }

  /**
   * Ricava il prezzo di listino per una descrizione scelta nel preventivo:
   * servizio del listino cassa oppure articolo di magazzino (prezzo di vendita).
   * Ritorna null se la voce non è collegata a nessun listino.
   */
  private quoteLineListPrice(kind: QuoteLineRecord['kind'], description: string): number | null {
    const name = description.trim();
    if (!name) {
      return null;
    }
    if (kind === 'servizio') {
      const service = this.services().find((entry) => entry.name === name);
      return service ? service.price : null;
    }
    if (kind === 'materiale') {
      const item = this.allInventoryItems().find((entry) => entry.name === name);
      if (!item) {
        return null;
      }
      return item.salePrice > 0 ? item.salePrice : item.unitCost;
    }
    return null;
  }

  protected addQuoteLineFromService(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    const serviceId = target?.value ?? '';
    this.quoteQuickServiceId.set(serviceId);

    if (!serviceId) {
      return;
    }

    const service = this.services().find((entry) => entry.id === serviceId);
    if (!service) {
      return;
    }

    this.quoteDraftLines.update((lines) => [
      ...lines,
      {
        id: `qline-${crypto.randomUUID()}`,
        kind: 'servizio',
        description: service.name,
        quantity: 1,
        unitPrice: service.price,
        vatRate: 22,
      },
    ]);
    this.quoteQuickServiceId.set('');
  }

  protected addQuoteLineFromProduct(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    const productId = target?.value ?? '';
    this.quoteQuickProductId.set(productId);

    if (!productId) {
      return;
    }

    const product = this.allInventoryItems().find((entry) => entry.id === productId);
    if (!product) {
      return;
    }

    this.quoteDraftLines.update((lines) => [
      ...lines,
      {
        id: `qline-${crypto.randomUUID()}`,
        kind: 'materiale',
        description: product.name,
        quantity: 1,
        unitPrice: product.unitCost,
        vatRate: 22,
      },
    ]);
    this.quoteQuickProductId.set('');
  }

  protected handleQuoteAttachmentSelected(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0] ?? null;
    this.quoteForm.controls.attachmentName.setValue(file?.name ?? '');
  }

  protected quoteLineTotal(line: QuoteLineRecord): number {
    const subtotal = line.quantity * line.unitPrice;
    const discount = line.discountPercent ? subtotal * (line.discountPercent / 100) : 0;
    const net = subtotal - discount;
    return net + net * (line.vatRate / 100);
  }

  private resetAppointmentForm(): void {
    this.editingAppointmentId.set(null);
    this.runWithoutDraftSync('appointment', () => {
      this.appointmentForm.reset({
        title: '',
        customerName: '',
        appointmentType: 'negozio',
        locationType: 'showroom',
        address: '',
        scheduledAt: '',
        durationMinutes: 60,
        // ✅ Fix ISS-01: technician stringa vuota
        technician: '',
        linkedQuoteId: '',
        status: 'programmato',
      });
    });
    // ✅ Fix ISS-01: resetta anche il signal dedicato alla UI multi-select
    this.selectedTechnicians.set([]);
  }

  private resetInventoryForm(): void {
    this.editingInventoryId.set(null);
    this.inventoryForm.reset({
      sku: '',
      barcode: '',
      name: '',
      category: '',
      usageType: 'rivendita',
      stock: 0,
      cableRolls: 0,
      cableMetersPerRoll: 0,
      minStock: 0,
      unitCost: 0,
      salePrice: 0,
      supplier: '',
      location: '',
      // ✅ Fix ISS-08: default OFF (non toccare il listino cassa a meno di scelta esplicita)
      syncCashPrices: false,
    });
  }

  private resetCashProductForm(): void {
    this.editingCashProductId.set(null);
    this.closeServiceMenu();
    this.runWithoutDraftSync('service', () => {
      this.cashProductForm.reset({
        name: '',
        category: this.cashCategories()[0] ?? 'Servizi audio',
        newCategory: '',
        price: 0,
        shortcut: true,
        pricingMode: 'fisso',
        linkedInventoryItemId: '',
      });
    });
  }

  private resetExpenseForm(): void {
    this.runWithoutDraftSync('expense', () => {
      this.expenseForm.reset({
        description: '',
        amountGross: 0,
        vatRate: 22,
        // ⭐ Default IVA Italia: importo inserito = già ivato (fattura standard)
        // + scorpora IVA automaticamente. Reverse charge spento (caso marginale).
        amountAlreadyIvato: true,
        amountSplitVat: true,
        amountIsReverseCharge: false,
        expenseDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date().toISOString().slice(0, 10),
        categoryId: '',
        supplierId: '',
        genericSupplierLabel: '',
        paymentMode: 'singolo',
        recurringFrequency: null,
        paymentMethodId: '',
        // ⭐ Default Pagamento Provider: nessun provider linkato · manuale (default sicuro)
        // L'utente sceglie poi se usare Stripe (automatico) o altro.
        paymentProviderId: '',
        paymentExecution: 'manuale',
        paymentAutoStartDate: new Date().toISOString().slice(0, 10),
        paymentNotes: '',
        installmentsCount: 1,
        noticeDaysBefore: 7,
        notes: '',
        attachmentName: '',
        projectCode: '',
        costCenterCode: '',
        createdBy: 'Amministrazione',
      });
    });
  }

  private resetWarehouseForm(mode: 'new' | 'restock' = 'new'): void {
    this.warehouseReceiptMode.set(mode);
    this.warehouseReceiptTargetId.set(null);
    this.runWithoutDraftSync('warehouse', () => {
      this.warehouseReceiptForm.reset({
        inventoryItemId: '',
        sku: '',
        barcode: '',
        name: '',
        description: '',
        category: this.productCategories()[0] ?? '',
        newCategory: '',
        usageType: 'rivendita',
        registrationMode: 'inventario',
        unitOfMeasure: 'pz',
        quantity: 0,
        cableRolls: 0,
        cableMetersPerRoll: 0,
        unitCost: 0,
        salePrice: 0,
        receivedDate: new Date().toISOString().slice(0, 10),
        supplier: '',
        lotNumber: '',
        expiryDate: '',
        shelfCode: '',
        minStock: 0,
        purchaseDocumentNumber: '',
        operator: 'Magazzino',
        transportCost: 0,
        customsCost: 0,
        packagingCost: 0,
        // ✅ Fix ISS-08: default OFF (non sovrascrive listino cassa)
        syncCashPrices: false,
      });
    });
    this.syncWarehouseReceiptCategoryState();
  }

  private setupWarehouseReceiptDerivedSync(): void {
    merge(
      this.warehouseReceiptForm.controls.category.valueChanges,
      this.warehouseReceiptForm.controls.newCategory.valueChanges,
    )
      .pipe(
        startWith(this.warehouseReceiptForm.controls.category.value),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.syncWarehouseReceiptCategoryState();
      });

    merge(
      this.warehouseReceiptForm.controls.cableRolls.valueChanges,
      this.warehouseReceiptForm.controls.cableMetersPerRoll.valueChanges,
    )
      .pipe(startWith(this.warehouseReceiptTotalMeters()), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.syncWarehouseReceiptCableQuantity();
      });
  }

  private syncWarehouseReceiptCategoryState(): void {
    if (!this.warehouseReceiptIsCabling()) {
      this.warehouseReceiptForm.patchValue(
        {
          unitOfMeasure: 'pz',
          quantity: 0,
          cableRolls: 0,
          cableMetersPerRoll: 0,
        },
        { emitEvent: false },
      );
      this.warehouseReceiptForm.controls.cableRolls.setErrors(null);
      this.warehouseReceiptForm.controls.cableMetersPerRoll.setErrors(null);
      return;
    }

    this.syncWarehouseReceiptCableQuantity();
  }

  private syncWarehouseReceiptCableQuantity(): void {
    if (!this.warehouseReceiptIsCabling()) {
      return;
    }

    this.warehouseReceiptForm.patchValue(
      {
        unitOfMeasure: 'm',
        quantity: this.warehouseReceiptTotalMeters(),
      },
      { emitEvent: false },
    );
  }

  private normalizeWarehouseReceiptPayload(
    payload: {
      quantity: number;
      cableRolls: number;
      cableMetersPerRoll: number;
      unitOfMeasure: string;
    },
    resolvedCategory: string,
  ): {
    quantity: number;
    cableRolls: number;
    cableMetersPerRoll: number;
    unitOfMeasure: string;
  } | null {
    if (!this.isWarehouseCablingCategory(resolvedCategory)) {
      return {
        quantity: Math.max(0, Number(payload.quantity) || 0),
        cableRolls: 0,
        cableMetersPerRoll: 0,
        unitOfMeasure: payload.unitOfMeasure || 'pz',
      };
    }

    const cableRolls = Math.max(0, Number(payload.cableRolls) || 0);
    const cableMetersPerRoll = Math.max(0, Number(payload.cableMetersPerRoll) || 0);
    const quantity = cableRolls * cableMetersPerRoll;

    if (!cableRolls || !cableMetersPerRoll || !quantity) {
      this.warehouseReceiptForm.controls.cableRolls.setErrors(!cableRolls ? { required: true } : null);
      this.warehouseReceiptForm.controls.cableMetersPerRoll.setErrors(
        !cableMetersPerRoll ? { required: true } : null,
      );
      this.warehouseReceiptForm.markAllAsTouched();
      this.pushToast(
        'Per il cablaggio indica numero rotoli e metri per rotolo prima di salvare.',
        'error',
      );
      return null;
    }

    return {
      quantity,
      cableRolls,
      cableMetersPerRoll,
      unitOfMeasure: 'm',
    };
  }

  private normalizeInventoryPayload(payload: {
    sku: string;
    barcode: string;
    name: string;
    category: string;
    usageType: InventoryItemRecord['usageType'];
    stock: number;
    cableRolls: number;
    cableMetersPerRoll: number;
    minStock: number;
    unitCost: number;
    salePrice: number;
    supplier: string;
    location: string;
  }): Omit<InventoryItemRecord, 'id' | 'status'> | null {
    if (!this.isWarehouseCablingCategory(payload.category)) {
      return {
        ...payload,
        stock: Math.max(0, Number(payload.stock) || 0),
        cableRolls: null,
        cableMetersPerRoll: null,
      };
    }

    const cableRolls = Math.max(0, Number(payload.cableRolls) || 0);
    const cableMetersPerRoll = Math.max(0, Number(payload.cableMetersPerRoll) || 0);
    const stock = cableRolls * cableMetersPerRoll;

    if (!cableRolls || !cableMetersPerRoll || !stock) {
      this.inventoryForm.controls.cableRolls.setErrors(!cableRolls ? { required: true } : null);
      this.inventoryForm.controls.cableMetersPerRoll.setErrors(
        !cableMetersPerRoll ? { required: true } : null,
      );
      this.inventoryForm.markAllAsTouched();
      this.pushToast(
        'Per il cablaggio indica numero rotoli e metri per rotolo prima di salvare.',
        'error',
      );
      return null;
    }

    return {
      ...payload,
      stock,
      cableRolls,
      cableMetersPerRoll,
    };
  }

  private createStoreSupplyExpense(
    payload: ReturnType<typeof this.warehouseReceiptForm.getRawValue>,
    resolvedCategory: string,
  ): void {
    const expenseCategory =
      this.allExpenseCategories().find((entry) => entry.parentCategory === 'operative') ??
      this.allExpenseCategories().find((entry) => entry.parentCategory === 'magazzino') ??
      this.allExpenseCategories()[0];
    const paymentMethod = this.allExpensePaymentMethods()[0];
    const supplierMatch =
      this.allExpenseSuppliers().find((entry) => entry.businessName === payload.supplier) ?? null;
    const quantity = Math.max(1, Number(payload.quantity) || 0);
    const amountGross = quantity * Math.max(0, Number(payload.unitCost) || 0);

    this.data.createExpense({
      description: `Acquisto uso negozio ${payload.name || payload.description || resolvedCategory}`,
      categoryId: expenseCategory?.id ?? 'exp-cat-003',
      supplierId: supplierMatch?.id ?? null,
      genericSupplierLabel: supplierMatch ? null : payload.supplier,
      paymentMode: 'singolo',
      recurringFrequency: null,
      paymentMethodId: paymentMethod?.id ?? 'pay-001',
      amountGross,
      vatRate: 22,
      expenseDate: payload.receivedDate,
      dueDate: payload.receivedDate,
      notes: `Registrata dal modulo magazzino come acquisto uso negozio. Documento ${payload.purchaseDocumentNumber || 'N/D'}.`,
      attachmentName: null,
      projectCode: null,
      costCenterCode: 'CC-USO-NEGOZIO',
      createdBy: payload.operator,
      sourceType: 'manuale',
      sourceReferenceId: null,
      installmentsCount: 1,
      noticeDaysBefore: 7,
    });
  }

  private downloadCsv(rows: Array<Array<string | number>>, fileName: string): void {
    const csv = rows
      .map((row) =>
        row
          .map((field) => `"${String(field ?? '').replaceAll('"', '""')}"`)
          .join(';'),
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private pushToast(message: string, tone: 'success' | 'error'): void {
    this.toastMessage.set(message);
    this.toastTone.set(tone);
    // ✅ Fix REV-007: salva handle toastTimer e ripulisci precedente
    if (this.toastTimer !== undefined) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => {
      if (this.toastMessage() === message) {
        this.toastMessage.set(null);
      }
    }, 3200);
  }

  private setupFormDraftSync(): void {
    this.registerFormDraft('client', this.clientForm);
    this.registerFormDraft('quote', this.quoteForm);
    this.registerFormDraft('appointment', this.appointmentForm);
    this.registerFormDraft('ticket', this.ticketForm);
    this.registerFormDraft('expense', this.expenseForm);
    this.registerFormDraft('warehouse', this.warehouseReceiptForm);
    this.registerFormDraft('ddt', this.ddtForm);
    this.registerFormDraft('service', this.cashProductForm);
  }

  private registerFormDraft(key: string, form: FormGroup): void {
    this.formDrafts.registerForm(key, form, this.destroyRef);
  }

  private restoreFormDraft(key: string, form: FormGroup): boolean {
    return this.formDrafts.restoreDraft(key, form);
  }

  private clearFormDraft(key: string): void {
    this.formDrafts.clearDraft(key);
  }

  private runWithoutDraftSync(key: string, callback: () => void): void {
    this.formDrafts.runWithoutSync(key, callback);
  }

  protected cashQuantityLabel(line: CashTransactionLine): string {
    if (line.pricingMode === 'ora') return 'ore';
    if (line.pricingMode === 'mezzora') return 'mezze ore';
    if (line.pricingMode === 'quarto') return 'quarti d’ora';
    if (line.pricingMode === 'quantità') return 'pz';
    return 'voce';
  }

  protected pricingModeLabel(mode: CashRegisterProductRecord['pricingMode']): string {
    if (mode === 'fisso') return 'prezzo fisso';
    if (mode === 'quantità') return 'quantità';
    if (mode === 'ora') return 'all’ora';
    if (mode === 'mezzora') return 'a mezz’ora';
    return 'a quarto d’ora';
  }

  protected pricingModeHint(mode: CashRegisterProductRecord['pricingMode']): string {
    if (mode === 'fisso') return 'Importo unico, non dipende dalle unità.';
    if (mode === 'quantità') return 'Totale = prezzo × quantità.';
    if (mode === 'ora') return 'Totale = prezzo × ore.';
    if (mode === 'mezzora') return 'Totale = prezzo × mezze ore.';
    return 'Totale = prezzo × quarti d’ora.';
  }

  protected quoteCode(id: string): string {
    return `PRV-${id.slice(-6).toUpperCase()}`;
  }

  protected ticketCode(id: string): string {
    return `SRV-${id.slice(-6).toUpperCase()}`;
  }

  protected quoteDaysToDue(dueDate: string): number {
    const due = new Date(dueDate);
    const now = new Date();
    due.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  protected quoteStageLabel(stage: QuoteRecord['stage']): string {
    switch (stage) {
      case 'bozza':
        return 'Bozza';
      case 'trattativa':
        return 'Trattativa';
      case 'ordine':
      case 'confermato':
      default:
        return 'Ordine';
    }
  }

  protected quoteDueBadgeLabel(dueDate: string): string {
    const days = this.quoteDaysToDue(dueDate);
    if (Number.isNaN(days)) {
      return '';
    }
    if (days < 0) {
      return 'Scaduto';
    }
    if (days === 0) {
      return 'Scade oggi';
    }
    if (days === 1) {
      return '1 giorno';
    }
    if (days <= 7) {
      return `${days} gg`;
    }
    return `${days} gg`;
  }

  protected quotePaymentPlanLabel(plan: NonNullable<QuoteRecord['paymentPlan']>): string {
    switch (plan) {
      case 'finanziamento':
        return 'Finanziamento';
      case 'rate-negozio':
        return 'Rate negozio';
      default:
        return 'Pagamento unico';
    }
  }

  protected quotePaymentSummary(quote: QuoteRecord): string {
    const plan = quote.paymentPlan ?? 'unica';
    if (plan === 'finanziamento') {
      return quote.financingProvider
        ? `Finanziamento tramite ${quote.financingProvider}`
        : 'Finanziamento da definire';
    }
    if (plan === 'rate-negozio') {
      const count = quote.installmentCount ?? 0;
      const cadence = quote.installmentCadence === 'settimanale' ? 'settimanali' : 'mensili';
      const alert = quote.paymentAlertDays ? ` · alert ${quote.paymentAlertDays} gg prima` : '';
      return count > 0 ? `${count} rate ${cadence}${alert}` : `Rate negozio${alert}`;
    }
    return 'Saldo in un’unica soluzione';
  }

  private syncQuoteClientToRegistry(quote: Omit<QuoteRecord, 'id'>): void {
    const normalizedName = quote.customerName.trim().toLowerCase();
    const normalizedPhone = (quote.customerPhone ?? '').trim();
    const normalizedEmail = (quote.customerEmail ?? '').trim().toLowerCase();
    const existingClient =
      this.allClients().find((client) =>
        client.name.trim().toLowerCase() === normalizedName ||
        (!!normalizedPhone && client.phone.trim() === normalizedPhone) ||
        (!!normalizedEmail && client.email.trim().toLowerCase() === normalizedEmail),
      ) ?? null;
    const billingProfile =
      quote.customerTaxId || quote.customerPec || quote.customerSdiCode || quote.customerAddress
        ? {
          kind: 'azienda' as const,
          taxId: quote.customerTaxId ?? '',
          sdiCode: quote.customerSdiCode ?? '',
          pec: quote.customerPec ?? '',
          billingAddress: quote.customerAddress ?? '',
          billingPostalCode: '',
          billingProvince: '',
          billingCountry: 'IT',
        }
        : undefined;

    if (existingClient) {
      this.data.updateClient({
        ...existingClient,
        name: quote.customerName || existingClient.name,
        phone:
          quote.customerPhone && quote.customerPhone.trim().length > 0
            ? quote.customerPhone
            : existingClient.phone,
        email:
          quote.customerEmail && quote.customerEmail.trim().length > 0
            ? quote.customerEmail
            : existingClient.email,
        address:
          quote.customerAddress && quote.customerAddress.trim().length > 0
            ? quote.customerAddress
            : existingClient.address,
        segment: quote.projectType || existingClient.segment,
        preferredContact:
          quote.customerPhone && quote.customerPhone.trim().length > 0
            ? 'telefono'
            : quote.customerEmail && quote.customerEmail.trim().length > 0
              ? 'email'
              : existingClient.preferredContact,
        lastContact: quote.issueDate || new Date().toISOString().slice(0, 10),
        privacyProfile: {
          ...existingClient.privacyProfile,
          billingProfile: billingProfile ?? existingClient.privacyProfile.billingProfile,
        },
      });
      return;
    }

    const fallbackEmail = `${quote.customerName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')}.${Date.now()}@quote.local`;
    this.data.addClient({
      name: quote.customerName,
      phone: quote.customerPhone?.trim() ? quote.customerPhone : 'Non indicato',
      email: quote.customerEmail?.trim() ? quote.customerEmail : fallbackEmail,
      city: 'Non indicata',
      address: quote.customerAddress?.trim() ? quote.customerAddress : 'Da completare',
      segment: quote.projectType || 'Preventivo',
      preferredContact: quote.customerPhone?.trim() ? 'telefono' : quote.customerEmail?.trim() ? 'email' : 'whatsapp',
      notes: `Cliente creato automaticamente dal preventivo · ${quote.projectType}`,
      favoriteBrands: '',
      status: 'lead',
      privacyProfile: {
        ...createClientPrivacyProfile({
          channel: 'crm',
          operator: 'Preventivi',
          lawfulBasis: 'precontrattuale',
        }),
        billingProfile,
      },
    });
  }

  private generateDdtNumber(): string {
    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `DDT-${yyyy}${mm}${dd}-${random}`;
  }

  private escapeHtml(value: string): string {
    return (value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  protected signedDelta(quantity: number): string {
    return `${quantity > 0 ? '+' : ''}${quantity}`;
  }

  private resetTicketForm(): void {
    this.editingTicketId.set(null);
    this.ticketClientLookup.set('');
    this.ticketClientHandoff.set({ active: false, draft: null });
    this.runWithoutDraftSync('ticket', () => {
      this.ticketForm.reset({
        title: '',
        customerName: '',
        insertedAt: new Date().toISOString().slice(0, 10),
        serviceType: 'installazione',
        locationType: 'domicilio',
        priority: 'media',
        status: 'aperto',
        technician: '',
        linkedQuoteId: '',
        linkedAppointmentId: '',
        materialSummary: '',
        materialCost: 0,
        workSummary: '',
        notes: '',
        resolutionStatus: 'da-verificare',
      });
    });
  }

  protected readonly sumQuoteValues = (total: number, quote: QuoteRecord): number =>
    total + quote.value;

  protected readonly isOpenTicket = (ticket: ServiceTicketRecord): boolean =>
    ticket.status !== 'chiuso';

  protected readonly isClosedTicket = (ticket: ServiceTicketRecord): boolean =>
    ticket.status === 'chiuso';

  protected readonly isLowStock = (item: InventoryItemRecord): boolean =>
    item.status === 'bassa-scorta';

  protected readonly isOutOfStock = (item: InventoryItemRecord): boolean =>
    item.status === 'esaurito';

  private buildCashPrivacyProfile(options: {
    channel?: 'cassa' | 'crm';
    operator?: string;
    dispatchChannel: 'whatsapp' | 'email' | 'firma';
    noticeAcknowledged: boolean;
    emailMarketing: boolean;
    whatsappMarketing: boolean;
    fidelityProfiling: boolean;
    billingProfile?: ClientBillingProfile;
    existingProfile?: ClientRecord['privacyProfile'];
  }): ClientRecord['privacyProfile'] {
    const timestamp = new Date().toISOString();
    const channel = options.channel ?? 'cassa';
    const operator = options.operator ?? this.cashCurrentOperator();
    const shouldPrepareRemoteConsent = options.dispatchChannel !== 'firma';
    const generatedUrl = `/privacy-consent/temp-${crypto.randomUUID()}`;

    const profile = options.existingProfile
      ? { ...options.existingProfile }
      : createClientPrivacyProfile({
        channel,
        operator,
        lawfulBasis: 'contratto',
        noticeAcknowledged: options.noticeAcknowledged,
        emailMarketing: options.emailMarketing,
        whatsappMarketing: options.whatsappMarketing,
        fidelityProfiling: options.fidelityProfiling,
        remoteConsentStatus: shouldPrepareRemoteConsent ? 'da-inviare' : 'non-inviato',
        remoteConsentUrl: shouldPrepareRemoteConsent ? generatedUrl : null,
      });

    if (options.existingProfile) {
      profile.noticeAcknowledged = options.noticeAcknowledged;
      profile.noticeShownAt = options.noticeAcknowledged ? timestamp : null;
      profile.emailMarketing = {
        granted: options.emailMarketing,
        grantedAt: options.emailMarketing ? timestamp : null,
        channel: options.emailMarketing ? channel : null,
      };
      profile.whatsappMarketing = {
        granted: options.whatsappMarketing,
        grantedAt: options.whatsappMarketing ? timestamp : null,
        channel: options.whatsappMarketing ? channel : null,
      };
      profile.fidelityProfiling = {
        granted: options.fidelityProfiling,
        grantedAt: options.fidelityProfiling ? timestamp : null,
        channel: options.fidelityProfiling ? channel : null,
      };
      profile.remoteConsentStatus = shouldPrepareRemoteConsent ? 'da-inviare' : 'non-inviato';
      profile.remoteConsentUrl = shouldPrepareRemoteConsent
        ? profile.remoteConsentUrl ?? generatedUrl
        : null;
    }

    if (profile.remoteConsentStatus === 'da-inviare' && profile.remoteConsentUrl) {
      profile.audit.unshift({
        id: `privacy-audit-${crypto.randomUUID()}`,
        action: 'link-generato',
        detail: `Creato link di conferma consensi ${profile.remoteConsentUrl}`,
        operator,
        channel,
        createdAt: timestamp,
      });
      profile.archive.unshift({
        id: `privacy-archive-${crypto.randomUUID()}`,
        type: 'consenso-remoto',
        title: 'Link consenso remoto pronto per invio',
        status: 'bozza',
        channel,
        url: profile.remoteConsentUrl,
        createdAt: timestamp,
      });
    }

    if (options.billingProfile) {
      profile.billingProfile = options.billingProfile;
    }

    return profile;
  }

  private dispatchCashPrivacyConsent(client: ClientRecord): void {
    const dispatchChannel = this.cashPrivacyDispatchChannel();

    const result = this.privacyDispatch.dispatchRemoteConsent({
      clientName: client.name,
      clientPhone: client.phone,
      clientEmail: client.email,
      remoteConsentUrl: client.privacyProfile.remoteConsentUrl,
      dispatchChannel,
    });

    if (result.status === 'missing-link') {
      if (dispatchChannel === 'firma') {
        this.pushToast('Consenso in negozio selezionato: nessun link remoto da inviare.', 'success');
      } else {
        this.pushToast('Nessun link privacy disponibile per l’invio.', 'error');
      }
      return;
    }

    if (result.status === 'invalid-phone') {
      this.pushToast('Numero WhatsApp non valido o mancante: impossibile aprire WhatsApp.', 'error');
      return;
    }

    if (result.status === 'invalid-email') {
      this.pushToast('Email non valida o mancante: impossibile preparare la mail.', 'error');
      return;
    }

    if (result.status === 'blocked') {
      this.pushToast('Popup bloccato dal browser: copia manualmente il link privacy.', 'error');
      return;
    }

    if (dispatchChannel !== 'firma') {
      const timestamp = new Date().toISOString();
      this.data.updateClient({
        ...client,
        privacyProfile: {
          ...client.privacyProfile,
          remoteConsentStatus: 'inviato',
          audit: [
            {
              id: `privacy-audit-${crypto.randomUUID()}`,
              action: 'link-generato',
              detail: `Preparato invio link consenso remoto via ${dispatchChannel}.`,
              operator: this.cashCurrentOperator(),
              channel: 'cassa',
              createdAt: timestamp,
            },
            ...client.privacyProfile.audit,
          ],
          archive: client.privacyProfile.archive.map((entry) =>
            entry.type === 'consenso-remoto' && entry.url === client.privacyProfile.remoteConsentUrl
              ? {
                ...entry,
                status: 'inviato',
                createdAt: timestamp,
              }
              : entry,
          ),
        },
      });
    }
  }

  private normalizeLookup(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase();
  }

  private matchesClientReference(
    client: ClientRecord,
    entry: {
      clientId?: string | null;
      customerName?: string | null;
      customerEmail?: string | null;
      customerPhone?: string | null;
    },
  ): boolean {
    const normalizedClientName = this.normalizeLookup(client.name);
    const normalizedClientEmail = this.normalizeLookup(client.email);
    const normalizedClientPhone = this.normalizeLookup(client.phone);

    if (entry.clientId === client.id) {
      return true;
    }

    if (this.normalizeLookup(entry.customerName) === normalizedClientName) {
      return true;
    }

    if (normalizedClientEmail && this.normalizeLookup(entry.customerEmail) === normalizedClientEmail) {
      return true;
    }

    return !!normalizedClientPhone && this.normalizeLookup(entry.customerPhone) === normalizedClientPhone;
  }

  private matchesSupplierReference(
    supplier: ExpenseSupplierRecord,
    supplierLabel: string | null | undefined,
    supplierId?: string | null,
  ): boolean {
    if (supplierId === supplier.id) {
      return true;
    }

    return this.normalizeLookup(supplierLabel) === this.normalizeLookup(supplier.businessName);
  }

  private toDateTimeLocal(value: string): string {
    return value.length >= 16 ? value.slice(0, 16) : value;
  }

  // ═══════════════════════════════════════════════════════════════════
  // GENERAZIONE BARCODE MAGAZZINO (EAN-13 standard) +
  // ETICHETTA SCARICABILE (SVG vettoriale → PNG ad alta DPI)
  // ═══════════════════════════════════════════════════════════════════

  // Genera un EAN-13 valido (prefisso Italia 80 + 10 cifre + check digit)
  // Utilizza parte casuale + parte dal timestamp per evitare collisioni
  protected generateProductEan13(): string {
    // Prefisso internazionale Italia + parte random + parte derivata da tempo ms
    const prefix = '80';
    const rnd = Math.floor(10000 + Math.random() * 89999).toString(); // 5 cifre
    const timePart = (Date.now() % 100000).toString().padStart(5, '0');   // 5 cifre
    const first12 = prefix + rnd + timePart;
    return first12 + this.ean13CheckDigit(first12);
  }

  // Calcola check digit EAN-13 (algoritmo standard GS1)
  private ean13CheckDigit(first12: string): string {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const d = Number(first12[i]) || 0;
      sum += (i % 2 === 0) ? d : d * 3;
    }
    const mod = sum % 10;
    return mod === 0 ? '0' : String(10 - mod);
  }

  // Tabella di codifica EAN-13
  // L (odd parity), G (even parity), R (inverso L)
  private readonly EAN_L: string[] = [
    '0001101', '0011001', '0010011', '0111101', '0100011',
    '0110001', '0101111', '0111011', '0110111', '0001011',
  ];
  private readonly EAN_G: string[] = [
    '0100111', '0110111', '0011011', '0100001', '0011101',
    '0111001', '0000101', '0010001', '0001001', '0010111',
  ];
  private readonly EAN_R: string[] = this.EAN_L.map((p) =>
    p.split('').map((b) => (b === '0' ? '1' : '0')).join(''),
  );
  private readonly EAN_PARITY: string[] = [
    'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
    'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
  ];

  // Codifica EAN-13 in sequenza di bit (1 = nero, 0 = bianco)
  private encodeEan13(ean13: string): string {
    if (!ean13 || ean13.length !== 13 || !/^\d+$/.test(ean13)) {
      // Fallback: usa Code128 minimal per stringhe non EAN (generato come semplice barcode 39)
      return this.encodeFallbackBarcode(ean13 || '0000000000000');
    }
    const firstDigit = Number(ean13[0]);
    const parityRow = this.EAN_PARITY[firstDigit] ?? 'LLLLLL';
    const leftDigits = ean13.slice(1, 7);
    const rightDigits = ean13.slice(7, 13);

    const start = '101';
    const sep = '01010';
    const stop = '101';
    let left = '';
    for (let i = 0; i < 6; i++) {
      const d = Number(leftDigits[i]);
      const pattern = parityRow[i] === 'G' ? this.EAN_G[d] : this.EAN_L[d];
      left += pattern;
    }
    let right = '';
    for (let i = 0; i < 6; i++) {
      const d = Number(rightDigits[i]);
      right += this.EAN_R[d];
    }
    return start + left + sep + right + stop;
  }

  // Fallback encoder per stringhe non numeriche (pattern semplice 3 of 9 style)
  private encodeFallbackBarcode(text: string): string {
    const clean = text.slice(0, 20).toUpperCase();
    let out = '1010'; // quiet start
    for (const ch of clean) {
      // Ogni carattere -> 5 barre larghe + 4 strette (pattern 9 moduli semplificato)
      const val = ((ch.charCodeAt(0) * 13 + 7) % 511) + 512;
      out += val.toString(2).padStart(10, '0') + '0';
    }
    out += '101';
    return out;
  }

  // Genera SVG markup barcode EAN-13 con testo leggibile e spazio bianco (quiet zone)
  // width/height in mm (per stampa), il modulo base è 1px di unità viewBox
  protected renderBarcodeLabelSvg(
    barcodeValue: string,
    productLabel?: string,
    opts?: { moduleWidthPx?: number; heightPx?: number; fontSizePx?: number },
  ): { svg: string; widthPx: number; heightPx: number } {
    const value = (barcodeValue || '').trim() || '0000000000000';
    const mw = opts?.moduleWidthPx ?? 2;
    const h = opts?.heightPx ?? 80;
    const fontSize = opts?.fontSizePx ?? 11;
    const bits = this.encodeEan13(value);
    const totalModules = bits.length;
    const paddingPx = 12; // quiet zone sx/dx
    const labelExtra = productLabel ? fontSize + 10 : 0;
    const textExtra = fontSize + 6;
    const wPx = totalModules * mw + paddingPx * 2;
    const hPx = h + paddingPx + labelExtra + textExtra;

    // Costruisci path barre (per qualità vettoriale elevata)
    const bars: string[] = [];
    let x = paddingPx;
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] === '1') {
        bars.push(`M${x},${paddingPx + labelExtra}h${mw}v${h}h-${mw}z`);
      }
      x += mw;
    }

    const textY = paddingPx + labelExtra + h + fontSize + 2;
    const centerX = wPx / 2;
    const productName = (productLabel || '').trim();

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wPx} ${hPx}" width="${wPx}px" height="${hPx}px" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${productName ? `<text x="${centerX}" y="${paddingPx + fontSize - 1}" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle" fill="#0f172a">${this.escapeXml(productName)}</text>` : ''}
  <g fill="#0f172a">
    <path d="${bars.join(' ')}"/>
  </g>
  <text x="${centerX}" y="${textY}" font-family="'Courier New', monospace" font-size="${fontSize}" font-weight="700" letter-spacing="1.2" text-anchor="middle" fill="#0f172a">${this.escapeXml(value)}</text>
</svg>`;
    return { svg, widthPx: wPx, heightPx: hPx };
  }

  private escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Scarica etichetta barcode come PNG ad alta risoluzione (6x) — scalabile senza perdita
  // perché generato da sorgente SVG vettoriale con scale 6x. Scale 3x ≈ 300dpi per stampa A4
  protected async downloadBarcodeLabelPng(
    barcodeValue: string,
    productLabel?: string,
    scale = 6,
  ): Promise<void> {
    if (!barcodeValue) return;
    const { svg, widthPx, heightPx } = this.renderBarcodeLabelSvg(barcodeValue, productLabel);
    const outW = Math.round(widthPx * scale);
    const outH = Math.round(heightPx * scale);

    // 1. Crea Blob SVG
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    try {
      // 2. Carica immagine SVG in un HTMLImageElement
      const img = await this.loadImageElement(url);
      // 3. Disegna su canvas ad alta risoluzione (filtro none per bordi netti)
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D non disponibile');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, outW, outH);
      // 4. Esporta PNG e scarica
      const safeName = (productLabel || barcodeValue)
        .toLowerCase()
        .replace(/[^a-z0-9\-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'barcode';
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const dl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = dl;
          a.download = `etichetta-${safeName}.png`;
          document.body.appendChild(a);
          a.click();
          // ✅ Fix REV-008: salva handle timeout Blob 150ms nel Set
          const t150 = setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(dl);
          }, 150);
          this.blobTimers.add(t150);
        },
        'image/png',
        1.0,
      );
    } finally {
      // ✅ Fix REV-008: salva handle timeout Blob 2s nel Set
      const t2s = setTimeout(() => URL.revokeObjectURL(url), 2000);
      this.blobTimers.add(t2s);
    }
  }

  private loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img');
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Genera un nuovo barcode EAN-13 e lo scrive nel form ricevimento merce (campo barcode)
  protected generateAndSetReceiptBarcode(): void {
    const newBarcode = this.generateProductEan13();
    this.warehouseReceiptForm.controls.barcode.patchValue(newBarcode, { emitEvent: true });
  }

  // Genera barcode per il prodotto selezionato nel dettaglio e lo salva in anagrafica
  protected generateAndAssignBarcodeToSelectedInventory(): void {
    const item = this.selectedInventoryItem();
    if (!item) return;
    const newBarcode = this.generateProductEan13();
    // Salvataggio nel record (patch locale e poi persist code-side)
    const updated: InventoryItemRecord = { ...item, barcode: newBarcode };
    this.data.updateInventoryItem(updated);
    // Aggiorna segnali derivati per garantire reattività immediata
    this.allInventoryItems.update((list) =>
      list.map((it) => (it.id === item.id ? updated : it)),
    );
  }

  // Restituisce data URL SVG del barcode (per anteprima diretta nel DOM come <img>)
  protected barcodeImgDataUrl(barcodeValue: string, productLabel?: string): string {
    if (!barcodeValue) return '';
    const { svg } = this.renderBarcodeLabelSvg(barcodeValue, productLabel);
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
}
