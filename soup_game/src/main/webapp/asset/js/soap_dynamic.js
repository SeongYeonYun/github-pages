document.addEventListener('DOMContentLoaded', ()=>{

  // ===== spawnConfig (주석으로 설명) =====
  // bucketSpawnIntervalMs : 대야(버킷) 스폰 간격 (ms)
  // bucketLifeMs          : 대야 유지 시간 (ms)
  // bucketCountPerSpawn   : 한 스폰당 대야 개수
  // boardShowOnStart      : 카운트다운 끝나자마자 잎간판 생성 여부
  // boardScale            : 타일 대비 잎간판 크기
  const spawnConfig = {
    bucketSrc: '../asset/mvi/bucket_color2.webm',
    boardSrc:  '../asset/mvi/BOARD_COLOR.webm',
    bucketSpawnIntervalMs: 3000,
    bucketLifeMs: 5000,
    bucketCountPerSpawn: 1,
    boardShowOnStart: true,
    boardScale: 1.0,
    boardLoop: false
  };

  // small helper: warn once per key
  const _warned = new Set();
  function warnOnce(key, msg){
    if(!_warned.has(key)){
      console.warn(msg);
      _warned.add(key);
    }
  }

  // DOM (safe query)
  const board = document.getElementById('game-board');
  const sceneImg = document.getElementById('scene-img');
  const boardOverlay = document.getElementById('board-overlay');
  const soup = document.getElementById('soup_item');
  const dynamicRoot = document.getElementById('dynamic-root');
  const countdownModal = document.getElementById('countdownModal');
  const countNumberEl = document.getElementById('countNumber');
  const pauseBtn = document.getElementById('pauseBtn');
  const pauseModal = document.getElementById('pauseModal');
  const resumeBtn = document.getElementById('resumeBtn');
  const restartBtn = document.getElementById('restartBtn');
  const gameOverModal = document.getElementById('gameOverModal');
  const gameOverMsg = document.getElementById('gameOverMsg');
  const goRestart = document.getElementById('goRestart');
  const timerEl = document.getElementById('timer');
  const timerLabel = timerEl ? timerEl.querySelector('.label') : null;
  const timerFill = timerEl ? timerEl.querySelector('.fill') : null;
  const hud = document.getElementById('hud');

  if(!board) warnOnce('board-missing', 'Warning: #game-board not found.');
  if(!sceneImg) warnOnce('sceneimg-missing', 'Warning: #scene-img not found.');
  if(!soup) warnOnce('soup-missing', 'Warning: #soup_item not found.');
  if(!dynamicRoot) warnOnce('dynroot-missing', 'Warning: #dynamic-root not found — creating fallback root.');
  if(!timerEl) warnOnce('timer-missing', 'Warning: #timer not found.');
  if(timerEl && !timerLabel) warnOnce('timerlabel-missing', 'Warning: .label inside #timer not found.');
  if(timerEl && !timerFill) warnOnce('timerfill-missing', 'Warning: .fill inside #timer not found.');

  // fallback dynamic root (if missing)
  const dynRoot = dynamicRoot || (function(){
    const e = document.createElement('div');
    e.id = 'dynamic-root-fallback';
    e.style.position = 'absolute';
    e.style.left = '0';
    e.style.top = '0';
    document.body.appendChild(e);
    return e;
  })();

  // grid
  const TILES_X = 4, TILES_Y = 4;
  const PLAYABLE_BOX = { left:0.17, top:0.14, right:0.83, bottom:0.86 };
  let pixelNodesX = new Array(TILES_X+1).fill(0);
  let pixelNodesY = new Array(TILES_Y+1).fill(0);
  let gridLeft=0, gridTop=0, tileW=0, tileH=0;
  function computeGrid(){
    if(!board || !sceneImg){ warnOnce('computeGrid-missing', 'computeGrid aborted: missing board or sceneImg.'); return; }
    const boardRect = board.getBoundingClientRect();
    const imgRect = sceneImg.getBoundingClientRect();
    const naturalW = sceneImg.naturalWidth || imgRect.width;
    const naturalH = sceneImg.naturalHeight || imgRect.height;
    // avoid division by zero
    if(!naturalW || !naturalH){ warnOnce('natural-dim-zero', 'computeGrid: naturalW/H zero — using display sizes.'); }
    const displayW = imgRect.width || naturalW;
    const displayH = imgRect.height || naturalH;
    const scale = Math.max(displayW/(naturalW||displayW), displayH/(naturalH||displayH));
    const renderedW = naturalW * scale;
    const renderedH = naturalH * scale;
    const extraX = renderedW - displayW, extraY = renderedH - displayH;
    const imgLeftWindow = imgRect.left - (extraX/2);
    const imgTopWindow  = imgRect.top  - (extraY/2);

    const boxLeftWin = imgLeftWindow + PLAYABLE_BOX.left * renderedW;
    const boxRightWin = imgLeftWindow + PLAYABLE_BOX.right * renderedW;
    const boxTopWin = imgTopWindow + PLAYABLE_BOX.top * renderedH;
    const boxBottomWin = imgTopWindow + PLAYABLE_BOX.bottom * renderedH;

    gridLeft = boxLeftWin - boardRect.left;
    const rightLocal = boxRightWin - boardRect.left;
    gridTop = boxTopWin - boardRect.top;
    const bottomLocal = boxBottomWin - boardRect.top;

    tileW = Math.max(1, (rightLocal - gridLeft) / TILES_X);
    tileH = Math.max(1, (bottomLocal - gridTop) / TILES_Y);

    for(let i=0;i<=TILES_X;i++) pixelNodesX[i] = gridLeft + i*tileW;
    for(let j=0;j<=TILES_Y;j++) pixelNodesY[j] = gridTop + j*tileH;

    if(hud){ hud.style.display = 'block'; hud.textContent = `tile:${tileW.toFixed(1)}x${tileH.toFixed(1)}px`; }
  }

  function nodePos(i,j){ return { x: pixelNodesX[Math.max(0,Math.min(TILES_X,i))], y: pixelNodesY[Math.max(0,Math.min(TILES_Y,j))] }; }
  function tileCenter(tx,ty){ const ti = Math.max(0,Math.min(TILES_X-1,tx)); const tj = Math.max(0,Math.min(TILES_Y-1,ty)); const cx = gridLeft + (ti + 0.5) * tileW; const cy = gridTop + (tj + 0.5) * tileH; return { x: cx, y: cy, w: tileW, h: tileH }; }

  // player
  let node = { i: Math.floor(TILES_X/2), j: Math.floor(TILES_Y/2) };
  let dir = { x:1, y:0 };
  let queuedDir = null;
  let moving = false;
  let lastTs = null;
  let gameOver = false;
  let MOVE_EPS = 8;

  function placeSoapAtNode(i,j){
    if(!soup){ warnOnce('placeSoapNoSoup', 'placeSoapAtNode: #soup_item missing - skipping.'); return; }
    const p = nodePos(i,j);
    soup.style.left = p.x + 'px';
    soup.style.top  = p.y + 'px';
  }
  function getSoapCenter(){
    if(!soup || !board){ warnOnce('getSoapNoElements', 'getSoapCenter: soup or board missing - returning 0,0.'); return { x:0, y:0 }; }
    const s = soup.getBoundingClientRect();
    const b = board.getBoundingClientRect();
    const cx = (s.left + s.right)/2 - b.left;
    const cy = (s.top + s.bottom)/2 - b.top;
    return { x: cx, y: cy };
  }
  function applyDirection(dx,dy){
    if(Math.abs(dx)+Math.abs(dy)!==1) return;
    dir.x = dx; dir.y = dy; queuedDir = null;
    const angle = Math.atan2(dy,dx)*180/Math.PI;
    if(soup) soup.style.transform = `translate(-50%,-50%) rotate(${angle}deg)`;
  }

  // dynamic state
  const state = { buckets: [], board: null, bucketTimer: null };

  function createWarnArea(px, py, w, h, duration=300){
    const el = document.createElement('div');
    el.className = 'warn-area';
    el.style.width = (w||Math.min(tileW,tileH)) + 'px';
    el.style.height = (h||Math.min(tileW,tileH)) + 'px';
    el.style.left = px + 'px';
    el.style.top  = py + 'px';
    el.style.animation = `warnBlink ${duration}ms linear 1`;
    dynRoot.appendChild(el);
    if(duration>0){ setTimeout(()=>{ try{ el.remove(); }catch(_){} }, duration+60); }
    return el;
  }

  function spawnBucketAtNode(i,j, opts){
    if(gameOver) return;
    opts = opts||{};
    computeGrid();
    const soapCenter = getSoapCenter();
    const nodeP = nodePos(i,j);
    if(Math.hypot(soapCenter.x - nodeP.x, soapCenter.y - nodeP.y) < Math.min(tileW,tileH)*0.35) return null;

    const size = Math.round(Math.min(tileW,tileH) * (opts.scale || spawnConfig.bucketScale || 1));
    createWarnArea(nodeP.x, nodeP.y, size, size, 200);

    setTimeout(()=>{
      const v = document.createElement('video');
      v.className = 'bucket-video';
      v.src = opts.src || spawnConfig.bucketSrc;
      v.muted = true;
      v.playsInline = true;
      // 변경: 기본적으로 loop 끄기 -> 한 번 재생 후 'ended' 이벤트로 멈춤
      v.loop = !!(opts.loop !== undefined ? opts.loop : false);
      v.preload = 'auto';
      v.style.width = size + 'px';
      v.style.height = size + 'px';
      v.style.left = nodeP.x + 'px';
      v.style.top  = nodeP.y + 'px';
      v.style.setProperty('--tilt-deg', '0deg');
      v.style.setProperty('--pop-duration', '360ms');
      dynRoot.appendChild(v);
      void v.offsetWidth;
      v.classList.add('shown');

      // 재생이 끝나면 '고정(static)' 시킴 — transition 제거, shown 클래스 제거
      v.addEventListener('ended', function onEnded(){
        try{
          // pause at end so the last frame stays visible
          v.pause();
          // remove animated shown class to avoid further transitions
          v.classList.remove('shown');
          // prevent future CSS transitions/animations that could move it
          v.style.transition = 'none';
          // mark as static for CSS hooks if needed
          v.classList.add('static');
        }catch(_){}
        // remove this listener (cleanup)
        try{ v.removeEventListener('ended', onEnded); }catch(_){}
      }, { once:true });

      // try to play (some browsers may block, so ignore rejections)
      v.play().catch(()=>{});

      const bucketObj = { el:v, i,j };
      state.buckets.push(bucketObj);
      const lifeMs = (opts.lifeMs !== undefined ? opts.lifeMs : spawnConfig.bucketLifeMs);
      if(lifeMs && lifeMs>0){
        bucketObj._removeTimeout = setTimeout(()=>{
          try{ v.pause(); v.remove(); }catch(_){} 
          state.buckets = state.buckets.filter(x=>x!==bucketObj);
        }, lifeMs);
      }
    }, 200);
  }

  function spawnBoardAtTile(tx,ty, opts){
    if(gameOver) return;
    opts = opts||{};
    computeGrid();
    const tile = tileCenter(tx,ty);
    const size = Math.round(Math.min(tileW,tileH) * (opts.scale || spawnConfig.boardScale || 1));
    createWarnArea(tile.x, tile.y, size, size, 250);

    setTimeout(()=>{
      if(state.board && state.board.el){ try{ state.board.el.pause(); state.board.el.remove(); }catch(_){} state.board=null; }
      const v = document.createElement('video');
      v.className = 'board-video';
      v.src = opts.src || spawnConfig.boardSrc;
      v.muted = true;
      v.playsInline = true;
      v.loop = !!(opts.loop !== undefined ? opts.loop : spawnConfig.boardLoop);
      v.preload = 'auto';
      v.style.width = size + 'px';
      v.style.height = size + 'px';
      v.style.left = tile.x + 'px';
      v.style.top  = tile.y + 'px';
      v.style.setProperty('--tilt-deg', '45deg');
      v.style.setProperty('--pop-duration', '420ms');
      dynRoot.appendChild(v);
      void v.offsetWidth;
      v.classList.add('shown');
      v.loop = false;
      v.play().catch(()=>{});
      // keep element after play finished (stays fixed)
      v.addEventListener('ended', ()=>{ try{ v.pause(); }catch(_){} });
      state.board = { el:v, tx, ty };
    }, 150);
  }

  function randomNodeIndex(){ return { i: Math.floor(Math.random()*(TILES_X+1)), j: Math.floor(Math.random()*(TILES_Y+1)) }; }
  function randomTileIndex(){ return { tx: Math.floor(Math.random()*TILES_X), ty: Math.floor(Math.random()*TILES_Y) }; }

  function checkCollisions(){
    if(gameOver) return;
    const soap = getSoapCenter();
    const boardRect = board ? board.getBoundingClientRect() : { left:0, top:0 };
    const soapScreenX = boardRect.left + soap.x;
    const soapScreenY = boardRect.top + soap.y;
    if(state.board && state.board.el){
      const r = state.board.el.getBoundingClientRect();
      if(soapScreenX >= r.left && soapScreenX <= r.right && soapScreenY >= r.top && soapScreenY <= r.bottom){
        triggerGameOver('잎간판에 부딪혔습니다.');
        return;
      }
    }
    for(const b of state.buckets.slice()){
      if(!b.el) continue;
      const r = b.el.getBoundingClientRect();
      if(soapScreenX >= r.left && soapScreenX <= r.right && soapScreenY >= r.top && soapScreenY <= r.bottom){
        triggerGameOver('대야에 부딪혔습니다.');
        return;
      }
    }
  }

  // bucket loop: inner/outer wrappers kept but simplified for safety
  function startBucketLoop_inner(){
    stopBucketLoop_inner();
    state.bucketTimer = setInterval(()=>{
      computeGrid();
      for(let attempt=0; attempt<8; attempt++){
        const {i,j} = randomNodeIndex();
        const soapCenter = getSoapCenter();
        const p = nodePos(i,j);
        if(Math.hypot(soapCenter.x - p.x, soapCenter.y - p.y) < Math.min(tileW,tileH)*0.4) continue;
        const count = Math.max(1, Math.round(spawnConfig.bucketCountPerSpawn || 1));
        for(let k=0;k<count;k++) spawnBucketAtNode(i,j,{ lifeMs: spawnConfig.bucketLifeMs, scale: spawnConfig.bucketScale, src: spawnConfig.bucketSrc });
        break;
      }
    }, Math.max(100, spawnConfig.bucketSpawnIntervalMs || 1000));
  }
  function stopBucketLoop_inner(){ if(state.bucketTimer){ clearInterval(state.bucketTimer); state.bucketTimer=null; } }
  function startBucketLoop(){ startBucketLoop_inner(); } // alias
  function stopBucketLoop(){ stopBucketLoop_inner(); }
  function startBucketLoop_actual(){ startBucketLoop_inner(); }

  // timer
  let timerStart = null, timerAccum = 0, timerRunning=false, timerRAF=null;
  function formatMS(ms){ const s=Math.floor(ms/1000); const mm=Math.floor(s/60).toString().padStart(2,'0'); const ss=(s%60).toString().padStart(2,'0'); return `${mm}:${ss}`; }
  function startTimer(){ 
    if(timerRunning) return; 
    timerRunning=true; 
    timerStart=performance.now(); 
    function tick(now){
      if(!timerRunning) return;
      const elapsed = timerAccum + (now - timerStart);
      if (timerLabel) {
        timerLabel.textContent = formatMS(elapsed);
      } else {
        warnOnce('timerLabelMissingDuringTick','startTimer: timerLabel not found — skipping label update.');
      }
      if (timerFill) {
        timerFill.style.width = `${Math.min(100,(elapsed/60000)*100)}%`;
      } else {
        warnOnce('timerFillMissingDuringTick','startTimer: timerFill not found — skipping fill update.');
      }
      timerRAF = requestAnimationFrame(tick);
    }
    timerRAF = requestAnimationFrame(tick);
  }
  function pauseTimer(){ 
    if(!timerRunning) return; 
    timerRunning=false; 
    if(timerRAF) cancelAnimationFrame(timerRAF); 
    timerAccum += performance.now() - (timerStart || performance.now()); 
  }
  function resetTimer(){ 
    timerRunning=false; 
    if(timerRAF) cancelAnimationFrame(timerRAF); 
    timerStart=null; timerAccum=0; 
    if(timerLabel) timerLabel.textContent='00:00'; 
    if(timerFill) timerFill.style.width='0%'; 
  }

  function pauseGame(){ 
    if(gameOver) return; 
    moving=false; 
    stopBucketLoop(); 
    pauseTimer(); 
    state.buckets.forEach(b=>{ try{ b.el.pause(); }catch(_){} }); 
    if(state.board&&state.board.el) try{ state.board.el.pause(); }catch(_){} 
    if(pauseModal){ pauseModal.classList.add('visible'); pauseModal.setAttribute('aria-hidden','false'); } 
    else warnOnce('pauseModalMissing','pauseGame: pauseModal missing.');
  }
  function resumeGame(){ 
    if(pauseModal){ pauseModal.classList.remove('visible'); pauseModal.setAttribute('aria-hidden','true'); } 
    state.buckets.forEach(b=>{ try{ b.el.play().catch(()=>{}); }catch(_){} }); 
    if(state.board&&state.board.el) try{ state.board.el.play().catch(()=>{}); }catch(_){} 
    startBucketLoop(); 
    startTimer(); 
    moving=true; lastTs=null; 
    if(typeof loop === 'function') requestAnimationFrame(loop); 
  }

  if(pauseBtn) pauseBtn.addEventListener('click', (e)=>{ e.preventDefault(); pauseGame(); });
  if(resumeBtn) resumeBtn.addEventListener('click', (e)=>{ e.preventDefault(); resumeGame(); });
  if(restartBtn) restartBtn.addEventListener('click', (e)=>{ e.preventDefault(); location.reload(); });
  if(goRestart) goRestart.addEventListener('click', (e)=>{ e.preventDefault(); location.reload(); });

  function triggerGameOver(msg){
    if(gameOver) return;
    gameOver=true; moving=false; stopBucketLoop(); pauseTimer();
    state.buckets.forEach(b=>{ try{ b.el.pause(); }catch(_){} });
    if(state.board && state.board.el) try{ state.board.el.pause(); }catch(_){} 
    if(gameOverMsg) gameOverMsg.textContent = msg||'게임 오버'; 
    if(gameOverModal) gameOverModal.classList.add('visible'); 
    else warnOnce('gameOverModalMissing','triggerGameOver: gameOverModal missing.');
  }

  // movement
  const SPEED = 160;
  function loop(ts){
    if(gameOver) return;
    if(!lastTs) lastTs = ts;
    const dt = (ts - lastTs)/1000;
    lastTs = ts;
    computeGrid();
    MOVE_EPS = Math.max(6, Math.min(tileW,tileH)*0.16);
    if(moving){
      const nextI = node.i + dir.x, nextJ = node.j + dir.y;
      if(nextI < 0 || nextI > TILES_X || nextJ < 0 || nextJ > TILES_Y){ triggerGameOver('벽에 부딪혔습니다.'); return; }
      const target = nodePos(nextI,nextJ); const cur = getSoapCenter();
      const vx = target.x - cur.x, vy = target.y - cur.y;
      const dist = Math.hypot(vx,vy);
      if(dist <= MOVE_EPS){
        node.i = nextI; node.j = nextJ;
        placeSoapAtNode(node.i,node.j);
        if(queuedDir){
          const ci = node.i + queuedDir.x, cj = node.j + queuedDir.y;
          if(!(ci<0||ci>TILES_X||cj<0||cj> TILES_Y)) applyDirection(queuedDir.x, queuedDir.y);
          queuedDir = null;
        }
      } else {
        const move = Math.min(SPEED * dt, dist);
        const nx = cur.x + (vx/dist)*move, ny = cur.y + (vy/dist)*move;
        if(soup){ soup.style.left = nx + 'px'; soup.style.top = ny + 'px'; }
      }
    }
    checkCollisions();
    requestAnimationFrame(loop);
  }

  // input wiring
  const dirMap = { 'UP':{dx:0,dy:-1}, 'RIGHT':{dx:1,dy:0}, 'DOWN':{dx:0,dy:1}, 'LEFT':{dx:-1,dy:0} };
  ['up','right','down','left'].forEach(id=>{
    const btn = document.getElementById(id+'-btn');
    if(!btn) return;
    btn.addEventListener('pointerdown', e=>{
      e.preventDefault();
      const key = id.toUpperCase(); const info = dirMap[key];
      const cur = getSoapCenter(); const center = nodePos(node.i,node.j);
      const dist = Math.hypot(cur.x-center.x, cur.y-center.y);
      if(dist <= MOVE_EPS + 0.5){ applyDirection(info.dx, info.dy); } else { queuedDir = { x: info.dx, y: info.dy }; }
    }, { passive:false });
  });
  window.addEventListener('keydown', function(e){
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const map = { ArrowUp:'UP', ArrowRight:'RIGHT', ArrowDown:'DOWN', ArrowLeft:'LEFT' }[e.key];
    const info = dirMap[map];
    const cur = getSoapCenter(); const center = nodePos(node.i,node.j);
    const dist = Math.hypot(cur.x-center.x, cur.y-center.y);
    if(dist <= MOVE_EPS + 0.5){ applyDirection(info.dx, info.dy); } else { queuedDir = { x: info.dx, y: info.dy }; }
  }, { passive:false });

  // start/flow
  function afterCountdownStart(){
    if(spawnConfig.boardShowOnStart){
      const {tx,ty} = randomTileIndex();
      spawnBoardAtTile(tx,ty,{ src: spawnConfig.boardSrc, scale: spawnConfig.boardScale, loop: spawnConfig.boardLoop });
    }
    moving = true;
    lastTs = null;
    // start bucket loop and timer
    startBucketLoop_actual();
    startTimer();
    if(typeof loop === 'function') requestAnimationFrame(loop);
  }

  function runCountdown(startNum=3, onComplete){
    let n = startNum;
    function showNext(){
      if(n <= 0){
        if(countdownModal) countdownModal.style.display = 'none';
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
    if(countdownModal) countdownModal.style.display = 'flex';
    else warnOnce('countdownModalMissing','runCountdown: countdownModal not found.');
    setTimeout(showNext, 120);
  }

  function initFlow(){
    computeGrid();
    placeSoapAtNode(node.i,node.j);
    runCountdown(3, ()=>{ afterCountdownStart(); });
  }

  // ensure scene image loaded / fallback
  if(sceneImg && sceneImg.complete) { setTimeout(initFlow, 120); }
  else if(sceneImg){
    sceneImg.addEventListener('load', ()=>{ setTimeout(initFlow, 120); }, { once:true });
    setTimeout(()=>{ if(!sceneImg.complete) initFlow(); }, 800);
  } else {
    // no scene image: still try to init after small delay
    setTimeout(()=>{
      warnOnce('noSceneImgInit','No sceneImg element — running initFlow with reduced assumptions.');
      initFlow();
    }, 120);
  }

  // Expose simple API
  window.setSpawnConfig = (opts={})=>{ Object.assign(spawnConfig, opts||{}); if(state.bucketTimer){ stopBucketLoop(); startBucketLoop_actual(); } };
  window.clearAll = ()=>{ 
    stopBucketLoop(); 
    state.buckets.forEach(b=>{ try{ clearTimeout(b._removeTimeout); b.el.pause(); b.el.remove(); }catch(_){} }); 
    state.buckets=[]; 
    if(state.board && state.board.el){ try{ state.board.el.pause(); state.board.el.remove(); }catch(_){} } 
    state.board=null; 
  };

  // resize handler
  window.addEventListener('resize', ()=>{ computeGrid(); placeSoapAtNode(node.i,node.j); });

}); // DOMContentLoaded
