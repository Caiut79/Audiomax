import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AudiomaxDataService } from './audiomax-data.service';
import { AppointmentRecord } from './crm-runtime-data';
import { SupabaseService } from './supabase.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPageComponent {
  protected readonly data = inject(AudiomaxDataService);
  private readonly supabase = inject(SupabaseService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly searchTerm = signal('');
  protected readonly dashboardAppointmentModalOpen = signal(false);
  protected readonly dashboardSelectedDate = signal(new Date().toISOString().slice(0, 10));
  protected readonly calendarViewMode = signal<'giorno' | 'settimana' | 'mese'>('mese');
  protected readonly calendarReferenceDate = signal(new Date());
  private readonly italianHolidayLabels: Record<string, string> = {
    '01-01': 'Capodanno',
    '01-06': 'Epifania',
    '04-25': 'Liberazione',
    '05-01': 'Lavoro',
    '06-02': 'Repubblica',
    '08-15': 'Ferragosto',
    '11-01': 'Ognissanti',
    '12-08': 'Immacolata',
    '12-25': 'Natale',
    '12-26': 'Santo Stefano',
  };
  protected readonly overviewMetrics = computed(() => [
    {
      label: 'Clienti',
      value: `${this.data.clients().length}`,
      detail: 'Schede già attive tra lead e clienti',
      route: '/clienti',
      icon: '👥',
      tone: 'kpi-blue',
    },
    {
      label: 'Preventivi',
      value: `${this.data.quotes().filter(q => q.stage !== 'confermato' && q.stage !== 'ordine').length}`,
      detail: 'Trattative commerciali in corso',
      route: '/preventivi',
      icon: '📄',
      tone: 'kpi-orange',
    },
    {
      label: 'Agenda',
      value: `${this.data.plannedAppointments()}`,
      detail: 'Appuntamenti operativi programmati',
      route: '/agenda',
      icon: '🗓️',
      tone: 'kpi-green',
    },
    {
      label: 'Ticket aperti',
      value: `${this.data.openServiceTickets()}`,
      detail: 'Interventi tecnici ancora da chiudere',
      route: '/servizio-tecnico',
      icon: '🛠️',
      tone: 'kpi-purple',
    },
  ]);

  protected readonly quickActions = [
    {
      label: 'Nuovo contatto',
      route: '/clienti',
      caption: 'Crea rapidamente clienti, lead e aziende',
      icon: '👥',
    },
    {
      label: 'Prepara preventivo',
      route: '/preventivi',
      caption: "Crea un'offerta e aggiorna la trattativa",
      icon: '📄',
    },
    {
      label: 'Pianifica agenda',
      route: '/agenda',
      caption: 'Organizza appuntamenti, uscite e installazioni',
      icon: '🗓️',
    },
    {
      label: 'Registra incasso',
      route: '/cassa',
      caption: 'Registra il pagamento e controlla gli insoluti',
      icon: '🧾',
    },
    {
      label: 'Apri ticket tecnico',
      route: '/servizio-tecnico',
      caption: 'Gestisci assistenze, officina e uscite tecniche',
      icon: '🛠️',
    },
  ];
  protected readonly lowStockItemsCount = computed(() =>
    this.data
      .inventoryItems()
      .filter((item) => item.status === 'bassa-scorta' || item.status === 'esaurito').length,
  );
  protected readonly openInsolutiCount = computed(() =>
    this.data.cashTransactions().filter((transaction) => transaction.status === 'insoluto').length,
  );
  protected readonly guidedWorkflows = computed(() => [
    {
      step: '01',
      title: 'Inserisci o richiama il contatto',
      detail: `${this.followUpClients().length} contatti da seguire oggi`,
      route: '/clienti',
      action: 'Apri contatti',
    },
    {
      step: '02',
      title: 'Trasforma l’interesse in preventivo',
      detail: `${this.urgentQuotes().length} preventivi da aggiornare o confermare`,
      route: '/preventivi',
      action: 'Apri preventivi',
    },
    {
      step: '03',
      title: 'Pianifica l’azione successiva',
      detail: `${this.todayAppointments().length} appuntamenti in agenda tra showroom, domicilio e assistenza`,
      route: '/agenda',
      action: 'Apri agenda',
    },
  ]);
  protected readonly automationHub = computed(() => [
    {
      title: 'Contatti da seguire',
      detail: `${this.followUpClients().length} contatti da richiamare o aggiornare`,
      route: '/clienti',
      icon: '↗',
    },
    {
      title: 'Preventivi aperti',
      detail: `${this.urgentQuotes().length} trattative da confermare o rivedere`,
      route: '/preventivi',
      icon: '€',
    },
    {
      title: 'Agenda e tecnici',
      detail: `${this.plannedAppointments()} attività pianificate tra ufficio e tecnici`,
      route: '/agenda',
      icon: '◷',
    },
    {
      title: 'Scorte e pagamenti',
      detail: `${this.lowStockItemsCount()} scorte basse e ${this.openInsolutiCount()} insoluti aperti`,
      route: '/magazzino',
      icon: '◎',
    },
  ]);
  protected readonly dashboardAppointmentTypes: Array<{
    value: AppointmentRecord['appointmentType'];
    label: string;
    detail: string;
  }> = [
    { value: 'negozio', label: 'Negozio', detail: 'Demo, consulenza o vendita in showroom' },
    { value: 'uscita', label: 'Uscita', detail: 'Visita cliente fuori negozio' },
    { value: 'installazione', label: 'Installazione', detail: 'Montaggio impianto con eventuale preventivo' },
    { value: 'assistenza', label: 'Assistenza', detail: 'Intervento tecnico o verifica guasto' },
    { value: 'sopralluogo', label: 'Sopralluogo', detail: 'Rilievo tecnico prima del lavoro' },
  ];
  protected readonly dashboardQuickSlots = [
    { label: '09:00', value: '09:00' },
    { label: '11:00', value: '11:00' },
    { label: '14:30', value: '14:30' },
    { label: '16:30', value: '16:30' },
  ];

  protected readonly latestClients = this.data.latestClients;
  protected readonly latestQuotes = this.data.latestQuotes;
  protected readonly nextAppointments = this.data.nextAppointments;
  protected readonly plannedAppointments = this.data.plannedAppointments;
  protected readonly latestInventoryItems = this.data.latestInventoryItems;
  protected readonly latestCashTransactions = this.data.latestCashTransactions;
  protected readonly latestServiceTickets = this.data.latestServiceTickets;
  protected readonly expenseUpcomingInstallments = this.data.expenseUpcomingInstallments;
  protected readonly expenseMonthlyTotal = this.data.expenseTotalCurrentMonth;
  protected readonly unreadExpenseNotifications = computed(
    () => this.data.expenseNotifications().filter((entry) => !entry.readAt).length,
  );
  protected readonly recentActivities = this.data.recentActivities;
  protected readonly connectionLabel = this.supabase.connectionLabel;
  protected readonly searchResults = computed(() => this.data.searchRecords(this.searchTerm()));
  protected readonly todayIso = computed(() => new Date().toISOString().slice(0, 10));
  protected readonly tomorrowIso = computed(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  });
  protected readonly todayAppointments = computed(() =>
    this.data
      .appointments()
      .filter((item) => item.scheduledAt.startsWith(this.todayIso()))
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
      .slice(0, 5),
  );
  protected readonly urgentQuotes = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.data
      .quotes()
      .filter((quote) => quote.stage !== 'ordine' && quote.stage !== 'confermato')
      .map((quote) => {
        const due = new Date(quote.dueDate);
        due.setHours(0, 0, 0, 0);
        const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
        return { ...quote, daysToDue: days };
      })
      .sort((left, right) => left.daysToDue - right.daysToDue)
      .slice(0, 5);
  });
  protected readonly followUpClients = computed(() =>
    this.data
      .clients()
      .filter((client) => client.status === 'lead' || client.status === 'molto spendente')
      .slice(0, 5),
  );
  protected readonly dashboardOperators = computed(() => {
    const operators = new Set<string>();
    this.data.activeCashOperators().forEach((operator) => operators.add(operator.name));
    this.data.appointments().forEach((appointment) => {
      if (appointment.technician?.trim()) {
        operators.add(appointment.technician.trim());
      }
    });
    if (!operators.size) {
      operators.add('Banco');
    }
    return [...operators].sort((left, right) => left.localeCompare(right, 'it-IT'));
  });
  protected readonly dashboardSelectedDateLabel = computed(() =>
    new Intl.DateTimeFormat('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${this.dashboardSelectedDate()}T00:00:00`)),
  );
  protected readonly dashboardSelectedDateAppointments = computed(() =>
    this.data
      .appointments()
      .filter((item) => item.scheduledAt.startsWith(this.dashboardSelectedDate()))
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt)),
  );
  protected readonly dashboardAlerts = computed(() => {
    const lowStockItems = this.data
      .inventoryItems()
      .filter((item) => item.status === 'bassa-scorta' || item.status === 'esaurito');
    const pendingTransactions = this.data
      .cashTransactions()
      .filter((transaction) => transaction.status === 'insoluto');
    const upcomingInstallments = this.data.expenseUpcomingInstallments();
    const alerts: Array<{
      id: string;
      tone: 'warning' | 'danger' | 'info';
      kicker: string;
      title: string;
      detail: string;
      route: string;
      cta: string;
    }> = [];

    if (lowStockItems.length) {
      const firstItem = lowStockItems[0];
      alerts.push({
        id: 'stock',
        tone: 'warning',
        kicker: 'Magazzino',
        title:
          lowStockItems.length === 1
            ? '1 articolo da riordinare'
            : `${lowStockItems.length} articoli da controllare`,
        detail: `${firstItem.name} in stato ${firstItem.status}. Apri il magazzino per riordino o rettifica.`,
        route: '/magazzino',
        cta: 'Apri magazzino',
      });
    }

    if (pendingTransactions.length) {
      const firstTransaction = pendingTransactions[0];
      alerts.push({
        id: 'cash',
        tone: 'danger',
        kicker: 'Cassa',
        title:
          pendingTransactions.length === 1
            ? '1 insoluto aperto'
            : `${pendingTransactions.length} insoluti aperti`,
        detail: `${firstTransaction.customerName} · ${firstTransaction.reference} · € ${firstTransaction.total.toLocaleString('it-IT')}`,
        route: '/cassa',
        cta: 'Apri cassa',
      });
    }

    if (upcomingInstallments.length) {
      const firstInstallment = upcomingInstallments[0];
      alerts.push({
        id: 'expenses',
        tone: 'info',
        kicker: 'Scadenze',
        title:
          upcomingInstallments.length === 1
            ? '1 pagamento in scadenza'
            : `${upcomingInstallments.length} pagamenti da verificare`,
        detail: `Prima scadenza ${firstInstallment.dueDate} · € ${firstInstallment.amount.toLocaleString('it-IT')}`,
        route: '/spese',
        cta: 'Apri spese',
      });
    }

    return alerts;
  });
  protected readonly dashboardQuickQuotes = computed(() => {
    const appointmentType = this.dashboardAppointmentForm.controls.appointmentType.value;
    const customerName = this.dashboardAppointmentForm.controls.customerName.value.trim().toLowerCase();

    return this.data
      .quotes()
      .filter((quote) => {
        const customerMatches = customerName
          ? quote.customerName.toLowerCase().includes(customerName)
          : true;

        if (appointmentType === 'installazione') {
          return (quote.stage === 'ordine' || quote.stage === 'confermato') && customerMatches;
        }

        return customerMatches;
      })
      .sort((left, right) => right.value - left.value)
      .slice(0, 12);
  });
  protected readonly dashboardQuickClients = computed(() =>
    this.data.clients().slice().sort((left, right) => left.name.localeCompare(right.name, 'it-IT')),
  );
  protected readonly dashboardSelectedQuote = computed(() => {
    const quoteId = this.dashboardAppointmentForm.controls.linkedQuoteId.value;
    return this.data.quotes().find((quote) => quote.id === quoteId) ?? null;
  });
  protected readonly dashboardAppointmentForm = this.formBuilder.nonNullable.group({
    title: ['', Validators.required],
    customerName: ['', Validators.required],
    appointmentType: this.formBuilder.nonNullable.control<AppointmentRecord['appointmentType']>('negozio'),
    locationType: this.formBuilder.nonNullable.control<AppointmentRecord['locationType']>('showroom'),
    scheduledAt: ['', Validators.required],
    durationMinutes: [60, [Validators.required, Validators.min(15)]],
    technician: [this.data.activeCashOperators()[0]?.name ?? 'Banco', Validators.required],
    linkedQuoteId: this.formBuilder.nonNullable.control<string>(''),
    status: this.formBuilder.nonNullable.control<AppointmentRecord['status']>('programmato'),
  });
  protected readonly appointmentCalendarDays = computed(() => {
    const appointments = [...this.data.appointments()].sort((left, right) =>
      left.scheduledAt.localeCompare(right.scheduledAt),
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: 5 }, (_, index) => {
      const currentDate = new Date(today);
      currentDate.setDate(today.getDate() + index);
      const isoDate = currentDate.toISOString().slice(0, 10);

      return {
        isoDate,
        label: new Intl.DateTimeFormat('it-IT', {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
        }).format(currentDate),
        isSunday: currentDate.getDay() === 0,
        holidayLabel: this.getItalianHolidayLabel(currentDate),
        items: appointments.filter((item) => item.scheduledAt.startsWith(isoDate)),
      };
    });
  });
  protected readonly calendarWeekdays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  protected readonly calendarMonthLabel = computed(() =>
    new Intl.DateTimeFormat('it-IT', {
      month: 'long',
      year: 'numeric',
    }).format(new Date()),
  );
  protected nextCalendarPeriod(): void {
    const current = this.calendarReferenceDate();
    const mode = this.calendarViewMode();
    const next = new Date(current);
    if (mode === 'giorno') {
      next.setDate(next.getDate() + 1);
    } else if (mode === 'settimana') {
      next.setDate(next.getDate() + 7);
    } else {
      next.setMonth(next.getMonth() + 1);
    }
    this.calendarReferenceDate.set(next);
  }

  protected prevCalendarPeriod(): void {
    const current = this.calendarReferenceDate();
    const mode = this.calendarViewMode();
    const prev = new Date(current);
    if (mode === 'giorno') {
      prev.setDate(prev.getDate() - 1);
    } else if (mode === 'settimana') {
      prev.setDate(prev.getDate() - 7);
    } else {
      prev.setMonth(prev.getMonth() - 1);
    }
    this.calendarReferenceDate.set(prev);
  }

  protected todayCalendarPeriod(): void {
    this.calendarReferenceDate.set(new Date());
  }

  protected readonly calendarDisplayTitle = computed(() => {
    const refDate = this.calendarReferenceDate();
    const mode = this.calendarViewMode();
    
    if (mode === 'giorno') {
      return new Intl.DateTimeFormat('it-IT', { 
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
      }).format(refDate);
    } else if (mode === 'settimana') {
      const startOfWeek = new Date(refDate);
      startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      const startMonth = startOfWeek.getMonth() === endOfWeek.getMonth() 
        ? '' : new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(startOfWeek) + ' - ';
      
      return `${startOfWeek.getDate()} ${startMonth}al ${endOfWeek.getDate()} ${new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(endOfWeek)}`;
    } else {
      return new Intl.DateTimeFormat('it-IT', { 
        month: 'long', year: 'numeric' 
      }).format(refDate);
    }
  });

  protected readonly appointmentCalendarCells = computed(() => {
    const appointments = [...this.data.appointments()].sort((left, right) =>
      left.scheduledAt.localeCompare(right.scheduledAt),
    );
    const todayIso = new Date().toISOString().slice(0, 10);
    const refDate = this.calendarReferenceDate();
    const mode = this.calendarViewMode();

    let daysToGenerate = 35;
    let gridStart = new Date(refDate);
    let referenceMonth = refDate.getMonth();

    if (mode === 'giorno') {
      daysToGenerate = 1;
      gridStart = new Date(refDate);
    } else if (mode === 'settimana') {
      daysToGenerate = 7;
      const firstWeekday = (refDate.getDay() + 6) % 7;
      gridStart = new Date(refDate);
      gridStart.setDate(refDate.getDate() - firstWeekday);
    } else {
      const currentMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
      const firstWeekday = (currentMonth.getDay() + 6) % 7;
      gridStart = new Date(currentMonth);
      gridStart.setDate(currentMonth.getDate() - firstWeekday);
      daysToGenerate = 35;
    }

    return Array.from({ length: daysToGenerate }, (_, index) => {
      const currentDate = new Date(gridStart);
      currentDate.setDate(gridStart.getDate() + index);
      const isoDate = currentDate.toISOString().slice(0, 10);
      const holidayLabel = this.getItalianHolidayLabel(currentDate);
      const isSunday = currentDate.getDay() === 0;

      return {
        isoDate,
        dayNumber: currentDate.getDate(),
        weekdayLabel: new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(currentDate),
        isToday: isoDate === todayIso,
        inCurrentMonth: currentDate.getMonth() === referenceMonth,
        isSunday,
        holidayLabel,
        items: appointments.filter((item) => item.scheduledAt.startsWith(isoDate)),
      };
    });
  });

  protected appointmentTypeClass(type: string): string {
    return type
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-');
  }

  private getItalianHolidayLabel(date: Date): string | null {
    const monthDay = `${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;

    if (this.italianHolidayLabels[monthDay]) {
      return this.italianHolidayLabels[monthDay];
    }

    const easter = this.calculateEaster(date.getFullYear());
    const easterMonday = new Date(easter);

    easterMonday.setDate(easter.getDate() + 1);

    if (date.toISOString().slice(0, 10) === easterMonday.toISOString().slice(0, 10)) {
      return 'Pasquetta';
    }

    return null;
  }

  private calculateEaster(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    return new Date(year, month - 1, day);
  }

  protected updateSearchTerm(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.searchTerm.set(target?.value ?? '');
  }

  protected openDashboardAppointmentModal(
    isoDate: string,
    presetType: AppointmentRecord['appointmentType'] = 'negozio',
  ): void {
    this.dashboardSelectedDate.set(isoDate);
    this.dashboardAppointmentForm.reset({
      title: '',
      customerName: '',
      appointmentType: presetType,
      locationType: 'showroom',
      scheduledAt: `${isoDate}T09:00`,
      durationMinutes: 60,
      technician: this.dashboardOperators()[0] ?? 'Banco',
      linkedQuoteId: '',
      status: 'programmato',
    });
    this.setDashboardAppointmentType(presetType);
    this.dashboardAppointmentModalOpen.set(true);
  }

  protected handleDashboardCalendarDateClick(isoDate: string, appointmentsCount: number): void {
    this.dashboardSelectedDate.set(isoDate);
    this.openDashboardAppointmentModal(isoDate);
  }

  protected closeDashboardAppointmentModal(): void {
    this.dashboardAppointmentModalOpen.set(false);
  }

  protected setDashboardAppointmentType(type: AppointmentRecord['appointmentType']): void {
    const defaults: Record<AppointmentRecord['appointmentType'], AppointmentRecord['locationType']> = {
      negozio: 'showroom',
      uscita: 'domicilio',
      installazione: 'domicilio',
      assistenza: 'officina',
      sopralluogo: 'domicilio',
    };
    const titleDefaults: Record<AppointmentRecord['appointmentType'], string> = {
      negozio: 'Appuntamento showroom',
      uscita: 'Uscita cliente',
      installazione: 'Installazione',
      assistenza: 'Assistenza tecnica',
      sopralluogo: 'Sopralluogo',
    };
    const currentTitle = this.dashboardAppointmentForm.controls.title.value.trim();
    this.dashboardAppointmentForm.patchValue({
      appointmentType: type,
      locationType: defaults[type],
      linkedQuoteId: type === 'installazione' ? this.dashboardAppointmentForm.controls.linkedQuoteId.value : '',
      title: currentTitle ? currentTitle : titleDefaults[type],
    });
  }

  protected applyDashboardTimeSlot(time: string): void {
    const currentValue = this.dashboardAppointmentForm.controls.scheduledAt.value;
    const datePart = currentValue?.slice(0, 10) || this.dashboardSelectedDate();
    this.dashboardAppointmentForm.patchValue({
      scheduledAt: `${datePart}T${time}`,
    });
  }

  protected isDashboardTimeSlotActive(time: string): boolean {
    return this.dashboardAppointmentForm.controls.scheduledAt.value.slice(11, 16) === time;
  }

  protected isDashboardAppointmentTypeActive(type: AppointmentRecord['appointmentType']): boolean {
    return this.dashboardAppointmentForm.controls.appointmentType.value === type;
  }

  protected selectDashboardClient(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    const clientId = target?.value ?? '';
    const client = this.data.clients().find((item) => item.id === clientId);
    if (!client) {
      return;
    }
    this.dashboardAppointmentForm.patchValue({
      customerName: client.name,
    });
  }

  protected selectDashboardQuote(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    const quoteId = target?.value ?? '';
    const quote = this.data.quotes().find((item) => item.id === quoteId);
    if (!quote) {
      return;
    }
    this.dashboardAppointmentForm.patchValue({
      linkedQuoteId: quote.id,
      customerName: quote.customerName,
      appointmentType: 'installazione',
      locationType: quote.fulfillmentType === 'esterno' ? 'domicilio' : 'showroom',
      title: `Installazione ${quote.projectType}`,
    });
  }

  protected saveDashboardAppointment(): void {
    if (this.dashboardAppointmentForm.invalid) {
      this.dashboardAppointmentForm.markAllAsTouched();
      return;
    }

    const payload = this.dashboardAppointmentForm.getRawValue();
    this.data.addAppointment({
      ...payload,
      durationMinutes: Number(payload.durationMinutes) || 60,
      linkedQuoteId: payload.linkedQuoteId || null,
    });
    this.dashboardAppointmentModalOpen.set(false);
  }

  protected quoteDueStatus(days: number): string {
    if (days < 0) {
      return 'Scaduto';
    }
    if (days === 0) {
      return 'Scade oggi';
    }
    if (days === 1) {
      return '1 giorno';
    }
    return `${days} giorni`;
  }
}
