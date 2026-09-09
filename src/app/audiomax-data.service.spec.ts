import { TestBed } from '@angular/core/testing';

import { AudiomaxDataService } from './audiomax-data.service';

describe('AudiomaxDataService Warehouse', () => {
  let service: AudiomaxDataService;

  beforeEach(() => {
    localStorage.removeItem('audiomax-crm-state');
    TestBed.configureTestingModule({
      providers: [AudiomaxDataService],
    });
    service = TestBed.inject(AudiomaxDataService);
  });

  it('applica FIFO tra lotti multipli con prezzi diversi', () => {
    service.receiveWarehouseStock({
      sku: 'SKU-FIFO-001',
      barcode: '8000000000011',
      name: 'Cavo test',
      description: 'Cavo test FIFO',
      category: 'Cavi',
      usageType: 'rivendita',
      unitOfMeasure: 'pz',
      quantity: 10,
      unitCost: 5,
      salePrice: 12,
      receivedDate: '2026-01-10',
      supplier: 'Fornitore Test',
      lotNumber: '',
      expiryDate: null,
      shelfCode: 'C-01-01',
      minStock: 2,
      purchaseDocumentNumber: 'DDT-TEST-001',
      operator: 'QA',
      transportCost: 0,
      customsCost: 0,
      packagingCost: 0,
    });
    service.receiveWarehouseStock({
      sku: 'SKU-FIFO-001',
      barcode: '8000000000011',
      name: 'Cavo test',
      description: 'Cavo test FIFO',
      category: 'Cavi',
      usageType: 'rivendita',
      unitOfMeasure: 'pz',
      quantity: 10,
      unitCost: 7,
      salePrice: 14,
      receivedDate: '2026-02-10',
      supplier: 'Fornitore Test',
      lotNumber: '',
      expiryDate: null,
      shelfCode: 'C-01-01',
      minStock: 2,
      purchaseDocumentNumber: 'DDT-TEST-002',
      operator: 'QA',
      transportCost: 0,
      customsCost: 0,
      packagingCost: 0,
    });

    const item = service.inventoryItems().find((entry) => entry.sku === 'SKU-FIFO-001');
    expect(item).toBeTruthy();

    const consumed = service.consumeInventoryFifoByItemId({
      inventoryItemId: item!.id,
      quantity: 12,
      reason: 'Test FIFO',
      documentNumber: 'DOC-FIFO-001',
      operator: 'QA',
      sourceModule: 'inventario',
    });

    expect(consumed).toBe(12);
    const lots = service.warehouseLots()
      .filter((lot) => lot.inventoryItemId === item!.id)
      .sort((left, right) => left.receivedDate.localeCompare(right.receivedDate));

    expect(lots.length).toBe(2);
    expect(lots[0].availableQuantity).toBe(0);
    expect(lots[1].availableQuantity).toBe(8);
  });

  it('calcola valore inventario per lotto con costi differenti', () => {
    service.receiveWarehouseStock({
      sku: 'SKU-VAL-001',
      barcode: '8000000000028',
      name: 'Amplificatore prova',
      description: 'Amplificatore prova',
      category: 'Amplificatori',
      usageType: 'rivendita',
      unitOfMeasure: 'pz',
      quantity: 4,
      unitCost: 100,
      salePrice: 180,
      receivedDate: '2026-01-15',
      supplier: 'Fornitore Val',
      lotNumber: '',
      expiryDate: null,
      shelfCode: 'D-01-02',
      minStock: 1,
      purchaseDocumentNumber: 'DDT-VAL-001',
      operator: 'QA',
      transportCost: 0,
      customsCost: 0,
      packagingCost: 0,
    });
    service.receiveWarehouseStock({
      sku: 'SKU-VAL-001',
      barcode: '8000000000028',
      name: 'Amplificatore prova',
      description: 'Amplificatore prova',
      category: 'Amplificatori',
      usageType: 'rivendita',
      unitOfMeasure: 'pz',
      quantity: 2,
      unitCost: 130,
      salePrice: 210,
      receivedDate: '2026-01-20',
      supplier: 'Fornitore Val',
      lotNumber: '',
      expiryDate: null,
      shelfCode: 'D-01-02',
      minStock: 1,
      purchaseDocumentNumber: 'DDT-VAL-002',
      operator: 'QA',
      transportCost: 0,
      customsCost: 0,
      packagingCost: 0,
    });

    const item = service.inventoryItems().find((entry) => entry.sku === 'SKU-VAL-001');
    expect(item).toBeTruthy();

    const summary = service.warehouseInventorySummary().find((entry) => entry.item.id === item!.id);
    expect(summary).toBeTruthy();
    expect(summary?.quantityAvailable).toBe(6);
    expect(summary?.valuationByLot).toBe(660);
  });

  it('crea un nuovo lotto se cambiano barcode o prezzo vendita e aggiorna la cassa collegata', () => {
    service.receiveWarehouseStock({
      sku: 'SKU-SYNC-001',
      barcode: '8000000000035',
      name: 'Supporto sync',
      description: 'Supporto sync',
      category: 'Supporti',
      usageType: 'rivendita',
      unitOfMeasure: 'pz',
      quantity: 3,
      unitCost: 10,
      salePrice: 24,
      receivedDate: '2026-02-01',
      supplier: 'Sync Supplier',
      lotNumber: '',
      expiryDate: null,
      shelfCode: 'S-01-01',
      minStock: 1,
      purchaseDocumentNumber: 'DDT-SYNC-001',
      operator: 'QA',
      transportCost: 0,
      customsCost: 0,
      packagingCost: 0,
    });

    const item = service.inventoryItems().find((entry) => entry.sku === 'SKU-SYNC-001');
    expect(item).toBeTruthy();

    service.addCashProduct({
      name: 'Supporto sync',
      category: 'Accessori',
      price: 24,
      shortcut: true,
      pricingMode: 'quantita',
      linkedInventoryItemId: item!.id,
    });

    service.receiveWarehouseStock({
      inventoryItemId: item!.id,
      sku: 'SKU-SYNC-001',
      barcode: '8000000000097',
      name: 'Supporto sync',
      description: 'Supporto sync nuovo lotto',
      category: 'Supporti',
      usageType: 'rivendita',
      unitOfMeasure: 'pz',
      quantity: 2,
      unitCost: 8,
      salePrice: 19,
      receivedDate: '2026-02-10',
      supplier: 'Sync Supplier',
      lotNumber: '',
      expiryDate: null,
      shelfCode: 'S-01-01',
      minStock: 1,
      purchaseDocumentNumber: 'DDT-SYNC-002',
      operator: 'QA',
      transportCost: 0,
      customsCost: 0,
      packagingCost: 0,
    });

    const updatedItem = service.inventoryItems().find((entry) => entry.id === item!.id);
    const lots = service.warehouseLots()
      .filter((lot) => lot.inventoryItemId === item!.id)
      .sort((left, right) => left.receivedDate.localeCompare(right.receivedDate));
    const linkedCashProduct = service.cashProducts().find((entry) => entry.linkedInventoryItemId === item!.id);

    expect(updatedItem?.barcode).toBe('8000000000097');
    expect(updatedItem?.salePrice).toBe(19);
    expect(lots.length).toBe(2);
    expect(lots[1].barcode).toBe('8000000000097');
    expect(lots[1].salePrice).toBe(19);
    expect(linkedCashProduct?.price).toBe(19);
  });

  it('traccia movimenti e rettifiche nello storico', () => {
    service.receiveWarehouseStock({
      sku: 'SKU-RET-001',
      barcode: '8000000000042',
      name: 'Ricevitore test',
      description: 'Ricevitore test',
      category: 'Ricevitori',
      usageType: 'rivendita',
      unitOfMeasure: 'pz',
      quantity: 5,
      unitCost: 50,
      salePrice: 95,
      receivedDate: '2026-02-02',
      supplier: 'Fornitore Ret',
      lotNumber: '',
      expiryDate: null,
      shelfCode: 'E-02-01',
      minStock: 1,
      purchaseDocumentNumber: 'DDT-RET-001',
      operator: 'QA',
      transportCost: 0,
      customsCost: 0,
      packagingCost: 0,
    });

    const item = service.inventoryItems().find((entry) => entry.sku === 'SKU-RET-001');
    expect(item).toBeTruthy();

    const baseMovements = service.warehouseMovements().length;
    service.adjustInventoryQuantity({
      inventoryItemId: item!.id,
      actualQuantity: 3,
      reason: 'Conteggio fisico',
      operator: 'QA',
    });

    expect(service.warehouseAdjustments().length).toBeGreaterThan(0);
    expect(service.warehouseMovements().length).toBeGreaterThan(baseMovements);
    expect(service.warehouseAuditLog().length).toBeGreaterThan(0);
  });

  it('genera spesa automatica da carico magazzino', () => {
    const baseExpenses = service.expenseRecords().length;

    service.receiveWarehouseStock({
      sku: 'SKU-EXP-001',
      barcode: '8000000000059',
      name: 'Diffusore test',
      description: 'Diffusore test integrazione spese',
      category: 'Diffusori',
      usageType: 'rivendita',
      unitOfMeasure: 'pz',
      quantity: 3,
      unitCost: 120,
      salePrice: 199,
      receivedDate: '2026-02-15',
      supplier: 'Audio Trade',
      lotNumber: '',
      expiryDate: null,
      shelfCode: 'F-01-01',
      minStock: 1,
      purchaseDocumentNumber: 'DDT-EXP-001',
      operator: 'QA',
      transportCost: 15,
      customsCost: 0,
      packagingCost: 5,
    });

    expect(service.expenseRecords().length).toBe(baseExpenses + 1);
    const generatedExpense = service.expenseRecords()[0];
    expect(generatedExpense.sourceType).toBe('magazzino');
    expect(generatedExpense.amountGross).toBe(380);
  });

  it('crea spesa rateale e aggiorna stato con pagamento rata', () => {
    const categoryId = service.expenseCategories()[0].id;
    const paymentMethodId = service.expensePaymentMethods()[0].id;

    const expense = service.createExpense({
      description: 'Canone software annuale',
      categoryId,
      supplierId: null,
      genericSupplierLabel: 'Servizio cloud',
      paymentMode: 'rateale',
      recurringFrequency: null,
      paymentMethodId,
      amountGross: 1200,
      vatRate: 22,
      expenseDate: '2026-03-01',
      dueDate: '2026-03-10',
      notes: '',
      attachmentName: null,
      projectCode: null,
      costCenterCode: null,
      createdBy: 'QA',
      sourceType: 'manuale',
      sourceReferenceId: null,
      installmentsCount: 3,
      noticeDaysBefore: 7,
    });

    const installments = service.expenseInstallments().filter((entry) => entry.expenseId === expense.id);
    expect(installments.length).toBe(3);

    service.markExpenseInstallmentPaid(installments[0].id, 'QA');
    const refreshedExpense = service.expenseRecords().find((entry) => entry.id === expense.id);
    expect(refreshedExpense?.status).toBe('parziale');
  });

  it('genera notifiche promemoria su soglie 7/3/1 giorni', () => {
    const categoryId = service.expenseCategories()[0].id;
    const paymentMethodId = service.expensePaymentMethods()[0].id;

    const expense = service.createExpense({
      description: 'Promemoria test',
      categoryId,
      supplierId: null,
      genericSupplierLabel: 'Servizio test',
      paymentMode: 'singolo',
      recurringFrequency: null,
      paymentMethodId,
      amountGross: 300,
      vatRate: 22,
      expenseDate: '2026-03-01',
      dueDate: '2026-03-31',
      notes: '',
      attachmentName: null,
      projectCode: null,
      costCenterCode: null,
      createdBy: 'QA',
      sourceType: 'manuale',
      sourceReferenceId: null,
      installmentsCount: 1,
      noticeDaysBefore: 7,
    });

    service.runExpenseReminderSweep('2026-03-24');
    const notifications = service.expenseNotifications().filter((entry) => entry.expenseId === expense.id);
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications.some((entry) => entry.daysBeforeDue === 7)).toBe(true);
  });

  it('applica permessi ruolo viewer bloccando la creazione spese', () => {
    service.setCurrentUserRole('viewer');
    const categoryId = service.expenseCategories()[0].id;
    const paymentMethodId = service.expensePaymentMethods()[0].id;

    expect(() =>
      service.createExpense({
        description: 'Spesa bloccata',
        categoryId,
        supplierId: null,
        genericSupplierLabel: null,
        paymentMode: 'singolo',
        recurringFrequency: null,
        paymentMethodId,
        amountGross: 100,
        vatRate: 22,
        expenseDate: '2026-03-10',
        dueDate: '2026-03-10',
        notes: '',
        attachmentName: null,
        projectCode: null,
        costCenterCode: null,
        createdBy: 'QA',
        sourceType: 'manuale',
        sourceReferenceId: null,
        installmentsCount: 1,
        noticeDaysBefore: 7,
      }),
    ).toThrow();
  });
});
