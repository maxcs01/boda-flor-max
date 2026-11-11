// ============================================================
// CONFIGURACIÓN DEL EVENTO - BODA FLOR & MAX
// ============================================================

const WEDDING_CONFIG = {
  // Nombres de los novios
  brideName: "Flor",
  groomName: "Max",
  coupleFullName: "Florencia & Maximiliano",
  
  // Fecha y hora del evento
  // 21 de Marzo de 2027 a las 15:00 hs (Puntual)
  eventDateISO: "2027-03-21T15:00:00-03:00",
  eventDateDisplay: "Domingo, 21 de Marzo de 2027",
  eventTimeDisplay: "15:00 hs (Puntual)",
  
  // Ubicación
  venueName: "Club de Campo María Antonia",
  venueAddress: "Amuchastegui 1388, Rosario, Santa Fe",
  googleMapsUrl: "https://maps.app.goo.gl/Q65edVmi1CyBBP6s6",
  googleMapsEmbedUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3348.647334707198!2d-60.716174!3d-32.93393!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x95b653fddd03e5dd%3A0xcab83c957a370333!2sClub%20de%20Campo%20Mar%C3%ADa%20Antonia!5e0!3m2!1ses!2sar!4v1700000000000",
  
  // Dress Code
  dressCodeTitle: "Elegante sport",
  dressCodeDescription: "Les invitamos a elegir un look elegante y sofisticado, ideal para una celebración especial al aire libre. Vestimenta formal, pero sin necesidad de gala.",
  
  // Versículo Bíblico
  bibleVerse: {
    passage: "Colosenses 3:14",
    text: "«Y sobre todas estas cosas, vestíos de amor, que es el vínculo perfecto.»"
  },
  
  // Datos de la Tarjeta y Pago
  ticketPricePerPerson: 30000, // $30.000 pesos por persona mayor de 3 años
  currencySymbol: "$",
  currencyName: "ARS",
  freeAgeThreshold: 3, // Menores de 3 años no pagan
  
  // Datos bancarios
  alias: "bodaflor.max",
  titularCuenta: "Florencia y Maximiliano",
  
  // Contacto de WhatsApp directo con los novios
  contacts: {
    flor: {
      name: "Flor",
      phone: "5493413404899",
      displayPhone: "341 340-4899"
    },
    max: {
      name: "Max",
      phone: "5493415971696",
      displayPhone: "341 597-1696"
    }
  },
  
  // Mensajes clave solicitados
  guestPolicyMessage: "La invitación es válida exclusivamente para las personas cuyos nombres han sido incluidos por los novios en la lista de invitados.\n\nLes pedimos que, por cuestiones de organización y capacidad del lugar, no se agreguen acompañantes ni invitados que no hayan sido previamente confirmados por nosotros.\n\n¡Gracias por comprender y ayudarnos a cuidar cada detalle de este día tan especial! 🤍",
  
  financialAidMessage: "Si tenés alguna dificultad económica o inconveniente para abonar la tarjeta o realizar la transferencia, no dudes en escribirnos por WhatsApp.",
  
  // Google Sheets Integration & Pase Digital
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/15U2O1gAzXvVkAWobayX6wO_MYeyNyJu3WC-Elx4Xn4U/edit?gid=0#gid=0",
  googleAppsScriptUrl: "https://script.google.com/macros/s/AKfycbwRP_zryXmQp94oXQrMG18mhSKceOX8lW_95jZhh9MTSjyXH9v1875t7RGWzvVfmaKc/exec",
  basePassUrl: "https://bodaflor-max.netlify.app/pase.html"
};

// Exportar globalmente
window.WEDDING_CONFIG = WEDDING_CONFIG;
