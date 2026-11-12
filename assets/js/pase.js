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
  const members = Array.isArray(pass.members) ? pass.members : [];
  const badgeEl = document.getElementById('passStatusBadge');
  const holderLabelEl = document.getElementById('passHolderLabel');
  const titularEl = document.getElementById('passTitularName');
  const detailsLabelEl = document.getElementById('passDetailsLabel');
  const companionsBox = document.getElementById('passCompanionsContainer');
  const totalEl = document.getElementById('passTotalGuests');
  const codeEl = document.getElementById('passCodeText');
  const qrCanvas = document.getElementById('passQrCanvas');
  const btnDownload = document.getElementById('btnPassDownloadPng');
  const membersSection = document.getElementById('passMembersQrSection');

  // Caso 1: Pase individual de un acompañante
  if (pass.isCompanionPass) {
    const owner = members.find((m) => m.id === pass.requestedMemberId) || members[0];
    const ownerId = (owner && owner.id) || pass.requestedMemberId || pass.id;
    const ownerName = (owner && owner.name) || pass.titularName;
    const ownerQr = (owner && owner.qrPayload) || ownerId;
    const ownerCheckedIn = owner ? Boolean(owner.checkedIn) : Boolean(pass.checkedIn);
    const ownerCheckInText = (owner && owner.checkIn) || pass.checkIn || 'Presente';

    if (badgeEl) {
      badgeEl.className = ownerCheckedIn
        ? 'pass-status-pill pass-status-entered'
        : 'pass-status-pill pass-status-confirmed';
      badgeEl.innerHTML = ownerCheckedIn
        ? `<i class="fas fa-check-double"></i> ${escape(ownerCheckInText)}`
        : `<i class="fas fa-check-circle"></i> ${escape(pass.status || 'Confirmado')}`;
    }

    if (holderLabelEl) holderLabelEl.textContent = 'Invitado Individual';
    if (titularEl) titularEl.textContent = ownerName;
    if (detailsLabelEl) detailsLabelEl.textContent = 'Grupo / Reserva';
    if (companionsBox) {
      companionsBox.innerHTML = `<p class="pass-no-companions">Acompañante en la reserva de <strong>${escape(pass.titularName)}</strong></p>`;
    }
    if (totalEl) totalEl.textContent = '1 entrada individual';
    if (codeEl) codeEl.textContent = ownerId;

    if (qrCanvas) {
      window.PassUtils.renderQrToCanvas(qrCanvas, ownerQr, 220);
    }

    if (btnDownload) {
      const individualPngObj = {
        id: ownerId,
        passUrl: (owner && owner.passUrl) || window.PassUtils.buildPassUrl(ownerId),
        qrPayload: ownerQr,
        titularName: ownerName,
        totalGuests: 1,
        isIndividual: true,
        subtitleNote: `Reserva de ${pass.titularName}`
      };
      btnDownload.onclick = () => window.PassUtils.downloadPassCardPng(individualPngObj);
    }

    if (membersSection) {
      membersSection.style.display = 'none';
      membersSection.innerHTML = '';
    }
    return;
  }

  // Caso 2: Pase del Titular (puede incluir acompañantes con QR propio)
  const titularMember = members.find((m) => m.isTitular);
  const titularCheckedIn = titularMember ? Boolean(titularMember.checkedIn) : Boolean(pass.checkedIn);
  const titularCheckInText = (titularMember && titularMember.checkIn) || pass.checkIn || 'Presente';
  const qrContent = (titularMember && titularMember.qrPayload) || pass.qrPayload || pass.id;

  if (badgeEl) {
    if (titularCheckedIn) {
      badgeEl.className = 'pass-status-pill pass-status-entered';
      badgeEl.innerHTML = `<i class="fas fa-check-double"></i> ${escape(titularCheckInText)}`;
    } else if (pass.checkedInCount > 0) {
      badgeEl.className = 'pass-status-pill pass-status-entered';
      badgeEl.innerHTML = `<i class="fas fa-user-check"></i> Ingreso parcial (${pass.checkedInCount}/${pass.totalGuests})`;
    } else {
      badgeEl.className = 'pass-status-pill pass-status-confirmed';
      badgeEl.innerHTML = `<i class="fas fa-check-circle"></i> ${escape(pass.status || 'Confirmado')}`;
    }
  }

  if (holderLabelEl) holderLabelEl.textContent = 'Invitado Titular';
  if (titularEl) titularEl.textContent = pass.titularName;
  if (detailsLabelEl) detailsLabelEl.textContent = 'Acompañantes';

  if (totalEl) {
    const count = pass.totalGuests || (1 + (pass.companions ? pass.companions.length : 0));
    totalEl.textContent = `${count} ${count === 1 ? 'persona' : 'personas'}`;
  }

  if (companionsBox) {
    companionsBox.innerHTML = window.PassUtils.renderCompanionsListHtml(pass.companions || []);
  }

  if (codeEl) codeEl.textContent = pass.id;

  if (qrCanvas) {
    window.PassUtils.renderQrToCanvas(qrCanvas, qrContent, 220);
  }

  if (btnDownload) {
    btnDownload.onclick = () => window.PassUtils.downloadPassCardPng(pass);
  }

  // Mostrar tarjetas individuales de acompañantes cuando el grupo tiene más de 1 persona
  const companionMembers = members.filter((m) => !m.isTitular);
  if (membersSection) {
    if (companionMembers.length > 0) {
      membersSection.style.display = 'block';
      membersSection.innerHTML = `
        <div class="pass-members-header">
          <i class="fas fa-users"></i> QRs Individuales por Invitado
          <p>Si algún acompañante llega por separado, enviale su QR personal por WhatsApp para que ingrese sin esperar.</p>
        </div>
        <div class="pass-members-grid">
          ${companionMembers.map((m, idx) => {
            const memberUrl = m.passUrl || window.PassUtils.buildPassUrl(m.id);
            const waUrl = window.PassUtils.buildWhatsAppShareUrl(m.name, memberUrl);
            const childBadge = m.isChild ? ' <span class="pass-child-badge">👶 Menor de 3 años</span>' : '';
            const statusPill = m.checkedIn
              ? `<span class="pass-member-pill is-present"><i class="fas fa-check"></i> ${escape(m.checkIn || 'Presente')}</span>`
              : '<span class="pass-member-pill is-pending">Confirmado</span>';
            return `
              <div class="individual-qr-item">
                <div class="individual-qr-top">
                  <div>
                    <strong>${escape(m.name)}</strong>${childBadge}
                    <div class="individual-qr-id">${escape(m.id || 'Generando...')}</div>
                  </div>
                  ${statusPill}
                </div>
                ${m.id ? `
                  <div class="individual-qr-canvas-wrap">
                    <canvas id="memberQrCanvas_${idx}"></canvas>
                  </div>
                  <div class="individual-qr-actions">
                    <button type="button" class="btn-mini-outline js-download-member-png" data-member-idx="${idx}">
                      <i class="fas fa-download"></i> Guardar PNG
                    </button>
                    <a href="${waUrl}" target="_blank" class="btn-share-wa-mini">
                      <i class="fab fa-whatsapp"></i> Enviar QR por WhatsApp
                    </a>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;

      companionMembers.forEach((m, idx) => {
        if (!m.id) return;
        const mCanvas = document.getElementById(`memberQrCanvas_${idx}`);
        if (mCanvas) {
          window.PassUtils.renderQrToCanvas(mCanvas, m.qrPayload || m.id, 150);
        }
      });

      membersSection.querySelectorAll('.js-download-member-png').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-member-idx'));
          const m = companionMembers[idx];
          if (!m || !m.id) return;
          window.PassUtils.downloadPassCardPng({
            id: m.id,
            passUrl: m.passUrl || window.PassUtils.buildPassUrl(m.id),
            qrPayload: m.qrPayload || m.id,
            titularName: m.name,
            totalGuests: 1,
            isIndividual: true,
            subtitleNote: `Reserva de ${pass.titularName}`
          });
        });
      });
    } else {
      membersSection.style.display = 'none';
      membersSection.innerHTML = '';
    }
  }
}
