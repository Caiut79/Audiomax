const fs = require('fs');
let ts = fs.readFileSync('src/app/section-page.ts', 'utf8');

// Add supplierModalOpen
ts = ts.replace(/protected readonly expenseModalOpen = signal\(false\);/, 'protected readonly expenseModalOpen = signal(false);\n  protected readonly supplierModalOpen = signal(false);');

// Add open/close methods for supplier
const methods = `  protected openSupplierModal(): void {
    this.expenseSupplierForm.reset();
    this.supplierModalOpen.set(true);
  }

  protected closeSupplierModal(): void {
    this.supplierModalOpen.set(false);
  }

`;
ts = ts.replace(/protected openExpenseModal\(\): void \{/, methods + 'protected openExpenseModal(): void {');

// In addExpenseSupplier(), after a successful add, we should close the modal
ts = ts.replace(/this\.expenseSupplierForm\.reset\(\);\s*this\.pushToast\('Fornitore aggiunto con successo\.', 'success'\);/, `this.expenseSupplierForm.reset();
      this.pushToast('Fornitore aggiunto con successo.', 'success');
      this.closeSupplierModal();`);

fs.writeFileSync('src/app/section-page.ts', ts);
console.log('Success TS update');