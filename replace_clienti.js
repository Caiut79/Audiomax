const fs = require('fs');
const content = fs.readFileSync('src/app/section-page.html', 'utf-8');

const startIndex = content.indexOf("@case ('clienti') {");
const endIndex = content.indexOf("@if (clientModalOpen()) {");

if (startIndex !== -1 && endIndex !== -1) {
  const newClienti = `    @case ('clienti') {
      <div class="op-card">
        <div class="op-card-title-row">
          <h2 class="op-card-title">Anagrafica Clienti</h2>
          <div class="form-actions">
            <button type="button" class="btn-add" (click)="openClientModal()">+ Nuovo Cliente</button>
          </div>
        </div>
      </div>

      <div class="op-grid two-col">
        <!-- Lista Clienti -->
        <div class="op-card">
          <div class="filters-row">
            <input class="filter-input" type="search" placeholder="Cerca cliente per nome, email o telefono..." [value]="clientQuery()" (input)="updateClientQuery($event)">
            <select class="filter-select" (change)="updateClientCityFilter($event)">
              <option value="tutte">Tutte le città</option>
              @for (city of clientCities(); track city) { <option [value]="city">{{ city }}</option> }
            </select>
          </div>
          <div class="warehouse-table-wrap">
            <table class="warehouse-table">
              <thead><tr><th scope="col">Cliente</th><th scope="col">Telefono</th><th scope="col">Città</th></tr></thead>
              <tbody>
                @for (client of filteredClients(); track client.id) {
                  <tr [class.active]="selectedClientId() === client.id" (click)="selectClient(client.id)" style="cursor: pointer;">
                    <td>
                      <div class="client-name-cell">
                        <strong>{{ client.name }}</strong>
                        @if (clientHasPendingTransactions(client.id)) {
                          <span class="client-alert-badge" title="Insoluti pendenti">! € {{ clientPendingAmount(client.id).toLocaleString('it-IT') }}</span>
                        }
                      </div>
                    </td>
                    <td>{{ client.phone }}</td>
                    <td>{{ client.city }}</td>
                  </tr>
                } @empty { <tr><td colspan="3" class="empty">Nessun cliente trovato.</td></tr> }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Dettaglio e Storico Cliente -->
        <div class="op-card">
          @if (selectedClient(); as client) {
            <div class="op-card-title-row" style="margin-bottom: 1.5rem;">
              <h2 class="op-card-title" style="margin: 0;">{{ client.name }}</h2>
              <div class="form-actions">
                <button class="btn-sm" (click)="editClient(client.id)">Modifica Anagrafica</button>
              </div>
            </div>

            <div class="detail-fields" style="background: var(--surface-hover); padding: 1.25rem; border-radius: 12px; margin-bottom: 2rem;">
              <div class="detail-field"><span>Telefono</span><strong>{{ client.phone || 'Non inserito' }}</strong></div>
              <div class="detail-field"><span>Email</span><strong>{{ client.email || 'Non inserito' }}</strong></div>
              <div class="detail-field"><span>Indirizzo</span><strong>{{ client.address || 'Non inserito' }}, {{ client.city }}</strong></div>
              <div class="detail-field"><span>Canale Preferito</span><strong style="text-transform: capitalize;">{{ client.preferredContact }}</strong></div>
              @if (client.notes) {
                <div class="detail-field" style="grid-column: 1 / -1; margin-top: 0.5rem;">
                  <span>Note Cliente</span>
                  <p style="margin: 0; font-size: 0.9rem;">{{ client.notes }}</p>
                </div>
              }
            </div>

            <div class="detail-section">
              <span class="detail-section-title" style="font-size: 1.1rem; border-bottom: 2px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 1rem; display: block;">Storico Preventivi & Ordini</span>
              <div class="record-list compact">
                @for (quote of selectedClientHistory().quotes; track quote.id) {
                  <div class="record-row">
                    <div class="record-info">
                      <strong>{{ quote.projectType }}</strong>
                      <span>Compilato da: {{ quote.operatorName || 'Operatore' }} · Scadenza: {{ quote.dueDate || 'N/D' }}</span>
                    </div>
                    <div class="record-actions">
                      <span class="badge" [class.bg-blue]="quote.stage === 'ordine'" [class.bg-green]="quote.stage === 'confermato'">{{ quote.stage | uppercase }}</span>
                      <strong>€ {{ quote.value.toLocaleString('it-IT') }}</strong>
                    </div>
                  </div>
                } @empty {
                  <p class="text-muted" style="padding: 1rem; text-align: center;">Nessun preventivo registrato per questo cliente.</p>
                }
              </div>
            </div>

            <div class="detail-section" style="margin-top: 2rem;">
              <span class="detail-section-title" style="font-size: 1.1rem; border-bottom: 2px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 1rem; display: block;">Storico Cassa e Scontrini</span>
              <div class="record-list compact">
                @for (txn of selectedClientHistory().transactions; track txn.id) {
                  <div class="record-row">
                    <div class="record-info">
                      <strong>{{ txn.documentType === 'scontrino' ? 'Scontrino n. ' + txn.receiptNumber : 'Fattura n. ' + txn.invoiceNumber }}</strong>
                      <span>Data: {{ txn.createdAt.slice(0, 10) }} · Metodo: <span style="text-transform: capitalize;">{{ txn.paymentMethod }}</span></span>
                    </div>
                    <div class="record-actions">
                      <span class="badge" [class.bg-red]="txn.status === 'insoluto'" [class.bg-green]="txn.status === 'pagato'">{{ txn.status | uppercase }}</span>
                      <strong>€ {{ txn.total.toLocaleString('it-IT') }}</strong>
                    </div>
                  </div>
                } @empty {
                  <p class="text-muted" style="padding: 1rem; text-align: center;">Nessun movimento in cassa per questo cliente.</p>
                }
              </div>
            </div>

            <div class="detail-section" style="margin-top: 2rem;">
              <span class="detail-section-title" style="font-size: 1.1rem; border-bottom: 2px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 1rem; display: block;">Storico Appuntamenti e Interventi</span>
              <div class="record-list compact">
                @for (appt of selectedClientHistory().appointments; track appt.id) {
                  <div class="record-row">
                    <div class="record-info">
                      <strong>{{ appt.title }}</strong>
                      <span>Tecnico/Operatore: {{ appt.technician || 'Non assegnato' }} · Tipo: <span style="text-transform: capitalize;">{{ appt.appointmentType }}</span></span>
                    </div>
                    <div class="record-actions" style="display: flex; align-items: center; gap: 1rem;">
                      <span class="text-muted">{{ appt.scheduledAt.slice(0, 16).replace('T', ' ') }}</span>
                      <span class="badge" [class.bg-green]="appt.status === 'chiuso'">{{ appt.status | uppercase }}</span>
                    </div>
                  </div>
                } @empty {
                  <p class="text-muted" style="padding: 1rem; text-align: center;">Nessun appuntamento registrato.</p>
                }
              </div>
            </div>

          } @else {
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 400px; color: var(--text-muted);">
              <span style="font-size: 3rem; margin-bottom: 1rem;">👤</span>
              <p style="font-size: 1.1rem;">Seleziona un cliente dalla lista per visualizzare l'anagrafica completa e lo storico operativo.</p>
            </div>
          }
        </div>
      </div>

      `;
  
  const finalContent = content.substring(0, startIndex) + newClienti + content.substring(endIndex);
  fs.writeFileSync('src/app/section-page.html', finalContent);
  console.log('Replace successful!');
} else {
  console.log('Could not find boundaries.');
}
