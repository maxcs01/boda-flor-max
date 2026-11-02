// ============================================================
// SISTEMA DE CONFIRMACIÓN DE ASISTENCIA Y REGISTRO (RSVP)
// Boda Flor & Max
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initRsvpSystem();
});

let companionCounter = 0;
let receiptBase64 = null;
let isSubmitting = false;

/**
 * Actualiza el estilo visual de la selección del destinatario de WhatsApp
 */
window.updateRecipientStyle = function() {
  const florRadio = document.querySelector('input[name="whatsappRecipient"][value="flor"]');
  const labelFlor = document.getElementById('labelRecipientFlor');
  const labelMax = document.getElementById('labelRecipientMax');

  if (florRadio && labelFlor && labelMax) {
    if (florRadio.checked) {
      labelFlor.classList.add('active');
      labelMax.classList.remove('active');
    } else {
      labelMax.classList.add('active');
      labelFlor.classList.remove('active');
    }
  }
};

function initRsvpSystem() {
  const companionsContainer = document.getElementById('companionsListContainer');
  const btnAddCompanion = document.getElementById('btnAddCompanion');
  const rsvpForm = document.getElementById('rsvpForm');
  const fileInput = document.getElementById('receiptFileInput');
  const dropzone = document.getElementById('uploadDropzone');

  const respNameInput = document.getElementById('respName');

  if (!rsvpForm) return;

  // Evento cuando cambia el nombre y verificación antiduplicados rigurosa
  if (respNameInput) {
    let checkTimeout = null;
    respNameInput.addEventListener('input', () => {
      updateCalculations();
      clearTimeout(checkTimeout);
      checkTimeout = setTimeout(() => {
        checkTitularDuplicateLive(respNameInput.value.trim());
      }, 600);
    });

    respNameInput.addEventListener('blur', () => {
      checkTitularDuplicateLive(respNameInput.value.trim());
    });
  }

  // Botón para agregar acompañantes adicionales
  if (btnAddCompanion) {
    btnAddCompanion.addEventListener('click', () => {
      addCompanionRow();
    });
  }

  // Manejador del comprobante
  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelect);
  }

  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processReceiptFile(e.dataTransfer.files[0]);
      }
    });
  }

  // Envío del formulario
  rsvpForm.addEventListener('submit', handleFormSubmit);

  // Recalcular montos iniciales (el titular ya inicia como 1 invitado a ser cobrado)
  updateCalculations();
}

/**
 * Agrega una fila para acompañante adicional
 */
function addCompanionRow() {
  const container = document.getElementById('companionsListContainer');
  if (!container) return;

  companionCounter++;
  const rowId = `companion-row-${companionCounter}`;
  const div = document.createElement('div');
  div.className = 'guest-card';
  div.id = rowId;

  const companionNumber = container.children.length + 2; // +1 titular, +1 índice

  div.innerHTML = `
    <div class="guest-card-header">
      <span class="guest-card-number">
        <i class="fas fa-user-friends"></i> Acompañante #${companionNumber}
      </span>
      <button type="button" class="btn-remove-guest" onclick="removeCompanionRow('${rowId}')">
        <i class="fas fa-trash-alt"></i> Quitar
      </button>
    </div>
    
    <div class="form-group" style="margin-bottom: 8px;">
      <input type="text" class="form-control companion-name-input" placeholder="Nombre y Apellido completo" required oninput="updateCalculations()">
      <div class="duplicate-warning-box companion-dup-warning" style="display: none;"></div>
    </div>

    <label class="child-checkbox-wrapper">
      <input type="checkbox" class="companion-is-child" onchange="updateCalculations()">
      <div class="child-checkbox-label">
        <strong>👶 Es menor de 3 años</strong>
        <span>Los menores de 3 años tienen tarjeta sin cargo ($0).</span>
      </div>
    </label>
  `;

  container.appendChild(div);

  // Verificación antiduplicados del acompañante
  const compInput = div.querySelector('.companion-name-input');
  const compWarning = div.querySelector('.companion-dup-warning');
  if (compInput && compWarning) {
    let timer = null;
    const checkCompanion = async () => {
      const val = compInput.value.trim();
      const words = val.split(/\s+/).filter(w => w.length > 0);
      if (words.length < 2) {
        compWarning.style.display = 'none';
        return;
      }
      const scriptUrl = window.WEDDING_CONFIG ? window.WEDDING_CONFIG.googleAppsScriptUrl : "";
      if (!scriptUrl || !scriptUrl.startsWith('http')) return;

      try {
        const res = await fetch(`${scriptUrl}?action=checkName&name=${encodeURIComponent(val)}`);
        const data = await res.json();
        if (data && data.duplicate) {
          compWarning.innerHTML = `⚠️ <strong>«${data.matchedName}»</strong> ya figura confirmado previamente. Su lugar ya está reservado y su tarjeta no debe volver a abonarse.`;
          compWarning.style.display = 'block';
        } else {
          compWarning.style.display = 'none';
        }
      } catch (e) {
        compWarning.style.display = 'none';
      }
    };

    compInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(checkCompanion, 600);
    });
    compInput.addEventListener('blur', checkCompanion);
  }

  renumberCompanions();
  updateCalculations();
}

/**
 * Elimina un acompañante
 */
window.removeCompanionRow = function(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    renumberCompanions();
    updateCalculations();
  }
};

/**
 * Renumera visualmente los acompañantes
 */
function renumberCompanions() {
  const container = document.getElementById('companionsListContainer');
  if (!container) return;

  const cards = container.querySelectorAll('.guest-card');
  cards.forEach((card, idx) => {
    const label = card.querySelector('.guest-card-number');
    if (label) {
      label.innerHTML = `<i class="fas fa-user-friends"></i> Acompañante #${idx + 2}`;
    }
  });
}

/**
 * Actualiza el cálculo en tiempo real:
 * El titular ya cuenta como 1 invitado automáticamente al poner sus datos.
 * Cada acompañante suma al cálculo.
 */
function updateCalculations() {
  // El primer invitado (quien completa los datos) cuenta siempre como 1 persona
  let totalGuests = 1;
  let adults = 1;
  let childrenUnder3 = 0;

  // Acompañantes adicionales
  const container = document.getElementById('companionsListContainer');
  if (container) {
    const cards = container.querySelectorAll('.guest-card');
    cards.forEach(card => {
      totalGuests++;
      const isChild = card.querySelector('.companion-is-child').checked;
      if (isChild) {
        childrenUnder3++;
      } else {
        adults++;
      }
    });
  }

  const pricePerTicket = (window.WEDDING_CONFIG && window.WEDDING_CONFIG.ticketPricePerPerson) || 30000;
  const totalAmount = adults * pricePerTicket;

  // Actualizar elementos en el DOM
  const countTotalEl = document.getElementById('calcTotalGuests');
  const countAdultsEl = document.getElementById('calcAdultsCount');
  const countAdultsPriceEl = document.getElementById('calcAdultsPrice');
  const countChildrenEl = document.getElementById('calcChildrenCount');
  const totalAmountEl = document.getElementById('calcTotalAmount');
  const finalPricePromptEl = document.getElementById('finalPricePrompt');

  if (countTotalEl) countTotalEl.innerText = totalGuests;
  if (countAdultsEl) countAdultsEl.innerText = adults;
  if (countAdultsPriceEl) countAdultsPriceEl.innerText = `$${formatNumber(adults * pricePerTicket)}`;
  if (countChildrenEl) countChildrenEl.innerText = childrenUnder3;
  
  const formattedTotal = `$${formatNumber(totalAmount)}`;
  if (totalAmountEl) totalAmountEl.innerText = formattedTotal;
  if (finalPricePromptEl) {
    finalPricePromptEl.innerText = `Total a transferir: ${formattedTotal} ARS`;
  }

  // Notificación de comprobante
  const receiptRequiredNotice = document.getElementById('receiptRequiredNotice');
  if (receiptRequiredNotice) {
    if (totalAmount === 0 && totalGuests > 0) {
      receiptRequiredNotice.innerText = "(Tarjeta sin cargo para todos los invitados menores de 3 años)";
      receiptRequiredNotice.style.color = "#5A7163";
    } else {
      receiptRequiredNotice.innerText = "* Obligatorio para confirmar la reserva";
      receiptRequiredNotice.style.color = "#9E2A2B";
    }
  }

  return { totalGuests, adults, childrenUnder3, totalAmount, formattedTotal };
}

function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Manejo de la imagen del comprobante
 */
function handleFileSelect(e) {
  if (e.target.files && e.target.files[0]) {
    processReceiptFile(e.target.files[0]);
  }
}

function processReceiptFile(file) {
  if (!file.type || !file.type.match('image.*')) {
    alert("Por favor selecciona una imagen válida (JPG, PNG o WEBP).");
    return;
  }

  // Límite de seguridad: máximo 12 MB
  const maxBytes = 12 * 1024 * 1024;
  if (file.size > maxBytes) {
    alert("La imagen seleccionada supera los 12 MB. Por favor elige una captura más liviana o recortada.");
    return;
  }

  const reader = new FileReader();
  reader.onerror = function() {
    alert("Ocurrió un error al leer el archivo. Por favor intenta seleccionarlo nuevamente.");
  };
  reader.onload = function(e) {
    compressImage(e.target.result, 1200, 0.8, (compressedBase64) => {
      receiptBase64 = compressedBase64;
      showReceiptPreview(compressedBase64, file.name);
    });
  };
  reader.readAsDataURL(file);
}

function showReceiptPreview(src, fileName) {
  const previewContainer = document.getElementById('receiptPreviewContainer');
  const previewImg = document.getElementById('receiptPreviewImg');
  const promptContainer = document.getElementById('uploadPromptContainer');
  const receiptFileName = document.getElementById('receiptFileName');

  if (previewImg && previewContainer) {
    previewImg.src = src;
    previewContainer.style.display = 'block';
  }

  if (promptContainer) promptContainer.style.display = 'none';
  if (receiptFileName) receiptFileName.innerText = fileName || "Comprobante cargado";

  if (window.showToast) {
    window.showToast("Comprobante adjuntado con éxito");
  }
}

window.removeReceipt = function() {
  receiptBase64 = null;
  const fileInput = document.getElementById('receiptFileInput');
  if (fileInput) fileInput.value = '';

  const previewContainer = document.getElementById('receiptPreviewContainer');
  const promptContainer = document.getElementById('uploadPromptContainer');

  if (previewContainer) previewContainer.style.display = 'none';
  if (promptContainer) promptContainer.style.display = 'block';
};

function compressImage(base64Str, maxWidth, quality, callback) {
  const img = new Image();
  img.onerror = () => {
    alert("No se pudo procesar la imagen seleccionada. Por favor intenta con otra foto o formato.");
  };
  img.src = base64Str;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    let width = img.width;
    let height = img.height;

    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    const compressed = canvas.toDataURL('image/jpeg', quality);
    callback(compressed);
  };
}

/**
 * Envío y confirmación
 */
async function handleFormSubmit(e) {
  e.preventDefault();

  if (isSubmitting) return;

  const calc = updateCalculations();
  const respNameInput = document.getElementById('respName');
  const respPhoneInput = document.getElementById('respPhone');
  const respEmailInput = document.getElementById('respEmail');
  const notes = document.getElementById('wishesNotes').value.trim();

  const respName = respNameInput ? respNameInput.value.trim() : "";
  const respPhone = respPhoneInput ? respPhoneInput.value.trim() : "";
  const respEmail = respEmailInput ? respEmailInput.value.trim() : "";

  // Validaciones
  if (!respName || !respPhone) {
    alert("Por favor completa tu nombre y número de teléfono/WhatsApp.");
    if (!respName && respNameInput) respNameInput.focus();
    else if (respPhoneInput) respPhoneInput.focus();
    return;
  }

  if (titularIsDuplicate) {
    alert("Atención: Tu nombre ya figura confirmado en la lista de invitados. No es necesario volver a abonar la tarjeta.");
    return;
  }

  // Lista de todos los invitados (Primero quien completa los datos + acompañantes)
  const guests = [
    { name: respName, isChild: false }
  ];

  const container = document.getElementById('companionsListContainer');
  if (container) {
    const cards = container.querySelectorAll('.guest-card');
    for (let card of cards) {
      const nameInput = card.querySelector('.companion-name-input');
      const name = nameInput.value.trim();
      const isChild = card.querySelector('.companion-is-child').checked;

      if (!name) {
        alert("Por favor escribe el nombre de todos los acompañantes agregados.");
        nameInput.focus();
        return;
      }

      guests.push({ name, isChild });
    }
  }

  // Si el monto es mayor a 0 y no subió comprobante, confirmar
  if (calc.totalAmount > 0 && !receiptBase64) {
    const confirmWithoutReceipt = confirm(
      "Aún no has adjuntado el comprobante de la transferencia.\n\n" +
      "¿Deseas confirmar y enviar el comprobante directamente por WhatsApp a Flor o Max?"
    );
    if (!confirmWithoutReceipt) {
      const dropzone = document.getElementById('uploadDropzone');
      if (dropzone) dropzone.scrollIntoView({ behavior: 'smooth' });
      return;
    }
  }

  // Destinatario de WhatsApp seleccionado (Flor o Max)
  const selectedRecipientRadio = document.querySelector('input[name="whatsappRecipient"]:checked');
  const recipient = selectedRecipientRadio ? selectedRecipientRadio.value : 'flor';

  // Payload para Google Sheets
  const payload = {
    responsibleName: respName,
    phone: respPhone,
    email: respEmail,
    recipient: recipient,
    guests: guests,
    totalGuestsCount: calc.totalGuests,
    adultsCount: calc.adults,
    childrenCount: calc.childrenUnder3,
    ticketPrice: (window.WEDDING_CONFIG && window.WEDDING_CONFIG.ticketPricePerPerson) || 30000,
    totalAmount: calc.totalAmount,
    totalAmountFormatted: calc.formattedTotal,
    notes: notes,
    aliasUsed: (window.WEDDING_CONFIG && window.WEDDING_CONFIG.alias) || "bodaflor.max",
    receiptBase64: receiptBase64 || null
  };

  // Mostrar estado de carga en el botón
  isSubmitting = true;
  const submitBtn = document.getElementById('btnSubmitRsvp');
  const originalBtnHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="spinner"></span> Enviando confirmación...`;

  try {
    const scriptUrl = window.WEDDING_CONFIG ? window.WEDDING_CONFIG.googleAppsScriptUrl : "";

    if (scriptUrl && scriptUrl.startsWith('http')) {
      await fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    }

    // Guardar copia local de respaldo
    const confirmations = JSON.parse(localStorage.getItem('wedding_confirmations') || '[]');
    confirmations.push({ ...payload, timestamp: new Date().toISOString() });
    localStorage.setItem('wedding_confirmations', JSON.stringify(confirmations));

    showSuccessScreen(payload);

  } catch (error) {
    console.warn("Aviso al enviar a Sheets:", error);
    showSuccessScreen(payload);
  } finally {
    isSubmitting = false;
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnHtml;
  }
}

/**
 * Pantalla de confirmación con enlaces a Flor y Max
 */
function showSuccessScreen(data) {
  const formCard = document.getElementById('rsvpFormContainer');
  const successCard = document.getElementById('rsvpSuccessContainer');

  if (formCard) formCard.style.display = 'none';
  if (successCard) successCard.style.display = 'block';

  window.scrollTo({ top: 0, behavior: 'smooth' });

  const summaryGuestsList = document.getElementById('successGuestsList');
  if (summaryGuestsList) {
    summaryGuestsList.innerHTML = data.guests.map((g, i) => `
      <li style="margin-bottom: 6px;">
        <strong>${i + 1}. ${g.name}</strong> 
        ${g.isChild ? '<span style="color: #5A7163; font-size: 0.82rem;">(Menor de 3 años - Sin cargo)</span>' : '<span style="color: #9F7932; font-size: 0.82rem;">($30.000)</span>'}
      </li>
    `).join('');
  }

  const successTotalEl = document.getElementById('successTotalAmount');
  if (successTotalEl) successTotalEl.innerText = data.totalAmountFormatted;

  let msg = `¡Hola Flor y Max! Acabamos de confirmar nuestra asistencia a su casamiento ✨👰🤵\n\n`;
  msg += `👤 *Nombre:* ${data.responsibleName}\n`;
  msg += `📱 *Teléfono:* ${data.phone}\n`;
  msg += `👥 *Total Asistentes:* ${data.totalGuestsCount} (${data.adultsCount} mayores, ${data.childrenCount} menores de 3 años)\n`;
  msg += `📋 *Invitados:* \n`;
  data.guests.forEach((g, idx) => {
    msg += `  ${idx + 1}. ${g.name} ${g.isChild ? '(Menor de 3 años)' : ''}\n`;
  });
  msg += `💰 *Total tarjeta:* ${data.totalAmountFormatted} (Alias: bodaflor.max)\n`;
  if (data.notes) {
    msg += `💌 *Mensaje:* "${data.notes}"\n`;
  }
  msg += `\n¡Estamos muy felices de acompañarlos en su gran día! 🎉❤️`;

  const isMax = data.recipient === 'max';
  const targetPhone = isMax ? '5493415971696' : '5493413404899';
  const targetName = isMax ? 'Max' : 'Flor';
  const directWhatsAppUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}`;

  // Botón directo principal de WhatsApp
  const btnDirectAction = document.getElementById('btnWhatsAppDirectAction');
  const recipientNameDisplay = document.getElementById('recipientNameDisplay');
  if (btnDirectAction) {
    btnDirectAction.href = directWhatsAppUrl;
  }
  if (recipientNameDisplay) {
    recipientNameDisplay.innerText = targetName;
  }

  // Botones secundarios/backup de Flor y Max
  const btnFlor = document.getElementById('btnWhatsAppSuccessFlor');
  const btnMax = document.getElementById('btnWhatsAppSuccessMax');

  if (btnFlor) {
    btnFlor.href = `https://wa.me/5493413404899?text=${encodeURIComponent(msg)}`;
  }
  if (btnMax) {
    btnMax.href = `https://wa.me/5493415971696?text=${encodeURIComponent(msg)}`;
  }

  // APERTURA AUTOMÁTICA DEL WHATSAPP:
  // Redirige directamente al chat para enviar el mensaje con un solo toque
  setTimeout(() => {
    try {
      window.location.href = directWhatsAppUrl;
    } catch (e) {
      console.warn("Redirección automática a WhatsApp prevenida:", e);
    }
  }, 400);
}

/**
 * =========================================================================
 * VERIFICACIÓN EN TIEMPO REAL ANTIDUPLICADOS RIGUROSA (Nombre Y Apellido)
 * =========================================================================
 */
let titularIsDuplicate = false;

async function checkTitularDuplicateLive(fullName) {
  const alertBox = document.getElementById('duplicateAlertTitular');
  const spinner = document.getElementById('titularCheckStatus');
  const submitBtn = document.getElementById('btnSubmitRsvp');

  if (!fullName) {
    if (alertBox) alertBox.style.display = 'none';
    if (spinner) spinner.style.display = 'none';
    titularIsDuplicate = false;
    return;
  }

  // Comprobar que tenga al menos Nombre y Apellido (mínimo 2 palabras)
  const words = fullName.trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length < 2) {
    // Si solo hay 1 palabra (ej: "Juan"), no verificamos aún para evitar falsos positivos
    if (alertBox) alertBox.style.display = 'none';
    if (spinner) spinner.style.display = 'none';
    titularIsDuplicate = false;
    return;
  }

  const scriptUrl = window.WEDDING_CONFIG ? window.WEDDING_CONFIG.googleAppsScriptUrl : "";
  if (!scriptUrl || !scriptUrl.startsWith('http')) return;

  if (spinner) spinner.style.display = 'block';

  try {
    const response = await fetch(`${scriptUrl}?action=checkName&name=${encodeURIComponent(fullName.trim())}`);
    const data = await response.json();

    if (spinner) spinner.style.display = 'none';

    if (data && data.duplicate) {
      titularIsDuplicate = true;
      if (alertBox) {
        alertBox.innerHTML = `
          <strong>⚠️ «${data.matchedName}» ya figura confirmado:</strong>
          <span>Su lugar ya está reservado y su tarjeta no debe volver a abonarse.</span>
          <div style="margin-top: 8px;">
            <a href="https://wa.me/5493413404899?text=${encodeURIComponent('¡Hola Flor! Te escribo porque al poner mi nombre (' + data.matchedName + ') en la invitación me figura que ya fue confirmado...')}" target="_blank" style="color: #25D366; font-weight: bold; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
              <i class="fab fa-whatsapp"></i> Hablar con Flor por WhatsApp ante dudas
            </a>
          </div>
        `;
        alertBox.style.display = 'block';
      }
      if (submitBtn) {
        submitBtn.setAttribute('data-duplicate', 'true');
      }
    } else {
      titularIsDuplicate = false;
      if (alertBox) alertBox.style.display = 'none';
      if (submitBtn) submitBtn.removeAttribute('data-duplicate');
    }
  } catch (err) {
    if (spinner) spinner.style.display = 'none';
    console.warn("No se pudo verificar duplicado en tiempo real:", err);
  }
}
