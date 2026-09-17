import admin from 'firebase-admin';

// Inicializar Firebase Admin SDK desde los secrets de GitHub
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Ejemplo de función que simula o extrae los datos de la wiki / fuente
async function fetchLatestBuildsFromWeb() {
  // AQUÍ VA TU LÓGICA DE SCRAPING / EXTRACCIÓN
  // Este es un ejemplo de la estructura de datos que obtiene:
  return [
    {
      name: "Acheron",
      game: "hsr",
      targetStats: "Pecho: Daño Crítico\nBotas: ATQ %\nEsfera: Bono Daño Rayo\nCuerda: ATQ %"
    },
    {
      name: "Furina",
      game: "genshin",
      targetStats: "Reloj: Vida % / Recarga\nCopa: Vida % / Bono Hydro\nCorona: Prob. Crítica / Daño Crítico"
    }
  ];
}

async function syncBuilds() {
  console.log("🔄 Iniciando sincronización de base de builds...");
  
  try {
    const fetchedBuilds = await fetchLatestBuildsFromWeb();
    
    // Obtener todas las builds existentes en Firestore
    const snapshot = await db.collection('builds').get();
    const existingBuildsMap = new Map();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.name) {
        existingBuildsMap.set(data.name.toLowerCase().trim(), { id: doc.id, ...data });
      }
    });

    for (const item of fetchedBuilds) {
      const key = item.name.toLowerCase().trim();
      
      if (existingBuildsMap.has(key)) {
        // SI YA EXISTE: Actualiza solo los stats objetivo sin tocar fotos ni notas guardadas
        const existing = existingBuildsMap.get(key);
        await db.collection('builds').doc(existing.id).update({
          targetStats: item.targetStats,
          updatedAt: Date.now()
        });
        console.log(`✔ Stats actualizados para: ${item.name}`);
      } else {
        // SI NO EXISTE: Crea la build base automática
        await db.collection('builds').add({
          name: item.name,
          game: item.game || 'genshin',
          color: '#f2c14e',
          portrait: '', // Queda vacío para que tú le agregues la foto en la web
          targetStats: item.targetStats,
          generalStats: '',
          notes: 'Build base creada automáticamente.',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        console.log(`✨ Nueva build base creada para: ${item.name}`);
      }
    }
    
    console.log("🎉 Sincronización finalizada con éxito.");
  } catch (error) {
    console.error("❌ Error durante la sincronización:", error);
    process.exit(1);
  }
}

syncBuilds();
