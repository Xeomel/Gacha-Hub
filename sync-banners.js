#!/usr/bin/env node

/**
 * Gacha Hub — Sincronizador Autónomo de Banners
 * Consulta las wikis de Fandom de Genshin Impact, Honkai: Star Rail
 * y Zenless Zone Zero para obtener banners activos y próximos,
 * y los sincroniza automáticamente en Google Cloud Firestore.
 *
 * Uso:
 *   node scripts/sync-banners.js            (Sincronización completa con Firestore)
 *   node scripts/sync-banners.js --dry-run  (Modo simulación, solo imprime en consola)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDryRun = process.argv.includes('--dry-run');

const GAME_META = {
  genshin: { label: 'Genshin Impact', color: '#f2c14e' },
  hsr: { label: 'Honkai: Star Rail', color: '#b98cea' },
  zzz: { label: 'Zenless Zone Zero', color: '#6fa9e6' }
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
  raw = cleanText(raw);
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
  const rawHtml = json.parse?.text?.['*'] || '';
  const html = rawHtml.replace(/&#44;/g, ',').replace(/&#8212;/g, '-').replace(/&amp;/g, '&');
  const banners = [];
  const rows = html.split(/<tr[^>]*>/i);

  let currentStart = null;
  let currentEnd = null;
  const dateRangeRegex = /([A-Za-z]+ \d{1,2}, \d{4})\s*-\s*([A-Za-z]+ \d{1,2}, \d{4})/i;

  for (const row of rows) {
    const dateMatch = row.match(dateRangeRegex);
    if (dateMatch) {
      currentStart = parseDateStr(dateMatch[1]);
      currentEnd = parseDateStr(dateMatch[2]);
    }

    if (/Character\s*(?:<[^>]+>\s*)*Event/i.test(row) && currentStart && currentEnd) {
      const bannerBlocks = row.match(/<div>\s*<span typeof="mw:File">[\s\S]*?<\/div>/gi) || [row];
      for (const bBlock of bannerBlocks) {
        const linkMatch = bBlock.match(/<a[^>]+title="([^"/]+)(?:\/\d{4}-\d{2}-\d{2})?"[^>]*>([^<]+)<\/a>/i);
        const name = linkMatch ? linkMatch[2].trim() : '';

        const dataSrcMatch = bBlock.match(/data-src="([^"]+)"/i);
        const srcMatch = bBlock.match(/src="([^"]+)"/i);
        let img = dataSrcMatch ? dataSrcMatch[1] : (srcMatch ? srcMatch[1] : '');
        if (img.startsWith('//')) img = 'https:' + img;
        if (img.includes('data:image') || img.includes('placeholder')) img = '';
        if (img) img = img.replace(/\/scale-to-width-down\/\d+/, '/scale-to-width-down/600');

        if (name && name !== 'Character Event Wish') {
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
  }
  return banners;
}

async function fetchHSRBanners() {
  console.log('🔍 Obteniendo banners de Honkai: Star Rail...');
  const res = await fetch('https://honkai-star-rail.fandom.com/api.php?action=parse&page=Warp/List&prop=text&format=json');
  const json = await res.json();
  const rawHtml = json.parse?.text?.['*'] || '';
  const html = rawHtml.replace(/&#44;/g, ',').replace(/&#8212;/g, '-').replace(/&amp;/g, '&');
  const banners = [];
  const rows = html.split(/<tr[^>]*>/i);

  let currentStart = null;
  let currentEnd = null;
  const dateRangeRegex = /([A-Za-z]+ \d{1,2}, \d{4})\s*-\s*([A-Za-z]+ \d{1,2}, \d{4})/i;

  for (const row of rows) {
    const dateMatch = row.match(dateRangeRegex);
    if (dateMatch) {
      currentStart = parseDateStr(dateMatch[1]);
      currentEnd = parseDateStr(dateMatch[2]);
    }

    if (/Character\s*(?:<[^>]+>\s*)*Event/i.test(row) && currentStart && currentEnd) {
      const bannerBlocks = row.match(/<div>\s*<span typeof="mw:File">[\s\S]*?<\/div>/gi) || [row];
      for (const bBlock of bannerBlocks) {
        const linkMatch = bBlock.match(/<a[^>]+title="([^"/]+)(?:\/\d{4}-\d{2}-\d{2})?"[^>]*>([^<]+)<\/a>/i);
        const name = linkMatch ? linkMatch[2].trim() : '';

        const dataSrcMatch = bBlock.match(/data-src="([^"]+)"/i);
        const srcMatch = bBlock.match(/src="([^"]+)"/i);
        let img = dataSrcMatch ? dataSrcMatch[1] : (srcMatch ? srcMatch[1] : '');
        if (img.startsWith('//')) img = 'https:' + img;
        if (img.includes('data:image') || img.includes('placeholder')) img = '';
        if (img) img = img.replace(/\/scale-to-width-down\/\d+/, '/scale-to-width-down/600');

        if (name && name !== 'Character Event Warp') {
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
  }
  return banners;
}

async function fetchZZZBanners() {
  console.log('🔍 Obteniendo banners de Zenless Zone Zero...');
  const res = await fetch('https://zenless-zone-zero.fandom.com/api.php?action=parse&page=Exclusive_Channel/History&prop=text&format=json');
  const json = await res.json();
  const rawHtml = json.parse?.text?.['*'] || '';
  const html = rawHtml.replace(/&#44;/g, ',').replace(/&#8212;/g, '-').replace(/&amp;/g, '&');
  const banners = [];
  const rows = html.split(/<tr[^>]*>/i);
  const dateRegex = /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+202\d/gi;

  for (const row of rows) {
    const linkMatch = row.match(/<a[^>]+title="([^"/]+)(?:\/\d{4}-\d{2}-\d{2})?"[^>]*>([^<]+)<\/a>/i);
    const name = linkMatch ? linkMatch[2].trim() : '';

    const dates = row.match(dateRegex);
    if (name && dates && dates.length >= 2) {
      const start = parseDateStr(dates[0]);
      const end = parseDateStr(dates[1]);

      const charMatches = [...row.matchAll(/<a[^>]+title="([^"]+)"[^>]*>([^<]+)<\/a><\/div>/gi)];
      const featured = charMatches.map(m => m[2].trim()).filter(Boolean).join(', ');

      const dataSrcMatch = row.match(/data-src="([^"]+)"/i);
      const srcMatch = row.match(/src="([^"]+)"/i);
      let img = dataSrcMatch ? dataSrcMatch[1] : (srcMatch ? srcMatch[1] : '');
      if (img.startsWith('//')) img = 'https:' + img;
      if (img.includes('data:image') || img.includes('placeholder')) img = '';

      if (start && end) {
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

// ====== INICIALIZACIÓN DE FIREBASE ADMIN ======

function getFirestoreDb() {
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
      fetchZZZBanners()
    ]);

    results.forEach((r, idx) => {
      const gameKey = ['genshin', 'hsr', 'zzz'][idx];
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

    if (!existing) {
      // Banner NUEVO: solo usamos la imagen si no es un icono miniatura de baja resolución
      const isLowRes = !banner.image ||
        banner.image.includes('Icon') ||
        banner.image.includes('scale-to-width-down/50') ||
        banner.image.includes('data:image');

      const initialImage = isLowRes ? '' : banner.image;

      await db.collection('banners').add({
        game: banner.game,
        color: GAME_META[banner.game]?.color || '#f2c14e',
        name: banner.name,
        images: initialImage ? [initialImage] : [],
        image: initialImage,
        interval: 10,
        start: banner.start,
        end: banner.end,
        notes: banner.notes || '',
        autoSynced: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      insertedCount++;
      console.log(`   ✨ Nuevo banner creado: [${banner.game}] ${banner.name} ${initialImage ? '(con arte oficial)' : '(sin imagen, para que agregues tu URL favorita)'}`);
    } else {
      // Banner EXISTENTE: NUNCA tocamos ni sobreescribimos las imágenes que el usuario configuró.
      // Solo actualizamos las fechas de inicio/fin si cambiaron en la fuente oficial.
      const dateChanged =
        Math.abs((existing.start || 0) - banner.start) > 3600000 ||
        Math.abs((existing.end || 0) - banner.end) > 3600000;

      if (dateChanged) {
        await db.collection('banners').doc(existing.id).update({
          start: banner.start,
          end: banner.end,
          updatedAt: Date.now()
        });
        updatedCount++;
        console.log(`   🔄 Fechas actualizadas: [${banner.game}] ${banner.name} (tus imágenes fueron preservadas intactas)`);
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
