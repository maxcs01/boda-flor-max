// ============================================================
// SISTEMA DE PORTERÍA Y ESCÁNER QR (recepcion.html)
// Boda Flor & Max
// ============================================================

const STORAGE_KEYS = {
  PIN: 'boda_fm_reception_pin',
  CACHE: 'boda_fm_reception_cache',
  PENDING: 'boda_fm_reception_pending'
};

let currentPin = '';
let passesList = [];
let currentFilter = 'all';
let html5QrScanner = null;
let isCameraActive = false;
let isHandlingScan = false;
let activePassInModal = null;

document.addEventListener('DOMContentLoaded', () => {
  initReceptionApp();
});

function initReceptionApp() {
  const loginForm = document.getElementById('receptionLoginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handlePinLogin);
  }

  const searchInput = document.getElementById('receptionSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderGuestDirectory());
  }

  const manualCodeForm = document.getElementById('manualCodeForm');
  if (manualCodeForm) {
    manualCodeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('manualCodeInput');
      const code = window.PassUtils.extractPassIdFromScan(input ? input.value : '');
      if (code) {
        if (input) input.value = '';
        handleCodeDetected(code);
      }
    });
  }

  window.addEventListener('online', () => syncPendingCheckins());

  // Restaurar sesión si ya ingresó el PIN previamente
  const savedPin = sessionStorage.getItem(STORAGE_KEYS.PIN) || localStorage.getItem(STORAGE_KEYS.PIN);
  if (savedPin) {
    currentPin = savedPin;
    loadCachedData();
    showDashboard();
    refreshReceptionData(true);
  }
}

/**
 * Autenticación contra el servidor (Google Apps Script) usando el PIN de portería
 */
async function handlePinLogin(e) {
  e.preventDefault();
  const pinInput = document.getElementById('receptionPinInput');
  const errorEl = document.getElementById('pinErrorText');
  const btn = document.getElementById('btnPinSubmit');

  const pin = pinInput ? pinInput.value.trim() : '';
  if (!pin) {
    if (errorEl) {
      errorEl.innerText = 'Ingresá el código numérico de portería.';
      errorEl.style.display = 'block';
    }
    return;
  }

  const scriptUrl = window.WEDDING_CONFIG ? window.WEDDING_CONFIG.googleAppsScriptUrl : '';
  if (!scriptUrl) {
    alert('Falta configurar googleAppsScriptUrl en config.js');
    return;
  }

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Verificando...';
  if (errorEl) errorEl.style.display = 'none';

  try {
    const res = await fetch(`${scriptUrl}?action=getReceptionList&pin=${encodeURIComponent(pin)}`);
    const data = await res.json();

    if (data && data.status === 'unauthorized') {
      if (errorEl) {
        errorEl.innerText = 'PIN incorrecto. Verificá el código con los novios.';
        errorEl.style.display = 'block';
      }
      return;
    }

    if (data && data.status === 'success') {
      currentPin = pin;
      sessionStorage.setItem(STORAGE_KEYS.PIN, pin);
      localStorage.setItem(STORAGE_KEYS.PIN, pin);

      passesList = Array.isArray(data.passes) ? data.passes : [];
      saveCache();
      showDashboard();
      renderDashboard();
    } else {
      throw new Error((data && data.message) || 'Respuesta inválida del servidor.');
    }
  } catch (err) {
    if (errorEl) {
      errorEl.innerText = 'No se pudo conectar con Google Sheets para validar el PIN. Revisá tu conexión.';
      errorEl.style.display = 'block';
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

window.logoutReception = function() {
  stopQrCamera();
  currentPin = '';
  sessionStorage.removeItem(STORAGE_KEYS.PIN);
  localStorage.removeItem(STORAGE_KEYS.PIN);
  const loginSec = document.getElementById('receptionLoginSection');
  const dashSec = document.getElementById('receptionDashboardSection');
  if (dashSec) dashSec.style.display = 'none';
  if (loginSec) loginSec.style.display = 'block';
  const pinInput = document.getElementById('receptionPinInput');
  if (pinInput) pinInput.value = '';
};

function showDashboard() {
  const loginSec = document.getElementById('receptionLoginSection');
  const dashSec = document.getElementById('receptionDashboardSection');
  if (loginSec) loginSec.style.display = 'none';
  if (dashSec) dashSec.style.display = 'block';
  renderDashboard();
}

function loadCachedData() {
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEYS.CACHE) || 'null');
    if (cached && Array.isArray(cached.passes)) {
      passesList = cached.passes;
    }
  } catch (e) {}
}

function saveCache() {
  try {
    localStorage.setItem(STORAGE_KEYS.CACHE, JSON.stringify({
      passes: passesList,
      updatedAt: new Date().toISOString()
    }));
  } catch (e) {}
}

/**
 * Descarga la lista actualizada de confirmados e ingresos desde Google Sheets
 */
window.refreshReceptionData = async function(silent) {
  const scriptUrl = window.WEDDING_CONFIG ? window.WEDDING_CONFIG.googleAppsScriptUrl : '';
  if (!scriptUrl || !currentPin) return;

  const syncBadge = document.getElementById('syncStatusLabel');
  if (syncBadge) {
    syncBadge.innerHTML = '<i class="fas fa-sync fa-spin"></i> Actualizando lista...';
  }

  try {
    await syncPendingCheckins();

    const res = await fetch(`${scriptUrl}?action=getReceptionList&pin=${encodeURIComponent(currentPin)}`);
    const data = await res.json();

    if (data && data.status === 'unauthorized') {
      logoutReception();
      return;
    }

    if (data && data.status === 'success' && Array.isArray(data.passes)) {
      passesList = mergeWithPendingLocal(data.passes);
      saveCache();
      renderDashboard();
      if (syncBadge) {
        const nowStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        syncBadge.innerHTML = `<i class="fas fa-check-circle" style="color: #2E7D32;"></i> Sincronizado (${nowStr} hs)`;
      }
      if (!silent && window.showToast) {
        window.showToast('Lista de invitados actualizada');
      }
    }
  } catch (err) {
    if (syncBadge) {
      syncBadge.innerHTML = '<i class="fas fa-wifi" style="color: #D97706;"></i> Modo Offline (usando copia local)';
    }
  }
};

function getPendingQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING) || '[]');
  } catch (e) {
    return [];
  }
}

function setPendingQueue(queue) {
  localStorage.setItem(STORAGE_KEYS.PENDING, JSON.stringify(queue));
  renderPendingBanner();
}

function mergeWithPendingLocal(serverPasses) {
  const pending = getPendingQueue();
  if (pending.length === 0) return serverPasses;

  const pendingMap = {};
  pending.forEach(item => { pendingMap[item.passId] = item; });

  return serverPasses.map(p => {
    const pend = pendingMap[p.id];
    if (pend && !pend.undo && !p.checkedIn) {
      return { ...p, checkedIn: true, checkIn: pend.label || 'Ingresado (Pendiente sync)' };
    }
    return p;
  });
}

async function syncPendingCheckins() {
  const queue = getPendingQueue();
  if (queue.length === 0 || !navigator.onLine) {
    renderPendingBanner();
    return;
  }

  const scriptUrl = window.WEDDING_CONFIG ? window.WEDDING_CONFIG.googleAppsScriptUrl : '';
  if (!scriptUrl) return;

  const remaining = [];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      const res = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'checkin',
          pin: currentPin,
          passId: item.passId,
          undo: Boolean(item.undo)
        })
      });
      const json = await res.json();
      if (!json || (json.status !== 'success' && json.status !== 'already_checked_in')) {
        remaining.push(item);
      }
    } catch (e) {
      remaining.push(item);
    }
  }
  setPendingQueue(remaining);
}

function renderPendingBanner() {
  const banner = document.getElementById('pendingSyncBanner');
  const queue = getPendingQueue();
  if (!banner) return;

  if (queue.length > 0) {
    banner.style.display = 'flex';
    banner.querySelector('span').innerText = `${queue.length} ingreso(s) pendientes de subir a la planilla.`;
  } else {
    banner.style.display = 'none';
  }
}

/**
 * Actualiza estadísticas y listado alfabético de portería
 */
function renderDashboard() {
  let totalPeople = 0;
  let checkedPeople = 0;
  let checkedGroups = 0;

  passesList.forEach(p => {
    const count = p.totalGuests || 1;
    totalPeople += count;
    if (p.checkedIn) {
      checkedPeople += count;
      checkedGroups++;
    }
  });

  const peopleCountEl = document.getElementById('statPeopleCount');
  const groupsCountEl = document.getElementById('statGroupsCount');
  const progressBarEl = document.getElementById('statProgressFill');

  if (peopleCountEl) peopleCountEl.innerText = `${checkedPeople} / ${totalPeople}`;
  if (groupsCountEl) groupsCountEl.innerText = `${checkedGroups} / ${passesList.length} grupos`;
  if (progressBarEl) {
    const pct = totalPeople > 0 ? Math.round((checkedPeople / totalPeople) * 100) : 0;
    progressBarEl.style.width = `${pct}%`;
  }

  renderPendingBanner();
  renderGuestDirectory();
}

/**
 * Cambia entre modo Cámara Escáner y Lista Alfabética Manual
 */
window.switchReceptionTab = function(tab) {
  const camTabBtn = document.getElementById('tabBtnCamera');
  const listTabBtn = document.getElementById('tabBtnList');
  const camPanel = document.getElementById('panelCamera');
  const listPanel = document.getElementById('panelList');

  if (tab === 'camera') {
    if (camTabBtn) camTabBtn.classList.add('active');
    if (listTabBtn) listTabBtn.classList.remove('active');
    if (camPanel) camPanel.style.display = 'block';
    if (listPanel) listPanel.style.display = 'none';
  } else {
    if (listTabBtn) listTabBtn.classList.add('active');
    if (camTabBtn) camTabBtn.classList.remove('active');
    if (listPanel) listPanel.style.display = 'block';
    if (camPanel) camPanel.style.display = 'none';
    stopQrCamera();
    renderGuestDirectory();
  }
};

window.setDirectoryFilter = function(filter, btnEl) {
  currentFilter = filter;
  document.querySelectorAll('.filter-pill-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  renderGuestDirectory();
};

function renderGuestDirectory() {
  const container = document.getElementById('receptionGuestList');
  if (!container) return;

  const query = (document.getElementById('receptionSearchInput')?.value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const sorted = [...passesList].sort((a, b) =>
    (a.titularName || '').localeCompare(b.titularName || '', 'es', { sensitivity: 'base' })
  );

  const filtered = sorted.filter(p => {
    if (currentFilter === 'pending' && p.checkedIn) return false;
    if (currentFilter === 'entered' && !p.checkedIn) return false;

    if (!query) return true;

    const hayTitular = normalizeText(p.titularName).includes(query);
    const hayCode = (p.id || '').toLowerCase().includes(query);
    const hayComp = (p.companions || []).some(c => normalizeText(c.name).includes(query));
    return hayTitular || hayCode || hayComp;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-directory-msg">No se encontraron invitados para esa búsqueda.</div>`;
    return;
  }

  const escape = window.PassUtils.escapeHtml;
  container.innerHTML = filtered.map(p => {
    const compNames = (p.companions || []).map(c => escape(c.name) + (c.isChild ? ' (Menor)' : '')).join(', ');
    const statusBadge = p.checkedIn
      ? `<span class="dir-badge dir-badge-in"><i class="fas fa-check-double"></i> ${escape(p.checkIn)}</span>`
      : `<span class="dir-badge dir-badge-pending">Pendiente</span>`;

    return `
      <button type="button" class="directory-guest-row ${p.checkedIn ? 'row-entered' : ''}" onclick="openPassModalById('${escape(p.id)}')">
        <div class="dir-row-main">
          <div class="dir-titular-name">${escape(p.titularName)}</div>
          <div class="dir-meta">
            <span><i class="fas fa-users"></i> ${p.totalGuests} ${p.totalGuests === 1 ? 'persona' : 'personas'}</span>
            ${p.id ? `<span class="dir-code">${escape(p.id)}</span>` : ''}
          </div>
          ${compNames ? `<div class="dir-companions">↳ ${compNames}</div>` : ''}
        </div>
        <div class="dir-row-status">${statusBadge}</div>
      </button>
    `;
  }).join('');
}

function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Control de Cámara QR con Html5Qrcode
 */
window.toggleQrCamera = async function() {
  if (isCameraActive) {
    await stopQrCamera();
  } else {
    await startQrCamera();
  }
};

async function startQrCamera() {
  const btn = document.getElementById('btnToggleCamera');
  const statusEl = document.getElementById('cameraStatusNote');

  if (typeof window.Html5Qrcode !== 'function') {
    alert('La librería del escáner aún no cargó. Recargá la página.');
    return;
  }

  try {
    if (!html5QrScanner) {
      html5QrScanner = new window.Html5Qrcode('qrReaderContainer');
    }

    if (statusEl) statusEl.innerText = 'Iniciando cámara trasera...';

    await html5QrScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (decodedText) => {
        if (isHandlingScan) return;
        const passId = window.PassUtils.extractPassIdFromScan(decodedText);
        if (passId) {
          handleCodeDetected(passId);
        }
      },
      () => {
        // Ignoramos errores frame a frame cuando no hay QR enfocado
      }
    );

    isCameraActive = true;
    if (btn) {
      btn.innerHTML = '<i class="fas fa-video-slash"></i> Pausar Cámara';
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-secondary');
    }
    if (statusEl) statusEl.innerText = 'Apuntá la cámara al código QR del invitado';
  } catch (err) {
    isCameraActive = false;
    if (statusEl) {
      statusEl.innerText = 'No se pudo abrir la cámara. Verificá los permisos del navegador o usá la búsqueda por lista.';
    }
  }
}

async function stopQrCamera() {
  const btn = document.getElementById('btnToggleCamera');
  const statusEl = document.getElementById('cameraStatusNote');

  if (html5QrScanner && isCameraActive) {
    try {
      await html5QrScanner.stop();
    } catch (e) {}
  }
  isCameraActive = false;

  if (btn) {
    btn.innerHTML = '<i class="fas fa-camera"></i> Activar Cámara Escáner';
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-secondary');
  }
  if (statusEl) statusEl.innerText = 'Cámara en pausa';
}

function playBeepSound(success) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(success ? 880 : 320, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) {}
}

/**
 * Procesa el código escaneado o ingresado manualmente
 */
async function handleCodeDetected(passId) {
  isHandlingScan = true;
  if (navigator.vibrate) navigator.vibrate(120);

  if (html5QrScanner && isCameraActive) {
    try { html5QrScanner.pause(true); } catch (e) {}
  }

  // Buscar primero en el cache local para respuesta instantánea (0.1s)
  let foundPass = passesList.find(p => (p.id || '').toUpperCase() === passId.toUpperCase());

  // Si no está en cache local y hay internet, consultar directo al servidor por si confirmó recién
  if (!foundPass && navigator.onLine) {
    const scriptUrl = window.WEDDING_CONFIG ? window.WEDDING_CONFIG.googleAppsScriptUrl : '';
    if (scriptUrl) {
      try {
        const res = await fetch(`${scriptUrl}?action=getPass&id=${encodeURIComponent(passId)}`);
        const data = await res.json();
        if (data && data.found && data.pass) {
          foundPass = data.pass;
          passesList.push(foundPass);
          saveCache();
        }
      } catch (e) {}
    }
  }

  playBeepSound(Boolean(foundPass && !foundPass.checkedIn));
  showScanResultModal(foundPass, passId);
}

window.openPassModalById = function(passId) {
  const pass = passesList.find(p => p.id === passId);
  if (pass) {
    isHandlingScan = true;
    showScanResultModal(pass, passId);
  }
};

function showScanResultModal(pass, scannedCode) {
  const modal = document.getElementById('scanResultModal');
  const headerBanner = document.getElementById('modalStatusBanner');
  const titularEl = document.getElementById('modalTitularName');
  const totalEl = document.getElementById('modalTotalBadge');
  const compContainer = document.getElementById('modalCompanionsContainer');
  const codeEl = document.getElementById('modalPassCode');
  const actionsBox = document.getElementById('modalActionArea');

  activePassInModal = pass || null;
  if (!modal) return;
  modal.style.display = 'flex';

  const escape = window.PassUtils.escapeHtml;

  if (!pass) {
    headerBanner.className = 'modal-status-banner banner-invalid';
    headerBanner.innerHTML = '<i class="fas fa-times-circle"></i> PASE NO ENCONTRADO';
    titularEl.innerText = 'Código desconocido';
    totalEl.innerText = '0 personas';
    compContainer.innerHTML = `<p style="color: #721C24; font-size: 0.9rem;">No hay ningún invitado registrado con el código <strong>${escape(scannedCode)}</strong>.</p>`;
    codeEl.innerText = scannedCode || '--';
    actionsBox.innerHTML = `
      <button type="button" class="btn btn-secondary btn-block" onclick="closeScanModal()">
        <i class="fas fa-redo"></i> Volver a intentar
      </button>
    `;
    return;
  }

  titularEl.innerText = pass.titularName;
  const count = pass.totalGuests || 1;
  totalEl.innerText = `${count} ${count === 1 ? 'PERSONA' : 'PERSONAS'}`;
  compContainer.innerHTML = window.PassUtils.renderCompanionsListHtml(pass.companions || []);
  codeEl.innerText = pass.id;

  if (pass.checkedIn) {
    headerBanner.className = 'modal-status-banner banner-warning';
    headerBanner.innerHTML = `<i class="fas fa-exclamation-triangle"></i> YA INGRESÓ (${escape(pass.checkIn)})`;
    actionsBox.innerHTML = `
      <button type="button" class="btn btn-primary btn-block" onclick="closeScanModal()">
        <i class="fas fa-arrow-right"></i> Cerrar / Siguiente
      </button>
      <button type="button" class="btn-undo-checkin" onclick="submitCheckinAction(true)">
        <i class="fas fa-undo"></i> Deshacer registro de ingreso
      </button>
    `;
  } else {
    headerBanner.className = 'modal-status-banner banner-valid';
    headerBanner.innerHTML = '<i class="fas fa-check-circle"></i> ACCESO AUTORIZADO';
    actionsBox.innerHTML = `
      <button type="button" id="btnConfirmCheckin" class="btn btn-block btn-confirm-entry" onclick="submitCheckinAction(false)">
        <i class="fas fa-check"></i> CONFIRMAR INGRESO (${count} ${count === 1 ? 'persona' : 'personas'})
      </button>
      <button type="button" class="btn btn-secondary btn-block" style="margin-top: 10px;" onclick="closeScanModal()">
        Cancelar
      </button>
    `;
  }
}

window.closeScanModal = function() {
  const modal = document.getElementById('scanResultModal');
  if (modal) modal.style.display = 'none';
  activePassInModal = null;
  isHandlingScan = false;

  if (html5QrScanner && isCameraActive) {
    try { html5QrScanner.resume(); } catch (e) {}
  }
};

/**
 * Confirma o revierte el ingreso contra Google Sheets (con soporte de cola offline)
 */
window.submitCheckinAction = async function(isUndo) {
  if (!activePassInModal) return;

  const pass = activePassInModal;
  const btn = document.getElementById('btnConfirmCheckin');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Registrando...';
  }

  const nowLabel = 'Ingresado - ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs';

  const scriptUrl = window.WEDDING_CONFIG ? window.WEDDING_CONFIG.googleAppsScriptUrl : '';
  let syncedOk = false;

  if (scriptUrl && navigator.onLine) {
    try {
      const res = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'checkin',
          pin: currentPin,
          passId: pass.id,
          undo: Boolean(isUndo)
        })
      });
      const json = await res.json();
      if (json && json.status === 'unauthorized') {
        alert('PIN inválido. Volvé a iniciar sesión en portería.');
        logoutReception();
        return;
      }
      if (json && (json.status === 'success' || json.status === 'already_checked_in')) {
        syncedOk = true;
        if (json.pass) {
          pass.checkedIn = Boolean(json.pass.checkedIn);
          pass.checkIn = json.pass.checkIn || '';
        }
      }
    } catch (e) {
      syncedOk = false;
    }
  }

  if (!syncedOk) {
    // Guardar localmente para sincronizar luego sin frenar la fila en la puerta
    pass.checkedIn = !isUndo;
    pass.checkIn = isUndo ? '' : `${nowLabel} (Local)`;
    const queue = getPendingQueue().filter(item => item.passId !== pass.id);
    queue.push({ passId: pass.id, undo: Boolean(isUndo), label: pass.checkIn });
    setPendingQueue(queue);
  }

  saveCache();
  renderDashboard();

  if (window.showToast) {
    window.showToast(isUndo ? 'Ingreso revertido' : `¡Ingreso confirmado para ${pass.titularName}!`);
  }

  closeScanModal();
};
