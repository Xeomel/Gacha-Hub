import admin from 'firebase-admin';

// Inicializar Firebase Admin SDK
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Categorías oficiales en Fandom de cada juego
const WIKI_CATEGORIES = [
  { game: 'genshin', host: 'genshin-impact.fandom.com', category: 'Category:Playable_characters' },
  { game: 'hsr', host: 'honkai-star-rail.fandom.com', category: 'Category:Playable_characters' },
  { game: 'zzz', host: 'zenless-zone-zero.fandom.com', category: 'Category:Playable_characters' }
];

async function getCategoryMembers(host, category) {
  const members = [];
  let cmcontinue = '';

  try {
    do {
      const url = `https://${host}/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(category)}&cmlimit=500&format=json${cmcontinue ? `&cmcontinue=${cmcontinue}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) break;

      const data = await res.json();
      const items = data.query?.categorymembers || [];

      for (const item of items) {
        // Filtrar subcategorías u otras páginas del sistema
        if (item.ns === 0 && !item.title.includes('/')) {
          members.push(item.title);
        }
      }

      cmcontinue = data['continue']?.cmcontinue || '';
    } while (cmcontinue);
  } catch (err) {
    console.error(`Error obteniendo categoría ${category} de ${host}:`, err.message);
  }

  return members;
}

async function fetchAllCharacters() {
  const allList = [];

  for (const source of WIKI_CATEGORIES) {
    console.log(`🌐 Obteniendo lista completa de personajes para ${source.game}...`);
    const names = await getCategoryMembers(source.host, source.category);
    console.log(`  └ Encontrados ${names.length} personajes en ${source.game}.`);

    for (const name of names) {
      allList.push({
        name,
        game: source.game,
        targetStats: `Stats objetivo recomendados según la wiki de ${source.game.toUpperCase()}.`
      });
    }
  }

  return allList;
}

async function syncBuilds() {
  console.log("🔄 Iniciando sincronización masiva de todos los personajes...");

  try {
    const fetchedBuilds = await fetchAllCharacters();
    console.log(`📊 Total acumulado de personajes extraídos: ${fetchedBuilds.length}`);

    if (fetchedBuilds.length === 0) {
      console.log("⚠️ No se obtuvieron personajes. Revisa la conexión con las wikis.");
      return;
    }

    // Obtener las builds que ya existen en tu Firestore para evitar duplicados
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
        // SI YA EXISTE: Preserva tus fotos y notas guardadas, solo actualiza timestamp
        const existing = existingBuildsMap.get(key);
        await db.collection('builds').doc(existing.id).update({
          updatedAt: Date.now()
        });
        updatedCount++;
      } else {
        // SI ES NUEVO: Crea la plantilla base
        await db.collection('builds').add({
          name: item.name,
          game: item.game,
          color: item.game === 'hsr' ? '#b98cea' : item.game === 'zzz' ? '#6fa9e6' : '#f2c14e',
          portrait: '',
          targetStats: item.targetStats,
          generalStats: '',
          notes: 'Personaje importado automáticamente desde la wiki.',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        createdCount++;
      }
    }

    console.log(`🎉 Sincronización completada: ${createdCount} creados, ${updatedCount} existentes verificados.`);
  } catch (error) {
    console.error("❌ Error durante la sincronización masiva:", error);
    process.exit(1);
  }
}

syncBuilds();
