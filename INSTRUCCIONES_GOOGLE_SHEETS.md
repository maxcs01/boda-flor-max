# INSTRUCCIONES DE ACTUALIZACIÓN EN GOOGLE SHEETS
## Boda Flor & Max (Versión 4.1)

Planilla: 👉 [https://docs.google.com/spreadsheets/d/15U2O1gAzXvVkAWobayX6wO_MYeyNyJu3WC-Elx4Xn4U/edit?gid=0#gid=0](https://docs.google.com/spreadsheets/d/15U2O1gAzXvVkAWobayX6wO_MYeyNyJu3WC-Elx4Xn4U/edit?gid=0#gid=0)

### 📌 Cambios en esta versión:
1. **Aviso de duplicado discreto y limpio**: Si el invitado ya figura en la planilla, el mensaje dice simplemente:  
   *«⚠️ [Nombre y Apellido] ya figura confirmado previamente. Su lugar ya está reservado y su tarjeta no debe volver a abonarse.»* (sin mencionar quién lo registró).
2. **Eliminado acceso directo de Mercado Pago**: Se mantiene exclusivamente el Alias `bodaflor.max` con su botón de copia rápida.
3. **Validación rigurosa por Nombre Y Apellido completos** (mínimo 2 palabras) sin falsos positivos.

---

### 🔄 Cómo actualizar en Google Sheets:
1. Abrí tu planilla de Google Sheets y andá a **Extensiones** > **Apps Script**.
2. Seleccioná todo el código anterior, borralo y pegá el contenido de [`google-apps-script.js`](file:///C:/Users/Windows/.gemini/antigravity/scratch/boda-flor-y-max/google-apps-script.js).
3. Hacé clic en el ícono del **Disquete (Guardar)** 💾.
4. En la esquina superior derecha, hacé clic en el botón azul **"Implementar"** > **"Administrar implementaciones"**.
5. Hacé clic en el ícono del **Lápiz (Editar)** ✏️.
6. En **Versión**, seleccioná **"Nueva versión"** (New version).
7. Hacé clic en **"Implementar"** (Deploy).
