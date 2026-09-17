import admin from 'firebase-admin';

// Inicializar Firebase Admin SDK
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Fuentes de wikis para extraer personajes
const WIKI_SOURCES = [
  { game: 'genshin', host: 'genshin-impact.fandom.com', page: 'Characters/List' },
  { game: 'hsr', host: 'honkai-star-rail.fandom.com', page: 'Characters/List' },
  { game: 'zzz', host: 'zenless-zone-zero.fandom.com', page: 'Agents' }
];

async function fetchAllCharactersFromWikis() {
  const allCharacters = [];

  for (const source of WIKI_SOURCES) {
    try {
      console.log(`🌐 Buscando lista completa de personajes para ${source.game}...`);
      const apiUrl = `https://${source.host}/api.php?action=parse&page=${encodeURIComponent(source.page)}&prop=text&format=json`;
      const res = await fetch(apiUrl);
      if (!res.ok) continue;

      const data = await res.json();
      const html = data.parse?.text?.['*'];
      if (!html) continue;

      // Extraer nombres de personajes del HTML de la wiki
      const names = extractNamesFromHtml(html);
      console.log(`  └ Encontrados ${names.length} personajes en ${source.game}.`);

      for (const name of names) {
        allCharacters.push({
          name: name,
          game: source.game,
          targetStats: `Stats objetivo recomendados según la wiki de ${source.game.toUpperCase()}.`
        });
      }
    } catch (err) {
      console.error(`Error procesando ${source.game}:`, err.message);
    }
  }

  return allCharacters;
}

function extractNamesFromHtml(html) {
  // Expresión para buscar enlaces a nombres de personajes en las tablas de la wiki
  const nameRegex = /title="([^"]+)"/g;
  const set = new Set();
  let match;

  while ((match = nameRegex.exec(html)) !== null) {
    const val = match[1].trim();
    // Filtrar páginas de sistema o categorías no relevantes
    if (
      val &&
      !val.includes(':') &&
      !val.includes('List') &&
      !val.includes('Category') &&
      !val.includes('Edit') &&
      val.length < 30
    ) {
      set.add(val);
    }
  }

  return Array.from(set);
}

async function syncBuilds() {
  console.log("🔄 Iniciando sincronización masiva de todos los personajes...");

  try {
    const fetchedBuilds = await fetchAllCharactersFromWikis();
    console.log(`📊 Total de personajes procesados: ${fetchedBuilds.length}`);

    // Obtener las builds que ya existen en tu Firestore para no duplicar ni sobreescribir tus fotos
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
        // SI YA EXISTE: No sobrescribe tu foto ni tus notas personales, solo actualiza la fecha
        const existing = existingBuildsMap.get(key);
        await db.collection('builds').doc(existing.id).update({
          updatedAt: Date.now()
        });
        updatedCount++;
      } else {
        // SI ES UN PERSONAJE NUEVO: Crea la plantilla base lista para que le pongas foto
        await db.collection('builds').add({
          name: item.name,
          game: item.game,
          color: item.game === 'hsr' ? '#b98cea' : item.game === 'zzz' ? '#6fa9e6' : '#f2c14e',
          portrait: '', // Queda libre para tu imagen
          targetStats: item.targetStats,
          generalStats: '',
          notes: 'Personaje detectado e importado automáticamente.',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        createdCount++;
      }
    }

    console.log(`🎉 Sincronización completada: ${createdCount} creados, ${updatedCount} verificados.`);
  } catch (error) {
    console.error("❌ Error durante la sincronización masiva:", error);
    process.exit(1);
  }
}

syncBuilds();
