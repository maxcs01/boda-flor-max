// ============================================================
// LÓGICA PRINCIPAL - BODA FLOR & MAX
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initScrollDrivenEnvelope();
  initCountdown();
  initPetalsAnimation();
  initCalendarButton();
});

/**
 * Experiencia de Sobre Desplegable Guiado por el Scroll (The Digital Yes - Fresco)
 * Apertura táctil y gradual del lazo de seda, la solapa 3D y la carta.
 */
function initScrollDrivenEnvelope() {
  const section = document.getElementById('envelopeScrollSection');
  const stickyViewport = document.getElementById('envelopeStickyViewport');
  const wrapper = document.getElementById('scrollEnvelopeWrapper');
  const flap = document.getElementById('scrollEnvelopeFlap');
  const card = document.getElementById('scrollEnvelopeCard');
  const bowKnot = document.getElementById('bowKnot');
  const bowLoopLeft = document.getElementById('bowLoopLeft');
  const bowLoopRight = document.getElementById('bowLoopRight');
  const bowTailLeft = document.getElementById('bowTailLeft');
  const bowTailRight = document.getElementById('bowTailRight');
  const ribbonHLeft = document.getElementById('ribbonHLeft');
  const ribbonHRight = document.getElementById('ribbonHRight');
  const ribbonVTop = document.getElementById('ribbonVTop');
  const ribbonVBottom = document.getElementById('ribbonVBottom');
  const guideIndicator = document.getElementById('scrollGuideIndicator');
  const reopenBtn = document.getElementById('btnReopenEnvelope');
  const floatingRsvp = document.getElementById('floatingRsvpBtn');

  if (!section || !wrapper) return;

  let ticking = false;

  function update() {
    ticking = false;
    const rect = section.getBoundingClientRect();
    const maxScroll = section.offsetHeight - window.innerHeight;
    
    // progress va de 0.0 a 1.0 mientras el usuario se desplaza por la sección
    let progress = 0;
    if (maxScroll > 0) {
      progress = Math.min(Math.max(-rect.top / maxScroll, 0), 1);
    }

    // ----------------------------------------------------
    // FASE 1: DESATAR EL LAZO DE SEDA (progress: 0.0 -> 0.28)
    // ----------------------------------------------------
    const pRibbon = Math.min(progress / 0.28, 1);

    // Indicador "Deslizá hacia abajo para abrir"
    if (guideIndicator) {
      guideIndicator.style.opacity = Math.max(0, 1 - pRibbon * 2.8);
      guideIndicator.style.pointerEvents = pRibbon > 0.15 ? 'none' : 'auto';
      guideIndicator.style.transform = `translateY(${pRibbon * 18}px)`;
    }

    // Nudo central del lazo
    if (bowKnot) {
      const scaleKnot = Math.max(0, 1 - pRibbon * 0.8);
      const rotKnot = pRibbon * 30;
      bowKnot.style.transform = `scale(${scaleKnot}) rotate(${rotKnot}deg)`;
      bowKnot.style.opacity = Math.max(0, 1 - pRibbon * 1.15);
    }

    // Bucle izquierdo del lazo: se afloja, gira y se desvanece suavemente hacia la izquierda
    if (bowLoopLeft) {
      const tx = -pRibbon * 85;
      const ty = -pRibbon * 15;
      const rot = -pRibbon * 35;
      const sc = Math.max(0, 1 - pRibbon * 0.5);
      bowLoopLeft.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${sc})`;
      bowLoopLeft.style.opacity = Math.max(0, 1 - pRibbon * 1.15);
    }

    // Bucle derecho del lazo: se afloja, gira y se desvanece suavemente hacia la derecha
    if (bowLoopRight) {
      const tx = pRibbon * 85;
      const ty = -pRibbon * 15;
      const rot = pRibbon * 35;
      const sc = Math.max(0, 1 - pRibbon * 0.5);
      bowLoopRight.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${sc})`;
      bowLoopRight.style.opacity = Math.max(0, 1 - pRibbon * 1.15);
    }

    // Cola izquierda
    if (bowTailLeft) {
      const tx = -pRibbon * 45;
      const ty = pRibbon * 55;
      const rot = -pRibbon * 25;
      bowTailLeft.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg)`;
      bowTailLeft.style.opacity = Math.max(0, 1 - pRibbon * 1.1);
    }

    // Cola derecha
    if (bowTailRight) {
      const tx = pRibbon * 45;
      const ty = pRibbon * 55;
      const rot = pRibbon * 25;
      bowTailRight.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg)`;
      bowTailRight.style.opacity = Math.max(0, 1 - pRibbon * 1.1);
    }

    // Cintas horizontales: se separan hacia los lados
    if (ribbonHLeft) {
      ribbonHLeft.style.transform = `translateX(-${pRibbon * 110}%)`;
      ribbonHLeft.style.opacity = Math.max(0, 1 - pRibbon * 1.1);
    }
    if (ribbonHRight) {
      ribbonHRight.style.transform = `translateX(${pRibbon * 110}%)`;
      ribbonHRight.style.opacity = Math.max(0, 1 - pRibbon * 1.1);
    }

    // Cintas verticales: se separan hacia arriba y abajo
    if (ribbonVTop) {
      ribbonVTop.style.transform = `translateY(-${pRibbon * 110}%)`;
      ribbonVTop.style.opacity = Math.max(0, 1 - pRibbon * 1.1);
    }
    if (ribbonVBottom) {
      ribbonVBottom.style.transform = `translateY(${pRibbon * 110}%)`;
      ribbonVBottom.style.opacity = Math.max(0, 1 - pRibbon * 1.1);
    }

    // ----------------------------------------------------
    // FASE 2: APERTURA 3D DE LA SOLAPA TRIANGULAR (progress: 0.22 -> 0.58)
    // ----------------------------------------------------
    let pFlap = 0;
    if (progress >= 0.22) {
      pFlap = Math.min((progress - 0.22) / 0.36, 1);
    }
    // Easing suave (easeInOutQuad)
    const easeFlap = pFlap < 0.5 ? 2 * pFlap * pFlap : -1 + (4 - 2 * pFlap) * pFlap;
    const flapAngle = easeFlap * 180; // 0 deg cerrado -> 180 deg abierto hacia arriba

    if (flap) {
      flap.style.transform = `rotateX(${flapAngle}deg)`;
      // Al pasar de 90 grados, la solapa pasa físicamente hacia atrás del sobre
      if (flapAngle >= 89.5) {
        flap.style.zIndex = '1';
      } else {
        flap.style.zIndex = '5';
      }
    }

    // ----------------------------------------------------
    // FASE 3: LA CARTA DE FLOR & MAX EMERGE DEL SOBRE (progress: 0.44 -> 0.88)
    // ----------------------------------------------------
    let pCard = 0;
    if (progress >= 0.44) {
      pCard = Math.min((progress - 0.44) / 0.44, 1);
    }
    // Easing suave para la elevación de la carta
    const easeCard = pCard * (2 - pCard);
    
    // Altura calculada según el tamaño de la pantalla
    const maxCardRise = window.innerWidth <= 600 ? 190 : 225;
    const cardRise = easeCard * maxCardRise;
    const cardScale = 0.96 + easeCard * 0.04;

    if (card) {
      card.style.transform = `translateY(-${cardRise}px) scale(${cardScale})`;
      card.style.boxShadow = `0 ${10 + easeCard * 25}px ${25 + easeCard * 35}px rgba(43, 47, 44, ${0.12 + easeCard * 0.16})`;
    }

    // El cuerpo del sobre desciende suavemente
    if (wrapper) {
      const sinkY = easeCard * 40;
      wrapper.style.transform = `translateY(${sinkY}px)`;
    }

    // ----------------------------------------------------
    // FASE 4: TRANSICIÓN SUAVE HACIA EL RESTO DE LA INVITACIÓN (progress: 0.86 -> 1.0)
    // ----------------------------------------------------
    if (stickyViewport) {
      if (progress >= 0.86) {
        const pFade = (progress - 0.86) / 0.14;
        stickyViewport.style.opacity = Math.max(0, 1 - pFade);
      } else {
        stickyViewport.style.opacity = 1;
      }
    }

    // Botón flotante para reabrir el sobre
    if (reopenBtn) {
      if (progress >= 0.82) {
        reopenBtn.classList.add('visible');
      } else {
        reopenBtn.classList.remove('visible');
      }
    }

    // Botón flotante de Confirmar Asistencia
    if (floatingRsvp) {
      if (progress >= 0.65) {
        floatingRsvp.classList.add('visible');
      } else {
        floatingRsvp.classList.remove('visible');
      }
    }
  }

  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(update);
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  
  // Ejecutar primera actualización inmediata
  update();
}

/**
 * Apertura automática suave al hacer click en el indicador
 */
window.autoOpenEnvelope = function() {
  const section = document.getElementById('envelopeScrollSection');
  if (!section) return;
  const target = section.offsetTop + (section.offsetHeight - window.innerHeight) * 0.95;
  window.scrollTo({ top: target, behavior: 'smooth' });
};

/**
 * Reabrir el sobre suavemente al inicio
 */
window.reopenEnvelope = function() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

/**
 * Contador Regresivo dinámico para el 21 de Marzo de 2027 a las 15:00 hs
 */
function initCountdown() {
  const targetDate = new Date(window.WEDDING_CONFIG ? window.WEDDING_CONFIG.eventDateISO : "2027-03-21T15:00:00-03:00").getTime();
  
  const daysEl = document.getElementById('countDays');
  const hoursEl = document.getElementById('countHours');
  const minutesEl = document.getElementById('countMinutes');
  const secondsEl = document.getElementById('countSeconds');

  function update() {
    const now = new Date().getTime();
    const distance = targetDate - now;

    if (distance <= 0) {
      if (daysEl) daysEl.innerText = "00";
      if (hoursEl) hoursEl.innerText = "00";
      if (minutesEl) minutesEl.innerText = "00";
      if (secondsEl) secondsEl.innerText = "00";
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    if (daysEl) daysEl.innerText = days < 10 ? '0' + days : days;
    if (hoursEl) hoursEl.innerText = hours < 10 ? '0' + hours : hours;
    if (minutesEl) minutesEl.innerText = minutes < 10 ? '0' + minutes : minutes;
    if (secondsEl) secondsEl.innerText = seconds < 10 ? '0' + seconds : seconds;
  }

  update();
  setInterval(update, 1000);
}

/**
 * Función para copiar el Alias bancario al portapapeles
 */
window.copyAlias = function(alias) {
  const targetAlias = alias || (window.WEDDING_CONFIG ? window.WEDDING_CONFIG.alias : "bodaflor.max");
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(targetAlias).then(() => {
      showToast(`¡Alias "${targetAlias}" copiado al portapapeles!`);
    }).catch(() => {
      fallbackCopy(targetAlias);
    });
  } else {
    fallbackCopy(targetAlias);
  }
};

function fallbackCopy(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand('copy');
    showToast(`¡Alias "${text}" copiado!`);
  } catch (err) {
    prompt("Copia el siguiente Alias:", text);
  }
  document.body.removeChild(textArea);
}

/**
 * Notificación Toast visual elegante
 */
window.showToast = function(message) {
  let toast = document.getElementById('toastNotice');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastNotice';
    toast.className = 'toast-notice';
    document.body.appendChild(toast);
  }

  toast.innerHTML = `<i class="fas fa-check-circle" style="color: #C5A059;"></i> <span>${message}</span>`;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
};

/**
 * Generador de enlace para Google Calendar
 */
function initCalendarButton() {
  const calendarBtn = document.getElementById('btnGoogleCalendar');
  if (!calendarBtn) return;

  const title = encodeURIComponent("Boda de Flor & Max");
  // 2027-03-21 de 15:00 hs a 03:00 hs del día siguiente (UTC-3: 18:00Z a 06:00Z)
  const dates = "20270321T180000Z/20270322T060000Z";
  const details = encodeURIComponent("¡Acompáñanos a celebrar nuestro casamiento!\n\nDress Code: Elegante Sport\nHorario: 15:00 hs puntual\nVersículo: Colosenses 3:14");
  const location = encodeURIComponent("Club de Campo María Antonia, Amuchastegui 1388, Rosario, Santa Fe");

  calendarBtn.href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
}

/**
 * Animación sutil de pétalos flotantes en canvas
 */
function initPetalsAnimation() {
  const canvas = document.getElementById('petals-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const petals = [];
  const petalCount = 18; // Cantidad sutil para no sobrecargar la vista

  for (let i = 0; i < petalCount; i++) {
    petals.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 8 + 6,
      speedY: Math.random() * 0.8 + 0.4,
      speedX: Math.random() * 0.5 - 0.25,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.02,
      opacity: Math.random() * 0.4 + 0.2
    });
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    petals.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = `rgba(235, 218, 185, ${p.opacity})`; // Color pétalo marfil / dorado suave
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      p.y += p.speedY;
      p.x += p.speedX;
      p.angle += p.spin;

      if (p.y > height + 20) {
        p.y = -20;
        p.x = Math.random() * width;
      }
    });

    requestAnimationFrame(render);
  }

  render();
}
