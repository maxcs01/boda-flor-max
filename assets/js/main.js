// ============================================================
// LÓGICA PRINCIPAL - BODA FLOR & MAX
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initCountdown();
  initPetalsAnimation();
  initCalendarButton();
});

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
