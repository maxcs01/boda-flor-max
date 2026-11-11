/**
 * GOOGLE APPS SCRIPT - BODA FLOR & MAX (Versión 5.0 con Pase QR Digital y Portería)
 * =========================================================================
 * Planilla: https://docs.google.com/spreadsheets/d/15U2O1gAzXvVkAWobayX6wO_MYeyNyJu3WC-Elx4Xn4U/edit?gid=0#gid=0
 *
 * FUNCIONALIDADES PRINCIPALES:
 * 1. Validación estricta antiduplicados por Nombre Y Apellido completo.
 * 2. Generación de ID único por reserva (ej: FM-8F2A9C) y Link de Pase QR.
 * 3. Corrección y diagnóstico de e-mail con Pase QR adjunto (inline + PNG).
 * 4. Endpoints de Pase Individual (?action=getPass&id=...) y Portería (?action=getReceptionList&pin=...).
 * 5. Registro de Check-in en tiempo real en la fiesta con protección por PIN en servidor.
 * 6. Menú personalizado en Google Sheets para autorizar e-mails y generar QRs retroactivos.
 * =========================================================================
 */

// 🔐 PIN DE PORTERÍA (Validado únicamente en el servidor)
// Cambiá este código numérico si deseás otra contraseña para la puerta.
var RECEPTION_PIN = "2103";

// 🌐 URL base del Pase Digital publicado en Netlify
var BASE_PASS_URL = "https://bodaflor-max.netlify.app/pase.html";

var SHEET_HEADERS = [
  "Invitados",
  "Teléfono / WhatsApp",
  "Email",
  "Total Personas",
  "Mayores de 3",
  "Menores de 3",
  "Monto Total ($)",
  "Comprobante de Pago",
  "Mensaje / Notas",
  "Estado",
  "ID Pase QR",
  "Link del Pase",
  "Ingreso / Check-in"
];

/**
 * Crea el menú de utilidades directamente en la barra superior de Google Sheets
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("💌 Boda Flor & Max")
      .addItem("✅ Autorizar y Probar Envío de E-mail", "autorizarYProbarEmail")
      .addItem("🎫 Generar QRs para Confirmados Existentes", "generarQRsFaltantes")
      .addItem("📊 Ver Resumen de Portería", "mostrarResumenPorteria")
      .addToUi();
  } catch (e) {
    Logger.log("onOpen UI no disponible: " + e.toString());
  }
}

/**
 * Maneja peticiones POST:
 * - action === "checkin": Registra el ingreso en la puerta (requiere PIN).
 * - Por defecto: Registra nueva confirmación RSVP, genera Pase QR y envía e-mail.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(15000);

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    ensureHeaders(sheet);

    var data = {};
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      data = e.parameter;
    }

    // RUTA 1: Check-in desde la página de Portería (recepcion.html)
    if (data.action === "checkin") {
      return handleCheckinPost(sheet, data);
    }

    // RUTA 2: Nueva confirmación de asistencia (RSVP)
    var respName = (data.responsibleName || "").trim();

    // =========================================================================
    // VALIDACIÓN RIGUROSA ANTIDUPLICADOS: Verificar Titular y Acompañantes
    // =========================================================================
    var titularDup = findDuplicateGuest(sheet, respName);
    if (titularDup.duplicate) {
      return jsonResponse({
        status: "duplicate",
        duplicateType: "titular",
        message: "El invitado «" + respName + "» ya figura confirmado previamente. Su lugar ya está reservado y su tarjeta no debe volver a abonarse."
      });
    }

    if (Array.isArray(data.guests)) {
      for (var k = 1; k < data.guests.length; k++) {
        var compName = (data.guests[k].name || "").trim();
        var compDup = findDuplicateGuest(sheet, compName);
        if (compDup.duplicate) {
          return jsonResponse({
            status: "duplicate",
            duplicateType: "companion",
            message: "El acompañante «" + compName + "» ya figura confirmado previamente. Su lugar ya está reservado y su tarjeta no debe volver a abonarse."
          });
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

    // Generar ID único del Pase QR y URL oficial
    var passId = generateUniquePassId(sheet);
    var passUrl = BASE_PASS_URL + "?id=" + encodeURIComponent(passId);

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
      "Confirmado",                                                 // J: Estado
      passId,                                                       // K: ID Pase QR
      passUrl,                                                      // L: Link del Pase
      ""                                                            // M: Ingreso / Check-in
    ];

    sheet.appendRow(titularRow);
    var titularRowIndex = sheet.getLastRow();

    // Formato estándar con el nombre y apellido en negrito (bold) y color #4a5d4e
    var titularRange = sheet.getRange(titularRowIndex, 1, 1, titularRow.length);
    titularRange.setFontFamily("Arial");
    titularRange.setFontWeight("normal");
    sheet.getRange(titularRowIndex, 1).setFontWeight("bold").setFontColor("#4a5d4e");
    sheet.getRange(titularRowIndex, 11).setFontWeight("bold").setFontColor("#4a5d4e").setHorizontalAlignment("center");

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
          "Acompañante de " + safeRespName,
          "-",
          "-",
          "-"
        ];

        sheet.appendRow(companionRow);
        var compRowIndex = sheet.getLastRow();
        var compRange = sheet.getRange(compRowIndex, 1, 1, companionRow.length);
        compRange.setFontFamily("Arial");
        compRange.setFontWeight("normal");
        sheet.getRange(compRowIndex, 1).setFontWeight("normal").setFontColor("#555555");
      }
    }

    // 3. ENVÍO AUTOMÁTICO DE EMAIL DE CONFIRMACIÓN CON PASE QR (si dejó correo)
    var emailSent = false;
    var emailError = "";
    if (email && email.indexOf("@") !== -1) {
      try {
        sendConfirmationEmail(email, respName, data, passId, passUrl);
        emailSent = true;
      } catch (mailErr) {
        emailError = mailErr.toString();
        Logger.log("Error al enviar email: " + emailError);
      }
    }

    return jsonResponse({
      status: "success",
      message: "¡Invitados registrados con éxito!",
      passId: passId,
      passUrl: passUrl,
      emailSent: emailSent,
      emailError: emailError,
      row: titularRowIndex,
      receiptUrl: fileUrl
    });

  } catch (error) {
    return jsonResponse({
      status: "error",
      message: error.toString()
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Registra o revierte el ingreso en la puerta validando el PIN de portería
 */
function handleCheckinPost(sheet, data) {
  var pin = (data.pin || "").toString().trim();
  if (pin !== RECEPTION_PIN) {
    return jsonResponse({
      status: "unauthorized",
      message: "PIN de portería incorrecto."
    });
  }

  var passId = (data.passId || "").toString().trim().toUpperCase();
  if (!passId) {
    return jsonResponse({
      status: "error",
      message: "Falta el código del pase QR."
    });
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse({ status: "not_found", message: "La planilla no tiene registros." });
  }

  var allValues = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
  var foundIndex0 = -1;

  for (var i = 0; i < allValues.length; i++) {
    var rowPassId = (allValues[i][10] || "").toString().trim().toUpperCase();
    if (rowPassId === passId) {
      foundIndex0 = i;
      break;
    }
  }

  if (foundIndex0 === -1) {
    return jsonResponse({
      status: "not_found",
      message: "No se encontró ningún invitado confirmado con el código «" + passId + "»."
    });
  }

  var passObj = collectPassGroup(allValues, foundIndex0);
  var sheetRowNumber = foundIndex0 + 2;
  var checkInCell = sheet.getRange(sheetRowNumber, 13);

  // Permitir deshacer check-in desde portería si se solicita explícitamente
  if (data.undo === true) {
    checkInCell.setValue("").setBackground(null).setFontColor("#2B2F2C").setFontWeight("normal");
    passObj.checkIn = "";
    passObj.checkedIn = false;
    return jsonResponse({
      status: "success",
      message: "Ingreso revertido correctamente.",
      pass: passObj
    });
  }

  if (passObj.checkedIn) {
    return jsonResponse({
      status: "already_checked_in",
      message: "Este pase ya registró ingreso (" + passObj.checkIn + ").",
      pass: passObj
    });
  }

  var timestamp = Utilities.formatDate(new Date(), "America/Argentina/Buenos_Aires", "HH:mm 'hs' (dd/MM)");
  var checkInLabel = "Ingresado - " + timestamp;

  checkInCell
    .setValue(checkInLabel)
    .setBackground("#E8F5E9")
    .setFontColor("#2E7D32")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  passObj.checkIn = checkInLabel;
  passObj.checkedIn = true;

  return jsonResponse({
    status: "success",
    message: "¡Ingreso confirmado para " + passObj.titularName + "!",
    pass: passObj
  });
}

/**
 * Consultas vía GET:
 * - action=checkName: Verifica duplicado por Nombre y Apellido.
 * - action=getPass: Devuelve los datos públicos de un Pase QR específico (Nombre, Acompañantes, Estado).
 * - action=getReceptionList: Devuelve toda la lista de pases para la Portería (requiere PIN correcto).
 */
function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var action = e && e.parameter ? e.parameter.action : "";

  if (action === "checkName") {
    var nameToCheck = e.parameter.name || "";
    var checkResult = findDuplicateGuest(sheet, nameToCheck);
    return jsonResponse(checkResult);
  }

  if (action === "getPass") {
    ensureHeaders(sheet);
    var passId = (e.parameter.id || "").toString().trim().toUpperCase();
    if (!passId) {
      return jsonResponse({ found: false, message: "Código de pase no especificado." });
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return jsonResponse({ found: false, message: "Aún no hay invitados registrados." });
    }

    var allValues = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
    for (var i = 0; i < allValues.length; i++) {
      var rowPassId = (allValues[i][10] || "").toString().trim().toUpperCase();
      if (rowPassId === passId) {
        return jsonResponse({
          found: true,
          pass: collectPassGroup(allValues, i)
        });
      }
    }

    if (passId === "FM-PRUEBA") {
      return jsonResponse({
        found: true,
        pass: {
          id: "FM-PRUEBA",
          passUrl: BASE_PASS_URL + "?id=FM-PRUEBA",
          titularName: "Invitado de Prueba",
          companions: [{ name: "Acompañante de Prueba", isChild: false }],
          totalGuests: 2,
          adults: 2,
          children: 0,
          status: "Confirmado (Prueba)",
          checkIn: "",
          checkedIn: false
        }
      });
    }

    return jsonResponse({
      found: false,
      message: "Pase «" + passId + "» no encontrado en la lista oficial."
    });
  }

  if (action === "getReceptionList") {
    ensureHeaders(sheet);
    var pin = (e.parameter.pin || "").toString().trim();
    if (pin !== RECEPTION_PIN) {
      return jsonResponse({
        status: "unauthorized",
        message: "PIN de portería incorrecto."
      });
    }

    var passes = getAllPasses(sheet);
    var totalGroups = passes.length;
    var totalPeople = 0;
    var checkedInGroups = 0;
    var checkedInPeople = 0;

    for (var j = 0; j < passes.length; j++) {
      var p = passes[j];
      totalPeople += p.totalGuests;
      if (p.checkedIn) {
        checkedInGroups++;
        checkedInPeople += p.totalGuests;
      }
    }

    return jsonResponse({
      status: "success",
      passes: passes,
      stats: {
        totalGroups: totalGroups,
        totalPeople: totalPeople,
        checkedInGroups: checkedInGroups,
        checkedInPeople: checkedInPeople
      },
      generatedAt: new Date().toISOString()
    });
  }

  return jsonResponse({
    status: "online",
    service: "Boda Flor y Max - Sistema de Confirmación, QR y Portería",
    version: "5.0",
    features: ["strict_duplicate_check", "qr_pass_generation", "email_with_qr", "reception_checkin"],
    timestamp: new Date().toISOString()
  });
}

/**
 * Agrupa un titular (índice base 0 dentro de allValues) junto con sus acompañantes consecutivos (↳)
 */
function collectPassGroup(allValues, titularIdx0) {
  var row = allValues[titularIdx0];
  var titularName = (row[0] || "").toString().trim();
  var totalGuests = parseInt(row[3], 10) || 1;
  var adults = parseInt(row[4], 10) || 1;
  var children = parseInt(row[5], 10) || 0;
  var status = (row[9] || "Confirmado").toString().trim();
  var passId = (row[10] || "").toString().trim();
  var passUrl = (row[11] || "").toString().trim();
  var checkIn = (row[12] || "").toString().trim();

  var companions = [];
  for (var j = titularIdx0 + 1; j < allValues.length; j++) {
    var nextName = (allValues[j][0] || "").toString().trim();
    if (!nextName || nextName.indexOf("↳") === -1) {
      break;
    }
    var isChild = nextName.indexOf("Menor de 3") !== -1;
    var cleanCompName = nextName.replace(/^↳\s*/, "").replace(/\(.*?Menor de 3.*?\)/g, "").trim();
    companions.push({
      name: cleanCompName,
      isChild: isChild
    });
  }

  // Asegurar coherencia numérica si hubo ediciones manuales en la planilla
  if (totalGuests < 1 + companions.length) {
    totalGuests = 1 + companions.length;
  }

  return {
    id: passId,
    passUrl: passUrl || (passId ? BASE_PASS_URL + "?id=" + encodeURIComponent(passId) : ""),
    titularName: titularName,
    companions: companions,
    totalGuests: totalGuests,
    adults: adults,
    children: children,
    status: status,
    checkIn: checkIn,
    checkedIn: checkIn.indexOf("Ingresado") !== -1
  };
}

/**
 * Obtiene todos los grupos confirmados de la planilla
 */
function getAllPasses(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var allValues = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
  var passes = [];

  for (var i = 0; i < allValues.length; i++) {
    var rawName = (allValues[i][0] || "").toString().trim();
    if (!rawName || rawName.indexOf("↳") !== -1) continue;

    // Si una fila confirmada previamente aún no tiene ID de pase, lo asignamos automáticamente
    var currentPassId = (allValues[i][10] || "").toString().trim();
    if (!currentPassId || currentPassId === "-") {
      currentPassId = generateUniquePassIdFromValues(allValues);
      var generatedUrl = BASE_PASS_URL + "?id=" + encodeURIComponent(currentPassId);
      allValues[i][10] = currentPassId;
      allValues[i][11] = generatedUrl;
      sheet.getRange(i + 2, 11).setValue(currentPassId).setFontWeight("bold").setFontColor("#4a5d4e").setHorizontalAlignment("center");
      sheet.getRange(i + 2, 12).setValue(generatedUrl);
    }

    passes.push(collectPassGroup(allValues, i));
  }

  return passes;
}

/**
 * Genera un código único corto estilo FM-8F2A9C verificando que no exista en la hoja
 */
function generateUniquePassId(sheet) {
  var lastRow = sheet.getLastRow();
  var existingValues = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 13).getValues() : [];
  return generateUniquePassIdFromValues(existingValues);
}

function generateUniquePassIdFromValues(existingValues) {
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var used = {};
  for (var i = 0; i < existingValues.length; i++) {
    var idVal = (existingValues[i][10] || "").toString().trim().toUpperCase();
    if (idVal) used[idVal] = true;
  }

  for (var attempt = 0; attempt < 50; attempt++) {
    var code = "FM-";
    for (var c = 0; c < 6; c++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!used[code]) return code;
  }

  return "FM-" + new Date().getTime().toString(36).toUpperCase().slice(-6);
}

/**
 * Busca si un Nombre y Apellido completo ya existe en la planilla.
 */
function findDuplicateGuest(sheet, fullName) {
  if (!fullName) return { duplicate: false };

  var normalizedInput = normalizeName(fullName);
  var words = normalizedInput.split(" ").filter(function(w) { return w.length > 0; });

  if (words.length < 2) {
    return { duplicate: false, reason: "needs_surname" };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { duplicate: false };

  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  for (var i = 0; i < values.length; i++) {
    var rawValue = values[i][0];
    if (!rawValue) continue;
    var rawStr = rawValue.toString().trim();

    var isCompanion = rawStr.indexOf("↳") !== -1;
    var existingNormalized = normalizeName(rawStr);

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

function normalizeName(str) {
  if (!str) return "";
  return str
    .toString()
    .toLowerCase()
    .replace(/^↳\s*/, "")
    .replace(/\(.*?\)/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCleanName(str) {
  if (!str) return "";
  return str.toString().replace(/^↳\s*/, "").replace(/\(.*?\)/g, "").trim();
}

/**
 * Descarga la imagen PNG del código QR para incrustarla en el correo electrónico
 */
function fetchQrBlob(passUrl, passId) {
  var urls = [
    "https://quickchart.io/qr?size=320&margin=2&ecLevel=M&text=" + encodeURIComponent(passUrl),
    "https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=" + encodeURIComponent(passUrl)
  ];

  for (var i = 0; i < urls.length; i++) {
    try {
      var res = UrlFetchApp.fetch(urls[i], { muteHttpExceptions: true });
      if (res.getResponseCode() === 200) {
        var blob = res.getBlob().setName("Pase_QR_" + passId + ".png");
        return blob;
      }
    } catch (e) {
      Logger.log("Aviso fetchQrBlob (" + urls[i] + "): " + e.toString());
    }
  }
  return null;
}

/**
 * Envía un correo electrónico con diseño elegante de boda y Pase QR embutido al invitado
 */
function sendConfirmationEmail(recipientEmail, guestName, data, passId, passUrl) {
  var subject = "¡Tu Pase QR y Confirmación! Boda Flor & Max 👰🤵";
  var safeGuestName = escapeHtml(guestName);
  var safePassId = escapeHtml(passId || "");
  var safePassUrl = passUrl || BASE_PASS_URL;

  var guestListHtml = "";
  if (Array.isArray(data.guests)) {
    guestListHtml = data.guests.map(function(g, idx) {
      var tag = g.isChild ? " <span style='color: #5A7163; font-size: 12px;'>(Menor de 3 años)</span>" : "";
      return "<li style='margin-bottom: 6px; color: #2B2F2C;'><strong>" + (idx + 1) + ". " + escapeHtml(g.name || "") + "</strong>" + tag + "</li>";
    }).join("");
  } else {
    guestListHtml = "<li>" + safeGuestName + "</li>";
  }

  var qrBlob = fetchQrBlob(safePassUrl, safePassId);
  var qrImageSrc = qrBlob
    ? "cid:qrCode"
    : "https://quickchart.io/qr?size=280&margin=2&text=" + encodeURIComponent(safePassUrl);

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

        // Bloque destacado con el Código QR para la puerta
        "<div style='background: #FFFDF9; border: 2px solid #C5A059; border-radius: 16px; padding: 22px 16px; margin: 22px 0; text-align: center;'>" +
          "<div style='font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.14em; color: #9F7932; margin-bottom: 6px;'>Tu Pase de Ingreso para la Fiesta</div>" +
          "<p style='font-size: 13px; color: #555; margin: 0 0 14px 0;'>Presentá este código QR en la puerta el día de la boda:</p>" +
          "<img src='" + qrImageSrc + "' alt='Pase QR " + safePassId + "' style='width: 210px; height: 210px; border-radius: 10px; border: 4px solid #FFFFFF; box-shadow: 0 4px 14px rgba(0,0,0,0.08); display: block; margin: 0 auto;'>" +
          "<div style='margin-top: 12px; font-size: 15px; font-weight: bold; letter-spacing: 0.12em; color: #4B5842;'>" + safePassId + "</div>" +
          "<div style='margin-top: 14px;'>" +
            "<a href='" + safePassUrl + "' target='_blank' style='background: #C5A059; color: #FFFFFF; padding: 10px 20px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 13px; display: inline-block;'>" +
              "🎫 Ver Pase Digital Online" +
            "</a>" +
          "</div>" +
        "</div>" +

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

  var emailOptions = {
    to: recipientEmail,
    subject: subject,
    name: "Boda Flor & Max",
    htmlBody: htmlBody
  };

  if (qrBlob) {
    emailOptions.inlineImages = { qrCode: qrBlob };
    emailOptions.attachments = [qrBlob];
  }

  MailApp.sendEmail(emailOptions);
}

/**
 * FUNCIÓN PARA EJECUTAR UNA VEZ DESDE EL EDITOR O MENÚ:
 * 1) Fuerza a Google a pedir las autorizaciones de MailApp y UrlFetchApp.
 * 2) Envía un e-mail de prueba al dueño de la planilla con un Pase QR de ejemplo.
 */
function autorizarYProbarEmail() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  ensureHeaders(sheet);

  var ownerEmail = Session.getEffectiveUser().getEmail();
  var quota = MailApp.getRemainingDailyQuota();

  var testData = {
    guests: [
      { name: "Invitado de Prueba", isChild: false },
      { name: "Acompañante de Prueba", isChild: false }
    ],
    totalGuestsCount: 2,
    totalAmountFormatted: "$60.000"
  };

  var testUrl = BASE_PASS_URL + "?id=FM-PRUEBA";
  sendConfirmationEmail(ownerEmail, "Invitado de Prueba", testData, "FM-PRUEBA", testUrl);

  var msg = "✅ ¡Permisos autorizados y e-mail de prueba enviado!\n\n" +
            "Destinatario: " + ownerEmail + "\n" +
            "Cuota diaria restante de Google: " + quota + " e-mails.\n\n" +
            "Recordá publicar una NUEVA VERSIÓN en Implementar > Administrar implementaciones.";
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {}
}

/**
 * Genera códigos y links de Pase QR para todos los confirmados anteriores que aún no tienen uno.
 */
function generarQRsFaltantes() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  ensureHeaders(sheet);

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    try { SpreadsheetApp.getUi().alert("Aún no hay invitados registrados."); } catch (e) {}
    return;
  }

  var allValues = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
  var countGenerated = 0;

  for (var i = 0; i < allValues.length; i++) {
    var rawName = (allValues[i][0] || "").toString().trim();
    if (!rawName) continue;

    var sheetRow = i + 2;
    if (rawName.indexOf("↳") !== -1) {
      // Fila de acompañante: asegurar guiones en K..M si están vacíos
      if (!allValues[i][10]) sheet.getRange(sheetRow, 11).setValue("-");
      if (!allValues[i][11]) sheet.getRange(sheetRow, 12).setValue("-");
      if (!allValues[i][12]) sheet.getRange(sheetRow, 13).setValue("-");
      continue;
    }

    var currentId = (allValues[i][10] || "").toString().trim();
    if (!currentId || currentId === "-") {
      var newId = generateUniquePassIdFromValues(allValues);
      var passUrl = BASE_PASS_URL + "?id=" + encodeURIComponent(newId);
      allValues[i][10] = newId;
      allValues[i][11] = passUrl;

      sheet.getRange(sheetRow, 11).setValue(newId).setFontWeight("bold").setFontColor("#4a5d4e").setHorizontalAlignment("center");
      sheet.getRange(sheetRow, 12).setValue(passUrl);
      countGenerated++;
    }
  }

  var summary = countGenerated > 0
    ? "✅ Se generaron " + countGenerated + " Pases QR nuevos en las columnas K y L."
    : "✅ Todos los invitados confirmados ya cuentan con su Pase QR.";

  Logger.log(summary);
  try {
    SpreadsheetApp.getUi().alert(summary);
  } catch (e) {}
}

/**
 * Muestra un resumen rápido de invitados confirmados vs ingresados en portería
 */
function mostrarResumenPorteria() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  ensureHeaders(sheet);
  var passes = getAllPasses(sheet);

  var totalPeople = 0;
  var checkedGroups = 0;
  var checkedPeople = 0;

  for (var i = 0; i < passes.length; i++) {
    totalPeople += passes[i].totalGuests;
    if (passes[i].checkedIn) {
      checkedGroups++;
      checkedPeople += passes[i].totalGuests;
    }
  }

  var msg = "📊 RESUMEN DE INVITADOS Y PORTERÍA\n\n" +
            "• Grupos confirmados: " + passes.length + "\n" +
            "• Total de personas confirmadas: " + totalPeople + "\n" +
            "• Grupos que ya ingresaron: " + checkedGroups + "\n" +
            "• Personas que ya ingresaron: " + checkedPeople + " / " + totalPeople;

  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg);
  }
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
 * Asegura los encabezados limpios (Columnas A a M) sin borrar datos existentes
 */
function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SHEET_HEADERS);
    formatHeaderRow(sheet, SHEET_HEADERS.length);
    return;
  }

  var currentCols = sheet.getLastColumn();
  if (currentCols < SHEET_HEADERS.length) {
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
    formatHeaderRow(sheet, SHEET_HEADERS.length);
    return;
  }

  var firstCell = sheet.getRange(1, 1).getValue().toString();
  var eleventhCell = sheet.getRange(1, 11).getValue().toString();
  if (firstCell.indexOf("Fecha") !== -1 || firstCell.indexOf("Responsable") !== -1 || firstCell !== "Invitados" || eleventhCell !== "ID Pase QR") {
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
    formatHeaderRow(sheet, SHEET_HEADERS.length);
  }
}

function formatHeaderRow(sheet, numColumns) {
  var headerRange = sheet.getRange(1, 1, 1, numColumns);
  headerRange.setBackground("#4B5842");
  headerRange.setFontColor("#FFFFFF");
  headerRange.setFontWeight("bold");
  headerRange.setFontFamily("Arial");
  headerRange.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);

  sheet.setColumnWidth(1, 280);  // A: Invitados
  sheet.setColumnWidth(2, 160);  // B: Teléfono / WhatsApp
  sheet.setColumnWidth(3, 200);  // C: Email
  sheet.setColumnWidth(4, 110);  // D: Total Personas
  sheet.setColumnWidth(5, 110);  // E: Mayores de 3
  sheet.setColumnWidth(6, 110);  // F: Menores de 3
  sheet.setColumnWidth(7, 130);  // G: Monto Total ($)
  sheet.setColumnWidth(8, 240);  // H: Comprobante
  sheet.setColumnWidth(9, 200);  // I: Notas
  sheet.setColumnWidth(10, 150); // J: Estado
  sheet.setColumnWidth(11, 130); // K: ID Pase QR
  sheet.setColumnWidth(12, 260); // L: Link del Pase
  sheet.setColumnWidth(13, 190); // M: Ingreso / Check-in
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
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
