// soap_game_core.js (patched - drawObjects disabled, canvas z-index lowered)
// Includes precise button-aligned hitboxes for dpad (setupDpad)
(function(){
  const U = window.soapUtils;
  const O = window.soapObstacles;
  if(!U || !O) {
    console.error('soap_game_core: missing dependencies (soap_utils / soap_obstacles).');
    return;
  }

  // --- canvas references will be resolved lazily / created if missing ---
  let cBg = null;
  let cBoard = null;
  let cUI = null;

  // z-index mapping for dynamically created canvases
  // NOTE: set to 0 so they do NOT cover the scene image (#scene-img has z-index:1).
  // If you later want canvases visible above the scene image, increase these values.
  const CANVAS_Z = { 'bg-canvas': 0, 'board-canvas': 0, 'ui-canvas': 0 };

  function refreshCanvases(){
    // attempt to find existing canvases
    cBg = document.getElementById('bg-canvas') || cBg;
    cBoard = document.getElementById('board-canvas') || cBoard;
    cUI = document.getElementById('ui-canvas') || cUI;

    // get game-board container to append if needed
    const boardEl = document.getElementById('game-board') || document.body;
    // helper to create missing canvas
    function ensureCanvas(id){
      let el = document.getElementById(id);
      if(el) return el;
      // create and insert as absolute child of boardEl
      el = document.createElement('canvas');
      el.id = id;
      el.style.position = 'absolute';
      el.style.left = '0';
      el.style.top = '0';
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.pointerEvents = 'none';
      el.style.opacity = '1';
      el.style.zIndex = (CANVAS_Z[id] || 1).toString();
      el.style.background = 'transparent';
      // ensure smallest possible initial size
      el.width = 2; el.height = 2;
      // append as first child so background is below other elements
      try{
        boardEl.insertBefore(el, boardEl.firstChild);
      }catch(e){
        document.body.appendChild(el);
      }
      return el;
    }

    if(!cBg) cBg = ensureCanvas('bg-canvas');
    if(!cBoard) cBoard = ensureCanvas('board-canvas');
    if(!cUI) cUI = ensureCanvas('ui-canvas');
  }

  // safe getters
  function getCanvasSafe(id){
    refreshCanvases();
    return document.getElementById(id) || null;
  }
  function getContextSafe(id, type){
    const c = getCanvasSafe(id);
    if(!c) return null;
    try{
      const ctx = c.getContext(type || '2d');
      return ctx || null;
    }catch(e){
      console.warn('getContextSafe: failed for', id, e);
      return null;
    }
  }

  // small util to avoid console spam when a canvas isn't ready
  function warnOnce(fn){
    if(!fn.__warned){
      fn.__warned = true;
      console.warn.apply(console, Array.prototype.slice.call(arguments,1));
    }
  }

  let showGrid = false;

  const PLAYER_SPEED = 220;
  const PLAYER_RADIUS = 16;
  const ALLOWED_MARGIN = 6;

  const player = { x: 0, y: 0, r: PLAYER_RADIUS, vx: 0, vy: 0, speed: PLAYER_SPEED };
  const keys = {};
  const dirState = { up: false, right: false, down: false, left: false };

  let lastTime = null;
  let platformRects = [];

  function drawBg(){
    const ctx = getContextSafe('bg-canvas');
    if(!ctx){ warnOnce(drawBg, 'drawBg: bg canvas/context not ready'); return; }
    const rect = ctx.canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx.clearRect(0,0,w,h);
    if(!U.isPositive(w) || !U.isPositive(h)) return;
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0, '#aee6fb');
    g.addColorStop(0.5, '#87cef0');
    g.addColorStop(1, '#69aeea');
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
    try{
      const gg = ctx.createRadialGradient(w*0.15, h*0.08, 1, w*0.15, h*0.08, Math.max(w,h)*0.6);
      gg.addColorStop(0, 'rgba(255,255,255,0.5)');
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gg; ctx.fillRect(0,0,w,h);
    }catch(e){}
  }

  function drawBoardFrame(ctx, area){
    const {x,y,size} = area;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    U.roundRectFill(ctx, x, y, size, size, size*0.03, '#d0f0ff');
    ctx.restore();

    const bezel = size*0.06;
    U.roundRectFill(ctx, x+bezel/2, y+bezel/2, size - bezel, size - bezel, size*0.02, '#c3e9ff');
    U.strokeRoundRect(ctx, x+bezel/2+1, y+bezel/2+1, size - bezel -2, size - bezel -2, size*0.02, 'rgba(255,255,255,0.5)', 2);
    U.strokeRoundRect(ctx, x+bezel/2-1, y+bezel/2-1, size - bezel +2, size - bezel +2, size*0.03, 'rgba(0,0,0,0.06)', 1);
  }

  function drawChecker(ctx, area, rows=4, cols=4){
    const {x,y,size} = area;
    const inset = size*0.08;
    const innerX = x + inset;
    const innerY = y + inset;
    const innerSize = size - inset*2;
    U.roundRectFill(ctx, innerX, innerY, innerSize, innerSize, Math.max(4, size*0.02), '#9dd8f4');

    const tw = innerSize / cols;
    const th = innerSize / rows;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const tileX = innerX + c*tw;
        const tileY = innerY + r*th;
        const dark = ((r + c) % 2 === 0);
        ctx.fillStyle = dark ? '#6fc7ee' : '#bfefff';
        ctx.fillRect(tileX+1, tileY+1, tw-2, th-2);
      }
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    for(let i=1;i<cols;i++){ const gx = innerX + i*tw; ctx.beginPath(); ctx.moveTo(gx+0.5, innerY); ctx.lineTo(gx+0.5, innerY+innerSize); ctx.stroke(); }
    for(let j=1;j<rows;j++){ const gy = innerY + j*th; ctx.beginPath(); ctx.moveTo(innerX, gy+0.5); ctx.lineTo(innerX+innerSize, gy+0.5); ctx.stroke(); }
    ctx.restore();

    ctx.save();
    const v = ctx.createLinearGradient(innerX, innerY+innerSize*0.8, innerX, innerY+innerSize);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = v;
    ctx.fillRect(innerX, innerY+innerSize*0.7, innerSize, innerSize*0.3);
    ctx.restore();

    return {innerX, innerY, innerSize, tw, th};
  }

  function drawTopProgress(ctx, canvasW, canvasH){
    const w = canvasW * 0.7;
    const h = Math.max(8, canvasH * 0.03);
    const x = (canvasW - w)/2;
    const y = canvasH * 0.06;
    U.roundRectFill(ctx, x, y, w, h, h/2 + 2, '#dff6ff');
    U.strokeRoundRect(ctx, x+0.5, y+0.5, w-1, h-1, h/2, 'rgba(0,0,0,0.08)', 1);
    const pct = 0.6;
    const fillW = Math.max(2, w * pct);
    const fg = ctx.createLinearGradient(x, y, x+fillW, y);
    fg.addColorStop(0, '#58a9f6');
    fg.addColorStop(1, '#9dd7ff');
    U.roundRectFill(ctx, x+2, y+2, fillW-4, h-4, (h-4)/2, fg);
    ctx.save();
    const gloss = ctx.createLinearGradient(x, y, x, y+h);
    gloss.addColorStop(0, 'rgba(255,255,255,0.6)');
    gloss.addColorStop(0.4, 'rgba(255,255,255,0.15)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    U.roundRectFill(ctx, x+2, y+1, fillW-4, (h-4)/2, (h-4)/2, gloss);
    ctx.restore();
  }

  function circleRectCollide(cx, cy, r, rx, ry, rw, rh){
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx;
    const dy = cy - ny;
    return (dx*dx + dy*dy) <= (r*r);
  }

  function drawPlayer(ctx){
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(player.x + 3, player.y + 6, player.r*1.05, player.r*0.55, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(player.x, player.y, player.r, player.r, 0, 0, Math.PI*2);
    ctx.fillStyle = '#ffdfe8';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(player.x - player.r*0.3, player.y - player.r*0.45, player.r*0.35, player.r*0.25, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    ctx.restore();
  }

  window.addEventListener('keydown', (e)=>{ keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', (e)=>{ keys[e.key.toLowerCase()] = false; });

  // -----------------------
  // setupDpad - precise button-aligned hitboxes + slide switching
  // -----------------------
  function setupDpad(){
    const container = document.getElementById('direction-buttons');
    if(!container) {
      console.warn('setupDpad: #direction-buttons not found — skipping dpad setup.');
      return;
    }
    // ensure touch behavior
    container.style.touchAction = 'none';
    container.style.userSelect = 'none';

    // button ids we expect
    const btns = {
      up:    document.getElementById('up-btn'),
      right: document.getElementById('right-btn'),
      down:  document.getElementById('down-btn'),
      left:  document.getElementById('left-btn')
    };

    // debug flag: set true to draw visible outlines for hitboxes
    const SHOW_HITBOX_DEBUG = false;
    let debugEls = {};

    // helper: (re)layout buttons to precisely match container size
    function layoutButtons(){
      const rect = container.getBoundingClientRect();
      const W = rect.width, H = rect.height;
      // base tile size: half of smallest axis (so 4-quadrant dpad)
      const s = Math.min(W, H);
      const half = s / 2;

      // center offsets
      // const cx = rect.left + W/2;
      // const cy = rect.top + H/2;

      // For responsive: set button sizes to half-width/half-height and position them so
      // they align with the dpad visual centered in the container.
      // up
      if(btns.up){
        const w = Math.round(half), h = Math.round(half);
        btns.up.style.position = 'absolute';
        btns.up.style.width = w + 'px';
        btns.up.style.height = h + 'px';
        // place centered horizontally, at top quarter
        const left = Math.round((W - w)/2);
        const top  = Math.round((H - h)/2 - half/2);
        btns.up.style.left = left + 'px';
        btns.up.style.top  = top + 'px';
        btns.up.style.pointerEvents = 'auto';
      }
      // down
      if(btns.down){
        const w = Math.round(half), h = Math.round(half);
        btns.down.style.position = 'absolute';
        btns.down.style.width = w + 'px';
        btns.down.style.height = h + 'px';
        const left = Math.round((W - w)/2);
        const top  = Math.round((H - h)/2 + half/2);
        btns.down.style.left = left + 'px';
        btns.down.style.top  = top + 'px';
        btns.down.style.pointerEvents = 'auto';
      }
      // left
      if(btns.left){
        const w = Math.round(half), h = Math.round(half);
        btns.left.style.position = 'absolute';
        btns.left.style.width = w + 'px';
        btns.left.style.height = h + 'px';
        const left = Math.round((W - w)/2 - half/2);
        const top  = Math.round((H - h)/2);
        btns.left.style.left = left + 'px';
        btns.left.style.top  = top + 'px';
        btns.left.style.pointerEvents = 'auto';
      }
      // right
      if(btns.right){
        const w = Math.round(half), h = Math.round(half);
        btns.right.style.position = 'absolute';
        btns.right.style.width = w + 'px';
        btns.right.style.height = h + 'px';
        const left = Math.round((W - w)/2 + half/2);
        const top  = Math.round((H - h)/2);
        btns.right.style.left = left + 'px';
        btns.right.style.top  = top + 'px';
        btns.right.style.pointerEvents = 'auto';
      }

      // update debug overlays if enabled
      if(SHOW_HITBOX_DEBUG){
        Object.keys(btns).forEach(k=>{
          const b = btns[k];
          if(!b) return;
          if(!debugEls[k]){
            const de = document.createElement('div');
            de.style.position = 'absolute';
            de.style.border = '2px dashed rgba(255,0,0,0.85)';
            de.style.pointerEvents = 'none';
            container.appendChild(de);
            debugEls[k] = de;
          }
          const br = b.getBoundingClientRect();
          // position relative to container
          const crect = container.getBoundingClientRect();
          debugEls[k].style.left = (br.left - crect.left) + 'px';
          debugEls[k].style.top  = (br.top  - crect.top)  + 'px';
          debugEls[k].style.width = br.width + 'px';
          debugEls[k].style.height = br.height + 'px';
        });
      } else {
        // remove debug els if present
        Object.values(debugEls).forEach(e=>{ try{ e.remove(); }catch(_){} });
        debugEls = {};
      }
    }

    // determine which button (key) is under client point
    function hitTestButton(clientX, clientY){
      // use elementFromPoint for visual accuracy first
      const el = document.elementFromPoint(clientX, clientY);
      if(el){
        // check if it's exactly one of our buttons or inside it
        for(const k of Object.keys(btns)){
          if(!btns[k]) continue;
          if(btns[k] === el || btns[k].contains(el)) return k;
        }
      }
      // fallback: bounding rect containment
      for(const k of Object.keys(btns)){
        const b = btns[k];
        if(!b) continue;
        const r = b.getBoundingClientRect();
        if(clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return k;
      }
      return null;
    }

    // apply direction exclusively
    function setExclusiveDir(key){
      dirState.up = dirState.right = dirState.down = dirState.left = false;
      if(key) dirState[key] = true;
      // set player immediate velocity
      let dx=0, dy=0;
      if(key === 'left') dx = -1;
      if(key === 'right') dx = 1;
      if(key === 'up') dy = -1;
      if(key === 'down') dy = 1;
      if(dx !== 0 || dy !== 0){
        const len = Math.hypot(dx, dy) || 1;
        player.vx = (dx/len) * player.speed;
        player.vy = (dy/len) * player.speed;
      } else { player.vx = 0; player.vy = 0; }
    }

    // clear the key on release; if another held key exists, apply it
    function clearKey(key){
      if(key) dirState[key] = false;
      if(dirState.up||dirState.right||dirState.down||dirState.left){
        let dx=0,dy=0; if(dirState.left) dx--; if(dirState.right) dx++; if(dirState.up) dy--; if(dirState.down) dy++;
        const len = Math.hypot(dx,dy) || 1;
        player.vx = (dx/len)*player.speed;
        player.vy = (dy/len)*player.speed;
      } else { player.vx = 0; player.vy = 0; }
    }

    // attach pointer handlers to each button: capture + slide switching via global pointermove
    let activePointerId = null;
    let activeKey = null;

    function onPointerDownButton(ev, key){
      ev.preventDefault && ev.preventDefault();
      try{ if(ev.pointerId && ev.target.setPointerCapture) ev.target.setPointerCapture(ev.pointerId); }catch(e){}
      activePointerId = ev.pointerId;
      activeKey = key;
      setExclusiveDir(key);
    }
    function onPointerMoveGlobal(ev){
      if(activePointerId === null || ev.pointerId !== activePointerId) return;
      const hit = hitTestButton(ev.clientX, ev.clientY);
      if(hit !== activeKey){
        // switch direction live
        activeKey = hit;
        setExclusiveDir(activeKey);
      }
    }
    function onPointerUpButton(ev, key){
      try{ if(ev.pointerId && ev.target.releasePointerCapture) ev.target.releasePointerCapture(ev.pointerId); }catch(e){}
      // if this was the active pointer, clear
      if(ev.pointerId === activePointerId) {
        activePointerId = null;
        activeKey = null;
        clearKey(key);
      } else {
        // otherwise just clear that specific key (rare)
        clearKey(key);
      }
    }

    // attach/ensure events
    Object.keys(btns).forEach(k=>{
      const b = btns[k];
      if(!b) return;
      // prevent duplicate binds
      if(b.__dpad_bound) return;
      b.__dpad_bound = true;
      // make sure each button is focusable for accessibility
      if(typeof b.tabIndex === 'number' && b.tabIndex < 0) b.tabIndex = 0;
      b.addEventListener('pointerdown', (ev)=> onPointerDownButton(ev, k), { passive:false });
      b.addEventListener('pointerup',   (ev)=> onPointerUpButton(ev, k));
      b.addEventListener('pointercancel',(ev)=> onPointerUpButton(ev, k));
      b.addEventListener('pointerleave', (ev)=>{ if(ev.buttons === 0) onPointerUpButton(ev, k); });
      // keyboard fallback
      b.addEventListener('keydown', (ev)=>{ if(ev.key === ' ' || ev.key === 'Enter'){ ev.preventDefault(); setExclusiveDir(k); } });
      b.addEventListener('keyup',   (ev)=>{ if(ev.key === ' ' || ev.key === 'Enter'){ clearKey(k); } });
    });

    // global pointermove listener for slide switching
    window.addEventListener('pointermove', onPointerMoveGlobal, { passive:true });

    // mouse fallback: mouseup clears all
    document.addEventListener('mouseup', ()=>{ activePointerId = null; activeKey = null; clearKey(null); });

    // layout on init + resize (and after a small delay to catch fonts/images)
    function scheduleLayout(){
      try{ layoutButtons(); }catch(e){ console.warn('layoutButtons failed', e); }
    }
    scheduleLayout();
    window.addEventListener('resize', scheduleLayout);
    // also re-run shortly after load to accomodate late image reflow
    setTimeout(scheduleLayout, 120);
  }

  function handleInput(){
    let dx = 0, dy = 0;
    if(dirState.left) dx -= 1;
    if(dirState.right) dx += 1;
    if(dirState.up) dy -= 1;
    if(dirState.down) dy += 1;
    if(keys['arrowleft'] || keys['a']) dx -= 1;
    if(keys['arrowright'] || keys['d']) dx += 1;
    if(keys['arrowup'] || keys['w']) dy -= 1;
    if(keys['arrowdown'] || keys['s']) dy += 1;
    if(dx !== 0 || dy !== 0){
      const len = Math.hypot(dx, dy) || 1;
      player.vx = (dx/len) * player.speed;
      player.vy = (dy/len) * player.speed;
    } else { player.vx = 0; player.vy = 0; }
  }

  function update(dt, allowedArea){
    const nextX = player.x + player.vx * dt;
    const nextY = player.y + player.vy * dt;
    const prevX = player.x, prevY = player.y;
    player.x = nextX;
    let collided = platformRects.some(r => circleRectCollide(player.x, player.y, player.r - 2, r.x, r.y, r.w, r.h));
    if(collided) player.x = prevX;
    player.y = nextY;
    collided = platformRects.some(r => circleRectCollide(player.x, player.y, player.r - 2, r.x, r.y, r.w, r.h));
    if(collided) player.y = prevY;
    if(allowedArea){
      const minX = allowedArea.x + ALLOWED_MARGIN + player.r;
      const maxX = allowedArea.x + allowedArea.w - ALLOWED_MARGIN - player.r;
      const minY = allowedArea.y + ALLOWED_MARGIN + player.r;
      const maxY = allowedArea.y + allowedArea.h - ALLOWED_MARGIN - player.r;
      player.x = Math.max(minX, Math.min(maxX, player.x));
      player.y = Math.max(minY, Math.min(maxY, player.y));
    }
  }

  function redrawLoop(ts){
    // ensure canvases exist / sized
    refreshCanvases();

    if(!lastTime) lastTime = ts;
    const dt = Math.min(0.05, (ts - lastTime) / 1000);
    lastTime = ts;

    U.fitAll();

    // secure contexts
    const ctxBoard = getContextSafe('board-canvas');
    const ctxBg = getContextSafe('bg-canvas');
    const ctxUI = getContextSafe('ui-canvas');

    if(!ctxBoard || !ctxBg || !ctxUI){
      // if any context missing, re-schedule — they will be created/resized in refreshCanvases/fitAll
      warnOnce(redrawLoop, 'redrawLoop: one or more canvas contexts missing; retrying');
      requestAnimationFrame(redrawLoop);
      return;
    }

    const rect = ctxBoard.canvas.getBoundingClientRect();
    const W = rect.width, H = rect.height;

    ctxBoard.clearRect(0,0,W,H);
    ctxBg.clearRect(0,0,W,H);
    ctxUI.clearRect(0,0,W,H);

    drawBg();

    const size = Math.min(W * 0.66, H * 0.66);
    const bx = (W - size)/2;
    const by = Math.max(H*0.06, H*0.06);
    const boardArea = {x: bx, y: by, size: size};

    drawBoardFrame(ctxBoard, boardArea);
    const checker = drawChecker(ctxBoard, boardArea, 4, 4);

    // ================================
    // IMPORTANT: disabled scene object drawing here to avoid canvas-drawn
    // decorations covering the real scene image.
    // If you want objects back, uncomment the next line.
    // O.drawObjects(ctxBoard, checker);
    // ================================

    platformRects = O.drawLowerPlatforms(ctxBoard, W, H, boardArea) || [];

    const allowedArea = { x: checker.innerX, y: checker.innerY, w: checker.innerSize, h: checker.innerSize };

    if(player.x === 0 && player.y === 0){
      player.r = Math.max(12, Math.min(PLAYER_RADIUS, checker.tw * 0.4));
      player.x = allowedArea.x + allowedArea.w/2;
      player.y = allowedArea.y + allowedArea.h - player.r - 8;
      player.speed = PLAYER_SPEED;
    }

    handleInput();
    update(dt, allowedArea);

    drawTopProgress(ctxUI, W, H);

    drawPlayer(ctxUI);

    if(showGrid){
      ctxBoard.save();
      ctxBoard.strokeStyle = 'rgba(255,0,0,0.85)';
      ctxBoard.lineWidth = 2;
      for(const r of platformRects){
        ctxBoard.strokeRect(r.x+0.5, r.y+0.5, r.w, r.h);
      }
      ctxBoard.restore();

      ctxBoard.save();
      ctxBoard.strokeStyle = 'rgba(255,0,0,0.6)';
      ctxBoard.lineWidth = 2;
      ctxBoard.strokeRect(allowedArea.x+0.5, allowedArea.y+0.5, allowedArea.w, allowedArea.h);
      ctxBoard.restore();
    }

    requestAnimationFrame(redrawLoop);
  }

  window.addEventListener('load', ()=>{
    // ensure canvases exist and are sized before starting
    refreshCanvases();
    setupDpad();
    lastTime = null;
    U.fitAll();
    requestAnimationFrame(redrawLoop);
  });

  window.addEventListener('resize', ()=>{ U.fitAll(); });

  setTimeout(()=>{ if(!lastTime) requestAnimationFrame(redrawLoop); }, 120);

  window.soapDraw = {};
})();
