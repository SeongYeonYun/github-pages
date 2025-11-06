// soap_game_core.js (updated — avoid adjacent board/bucket + pre-spawn circular warn 2s)
(function(){
  'use strict';

  const U = window.soapUtils || null;
  const O = window.soapObstacles || null;
  if(!U || !O){
    console.warn('soap_game_core: some helpers missing (soapUtils/soapObstacles). Core will attempt to run.');
  }

  // -------- spawn config (exposed) --------
  const spawnConfig = {
    bucketSrc: '../asset/mvi/bucket_color.png',
    boardSrc:  '../asset/mvi/board_color.png',
    bucketSpawnIntervalMs: 3000,
    bucketLifeMs: 5000,
    bucketCountPerSpawn: 1,
    boardShowOnStart: true,
    boardScale: 1.0,
    boardLoop: false,
    bucketStartDelayMs: 5000 // delay after game start before buckets spawn
  };
  window.setSpawnConfig = function(opts){
    Object.assign(spawnConfig, opts || {});
    if(window.soapDyn && typeof window.soapDyn.setSpawnConfig === 'function'){
      try{ window.soapDyn.setSpawnConfig(spawnConfig); }catch(e){ console.warn('soap_game_core: soapDyn.setSpawnConfig failed', e); }
    }
  };

  // pre-spawn warning (ms)
  const PRE_SPAWN_WARN_MS = 2000;
  // lifecycle pre-remove warning (ms) - kept for bucket lifecycle
  const WARN_BEFORE_MS = 2000;

  // -------- canvas helpers (kept minimal) --------
  function ensureCanvas(id, parent){
    let el = document.getElementById(id);
    if(el) return el;
    el = document.createElement('canvas');
    el.id = id;
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.pointerEvents = 'none';
    el.width = 2; el.height = 2;
    try{ (parent||document.body).insertBefore(el, (parent||document.body).firstChild); }catch(e){ document.body.appendChild(el); }
    return el;
  }
  function refreshCanvases(){
    const boardEl = document.getElementById('game-board') || document.body;
    ensureCanvas('bg-canvas', boardEl);
    ensureCanvas('board-canvas', boardEl);
    ensureCanvas('ui-canvas', boardEl);
  }
  function getContextSafe(id){
    refreshCanvases();
    const c = document.getElementById(id);
    if(!c) return null;
    try{ return c.getContext('2d'); }catch(e){ return null; }
  }

  // -------- small utilities --------
  function warnOnce(key, msg){
    if(!warnOnce._s) warnOnce._s = new Set();
    if(!warnOnce._s.has(key)){ warnOnce._s.add(key); console.warn(msg); }
  }

  // -------- parameters --------
  const MOVE_SPEED = 100; // px / sec
  const TILES_X = 4, TILES_Y = 4;
  const PLAYABLE_BOX = { left:0.17, top:0.14, right:0.83, bottom:0.86 };

  let pixelNodesX = new Array(TILES_X+1).fill(0);
  let pixelNodesY = new Array(TILES_Y+1).fill(0);
  let gridLeft=0, gridTop=0, tileW=0, tileH=0;

  // -------- grid computation --------
  function computeGrid(){
    const board = document.getElementById('game-board');
    const scene = document.getElementById('scene-img');
    if(!board || !scene){ warnOnce('grid-missing','computeGrid aborted: #game-board or #scene-img missing'); return; }
    const br = board.getBoundingClientRect();
    const sr = scene.getBoundingClientRect();
    const displayW = sr.width || br.width;
    const displayH = sr.height || br.height;

    const leftLocal = Math.round(PLAYABLE_BOX.left * displayW);
    const rightLocal = Math.round(PLAYABLE_BOX.right * displayW);
    const topLocal = Math.round(PLAYABLE_BOX.top * displayH);
    const bottomLocal = Math.round(PLAYABLE_BOX.bottom * displayH);

    gridLeft = leftLocal; gridTop = topLocal;
    tileW = Math.max(1, (rightLocal - leftLocal) / TILES_X);
    tileH = Math.max(1, (bottomLocal - topLocal) / TILES_Y);

    for(let i=0;i<=TILES_X;i++) pixelNodesX[i] = Math.round(gridLeft + i*tileW);
    for(let j=0;j<=TILES_Y;j++) pixelNodesY[j] = Math.round(gridTop + j*tileH);

    const hud = document.getElementById('hud');
    if(hud) { hud.style.display='block'; hud.textContent = `tile:${tileW.toFixed(1)}x${tileH.toFixed(1)}px`; }
  }

  function nodePos(i,j){
    const ii = Math.max(0, Math.min(TILES_X, i));
    const jj = Math.max(0, Math.min(TILES_Y, j));
    return { x: pixelNodesX[ii], y: pixelNodesY[jj] };
  }
  function tileCenter(tx,ty){
    const ti = Math.max(0, Math.min(TILES_X-1, tx));
    const tj = Math.max(0, Math.min(TILES_Y-1, ty));
    const cx = gridLeft + (ti + 0.5) * tileW;
    const cy = gridTop + (tj + 0.5) * tileH;
    return { x: Math.round(cx), y: Math.round(cy), w: tileW, h: tileH };
  }
  function tileEdgeMid(tx,ty, edge){
    const t = tileCenter(tx,ty);
    if(edge === 'bottom') return { x: t.x, y: Math.round(gridTop + (ty+1) * tileH) };
    if(edge === 'left')   return { x: Math.round(gridLeft + tx * tileW), y: t.y };
    if(edge === 'right')  return { x: Math.round(gridLeft + (tx+1) * tileW), y: t.y };
    if(edge === 'random'){
      const arr = ['top','bottom','left','right'];
      return tileEdgeMid(tx,ty, arr[Math.floor(Math.random()*4)]);
    }
    return { x: t.x, y: Math.round(gridTop + ty * tileH) };
  }

  // -------- soup helpers --------
  function soupEl(){ return document.getElementById('soup_item'); }
  function dynamicRoot(){ return document.getElementById('dynamic-root') || document.body; }

  // placeSoapAtNode: position only, do not change aspect. set initial rotate to 90deg
  function placeSoapAtNode(i,j, align){
    const s = soupEl();
    if(!s){ warnOnce('placeSoapNoSoup','placeSoapAtNode: #soup_item missing - skipping.'); return; }

    if(align === 'bottom'){
      const t = tileCenter(i,j);
      const offsetUp = Math.max(6, Math.round(Math.min(tileW, tileH) * 0.18));
      s.style.left = t.x + 'px';
      s.style.top  = (t.y - offsetUp) + 'px';
    } else if(align === 'center'){
      const t = tileCenter(i,j);
      s.style.left = t.x + 'px';
      s.style.top  = t.y + 'px';
    } else {
      const p = nodePos(i,j);
      s.style.left = p.x + 'px';
      s.style.top  = p.y + 'px';
    }

    s.style.position = 'absolute';
    s.style.pointerEvents = 'none';
    s.style.transformOrigin = '50% 50%';
    s.style.transform = 'translate(-50%,-50%) rotate(90deg)';
    s.style.zIndex = 1500;
    s.style.transition = 'transform 120ms linear';
  }

  function getSoapCenter(){
    const s = soupEl();
    const b = document.getElementById('game-board');
    if(!s || !b) return { x:0, y:0 };
    const sr = s.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return { x: (sr.left + sr.right)/2 - br.left, y: (sr.top + sr.bottom)/2 - br.top };
  }

  // -------- movement state --------
  const spawnNode = { i: Math.floor(TILES_X/2), j: TILES_Y }; // bottom-center
  let node = { i: spawnNode.i, j: spawnNode.j };
  let dir = { x:0, y:-1 }; // initially face up
  let queuedDir = null;
  let moving = false;
  let lastTs = null;
  let gameOver = false;
  let MOVE_EPS = 8;

  function applyDirection(dx,dy){
    if(Math.abs(dx) + Math.abs(dy) !== 1) return;
    dir.x = dx; dir.y = dy;
    queuedDir = null;
    const s = soupEl();
    if(!s) return;
    let angleDeg = 0;
    if(dx !== 0) angleDeg = 0; else angleDeg = 90;
    s.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg)`;
  }

  // -------- helpers for adjacency checks --------
  // Chebyshev distance (max of dx,dy)
  function tileDistanceChebyshev(a_tx, a_ty, b_tx, b_ty){
    return Math.max(Math.abs(a_tx - b_tx), Math.abs(a_ty - b_ty));
  }
  // returns true if tile is occupied by board or adjacent (including diagonals) to any board tile
  function isTileTooCloseToBoard(tx, ty){
    try{
      computeGrid();
      // check DOM boards
      const boards = document.querySelectorAll('.board');
      for(const b of boards){
        const r = b.getBoundingClientRect();
        // compute board's tile center indexes by reverse mapping: approximate using br left/top
        const br = (document.getElementById('game-board') || document.body).getBoundingClientRect();
        const centerX = Math.round(r.left + (r.width/2) - br.left);
        const centerY = Math.round(r.top + (r.height/2) - br.top);
        // approximate tile indices
        const txb = Math.floor((centerX - gridLeft) / tileW);
        const tyb = Math.floor((centerY - gridTop) / tileH);
        if(txb >= 0 && txb < TILES_X && tyb >= 0 && tyb < TILES_Y){
          if(tileDistanceChebyshev(tx,ty, txb, tyb) <= 1) return true;
        } else {
          // fallback: if tile center lies inside board rect (more exact)
          const t = tileCenter(tx,ty);
          const absX = (document.getElementById('game-board') || document.body).getBoundingClientRect().left + t.x;
          const absY = (document.getElementById('game-board') || document.body).getBoundingClientRect().top + t.y;
          if(absX >= r.left && absX <= r.right && absY >= r.top && absY <= r.bottom) return true;
        }
      }
      // check soapDyn._state.boards (structured entries)
      if(window.soapDyn && window.soapDyn._state && Array.isArray(window.soapDyn._state.boards)){
        for(const b of window.soapDyn._state.boards.slice()){
          const el = (b && b.el) ? b.el : (b && b.element) ? b.element : null;
          if(!el) continue;
          const r = el.getBoundingClientRect();
          const br = (document.getElementById('game-board') || document.body).getBoundingClientRect();
          const centerX = Math.round(r.left + (r.width/2) - br.left);
          const centerY = Math.round(r.top + (r.height/2) - br.top);
          const txb = Math.floor((centerX - gridLeft) / tileW);
          const tyb = Math.floor((centerY - gridTop) / tileH);
          if(txb >= 0 && txb < TILES_X && tyb >= 0 && tyb < TILES_Y){
            if(tileDistanceChebyshev(tx,ty, txb, tyb) <= 1) return true;
          } else {
            const t = tileCenter(tx,ty);
            const absX = (document.getElementById('game-board') || document.body).getBoundingClientRect().left + t.x;
            const absY = (document.getElementById('game-board') || document.body).getBoundingClientRect().top + t.y;
            if(absX >= r.left && absX <= r.right && absY >= r.top && absY <= r.bottom) return true;
          }
        }
      }
    }catch(e){}
    return false;
  }
  // returns true if tile is adjacent/overlap to any existing bucket
  function isTileTooCloseToBucket(tx, ty){
    try{
      // check DOM .bucket
      const br = (document.getElementById('game-board') || document.body).getBoundingClientRect();
      const buckets = document.querySelectorAll('.bucket');
      for(const b of buckets){
        const r = b.getBoundingClientRect();
        const centerX = Math.round(r.left + (r.width/2) - br.left);
        const centerY = Math.round(r.top + (r.height/2) - br.top);
        const txb = Math.floor((centerX - gridLeft) / tileW);
        const tyb = Math.floor((centerY - gridTop) / tileH);
        if(txb >= 0 && txb < TILES_X && tyb >= 0 && tyb < TILES_Y){
          if(tileDistanceChebyshev(tx,ty, txb, tyb) <= 1) return true;
        } else {
          const t = tileCenter(tx,ty);
          const absX = br.left + t.x;
          const absY = br.top + t.y;
          if(absX >= r.left && absX <= r.right && absY >= r.top && absY <= r.bottom) return true;
        }
      }
      // check soapDyn._state.buckets
      if(window.soapDyn && window.soapDyn._state && Array.isArray(window.soapDyn._state.buckets)){
        for(const b of window.soapDyn._state.buckets.slice()){
          const el = (b && b.el) ? b.el : (b && b.element) ? b.element : null;
          if(!el) continue;
          const r = el.getBoundingClientRect();
          const br2 = (document.getElementById('game-board') || document.body).getBoundingClientRect();
          const centerX = Math.round(r.left + (r.width/2) - br2.left);
          const centerY = Math.round(r.top + (r.height/2) - br2.top);
          const txb = Math.floor((centerX - gridLeft) / tileW);
          const tyb = Math.floor((centerY - gridTop) / tileH);
          if(txb >= 0 && txb < TILES_X && tyb >= 0 && tyb < TILES_Y){
            if(tileDistanceChebyshev(tx,ty, txb, tyb) <= 1) return true;
          } else {
            const t = tileCenter(tx,ty);
            const absX = br2.left + t.x;
            const absY = br2.top + t.y;
            if(absX >= r.left && absX <= r.right && absY >= r.top && absY <= r.bottom) return true;
          }
        }
      }
    }catch(e){}
    return false;
  }
  // unified check: true if spawning at (tx,ty) would be invalid (too close to board or bucket)
  function isTileInvalidForBucket(tx,ty){
    if(tx < 0 || ty < 0 || tx >= TILES_X || ty >= TILES_Y) return true;
    // avoid bottom spawn row
    if(ty === TILES_Y-1) return true;
    if(isTileTooCloseToBoard(tx,ty)) return true;
    if(isTileTooCloseToBucket(tx,ty)) return true;
    return false;
  }

  // -------- collision checking (delegate to soapDyn + DOM) --------
  function rectsIntersectSimple(r1, r2){
    return !(r2.left > r1.right ||
             r2.right < r1.left ||
             r2.top > r1.bottom ||
             r2.bottom < r1.top);
  }

  function checkCollisions(){
    if(gameOver) return;
    const soap = getSoapCenter();
    if(window.soapDyn && typeof window.soapDyn.checkCollision === 'function'){
      try{
        if(window.soapDyn.checkCollision(soap.x, soap.y)){
          triggerGameOver('입간판에 부딪혔습니다.');
          return;
        }
      }catch(e){}
    }

    const br = (document.getElementById('game-board') || document.body).getBoundingClientRect();
    const sx = br.left + soap.x, sy = br.top + soap.y;
    const pointRect = { left: sx, right: sx, top: sy, bottom: sy };

    try{
      const boards = document.querySelectorAll('.board');
      for(const b of boards){
        const r = b.getBoundingClientRect();
        if(rectsIntersectSimple(pointRect, r)){
          triggerGameOver('입간판에 부딪혔습니다.');
          return;
        }
      }
      const buckets = document.querySelectorAll('.bucket');
      for(const b of buckets){
        const r = b.getBoundingClientRect();
        if(rectsIntersectSimple(pointRect, r)){
          triggerGameOver('대야에 부딪혔습니다.');
          return;
        }
      }
      if(window.soapDyn && window.soapDyn._state && Array.isArray(window.soapDyn._state.buckets)){
        for(const b of window.soapDyn._state.buckets.slice()){
          if(!b.el) continue;
          const r = b.el.getBoundingClientRect();
          if(rectsIntersectSimple(pointRect, r)){
            triggerGameOver('대야에 부딪혔습니다.');
            return;
          }
        }
      }
    }catch(e){}
  }

  // -----------------------
  // CENTERED BUCKET HELPERS (and lifecycle warning)
  // -----------------------
  function alignElementCenterAt(el, x, y, tryCount = 0){
    const ow = el.offsetWidth;
    const oh = el.offsetHeight;

    if(ow > 0 && oh > 0){
      el.style.left = Math.round(x - ow / 2) + 'px';
      el.style.top  = Math.round(y - oh / 2) + 'px';
      el.style.transform = 'none';
      return;
    }

    if(tryCount > 8){
      el.style.left = Math.round(x) + 'px';
      el.style.top  = Math.round(y) + 'px';
      el.style.transform = 'translate(-50%,-50%)';
      console.debug('[soap_core] alignElementCenterAt: fallback used (no size)', el);
      return;
    }

    requestAnimationFrame(()=> alignElementCenterAt(el, x, y, tryCount + 1));
  }

  // lifecycle attach (bucket lives then removed). warns before removal
  function attachWarningToEl(el, lifeMs){
    if(!el) return;
    // cleanup existing
    if(el._bucketTimers){
      try{ clearTimeout(el._bucketTimers.warnTimeout); }catch(_){} 
      try{ clearTimeout(el._bucketTimers.removeTimeout); }catch(_){}
      el._bucketTimers = null;
    }
    if(el._bucketWarning){
      try{ clearInterval(el._bucketWarning.pulseInterval); }catch(_){}
      try{ el._bucketWarning.overlay.remove(); }catch(_){}
      el._bucketWarning = null;
    }

    lifeMs = Number(lifeMs) || Number(spawnConfig.bucketLifeMs) || 5000;
    const warnAfter = Math.max(0, lifeMs - WARN_BEFORE_MS);
    const warnTimeout = setTimeout(()=> {
      try {
        if(el._bucketWarning) return;
        const overlay = document.createElement('div');
        overlay.className = 'bucket-warning-overlay';
        overlay.style.position = 'absolute';
        overlay.style.left = '0';
        overlay.style.top = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.pointerEvents = 'none';
        overlay.style.borderRadius = '50%';
        overlay.style.background = 'rgba(255,0,0,0.25)';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 180ms linear';
        try{ el.appendChild(overlay); }catch(_){}
        let on = false;
        const pulseInterval = setInterval(()=>{
          on = !on;
          try{ overlay.style.opacity = on ? '0.55' : '0.25'; }catch(_){}
        }, 420);
        el._bucketWarning = { overlay, pulseInterval };
      }catch(e){ console.warn('attachWarningToEl: start warning failed', e); }
    }, warnAfter);

    const removeTimeout = setTimeout(()=>{
      try{
        if(el._bucketWarning){
          try{ clearInterval(el._bucketWarning.pulseInterval); }catch(_){}
          try{ el._bucketWarning.overlay.remove(); }catch(_){}
          el._bucketWarning = null;
        }
        try{ el.remove(); }catch(_){}
      }catch(e){ console.warn('bucket remove failed', e); }
    }, lifeMs);

    el._bucketTimers = { warnTimeout, removeTimeout, lifeMs };
  }

  function clearWarningAndTimersForEl(el){
    if(!el) return;
    if(el._bucketTimers){
      try{ clearTimeout(el._bucketTimers.warnTimeout); }catch(_){}
      try{ clearTimeout(el._bucketTimers.removeTimeout); }catch(_){}
      el._bucketTimers = null;
    }
    if(el._bucketWarning){
      try{ clearInterval(el._bucketWarning.pulseInterval); }catch(_){}
      try{ el._bucketWarning.overlay.remove(); }catch(_){}
      el._bucketWarning = null;
    }
    // also remove any preSpawn overlay container stored
    if(el._preSpawnOverlay){
      try{ clearTimeout(el._preSpawnOverlay.removeTimeout); }catch(_){}
      try{ el._preSpawnOverlay.el.remove(); }catch(_){}
      el._preSpawnOverlay = null;
    }
  }

  // create bucket DOM, center it at (x,y), attach lifecycle warn
  function createBucketDOMAtXY(x,y, options){
    const boardEl = document.getElementById('game-board');
    const root = boardEl || dynamicRoot();
    const el = document.createElement('div');
    el.className = 'bucket';
    el.style.position = 'absolute';
    el.style.left = '0px';
    el.style.top  = '0px';
    el.style.pointerEvents = 'none';
    el.style.zIndex = 1400;
    el.style.transform = 'none';

    const src = (options && options.src) || spawnConfig.bucketSrc || '';
    const isVideo = /\.(mp4|webm|mov)$/i.test(src);
    const lifeMs = (options && typeof options.lifeMs === 'number') ? options.lifeMs : (spawnConfig.bucketLifeMs || 5000);

    if(isVideo){
      const v = document.createElement('video');
      v.src = src;
      v.autoplay = true;
      v.muted = true;
      v.playsInline = true;
      v.loop = false;
      v.style.display = 'block';
      v.style.maxWidth = Math.max(24, Math.min(64, tileW * 0.9)) + 'px';
      v.style.maxHeight = Math.max(24, Math.min(64, tileH * 0.9)) + 'px';
      v.style.width = 'auto';
      v.style.height = 'auto';
      el.appendChild(v);
      root.appendChild(el);

      const tryAlign = ()=> alignElementCenterAt(el, x, y);
      if(v.readyState >= 2){ tryAlign(); }
      else {
        v.addEventListener('loadedmetadata', tryAlign, { once:true });
        v.addEventListener('loadeddata', tryAlign, { once:true });
        setTimeout(tryAlign, 120);
      }
    } else {
      const img = document.createElement('img');
      img.src = src || '../asset/img/default_bucket.png';
      img.alt = 'bucket';
      img.style.display = 'block';
      img.style.maxWidth = Math.max(24, Math.min(64, tileW * 0.9)) + 'px';
      img.style.maxHeight = Math.max(24, Math.min(64, tileH * 0.9)) + 'px';
      el.appendChild(img);
      root.appendChild(el);

      const tryAlign = ()=> alignElementCenterAt(el, x, y);
      if(img.complete && img.naturalWidth){ tryAlign(); }
      else img.addEventListener('load', tryAlign, { once:true });
      setTimeout(tryAlign, 120);
    }

    attachWarningToEl(el, lifeMs);

    // register in soapDyn state for checks
    window.soapDyn._state = window.soapDyn._state || {};
    window.soapDyn._state.buckets = window.soapDyn._state.buckets || [];
    window.soapDyn._state.buckets.push({ el });

    console.debug('[soap_core] createBucketDOMAtXY -> appended bucket (will align center)', { x, y, options, lifeMs });
    return { el };
  }

  function createBoardDOMAtXY(x,y, options){
    const root = document.getElementById('dynamic-root') || document.body;
    const el = document.createElement('div');
    el.className = 'board';
    el.style.position = 'absolute';
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    el.style.transform = 'translate(-50%,-50%)';
    el.style.pointerEvents = 'none';
    el.style.zIndex = 1450;
    const src = (options && options.src) || spawnConfig.boardSrc || '';
    const isVideo = /\.(mp4|webm|mov)$/i.test(src);
    if(isVideo){
      const v = document.createElement('video');
      v.src = src;
      v.autoplay = true;
      v.muted = true;
      v.playsInline = true;
      v.loop = !!(options && options.loop);
      v.style.maxWidth = Math.max(48, Math.min(128, tileW * (options && options.scale ? options.scale : 1.0))) + 'px';
      v.style.maxHeight = Math.max(48, Math.min(128, tileH * (options && options.scale ? options.scale : 1.0))) + 'px';
      v.addEventListener('ended', ()=>{ try{ v.pause(); }catch(_){} });
      el.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = src || '../asset/img/default_board.png';
      img.alt = 'board';
      img.style.maxWidth = Math.max(48, Math.min(128, tileW * (options && options.scale ? options.scale : 1.0))) + 'px';
      img.style.maxHeight = Math.max(48, Math.min(128, tileH * (options && options.scale ? options.scale : 1.0))) + 'px';
      el.appendChild(img);
    }
    root.appendChild(el);

    window.soapDyn._state = window.soapDyn._state || {};
    window.soapDyn._state.boards = window.soapDyn._state.boards || [];
    window.soapDyn._state.boards.push({ el });

    return { el };
  }

  if(!window.soapDyn) window.soapDyn = {};

  // fallback spawnBucketAt uses createBucketDOMAtXY
  if(typeof window.soapDyn.spawnBucketAt !== 'function'){
    window.soapDyn.spawnBucketAt = function(tx, ty, opts){
      computeGrid();
      const pos = (opts && opts.pos === 'center') ? tileCenter(tx,ty) : tileEdgeMid(tx,ty, (opts && opts.edge) ? opts.edge : 'top');
      const created = createBucketDOMAtXY(pos.x, pos.y, opts || {});
      return created;
    };
  }
  if(typeof window.soapDyn.spawnBoardAt !== 'function'){
    window.soapDyn.spawnBoardAt = function(tx, ty, opts){
      computeGrid();
      const pos = tileCenter(tx,ty);
      const created = createBoardDOMAtXY(pos.x, pos.y, opts || {});
      return created;
    };
  }
  if(typeof window.soapDyn.spawnBoardRandom !== 'function'){
    window.soapDyn.spawnBoardRandom = function(opts){
      computeGrid();
      const candidates = [];
      for(let tx=0; tx<TILES_X; tx++){
        for(let ty=0; ty<TILES_Y; ty++){
          if(ty === TILES_Y-1) continue;
          // avoid being adjacent to spawn node
          if(opts && opts.avoid && opts.avoid.i === tx && opts.avoid.j === ty) continue;
          // ensure board is not adjacent to existing buckets
          if(isTileTooCloseToBucket(tx,ty)) continue;
          candidates.push({tx,ty});
        }
      }
      if(candidates.length === 0) return null;
      const p = candidates[Math.floor(Math.random()*candidates.length)];
      return window.soapDyn.spawnBoardAt(p.tx, p.ty, opts || {});
    };
  }

  // -------- check whether a tile hosts or is adjacent to board/bucket --------
  function isTileOccupiedByBoard(tx, ty){
    try{
      computeGrid();
      const t = tileCenter(tx,ty);
      const boards = document.querySelectorAll('.board');
      for(const b of boards){
        const r = b.getBoundingClientRect();
        const absX = (document.getElementById('game-board') || document.body).getBoundingClientRect().left + t.x;
        const absY = (document.getElementById('game-board') || document.body).getBoundingClientRect().top + t.y;
        if(absX >= r.left && absX <= r.right && absY >= r.top && absY <= r.bottom) return true;
      }
      if(window.soapDyn && window.soapDyn._state && Array.isArray(window.soapDyn._state.boards)){
        for(const b of window.soapDyn._state.boards.slice()){
          const el = (b && b.el) ? b.el : (b && b.element) ? b.element : null;
          if(!el) continue;
          const r = el.getBoundingClientRect();
          const absX = (document.getElementById('game-board') || document.body).getBoundingClientRect().left + t.x;
          const absY = (document.getElementById('game-board') || document.body).getBoundingClientRect().top + t.y;
          if(absX >= r.left && absX <= r.right && absY >= r.top && absY <= r.bottom) return true;
        }
      }
    }catch(e){}
    return false;
  }

  // -------- PRE-SPAWN WARNING UI --------
  // Create a red circular blinking overlay at tile position (tile edge midpoint or center).
  function showPreSpawnWarningAtTile(tx, ty, opts){
    opts = opts || {};
    const boardEl = document.getElementById('game-board') || document.body;
    computeGrid();
    const pos = (opts.pos === 'center') ? tileCenter(tx,ty) : tileEdgeMid(tx,ty, opts.edge || 'top');

    // container for overlay - attached to board so coordinates align
    const overlay = document.createElement('div');
    overlay.className = 'pre-spawn-warning';
    overlay.style.position = 'absolute';
    overlay.style.width = Math.round(Math.min(tileW, tileH) * 0.6) + 'px';
    overlay.style.height = overlay.style.width;
    overlay.style.left = '0px'; overlay.style.top = '0px';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = 1600;
    overlay.style.borderRadius = '50%';
    overlay.style.boxSizing = 'content-box';
    overlay.style.background = 'rgba(255,0,0,0.45)';
    overlay.style.opacity = '0';
    // use transform none and set left/top via alignElementCenterAt
    overlay.style.transform = 'none';
    // store for cleanup
    overlay._pulseInterval = null;

    (boardEl || document.body).appendChild(overlay);
    alignElementCenterAt(overlay, pos.x, pos.y);

    // pulse
    let on = false;
    overlay._pulseInterval = setInterval(()=>{ on = !on; overlay.style.opacity = on ? '1' : '0.25'; }, 330);

    // scheduled removal (in case spawn not executed)
    const removeTimeout = setTimeout(()=>{
      try{
        if(overlay._pulseInterval) clearInterval(overlay._pulseInterval);
        overlay.remove();
      }catch(_){}
    }, PRE_SPAWN_WARN_MS + 150); // small cushion

    // return object to allow cancel and immediate spawn
    return { el: overlay, removeTimeout, cancel: ()=>{
      try{ if(overlay._pulseInterval) clearInterval(overlay._pulseInterval); }catch(_){}
      try{ clearTimeout(removeTimeout); }catch(_){}
      try{ overlay.remove(); }catch(_){}
    }};
  }

  // -------- spawnOnPath with pre-warn support --------
  // If opts.preWarnMs provided (default PRE_SPAWN_WARN_MS), show warnings then spawn.
  window.spawnBucketOnPath = function(spawnCount, opts){
    spawnCount = Math.max(1, Math.floor(spawnCount||1));
    opts = opts || {};
    computeGrid();
    const path = getPathTiles(Math.max(TILES_X, TILES_Y));
    const preWarnMs = (typeof opts.preWarnMs === 'number') ? opts.preWarnMs : PRE_SPAWN_WARN_MS;

    const doSpawn = (tiles) => {
      for(const pick of tiles){
        // double-check tile validity at spawn time
        if(isTileInvalidForBucket(pick.tx, pick.ty)) continue;
        const edge = getEdgeForDirection(dir.x, dir.y);
        const spawnOpts = Object.assign({ pos:'edge', edge: edge, src: spawnConfig.bucketSrc, lifeMs: spawnConfig.bucketLifeMs }, opts || {});
        try{ window.spawnBucketAtTile(pick.tx, pick.ty, spawnOpts); }catch(e){ console.warn('spawnBucketOnPath spawn fail', e); }
      }
    };

    if(!path || path.length === 0){
      // fallback area near ahead node
      const fallbackI = node.i + (dir.x || 0), fallbackJ = node.j + (dir.y || -1);
      const candidates = [];
      for(let rx = Math.max(0,fallbackI-1); rx <= Math.min(TILES_X-1,fallbackI+1); rx++){
        for(let ry = Math.max(0,fallbackJ-1); ry <= Math.min(TILES_Y-1,fallbackJ+1); ry++){
          if(!isTileInvalidForBucket(rx,ry)) candidates.push({tx:rx,ty:ry});
        }
      }
      if(candidates.length === 0) return;
      // choose spawnCount picks
      const picks = [];
      while(picks.length < spawnCount && candidates.length > 0){
        const idx = Math.floor(Math.random()*candidates.length);
        picks.push(candidates.splice(idx,1)[0]);
      }
      // show pre-warn overlays then spawn
      const overlays = [];
      for(const p of picks) overlays.push(showPreSpawnWarningAtTile(p.tx, p.ty, { pos: 'edge', edge: getEdgeForDirection(dir.x,dir.y) }));
      setTimeout(()=>{ for(const ov of overlays) { try{ ov.cancel(); }catch(_){}}; doSpawn(picks); }, preWarnMs);
      return;
    }

    // filter out too-close tiles (to board/bucket) and not bottom row
    const candidates = path.filter(p => !isTileInvalidForBucket(p.tx, p.ty));
    if(candidates.length === 0) return;
    // weighted preference for nearer tiles
    const weighted = [];
    for(let i=0;i<candidates.length;i++){
      const rep = Math.max(1, Math.floor((candidates.length - i)/1));
      for(let r=0;r<rep;r++) weighted.push(candidates[i]);
    }
    const picks = [];
    while(picks.length < spawnCount && weighted.length > 0){
      const idx = Math.floor(Math.random()*weighted.length);
      const pick = weighted.splice(idx,1)[0];
      // remove duplicates
      for(let w=weighted.length-1; w>=0; w--){
        if(weighted[w].tx === pick.tx && weighted[w].ty === pick.ty) weighted.splice(w,1);
      }
      picks.push(pick);
    }

    // show pre-warn overlays, then spawn after preWarnMs
    const overlays = [];
    for(const p of picks){
      overlays.push(showPreSpawnWarningAtTile(p.tx, p.ty, { pos: 'edge', edge: getEdgeForDirection(dir.x,dir.y) }));
    }
    setTimeout(()=>{
      // remove overlays and actual spawn
      for(const ov of overlays){ try{ ov.cancel(); }catch(_){} }
      doSpawn(picks);
    }, preWarnMs);
  };

  // helper: decide which tile edge corresponds to current movement direction
  function getEdgeForDirection(dx, dy){
    if(dx === 1) return 'left';
    if(dx === -1) return 'right';
    if(dy === 1) return 'top';
    if(dy === -1) return 'bottom';
    return 'top';
  }

  // -------- spawnInitialBuckets uses pre-warn as well --------
  function spawnInitialBuckets(count = 1){
    computeGrid();
    // prefer path tiles
    const pathTiles = getPathTiles(Math.max(TILES_X, TILES_Y));
    const used = new Set();
    const picks = [];
    for(const p of pathTiles){
      if(picks.length >= count) break;
      if(p.tx === spawnNode.i && p.ty === spawnNode.j) continue;
      if(p.ty === TILES_Y-1) continue;
      const key = `${p.tx},${p.ty}`;
      if(used.has(key)) continue;
      if(isTileInvalidForBucket(p.tx,p.ty)) continue;
      used.add(key);
      picks.push(p);
    }
    // fill with random safe candidates if needed
    if(picks.length < count){
      const candidates = [];
      for(let tx=0; tx<TILES_X; tx++){
        for(let ty=0; ty<TILES_Y; ty++){
          if(ty === TILES_Y-1) continue;
          const dx = Math.abs(tx - spawnNode.i);
          const dy = Math.abs(ty - spawnNode.j);
          if(dx <= 1 && dy <= 1) continue;
          if(isTileInvalidForBucket(tx,ty)) continue;
          candidates.push({tx,ty});
        }
      }
      for(let k=0; k<count-picks.length && candidates.length>0; k++){
        const idx = Math.floor(Math.random()*candidates.length);
        picks.push(candidates.splice(idx,1)[0]);
      }
    }
    if(picks.length === 0) return;
    // show pre-warn overlays then spawn after PRE_SPAWN_WARN_MS
    const overlays = [];
    for(const p of picks) overlays.push(showPreSpawnWarningAtTile(p.tx, p.ty, { pos:'edge', edge: getEdgeForDirection(dir.x,dir.y) }));
    setTimeout(()=>{
      for(const ov of overlays) try{ ov.cancel(); }catch(_){}
      for(const p of picks){
        if(!isTileInvalidForBucket(p.tx,p.ty)){
          window.spawnBucketAtTile(p.tx, p.ty, { pos:'edge', edge: getEdgeForDirection(dir.x,dir.y), src: spawnConfig.bucketSrc, lifeMs: spawnConfig.bucketLifeMs });
        }
      }
    }, PRE_SPAWN_WARN_MS);
  }

  // debug / external API to spawn at tile (keeps previous signature)
  window.spawnBucketAtTile = function(tx, ty, opts){
    computeGrid();
    opts = opts || {};
    // refuse spawn if tile has board or is adjacent to board/bucket
    if(isTileInvalidForBucket(tx,ty)){
      return null;
    }
    if(window.soapDyn && typeof window.soapDyn.spawnBucketAt === 'function'){
      try{
        // delegate to soapDyn if available; if returns DOM element align + attach lifecycle warn
        const res = window.soapDyn.spawnBucketAt(tx, ty, opts);
        if(res && res.el && res.el instanceof HTMLElement){
          const pos = (opts.pos === 'center') ? tileCenter(tx,ty) : tileEdgeMid(tx,ty, opts.edge || getEdgeForDirection(dir.x, dir.y) || 'top');
          alignElementCenterAt(res.el, pos.x, pos.y);
          const lifeMs = (opts && typeof opts.lifeMs === 'number') ? opts.lifeMs : spawnConfig.bucketLifeMs;
          attachWarningToEl(res.el, lifeMs);
          // register in state if not present
          window.soapDyn._state = window.soapDyn._state || {}; window.soapDyn._state.buckets = window.soapDyn._state.buckets || [];
          window.soapDyn._state.buckets.push({ el: res.el });
        }
        return res;
      }catch(e){
        console.warn('spawnBucketAtTile: soapDyn.spawnBucketAt threw', e);
      }
    }
    const pos = (opts.pos === 'center') ? tileCenter(tx,ty) : tileEdgeMid(tx,ty, opts.edge || getEdgeForDirection(dir.x, dir.y) || 'top');
    return createBucketDOMAtXY(pos.x, pos.y, opts);
  };

  // spawn board at tile center — ensure not adjacent to buckets
  window.spawnBoardAtTile = function(tx, ty, opts){
    computeGrid();
    opts = opts || {};
    // refuse spawn if tile is adjacent to existing buckets
    if(isTileTooCloseToBucket(tx,ty)){
      return null;
    }
    opts.loop = !!(opts.loop || spawnConfig.boardLoop);
    opts.scale = (typeof opts.scale === 'number') ? opts.scale : spawnConfig.boardScale;
    if(window.soapDyn && typeof window.soapDyn.spawnBoardAt === 'function'){
      try{ return window.soapDyn.spawnBoardAt(tx, ty, opts); }catch(e){ warnOnce('spawnBoardAtErr','soapDyn.spawnBoardAt failed: '+(e&&e.message)); }
    }
    const pos = tileCenter(tx,ty);
    return createBoardDOMAtXY(pos.x, pos.y, opts);
  };

  // -------- bucket loop control (fallback) --------
  let _bucketLoopId = null;
  function ourStartBucketLoop(){
    if(_bucketLoopId) return;
    _bucketLoopId = setInterval(()=>{
      try{
        // use pre-warn variant
        window.spawnBucketOnPath(spawnConfig.bucketCountPerSpawn, { edge:getEdgeForDirection(dir.x,dir.y), src: spawnConfig.bucketSrc, lifeMs: spawnConfig.bucketLifeMs, preWarnMs: PRE_SPAWN_WARN_MS });
      }catch(e){
        console.warn('ourStartBucketLoop error', e);
      }
    }, Math.max(120, spawnConfig.bucketSpawnIntervalMs || 1000));
  }
  function ourStopBucketLoop(){
    if(_bucketLoopId){ clearInterval(_bucketLoopId); _bucketLoopId = null; }
  }
  if(typeof window.soapDyn.startBucketLoop !== 'function'){
    window.soapDyn.startBucketLoop = ourStartBucketLoop;
  }
  if(typeof window.soapDyn.stopBucketLoop !== 'function'){
    window.soapDyn.stopBucketLoop = ourStopBucketLoop;
  }

  function startBucketLoop_inner(){
    if(window.soapDyn && typeof window.soapDyn.startBucketLoop === 'function'){
      try{ window.soapDyn.startBucketLoop(); }catch(e){ warnOnce('startBucketLoopErr','soapDyn.startBucketLoop failed: '+(e&&e.message)); }
    } else {
      ourStartBucketLoop();
    }
  }
  function stopBucketLoop_inner(){
    if(window.soapDyn && typeof window.soapDyn.stopBucketLoop === 'function'){
      try{ window.soapDyn.stopBucketLoop(); }catch(e){ warnOnce('stopBucketLoopErr','soapDyn.stopBucketLoop failed: '+(e&&e.message)); }
    } else {
      ourStopBucketLoop();
    }
  }

  // -------- timer & gameover --------
  let timerStart = null, timerAccum = 0, timerRunning = false, timerRAF = null;
  const timerEl = document.getElementById('timer');
  const timerLabel = timerEl ? timerEl.querySelector('.label') : null;
  const timerFill = timerEl ? timerEl.querySelector('.fill') : null;
  function formatMS(ms){ const s=Math.floor(ms/1000); const mm=Math.floor(s/60).toString().padStart(2,'0'); const ss=(s%60).toString().padStart(2,'0'); return `${mm}:${ss}`; }
  function startTimer(){ if(timerRunning) return; timerRunning=true; timerStart=performance.now(); (function tick(now){ if(!timerRunning) return; const elapsed = timerAccum + (now - timerStart); if(timerLabel) timerLabel.textContent = formatMS(elapsed); if(timerFill) timerFill.style.width = `${Math.min(100,(elapsed/60000)*100)}%`; timerRAF = requestAnimationFrame(tick); })(performance.now()); }
  function pauseTimer(){ if(!timerRunning) return; timerRunning=false; if(timerRAF) cancelAnimationFrame(timerRAF); timerAccum += performance.now() - (timerStart || performance.now()); }
  function resetTimer(){ timerRunning=false; if(timerRAF) cancelAnimationFrame(timerRAF); timerStart=null; timerAccum=0; if(timerLabel) timerLabel.textContent='00:00'; if(timerFill) timerFill.style.width='0%'; }

  function triggerGameOver(msg){
    if(gameOver) return;
    gameOver = true; moving = false;
    try{ stopBucketLoop_inner(); }catch(e){}
    try{ pauseTimer(); }catch(e){}
    const gameOverMsg = document.getElementById('gameOverMsg');
    const gameOverModal = document.getElementById('gameOverModal');
    if(gameOverMsg) gameOverMsg.textContent = msg || '게임 오버';
    if(gameOverModal) gameOverModal.classList.add('visible');
  }

  // -------- movement loop (node-to-node) --------
  let lastTsMove = null;
  function loop(ts){
    if(gameOver) return;
    if(!lastTsMove) lastTsMove = ts;
    const dt = Math.min(0.05, (ts - lastTsMove)/1000);
    lastTsMove = ts;

    computeGrid();
    MOVE_EPS = Math.max(4, Math.min(tileW,tileH) * 0.12);

    if(moving){
      const nextI = node.i + dir.x, nextJ = node.j + dir.y;
      if(nextI < 0 || nextI > TILES_X || nextJ < 0 || nextJ > TILES_Y){ triggerGameOver('벽에 부딪혔습니다.'); return; }
      const target = nodePos(nextI,nextJ);
      const cur = getSoapCenter();
      const vx = target.x - cur.x, vy = target.y - cur.y;
      const dist = Math.hypot(vx,vy);
      if(dist <= MOVE_EPS){
        node.i = nextI; node.j = nextJ;
        placeSoapAtNode(node.i,node.j,'node');
        if(queuedDir){
          const ci = node.i + queuedDir.x, cj = node.j + queuedDir.y;
          if(!(ci<0||ci>TILES_X||cj<0||cj> TILES_Y)) applyDirection(queuedDir.x, queuedDir.y);
          queuedDir = null;
        }
      } else {
        const move = Math.min(MOVE_SPEED * dt, dist);
        const nx = cur.x + (vx/dist)*move, ny = cur.y + (vy/dist)*move;
        const s = soupEl();
        if(s){ s.style.left = nx + 'px'; s.style.top = ny + 'px'; }
      }
    }

    checkCollisions();
    requestAnimationFrame(loop);
  }

  function applyOrQueue(dx,dy){
    const cur = getSoapCenter();
    const center = nodePos(node.i,node.j);
    const dist = Math.hypot(cur.x-center.x, cur.y-center.y);
    if(dist <= MOVE_EPS + 0.5){
      applyDirection(dx,dy);
    } else {
      queuedDir = { x: dx, y: dy };
    }
  }

  // -------- input wiring --------
  const dirMap = { 'UP':{dx:0,dy:-1}, 'RIGHT':{dx:1,dy:0}, 'DOWN':{dx:0,dy:1}, 'LEFT':{dx:-1,dy:0} };
  ['up','right','down','left'].forEach(id=>{
    const btn = document.getElementById(id+'-btn');
    if(!btn) return;
    btn.addEventListener('pointerdown', e=>{
      e.preventDefault();
      const key = id.toUpperCase(); const info = dirMap[key];
      applyOrQueue(info.dx, info.dy);
      if(!moving){ moving = true; lastTs = null; requestAnimationFrame(loop); }
    }, { passive:false });
  });
  window.addEventListener('keydown', function(e){
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const map = { ArrowUp:'UP', ArrowRight:'RIGHT', ArrowDown:'DOWN', ArrowLeft:'LEFT' }[e.key];
    const info = dirMap[map];
    applyOrQueue(info.dx, info.dy);
    if(!moving){ moving = true; lastTs = null; requestAnimationFrame(loop); }
  }, { passive:false });

  // -------- countdown / dust effect --------
  const countdownModal = document.getElementById('countdownModal');
  const countNumberEl = document.getElementById('countNumber');

  function runCountdown(startNum=3, onComplete){
    let n = startNum;
    function showNext(){
      if(n <= 0){
        if(countdownModal){ countdownModal.style.display = 'none'; countdownModal.classList.remove('show'); }
        if(typeof onComplete === 'function') onComplete();
        return;
      }
      if(countNumberEl){
        countNumberEl.textContent = String(n);
        countNumberEl.classList.remove('pop');
        void countNumberEl.offsetWidth;
        countNumberEl.classList.add('pop');
      } else {
        warnOnce('countNumberMissing','runCountdown: countNumberEl not found — skipping visual countdown.');
      }
      n--;
      setTimeout(showNext, 900);
    }
    if(countdownModal){ countdownModal.style.display = 'flex'; countdownModal.classList.add('show'); countdownModal.style.background = 'transparent'; }
    setTimeout(showNext, 120);
  }

  function spawnDustAt(x,y,count){
    const root = document.getElementById('dynamic-root') || document.body;
    for(let i=0;i<count;i++){
      const d = document.createElement('div');
      d.className = 'dust';
      const size = 6 + Math.round(Math.random()*8);
      d.style.width = size + 'px';
      d.style.height = size + 'px';
      d.style.left = (x + (Math.random()*20-10)) + 'px';
      d.style.top  = (y + (Math.random()*8-4)) + 'px';
      d.style.background = 'rgba(120,160,200,0.9)';
      d.style.opacity = '0.9';
      d.style.transform = 'translate(-50%,-50%) scale(0.6)';
      d.style.borderRadius = '50%';
      d.style.transition = 'transform 420ms cubic-bezier(.2,.9,.2,1), opacity 420ms linear';
      d.style.position = 'absolute';
      root.appendChild(d);
      (function(el){
        requestAnimationFrame(()=>{
          el.style.transform = `translate(-50%,-50%) scale(${1.4 + Math.random()*0.6})`;
          el.style.opacity = '0';
          setTimeout(()=>{ try{ el.remove(); }catch(_){} }, 520);
        });
      })(d);
    }
  }

  // -------- init flow --------
  function initFlow(){
    computeGrid();
    node.i = spawnNode.i; node.j = spawnNode.j;
    placeSoapAtNode(spawnNode.i, spawnNode.j, 'node');
    const s = soupEl();
    if(s) s.style.transform = 'translate(-50%,-50%) rotate(90deg)';

    if(spawnConfig.boardShowOnStart){
      try{
        if(window.soapDyn && typeof window.soapDyn.spawnBoardRandom === 'function'){
          window.soapDyn.spawnBoardRandom({ avoid: { i: spawnNode.i, j: spawnNode.j }, scale: spawnConfig.boardScale, src: spawnConfig.boardSrc, loop: spawnConfig.boardLoop });
        } else {
          const candidates = [];
          for(let tx=0; tx<TILES_X; tx++){
            for(let ty=0; ty<TILES_Y; ty++){
              if(ty === TILES_Y-1) continue;
              const dx = Math.abs(tx - spawnNode.i);
              const dy = Math.abs(ty - spawnNode.j);
              if(dx <= 1 && dy <= 1) continue;
              // ensure board not adjacent to buckets
              if(isTileTooCloseToBucket(tx,ty)) continue;
              candidates.push({tx,ty});
            }
          }
          if(candidates.length>0){
            const pick = candidates[Math.floor(Math.random()*candidates.length)];
            window.spawnBoardAtTile(pick.tx, pick.ty, { src: spawnConfig.boardSrc, scale: spawnConfig.boardScale, loop: spawnConfig.boardLoop });
          }
        }
      } catch(e){ warnOnce('spawnBoardOnStartFail','spawnBoard failed: '+(e && e.message)); }
    }

    if(s){
      s.classList.remove('soup_spawn','soup_landed');
      void s.offsetWidth;
      s.classList.add('soup_spawn');
      s.addEventListener('animationend', function onEnd(){
        s.classList.remove('soup_spawn');
        s.classList.add('soup_landed');
        const c = nodePos(spawnNode.i, spawnNode.j);
        spawnDustAt(c.x, c.y, 6);
        s.removeEventListener('animationend', onEnd);
      }, { once:true });
    }

    runCountdown(3, ()=>{
      moving = true; lastTs = null;
      startTimer();
      requestAnimationFrame(loop);

      // schedule bucket start after configured delay
      setTimeout(()=>{
        try{ spawnInitialBuckets(2); }catch(e){ console.warn('spawnInitialBuckets failed', e); }
        try{ startBucketLoop_inner(); }catch(e){ console.warn('startBucketLoop_inner failed', e); }
      }, Math.max(0, Number(spawnConfig.bucketStartDelayMs) || 0));
    });
  }

  // -------- graceful start --------
  setTimeout(()=>{
    try{ computeGrid(); placeSoapAtNode(node.i, node.j, 'node'); }catch(e){}
    try{ initFlow(); }catch(e){ warnOnce('initFlowErr','initFlow failed: ' + (e && e.message)); }
  }, 120);

  // expose clearAll - now cleans pre-spawn overlays and timers too
  window.clearAll = function(){
    try{ window.soapDyn && window.soapDyn.clearAll && window.soapDyn.clearAll(); }catch(e){}
    try{
      // clear bucket timers and overlays
      document.querySelectorAll('.bucket').forEach(el=>{
        clearWarningAndTimersForEl(el);
        try{ el.remove(); }catch(_){}
      });
      // clear pre-spawn overlays (class pre-spawn-warning)
      document.querySelectorAll('.pre-spawn-warning').forEach(el=>{
        try{ el._pulseInterval && clearInterval(el._pulseInterval); }catch(_){}
        try{ el.remove(); }catch(_){}
      });
      // clear boards
      document.querySelectorAll('.board').forEach(el=>{ try{ el.remove(); }catch(_){}
      });
      // reset soapDyn states
      if(window.soapDyn && window.soapDyn._state){
        window.soapDyn._state.buckets = [];
        window.soapDyn._state.boards = [];
      }
    }catch(e){}
    ourStopBucketLoop();
  };

  window.addEventListener('resize', ()=>{ computeGrid(); placeSoapAtNode(node.i, node.j, 'node'); });

  // -------- helper: get tiles along soap's forward path (defined earlier but keep here) --------
  function getPathTiles(maxSteps){
    computeGrid();
    const tiles = [];
    const sx = node.i, sy = node.j;
    let dx = (queuedDir && typeof queuedDir.x === 'number') ? queuedDir.x : dir.x;
    let dy = (queuedDir && typeof queuedDir.y === 'number') ? queuedDir.y : dir.y;
    if(dx === 0 && dy === 0){
      dx = dir.x || 0; dy = dir.y || -1;
      if(dx === 0 && dy === 0){ dy = -1; }
    }
    const maxS = Math.max(1, (typeof maxSteps === 'number') ? maxSteps : Math.max(TILES_X,TILES_Y));
    let tx = sx, ty = sy;
    for(let step=0; step<maxS; step++){
      tx += dx; ty += dy;
      if(tx < 0 || tx > TILES_X-1 || ty < 0 || ty > TILES_Y-1) break;
      tiles.push({tx,ty});
    }
    return tiles;
  }

})();
