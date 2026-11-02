/**
 * GOOGLE APPS SCRIPT - BODA FLOR & MAX (Versión 4.0 con Validación Antiduplicados Rigurosa)
 * =========================================================================
 * Planilla: https://docs.google.com/spreadsheets/d/15U2O1gAzXvVkAWobayX6wO_MYeyNyJu3WC-Elx4Xn4U/edit?gid=0#gid=0
 * 
 * NOVEDADES DE SEGURIDAD Y CONTROL DE DUPLICADOS:
 * 1. Validación estricta por Nombre Y Apellido completo (mínimo 2 palabras).
 *    No bloquea si coincide solo el primer nombre (evita falsos positivos entre dos Juan diferentes).
 * 2. Normalización fonética y de caracteres (ignora tildes, mayúsculas y espacios dobles).
 *    "María González" = "maria gonzalez".
 * 3. Detección en tiempo real vía GET (?action=checkName&name=...) para alertar al invitado
 *    antes de que realice la transferencia o pague de más.
 * 4. Bloqueo estricto en el servidor (POST) para evitar registros dobles de parejas o acompañantes.
 * 5. Envío de email automático con datos clave y formato limpio en la planilla.
 * =========================================================================
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(15000); // Esperar hasta 15 segundos por concurrencia
  
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    ensureHeaders(sheet);
    
    var data = {};
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      data = e.parameter;
    }
    
    var respName = (data.responsibleName || "").trim();
    
    // =========================================================================
    // VALIDACIÓN RIGUROSA ANTIDUPLICADOS: Verificar Titular y Acompañantes
    // =========================================================================
    var titularDup = findDuplicateGuest(sheet, respName);
    if (titularDup.duplicate) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "duplicate",
        duplicateType: "titular",
        message: "El invitado «" + respName + "» ya figura confirmado previamente. Su lugar ya está reservado y su tarjeta no debe volver a abonarse."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Verificar cada acompañante para que no lo agreguen dos veces
    if (Array.isArray(data.guests)) {
      for (var k = 1; k < data.guests.length; k++) {
        var compName = (data.guests[k].name || "").trim();
        var compDup = findDuplicateGuest(sheet, compName);
        if (compDup.duplicate) {
          return ContentService.createTextOutput(JSON.stringify({
            status: "duplicate",
            duplicateType: "companion",
            message: "El acompañante «" + compName + "» ya figura confirmado previamente. Su lugar ya está reservado y su tarjeta no debe volver a abonarse."
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
    
    // Procesar la imagen del comprobante si viene en Base64
    var fileUrl = "No adjuntado";
    if (data.receiptBase64 && data.receiptBase64.indexOf("base64,") !== -1) {
      try {
        fileUrl = saveReceiptToDrive(data.receiptBase64, respName || "Comprobante");
      } catch (err) {
        fileUrl = "Error al guardar imagen: " + err.message;
      }
    }
    
    var safeRespName = sanitizeForSheet(respName);
    var email = sanitizeForSheet((data.email || "").trim());
    var phone = sanitizeForSheet((data.phone || "").trim());
    var notes = sanitizeForSheet((data.notes || "").trim());
    
    // 1. FILA PRINCIPAL: Responsable
    var titularRow = [
      safeRespName,                                                 // A: Invitados
      phone,                                                        // B: Teléfono / WhatsApp
      email,                                                        // C: Email
      data.totalGuestsCount || 1,                                   // D: Total Personas
      data.adultsCount || 1,                                        // E: Mayores de 3 años
      data.childrenCount || 0,                                      // F: Menores de 3 años
      data.totalAmountFormatted || ("$" + (data.totalAmount || 0)), // G: Monto Total ($)
      fileUrl,                                                      // H: Comprobante de Pago
      notes,                                                        // I: Mensaje / Notas
      "Confirmado"                                                  // J: Estado
    ];
    
    sheet.appendRow(titularRow);
    var titularRowIndex = sheet.getLastRow();
    
    // Formato estándar con el nombre y apellido en negrito (bold)
    var titularRange = sheet.getRange(titularRowIndex, 1, 1, titularRow.length);
    titularRange.setFontFamily("Arial");
    titularRange.setFontWeight("normal");
    sheet.getRange(titularRowIndex, 1).setFontWeight("bold");
    
    // 2. FILAS DEBAJO DEL RESPONSABLE: Acompañantes con flecha
    if (Array.isArray(data.guests)) {
      for (var i = 1; i < data.guests.length; i++) {
        var guest = data.guests[i];
        var guestName = sanitizeForSheet((guest.name || "").trim());
        var detalleEdad = guest.isChild ? " (👶 Menor de 3 años)" : "";
        
        var companionRow = [
          "↳ " + guestName + detalleEdad,
          "-",
          "-",
          "-",
          "-",
          "-",
          "-",
          "-",
          "",
          "Acompañante de " + safeRespName
        ];
        
        sheet.appendRow(companionRow);
        var compRowIndex = sheet.getLastRow();
        var compRange = sheet.getRange(compRowIndex, 1, 1, companionRow.length);
        compRange.setFontFamily("Arial");
        compRange.setFontWeight("normal");
        sheet.getRange(compRowIndex, 1).setFontWeight("bold");
      }
    }
    
    // 3. ENVÍO AUTOMÁTICO DE EMAIL DE CONFIRMACIÓN (si dejó correo)
    var emailSent = false;
    if (email && email.indexOf("@") !== -1) {
      try {
        sendConfirmationEmail(email, respName, data);
        emailSent = true;
      } catch (mailErr) {
        Logger.log("Error al enviar email: " + mailErr.toString());
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "¡Invitados registrados con éxito!",
      emailSent: emailSent,
      row: titularRowIndex,
      receiptUrl: fileUrl
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } finally {
    lock.releaseLock();
  }
}

/**
 * Consulta en tiempo real vía GET para verificar si un Nombre y Apellido ya está registrado
 */
function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Endpoint de verificación antiduplicados
  if (e && e.parameter && e.parameter.action === "checkName") {
    var nameToCheck = e.parameter.name || "";
    var checkResult = findDuplicateGuest(sheet, nameToCheck);
    
    return ContentService.createTextOutput(JSON.stringify(checkResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    service: "Boda Flor y Max - Sistema de Confirmación Antiduplicados",
    version: "4.0",
    features: ["strict_duplicate_check", "email_confirmation", "hierarchy_guests"],
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Busca si un Nombre y Apellido completo ya existe en la planilla.
 * Requisitos:
 * - Debe tener al menos Nombre Y Apellido (mínimo 2 palabras).
 * - Ignora mayúsculas, tildes y símbolos.
 * - Compara la combinación completa exacta (no bloquea a dos personas que solo comparten el primer nombre).
 */
function findDuplicateGuest(sheet, fullName) {
  if (!fullName) return { duplicate: false };
  
  var normalizedInput = normalizeName(fullName);
  var words = normalizedInput.split(" ").filter(function(w) { return w.length > 0; });
  
  // Si solo puso una sola palabra (ej: "Juan"), NO bloqueamos para evitar falsos positivos
  if (words.length < 2) {
    return { duplicate: false, reason: "needs_surname" };
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { duplicate: false }; // Solo están los encabezados
  
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var currentResponsible = "";
  
  for (var i = 0; i < values.length; i++) {
    var rawValue = values[i][0];
    if (!rawValue) continue;
    var rawStr = rawValue.toString().trim();
    
    var isCompanion = rawStr.indexOf("↳") !== -1;
    if (!isCompanion) {
      currentResponsible = cleanCleanName(rawStr);
    }
    
    var existingNormalized = normalizeName(rawStr);
    
    // Comparación estricta de Nombre y Apellido completos
    if (existingNormalized === normalizedInput) {
      return {
        duplicate: true,
        matchedName: cleanCleanName(rawStr),
        isCompanion: isCompanion
      };
    }
  }
  
  return { duplicate: false };
}

/**
 * Normaliza nombres para comparación rigurosa: minúsculas, sin tildes, sin flechas ni paréntesis
 */
function normalizeName(str) {
  if (!str) return "";
  return str
    .toString()
    .toLowerCase()
    .replace(/^↳\s*/, "")            // Quitar flecha
    .replace(/\(.*?\)/g, "")          // Quitar textos entre paréntesis como (Menor de 3 años)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar tildes
    .replace(/[^a-z0-9\s]/g, "")      // Quitar caracteres especiales
    .replace(/\s+/g, " ")             // Espacios únicos
    .trim();
}

function cleanCleanName(str) {
  if (!str) return "";
  return str.toString().replace(/^↳\s*/, "").replace(/\(.*?\)/g, "").trim();
}

/**
 * Envia un correo electrónico con diseño elegante de boda al invitado
 */
function sendConfirmationEmail(recipientEmail, guestName, data) {
  var subject = "¡Confirmación de Asistencia! Boda Flor & Max 👰🤵";
  var safeGuestName = escapeHtml(guestName);
  
  var guestListHtml = "";
  if (Array.isArray(data.guests)) {
    guestListHtml = data.guests.map(function(g, idx) {
      var tag = g.isChild ? " <span style='color: #5A7163; font-size: 12px;'>(Menor de 3 años)</span>" : "";
      return "<li style='margin-bottom: 6px; color: #2B2F2C;'><strong>" + (idx + 1) + ". " + escapeHtml(g.name || "") + "</strong>" + tag + "</li>";
    }).join("");
  } else {
    guestListHtml = "<li>" + safeGuestName + "</li>";
  }

  var htmlBody = "" +
  "<div style='background-color: #FAF8F5; padding: 30px 15px; font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; color: #2B2F2C; line-height: 1.6;'>" +
    "<div style='max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 20px; overflow: hidden; border: 1px solid #EAD8B1; box-shadow: 0 10px 30px rgba(0,0,0,0.06);'>" +
      
      "<div style='background: linear-gradient(180deg, #4B5842 0%, #3F5247 100%); padding: 32px 20px; text-align: center; color: #FFFFFF;'>" +
        "<div style='font-size: 13px; letter-spacing: 0.25em; text-transform: uppercase; color: #EAD8B1; margin-bottom: 8px;'>¡Nos Casamos!</div>" +
        "<h1 style='margin: 0; font-size: 32px; font-family: Georgia, serif; font-weight: normal; color: #FFFFFF;'>Flor & Max</h1>" +
        "<div style='display: inline-block; background: rgba(255,255,255,0.15); border: 1px solid rgba(234,216,177,0.5); padding: 6px 16px; border-radius: 50px; font-size: 13px; margin-top: 14px; color: #FFFFFF;'>" +
          "21 de Marzo de 2027 • 15:00 hs (Puntual)" +
        "</div>" +
      "</div>" +

      "<div style='padding: 32px 24px;'>" +
        "<h2 style='color: #4B5842; font-size: 20px; margin-top: 0; font-family: Georgia, serif;'>¡Hola, " + safeGuestName + "! ✨</h2>" +
        "<p style='font-size: 15px; color: #4A4E4B;'>" +
          "¡Qué alegría enorme nos da saber que vas a estar con nosotros! Tu reserva y la de tus acompañantes ya quedaron <strong>confirmadas con éxito</strong>." +
        "</p>" +

        "<div style='background: #FAF7EE; border-left: 4px solid #C5A059; border-radius: 0 10px 10px 0; padding: 14px 18px; margin: 20px 0;'>" +
          "<div style='font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em; color: #9F7932; margin-bottom: 6px;'>Personas Confirmadas (" + (data.totalGuestsCount || 1) + ")</div>" +
          "<ul style='margin: 0; padding-left: 18px; font-size: 14px;'>" +
            guestListHtml +
          "</ul>" +
          "<div style='margin-top: 10px; font-size: 13px; color: #666;'>Total abonado: <strong style='color: #2B2F2C;'>" + (data.totalAmountFormatted || ("$" + (data.totalAmount || 0))) + "</strong></div>" +
        "</div>" +

        "<div style='border: 1px solid #E5DFD5; border-radius: 14px; padding: 20px; margin: 24px 0; background: #FFFFFF;'>" +
          "<h3 style='margin: 0 0 14px 0; font-size: 17px; color: #2B2F2C; text-align: center; font-family: Georgia, serif;'>Datos Importantes de la Boda</h3>" +

          "<div style='margin-bottom: 14px; font-size: 14px;'>" +
            "📅 <strong>Fecha:</strong> Domingo, 21 de Marzo de 2027<br>" +
            "⏰ <strong>Horario:</strong> 15:00 hs puntual (te pedimos puntualidad para iniciar juntos la ceremonia)" +
          "</div>" +

          "<div style='margin-bottom: 14px; font-size: 14px;'>" +
            "📍 <strong>Lugar:</strong> Club de Campo María Antonia<br>" +
            "<span style='color: #666; font-size: 13px;'>Amuchastegui 1388, Rosario, Santa Fe</span><br>" +
            "<a href='https://maps.app.goo.gl/Q65edVmi1CyBBP6s6' target='_blank' style='display: inline-block; margin-top: 6px; color: #4B5842; font-weight: bold; text-decoration: none;'>➔ Abrir en Google Maps</a>" +
          "</div>" +

          "<div style='margin-bottom: 14px; font-size: 14px; background: #FFF8E7; border: 1px solid #ECCB7B; padding: 10px 14px; border-radius: 8px; color: #8C5E14;'>" +
            "⏳ <strong>Fecha límite para el pago de la tarjeta:</strong> 28 de enero" +
          "</div>" +

          "<div style='margin-bottom: 14px; font-size: 14px; background: #F8F9F8; padding: 10px 14px; border-radius: 8px;'>" +
            "👔 <strong>Dress Code: Elegante sport</strong><br>" +
            "<span style='font-style: italic; color: #555; font-size: 13px;'>«Les invitamos a elegir un look elegante y sofisticado, ideal para una celebración especial al aire libre. Vestimenta formal, pero sin necesidad de gala.»</span>" +
          "</div>" +

          "<div style='font-size: 14px; background: #FDFBF5; padding: 10px 14px; border-radius: 8px; border: 1px dashed #EAD8B1;'>" +
            "🧉 <strong>Nuestra Celebración:</strong><br>" +
            "<span style='color: #555; font-size: 13px;'>Tarde campestre con mesa de cosas ricas y bebidas. <strong>¡Si te gusta el mate, traé tu equipo para compartir unos mates juntos!</strong></span>" +
          "</div>" +
        "</div>" +

        "<p style='text-align: center; font-style: italic; font-size: 14px; color: #6B726D; margin: 24px 0 16px 0;'>" +
          "«Y sobre todas estas cosas, vestíos de amor, que es el vínculo perfecto.»<br>" +
          "<span style='font-weight: bold; font-style: normal; font-size: 12px; color: #C5A059; text-transform: uppercase;'>Colosenses 3:14</span>" +
        "</p>" +

        "<div style='text-align: center; margin: 24px 0;'>" +
          "<a href='https://calendar.google.com/calendar/render?action=TEMPLATE&text=Boda+de+Flor+%26+Max&dates=20270321T180000Z/20270322T060000Z&details=Casamiento+Flor+%26+Max+en+Club+de+Campo+Mar%C3%ADa+Antonia&location=Club+de+Campo+Mar%C3%ADa+Antonia%2C+Amuchastegui 1388%2C+Rosario' target='_blank' style='background: #4B5842; color: #FFFFFF; padding: 12px 24px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;'>" +
            "📅 Agendar en mi Calendario" +
          "</a>" +
        "</div>" +

        "<div style='border-top: 1px solid #E5DFD5; padding-top: 18px; margin-top: 24px; text-align: center; font-size: 13px; color: #666;'>" +
          "<p style='margin: 0 0 6px 0;'>¿Alguna duda o consulta? Contactanos por WhatsApp:</p>" +
          "<a href='https://wa.me/5493413404899' style='color: #25D366; font-weight: bold; text-decoration: none; margin-right: 14px;'>WhatsApp Flor (341 340-4899)</a> " +
          "<a href='https://wa.me/5493415971696' style='color: #25D366; font-weight: bold; text-decoration: none;'>WhatsApp Max (341 597-1696)</a>" +
        "</div>" +

      "</div>" +

      "<div style='background: #FAF8F5; border-top: 1px solid #E5DFD5; padding: 18px; text-align: center; font-size: 12px; color: #888;'>" +
        "Con mucho amor, <strong>Flor & Max</strong> • 21 de Marzo de 2027" +
      "</div>" +

    "</div>" +
  "</div>";

  MailApp.sendEmail({
    to: recipientEmail,
    subject: subject,
    htmlBody: htmlBody
  });
}

/**
 * Guarda el archivo del comprobante en Google Drive
 */
function saveReceiptToDrive(base64Data, guestName) {
  var folderName = "Comprobantes Boda Flor y Max";
  var folders = DriveApp.getFoldersByName(folderName);
  var folder;
  
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(folderName);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  
  var parts = base64Data.split(",");
  var contentType = parts[0].split(":")[1].split(";")[0];
  var rawBytes = Utilities.base64Decode(parts[1]);
  
  var cleanName = guestName.replace(/[^a-zA-Z0-9]/g, "_");
  var timestamp = Utilities.formatDate(new Date(), "America/Argentina/Buenos_Aires", "yyyyMMdd_HHmmss");
  var ext = contentType.indexOf("png") !== -1 ? ".png" : (contentType.indexOf("webp") !== -1 ? ".webp" : ".jpg");
  var fileName = "Comprobante_" + cleanName + "_" + timestamp + ext;
  
  var blob = Utilities.newBlob(rawBytes, contentType, fileName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return file.getUrl();
}

/**
 * Asegura los encabezados limpios
 */
function ensureHeaders(sheet) {
  var headers = [
    "Invitados",
    "Teléfono / WhatsApp",
    "Email",
    "Total Personas",
    "Mayores de 3",
    "Menores de 3",
    "Monto Total ($)",
    "Comprobante de Pago",
    "Mensaje / Notas",
    "Estado"
  ];
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    formatHeaderRow(sheet, headers.length);
    return;
  }
  
  var firstCell = sheet.getRange(1, 1).getValue().toString();
  if (firstCell.indexOf("Fecha") !== -1 || firstCell.indexOf("Responsable") !== -1 || firstCell !== "Invitados") {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatHeaderRow(sheet, headers.length);
  }
}

function formatHeaderRow(sheet, numColumns) {
  var headerRange = sheet.getRange(1, 1, 1, numColumns);
  headerRange.setBackground("#4B5842"); // Verde oliva elegante
  headerRange.setFontColor("#FFFFFF");
  headerRange.setFontWeight("bold");
  headerRange.setFontFamily("Arial");
  headerRange.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  
  sheet.setColumnWidth(1, 280); // Invitados
  sheet.setColumnWidth(2, 160); // Teléfono / WhatsApp
  sheet.setColumnWidth(3, 200); // Email
  sheet.setColumnWidth(4, 110); // Total Personas
  sheet.setColumnWidth(5, 110); // Mayores de 3
  sheet.setColumnWidth(6, 110); // Menores de 3
  sheet.setColumnWidth(7, 130); // Monto Total ($)
  sheet.setColumnWidth(8, 240); // Comprobante
  sheet.setColumnWidth(9, 200); // Notas
  sheet.setColumnWidth(10, 150); // Estado
}

function sanitizeForSheet(value) {
  if (typeof value !== "string") return value;
  var trimmed = value.trim();
  if (trimmed.length > 0 && (trimmed[0] === "=" || trimmed[0] === "+" || trimmed[0] === "-" || trimmed[0] === "@")) {
    return "'" + trimmed;
  }
  return trimmed;
}

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
