# Guía de Automatización y Sincronización de Gacha Hub

Esta guía te muestra cómo dejar configurada la actualización automática de banners para que **Gacha Hub se actualice solo todos los días sin que tengas que tocar nada**.

---

## 🌟 ¿Cómo funciona?

1. **GitHub Actions** ejecuta automáticamente el script `scripts/sync-banners.js` dos veces al día (a las 00:00 y 12:00 UTC) o cuando tú lo desees manualmente.
2. El script consulta las wikis oficiales de:
   - **Genshin Impact** (`genshin-impact.fandom.com`)
   - **Honkai: Star Rail** (`honkai-star-rail.fandom.com`)
   - **Zenless Zone Zero** (`zenless-zone-zero.fandom.com`)
   - **Umamusume** (`umamusume.fandom.com`)
3. Identifica los banners activos y próximos con sus fechas, nombres, artes oficiales y personajes rate-up.
4. Se conecta directamente a tu base de datos de **Firebase Firestore** y:
   - Agrega los banners nuevos que hayan salido.
   - Actualiza fechas o imágenes si hubo cambios.
   - Evita crear duplicados.
5. Todos los usuarios que visiten tu página web ven los banners nuevos y actualizados al instante.

---

## 🚀 Configuración en 3 Pasos

### Paso 1: Descargar la Clave de Administrador de Firebase

1. Abre la [Consola de Firebase](https://console.firebase.google.com/) y entra a tu proyecto **zerogamegacha**.
2. Haz clic en el ícono de engranaje ⚙️ (arriba a la izquierda) > **Configuración del proyecto** (*Project settings*).
3. Ve a la pestaña **Cuentas de servicio** (*Service accounts*).
4. Asegúrate de tener seleccionado **Node.js** y haz clic en el botón **Generar nueva clave privada** (*Generate new private key*).
5. Se descargará un archivo `.json` en tu computadora (contiene la clave privada de acceso para tu base de datos).

---

### Paso 2: Guardar la Clave en GitHub Secrets

1. Ve a tu repositorio en GitHub: `https://github.com/Xeomel/Gacha-Hub`.
2. Haz clic en la pestaña **Settings** (Ajustes del repositorio).
3. En el menú lateral izquierdo, haz clic en **Secrets and variables** > **Actions**.
4. Haz clic en el botón verde **New repository secret**.
5. Completa los campos:
   - **Name**: `FIREBASE_SERVICE_ACCOUNT`
   - **Secret**: Abre el archivo `.json` que descargaste en el Paso 1 con el Bloc de notas, copia **todo su contenido** y pégalo aquí.
6. Haz clic en **Add secret**.

¡Listo! A partir de este momento, GitHub Actions tiene permiso seguro para actualizar Firestore de forma 100% autónoma.

---

### Paso 3: Probar la Sincronización Manualmente en GitHub

Puedes esperar a que se ejecute en su horario programado o probarlo ya mismo:
1. En tu repositorio de GitHub, ve a la pestaña **Actions**.
2. En la lista izquierda, selecciona **Auto Sync Gacha Banners**.
3. Haz clic en el desplegable **Run workflow** > botón verde **Run workflow**.
4. Verás cómo el workflow se inicia, descarga la información y sincroniza tu base de datos en menos de 1 minuto.

---

## 💻 Pruebas Locales en tu PC

Puedes probar el sincronizador en cualquier momento desde tu terminal:

### Modo Simulación (Sin escribir en la base de datos)
```bash
npm run sync:dry-run
```
Verás la lista de banners encontrados para cada juego, su estado (ACTIVO o PRÓXIMO) y sus fechas.

### Modo Producción Local
Si deseas sincronizar desde tu propia computadora:
1. Copia el archivo `.json` que descargaste de Firebase en la carpeta raíz del proyecto y renómbralo como:
   `serviceAccountKey.json`
2. Ejecuta:
   ```bash
   npm run sync
   ```
*(Nota: `serviceAccountKey.json` nunca debe subirse al repositorio público; ya está incluido en `.gitignore`).*

---

## 🖼️ Almacenamiento de Imágenes (Firebase Storage)

En esta actualización se agregó integración automática con **Firebase Storage**:
* Cuando subes imágenes de personajes, armas o fondos desde la web, el sistema intentará subirlas a Firebase Storage para no ocupar espacio en Firestore (evitando el límite de 1MB por documento).
* Si tu Storage aún no tiene reglas públicas activadas, el sistema mantendrá la imagen como Base64 automáticamente sin interrumpir la experiencia.
* Para habilitar Firebase Storage en la consola de Firebase:
  1. Ve a **Build** > **Storage** en Firebase Console.
  2. Haz clic en **Comenzar** (*Get Started*).
  3. En la pestaña **Rules**, puedes permitir subida a usuarios autenticados:
     ```javascript
     rules_version = '2';
     service firebase.storage {
       match /b/{bucket}/o {
         match /{allPaths=**} {
           allow read: if true;
           allow write: if request.auth != null;
         }
       }
     }
     ```
