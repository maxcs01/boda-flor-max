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

function getGroupMembers(group) {
  if (group && Array.isArray(group.members) && group.members.length > 0) {
    return group.members;
  }
  return [{
    id: group.id || '',
    name: group.titularName || '',
    isTitular: true,
    isChild: false,
    checkedIn: Boolean(group.checkedIn),
    checkIn: group.checkIn || '',
    qrPayload: group.qrPayload || ''
  }];
}

function recomputeGroupTotals(group) {
  const members = getGroupMembers(group);
  const checkedCount = members.filter(m => m.checkedIn).length;
  group.totalGuests = group.totalGuests || members.length || 1;
  group.checkedInCount = checkedCount;
  group.checkedIn = members.length > 0 && checkedCount === members.length;
  const titular = members.find(m => m.isTitular) || members[0];
  if (titular) {
    group.checkIn = titular.checkIn || group.checkIn || '';
  }
  return group;
}

function findGroupAndMember(passId) {
  const target = String(passId || '').trim().toUpperCase();
  if (!target) return null;
  for (let i = 0; i < passesList.length; i++) {
    const g = passesList[i];
    const members = getGroupMembers(g);
    const mMatch = members.find(m => String(m.id || '').toUpperCase() === target);
    if (mMatch) return { group: g, member: mMatch };
    if (String(g.id || '').toUpperCase() === target) {
      return { group: g, member: members[0] };
    }
  }
  return null;
}

function mergeWithPendingLocal(serverPasses) {
  const pending = getPendingQueue();
  if (pending.length === 0) return serverPasses;

  const pendingById = {};
  pending.forEach(item => {
    const ids = Array.isArray(item.passIds) ? item.passIds : (item.passId ? [item.passId] : []);
    ids.forEach(pid => { pendingById[String(pid).toUpperCase()] = item; });
  });

  return serverPasses.map(p => {
    const members = getGroupMembers(p).map(m => {
      const pend = pendingById[String(m.id || '').toUpperCase()];
      if (pend && !pend.undo && !m.checkedIn) {
        return { ...m, checkedIn: true, checkIn: pend.label || 'Presente (Pendiente sync)' };
      }
      return m;
    });
    const clone = { ...p, members };
    return recomputeGroupTotals(clone);
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
    const ids = Array.isArray(item.passIds) ? item.passIds : (item.passId ? [item.passId] : []);
    try {
      const res = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'checkin',
          pin: currentPin,
          sessionToken: currentSessionToken,
          passIds: ids,
          passId: ids[0] || '',
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
    banner.querySelector('span').innerText = `${queue.length} registro(s) pendientes de subir a la planilla.`;
  } else {
    banner.style.display = 'none';
  }
}

function renderDashboard() {
  let totalPeople = 0;
  let checkedPeople = 0;
  let checkedGroups = 0;

  passesList.forEach(p => {
    const members = getGroupMembers(p);
    const groupSize = Math.max(p.totalGuests || 0, members.length, 1);
    const groupChecked = members.filter(m => m.checkedIn).length;
    totalPeople += groupSize;
    checkedPeople += groupChecked;
    if (groupChecked >= members.length && members.length > 0) {
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
    const members = getGroupMembers(p);
    const checkedCount = members.filter(m => m.checkedIn).length;
    const allIn = checkedCount >= members.length && members.length > 0;

    if (currentFilter === 'pending' && allIn) return false;
    if (currentFilter === 'entered' && checkedCount === 0) return false;

    if (!query) return true;

    const hayTitular = normalizeText(p.titularName).includes(query);
    const hayCode = (p.id || '').toLowerCase().includes(query);
    const hayMember = members.some(m =>
      normalizeText(m.name).includes(query) ||
      String(m.id || '').toLowerCase().includes(query)
    );
    return hayTitular || hayCode || hayMember;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-directory-msg">No se encontraron invitados para esa búsqueda.</div>`;
    return;
  }

  const escape = window.PassUtils.escapeHtml;
  container.innerHTML = filtered.map(p => {
    const members = getGroupMembers(p);
    const checkedCount = members.filter(m => m.checkedIn).length;
    const totalCount = Math.max(p.totalGuests || 0, members.length, 1);
    const allIn = checkedCount >= members.length && members.length > 0;

    let statusBadge = `<span class="dir-badge dir-badge-pending">Falta llegar</span>`;
    if (allIn) {
      const timeText = members.length === 1 && members[0].checkIn ? members[0].checkIn : `Completo (${checkedCount}/${totalCount})`;
      statusBadge = `<span class="dir-badge dir-badge-in"><i class="fas fa-check-double"></i> ${escape(timeText)}</span>`;
    } else if (checkedCount > 0) {
      statusBadge = `<span class="dir-badge dir-badge-partial">${checkedCount}/${totalCount} presentes</span>`;
    }

    const membersChips = members.length > 1
      ? `<div class="dir-members-pills">
          ${members.map(m => `
            <span class="dir-member-pill ${m.checkedIn ? 'is-in' : 'is-wait'}">
              ${m.checkedIn ? '✓' : '○'} ${escape(m.name)}${m.isChild ? ' (Menor)' : ''}
            </span>
          `).join('')}
        </div>`
      : '';

    return `
      <button type="button" class="directory-guest-row ${allIn ? 'row-entered' : ''}" onclick="openPassModalById('${escape(p.id)}')">
        <div class="dir-row-main">
          <div class="dir-titular-name">${escape(p.titularName)}</div>
          <div class="dir-meta">
            <span><i class="fas fa-users"></i> ${totalCount} ${totalCount === 1 ? 'persona' : 'personas'}</span>
            ${p.id ? `<span class="dir-code">${escape(p.id)}</span>` : ''}
          </div>
          ${membersChips}
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

  let match = findGroupAndMember(passId);

  if (!match && navigator.onLine && passId) {
    const scriptUrl = window.WEDDING_CONFIG ? window.WEDDING_CONFIG.googleAppsScriptUrl : '';
    if (scriptUrl) {
      try {
        const res = await fetch(`${scriptUrl}?action=getPass&id=${encodeURIComponent(passId)}`);
        const data = await res.json();
        if (data && data.found && data.pass) {
          const existingIdx = passesList.findIndex(p => String(p.id || '').toUpperCase() === String(data.pass.id || '').toUpperCase());
          if (existingIdx >= 0) {
            passesList[existingIdx] = data.pass;
          } else {
            passesList.push(data.pass);
          }
          saveCache();
          match = findGroupAndMember(passId);
        }
      } catch (e) {}
    }
  }

  playBeepSound(Boolean(match && !match.member.checkedIn));

  if (!match) {
    showNotFoundModal(passId);
    return;
  }

  showPassResultModal(match.group, match.member, autoPresent, qrRaw);
}

window.openPassModalById = function(passId) {
  const match = findGroupAndMember(passId);
  if (match) {
    isHandlingScan = true;
    showPassResultModal(match.group, match.member, false, match.member.qrPayload || '');
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

function renderGroupMembersModalBox(group, highlightMemberId) {
  const compContainer = document.getElementById('modalCompanionsContainer');
  if (!compContainer) return;

  const escape = window.PassUtils.escapeHtml;
  const members = getGroupMembers(group);

  if (members.length === 1) {
    const only = members[0];
    compContainer.innerHTML = `<p class="pass-no-companions">Entrada individual${only.isChild ? ' (Menor de 3 años)' : ''}</p>`;
    return;
  }

  const rowsHtml = members.map(m => {
    const isHighlighted = String(m.id || '').toUpperCase() === String(highlightMemberId || '').toUpperCase();
    const roleTag = m.isTitular
      ? '<span class="member-role-tag">Titular</span>'
      : (m.isChild ? '<span class="member-role-tag is-child">Menor</span>' : '');
    const rightControl = m.checkedIn
      ? `<div class="member-status-right">
           <span class="member-present-badge"><i class="fas fa-check"></i> ${escape(m.checkIn || 'Presente')}</span>
           <button type="button" class="btn-member-undo js-member-action" data-member-id="${escape(m.id)}" data-undo="1" title="Quitar presente">
             <i class="fas fa-undo"></i>
           </button>
         </div>`
      : `<button type="button" class="btn-member-checkin js-member-action" data-member-id="${escape(m.id)}" data-undo="0">
           <i class="fas fa-check"></i> Marcar Presente
         </button>`;

    return `
      <div class="modal-member-check-row ${isHighlighted ? 'is-highlighted' : ''} ${m.checkedIn ? 'is-checked' : ''}">
        <div class="member-info-left">
          <div class="member-name-line">
            <strong>${escape(m.name)}</strong> ${roleTag}
          </div>
          <span class="member-id-sub">${escape(m.id || '')}</span>
        </div>
        ${rightControl}
      </div>
    `;
  }).join('');

  compContainer.innerHTML = `<div class="modal-members-list">${rowsHtml}</div>`;

  compContainer.querySelectorAll('.js-member-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const mId = btn.getAttribute('data-member-id');
      const isUndo = btn.getAttribute('data-undo') === '1';
      if (!mId) return;
      const target = getGroupMembers(group).find(m => m.id === mId);
      submitMemberCheckin([mId], isUndo, '', true, target ? target.name : '');
    });
  });
}

function renderModalActionButtons(group, scannedMember) {
  const actionsBox = document.getElementById('modalActionArea');
  if (!actionsBox) return;

  const escape = window.PassUtils.escapeHtml;
  const members = getGroupMembers(group);
  const targetMember = scannedMember || members[0];
  const pendingAllIds = members.filter(m => !m.checkedIn && m.id).map(m => m.id);
  const pendingOtherIds = members.filter(m => m.id !== targetMember.id && !m.checkedIn && m.id).map(m => m.id);

  if (targetMember.checkedIn) {
    let html = '';
    if (pendingOtherIds.length > 0) {
      html += `
        <button type="button" id="btnMarkPendingGroup" class="btn btn-block btn-mark-all-group">
          <i class="fas fa-users"></i> Marcar también a ${pendingOtherIds.length} pendiente(s) del grupo
        </button>
      `;
    }
    html += `
      <button type="button" class="btn btn-primary btn-block" onclick="closeScanModal()">
        <i class="fas fa-qrcode"></i> Escanear Siguiente
      </button>
      <button type="button" id="btnUndoTargetMember" class="btn-undo-checkin">
        <i class="fas fa-undo"></i> Quitar marca de ${escape(targetMember.name)}
      </button>
    `;
    actionsBox.innerHTML = html;

    const btnOthers = document.getElementById('btnMarkPendingGroup');
    if (btnOthers) {
      btnOthers.addEventListener('click', () => {
        submitMemberCheckin(pendingOtherIds, false, '', true, `Grupo de ${group.titularName}`);
      });
    }
    const btnUndo = document.getElementById('btnUndoTargetMember');
    if (btnUndo) {
      btnUndo.addEventListener('click', () => {
        submitMemberCheckin([targetMember.id], true, '', members.length > 1, targetMember.name);
      });
    }
    return;
  }

  let html = '';
  if (pendingAllIds.length > 0) {
    const label = pendingAllIds.length === 1
      ? `MARCAR PRESENTE (${escape(targetMember.name)})`
      : `MARCAR PRESENTE A TODOS (${pendingAllIds.length} personas)`;
    html += `
      <button type="button" id="btnConfirmCheckin" class="btn btn-block btn-confirm-entry">
        <i class="fas fa-check-double"></i> ${label}
      </button>
    `;
  }
  html += `
    <button type="button" class="btn btn-secondary btn-block" style="margin-top: 10px;" onclick="closeScanModal()">
      Cerrar
    </button>
  `;
  actionsBox.innerHTML = html;

  const btnConfirm = document.getElementById('btnConfirmCheckin');
  if (btnConfirm) {
    btnConfirm.addEventListener('click', () => {
      submitMemberCheckin(pendingAllIds, false, '', false, group.titularName);
    });
  }
}

function showPassResultModal(group, scannedMember, autoPresent, qrRaw) {
  const modal = document.getElementById('scanResultModal');
  const headerBanner = document.getElementById('modalStatusBanner');
  const titularEl = document.getElementById('modalTitularName');
  const totalEl = document.getElementById('modalTotalBadge');
  const codeEl = document.getElementById('modalPassCode');

  const members = getGroupMembers(group);
  const targetMember = scannedMember || members[0];
  activePassInModal = { group, member: targetMember };
  if (!modal) return;
  modal.style.display = 'flex';

  const escape = window.PassUtils.escapeHtml;
  titularEl.innerText = autoPresent || !targetMember.isTitular
    ? targetMember.name
    : group.titularName;

  const count = Math.max(group.totalGuests || 0, members.length, 1);
  totalEl.innerText = count === 1
    ? '1 PERSONA'
    : (targetMember.isTitular ? `${count} PERSONAS EN GRUPO` : `RESERVA DE ${group.titularName.toUpperCase()} (${count})`);
  codeEl.innerText = targetMember.id || group.id;

  renderGroupMembersModalBox(group, targetMember.id);

  // Caso 1: Esta persona ya estaba registrada como Presente
  if (targetMember.checkedIn) {
    headerBanner.className = 'modal-status-banner banner-warning';
    headerBanner.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${escape(targetMember.name.toUpperCase())} YA REGISTRADO (${escape(targetMember.checkIn)})`;
    renderModalActionButtons(group, targetMember);
    return;
  }

  // Caso 2: Escaneado con la cámara QR -> Registro AUTOMÁTICO de esta persona en Excel
  if (autoPresent) {
    headerBanner.className = 'modal-status-banner banner-valid';
    headerBanner.innerHTML = `<span class="spinner"></span> REGISTRANDO A ${escape(targetMember.name.toUpperCase())}...`;
    renderModalActionButtons(group, targetMember);
    submitMemberCheckin([targetMember.id], false, qrRaw, true, targetMember.name);
    return;
  }

  // Caso 3: Abierto manualmente desde el directorio
  const checkedCount = members.filter(m => m.checkedIn).length;
  headerBanner.className = 'modal-status-banner banner-valid';
  headerBanner.innerHTML = checkedCount > 0
    ? `<i class="fas fa-user-check"></i> INGRESO PARCIAL (${checkedCount} de ${count})`
    : '<i class="fas fa-user-check"></i> INVITADO CONFIRMADO';
  renderModalActionButtons(group, targetMember);
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
 * Envía el registro de Presente a Google Sheets (individual o grupal, con cola offline)
 */
async function submitMemberCheckin(passIds, isUndo, qrRaw, stayOpenAfterSave, displayName) {
  if (!activePassInModal || !Array.isArray(passIds) || passIds.length === 0) return;

  const { group } = activePassInModal;
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
          passIds: passIds,
          passId: passIds[0],
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
          Object.assign(group, json.pass);
        }
      }
    } catch (e) {
      syncedOk = false;
    }
  }

  if (!syncedOk) {
    const idSet = {};
    passIds.forEach(pid => { idSet[String(pid).toUpperCase()] = true; });
    getGroupMembers(group).forEach(m => {
      if (idSet[String(m.id || '').toUpperCase()]) {
        m.checkedIn = !isUndo;
        m.checkIn = isUndo ? '' : `${nowLabel} (Local)`;
      }
    });
    recomputeGroupTotals(group);

    const queue = getPendingQueue().filter(item => {
      const existingIds = Array.isArray(item.passIds) ? item.passIds : [item.passId];
      return !existingIds.some(eid => idSet[String(eid || '').toUpperCase()]);
    });
    queue.push({ passIds, passId: passIds[0], qrRaw: qrRaw || '', undo: Boolean(isUndo), label: isUndo ? '' : `${nowLabel} (Local)` });
    setPendingQueue(queue);
  }

  // Re-vincular referencia actualizada del miembro activo
  const currentTargetId = activePassInModal.member ? activePassInModal.member.id : group.id;
  const refreshedMember = getGroupMembers(group).find(m => m.id === currentTargetId) || getGroupMembers(group)[0];
  activePassInModal.member = refreshedMember;

  saveCache();
  renderDashboard();

  const label = displayName || (refreshedMember && refreshedMember.name) || group.titularName;

  if (stayOpenAfterSave && activePassInModal && activePassInModal.group === group) {
    renderGroupMembersModalBox(group, refreshedMember.id);
    renderModalActionButtons(group, refreshedMember);
    if (headerBanner) {
      headerBanner.className = 'modal-status-banner banner-valid';
      if (isUndo) {
        headerBanner.innerHTML = `<i class="fas fa-undo"></i> Marca quitada: ${escapeHtmlShort(label)}`;
      } else {
        headerBanner.innerHTML = syncedOk
          ? `<i class="fas fa-check-circle"></i> PRESENTE REGISTRADO: ${escapeHtmlShort(label.toUpperCase())}`
          : `<i class="fas fa-check-circle"></i> GUARDADO OFFLINE: ${escapeHtmlShort(label.toUpperCase())}`;
      }
    }
    if (window.showToast) {
      window.showToast(isUndo ? `Marca quitada: ${label}` : `¡Presente: ${label}!`);
    }
    return;
  }

  if (window.showToast) {
    window.showToast(isUndo ? 'Presencia revertida' : `¡Presente confirmado: ${label}!`);
  }
  closeScanModal();
}

function escapeHtmlShort(s) {
  return window.PassUtils ? window.PassUtils.escapeHtml(s) : String(s || '');
}
