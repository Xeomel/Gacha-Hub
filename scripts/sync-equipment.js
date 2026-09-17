import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rutas actualizadas con los nuevos nombres
const OUTPUT_DIR = path.join(__dirname, '../data');
const EQUIPMENT_FILE = path.join(OUTPUT_DIR, 'equipment-database.json');
const TARGET_STATS_FILE = path.join(OUTPUT_DIR, 'character-target-stats.json');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Configuración predeterminada de ranuras y objetivos por juego
const DEFAULT_TARGET_STRUCTURES = {
  genshin: {
    slots: {
      sands: { name: "Reloj / Arenas", validStats: ["ATK%", "Energy Recharge", "Elemental Mastery", "HP%", "DEF%"] },
      goblet: { name: "Cáliz", validStats: ["Elemental DMG%", "Physical DMG%", "ATK%", "HP%", "DEF%"] },
      circlet: { name: "Corona", validStats: ["CRIT Rate", "CRIT DMG", "Healing Bonus", "ATK%", "HP%"] }
    },
    substatPriority: ["CRIT Rate", "CRIT DMG", "ATK%", "Energy Recharge", "Elemental Mastery"]
  },
  hsr: {
    slots: {
      body: { name: "Cuerpo", validStats: ["CRIT Rate", "CRIT DMG", "Effect Hit Rate", "Outgoing Healing", "ATK%"] },
      feet: { name: "Botas", validStats: ["SPD", "ATK%", "HP%", "DEF%"] },
      sphere: { name: "Esfera Planar", validStats: ["Elemental DMG%", "ATK%", "HP%", "DEF%"] },
      rope: { name: "Cuerda de Unión", validStats: ["Energy Regeneration Rate", "Break Effect", "ATK%", "HP%"] }
    },
    substatPriority: ["SPD", "CRIT Rate", "CRIT DMG", "ATK%", "Break Effect"]
  },
  zzz: {
    slots: {
      disc4: { name: "Disco 4", validStats: ["CRIT Rate", "CRIT DMG", "Anomaly Proficiency", "ATK%"] },
      disc5: { name: "Disco 5", validStats: ["Attribute DMG%", "PEN Ratio", "ATK%"] },
      disc6: { name: "Disco 6", validStats: ["Energy Regen", "Anomaly Mastery", "Impact", "ATK%"] }
    },
    substatPriority: ["CRIT Rate", "CRIT DMG", "ATK%", "PEN"]
  }
};

async function fetchEquipmentData() {
  console.log("🔄 Extrayendo datos de equipamiento y estadísticas objetivo...");

  const equipment = {
    genshin: { weapons: [], artifacts: [] },
    hsr: { lightCones: [], relics: [], planarOrnaments: [] },
    zzz: { wEngines: [], driveDiscs: [] }
  };

  const targetStats = {
    genshin: {},
    hsr: {},
    zzz: {}
  };

  try {
    if (fs.existsSync(EQUIPMENT_FILE)) {
      const existing = JSON.parse(fs.readFileSync(EQUIPMENT_FILE, 'utf-8'));
      Object.assign(equipment, existing);
    }

    fs.writeFileSync(EQUIPMENT_FILE, JSON.stringify(equipment, null, 2));
    fs.writeFileSync(TARGET_STATS_FILE, JSON.stringify(targetStats, null, 2));

    console.log("✅ Extracción finalizada con éxito.");
    console.log(`📁 Catálogo de equipamiento guardado en: ${EQUIPMENT_FILE}`);
    console.log(`🎯 Stats objetivo guardadas en: ${TARGET_STATS_FILE}`);

  } catch (error) {
    console.error("❌ Error en la sincronización:", error);
    process.exit(1);
  }
}

fetchEquipmentData();
