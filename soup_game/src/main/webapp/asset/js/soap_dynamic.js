// soap_dynamic.js
// Dynamic manager for buckets and boards.
// - places boards at tile center
// - video boards play once; on 'ended' they are replaced by a static image snapshot (last frame)
// - collision checks use DOM bounding boxes (soap center vs board/buckets)
(function(){
  'use strict';
  if(window.soapDyn) return;

  const TILES_X = 4, TILES_Y = 4;
  const PLAYABLE_BOX = { left:0.17, top:0.14, right:0.83, bottom:0.86 };

  const state = {
    buckets: [],
    board: null,
    bucketTimer: null,
    spawnConfig: {
      bucketSrc: '../asset/mvi/bucket_color.png',
      boardSrc:  '../asset/mvi/board_color.png',
      bucketSpawnIntervalMs: 3000,
      bucketLifeMs: 5000,
      boardScale: 1.0,
      boardLoop: false,
      boardShowOnStart: true
    }
  };

  function setSpawnConfig(cfg){ Object.assign(state.spawnConfig, cfg||{}); }

  function computeGridLocal(){
    const board = document.getElementById('game-board');
    const scene = document.getElementById('scene-img');
    if(!board || !scene) return null;
    const br = board.getBoundingClientRect(), sr = scene.getBoundingClientRect();
    const displayW = sr.width || br.width, displayH = sr.height || br.height;
    const leftLocal = Math.round(PLAYABLE_BOX.left * displayW);
    const rightLocal = Math.round(PLAYABLE_BOX.right * displayW);
    const topLocal = Math.round(PLAYABLE_BOX.top * displayH);
    const bottomLocal = Math.round(PLAYABLE_BOX.bottom * displayH);
    const gridLeft = leftLocal, gridTop = topLocal;
    const tileW = Math.max(1, (rightLocal - leftLocal) / TILES_X);
    const tileH = Math.max(1, (bottomLocal - topLocal) / TILES_Y);
    const pixelNodesX = new Array(TILES_X+1).fill(0), pixelNodesY = new Array(TILES_Y+1).fill(0);
    for(let i=0;i<=TILES_X;i++) pixelNodesX[i] = Math.round(gridLeft + i*tileW);
    for(let j=0;j<=TILES_Y;j++) pixelNodesY[j] = Math.round(gridTop + j*tileH);
    return { gridLeft, gridTop, tileW, tileH, pixelNodesX, pixelNodesY, boardRect: br };
  }

  function tileCenterLocal(tx,ty){
    const g = computeGridLocal();
    if(!g) return { x:0,y:0,w:0,h:0 };
    const ti = Math.max(0, Math.min(TILES_X-1, tx));
    const tj = Math.max(0, Math.min(TILES_Y-1, ty));
    const cx = g.gridLeft + (ti + 0.5) * g.tileW;
    const cy = g.gridTop + (tj + 0.5) * g.tileH;
    return { x: Math.round(cx), y: Math.round(cy), w: g.tileW, h: g.tileH };
  }

  // --- [문제 3 해결] ---
  // core 파일의 tileEdgeMid 함수를 dynamic 파일용으로 복사/수정
  function tileEdgeMidLocal(tx, ty, edge) {
    const g = computeGridLocal();
    if (!g) return { x: 0, y: 0 };
    
    const ti = Math.max(0, Math.min(TILES_X - 1, tx));
    const tj = Math.max(0, Math.min(TILES_Y - 1, ty));
    const cx = g.gridLeft + (ti + 0.5) * g.tileW;
    const cy = g.gridTop + (tj + 0.5) * g.tileH;
    const t = { x: Math.round(cx), y: Math.round(cy) };

    if (edge === 'bottom') return { x: t.x, y: Math.round(g.gridTop + (tj + 1) * g.tileH) };
    if (edge === 'left') return { x: Math.round(g.gridLeft + ti * g.tileW), y: t.y };
    if (edge === 'right') return { x: Math.round(g.gridLeft + (ti + 1) * g.tileW), y: t.y };
    if (edge === 'random') {
      const arr = ['top', 'bottom', 'left', 'right'];
      return tileEdgeMidLocal(tx, ty, arr[Math.floor(Math.random() * 4)]);
    }
    // default top
    return { x: t.x, y: Math.round(g.gridTop + tj * g.tileH) };
  }
  // ---------------------

  function clearAll(){
    try{
      state.buckets.forEach(b=>{ try{ b._to && clearTimeout(b._to); b.el.pause && b.el.pause(); b.el.remove(); }catch(_){} });
      state.buckets = [];
      if(state.board && state.board.el) try{ state.board.el.remove(); }catch(_){}
      state.board = null;
      if(state.bucketTimer){ clearInterval(state.bucketTimer); state.bucketTimer = null; }
    }catch(e){ console.warn('soap_dynamic.clearAll err', e); }
  }

  function isVideoSrc(src){
    return /\.(webm|mp4|ogg)$/i.test(src);
  }
  function isImageSrc(src){
    return /\.(png|apng|gif|webp|jpe?g|svg)$/i.test(src);
  }

  // spawnBucketAt: same as before (image/video/div)
  function spawnBucketAt(tx,ty, opts){
    opts = opts || {};
    const g = computeGridLocal(); if(!g) return null;

    // --- [문제 3 해결] ---
    // opts에 edge 정보가 있으면 tileEdgeMidLocal을, 없으면 tileCenterLocal을 사용
    const useEdge = opts.pos === 'edge' && opts.edge;
    const pos = useEdge
      ? tileEdgeMidLocal(tx, ty, opts.edge)
      : tileCenterLocal(tx, ty);
    // ---------------------

    //const tile = tileCenterLocal(tx,ty);
    const size = Math.round(Math.min(g.tileW, g.tileH) * (opts.scale || 0.9));
    const src = opts.src || state.spawnConfig.bucketSrc || '';
    const root = document.getElementById('dynamic-root') || document.body;

    let el = null;
    if(isVideoSrc(src)){
      el = document.createElement('video');
      el.src = src;
      el.muted = true; el.playsInline = true; el.loop = !!opts.loop;
      el.preload = 'auto';
      el.style.width = size + 'px'; el.style.height = size + 'px';
      el.style.position = 'absolute';
      // [수정] tile.x, tile.y 대신 pos.x, pos.y 사용
      el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px';
      el.style.transform = 'translate(-50%,-50%)'; el.style.pointerEvents='none'; el.style.zIndex = 1400;
      root.appendChild(el);
      el.play && el.play().catch(()=>{});
    } else if(isImageSrc(src)){
      el = document.createElement('img');
      el.src = src;
      el.draggable = false;
      el.style.width = size + 'px'; el.style.height = size + 'px';
      el.style.objectFit = 'cover';
      el.style.position = 'absolute';
      // [수정] tile.x, tile.y 대신 pos.x, pos.y 사용
      el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px';
      el.style.transform = 'translate(-50%,-50%)'; el.style.pointerEvents='none'; el.style.zIndex = 1400;
      root.appendChild(el);
    } else {
      el = document.createElement('div');
      el.style.width = size + 'px'; el.style.height = size + 'px';
      el.style.position = 'absolute';
      // [수정] tile.x, tile.y 대신 pos.x, pos.y 사용
      el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px';
      el.style.transform = 'translate(-50%,-50%)'; el.style.background = 'rgba(200,80,40,0.95)';
      el.style.borderRadius = Math.max(4, size*0.08)+'px';
      el.style.zIndex = 1400; el.style.pointerEvents='none';
      root.appendChild(el);
    }

    const obj = { el, tx, ty };
    state.buckets.push(obj);
    const life = opts.lifeMs || state.spawnConfig.bucketLifeMs;
    if(life && life > 0){
      obj._to = setTimeout(()=>{ try{ obj.el.pause && obj.el.pause(); obj.el.remove(); }catch(_){} state.buckets = state.buckets.filter(x=>x!==obj); }, life);
    }
    return obj;
  }

  function startBucketLoop(){
    stopBucketLoop();
    state.bucketTimer = setInterval(()=>{
      const candidates = [];
      for(let tx=0; tx<TILES_X; tx++){
        for(let ty=0; ty<TILES_Y; ty++){
          if(ty === TILES_Y-1) continue; // avoid bottom-most spawn row
          candidates.push({tx,ty});
        }
      }
      if(candidates.length===0) return;
      const pick = candidates[Math.floor(Math.random()*candidates.length)];
      spawnBucketAt(pick.tx, pick.ty, { src: state.spawnConfig.bucketSrc, lifeMs: state.spawnConfig.bucketLifeMs, scale: 0.9 });
    }, Math.max(150, state.spawnConfig.bucketSpawnIntervalMs || 1000));
  }
  function stopBucketLoop(){ if(state.bucketTimer){ clearInterval(state.bucketTimer); state.bucketTimer = null; } }

  // spawnBoardAtTile — centers on tile, plays video once then replaces with snapshot to preserve last frame
  function spawnBoardAtTile(tx,ty, opts){
    opts = opts || {};
    const tile = tileCenterLocal(tx,ty);
    const src = opts.src || state.spawnConfig.boardSrc || '';
    const scale = opts.scale || state.spawnConfig.boardScale || 1.0;
    const size = Math.round(Math.min(tile.w, tile.h) * (scale || 1));
    // remove existing board (we want only one at a time)
    if(state.board && state.board.el){ try{ state.board.el.remove(); }catch(_){} state.board = null; }
    const root = document.getElementById('dynamic-root') || document.body;
    let el = null;

    if(isImageSrc(src)){
      el = document.createElement('img');
      el.src = src; el.draggable=false;
      el.style.width = size + 'px'; el.style.height = size + 'px';
      el.style.objectFit = 'cover';
      el.style.position = 'absolute'; el.style.left = tile.x + 'px'; el.style.top = tile.y + 'px';
      el.style.transform = 'translate(-50%,-50%)'; el.style.pointerEvents='none'; el.style.zIndex = 1450;
      // fade in
      el.style.opacity = '0'; el.style.transition = 'opacity 160ms ease-out';
      root.appendChild(el);
      el.onload = ()=> el.style.opacity = '1';
      el.onerror = ()=> el.style.opacity = '1';
      state.board = { el, tx, ty, fixed: !!opts.fixed };
      return state.board;
    }

    if(isVideoSrc(src)){
      el = document.createElement('video');
      el.src = src;
      el.muted = true;
      el.playsInline = true;
      // ensure we play once — user asked "한번 재생" so loop must be false
      el.loop = !!(opts.loop !== undefined ? opts.loop : false);
      el.preload = 'auto';
      el.style.width = size + 'px'; el.style.height = size + 'px';
      el.style.objectFit = 'cover';
      el.style.position = 'absolute'; el.style.left = tile.x + 'px'; el.style.top = tile.y + 'px';
      el.style.transform = 'translate(-50%,-50%)'; el.style.pointerEvents='none'; el.style.zIndex = 1450;
      root.appendChild(el);

      // When ended -> replace with an <img> snapshot so last frame remains visible reliably
      const onEnded = function(){
        try{
          // draw current frame to canvas
          const cv = document.createElement('canvas');
          cv.width = el.videoWidth || size;
          cv.height = el.videoHeight || size;
          const ctx = cv.getContext('2d');
          try{
            ctx.drawImage(el, 0, 0, cv.width, cv.height);
            const data = cv.toDataURL('image/png');
            const img = document.createElement('img');
            img.src = data;
            img.draggable = false;
            img.style.width = size + 'px'; img.style.height = size + 'px';
            img.style.objectFit = 'cover';
            img.style.position = 'absolute'; img.style.left = tile.x + 'px'; img.style.top = tile.y + 'px';
            img.style.transform = 'translate(-50%,-50%)'; img.style.pointerEvents='none'; img.style.zIndex = 1450;
            // replace element
            try{ el.remove(); }catch(_){}
            root.appendChild(img);
            state.board = { el: img, tx, ty, fixed: true };
          }catch(e){
            // fallback: leave video element (it should show last frame in many browsers)
            try{ el.pause(); }catch(_){}
            state.board = { el: el, tx, ty, fixed: true };
          }
        }catch(e){
          try{ el.pause(); }catch(_){}
          state.board = { el: el, tx, ty, fixed: true };
        } finally {
          try{ el.removeEventListener('ended', onEnded); }catch(_){}
        }
      };

      el.addEventListener('ended', onEnded, { once:true });
      // try play (best-effort)
      el.play().catch(()=>{ /* autoplay might be blocked; still keep element */ });
      state.board = { el: el, tx, ty, fixed: true };
      return state.board;
    }

    // fallback: simple div block
    el = document.createElement('div');
    el.style.width = size + 'px'; el.style.height = size + 'px';
    el.style.position = 'absolute'; el.style.left = tile.x + 'px'; el.style.top = tile.y + 'px';
    el.style.transform = 'translate(-50%,-50%)'; el.style.background = 'rgba(0,150,120,0.12)';
    el.style.border = '2px solid rgba(0,150,120,0.18)'; el.style.zIndex = 1450; el.style.pointerEvents='none';
    root.appendChild(el);
    state.board = { el, tx, ty, fixed: true };
    return state.board;
  }

  function spawnBoardRandom(opts){
    opts = opts || {};
    const avoid = opts.avoid || null;
    const candidates = [];
    for(let tx=0; tx<TILES_X; tx++){
      for(let ty=0; ty<TILES_Y; ty++){
        if(ty === TILES_Y-1) continue; // avoid spawn row
        if(avoid){
          const dx = Math.abs(tx - (avoid.i||0));
          const dy = Math.abs(ty - (avoid.j||0));
          if(dx <= 1 && dy <= 1) continue;
        }
        candidates.push({tx,ty});
      }
    }
    if(candidates.length===0) return null;
    const pick = candidates[Math.floor(Math.random()*candidates.length)];
    return spawnBoardAtTile(pick.tx, pick.ty, { src: opts.src || state.spawnConfig.boardSrc, scale: opts.scale || state.spawnConfig.boardScale, fixed: true });
  }

  // collision check: x,y are soap center coords relative to game-board local coords
  function checkCollision(x,y){
    if(state.board && state.board.el){
      try{
        const br = document.getElementById('game-board').getBoundingClientRect();
        const r = state.board.el.getBoundingClientRect();
        const sx = br.left + x, sy = br.top + y;
        if(sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom) return true;
      }catch(e){ /* ignore */ }
    }
    if(state.buckets && state.buckets.length){
      const br = document.getElementById('game-board').getBoundingClientRect();
      for(const b of state.buckets.slice()){
        if(!b.el) continue;
        const r = b.el.getBoundingClientRect();
        const sx = br.left + x, sy = br.top + y;
        if(sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom) return true;
      }
    }
    return false;
  }

  window.soapDyn = {
    _state: state,
    setSpawnConfig,
    startBucketLoop,
    stopBucketLoop,
    spawnBucketAt,
    spawnBoardAtTile,
    spawnBoardRandom,
    clearAll,
    checkCollision
  };

  // cleanup
  window.addEventListener('beforeunload', ()=>{ try{ clearAll(); }catch(_){} });

})();
