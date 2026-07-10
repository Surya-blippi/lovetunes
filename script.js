// --- Backend config (publishable values only — safe to expose) ---
const SUPABASE_URL = 'https://nwglxofwdutesoskzyys.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53Z2x4b2Z3ZHV0ZXNvc2t6eXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNzc4NTUsImV4cCI6MjA5ODY1Mzg1NX0.uLS2jPcp7IxxxPRzA8ggVSKO-pFBpNnpeOSz7Ra9lXo';
const CHECKOUT_ENDPOINT = `${SUPABASE_URL}/functions/v1/create-checkout`;

const form = document.querySelector('#song-form');
const panels = [...document.querySelectorAll('.form-panel')];
const next = document.querySelector('#next');
const back = document.querySelector('#back');
const stepDots = [...document.querySelectorAll('.step-dot')];
const formError = document.querySelector('#form-error');
const MIN_MEMORY = 20; // characters required in the memory field
let step = 1;

function updateStep() {
  panels.forEach(panel => panel.classList.toggle('active', Number(panel.dataset.step) === step));
  stepDots.forEach(dot => {
    const n = Number(dot.dataset.goto);
    dot.classList.toggle('active', n === step);
    dot.classList.toggle('done', n < step);
    dot.disabled = n > step; // can't skip ahead of the current step; earlier steps stay clickable
    dot.setAttribute('aria-current', n === step ? 'step' : 'false');
  });
  back.disabled = step === 1;
  next.innerHTML = step === 3 ? 'pay &amp; send request <span>✦</span>' : 'continue <span>→</span>';
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}
function clearError() { formError.hidden = true; }

function selectedValue(selector) { return document.querySelector(`${selector}.selected`); }
document.querySelectorAll('.choice, .vibe-choice').forEach(button => {
  button.addEventListener('click', () => {
    const group = button.classList.contains('choice') ? '.choice' : '.vibe-choice';
    document.querySelectorAll(group).forEach(item => item.classList.remove('selected'));
    button.classList.add('selected');
  });
});

// Clear the custom "too short" message as soon as the user edits the memory.
document.querySelector('#memory').addEventListener('input', (e) => e.target.setCustomValidity(''));

function collectOrder() {
  return {
    recipientRelationship: selectedValue('.choice')?.dataset.value || '',
    recipientName: document.querySelector('#recipient-name').value.trim(),
    vibe: selectedValue('.vibe-choice')?.dataset.value || '',
    memory: document.querySelector('#memory').value.trim(),
    yourName: document.querySelector('#your-name').value.trim(),
    email: document.querySelector('#email').value.trim(),
    return_url: window.location.origin + window.location.pathname,
  };
}

async function startCheckout() {
  clearError();
  const original = next.innerHTML;
  next.disabled = true;
  next.innerHTML = 'preparing checkout…';
  try {
    const res = await fetch(CHECKOUT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(collectOrder()),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.checkout_url) {
      throw new Error(data.error || 'We couldn’t start checkout. Please try again.');
    }
    window.location.href = data.checkout_url;
  } catch (err) {
    next.disabled = false;
    next.innerHTML = original;
    showError(err.message || 'Something went wrong. Please try again.');
  }
}

next.addEventListener('click', () => {
  const active = panels.find(panel => Number(panel.dataset.step) === step);
  const inputs = [...active.querySelectorAll('input, textarea')];
  const memo = document.querySelector('#memory');
  if (step === 2) {
    const tooShort = memo.value.trim().length < MIN_MEMORY;
    memo.setCustomValidity(tooShort ? `Please share a little more — at least ${MIN_MEMORY} characters so the song can feel personal.` : '');
  }
  const invalidInput = inputs.find(input => !input.checkValidity());
  const needsChoice = step < 3 && !selectedValue(step === 1 ? '.choice' : '.vibe-choice');
  if (needsChoice || invalidInput) {
    invalidInput?.reportValidity();
    if (needsChoice) active.querySelector(step === 1 ? '.choice' : '.vibe-choice').focus();
    return;
  }
  clearError();
  if (step < 3) { step += 1; updateStep(); }
  else { startCheckout(); }
});
back.addEventListener('click', () => { if (step > 1) { clearError(); step -= 1; updateStep(); } });
// Jump straight back to an earlier step to change a choice (forward jumps still go through validation).
stepDots.forEach(dot => {
  dot.addEventListener('click', () => {
    const target = Number(dot.dataset.goto);
    if (target < step) { clearError(); step = target; updateStep(); }
  });
});
updateStep();

// --- Post-payment return handling ---
(function handleReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('paid') === '1') {
    const toast = document.querySelector('#success-toast');
    toast.classList.add('show');
    form.reset();
    document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    // strip query params so a refresh doesn't re-trigger the toast
    history.replaceState({}, '', window.location.pathname + '#create');
    setTimeout(() => toast.classList.remove('show'), 9000);
  }
})();

// --- Song sample player ---
(function initSamples() {
  const samples = [...document.querySelectorAll('.sample')];
  if (!samples.length) return;
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) return '—';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  };
  let currentAudio = null;

  // Hero "now playing" card mirrors whatever sample is active.
  const heroBtn = document.querySelector('.play-button');
  const npTitle = document.querySelector('.now-playing b');
  const npDefault = npTitle ? npTitle.textContent : '';
  function reflectHero() {
    const active = samples.find((s) => s.classList.contains('playing'));
    if (heroBtn) {
      heroBtn.textContent = active ? '⏸' : '▶';
      heroBtn.setAttribute('aria-label', active ? 'Pause preview' : 'Play a preview');
    }
    if (npTitle) npTitle.textContent = active ? active.querySelector('h3').textContent : npDefault;
  }

  samples.forEach((sample) => {
    const audio = sample.querySelector('audio');
    const btn = sample.querySelector('.sample-play');
    const fill = sample.querySelector('.sample-fill');
    const cur = sample.querySelector('.cur');
    const dur = sample.querySelector('.dur');
    const bar = sample.querySelector('.sample-bar');
    const label = btn.getAttribute('aria-label').replace(/^Play /, '');

    btn.addEventListener('click', () => {
      if (audio.paused) {
        if (currentAudio && currentAudio !== audio) currentAudio.pause();
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    });
    bar.addEventListener('click', (e) => {
      if (!audio.duration) return;
      const r = bar.getBoundingClientRect();
      audio.currentTime = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * audio.duration;
    });
    audio.addEventListener('play', () => {
      currentAudio = audio;
      sample.classList.add('playing');
      btn.textContent = '⏸';
      btn.setAttribute('aria-label', 'Pause ' + label);
      reflectHero();
    });
    audio.addEventListener('pause', () => {
      sample.classList.remove('playing');
      btn.textContent = '▶';
      btn.setAttribute('aria-label', 'Play ' + label);
      reflectHero();
    });
    audio.addEventListener('ended', () => {
      sample.classList.remove('playing');
      btn.textContent = '▶';
      btn.setAttribute('aria-label', 'Play ' + label);
      fill.style.width = '0%';
      cur.textContent = '0:00';
      reflectHero();
    });
    audio.addEventListener('loadedmetadata', () => { dur.textContent = fmt(audio.duration); });
    audio.addEventListener('timeupdate', () => {
      fill.style.width = (audio.duration ? (audio.currentTime / audio.duration) * 100 : 0) + '%';
      cur.textContent = fmt(audio.currentTime);
    });
  });

  // Hero play button: toggle whatever is playing, or start a random demo.
  if (heroBtn) {
    heroBtn.addEventListener('click', () => {
      const playing = samples.find((s) => !s.querySelector('audio').paused);
      if (playing) { playing.querySelector('audio').pause(); return; }
      const pick = samples[Math.floor(Math.random() * samples.length)];
      pick.querySelector('.sample-play').click();
    });
  }
})();

// --- Scroll-reveal entrance animations (respects reduced-motion) ---
(function initReveals() {
  const revealEls = [...document.querySelectorAll('[data-reveal]')];
  if (!revealEls.length) return;
  // Stagger reveal children within each [data-stagger] group.
  document.querySelectorAll('[data-stagger]').forEach(group => {
    group.querySelectorAll('[data-reveal]').forEach((el, i) => {
      if (!el.style.getPropertyValue('--d')) el.style.setProperty('--d', (i * 0.09).toFixed(2) + 's');
    });
  });
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { revealEls.forEach(el => el.classList.add('is-visible')); return; }

  let pending = revealEls.slice();
  let ticking = false;
  function check() {
    ticking = false;
    const trigger = window.innerHeight * 0.9; // reveal a touch before fully in view
    pending = pending.filter(el => {
      const r = el.getBoundingClientRect();
      if (r.top < trigger && r.bottom > 0) { el.classList.add('is-visible'); return false; }
      return true;
    });
    if (!pending.length) {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    }
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(check); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  // Re-check when a backgrounded tab becomes visible (rAF/transitions are paused while hidden).
  document.addEventListener('visibilitychange', () => { if (!document.hidden) onScroll(); });
  requestAnimationFrame(check); // initial reveal (hero) on load
  setTimeout(check, 250);       // fallback where rAF is throttled (e.g., background tab)
})();
