// ============================================================================
// AudioMax CRM — processo principale dell'app desktop (Electron)
//
// L'app desktop NON è un'app separata: mostra la stessa identica interfaccia
// Angular del gestionale web, servita da un piccolo server locale su
// 127.0.0.1. Serve un server locale (invece di caricare i file con file://)
// perché l'app usa il routing HTML5, il localStorage multi-tenant e le fetch
// verso Supabase: con file:// il routing e la memoria locale non funzionano.
//
// Porta FISSA: l'origine (http://127.0.0.1:43117) determina dove il browser
// salva localStorage, quindi il numero di porta non deve mai cambiare tra un
// avvio e l'altro, altrimenti si perderebbe lo stato locale.
// ============================================================================
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const APP_NAME = 'AudioMax CRM';
const APP_ID = 'com.audiomax.crm';
const PORT_PREFERITA = 43117;
const PORT_TENTATIVI = 8; // 43117..43124, usate solo se la preferita è occupata
const CARTELLA_WEB = path.join(__dirname, '..', 'web');

// ─── Tipi MIME per gli asset della build Angular ───
const TIPI_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

let finestra = null;
let server = null;
let indirizzoBase = '';
let inAvvio = false;

/** Percorso del file JSON che archivia lo stato condiviso su disco. */
function fileStato() {
  return path.join(app.getPath('userData'), 'audiomax-state.json');
}

/**
 * Percorso del contratto di licenza: nell'app installata viene copiato nelle
 * risorse del pacchetto, in sviluppo resta nella cartella build.
 */
function fileLicenza() {
  const inRisorse = path.join(process.resourcesPath ?? '', 'EULA.txt');
  if (app.isPackaged && fs.existsSync(inRisorse)) return inRisorse;
  return path.join(__dirname, '..', 'build', 'EULA.txt');
}

// ============================================================================
// Endpoint /api/state — archivio su disco dello stato (usato dal super admin)
// Replica il comportamento di state-server.mjs usato in sviluppo.
// ============================================================================

/**
 * Merge degli operatori di cassa: se lo stato esistente ha le credenziali del
 * portale dipendente e quello in arrivo no, le credenziali vengono preservate.
 * Evita che un dispositivo senza credenziali sovrascriva quelle impostate qui.
 */
function mergeOperatoriCassa(esistenti, inArrivo) {
  if (!Array.isArray(inArrivo)) return esistenti;
  if (!Array.isArray(esistenti) || esistenti.length === 0) return inArrivo;

  const perId = new Map(esistenti.map((operatore) => [operatore.id, operatore]));

  return inArrivo.map((operatore) => {
    const esistente = perId.get(operatore.id);
    if (!esistente) return operatore;

    const esistenteHaPortale =
      esistente.epPortalEnabled === true || !!esistente.epPortalAccessRevokedAt;
    const inArrivoHaPortale =
      operatore.epPortalEnabled === true || !!operatore.epPortalAccessRevokedAt;

    if (esistenteHaPortale && !inArrivoHaPortale) {
      return {
        ...operatore,
        epPortalEnabled: esistente.epPortalEnabled,
        epPortalUsername: esistente.epPortalUsername,
        epPortalPasswordHash: esistente.epPortalPasswordHash,
        epPortalAccessRevokedAt: esistente.epPortalAccessRevokedAt,
        epPortalLastLoginAt: esistente.epPortalLastLoginAt,
      };
    }
    return operatore;
  });
}

function rispondiJson(res, stato, dati) {
  res.writeHead(stato, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(dati));
}

function gestisciStato(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const archivio = fileStato();

  if (req.method === 'GET') {
    if (fs.existsSync(archivio)) {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(fs.readFileSync(archivio, 'utf-8'));
    } else {
      rispondiJson(res, 404, {});
    }
    return;
  }

  if (req.method === 'POST') {
    let corpo = '';
    req.on('data', (chunk) => {
      corpo += chunk;
    });
    req.on('end', () => {
      try {
        const statoInArrivo = JSON.parse(corpo);

        // Preserva le credenziali del portale dipendente già archiviate
        if (fs.existsSync(archivio)) {
          try {
            const esistente = JSON.parse(fs.readFileSync(archivio, 'utf-8'));
            if (esistente.cashOperators && statoInArrivo.cashOperators) {
              statoInArrivo.cashOperators = mergeOperatoriCassa(
                esistente.cashOperators,
                statoInArrivo.cashOperators,
              );
            }
          } catch {
            // Archivio illeggibile: si sovrascrive con lo stato in arrivo
          }
        }

        fs.writeFileSync(archivio, JSON.stringify(statoInArrivo), 'utf-8');
        rispondiJson(res, 200, { ok: true });
      } catch {
        rispondiJson(res, 400, { error: 'JSON non valido' });
      }
    });
    return;
  }

  rispondiJson(res, 405, { error: 'Metodo non consentito' });
}

// ============================================================================
// Server statico — serve la build Angular con fallback SPA su index.html
// (equivalente al rewrite di vercel.json, così il routing Angular funziona)
// ============================================================================
function risolviFileRichiesto(urlPath) {
  const decodificato = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);

  // Difesa da path traversal: il file deve restare dentro la cartella web
  const candidato = path.normalize(path.join(CARTELLA_WEB, decodificato));
  if (!candidato.startsWith(CARTELLA_WEB)) return null;

  if (fs.existsSync(candidato) && fs.statSync(candidato).isFile()) return candidato;

  // Estensione non presente → è una rotta Angular: si restituisce index.html
  if (!path.extname(candidato)) {
    const index = path.join(CARTELLA_WEB, 'index.html');
    return fs.existsSync(index) ? index : null;
  }

  return null;
}

function gestisciRichiesta(req, res) {
  if (req.url && req.url.startsWith('/api/state')) {
    gestisciStato(req, res);
    return;
  }

  const file = risolviFileRichiesto(req.url || '/');
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Risorsa non trovata');
    return;
  }

  res.writeHead(200, {
    'Content-Type': TIPI_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
}

/** Avvia il server locale e restituisce l'indirizzo base della finestra. */
function avviaServerLocale() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(path.join(CARTELLA_WEB, 'index.html'))) {
      reject(new Error('Build web mancante: esegui prima "npm run build" nella cartella del progetto.'));
      return;
    }

    server = http.createServer(gestisciRichiesta);
    let porta = PORT_PREFERITA;

    const tentaAvvio = () => {
      server.once('error', (errore) => {
        if (errore.code === 'EADDRINUSE' && porta < PORT_PREFERITA + PORT_TENTATIVI) {
          porta += 1;
          setImmediate(tentaAvvio);
          return;
        }
        reject(errore);
      });

      server.listen(porta, '127.0.0.1', () => {
        indirizzoBase = `http://127.0.0.1:${porta}`;
        resolve(indirizzoBase);
      });
    };

    tentaAvvio();
  });
}

// ============================================================================
// Finestra principale
// ============================================================================
function creaFinestra() {
  finestra = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: '#0b1220',
    title: APP_NAME,
    autoHideMenuBar: process.platform === 'win32',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      zoomFactor: 1,
    },
  });

  // L'utente deve vedere la finestra solo quando l'interfaccia è pronta
  finestra.once('ready-to-show', () => finestra.show());

  // Un eventuale link esterno si apre nel browser di sistema, non dentro l'app
  finestra.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1')) return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  finestra.webContents.on('will-navigate', (evento, url) => {
    if (!url.startsWith(indirizzoBase)) {
      evento.preventDefault();
      void shell.openExternal(url);
    }
  });

  void finestra.loadURL(`${indirizzoBase}/`);

  finestra.on('closed', () => {
    finestra = null;
  });
}

// ============================================================================
// Voci di menu: la licenza e la cartella dati restano consultabili
// ============================================================================
function mostraLicenza() {
  let testo = 'File del contratto di licenza non disponibile.';
  try {
    testo = fs.readFileSync(fileLicenza(), 'utf-8');
  } catch {
    // In caso di file mancante si mostra comunque il messaggio di fallback
  }
  void dialog.showMessageBox(finestra ?? undefined, {
    type: 'info',
    title: 'Contratto di licenza d\'uso',
    message: 'Contratto di licenza d\'uso — AudioMax CRM',
    detail: testo,
    buttons: ['Chiudi'],
    noLink: true,
  });
}

function apriCartellaDati() {
  void shell.openPath(app.getPath('userData'));
}

function costruisciMenu() {
  const vociLicenza = [
    { label: 'Contratto di licenza…', click: mostraLicenza },
    { label: 'Apri cartella dati…', click: apriCartellaDati },
  ];

  const modello =
    process.platform === 'darwin'
      ? [
          {
            label: APP_NAME,
            submenu: [
              { label: `Informazioni su ${APP_NAME}`, role: 'about' },
              ...vociLicenza,
              { type: 'separator' },
              { label: 'Nascondi', role: 'hide' },
              { label: 'Nascondi gli altri', role: 'hideOthers' },
              { type: 'separator' },
              { label: `Esci da ${APP_NAME}`, role: 'quit' },
            ],
          },
          {
            label: 'File',
            submenu: [{ label: 'Chiudi finestra', role: 'close' }],
          },
          {
            label: 'Modifica',
            submenu: [
              { label: 'Annulla', role: 'undo' },
              { label: 'Ripeti', role: 'redo' },
              { type: 'separator' },
              { label: 'Taglia', role: 'cut' },
              { label: 'Copia', role: 'copy' },
              { label: 'Incolla', role: 'paste' },
              { label: 'Seleziona tutto', role: 'selectAll' },
            ],
          },
          {
            label: 'Vista',
            submenu: [
              { label: 'Ricarica', role: 'reload' },
              { label: 'Schermo intero', role: 'togglefullscreen' },
              { type: 'separator' },
              { label: 'Zoom avanti', role: 'zoomIn' },
              { label: 'Zoom indietro', role: 'zoomOut' },
              { label: 'Zoom originale', role: 'resetZoom' },
            ],
          },
          {
            label: 'Finestra',
            submenu: [
              { label: 'Riduci a icona', role: 'minimize' },
              { label: 'Zooma', role: 'zoom' },
            ],
          },
        ]
      : [
          {
            label: 'File',
            submenu: [...vociLicenza, { type: 'separator' }, { label: 'Esci', role: 'quit' }],
          },
          {
            label: 'Modifica',
            submenu: [
              { label: 'Annulla', role: 'undo' },
              { label: 'Ripeti', role: 'redo' },
              { type: 'separator' },
              { label: 'Taglia', role: 'cut' },
              { label: 'Copia', role: 'copy' },
              { label: 'Incolla', role: 'paste' },
              { label: 'Seleziona tutto', role: 'selectAll' },
            ],
          },
          {
            label: 'Vista',
            submenu: [
              { label: 'Ricarica', role: 'reload' },
              { label: 'Schermo intero', role: 'togglefullscreen' },
              { type: 'separator' },
              { label: 'Zoom avanti', role: 'zoomIn' },
              { label: 'Zoom indietro', role: 'zoomOut' },
              { label: 'Zoom originale', role: 'resetZoom' },
            ],
          },
        ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(modello));
}

// ============================================================================
// Ciclo di vita dell'applicazione
// ============================================================================
app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);

// Una sola istanza: la seconda apertura riporta in primo piano quella attiva
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!finestra) return;
    if (finestra.isMinimized()) finestra.restore();
    finestra.focus();
  });

  app.whenReady().then(async () => {
    if (inAvvio) return;
    inAvvio = true;

    app.setAboutPanelOptions({
      applicationName: APP_NAME,
      applicationVersion: app.getVersion(),
      copyright: 'Copyright © Audiomax',
    });

    try {
      await avviaServerLocale();
    } catch (errore) {
      void dialog.showMessageBox({
        type: 'error',
        title: 'Avvio non riuscito',
        message: 'Impossibile avviare l\'interfaccia del gestionale.',
        detail: String(errore && errore.message ? errore.message : errore),
        buttons: ['Chiudi'],
      });
      app.quit();
      return;
    }

    costruisciMenu();
    creaFinestra();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) creaFinestra();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    if (server) server.close();
  });
}
