const fs = require('fs');
let html = fs.readFileSync('src/app/section-page.html', 'utf8');

html = html.replace(/<section class="crm-section-hero">[\s\S]*?<\/section>/, '');
html = html.replace(/<div class="op-grid three-col">/, '<div class="op-grid">');

const rx1 = /<div class="op-card">\s*<div class="op-card-title-row">\s*<h2 class="op-card-title">Inserimento nuova spesa<\/h2>[\s\S]*?<div class="op-card">\s*<h2 class="op-card-title">Registro spese<\/h2>/;
const r1 = `<div class="op-card">
            <div class="op-card-title-row">
              <h2 class="op-card-title">Registro spese</h2>
              <div style="display: flex; gap: 0.5rem;">
                <button type="button" class="btn-secondary" (click)="openSupplierModal()">+ Nuovo fornitore</button>
                <button type="button" class="btn-add" (click)="openExpenseModal()" [disabled]="!expensePermissions()['expense:create']">+ Nuova spesa</button>
              </div>
            </div>`;
html = html.replace(rx1, r1);

const rx2 = /<div class="op-card">\s*<h2 class="op-card-title">Promemoria pagamenti<\/h2>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;
html = html.replace(rx2, '');

const rx3 = /<div class="op-card">\s*<h2 class="op-card-title">Anagrafica fornitori<\/h2>[\s\S]*?<div class="op-card">\s*<h2 class="op-card-title">Statistiche per categoria<\/h2>/;
html = html.replace(rx3, `<div class="op-card">
            <h2 class="op-card-title">Statistiche per categoria</h2>`);

const rx4 = /<div class="op-card">\s*<h2 class="op-card-title">Top fornitori e audit<\/h2>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;
html = html.replace(rx4, '</div>\n        </div>');

html = html.replace(/<div class="ui-modal-overlay" \(click\)="closeExpenseModal\(\)">/, '<div class="ui-modal-overlay ui-modal-overlay-fullscreen" (click)="closeExpenseModal()">');
html = html.replace(/<div class="ui-modal" \(click\)="\$event\.stopPropagation\(\)">/, '<div class="ui-modal ui-modal-fullscreen" (click)="$event.stopPropagation()">');

const modalHtml = `
        @if (supplierModalOpen()) {
          <div class="ui-modal-overlay ui-modal-overlay-fullscreen" (click)="closeSupplierModal()">
            <div class="ui-modal ui-modal-fullscreen" (click)="$event.stopPropagation()">
              <div class="ui-modal-head">
                <div>
                  <span class="detail-subtitle">Fornitori</span>
                  <h2 class="op-card-title">Nuovo fornitore</h2>
                </div>
                <button type="button" class="btn-ghost" (click)="closeSupplierModal()">Chiudi</button>
              </div>
              <form class="op-form op-form-pro ui-modal-body" [formGroup]="expenseSupplierForm" (ngSubmit)="addExpenseSupplier()">
                <div class="form-grid two">
                  <label><span>Ragione sociale</span><input type="text" formControlName="businessName" /></label>
                  <label><span>Partita IVA</span><input type="text" formControlName="vatNumber" /></label>
                </div>
                <div class="form-grid two">
                  <label><span>Indirizzo</span><input type="text" formControlName="address" /></label>
                  <label><span>Contatto</span><input type="text" formControlName="contactName" /></label>
                </div>
                <div class="form-grid two">
                  <label><span>Email</span><input type="email" formControlName="email" /></label>
                  <label><span>Telefono</span><input type="text" formControlName="phone" /></label>
                </div>
                <label><span>Tipo fornitura</span><input type="text" formControlName="supplyType" /></label>
                <div class="form-actions" style="margin-top: 2rem;">
                  <button type="submit" class="btn-primary" [disabled]="!expensePermissions()['expense:update']">Aggiungi fornitore</button>
                </div>
              </form>
            </div>
          </div>
        }
`;
html = html.replace(/(?=@if \(expenseModalOpen\(\))/, modalHtml);

fs.writeFileSync('src/app/section-page.html', html);
console.log('Success HTML update');