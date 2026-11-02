// ============================================================
// REPRODUCTOR DE MÚSICA DE FONDO (Web Audio & Audio Tag)
// Ofrece una suave melodía nupcial romántica para acompañar la invitación
// ============================================================

(function() {
  let isPlaying = false;
  let audioContext = null;
  let melodyInterval = null;
  
  // Melodía romántica y suave estilo canon / caja de música
  const notes = [
    { freq: 261.63, dur: 1.2 }, // C4
    { freq: 392.00, dur: 1.2 }, // G4
    { freq: 440.00, dur: 1.2 }, // A4
    { freq: 329.63, dur: 1.2 }, // E4
    { freq: 349.23, dur: 1.2 }, // F4
    { freq: 261.63, dur: 1.2 }, // C4
    { freq: 349.23, dur: 1.2 }, // F4
    { freq: 392.00, dur: 1.6 }  // G4
  ];

  function playNote(freq, duration) {
    if (!audioContext || audioContext.state !== 'running') return;
    try {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.type = 'sine'; // Tono dulce y suave de campana/piano
      osc.frequency.setValueAtTime(freq, audioContext.currentTime);

      gain.gain.setValueAtTime(0.001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioContext.destination);

      osc.start();
      osc.stop(audioContext.currentTime + duration);
    } catch(e) {
      // Audio context cleanup
    }
  }

  function startMelody() {
    let noteIndex = 0;
    melodyInterval = setInterval(() => {
      if (!isPlaying) return;
      const currentNote = notes[noteIndex];
      playNote(currentNote.freq, currentNote.dur);
      // Armónico cálido
      playNote(currentNote.freq * 1.5, currentNote.dur * 0.7);
      noteIndex = (noteIndex + 1) % notes.length;
    }, 1100);
  }

  function stopMelody() {
    if (melodyInterval) {
      clearInterval(melodyInterval);
      melodyInterval = null;
    }
  }

  window.toggleWeddingAudio = function() {
    const widget = document.getElementById('audioWidget');
    const icon = document.getElementById('audioIcon');
    const label = document.getElementById('audioLabel');

    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
      }
    }

    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }

    isPlaying = !isPlaying;

    if (isPlaying) {
      if (widget) widget.classList.add('playing');
      if (icon) icon.className = 'fas fa-pause';
      if (label) label.textContent = 'Pausar';
      startMelody();
    } else {
      if (widget) widget.classList.remove('playing');
      if (icon) icon.className = 'fas fa-music';
      if (label) label.textContent = 'Música';
      stopMelody();
    }
  };
})();
