// ============================================================
// APP VALIDADOR DE PORTERÍA Y CHECK-IN AUTOMÁTICO (recepcion.html)
// Boda Flor & Max — Uso Exclusivo (1 Dispositivo Activo por Vez)
// ============================================================

const STORAGE_KEYS = {
  PIN: 'boda_fm_reception_pin',
  TOKEN: 'boda_fm_reception_token',
  CACHE: 'boda_fm_reception_cache',
  PENDING: 'boda_fm_reception_pending'
};

let currentPin = '';
let currentSessionToken = '';
let passesList = [];
let currentFilter = 'all';
let html5QrScanner = null;
let isCameraActive = false;
let isHandlingScan = false;
let activePassInModal = null;
let deferredInstallPrompt = null;

document.addEventListener('DOMContentLoaded', () => {
  initPwaSupport();
  initReceptionApp();
});

/**
 * Registra el Service Worker y habilita el aviso para instalar el App Validador en el celular
 */
function initPwaSupport() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('/sw-validador.js').catch(() => {});
  }

  const banner = document.getElementById('pwaInstallBanner');
  const btnInstall = document.getElementById('btnPwaInstall');
  const subtitle = document.getElementById('pwaInstallSubtitle');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (isStandalone) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (banner) banner.style.display = 'flex';
    if (btnInstall) {
      btnInstall.style.display = 'inline-block';
      btnInstall.onclick = async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice && choice.outcome === 'accepted' && banner) {
          banner.style.display = 'none';
        }
        deferredInstallPrompt = null;
      };
    }
  });

  // Guía discreta para iPhone / iPad Safari
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIos && banner && subtitle) {
    subtitle.innerHTML = 'En iPhone: tocá <strong>Compartir</strong> y elegí <strong>"Agregar a inicio"</strong> para instalar el App.';
    banner.style.display = 'flex';
  }
}

function initReceptionApp() {
  const loginForm = document.getElementById('receptionLoginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const pin = (document.getElementById('receptionPinInput')?.value || '').trim();
      attemptReceptionLogin(pin, false);
    });
  }

  const btnForceTakeover = document.getElementById('btnForceTakeover');
  if (btnForceTakeover) {
    btnForceTakeover.addEventListener('click', () => {
      const pin = (document.getElementById('receptionPinInput')?.value || '').trim();
      if (confirm('¿Transferir el acceso de validación a este celular?\nEl dispositivo anterior quedará desconectado.')) {
        attemptReceptionLogin(pin, true);
      }
    });
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
      const raw = input ? input.value.trim() : '';
      if (!raw) return;
      if (input) input.value = '';
      const parsed = window.PassUtils.parseScannedQr(raw);
      handleManualOrScannedCode(parsed.passId, parsed.qrRaw, false);
    });
  }

  window.addEventListener('online', () => syncPendingCheckins());

  // Restaurar sesión previa en el mismo dispositivo
  const savedPin = localStorage.getItem(STORAGE_KEYS.PIN) || sessionStorage.getItem(STORAGE_KEYS.PIN);
  const savedToken = localStorage.getItem(STORAGE_KEYS.TOKEN) || sessionStorage.getItem(STORAGE_KEYS.TOKEN);
  if (savedPin && savedToken) {
    currentPin = savedPin;
    currentSessionToken = savedToken;
    loadCachedData();
    showDashboard();
    refreshReceptionData(true);
  }
}

function getDeviceShortLabel() {
  const ua = navigator.userAgent || '';
  if (/iPhone/i.test(ua)) return 'iPhone Recepción';
  if (/Android/i.test(ua)) return 'Android Recepción';
  return 'Navegador Recepción';
}

/**
 * Autenticación contra el servidor (PIN + Bloqueo de Dispositivo Único)
 */
async function attemptReceptionLogin(pin, forceTakeover) {
  const errorEl = document.getElementById('pinErrorText');
  const lockedBox = document.getElementById('sessionLockedBox');
  const lockedMsg = document.getElementById('sessionLockedMsg');
  const btn = document.getElementById('btnPinSubmit');

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
  btn.innerHTML = '<span class="spinner"></span> Validando acceso...';
  if (errorEl) errorEl.style.display = 'none';
  if (lockedBox) lockedBox.style.display = 'none';

  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'loginReception',
        pin: pin,
        existingToken: currentSessionToken || localStorage.getItem(STORAGE_KEYS.TOKEN) || '',
        forceTakeover: Boolean(forceTakeover),
        deviceLabel: getDeviceShortLabel()
      })
    });
    const data = await res.json();

    if (data && data.status === 'unauthorized') {
      if (errorEl) {
        errorEl.innerText = 'PIN incorrecto. Verificá el código con los novios.';
        errorEl.style.display = 'block';
      }
      return;
    }

    if (data && data.status === 'session_locked') {
      if (lockedBox && lockedMsg) {
        lockedMsg.innerText = data.message || 'Ya hay otro dispositivo conectado validando en la puerta.';
        lockedBox.style.display = 'block';
      }
      return;
    }

    if (data && data.status === 'success' && data.sessionToken) {
      currentPin = pin;
      currentSessionToken = data.sessionToken;
      localStorage.setItem(STORAGE_KEYS.PIN, pin);
      localStorage.setItem(STORAGE_KEYS.TOKEN, data.sessionToken);
      sessionStorage.setItem(STORAGE_KEYS.PIN, pin);
      sessionStorage.setItem(STORAGE_KEYS.TOKEN, data.sessionToken);

      passesList = Array.isArray(data.passes) ? data.passes : [];
      saveCache();
      showDashboard();
      renderDashboard();
    } else {
      throw new Error((data && data.message) || 'Respuesta inválida del servidor.');
    }
  } catch (err) {
    if (errorEl) {
      errorEl.innerText = 'No se pudo conectar con Google Sheets para validar el acceso. Verificá tu conexión.';
      errorEl.style.display = 'block';
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

window.logoutReception = async function(revokedReason) {
  await stopQrCamera();

  const scriptUrl = window.WEDDING_CONFIG ? window.WEDDING_CONFIG.googleAppsScriptUrl : '';
  if (scriptUrl && currentPin && currentSessionToken && !revokedReason && navigator.onLine) {
    try {
      await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'logoutReception',
          pin: currentPin,
          sessionToken: currentSessionToken
        })
      });
    } catch (e) {}
  }

  currentPin = '';
  currentSessionToken = '';
  localStorage.removeItem(STORAGE_KEYS.PIN);
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  sessionStorage.removeItem(STORAGE_KEYS.PIN);
  sessionStorage.removeItem(STORAGE_KEYS.TOKEN);

  const loginSec = document.getElementById('receptionLoginSection');
  const dashSec = document.getElementById('receptionDashboardSection');
  const lockedBox = document.getElementById('sessionLockedBox');
  const errorEl = document.getElementById('pinErrorText');
  if (dashSec) dashSec.style.display = 'none';
  if (loginSec) loginSec.style.display = 'block';
  if (lockedBox) lockedBox.style.display = 'none';

  const pinInput = document.getElementById('receptionPinInput');
  if (pinInput) pinInput.value = '';

  if (revokedReason && errorEl) {
    errorEl.innerText = revokedReason;
    errorEl.style.display = 'block';
  }
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

window.refreshReceptionData = async function(silent) {
  const scriptUrl = window.WEDDING_CONFIG ? window.WEDDING_CONFIG.googleAppsScriptUrl : '';
  if (!scriptUrl || !currentPin) return;

  const syncBadge = document.getElementById('syncStatusLabel');
  if (syncBadge) {
    syncBadge.innerHTML = '<i class="fas fa-sync fa-spin"></i> Actualizando lista...';
  }

  try {
    await syncPendingCheckins();

    const url = `${scriptUrl}?action=getReceptionList&pin=${encodeURIComponent(currentPin)}&sessionToken=${encodeURIComponent(currentSessionToken)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data && (data.status === 'unauthorized' || data.status === 'session_revoked')) {
      logoutReception(data.message || 'Sesión cerrada.');
      return;
    }

    if (data && data.status === 'success' && Array.isArray(data.passes)) {
      passesList = mergeWithPendingLocal(data.passes);
      saveCache();
      renderDashboard();
      if (syncBadge) {
        const nowStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        syncBadge.innerHTML = `<i class="fas fa-shield-alt" style="color: #A5D6A7;"></i> Sesión única activa &bull; Sync ${nowStr} hs`;
      }
      if (!silent && window.showToast) {
        window.showToast('Lista de invitados actualizada');
      }
    }
  } catch (err) {
    if (syncBadge) {
      syncBadge.innerHTML = '<i class="fas fa-wifi" style="color: #FCD34D;"></i> Modo Offline (copia local activa)';
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
      return { ...p, checkedIn: true, checkIn: pend.label || 'Presente (Pendiente sync)' };
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
          sessionToken: currentSessionToken,
          passId: item.passId,
          qrRaw: item.qrRaw || '',
          undo: Boolean(item.undo)
        })
      });
      const json = await res.json();
      if (json && (json.status === 'unauthorized' || json.status === 'session_revoked')) {
        logoutReception(json.message || 'Sesión cerrada.');
        return;
      }
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
    banner.querySelector('span').innerText = `${queue.length} presente(s) pendientes de subir a la planilla.`;
  } else {
    banner.style.display = 'none';
  }
}

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

  const query = normalizeText(document.getElementById('receptionSearchInput')?.value || '').trim();

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
      : `<span class="dir-badge dir-badge-pending">Falta llegar</span>`;

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
        isHandlingScan = true;
        const parsed = window.PassUtils.parseScannedQr(decodedText);
        if (!parsed.isOfficialToken) {
          playBeepSound(false);
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          if (html5QrScanner && isCameraActive) {
            try { html5QrScanner.pause(true); } catch (e) {}
          }
          showInvalidQrModal(decodedText);
          return;
        }
        handleManualOrScannedCode(parsed.passId, parsed.qrRaw, true);
      },
      () => {}
    );

    isCameraActive = true;
    if (btn) {
      btn.innerHTML = '<i class="fas fa-video-slash"></i> Pausar Cámara';
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-secondary');
    }
    if (statusEl) {
      statusEl.innerHTML = 'Apuntá al código QR: <strong>marca Presente automáticamente</strong> al detectar.';
    }
  } catch (err) {
    isCameraActive = false;
    if (statusEl) {
      statusEl.innerText = 'No se pudo abrir la cámara. Verificá los permisos o usá la lista manual.';
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
    osc.frequency.setValueAtTime(success ? 880 : 300, ctx.currentTime);
    gain.gain.setValueAtTime(0.16, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch (e) {}
}

/**
 * Procesa el QR escaneado (autoPresent = true) o código buscado manualmente (autoPresent = false)
 */
async function handleManualOrScannedCode(passId, qrRaw, autoPresent) {
  isHandlingScan = true;
  if (navigator.vibrate) navigator.vibrate(120);

  if (html5QrScanner && isCameraActive) {
    try { html5QrScanner.pause(true); } catch (e) {}
  }

  let foundPass = passesList.find(p => (p.id || '').toUpperCase() === (passId || '').toUpperCase());

  if (!foundPass && navigator.onLine && passId) {
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

  if (!foundPass) {
    showNotFoundModal(passId);
    return;
  }

  showPassResultModal(foundPass, autoPresent, qrRaw);
}

window.openPassModalById = function(passId) {
  const pass = passesList.find(p => (p.id || '').toUpperCase() === (passId || '').toUpperCase());
  if (pass) {
    isHandlingScan = true;
    showPassResultModal(pass, false, pass.qrPayload || '');
  }
};

function showInvalidQrModal(rawText) {
  const modal = document.getElementById('scanResultModal');
  const headerBanner = document.getElementById('modalStatusBanner');
  const titularEl = document.getElementById('modalTitularName');
  const totalEl = document.getElementById('modalTotalBadge');
  const compContainer = document.getElementById('modalCompanionsContainer');
  const codeEl = document.getElementById('modalPassCode');
  const actionsBox = document.getElementById('modalActionArea');

  if (!modal) return;
  modal.style.display = 'flex';
  headerBanner.className = 'modal-status-banner banner-invalid';
  headerBanner.innerHTML = '<i class="fas fa-ban"></i> QR NO VÁLIDO';
  titularEl.innerText = 'Código no reconocido';
  totalEl.innerText = '0 personas';
  compContainer.innerHTML = '<p style="color: #721C24; font-size: 0.9rem;">Este código QR no corresponde a un pase oficial de la boda Flor & Max.</p>';
  codeEl.innerText = (rawText || '--').slice(0, 28);
  actionsBox.innerHTML = `
    <button type="button" class="btn btn-secondary btn-block" onclick="closeScanModal()">
      <i class="fas fa-redo"></i> Escanear otro QR
    </button>
  `;
}

function showNotFoundModal(passId) {
  const modal = document.getElementById('scanResultModal');
  const headerBanner = document.getElementById('modalStatusBanner');
  const titularEl = document.getElementById('modalTitularName');
  const totalEl = document.getElementById('modalTotalBadge');
  const compContainer = document.getElementById('modalCompanionsContainer');
  const codeEl = document.getElementById('modalPassCode');
  const actionsBox = document.getElementById('modalActionArea');

  if (!modal) return;
  modal.style.display = 'flex';
  const escape = window.PassUtils.escapeHtml;
  headerBanner.className = 'modal-status-banner banner-invalid';
  headerBanner.innerHTML = '<i class="fas fa-times-circle"></i> PASE NO ENCONTRADO';
  titularEl.innerText = 'No figura en la lista';
  totalEl.innerText = '0 personas';
  compContainer.innerHTML = `<p style="color: #721C24; font-size: 0.9rem;">No hay ningún invitado registrado con el código <strong>${escape(passId)}</strong>.</p>`;
  codeEl.innerText = passId || '--';
  actionsBox.innerHTML = `
    <button type="button" class="btn btn-secondary btn-block" onclick="closeScanModal()">
      <i class="fas fa-redo"></i> Volver a intentar
    </button>
  `;
}

function showPassResultModal(pass, autoPresent, qrRaw) {
  const modal = document.getElementById('scanResultModal');
  const headerBanner = document.getElementById('modalStatusBanner');
  const titularEl = document.getElementById('modalTitularName');
  const totalEl = document.getElementById('modalTotalBadge');
  const compContainer = document.getElementById('modalCompanionsContainer');
  const codeEl = document.getElementById('modalPassCode');
  const actionsBox = document.getElementById('modalActionArea');

  activePassInModal = pass;
  if (!modal) return;
  modal.style.display = 'flex';

  const escape = window.PassUtils.escapeHtml;
  titularEl.innerText = pass.titularName;
  const count = pass.totalGuests || 1;
  totalEl.innerText = `${count} ${count === 1 ? 'PERSONA' : 'PERSONAS'}`;
  compContainer.innerHTML = window.PassUtils.renderCompanionsListHtml(pass.companions || []);
  codeEl.innerText = pass.id;

  // Caso 1: Ya estaba marcado como Presente anteriormente (protección contra doble uso)
  if (pass.checkedIn) {
    headerBanner.className = 'modal-status-banner banner-warning';
    headerBanner.innerHTML = `<i class="fas fa-exclamation-triangle"></i> YA REGISTRADO (${escape(pass.checkIn)})`;
    actionsBox.innerHTML = `
      <button type="button" class="btn btn-primary btn-block" onclick="closeScanModal()">
        <i class="fas fa-qrcode"></i> Escanear Siguiente
      </button>
      <button type="button" class="btn-undo-checkin" onclick="submitCheckinAction(true, '')">
        <i class="fas fa-undo"></i> Quitar marca de presente (por error)
      </button>
    `;
    return;
  }

  // Caso 2: Escaneado con la cámara QR -> Registro AUTOMÁTICO en Excel/Google Sheets
  if (autoPresent) {
    headerBanner.className = 'modal-status-banner banner-valid';
    headerBanner.innerHTML = '<span class="spinner"></span> REGISTRANDO PRESENTE EN PLANILLA...';
    actionsBox.innerHTML = `
      <button type="button" class="btn btn-primary btn-block" onclick="closeScanModal()">
        <i class="fas fa-qrcode"></i> Escanear Siguiente
      </button>
      <button type="button" class="btn-undo-checkin" onclick="submitCheckinAction(true, '')">
        <i class="fas fa-undo"></i> Deshacer presente (por error)
      </button>
    `;
    submitCheckinAction(false, qrRaw, true);
    return;
  }

  // Caso 3: Abierto manualmente desde la lista alfabética (confirmación en 1 toque)
  headerBanner.className = 'modal-status-banner banner-valid';
  headerBanner.innerHTML = '<i class="fas fa-user-check"></i> INVITADO CONFIRMADO';
  actionsBox.innerHTML = `
    <button type="button" id="btnConfirmCheckin" class="btn btn-block btn-confirm-entry" onclick="submitCheckinAction(false, '', false)">
      <i class="fas fa-check"></i> MARCAR PRESENTE (${count} ${count === 1 ? 'persona' : 'personas'})
    </button>
    <button type="button" class="btn btn-secondary btn-block" style="margin-top: 10px;" onclick="closeScanModal()">
      Cancelar
    </button>
  `;
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
 * Envía el registro de Presente a Google Sheets (con soporte automático y cola offline)
 */
window.submitCheckinAction = async function(isUndo, qrRaw, stayOpenAfterSave) {
  if (!activePassInModal) return;

  const pass = activePassInModal;
  const headerBanner = document.getElementById('modalStatusBanner');
  const btn = document.getElementById('btnConfirmCheckin');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Registrando...';
  }

  const nowLabel = 'Presente - ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs';
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
          sessionToken: currentSessionToken,
          passId: pass.id,
          qrRaw: qrRaw || '',
          undo: Boolean(isUndo)
        })
      });
      const json = await res.json();

      if (json && (json.status === 'unauthorized' || json.status === 'session_revoked')) {
        closeScanModal();
        logoutReception(json.message || 'Sesión cerrada.');
        return;
      }

      if (json && json.status === 'invalid_qr') {
        if (headerBanner) {
          headerBanner.className = 'modal-status-banner banner-invalid';
          headerBanner.innerHTML = '<i class="fas fa-ban"></i> QR INVÁLIDO / ADULTERADO';
        }
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
    pass.checkedIn = !isUndo;
    pass.checkIn = isUndo ? '' : `${nowLabel} (Local)`;
    const queue = getPendingQueue().filter(item => item.passId !== pass.id);
    queue.push({ passId: pass.id, qrRaw: qrRaw || '', undo: Boolean(isUndo), label: pass.checkIn });
    setPendingQueue(queue);
  }

  saveCache();
  renderDashboard();

  if (stayOpenAfterSave && activePassInModal === pass && !isUndo) {
    if (headerBanner) {
      headerBanner.className = 'modal-status-banner banner-valid';
      headerBanner.innerHTML = syncedOk
        ? `<i class="fas fa-check-circle"></i> PRESENTE REGISTRADO EN EXCEL`
        : `<i class="fas fa-check-circle"></i> PRESENTE GUARDADO (PENDIENTE SYNC)`;
    }
    if (window.showToast) {
      window.showToast(`¡Presente: ${pass.titularName}!`);
    }
    return;
  }

  if (window.showToast) {
    window.showToast(isUndo ? 'Presencia revertida' : `¡Presente confirmado: ${pass.titularName}!`);
  }
  closeScanModal();
};
