import re
import sys

def remove_explanations(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Remove <p class="crm-section-copy"> ... </p> (which can span multiple lines)
    # We use a non-greedy regex
    content = re.sub(r'<p class="crm-section-copy[^>]*>.*?</p>', '', content, flags=re.DOTALL)
    
    # In Dipendenti: 
    # Remove:
    # <p>
    #   @if (employeePanelView() === 'elenco') {
    #     Vista più pulita e diretta: nome, ruolo, stato e copertura turni si leggono subito,
    #     senza pannelli inutili sulla destra.
    #   } @else {
    #     Turni di tutto il team e assenze nello stesso blocco, affiancati alla gestione
    #     dipendenti ma senza creare una colonna separata.
    #   }
    # </p>
    content = re.sub(r'<p>\s*@if \(employeePanelView\(\) === \'elenco\'\) \{.*?</p>', '', content, flags=re.DOTALL)

    # Remove:
    # <p>
    #   La vista mese parte sempre dal mese corrente. Se un'assenza attraversa più
    #   mesi, la ritrovi automaticamente anche nel mese successivo.
    # </p>
    content = re.sub(r'<p>\s*La vista mese parte sempre dal mese corrente\..*?</p>', '', content, flags=re.DOTALL)
    
    # Remove:
    # <p>
    #   La gestione turni e assenze è unificata: se inserisci le ferie dal calendario, la
    #   cella turno si adeguerà automaticamente. I conteggi ore considerano sia il contratto
    #   base sia le eccezioni registrate.
    # </p>
    content = re.sub(r'<p>\s*La gestione turni e assenze è unificata:.*?</p>', '', content, flags=re.DOTALL)
    
    # Remove:
    # <p>
    #   Gestisci mansione, tipo profilo, ruolo di accesso e copertura turni in
    #   un’unica schermata semplice.
    # </p>
    content = re.sub(r'<p>\s*Gestisci mansione, tipo profilo, ruolo di accesso.*?</p>', '', content, flags=re.DOTALL)
    
    # Remove <div class="employee-list-intro"> ... </div> (but it contains span and div that we might want to keep? No, the summary pills are inside `employee-list-summary`)
    # Let's keep `employee-list-summary` and just remove the intro text. We already removed the <p>. What about the subtitle?
    # <span class="detail-subtitle">
    #   @if (employeePanelView() === 'elenco') {
    #     Vista team
    #   } @else {
    #     Organizzazione personale
    #   }
    # </span>
    # It's fine to leave the subtitle.

    with open(filepath, 'w') as f:
        f.write(content)

remove_explanations('src/app/section-page.html')
