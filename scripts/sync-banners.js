#!/usr/bin/env node

/**
 * Gacha Hub — Sincronizador Autónomo de Banners
 * Consulta las wikis de Fandom de Genshin Impact, Honkai: Star Rail,
 * Zenless Zone Zero y Umamusume para obtener banners activos y próximos,
 * y los sincroniza automáticamente en Google Cloud Firestore.
 *
 * Uso:
 *   node scripts/sync-banners.js            (Sincronización completa con Firestore)
 *   node scripts/sync-banners.js --dry-run  (Modo simulación, solo imprime en consola)
 */

const fs = require('fs');
const path = require('path');

const isDryRun = process.argv.includes('--dry-run');

const GAME_META = {
  genshin: { label: 'Genshin Impact', color: '#f2c14e' },
  hsr: { label: 'Honkai: Star Rail', color: '#b98cea' },
  zzz: { label: 'Zenless Zone Zero', color: '#6fa9e6' },
  uma: { label: 'Umamusume', color: '#f28fc0' }
};

function cleanText(str) {
  return (str || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/&#8212;/g, '-')
    .replace(/&#44;/g, ',')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDateStr(raw) {
  if (!raw) return null;
  raw = raw
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/&#8212;/g, '-')
    .replace(/&#44;/g, ',')
    .trim();
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.getTime();
}

function toYMD(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ====== EXTRACTORES POR JUEGO ======

async function fetchGenshinBanners() {
  console.log('🔍 Obteniendo banners de Genshin Impact...');
  const res = await fetch('https://genshin-impact.fandom.com/api.php?action=parse&page=Wish/List&prop=text&format=json');
  const json = await res.json();
  const html = json.parse?.text?.['*'] || '';
  const banners = [];
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  let currentStart = null;
  let currentEnd = null;
  const dateRangeRegex = /([A-Za-z]+ \d{1,2}, \d{4})\s*-\s*([A-Za-z]+ \d{1,2}, \d{4})/i;

  for (const row of rows) {
    const text = cleanText(row);
    const dateMatch = text.match(dateRangeRegex);
    if (dateMatch) {
      currentStart = parseDateStr(dateMatch[1]);
      currentEnd = parseDateStr(dateMatch[2]);
    }

    if (row.includes('Character Event') && currentStart && currentEnd) {
      const linkMatch = row.match(/<a[^>]+title="([^"]+)"[^>]*>([^<]+)<\/a>/i);
      const imgMatch = row.match(/data-src="([^"]+)"/i) || row.match(/src="([^"]+)"/i);
      let img = imgMatch ? imgMatch[1] : '';
      if (img.startsWith('//')) img = 'https:' + img;
      if (img.includes('data:image') || img.includes('placeholder')) img = '';

      let name = linkMatch ? linkMatch[2].trim() : '';
      if (!name) {
        const parts = text.replace(/Character Event/i, '').trim().split(' ');
        name = parts.slice(0, 4).join(' ');
      }

      if (name) {
        banners.push({
          game: 'genshin',
          name,
          start: currentStart,
          end: currentEnd + (23 * 3600 + 59 * 60) * 1000,
          image: img,
          notes: 'Character Event Wish (Genshin Impact)'
        });
      }
    }
  }
  return banners;
}

async function fetchHSRBanners() {
  console.log('🔍 Obteniendo banners de Honkai: Star Rail...');
  const res = await fetch('https://honkai-star-rail.fandom.com/api.php?action=parse&page=Warp/List&prop=text&format=json');
  const json = await res.json();
  const html = json.parse?.text?.['*'] || '';
  const banners = [];
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  let currentStart = null;
  let currentEnd = null;
  const dateRangeRegex = /([A-Za-z]+ \d{1,2}, \d{4})\s*-\s*([A-Za-z]+ \d{1,2}, \d{4})/i;

  for (const row of rows) {
    const text = cleanText(row);
    const dateMatch = text.match(dateRangeRegex);
    if (dateMatch) {
      currentStart = parseDateStr(dateMatch[1]);
      currentEnd = parseDateStr(dateMatch[2]);
    }

    if (row.includes('Character Event') && currentStart && currentEnd) {
      const linkMatch = row.match(/<a[^>]+title="([^"]+)"[^>]*>([^<]+)<\/a>/i);
      const imgMatch = row.match(/data-src="([^"]+)"/i) || row.match(/src="([^"]+)"/i);
      let img = imgMatch ? imgMatch[1] : '';
      if (img.startsWith('//')) img = 'https:' + img;
      if (img.includes('data:image') || img.includes('placeholder')) img = '';

      let name = linkMatch ? linkMatch[2].trim() : '';
      if (!name) {
        const parts = text.replace(/Character Event/i, '').trim().split(' ');
        name = parts.slice(0, 4).join(' ');
      }

      if (name) {
        banners.push({
          game: 'hsr',
          name,
          start: currentStart,
          end: currentEnd + (23 * 3600 + 59 * 60) * 1000,
          image: img,
          notes: 'Character Event Warp (Honkai: Star Rail)'
        });
      }
    }
  }
  return banners;
}

async function fetchZZZBanners() {
  console.log('🔍 Obteniendo banners de Zenless Zone Zero...');
  const res = await fetch('https://zenless-zone-zero.fandom.com/api.php?action=parse&page=Exclusive_Channel/History&prop=text&format=json');
  const json = await res.json();
  const html = json.parse?.text?.['*'] || '';
  const banners = [];
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  for (const row of rows) {
    const tds = (row.match(/<td[\s\S]*?<\/td>/gi) || []).map(cleanText);
    if (tds.length >= 4) {
      const name = tds[0].split(/\s+[A-Z][a-z]{2}\s+\d/)[0].trim();
      const featured = tds[1];
      const start = parseDateStr(tds[2]);
      const end = parseDateStr(tds[3]);

      const imgMatch = row.match(/data-src="([^"]+)"/i) || row.match(/src="([^"]+)"/i);
      let img = imgMatch ? imgMatch[1] : '';
      if (img.startsWith('//')) img = 'https:' + img;
      if (img.includes('data:image') || img.includes('placeholder')) img = '';

      if (name && start && end) {
        banners.push({
          game: 'zzz',
          name,
          start,
          end: end + (23 * 3600 + 59 * 60) * 1000,
          image: img,
          notes: featured ? `Personajes: ${featured}` : 'Exclusive Channel (Zenless Zone Zero)'
        });
      }
    }
  }
  return banners;
}

async function fetchUMABanners() {
  console.log('🔍 Obteniendo banners de Umamusume...');
  const res = await fetch('https://umamusume.fandom.com/api.php?action=parse&page=Global_Banners&prop=text&format=json');
  const json = await res.json();
  const html = json.parse?.text?.['*'] || '';
  const banners = [];
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  for (const row of rows) {
    const tds = (row.match(/<td[\s\S]*?<\/td>/gi) || []).map(cleanText);
    if (tds.length >= 3) {
      const start = parseDateStr(tds[0]);
      const end = parseDateStr(tds[1]);
      const name = tds[2];
      const type = tds[3] || 'Trainee';

      const imgMatch = row.match(/data-src="([^"]+)"/i) || row.match(/src="([^"]+)"/i);
      let img = imgMatch ? imgMatch[1] : '';
      if (img.startsWith('//')) img = 'https:' + img;
      if (img.includes('data:image') || img.includes('placeholder')) img = '';

      if (name && start && end) {
        banners.push({
          game: 'uma',
          name,
          start,
          end: end + (23 * 3600 + 59 * 60) * 1000,
          image: img,
          notes: `Tipo: ${type} (Umamusume Pretty Derby)`
        });
      }
    }
  }
  return banners;
}

// ====== INICIALIZACIÓN DE FIREBASE ADMIN ======

function getFirestoreDb() {
  const admin = require('firebase-admin');
  if (admin.apps.length > 0) {
    return admin.firestore();
  }

  let serviceAccount = null;

  // 1. Variable de entorno (GitHub Actions)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      serviceAccount = raw.startsWith('{')
        ? JSON.parse(raw)
        : JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      console.log('🔑 Credenciales de Firebase cargadas desde FIREBASE_SERVICE_ACCOUNT.');
    } catch (e) {
      console.error('❌ Error al parsear FIREBASE_SERVICE_ACCOUNT:', e.message);
    }
  }

  // 2. Archivo local serviceAccountKey.json
  if (!serviceAccount) {
    const localKeyPath = path.resolve(__dirname, '../serviceAccountKey.json');
    if (fs.existsSync(localKeyPath)) {
      try {
        serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, 'utf8'));
        console.log('🔑 Credenciales de Firebase cargadas desde serviceAccountKey.json.');
      } catch (e) {
        console.error('❌ Error al leer serviceAccountKey.json:', e.message);
      }
    }
  }

  if (!serviceAccount) {
    return null;
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  return admin.firestore();
}

// ====== PROCESO PRINCIPAL ======

async function main() {
  console.log('=====================================================');
  console.log('🚀 Gacha Hub — Sincronizador Automático de Banners');
  console.log(`🕒 Fecha actual: ${new Date().toISOString()}`);
  console.log(`⚙️ Modo: ${isDryRun ? 'DRY-RUN (Simulación sin escribir)' : 'PRODUCCIÓN'}`);
  console.log('=====================================================\n');

  const now = Date.now();
  // Consideramos activos y próximos, además de los que finalizaron hace menos de 7 días
  const thresholdTime = now - (7 * 24 * 3600 * 1000);

  let allBanners = [];
  try {
    const results = await Promise.allSettled([
      fetchGenshinBanners(),
      fetchHSRBanners(),
      fetchZZZBanners(),
      fetchUMABanners()
    ]);

    results.forEach((r, idx) => {
      const gameKey = ['genshin', 'hsr', 'zzz', 'uma'][idx];
      if (r.status === 'fulfilled') {
        console.log(`✅ ${GAME_META[gameKey].label}: ${r.value.length} banners encontrados en total.`);
        allBanners.push(...r.value);
      } else {
        console.warn(`⚠️ Error al obtener ${GAME_META[gameKey].label}: ${r.reason?.message}`);
      }
    });
  } catch (err) {
    console.error('Error fatal al obtener fuentes:', err);
  }

  // Deduplicación por nombre + juego
  const uniqueMap = new Map();
  for (const b of allBanners) {
    const key = `${b.game}_${b.name.toLowerCase()}_${toYMD(b.start)}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, b);
    }
  }
  const deduplicated = Array.from(uniqueMap.values());

  // Filtrar banners relevantes: activos o próximos
  const relevantBanners = deduplicated.filter(b => b.end >= thresholdTime);

  console.log(`\n📊 Banners relevantes filtrados (activos o futuros): ${relevantBanners.length}`);
  relevantBanners.forEach(b => {
    const status = (b.start <= now && b.end >= now) ? '🟢 ACTIVO' : (b.start > now ? '⏳ PRÓXIMO' : '⚪ FINALIZADO');
    console.log(`   [${b.game.toUpperCase()}] ${status} | ${b.name.padEnd(32)} | ${toYMD(b.start)} al ${toYMD(b.end)}`);
  });

  if (isDryRun) {
    console.log('\n💡 Modo --dry-run finalizado con éxito. No se realizaron cambios en Firestore.');
    return;
  }

  // Conectar con Firestore
  const db = getFirestoreDb();
  if (!db) {
    console.warn('\n⚠️ No se encontraron credenciales de administrador de Firebase.');
    console.warn('   Para sincronizar con la base de datos real:');
    console.warn('   1. Configura la variable de entorno FIREBASE_SERVICE_ACCOUNT en GitHub Actions.');
    console.warn('   2. O coloca el archivo serviceAccountKey.json en la raíz del proyecto.');
    console.warn('   Ejecución finalizada en modo demostración.');
    return;
  }

  console.log('\n📥 Conectando con Firestore y sincronizando banners...');
  const snapshot = await db.collection('banners').get();
  const existingDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const banner of relevantBanners) {
    const existing = existingDocs.find(e =>
      e.game === banner.game &&
      (e.name.toLowerCase() === banner.name.toLowerCase() ||
       Math.abs((e.start || 0) - banner.start) < (24 * 3600 * 1000))
    );

    const payload = {
      game: banner.game,
      color: GAME_META[banner.game]?.color || '#f2c14e',
      name: banner.name,
      images: banner.image ? [banner.image] : [],
      image: banner.image || '',
      interval: 10,
      start: banner.start,
      end: banner.end,
      notes: banner.notes || '',
      autoSynced: true,
      updatedAt: Date.now()
    };

    if (!existing) {
      await db.collection('banners').add({
        ...payload,
        createdAt: Date.now()
      });
      insertedCount++;
      console.log(`   ✨ Nuevo banner guardado: [${banner.game}] ${banner.name}`);
    } else {
      // Actualizar si cambiaron fechas o imagen
      const shouldUpdate =
        Math.abs(existing.start - banner.start) > 3600000 ||
        Math.abs(existing.end - banner.end) > 3600000 ||
        (!existing.image && banner.image);

      if (shouldUpdate) {
        await db.collection('banners').doc(existing.id).update(payload);
        updatedCount++;
        console.log(`   🔄 Banner actualizado: [${banner.game}] ${banner.name}`);
      } else {
        skippedCount++;
      }
    }
  }

  console.log('\n=====================================================');
  console.log('🎉 Sincronización completada exitosamente:');
  console.log(`   - Nuevos agregados: ${insertedCount}`);
  console.log(`   - Actualizados:     ${updatedCount}`);
  console.log(`   - Sin cambios:      ${skippedCount}`);
  console.log('=====================================================');
}

main().catch(err => {
  console.error('❌ Error no controlado en el proceso:', err);
  process.exit(1);
});
