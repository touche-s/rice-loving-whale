(function () {
  const petImg = document.getElementById('pet-img');
  const petWrapper = document.getElementById('pet-wrapper');
  const speechBubble = document.getElementById('speech-bubble');
  const speechText = document.getElementById('speech-text');
  const statusLabel = document.getElementById('status-label');
  const controls = document.getElementById('controls');
  const dot = document.querySelector('.dot');

  let config = {};
  let images = {};
  let hideTimer;

  function setState(state) {
    const cfg = config[state];
    if (!cfg) return;

    const src = images[state];
    if (!src) return;

    petWrapper.className = 'wrapper';
    void petWrapper.offsetWidth;
    petWrapper.classList.add(cfg.animation);

    petImg.style.opacity = '0';
    setTimeout(() => {
      petImg.src = src;
      petImg.alt = cfg.label;
      petImg.style.opacity = '1';
    }, 120);

    statusLabel.textContent = cfg.label;
    showSpeech(cfg.text);
  }

  function showSpeech(text) {
    speechText.textContent = text;
    speechBubble.classList.remove('hidden');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      speechBubble.classList.add('hidden');
    }, 2800);
  }

  function handleMessage(event) {
    const msg = event.data;
    if (!msg) return;
    if (msg.type === 'state') {
      setState(msg.state);
    } else if (msg.type === 'auto') {
      dot.classList.toggle('auto', msg.enabled);
    }
  }

  window.pet = {
    init(initial) {
      config = initial.config || {};
      images = initial.images || {};

      controls.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-state]');
        if (btn) {
          setState(btn.dataset.state);
        }
      });

      window.addEventListener('message', handleMessage);
      setState('idle');
    }
  };
})();
