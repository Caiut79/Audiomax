// Server di sincronizzazione stato per la LAN
// Gestisce l'endpoint /api/state per condividere i dati tra PC e telefono.
// Avviato automaticamente insieme ad Angular tramite npm run start:lan
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stateFile = path.join(__dirname, '.audiomax-state.json');
const PORT = 4202;

function sendJson(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(data));
}

/**
 * Merge degli operatori di cassa: preserva i campi epPortal* (credenziali/revoche)
 * dallo stato esistente se lo stato in arrivo non li contiene.
 * Questo evita che un dispositivo senza credenziali (es. telefono con stato seed)
 * sovrascriva le credenziali impostate dal titolare sul PC.
 */
function mergeCashOperators(existingOps, incomingOps) {
    if (!Array.isArray(incomingOps)) return existingOps;
    if (!Array.isArray(existingOps) || existingOps.length === 0) return incomingOps;

    const existingById = new Map(existingOps.map((o) => [o.id, o]));

    return incomingOps.map((incomingOp) => {
        const existingOp = existingById.get(incomingOp.id);
        if (!existingOp) return incomingOp;

        const existingHasPortal =
            existingOp.epPortalEnabled === true || !!existingOp.epPortalAccessRevokedAt;
        const incomingHasPortal =
            incomingOp.epPortalEnabled === true || !!incomingOp.epPortalAccessRevokedAt;

        // Se lo stato esistente ha credenziali/revoche e quello in arrivo no,
        // preserva i campi epPortal* esistenti.
        if (existingHasPortal && !incomingHasPortal) {
            return {
                ...incomingOp,
                epPortalEnabled: existingOp.epPortalEnabled,
                epPortalUsername: existingOp.epPortalUsername,
                epPortalPasswordHash: existingOp.epPortalPasswordHash,
                epPortalAccessRevokedAt: existingOp.epPortalAccessRevokedAt,
                epPortalLastLoginAt: existingOp.epPortalLastLoginAt,
            };
        }
        return incomingOp;
    });
}

const server = http.createServer((req, res) => {
    // Gestisce solo /api/state
    if (!req.url || !req.url.startsWith('/api/state')) {
        sendJson(res, 404, { error: 'Not found' });
        return;
    }

    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
    }

    if (req.method === 'GET') {
        if (fs.existsSync(stateFile)) {
            const content = fs.readFileSync(stateFile, 'utf-8');
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
            res.end(content);
        } else {
            sendJson(res, 404, {});
        }
        return;
    }

    if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
        });
        req.on('end', () => {
            try {
                const incomingState = JSON.parse(body); // Valida JSON

                // Merge cashOperators per preservare le credenziali del portale
                if (fs.existsSync(stateFile)) {
                    try {
                        const existingRaw = fs.readFileSync(stateFile, 'utf-8');
                        const existingState = JSON.parse(existingRaw);
                        if (existingState.cashOperators && incomingState.cashOperators) {
                            incomingState.cashOperators = mergeCashOperators(
                                existingState.cashOperators,
                                incomingState.cashOperators,
                            );
                        }
                    } catch {
                        // Se il file esistente è corrotto, ignora il merge e usa lo stato in arrivo
                    }
                }

                fs.writeFileSync(stateFile, JSON.stringify(incomingState), 'utf-8');
                sendJson(res, 200, { ok: true });
            } catch {
                sendJson(res, 400, { error: 'JSON non valido' });
            }
        });
        return;
    }

    sendJson(res, 405, { error: 'Metodo non consentito' });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`State sync server in ascolto su http://0.0.0.0:${PORT}/api/state`);
});
