import admin from 'firebase-admin';
import https from 'https';

// Inicializar Firebase Admin SDK
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Configuración de endpoints usando Cargo Query en las wikis
const WIKI_CARGO_SOURCES = [
  {
    game: 'genshin',
    host: 'genshin-impact.fandom.com',
    url: 'https://genshin-impact.fandom.com/api.php?action=cargoquery&tables=characters&fields=name&where=is_playable%3D1&limit=500&format=json'
  },
  {
    game: 'hsr',
    host: 'honkai-star-rail.fandom.com',
    url: 'https://honkai-star-rail.fandom.com/api.php?action=cargoquery&tables=characters&fields=name&where=is_playable%3D1&limit=500&format=json'
  },
  {
    game: 'zzz',
    host: 'zenless-zone-zero.fandom.com',
    url: 'https://zenless-zone-zero.fandom.com/api.php?action=cargoquery&tables=agents&fields=name&limit=500&format=json'
  }
];

function fetchJson(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      // Manejar redirecciones 301 / 302
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchJson(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function fetchAllCharacters() {
  const allList = [];

  for (const source of WIKI_CARGO_SOURCES) {
    console.log(`🌐 Consultando base de datos Cargo de ${source.game.toUpperCase()}...`);
    const data = await fetchJson(source.url);
    const results = data?.cargoquery || [];
    
    const names = results.map(item => item.title?.name).filter(Boolean);
    console.log(`  └ ${names.length} personajes encontrados.`);

    for (const name of names) {
      allList.push({
        name,
        game: source.game,
        targetStats: `Stats recomendados según la wiki oficial de ${source.game.toUpperCase()}.`
      });
    }
  }

  return allList;
}

async function syncBuilds() {
  console.log("🔄 Iniciando importación masiva en Firestore...");

  try {
    const fetchedBuilds = await fetchAllCharacters();
    console.log(`📊 Total acumulado de personajes a procesar: ${fetchedBuilds.length}`);

    if (fetchedBuilds.length === 0) {
      console.log("⚠️ No se obtuvieron personajes de la wiki.");
      return;
    }

    const snapshot = await db.collection('builds').get();
    const existingBuildsMap = new Map();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.name) {
        existingBuildsMap.set(data.name.toLowerCase().trim(), { id: doc.id, ...data });
      }
    });

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of fetchedBuilds) {
      const key = item.name.toLowerCase().trim();

      if (existingBuildsMap.has(key)) {
        const existing = existingBuildsMap.get(key);
        await db.collection('builds').doc(existing.id).update({
          updatedAt: Date.now()
        });
        updatedCount++;
      } else {
        await db.collection('builds').add({
          name: item.name,
          game: item.game,
          color: item.game === 'hsr' ? '#b98cea' : item.game === 'zzz' ? '#6fa9e6' : '#f2c14e',
          portrait: '',
          targetStats: item.targetStats,
          generalStats: '',
          notes: 'Personaje importado automáticamente.',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        createdCount++;
      }
    }

    console.log(`🎉 Finalizado: ${createdCount} personajes creados | ${updatedCount} existentes verificados.`);
  } catch (error) {
    console.error("❌ Error en la ejecución:", error);
    process.exit(1);
  }
}

syncBuilds();
