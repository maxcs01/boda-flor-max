// ============================================================
// VISUALIZADOR DE PASE DIGITAL INDIVIDUAL (pase.html)
// Boda Flor & Max
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initPassPage();
});

async function initPassPage() {
  const params = new URLSearchParams(window.location.search);
  const passId = (params.get('id') || '').trim().toUpperCase();

  const loadingEl = document.getElementById('passLoading');
  const errorEl = document.getElementById('passError');
  const errorMsgEl = document.getElementById('passErrorMessage');
  const cardEl = document.getElementById('passDisplayCard');

  if (!passId) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'block';
    if (errorMsgEl) {
      errorMsgEl.innerText = 'No se especificó ningún código de pase en el enlace.';
    }
    return;
  }

  const scriptUrl = window.WEDDING_CONFIG ? window.WEDDING_CONFIG.googleAppsScriptUrl : '';
  if (!scriptUrl) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'block';
    if (errorMsgEl) errorMsgEl.innerText = 'Servicio de validación no configurado.';
    return;
  }

  try {
    const response = await fetch(`${scriptUrl}?action=getPass&id=${encodeURIComponent(passId)}`);
    const data = await response.json();

    if (loadingEl) loadingEl.style.display = 'none';

    if (!data || !data.found || !data.pass) {
      if (errorEl) errorEl.style.display = 'block';
      if (errorMsgEl) {
        errorMsgEl.innerText = (data && data.message)
          ? data.message
          : `No encontramos un pase válido con el código "${passId}".`;
      }
      return;
    }

    renderGuestPass(data.pass, cardEl);
  } catch (err) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'block';
    if (errorMsgEl) {
      errorMsgEl.innerText = 'No pudimos conectar con la lista en este momento. Verificá tu conexión e intentá nuevamente.';
    }
  }
}

function renderGuestPass(pass, cardEl) {
  if (!cardEl) return;
  cardEl.style.display = 'block';

  const escape = window.PassUtils.escapeHtml;
  const qrContent = pass.qrPayload || pass.id;

  const badgeEl = document.getElementById('passStatusBadge');
  if (badgeEl) {
    if (pass.checkedIn) {
      badgeEl.className = 'pass-status-pill pass-status-entered';
      badgeEl.innerHTML = `<i class="fas fa-check-double"></i> ${escape(pass.checkIn)}`;
    } else {
      badgeEl.className = 'pass-status-pill pass-status-confirmed';
      badgeEl.innerHTML = `<i class="fas fa-check-circle"></i> ${escape(pass.status || 'Confirmado')}`;
    }
  }

  const titularEl = document.getElementById('passTitularName');
  if (titularEl) titularEl.textContent = pass.titularName;

  const totalEl = document.getElementById('passTotalGuests');
  if (totalEl) {
    const count = pass.totalGuests || (1 + (pass.companions ? pass.companions.length : 0));
    totalEl.textContent = `${count} ${count === 1 ? 'persona' : 'personas'}`;
  }

  const companionsBox = document.getElementById('passCompanionsContainer');
  if (companionsBox) {
    companionsBox.innerHTML = window.PassUtils.renderCompanionsListHtml(pass.companions || []);
  }

  const codeEl = document.getElementById('passCodeText');
  if (codeEl) codeEl.textContent = pass.id;

  const qrCanvas = document.getElementById('passQrCanvas');
  if (qrCanvas) {
    window.PassUtils.renderQrToCanvas(qrCanvas, qrContent, 220);
  }

  const btnDownload = document.getElementById('btnPassDownloadPng');
  if (btnDownload) {
    btnDownload.onclick = () => window.PassUtils.downloadPassCardPng(pass);
  }
}
