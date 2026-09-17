import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../data');
const TARGET_STATS_FILE = path.join(DATA_DIR, 'character-target-stats.json');
const USER_BUILDS_FILE = path.join(DATA_DIR, 'user-builds.json');
const SUGGESTIONS_FILE = path.join(DATA_DIR, 'build-suggestions.json');

function processBuildSuggestions() {
  console.log("🔍 Analizando sugerencias de meta y verificando modificaciones de Admin...");

  if (!fs.existsSync(TARGET_STATS_FILE)) {
    console.error("❌ No se encontró 'character-target-stats.json'. Ejecuta primero 'npm run sync:library'.");
    process.exit(1);
  }

  const targetStats = JSON.parse(fs.readFileSync(TARGET_STATS_FILE, 'utf-8'));
  
  // Cargar builds existentes del usuario o inicializar vacías
  let userBuilds = {};
  if (fs.existsSync(USER_BUILDS_FILE)) {
    userBuilds = JSON.parse(fs.readFileSync(USER_BUILDS_FILE, 'utf-8'));
  }

  const suggestions = {
    updatedAt: new Date().toISOString(),
    pendingChanges: []
  };

  // Comparar stats meta con la versión activa
  for (const game in targetStats) {
    for (const charId in targetStats[game]) {
      const officialMeta = targetStats[game][charId];
      const activeUserBuild = userBuilds[charId];

      // Si el admin tiene una build guardada y protegida
      if (activeUserBuild && activeUserBuild.isProtectedByAdmin) {
        // Generar sugerencia si hay diferencias sin modificar la build del admin
        const hasDifferences = JSON.stringify(activeUserBuild.targetStats) !== JSON.stringify(officialMeta.slots);
        
        if (hasDifferences) {
          suggestions.pendingChanges.push({
            game,
            characterId: charId,
            characterName: officialMeta.name || charId,
            currentBuild: activeUserBuild.targetStats,
            suggestedBuild: officialMeta.slots,
            reason: "Se detectó una actualización en el meta oficial de artefactos/reliquias."
          });
        }
      } else {
        // Si no está personalizada/protegida, se actualiza automáticamente
        userBuilds[charId] = {
          game,
          characterId: charId,
          isProtectedByAdmin: false,
          targetStats: officialMeta.slots,
          substats: officialMeta.substatPriority || []
        };
      }
    }
  }

  // Guardar sugerencias para el modal comparador del Admin y actualizar builds activas
  fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(suggestions, null, 2));
  fs.writeFileSync(USER_BUILDS_FILE, JSON.stringify(userBuilds, null, 2));

  console.log(`✅ Análisis completado.`);
  console.log(`💡 Sugerencias pendientes de revisión: ${suggestions.pendingChanges.length}`);
  console.log(`📁 Sugerencias guardadas en: ${SUGGESTIONS_FILE}`);
}

processBuildSuggestions();
