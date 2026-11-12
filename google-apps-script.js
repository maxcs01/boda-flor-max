/**
 * GOOGLE APPS SCRIPT - BODA FLOR & MAX (Versión 5.1)
 * App Validador Exclusivo de Portería (Sesión Única) + Token QR Firmado + E-mail con QR
 * ====================================================================================
 * Planilla: https://docs.google.com/spreadsheets/d/15U2O1gAzXvVkAWobayX6wO_MYeyNyJu3WC-Elx4Xn4U/edit?gid=0#gid=0
 */

// 🔐 PIN DE PORTERÍA (Validado únicamente en el servidor)
var RECEPTION_PIN = "2103";

// 🔑 CLAVE SECRETA PARA FIRMAR LOS CÓDIGOS QR (Solo el App Validador + Servidor los validan)
var QR_SECRET_KEY = "BodaFlorYMax_21032027_SecretQR";

// 🌐 URL base de la página donde el invitado visualiza su QR (para Email y WhatsApp)
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
  "Presencia / Check-in"
];

/**
 * Menú de utilidades en la barra superior de Google Sheets
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("💌 Boda Flor & Max")
      .addItem("✅ Autorizar y Probar Envío de E-mail", "autorizarYProbarEmail")
      .addItem("🎫 Generar QRs para Confirmados Existentes", "generarQRsFaltantes")
      .addItem("🔓 Liberar Dispositivo Activo de Portería", "liberarSesionPorteriaManual")
      .addItem("📊 Ver Resumen de Presencia (Portería)", "mostrarResumenPorteria")
      .addToUi();
  } catch (e) {
    Logger.log("onOpen UI no disponible: " + e.toString());
  }
}

/**
 * Firma criptográfica HMAC-SHA256 corta para que el QR sea opaco a cámaras comunes
 * Formato del QR: BODA-FM|<PASS_ID>|<FIRMA_8_HEX>
 */
function computePassSignature(passId) {
  var cleanId = (passId || "").toString().trim().toUpperCase();
  var rawBytes = Utilities.computeHmacSha256Signature(cleanId, QR_SECRET_KEY);
  var hex = "";
  for (var i = 0; i < rawBytes.length; i++) {
    var b = (rawBytes[i] < 0 ? rawBytes[i] + 256 : rawBytes[i]).toString(16);
    if (b.length === 1) hex += "0";
    hex += b;
  }
  return hex.substring(0, 8).toUpperCase();
}

function buildSignedQrPayload(passId) {
  var cleanId = (passId || "").toString().trim().toUpperCase();
  if (!cleanId) return "";
  return "BODA-FM|" + cleanId + "|" + computePassSignature(cleanId);
}

function verifySignedQrPayload(rawQrOrId) {
  var str = (rawQrOrId || "").toString().trim().toUpperCase();
  if (!str) return { valid: false, passId: "" };

  if (str.indexOf("BODA-FM|") === 0) {
    var parts = str.split("|");
    if (parts.length !== 3) return { valid: false, passId: "", reason: "bad_format" };
    var id = parts[1];
    var sig = parts[2];
    if (sig === computePassSignature(id)) {
      return { valid: true, passId: id, signed: true };
    }
    return { valid: false, passId: id, reason: "invalid_signature" };
  }

  return { valid: true, passId: str, signed: false };
}

/**
 * Gestión de Sesión Única en Portería (1 sola persona / dispositivo activo por vez)
 */
function getActiveReceptionSession() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty("ACTIVE_RECEPTION_SESSION");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setActiveReceptionSession(sessionObj) {
  PropertiesService.getScriptProperties().setProperty("ACTIVE_RECEPTION_SESSION", JSON.stringify(sessionObj));
}

function clearActiveReceptionSession() {
  PropertiesService.getScriptProperties().deleteProperty("ACTIVE_RECEPTION_SESSION");
}

function liberarSesionPorteriaManual() {
  clearActiveReceptionSession();
  try {
    SpreadsheetApp.getUi().alert("✅ Sesión de portería liberada. Ahora un nuevo dispositivo puede ingresar con el PIN.");
  } catch (e) {}
}

/**
 * Maneja todas las peticiones POST
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

    if (data.action === "loginReception") {
      return handleReceptionLogin(sheet, data);
    }

    if (data.action === "logoutReception") {
      return handleReceptionLogout(data);
    }

    if (data.action === "checkin") {
      return handleCheckinPost(sheet, data);
    }

    // RUTA POR DEFECTO: Nueva confirmación de asistencia (RSVP)
    var respName = (data.responsibleName || "").trim();

    // Validación antiduplicados (Titular y Acompañantes)
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

    // Guardar imagen del comprobante en Drive
    var fileUrl = "No adjuntado";
    if (data.receiptBase64 && data.receiptBase64.indexOf("base64,") !== -1) {
      try {
        fileUrl = saveReceiptToDrive(data.receiptBase64, respName || "Comprobante");
      } catch (err) {
        fileUrl = "Error al guardar imagen: " + err.message;
      }
    }

    // Generar ID único, Link para mostrar el QR y Token QR firmado exclusivo del App Validador
    var passId = generateUniquePassId(sheet);
    var passUrl = BASE_PASS_URL + "?id=" + encodeURIComponent(passId);
    var qrPayload = buildSignedQrPayload(passId);

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
      ""                                                            // M: Presencia / Check-in
    ];

    sheet.appendRow(titularRow);
    var titularRowIndex = sheet.getLastRow();

    var titularRange = sheet.getRange(titularRowIndex, 1, 1, titularRow.length);
    titularRange.setFontFamily("Arial");
    titularRange.setFontWeight("normal");
    sheet.getRange(titularRowIndex, 1).setFontWeight("bold").setFontColor("#4a5d4e");
    sheet.getRange(titularRowIndex, 11).setFontWeight("bold").setFontColor("#4a5d4e").setHorizontalAlignment("center");

    // 2. FILAS DE ACOMPAÑANTES DEBAJO DEL RESPONSABLE
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

    // 3. ENVÍO AUTOMÁTICO DE E-MAIL CON QR Y LINK (si ingresó correo)
    var emailSent = false;
    var emailError = "";
    if (email && email.indexOf("@") !== -1) {
      try {
        sendConfirmationEmail(email, respName, data, passId, passUrl, qrPayload);
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
      qrPayload: qrPayload,
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
 * Inicio de sesión único para el App Validador de Portería
 */
function handleReceptionLogin(sheet, data) {
  var pin = (data.pin || "").toString().trim();
  if (pin !== RECEPTION_PIN) {
    return jsonResponse({
      status: "unauthorized",
      message: "PIN de portería incorrecto."
    });
  }

  var existing = getActiveReceptionSession();
  var clientToken = (data.existingToken || "").toString().trim();
  var forceTakeover = Boolean(data.forceTakeover);

  if (existing && existing.token) {
    if (clientToken === existing.token) {
      // Mismo dispositivo reconectándose
      return jsonResponse({
        status: "success",
        sessionToken: existing.token,
        passes: getAllPasses(sheet),
        deviceLabel: existing.deviceLabel
      });
    }

    if (!forceTakeover) {
      return jsonResponse({
        status: "session_locked",
        message: "Ya hay otro dispositivo conectado validando en la puerta (" + (existing.deviceLabel || "Recepción") + " desde las " + existing.loggedAt + "). Solo una persona puede validar por vez."
      });
    }
  }

  var newToken = Utilities.getUuid();
  var nowStr = Utilities.formatDate(new Date(), "America/Argentina/Buenos_Aires", "HH:mm 'hs' (dd/MM)");
  var sessionObj = {
    token: newToken,
    deviceLabel: (data.deviceLabel || "Recepción").toString().slice(0, 60),
    loggedAt: nowStr
  };
  setActiveReceptionSession(sessionObj);

  return jsonResponse({
    status: "success",
    sessionToken: newToken,
    passes: getAllPasses(sheet),
    deviceLabel: sessionObj.deviceLabel
  });
}

/**
 * Cierra la sesión activa del dispositivo de portería
 */
function handleReceptionLogout(data) {
  var pin = (data.pin || "").toString().trim();
  var token = (data.sessionToken || "").toString().trim();
  if (pin !== RECEPTION_PIN) {
    return jsonResponse({ status: "unauthorized" });
  }
  var existing = getActiveReceptionSession();
  if (!existing || existing.token === token) {
    clearActiveReceptionSession();
  }
  return jsonResponse({ status: "success" });
}

/**
 * Valida la sesión activa del recepcionista
 */
function isValidReceptionSession(pin, token) {
  if (pin !== RECEPTION_PIN) return { ok: false, reason: "unauthorized" };
  var existing = getActiveReceptionSession();
  if (existing && existing.token && existing.token !== token) {
    return { ok: false, reason: "session_revoked" };
  }
  return { ok: true };
}

/**
 * Registra automáticamente como "Presente" en el Excel/Google Sheets cuando el App Validador escanea el QR
 */
function handleCheckinPost(sheet, data) {
  var pin = (data.pin || "").toString().trim();
  var sessionToken = (data.sessionToken || "").toString().trim();
  var auth = isValidReceptionSession(pin, sessionToken);

  if (!auth.ok) {
    return jsonResponse({
      status: auth.reason,
      message: auth.reason === "session_revoked"
        ? "Tu sesión fue cerrada porque otro dispositivo asumió la portería."
        : "PIN de portería incorrecto."
    });
  }

  var qrCheck = verifySignedQrPayload(data.qrRaw || data.passId);
  if (!qrCheck.valid) {
    return jsonResponse({
      status: "invalid_qr",
      message: "Código QR inválido o adulterado."
    });
  }

  var passId = qrCheck.passId;
  if (!passId) {
    return jsonResponse({ status: "error", message: "Falta el código del pase QR." });
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

  // Revertir presencia si se escaneó por error
  if (data.undo === true) {
    checkInCell.setValue("").setBackground(null).setFontColor("#2B2F2C").setFontWeight("normal");
    passObj.checkIn = "";
    passObj.checkedIn = false;
    return jsonResponse({
      status: "success",
      message: "Presencia revertida correctamente.",
      pass: passObj
    });
  }

  if (passObj.checkedIn) {
    return jsonResponse({
      status: "already_checked_in",
      message: "Este pase ya registró presencia (" + passObj.checkIn + ").",
      pass: passObj
    });
  }

  var timestamp = Utilities.formatDate(new Date(), "America/Argentina/Buenos_Aires", "HH:mm 'hs' (dd/MM)");
  var checkInLabel = "Presente - " + timestamp;

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
    message: "¡Presente registrado para " + passObj.titularName + "!",
    pass: passObj
  });
}

/**
 * Consultas vía GET
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
    if (lastRow >= 2) {
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
    }

    if (passId === "FM-PRUEBA") {
      return jsonResponse({
        found: true,
        pass: {
          id: "FM-PRUEBA",
          passUrl: BASE_PASS_URL + "?id=FM-PRUEBA",
          qrPayload: buildSignedQrPayload("FM-PRUEBA"),
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
    var token = (e.parameter.sessionToken || "").toString().trim();
    var auth = isValidReceptionSession(pin, token);

    if (!auth.ok) {
      return jsonResponse({
        status: auth.reason,
        message: auth.reason === "session_revoked"
          ? "Tu sesión fue cerrada porque otro dispositivo asumió la portería."
          : "PIN de portería incorrecto."
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
    service: "Boda Flor y Max - Sistema de Confirmación, QR Exclusivo y Portería",
    version: "5.1",
    features: ["strict_duplicate_check", "signed_app_qr", "single_device_reception", "email_with_qr", "auto_checkin"],
    timestamp: new Date().toISOString()
  });
}

/**
 * Agrupa un titular junto con sus acompañantes (↳)
 */
function collectPassGroup(allValues, titularIdx0) {
  var row = allValues[titularIdx0];
  var titularName = (row[0] || "").toString().trim();
  var totalGuests = parseInt(row[3], 10) || 1;
  var adults = parseInt(row[4], 10) || 1;
  var children = parseInt(row[5], 10) || 0;
  var status = (row[9] || "Confirmado").toString().trim();
  var passId = (row[10] || "").toString().trim().toUpperCase();
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

  if (totalGuests < 1 + companions.length) {
    totalGuests = 1 + companions.length;
  }

  return {
    id: passId,
    passUrl: passUrl || (passId ? BASE_PASS_URL + "?id=" + encodeURIComponent(passId) : ""),
    qrPayload: passId ? buildSignedQrPayload(passId) : "",
    titularName: titularName,
    companions: companions,
    totalGuests: totalGuests,
    adults: adults,
    children: children,
    status: status,
    checkIn: checkIn,
    checkedIn: checkIn.indexOf("Presente") !== -1 || checkIn.indexOf("Ingresado") !== -1
  };
}

function getAllPasses(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var allValues = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
  var passes = [];

  for (var i = 0; i < allValues.length; i++) {
    var rawName = (allValues[i][0] || "").toString().trim();
    if (!rawName || rawName.indexOf("↳") !== -1) continue;

    var currentPassId = (allValues[i][10] || "").toString().trim().toUpperCase();
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
 * Descarga la imagen PNG del código QR (conteniendo el token firmado exclusivo para el App Validador)
 */
function fetchQrBlob(qrContent, passId) {
  var urls = [
    "https://quickchart.io/qr?size=320&margin=2&ecLevel=M&text=" + encodeURIComponent(qrContent),
    "https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=" + encodeURIComponent(qrContent)
  ];

  for (var i = 0; i < urls.length; i++) {
    try {
      var res = UrlFetchApp.fetch(urls[i], { muteHttpExceptions: true });
      if (res.getResponseCode() === 200) {
        return res.getBlob().setName("Pase_QR_" + passId + ".png");
      }
    } catch (e) {
      Logger.log("Aviso fetchQrBlob (" + urls[i] + "): " + e.toString());
    }
  }
  return null;
}

/**
 * Envía el e-mail de confirmación con el QR exclusivo de recepción embutido + link al pase
 */
function sendConfirmationEmail(recipientEmail, guestName, data, passId, passUrl, qrPayload) {
  var subject = "¡Tu Pase QR y Confirmación! Boda Flor & Max 👰🤵";
  var safeGuestName = escapeHtml(guestName);
  var safePassId = escapeHtml(passId || "");
  var safePassUrl = passUrl || BASE_PASS_URL;
  var qrContent = qrPayload || buildSignedQrPayload(passId);

  var guestListHtml = "";
  if (Array.isArray(data.guests)) {
    guestListHtml = data.guests.map(function(g, idx) {
      var tag = g.isChild ? " <span style='color: #5A7163; font-size: 12px;'>(Menor de 3 años)</span>" : "";
      return "<li style='margin-bottom: 6px; color: #2B2F2C;'><strong>" + (idx + 1) + ". " + escapeHtml(g.name || "") + "</strong>" + tag + "</li>";
    }).join("");
  } else {
    guestListHtml = "<li>" + safeGuestName + "</li>";
  }

  var qrBlob = fetchQrBlob(qrContent, safePassId);
  var qrImageSrc = qrBlob
    ? "cid:qrCode"
    : "https://quickchart.io/qr?size=280&margin=2&text=" + encodeURIComponent(qrContent);

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

        "<div style='background: #FFFDF9; border: 2px solid #C5A059; border-radius: 16px; padding: 22px 16px; margin: 22px 0; text-align: center;'>" +
          "<div style='font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.14em; color: #9F7932; margin-bottom: 6px;'>Tu Pase QR de Ingreso</div>" +
          "<p style='font-size: 13px; color: #555; margin: 0 0 14px 0;'>Presentá este código QR en la recepción al llegar al salón:</p>" +
          "<img src='" + qrImageSrc + "' alt='Pase QR " + safePassId + "' style='width: 210px; height: 210px; border-radius: 10px; border: 4px solid #FFFFFF; box-shadow: 0 4px 14px rgba(0,0,0,0.08); display: block; margin: 0 auto;'>" +
          "<div style='margin-top: 12px; font-size: 15px; font-weight: bold; letter-spacing: 0.12em; color: #4B5842;'>" + safePassId + "</div>" +
          "<div style='margin-top: 14px;'>" +
            "<a href='" + safePassUrl + "' target='_blank' style='background: #C5A059; color: #FFFFFF; padding: 10px 20px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 13px; display: inline-block;'>" +
              "🎫 Abrir Link de mi Pase QR" +
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
 * Ejecutar una vez desde el editor o menú para autorizar MailApp + UrlFetchApp y enviar un correo de prueba
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
  var testQr = buildSignedQrPayload("FM-PRUEBA");
  sendConfirmationEmail(ownerEmail, "Invitado de Prueba", testData, "FM-PRUEBA", testUrl, testQr);

  var msg = "✅ ¡Permisos autorizados y e-mail de prueba enviado!\n\n" +
            "Destinatario: " + ownerEmail + "\n" +
            "Cuota diaria restante de Google: " + quota + " e-mails.\n\n" +
            "Recordá publicar una NUEVA VERSIÓN en Implementar > Administrar implementaciones.";
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {}
}

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
            "• Grupos presentes: " + checkedGroups + "\n" +
            "• Personas presentes: " + checkedPeople + " / " + totalPeople;

  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg);
  }
}

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
  var thirteenthCell = sheet.getRange(1, 13).getValue().toString();
  if (firstCell.indexOf("Fecha") !== -1 || firstCell.indexOf("Responsable") !== -1 || firstCell !== "Invitados" || thirteenthCell !== "Presencia / Check-in") {
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

  sheet.setColumnWidth(1, 280);
  sheet.setColumnWidth(2, 160);
  sheet.setColumnWidth(3, 200);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 110);
  sheet.setColumnWidth(6, 110);
  sheet.setColumnWidth(7, 130);
  sheet.setColumnWidth(8, 240);
  sheet.setColumnWidth(9, 200);
  sheet.setColumnWidth(10, 150);
  sheet.setColumnWidth(11, 130);
  sheet.setColumnWidth(12, 260);
  sheet.setColumnWidth(13, 190);
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
