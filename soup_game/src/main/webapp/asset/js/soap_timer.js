/* soap_timer.js - water-like filling bar (20s) */

(function(window, document){
  const DURATION = 20.0; // seconds
  let startTime = null;
  let pausedAt = null;
  let rafId = null;
  let running = false;

  const timerEl = document.getElementById('timer');
  if(!timerEl){
    console.warn('Timer div (#timer) not found in DOM.');
    return;
  }

  // accessibility
  timerEl.setAttribute('role', 'progressbar');
  timerEl.setAttribute('aria-valuemin', '0');
  timerEl.setAttribute('aria-valuemax', String(DURATION));
  timerEl.setAttribute('aria-valuenow', '0');
  timerEl.setAttribute('aria-live', 'polite');

  // build DOM inside #timer
  timerEl.classList.add('soap-timer');
  // remove any previous children to be safe
  timerEl.innerHTML = '';
  const fill = document.createElement('div'); fill.className = 'fill';
  // create two wave layers
  const wave1 = document.createElement('div'); wave1.className = 'wave wave1';
  const wave2 = document.createElement('div'); wave2.className = 'wave wave2';
  fill.appendChild(wave1);
  fill.appendChild(wave2);
  timerEl.appendChild(fill);

  // helper to set progress (0..1)
  function setProgress(percent){
    percent = Math.max(0, Math.min(1, percent));
    // toggle empty class for visual tidy
    if(percent <= 0.001) timerEl.classList.add('empty'); else timerEl.classList.remove('empty');

    fill.style.width = (percent * 100) + '%';

    // update aria current seconds
    const secs = Math.round(percent * DURATION * 100) / 100;
    timerEl.setAttribute('aria-valuenow', String(secs));
  }

  function tick(now){
    if(!running) return;
    if(!startTime) startTime = now;
    const elapsed = (now - startTime) / 1000; // seconds
    const pct = Math.min(1, elapsed / DURATION);
    setProgress(pct);
    if(pct >= 1){
      running = false;
      if(rafId) cancelAnimationFrame(rafId);
      rafId = null;
      timerEl.dispatchEvent(new CustomEvent('timerComplete', { bubbles:true }));
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  // API
  function start(){
    if(running) return;
    if(pausedAt){
      // resume
      const pausedDuration = pausedAt - startTime;
      startTime = performance.now() - pausedDuration;
      pausedAt = null;
    } else {
      startTime = performance.now();
      setProgress(0);
    }
    running = true;
    if(rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }
  function pause(){
    if(!running) return;
    running = false;
    pausedAt = performance.now();
    if(rafId) cancelAnimationFrame(rafId); rafId = null;
  }
  function reset(autoStart=false){
    running = false;
    if(rafId) cancelAnimationFrame(rafId); rafId = null;
    startTime = null; pausedAt = null;
    setProgress(0);
    if(autoStart) start();
  }

  // auto-start on page load
  window.addEventListener('load', ()=>{ reset(true); });

  // expose API
  window.timer = { start, pause, reset, _internal: { DURATION } };

})(window, document);
