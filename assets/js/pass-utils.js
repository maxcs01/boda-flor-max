// ============================================================
// UTILIDADES COMPARTIDAS DE PASE DIGITAL Y QR CODE
// Boda Flor & Max
// ============================================================

(function(global) {
  /**
   * Escapa caracteres especiales para evitar inyección HTML/XSS
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Devuelve la URL pública del pase digital para un ID dado
   */
  function buildPassUrl(passId) {
    const base = (global.WEDDING_CONFIG && global.WEDDING_CONFIG.basePassUrl)
      ? global.WEDDING_CONFIG.basePassUrl
      : 'https://bodaflor-max.netlify.app/pase.html';
    return `${base}?id=${encodeURIComponent(passId)}`;
  }

  /**
   * Extrae el código de pase (ej: FM-8F2A9C) desde una URL escaneada o texto directo
   */
  function extractPassIdFromScan(rawText) {
    if (!rawText) return '';
    const text = String(rawText).trim();

    try {
      if (text.indexOf('http') === 0 || text.indexOf('pase.html') !== -1) {
        const url = new URL(text.indexOf('http') === 0 ? text : `https://example.com/${text}`);
        const idParam = url.searchParams.get('id');
        if (idParam) return idParam.trim().toUpperCase();
      }
    } catch (e) {
      // Fallback regex si no es URL completa
    }

    const match = text.match(/FM-[A-Z0-9]{4,12}/i);
    if (match) return match[0].toUpperCase();

    return text.toUpperCase();
  }

  /**
   * Dibuja el código QR en un elemento <canvas> utilizando QRious
   */
  function renderQrToCanvas(canvasEl, value, size) {
    if (!canvasEl || !value) return null;
    const qrSize = size || 240;

    if (typeof global.QRious === 'function') {
      return new global.QRious({
        element: canvasEl,
        value: value,
        size: qrSize,
        level: 'M',
        background: '#FFFFFF',
        foreground: '#2B2F2C',
        padding: 10
      });
    }
    return null;
  }

  /**
   * Divide una línea de texto larga para ajustarla dentro del ancho máximo de un canvas
   */
  function wrapCanvasText(ctx, text, maxWidth) {
    const words = String(text || '').split(' ');
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine ? `${currentLine} ${words[i]}` : words[i];
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  /**
   * Genera y descarga una tarjeta de Pase de Boda elegante en formato PNG
   * lista para guardar en la galería del celular.
   */
  function downloadPassCardPng(passData) {
    if (!passData || !passData.id) return;

    const passUrl = passData.passUrl || buildPassUrl(passData.id);
    const companions = Array.isArray(passData.companions) ? passData.companions : [];
    const totalGuests = passData.totalGuests || (1 + companions.length);

    // Canvas temporal para el QR
    const qrCanvas = document.createElement('canvas');
    renderQrToCanvas(qrCanvas, passUrl, 320);

    const W = 720;
    const card = document.createElement('canvas');
    card.width = W;
    const measureCtx = card.getContext('2d');

    measureCtx.font = '700 30px Georgia, serif';
    const titularLines = wrapCanvasText(measureCtx, passData.titularName, W - 120);

    measureCtx.font = '500 22px Montserrat, Arial, sans-serif';
    const allCompLines = [];
    if (companions.length > 0) {
      companions.forEach((comp, idx) => {
        const suffix = comp.isChild ? ' (Menor de 3 años)' : '';
        const text = `${idx + 1}. ${comp.name}${suffix}`;
        wrapCanvasText(measureCtx, text, W - 120).forEach(l => allCompLines.push(l));
      });
    }

    const bodyLinesHeight = (titularLines.length * 36) + (Math.max(1, allCompLines.length) * 32);
    const H = Math.max(960, 745 + bodyLinesHeight + 135);
    card.height = H;
    const ctx = card.getContext('2d');

    // Fondo crema perlado
    ctx.fillStyle = '#FAF8F5';
    ctx.fillRect(0, 0, W, H);

    // Marco dorado exterior
    ctx.strokeStyle = '#C5A059';
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, W - 48, H - 48);

    ctx.strokeStyle = '#EAD8B1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(34, 34, W - 68, H - 68);

    // Encabezado verde oliva
    ctx.fillStyle = '#4B5842';
    ctx.fillRect(36, 36, W - 72, 185);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#EAD8B1';
    ctx.font = '600 18px Montserrat, Arial, sans-serif';
    ctx.fillText('PASE DE INGRESO OFICIAL', W / 2, 85);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '400 54px Georgia, serif';
    ctx.fillText('Flor & Max', W / 2, 146);

    ctx.fillStyle = '#F0ECE4';
    ctx.font = '500 19px Montserrat, Arial, sans-serif';
    ctx.fillText('21 DE MARZO DE 2027  •  15:00 HS', W / 2, 190);

    // Caja blanca del QR
    const qrBoxSize = 330;
    const qrBoxX = (W - qrBoxSize) / 2;
    const qrBoxY = 255;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize);
    ctx.strokeStyle = '#EAD8B1';
    ctx.lineWidth = 2;
    ctx.strokeRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize);

    if (qrCanvas.width > 0) {
      ctx.drawImage(qrCanvas, qrBoxX + 15, qrBoxY + 15, qrBoxSize - 30, qrBoxSize - 30);
    }

    // Código de Pase debajo del QR
    ctx.fillStyle = '#4B5842';
    ctx.font = '700 26px Montserrat, Arial, sans-serif';
    ctx.fillText(passData.id, W / 2, qrBoxY + qrBoxSize + 44);

    // Línea divisoria
    ctx.strokeStyle = '#E5DFD5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(80, qrBoxY + qrBoxSize + 72);
    ctx.lineTo(W - 80, qrBoxY + qrBoxSize + 72);
    ctx.stroke();

    // Datos del Titular y Acompañantes
    let y = qrBoxY + qrBoxSize + 116;

    ctx.fillStyle = '#9F7932';
    ctx.font = '700 16px Montserrat, Arial, sans-serif';
    ctx.fillText(`INVITADO TITULAR  (${totalGuests} ${totalGuests === 1 ? 'PERSONA' : 'PERSONAS'})`, W / 2, y);

    y += 38;
    ctx.fillStyle = '#2B2F2C';
    ctx.font = '700 30px Georgia, serif';
    titularLines.forEach(line => {
      ctx.fillText(line, W / 2, y);
      y += 36;
    });

    y += 14;
    ctx.fillStyle = '#5A7163';
    ctx.font = '700 16px Montserrat, Arial, sans-serif';
    ctx.fillText('ACOMPAÑANTES', W / 2, y);

    y += 32;
    if (allCompLines.length === 0) {
      ctx.fillStyle = '#6B726D';
      ctx.font = 'italic 20px Georgia, serif';
      ctx.fillText('Entrada individual (Sin acompañantes)', W / 2, y);
      y += 32;
    } else {
      ctx.fillStyle = '#2B2F2C';
      ctx.font = '500 22px Montserrat, Arial, sans-serif';
      allCompLines.forEach(line => {
        ctx.fillText(line, W / 2, y);
        y += 32;
      });
    }

    // Pie de tarjeta
    ctx.fillStyle = '#6B726D';
    ctx.font = '500 17px Montserrat, Arial, sans-serif';
    ctx.fillText('Club de Campo María Antonia  •  Rosario, Santa Fe', W / 2, H - 84);

    ctx.fillStyle = '#9F7932';
    ctx.font = '600 16px Montserrat, Arial, sans-serif';
    ctx.fillText('Presentá este QR al llegar a la recepción', W / 2, H - 54);

    // Descargar PNG
    const link = document.createElement('a');
    link.download = `Pase_Boda_Flor_y_Max_${passData.id}.png`;
    link.href = card.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Genera el HTML seguro de la lista de acompañantes
   */
  function renderCompanionsListHtml(companions) {
    if (!Array.isArray(companions) || companions.length === 0) {
      return '<p class="pass-no-companions">Entrada individual (Sin acompañantes)</p>';
    }
    const items = companions.map((c, idx) => {
      const childTag = c.isChild
        ? ' <span class="pass-child-badge">👶 Menor de 3 años</span>'
        : '';
      return `<li><strong>${idx + 1}. ${escapeHtml(c.name)}</strong>${childTag}</li>`;
    }).join('');
    return `<ul class="pass-companions-list">${items}</ul>`;
  }

  global.PassUtils = {
    escapeHtml,
    buildPassUrl,
    extractPassIdFromScan,
    renderQrToCanvas,
    downloadPassCardPng,
    renderCompanionsListHtml
  };
})(window);
