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
2. Seleccioná todo el código anterior, borralo y pegá el contenido de [`google-apps-script.js`](file:///C:/Users/Windows/.gemini/antigravity/scratch\boda-flor-y-max\google-apps-script.js).
3. Hacé clic en el ícono del **Disquete (Guardar)** 💾.
4. En la esquina superior derecha, hacé clic en el botón azul **"Implementar"** > **"Administrar implementaciones"**.
5. Hacé clic en el ícono del **Lápiz (Editar)** ✏️.
6. En **Versión**, seleccioná **"Nueva versión"** (New version).
7. Hacé clic en **"Implementar"** (Deploy).

---

### 🔤 Cómo mantener los Invitados en Orden Alfabético con sus Acompañantes debajo:

#### Método Recomendado: Pestaña Espejo Inteligente 100% Automática
1. En la parte inferior de tu planilla, hacé clic en el botón **`+` (Añadir hoja)** para crear una nueva pestaña.
2. Cambiale el nombre a **`Lista Alfabética`**.
3. En la celda **`A1`** de esa nueva pestaña, pegá esta fórmula:
   ```excel
   =LET(
     dados; FILTER('Hoja 1'!A2:J; 'Hoja 1'!A2:A<>"");
     nomes; CHOOSECOLS(dados; 1);
     posOriginal; SEQUENCE(ROWS(dados));
     grupoTitular; SCAN(""; nomes; LAMBDA(prev; curr; IF(ISNUMBER(SEARCH("↳"; curr)); prev; curr)));
     tabelaCompleta; HSTACK(grupoTitular; posOriginal; dados);
     tabelaOrdenada; SORT(tabelaCompleta; 1; VERDADERO; 2; VERDADERO);
     resultado; CHOOSECOLS(tabelaOrdenada; SEQUENCE(COLUMNS(dados); 1; 3));
     VSTACK('Hoja 1'!A1:J1; resultado)
   )
   ```
   *(Si tu planilla usa coma en lugar de punto y coma, cambiá los `;` por `,` y `VERDADERO` por `TRUE`).*
   *(Si tu hoja original tiene otro nombre, reemplazá `'Hoja 1'` por el nombre de tu hoja).*

4. **¡Listo!** Los titulares se ordenan de la A a la Z y cada uno conserva a sus acompañantes (`↳`) inmediatamente debajo, en tiempo real y sin alterar el código del sistema.

---

### 🎨 Cómo poner los Invitados Titulares en Negrita y Color `#4a5d4e`:
Como las fórmulas no copian estilos automáticamente, usá el **Formato Condicional** de Google Sheets:
1. En tu pestaña **`Lista Alfabética`**, seleccioná la columna **A** desde la fila 2 (intervalo: `A2:A`).
2. Andá al menú superior: **Formato** > **Formato condicional**.
3. En **Reglas de formato**, seleccioná: **"La fórmula personalizada es"** y pegá:
   ```excel
   =AND(A2<>""; NOT(ISNUMBER(SEARCH("↳"; A2))))
   ```
   *(o con comas si tu planilla usa comas: `=AND(A2<>"", NOT(ISNUMBER(SEARCH("↳", A2))))`)*
4. En **Estilo de formato**:
   - Activá el botón **Negrita (B)**.
   - En **Color de texto** (ícono de la letra **A**), hacé clic en **`+` (Personalizado)** y escribí: **`#4a5d4e`**.
5. Hacé clic en **Listo**. ¡Los titulares quedarán destacados en negrita con el verde oliva `#4a5d4e` y los acompañantes permanecerán en estilo normal!
