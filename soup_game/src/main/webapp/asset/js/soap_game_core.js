// soap_game_core.js (edge-spawn + pre-spawn overlay support)
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
    windowSrc: '../asset/mvi/window_color.png',
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

  // fixed game duration for scheduling (not auto game-over)
  let GAME_DURATION_MS = 30000;

  // pre-spawn warning (ms)
  const PRE_SPAWN_WARN_MS = 2000;
  // lifecycle pre-remove warning (ms) - bucket warns before disappearing
  const WARN_BEFORE_MS = 2000;

  // -------- canvas/helpers --------
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

  // -------- utilities --------
  function warnOnce(key, msg){
    if(!warnOnce._s) warnOnce._s = new Set();
    if(!warnOnce._s.has(key)){ warnOnce._s.add(key); console.warn(msg); }
  }

  // -------- grid params --------
  const MOVE_SPEED = 100; // px / sec
  const TILES_X = 4, TILES_Y = 4;
  const PLAYABLE_BOX = { left:0.17, top:0.14, right:0.83, bottom:0.86 };

  let pixelNodesX = new Array(TILES_X+1).fill(0);
  let pixelNodesY = new Array(TILES_Y+1).fill(0);
  let gridLeft=0, gridTop=0, tileW=0, tileH=0;

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
  // tile edge midpoint helper — **중요: 경계선 위치 반환**
  function tileEdgeMid(tx,ty, edge){
    const t = tileCenter(tx,ty);
    if(edge === 'bottom') return { x: t.x, y: Math.round(gridTop + (ty+1) * tileH) };
    if(edge === 'left')   return { x: Math.round(gridLeft + tx * tileW), y: t.y };
    if(edge === 'right')  return { x: Math.round(gridLeft + (tx+1) * tileW), y: t.y };
    if(edge === 'random'){ const arr = ['top','bottom','left','right']; return tileEdgeMid(tx,ty, arr[Math.floor(Math.random()*4)]); }
    // default top
    return { x: t.x, y: Math.round(gridTop + ty * tileH) };
  }

  // -------- soup helpers --------
  function soupEl(){ return document.getElementById('soup_item'); }
  function dynamicRoot(){ return document.getElementById('dynamic-root') || document.body; }

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
  let dir = { x:0, y:-1 };
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

  // -------- adjacency checks --------
  function tileDistanceChebyshev(a_tx, a_ty, b_tx, b_ty){
    return Math.max(Math.abs(a_tx - b_tx), Math.abs(a_ty - b_ty));
  }
  function isTileTooCloseToBoard(tx, ty){
    try{
      computeGrid();
      const boards = document.querySelectorAll('.board');
      for(const b of boards){
        const r = b.getBoundingClientRect();
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
  function isTileTooCloseToBucket(tx, ty){
    try{
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
  function isTileInvalidForBucket(tx,ty){
    if(tx < 0 || ty < 0 || tx >= TILES_X || ty >= TILES_Y) return true;
    if(ty === TILES_Y-1) return true;
    if(isTileTooCloseToBoard(tx,ty)) return true;
    if(isTileTooCloseToBucket(tx,ty)) return true;
    return false;
  }

  // -------- collisions + clear check --------
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

      const wnd = document.querySelector('.game-window');
      if(wnd){
        const wr = wnd.getBoundingClientRect();
        const wcx = wr.left + wr.width/2;
        const wcy = wr.top + wr.height/2;
        const clearRadius = Math.max(12, Math.min(wr.width, wr.height) * 0.25);
        const dist = Math.hypot(sx - wcx, sy - wcy);
        if(dist <= clearRadius){
          triggerGameClear('창문으로 탈출했습니다! 게임 클리어!');
          return;
        }
      }

    }catch(e){}
  }

  // -----------------------
  // bucket creation & lifecycle
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

  function attachWarningToEl(el, lifeMs){
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
    if(el._preSpawnOverlay){
      try{ clearTimeout(el._preSpawnOverlay.removeTimeout); }catch(_){}
      try{ el._preSpawnOverlay.el.remove(); }catch(_){}
      el._preSpawnOverlay = null;
    }
  }

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

    window.soapDyn._state = window.soapDyn._state || {};
    window.soapDyn._state.buckets = window.soapDyn._state.buckets || [];
    window.soapDyn._state.buckets.push({ el });

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
          if(opts && opts.avoid && opts.avoid.i === tx && opts.avoid.j === ty) continue;
          if(isTileTooCloseToBucket(tx,ty)) continue;
          candidates.push({tx,ty});
        }
      }
      if(candidates.length === 0) return null;
      const p = candidates[Math.floor(Math.random()*candidates.length)];
      return window.soapDyn.spawnBoardAt(p.tx, p.ty, opts || {});
    };
  }

  // -------- PRE-SPAWN WARNING UI (edge-based) --------
  function showPreSpawnWarningAtTile(tx, ty, opts){
    opts = opts || {};
    const boardEl = document.getElementById('game-board') || document.body;
    computeGrid();
    // IMPORTANT: default to edge position (not center)
    const pos = (opts.pos === 'center') ? tileCenter(tx,ty) : tileEdgeMid(tx,ty, opts.edge || 'top');

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
    overlay.style.transform = 'none';

    // --- [문제 2 해결] ---
    // 투명도(opacity)가 부드럽게 변하도록 transition 스타일을 추가합니다.
    overlay.style.transition = 'opacity 300ms linear';
    // ---------------------
    
    overlay._pulseInterval = null;

    (boardEl || document.body).appendChild(overlay);
    alignElementCenterAt(overlay, pos.x, pos.y);

    let on = false;
    overlay._pulseInterval = setInterval(()=>{ on = !on; overlay.style.opacity = on ? '1' : '0.25'; }, 330);

    const removeTimeout = setTimeout(()=>{ try{ if(overlay._pulseInterval) clearInterval(overlay._pulseInterval); overlay.remove(); }catch(_){ } }, PRE_SPAWN_WARN_MS + 150);

    return { el: overlay, removeTimeout, cancel: ()=>{ try{ if(overlay._pulseInterval) clearInterval(overlay._pulseInterval); }catch(_){ } try{ clearTimeout(removeTimeout); }catch(_){ } try{ overlay.remove(); }catch(_){ } } };
  }

  // helper: decide tile edge based on movement direction
  function getEdgeForDirection(dx, dy){
    if(dx === 1) return 'left';
    if(dx === -1) return 'right';
    if(dy === 1) return 'top';
    if(dy === -1) return 'bottom';
    return 'top';
  }

  // -------- spawnBucketOnPath (keeps pre-warn) --------
  window.spawnBucketOnPath = function(spawnCount, opts){
    spawnCount = Math.max(1, Math.floor(spawnCount||1));
    opts = opts || {};
    computeGrid();
    const path = getPathTiles(Math.max(TILES_X, TILES_Y));
    const preWarnMs = (typeof opts.preWarnMs === 'number') ? opts.preWarnMs : PRE_SPAWN_WARN_MS;

    const doSpawn = (tiles) => {
      for(const pick of tiles){
        if(isTileInvalidForBucket(pick.tx, pick.ty)) continue;
        const edge = getEdgeForDirection(dir.x, dir.y);
        const spawnOpts = Object.assign({ pos:'edge', edge: edge, src: spawnConfig.bucketSrc, lifeMs: spawnConfig.bucketLifeMs }, opts || {});
        try{ window.spawnBucketAtTile(pick.tx, pick.ty, spawnOpts); }catch(e){ console.warn('spawnBucketOnPath spawn fail', e); }
      }
    };

    if(!path || path.length === 0){
      const fallbackI = node.i + (dir.x || 0), fallbackJ = node.j + (dir.y || -1);
      const candidates = [];
      for(let rx = Math.max(0,fallbackI-1); rx <= Math.min(TILES_X-1,fallbackI+1); rx++){
        for(let ry = Math.max(0,fallbackJ-1); ry <= Math.min(TILES_Y-1,fallbackJ+1); ry++){
          if(!isTileInvalidForBucket(rx,ry)) candidates.push({tx:rx,ty:ry});
        }
      }
      if(candidates.length === 0) return;
      const picks = [];
      while(picks.length < spawnCount && candidates.length > 0){
        const idx = Math.floor(Math.random()*candidates.length);
        picks.push(candidates.splice(idx,1)[0]);
      }
      const overlays = [];
      for(const p of picks) overlays.push(showPreSpawnWarningAtTile(p.tx, p.ty, { pos: 'edge', edge: getEdgeForDirection(dir.x,dir.y) }));
      setTimeout(()=>{ for(const ov of overlays) { try{ ov.cancel(); }catch(_){}}; doSpawn(picks); }, preWarnMs);
      return;
    }

    const candidates = path.filter(p => !isTileInvalidForBucket(p.tx, p.ty));
    if(candidates.length === 0) return;
    const weighted = [];
    for(let i=0;i<candidates.length;i++){
      const rep = Math.max(1, Math.floor((candidates.length - i)/1));
      for(let r=0;r<rep;r++) weighted.push(candidates[i]);
    }
    const picks = [];
    while(picks.length < spawnCount && weighted.length > 0){
      const idx = Math.floor(Math.random()*weighted.length);
      const pick = weighted.splice(idx,1)[0];
      for(let w=weighted.length-1; w>=0; w--){
        if(weighted[w].tx === pick.tx && weighted[w].ty === pick.ty) weighted.splice(w,1);
      }
      picks.push(pick);
    }

    const overlays = [];
    for(const p of picks){
      overlays.push(showPreSpawnWarningAtTile(p.tx, p.ty, { pos: 'edge', edge: getEdgeForDirection(dir.x,dir.y) }));
    }
    setTimeout(()=>{
      for(const ov of overlays){ try{ ov.cancel(); }catch(_){} }
      doSpawn(picks);
    }, preWarnMs);
  };

  // -------- spawnInitialBuckets uses pre-warn as well --------
  function spawnInitialBuckets(count = 1){
    computeGrid();
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

  // -------- spawnBucketAtTile: edge-only default + preWarn scheduling --------
  // NOTE: If opts.preWarnMs > 0, this will schedule the spawn and return { scheduled:true, cancel:fn }.
  // If preWarnMs is 0 (or omitted), spawn happens immediately and {el} is returned (synchronous).
  window.spawnBucketAtTile = function(tx, ty, opts){
    computeGrid();
    opts = opts || {};
    // ensure spawn is on edge by default (not center)
    const edge = opts.edge || getEdgeForDirection(dir.x, dir.y) || 'top';
    const pos = tileEdgeMid(tx, ty, edge);

    // refuse if tile invalid (adjacent to board/bucket or bottom row)
    if(isTileInvalidForBucket(tx,ty)){
      return null;
    }

    const preWarnMs = (typeof opts.preWarnMs === 'number') ? opts.preWarnMs : 0;
    // If caller provided a soapDyn implementation, prefer delegating spawn immediately when no preWarn requested.
    if(preWarnMs > 0){
      // show overlay, schedule spawn
      const overlayObj = showPreSpawnWarningAtTile(tx, ty, { pos: 'edge', edge: edge });
      const timeoutId = setTimeout(()=>{
        try{
          overlayObj.cancel && overlayObj.cancel();
        }catch(_){}
        // delegate to soapDyn.spawnBucketAt if present (we align afterwards)
        try{
          if(window.soapDyn && typeof window.soapDyn.spawnBucketAt === 'function'){
            const res = window.soapDyn.spawnBucketAt(tx, ty, Object.assign({}, opts, { pos:'edge', edge: edge, src: opts.src || spawnConfig.bucketSrc, lifeMs: opts.lifeMs || spawnConfig.bucketLifeMs }));
            if(res && res.el && res.el instanceof HTMLElement){
              alignElementCenterAt(res.el, pos.x, pos.y);
              attachWarningToEl(res.el, opts.lifeMs || spawnConfig.bucketLifeMs);
              window.soapDyn._state = window.soapDyn._state || {}; window.soapDyn._state.buckets = window.soapDyn._state.buckets || [];
              window.soapDyn._state.buckets.push({ el: res.el });
            }
            return;
          }
        }catch(e){ console.warn('soapDyn.spawnBucketAt threw, falling back', e); }
        // fallback create
        try{
          createBucketDOMAtXY(pos.x, pos.y, Object.assign({}, opts, { pos:'edge', edge: edge }));
        }catch(e){ console.warn('createBucketDOMAtXY failed', e); }
      }, preWarnMs);

      return {
        scheduled: true,
        cancel: function(){
          try{ clearTimeout(timeoutId); }catch(_){}
          try{ overlayObj.cancel && overlayObj.cancel(); }catch(_){}
        }
      };
    } else {
      // immediate spawn (synchronous)
      if(window.soapDyn && typeof window.soapDyn.spawnBucketAt === 'function'){
        try{
          const res = window.soapDyn.spawnBucketAt(tx, ty, Object.assign({}, opts, { pos:'edge', edge: edge, src: opts.src || spawnConfig.bucketSrc, lifeMs: opts.lifeMs || spawnConfig.bucketLifeMs }));
          if(res && res.el && res.el instanceof HTMLElement){
            alignElementCenterAt(res.el, pos.x, pos.y);
            attachWarningToEl(res.el, opts.lifeMs || spawnConfig.bucketLifeMs);
            window.soapDyn._state = window.soapDyn._state || {}; window.soapDyn._state.buckets = window.soapDyn._state.buckets || [];
            window.soapDyn._state.buckets.push({ el: res.el });
          }
          return res;
        }catch(e){
          console.warn('spawnBucketAtTile: soapDyn.spawnBucketAt threw', e);
        }
      }
      return createBucketDOMAtXY(pos.x, pos.y, Object.assign({}, opts, { pos:'edge', edge: edge }));
    }
  };

  // -------- spawn board at tile center — ensure not adjacent to buckets --------
  window.spawnBoardAtTile = function(tx, ty, opts){
    computeGrid();
    opts = opts || {};
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

  // -------- window scheduling & soap bubble (kept from previous) --------
  let _windowSchedule = { showTimeout: null, bubbleTimeout: null, bubbleAutoRemove: null, windowEl: null, scheduledOpenMs: null };
  function getMediaDurationSeconds(src, cb){
    cb = cb || function(){};
    if(!src) return cb(0);
    const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(src);
    if(!isVideo) { cb(0); return; }
    try{
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.src = src;
      const onMeta = function(){ const d = Number(v.duration) || 0; cleanup(); cb(d); };
      const onErr = function(){ cleanup(); cb(0); };
      function cleanup(){ v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('error', onErr); try{ v.src = ''; }catch(_){} }
      v.addEventListener('loadedmetadata', onMeta, { once:true });
      v.addEventListener('error', onErr, { once:true });
      setTimeout(()=>{ try{ cleanup(); }catch(_){}; }, 4000);
    }catch(e){ cb(0); }
  }
  function spawnWindowAtTopCenter(opts){
    opts = opts || {};
    computeGrid();
    const boardEl = document.getElementById('game-board') || document.body;
    const midX = Math.floor(TILES_X/2);
    const t = tileCenter(midX, 0);
    const px = t.x;
    const py = Math.max(8, Math.round(gridTop - tileH * 0.35));
    const cont = document.createElement('div');
    cont.className = 'game-window';
    cont.style.position = 'absolute';
    cont.style.left = px + 'px';
    cont.style.top  = py + 'px';
    cont.style.transform = 'translate(-50%,-50%)';
    cont.style.pointerEvents = 'none';
    cont.style.zIndex = 1800;
    const src = opts.src || spawnConfig.windowSrc;
    const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(src);
    if(isVideo){
      const v = document.createElement('video');
      v.src = src;
      v.autoplay = true;
      v.muted = true;
      v.playsInline = true;
      v.loop = false;
      v.style.display = 'block';
      const maxW = Math.round(tileW * 1.6), maxH = Math.round(tileH * 1.2);
      v.style.maxWidth = Math.max(48, Math.min(256, maxW)) + 'px';
      v.style.maxHeight = Math.max(24, Math.min(256, maxH)) + 'px';
      v.addEventListener('ended', ()=>{ try{ v.pause(); }catch(_){} });
      cont.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = src || spawnConfig.windowSrc || '../asset/img/window_color.png';
      img.alt = 'window';
      img.style.display = 'block';
      img.style.maxWidth = Math.round(tileW * 1.6) + 'px';
      img.style.maxHeight = Math.round(tileH * 1.2) + 'px';
      cont.appendChild(img);
    }
    (boardEl || document.body).appendChild(cont);
    return cont;
  }

  function showSoapBubble(text){
    try{
      const s = soupEl();
      if(!s) return;
      if(!_soapBubbleEl){
        _soapBubbleEl = document.createElement('div');
        _soapBubbleEl.className = 'soap-bubble';
        _soapBubbleEl.style.position = 'absolute';
        _soapBubbleEl.style.pointerEvents = 'none';
        _soapBubbleEl.style.zIndex = 2000;
        _soapBubbleEl.style.transform = 'translate(-50%,-120%)';
        _soapBubbleEl.style.padding = '6px 10px';
        _soapBubbleEl.style.borderRadius = '10px';
        _soapBubbleEl.style.fontSize = '12px';
        _soapBubbleEl.style.background = 'rgba(255,255,255,0.95)';
        _soapBubbleEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        _soapBubbleEl.style.color = '#052b2f';
        _soapBubbleEl.style.whiteSpace = 'nowrap';
        document.body.appendChild(_soapBubbleEl);
      }
      _soapBubbleEl.textContent = text || '';
      const sr = s.getBoundingClientRect();
      _soapBubbleEl.style.left = (sr.left + sr.width/2) + 'px';
      _soapBubbleEl.style.top  = (sr.top - 8) + 'px';
      _soapBubbleEl.style.opacity = '1';
      if(_soapBubbleEl._autoHideTimer) clearTimeout(_soapBubbleEl._autoHideTimer);
      _soapBubbleEl._autoHideTimer = setTimeout(()=>{ hideSoapBubble(); }, 5000);
    }catch(e){ console.warn('showSoapBubble failed', e); }
  }
  function hideSoapBubble(){
    try{
      if(!_soapBubbleEl) return;
      if(_soapBubbleEl._autoHideTimer) clearTimeout(_soapBubbleEl._autoHideTimer);
      _soapBubbleEl.style.opacity = '0';
      setTimeout(()=>{ try{ _soapBubbleEl.remove(); _soapBubbleEl = null; }catch(_){ _soapBubbleEl=null; } }, 300);
    }catch(e){ _soapBubbleEl = null; }
  }
  let _soapBubbleEl = null;

  function clearScheduledWindow(){
    try{ if(_windowSchedule.showTimeout) clearTimeout(_windowSchedule.showTimeout); }catch(_){}
    try{ if(_windowSchedule.bubbleTimeout) clearTimeout(_windowSchedule.bubbleTimeout); }catch(_){}
    try{ if(_windowSchedule.bubbleAutoRemove) clearTimeout(_windowSchedule.bubbleAutoRemove); }catch(_){}
    try{ if(_windowSchedule.windowEl){ _windowSchedule.windowEl.remove(); _windowSchedule.windowEl = null; } }catch(_){}
    _windowSchedule = { showTimeout: null, bubbleTimeout: null, bubbleAutoRemove: null, windowEl: null, scheduledOpenMs: null };
  }

  function scheduleWindowOnGameStart(){
    clearScheduledWindow();
    const src = spawnConfig.windowSrc;
    getMediaDurationSeconds(src, function(durSec){
      const durMs = Math.round((Number(durSec) || 0) * 1000);
      const showAfter = Math.max(0, GAME_DURATION_MS - durMs);
      _windowSchedule.scheduledOpenMs = Date.now() + showAfter;
      const bubbleAt = Math.max(0, showAfter - 5000);
      _windowSchedule.showTimeout = setTimeout(()=>{
        try{ _windowSchedule.windowEl = spawnWindowAtTopCenter({ src: src }); }catch(e){ console.warn('spawnWindowAtTopCenter failed', e); }
      }, showAfter);
      _windowSchedule.bubbleTimeout = setTimeout(()=>{
        try{ showSoapBubble('창문이 5초 후에 열립니다!'); }catch(e){ console.warn('soap bubble failed', e); }
      }, bubbleAt);
      _windowSchedule.bubbleAutoRemove = setTimeout(()=>{ hideSoapBubble(); }, Math.max(0, showAfter + 100));
    });
  }

  window.spawnWindowNow = function(){
    clearScheduledWindow();
    _windowSchedule.windowEl = spawnWindowAtTopCenter({ src: spawnConfig.windowSrc });
  };

  // -------- timer (display only) & gameover/clear --------
  let timerStart = null, timerAccum = 0, timerRunning = false, timerRAF = null;
  const timerEl = document.getElementById('timer');
  const timerLabel = timerEl ? timerEl.querySelector('.label') : null;
  const timerFill = timerEl ? timerEl.querySelector('.fill') : null;
  function formatMS(ms){ const s=Math.floor(ms/1000); const mm=Math.floor(s/60).toString().padStart(2,'0'); const ss=(s%60).toString().padStart(2,'0'); return `${mm}:${ss}`; }
  function startTimer(){ if(timerRunning) return; timerRunning=true; timerStart=performance.now(); scheduleWindowOnGameStart(); (function tick(now){ if(!timerRunning) return; const elapsed = timerAccum + (now - timerStart); if(timerLabel) timerLabel.textContent = formatMS(Math.min(elapsed, GAME_DURATION_MS)); if(timerFill) timerFill.style.width = `${Math.min(100,(elapsed/GAME_DURATION_MS)*100)}%`; if(elapsed >= GAME_DURATION_MS){ try{ timerRunning = false; if(timerRAF) cancelAnimationFrame(timerRAF); timerAccum = GAME_DURATION_MS; }catch(_){ } return; } timerRAF = requestAnimationFrame(tick); })(performance.now()); }
  function pauseTimer(){ if(!timerRunning) return; timerRunning=false; if(timerRAF) cancelAnimationFrame(timerRAF); timerAccum += performance.now() - (timerStart || performance.now()); }
  function resetTimer(){ timerRunning=false; if(timerRAF) cancelAnimationFrame(timerRAF); timerStart=null; timerAccum=0; if(timerLabel) timerLabel.textContent='00:00'; if(timerFill) timerFill.style.width='0%'; clearScheduledWindow(); }

  function triggerGameOver(msg){
    if(gameOver) return;
    gameOver = true; moving = false;
    try{ stopBucketLoop_inner(); }catch(e){}
    try{ pauseTimer(); }catch(e){}
    const gameOverMsg = document.getElementById('gameOverMsg');
    const gameOverModal = document.getElementById('gameOverModal');
    if(gameOverMsg) gameOverMsg.textContent = msg || '게임 오버';
    if(gameOverModal) gameOverModal.classList.add('visible');
    clearScheduledWindow();
    hideSoapBubble();
  }

  function triggerGameClear(msg){
    if(gameOver) return;
    gameOver = true; moving = false;
    try{ stopBucketLoop_inner(); }catch(e){}
    try{ pauseTimer(); }catch(e){}
    const gameClearMsg = document.getElementById('gameClearMsg');
    const gameClearModal = document.getElementById('gameClearModal');
    if(gameClearMsg) gameClearMsg.textContent = msg || '게임 클리어';
    if(gameClearModal) gameClearModal.classList.add('visible');
    clearScheduledWindow();
    hideSoapBubble();
  }

  // -------- movement loop --------
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

  // -------- countdown / dust --------
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

        // --- [문제 1 해결] ---
        // 애니메이션이 끝난 후 강제로 회전 각도를 다시 90도로 설정합니다.
        s.style.transform = 'translate(-50%,-50%) rotate(90deg)';
        // ---------------------

        const c = nodePos(spawnNode.i, spawnNode.j);
        spawnDustAt(c.x, c.y, 6);
        s.removeEventListener('animationend', onEnd);
      }, { once:true });
    }

    runCountdown(3, ()=>{
      moving = true; lastTs = null;
      startTimer();
      requestAnimationFrame(loop);

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

  // expose clearAll
  window.clearAll = function(){
    try{ window.soapDyn && window.soapDyn.clearAll && window.soapDyn.clearAll(); }catch(e){}
    try{
      document.querySelectorAll('.bucket').forEach(el=>{
        clearWarningAndTimersForEl(el);
        try{ el.remove(); }catch(_){}
      });
      document.querySelectorAll('.pre-spawn-warning').forEach(el=>{
        try{ el._pulseInterval && clearInterval(el._pulseInterval); }catch(_){}
        try{ el.remove(); }catch(_){}
      });
      document.querySelectorAll('.board').forEach(el=>{ try{ el.remove(); }catch(_){}
      });
      const win = document.querySelector('.game-window'); if(win) try{ win.remove(); }catch(_){}
      if(window.soapDyn && window.soapDyn._state){
        window.soapDyn._state.buckets = [];
        window.soapDyn._state.boards = [];
      }
      clearScheduledWindow();
      hideSoapBubble();
    }catch(e){}
    ourStopBucketLoop();
  };

  window.addEventListener('resize', ()=>{ computeGrid(); placeSoapAtNode(node.i, node.j, 'node'); });

  // -------- helper: path tiles --------
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
