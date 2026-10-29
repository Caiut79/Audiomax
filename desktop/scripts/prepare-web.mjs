// ============================================================================
// Copia la build Angular di produzione dentro desktop/web.
// La cartella web/ è quella che viene impacchettata nell'app desktop, quindi
// viene svuotata prima di ogni copia per non trascinare file con hash vecchi.
// ============================================================================
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cartellaDesktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origine = path.resolve(cartellaDesktop, '..', 'dist', 'audiomax', 'browser');
const destinazione = path.join(cartellaDesktop, 'web');

async function esiste(percorso) {
  try {
    await stat(percorso);
    return true;
  } catch {
    return false;
  }
}

if (!(await esiste(path.join(origine, 'index.html')))) {
  console.error(
    `Build Angular non trovata in ${origine}.\n` +
      'Esegui prima "npm run build" nella cartella principale del progetto.',
  );
  process.exit(1);
}

await rm(destinazione, { recursive: true, force: true });
await mkdir(destinazione, { recursive: true });
await cp(origine, destinazione, { recursive: true });

console.log(`Build web copiata in ${destinazione}`);
