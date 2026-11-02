# Web Interactiva de Boda - Flor & Max
## Inspirada en Yendo Invitaciones (Rosario, Santa Fe)

Sitio web interactivo y sistema de confirmación de asistencia para la boda de **Flor & Max**.

### 🌟 Características Principales
1. **Diseño Editorial de Lujo**: Optimizado para dispositivos móviles y computadoras, con paleta en tonos oro, salvia/eucalipto y blanco perlado.
2. **Contador Regresivo en Vivo**: Marca los días, horas, minutos y segundos exactos hasta el **21 de Marzo de 2027 a las 15:00 hs puntual**.
3. **Versículo Bíblico Destacado**: Colosenses 3:14 (*«Y sobre todas estas cosas, vestíos de amor, que es el vínculo perfecto.»*).
4. **Dónde y Cuándo**:
   - Lugar: **Club de Campo María Antonia**, Amuchastegui 1388, Rosario, Santa Fe.
   - Enlace directo a Google Maps y mapa interactivo.
   - Botón directo para agendar en Google Calendar.
5. **Dress Code**: Guía visual y recomendaciones de estilo para el código **Elegante Sport**.
6. **Música de Fondo**: Melodía romántica ambiental sintetizada e interactiva con botón de reproducción flotante.
7. **Sistema Interactivo de Registro y Tarjeta**:
   - Cada tarjeta cuesta **$30.000 pesos** por persona.
   - **Opción para Menores de 3 años**: Los menores de 3 años tienen tarjeta **sin cargo ($0)**.
   - **Cálculo en tiempo real**: Al sumar o quitar invitados o marcar menores de 3 años, el monto se multiplica y calcula automáticamente.
   - **Alias Bancario**: `bodaflor.max` con botón de copia rápida de un solo clic.
   - **Acceso Directo**: Botón para abrir la app bancaria / Mercado Pago.
   - **Subida de Comprobante**: Subida de foto/captura con previsualización inmediata.
   - **Contacto de Soporte**: Botón directo para hablar con los novios por WhatsApp ante cualquier dificultad.
8. **Centralización en Google Sheets**:
   - Vinculado a la planilla: `https://docs.google.com/spreadsheets/d/15U2O1gAzXvVkAWobayX6wO_MYeyNyJu3WC-Elx4Xn4U/edit?gid=0#gid=0`
   - Guarda automáticamente cada invitado, montos, restricciones alimentarias y enlace al comprobante en Google Drive.

---

### 📁 Estructura del Proyecto
```
boda-flor-y-max/
├── index.html                     # Portada interactiva de la invitación
├── confirmar.html                 # Página de registro y confirmación de invitados
├── google-apps-script.js          # Código del Web App para Google Sheets
├── INSTRUCCIONES_GOOGLE_SHEETS.md # Guía paso a paso para activar Sheets
├── README.md                      # Documentación del proyecto
└── assets/
    ├── css/
    │   └── styles.css             # Estilos y animaciones
    └── js/
        ├── config.js              # Configuración general del evento
        ├── main.js                # Lógica del contador y portada
        ├── rsvp.js                # Lógica de cálculo y registro de invitados
        └── audio-player.js        # Reproductor de melodía ambiental
```

---

### 🚀 Cómo Probar Localmente
Simplemente podés hacer doble clic sobre `index.html` para abrirlo en cualquier navegador (Google Chrome, Edge, Safari, Firefox).

Para levantarlo como servidor local en PowerShell:
```powershell
# En la carpeta del proyecto:
python -m http.server 8080
# O simplemente abrir el archivo directamente en tu navegador favorito.
```

---

### 🌐 Cómo Publicar Gratis en Internet
Podés alojarlo en segundos en cualquiera de estas opciones gratuitas:
- **Vercel / Netlify**: Arrastrá la carpeta del proyecto a la web de [netlify.com/drop](https://app.netlify.com/drop) y obtené tu enlace en 10 segundos.
- **GitHub Pages**: Subí los archivos a un repositorio de GitHub y activá Pages en Settings.
