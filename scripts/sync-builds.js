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

// Configuración de endpoints usando API MediaWiki estándar
const WIKI_SOURCES = [
  { game: 'genshin', host: 'genshin-impact.fandom.com', category: 'Category:Playable_Characters' },
  { game: 'hsr', host: 'honkai-star-rail.fandom.com', category: 'Category:Playable_Characters' },
  { game: 'zzz', host: 'zenless-zone-zero.fandom.com', category: 'Category:Agents' }
];

const EXCLUDED = ['agent', 'playable characters', 'category:', 'list of', 'traveler', 'main character'];

function fetchJson(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    }, (res) => {
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
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function getCategoryMembers(host, category) {
  const members = [];
  let cmcontinue = '';

  try {
    do {
      const url = `https://${host}/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(category)}&cmlimit=500&format=json${cmcontinue ? `&cmcontinue=${cmcontinue}` : ''}`;
      const data = await fetchJson(url);
      
      const items = data?.query?.categorymembers || [];
      for (const item of items) {
        const title = item.title ? item.title.trim() : '';
        const cleanName = title.toLowerCase();
        const isBad = EXCLUDED.some(x => cleanName.includes(x));

        if (item.ns === 0 && !title.includes('/') && !isBad) {
          members.push(title);
        }
      }

      cmcontinue = data?.['continue']?.cmcontinue || '';
    } while (cmcontinue);
  } catch (err) {
    console.error(`❌ Error en ${host}:`, err.message);
  }

  return members;
}

async function fetchAllCharacters() {
  const allList = [];

  for (const source of WIKI_SOURCES) {
    console.log(`🌐 Consultando Fandom de ${source.game.toUpperCase()}...`);
    const names = await getCategoryMembers(source.host, source.category);
    console.log(`  └ ${names.length} personajes encontrados.`);

    for (const name of names) {
      allList.push({
        name,
        game: source.game,
        targetStats: `Stats recomendados según la wiki de ${source.game.toUpperCase()}.`
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
      console.log("⚠️ No se obtuvieron personajes.");
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

    // Eliminar 'Agent' de Firestore si existía
    if (existingBuildsMap.has('agent')) {
      const agentDoc = existingBuildsMap.get('agent');
      await db.collection('builds').doc(agentDoc.id).delete();
      console.log("🧹 Se eliminó el registro 'Agent'.");
    }

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

    console.log(`🎉 Finalizado: ${createdCount} creados | ${updatedCount} existentes verificados.`);
  } catch (error) {
    console.error("❌ Error en la ejecución:", error);
    process.exit(1);
  }
}

syncBuilds();
