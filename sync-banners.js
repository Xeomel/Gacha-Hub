/**
 * sync-banners.js
 * ----------------
 * Script independiente (Node.js) que consulta fuentes públicas de datos para
 * Genshin Impact, Honkai: Star Rail, Zenless Zone Zero y Wuthering Waves,
 * y sincroniza los banners encontrados con la colección `banners` de Firestore.
 *
 * IMPORTANTE — léase antes de usar:
 * No existe una API unificada y 100% confiable con fechas OFICIALES de banners
 * para los 4 juegos. Este script usa la API pública de MediaWiki de las wikis
 * de Fandom (que sí acepta llamadas de servidor sin restricciones de CORS) y
 * hace un parseo best-effort de las tablas de banners. Es un punto de partida:
 * probablemente necesites ajustar los selectores/expresiones regulares en
 * `parseBannersFromHtml()` una vez que compares la salida con la wiki real,
 * porque el formato de cada wiki puede cambiar con el tiempo.
 *
 * Uso:
 *   node scripts/sync-banners.js --dry-run     -> solo imprime lo que encontró, no escribe en Firestore
 *   node scripts/sync-banners.js                -> escribe los banners nuevos en Firestore
 *
 * Requiere la variable de entorno FIREBASE_SERVICE_ACCOUNT con el JSON de la
 * cuenta de servicio de Firebase (ver README / workflow de GitHub Actions).
 */

const admin = require('firebase-admin');

const WIKI_SOURCES = {
  genshin: { host: 'genshin-impact.fandom.com', page: 'Wish/Character_Event_Wish', color: '#f2c14e' },
  hsr:     { host: 'honkai-star-rail.fandom.com', page: 'Warp/Character_Event_Warp', color: '#b98cea' },
  zzz:     { host: 'zenless-zone-zero.fandom.com', page: 'Signal_Search/Exclusive_Channel', color: '#6fa9e6' },
  wuwa:    { host: 'wutheringwaves.fandom.com', page: 'Convene/Featured_Resonator_Convene', color: '#f28fc0' }
};

const DRY_RUN = process.argv.includes('--dry-run');

function normalizeDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function fetchWikiHtml(host, page) {
  const url = `https://${host}/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al consultar ${host}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.info || data.error.code);
  return data.parse && data.parse.text && data.parse.text['*'];
}

// Parseo best-effort: busca filas de tabla que contengan al menos 2 fechas
// reconocibles (inicio y fin) más un nombre y, si existe, una imagen.
function parseBannersFromHtml(html) {
  const dateRe = /\b\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/gi;
  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  const imgSrcRe = /<img[^>]+(?:data-src|src)="([^"]+)"/i;
  const nameRe = /<(?:a[^>]*title="([^"]+)"|b)[^>]*>([^<]+)<\/(?:a|b)>/i;

  const rows = html.match(rowRe) || [];
  const results = [];
  for (const row of rows) {
    const plainText = row.replace(/<[^>]+>/g, ' ');
    const dates = plainText.match(dateRe) || [];
    if (dates.length < 2) continue;
    const imgMatch = row.match(imgSrcRe);
    const nameMatch = row.match(nameRe);
    const name = (nameMatch && (nameMatch[1] || nameMatch[2])) || plainText.trim().slice(0, 40);
    const start = normalizeDate(dates[0]);
    const end = normalizeDate(dates[1]);
    if (name && start && end) {
      results.push({
        name: name.trim(),
        start,
        end,
        image: imgMatch ? imgMatch[1] : ''
      });
    }
  }
  // de-duplicar
  const seen = new Set();
  return results.filter((r) => {
    const key = r.name + r.start + r.end;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchBannersForGame(gameKey) {
  const source = WIKI_SOURCES[gameKey];
  const html = await fetchWikiHtml(source.host, source.page);
  return parseBannersFromHtml(html).map((b) => ({ ...b, game: gameKey, color: source.color }));
}

function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT con las credenciales del service account.');
  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin.firestore();
}

async function main() {
  const allResults = [];
  for (const gameKey of Object.keys(WIKI_SOURCES)) {
    try {
      const banners = await fetchBannersForGame(gameKey);
      console.log(`[${gameKey}] se encontraron ${banners.length} banner(s).`);
      allResults.push(...banners);
    } catch (err) {
      console.error(`[${gameKey}] error al consultar la fuente: ${err.message}`);
    }
  }

  if (DRY_RUN) {
    console.log(JSON.stringify(allResults, null, 2));
    console.log(`Dry run: ${allResults.length} banner(s) encontrados en total. No se escribió nada en Firestore.`);
    return;
  }

  const db = initFirebase();
  const existingSnap = await db.collection('banners').get();
  const existingKeys = new Set(
    existingSnap.docs.map((d) => {
      const b = d.data();
      return `${b.game}|${b.name}|${b.start}`;
    })
  );

  let written = 0;
  for (const banner of allResults) {
    const startTs = new Date(banner.start + 'T00:00:00').getTime();
    const endTs = new Date(banner.end + 'T23:59:59').getTime();
    const key = `${banner.game}|${banner.name}|${startTs}`;
    if (existingKeys.has(key)) continue; // ya existe, no duplicar
    await db.collection('banners').add({
      game: banner.game,
      color: banner.color,
      name: banner.name,
      images: banner.image ? [banner.image] : [],
      image: banner.image || '',
      interval: 10,
      start: startTs,
      end: endTs,
      notes: 'Importado automáticamente'
    });
    written++;
  }
  console.log(`Listo: se escribieron ${written} banner(s) nuevo(s) en Firestore.`);
}

main().catch((err) => {
  console.error('Error fatal en sync-banners.js:', err);
  process.exit(1);
});
