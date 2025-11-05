document.addEventListener('DOMContentLoaded', ()=>{

  // ===== spawnConfig (주석으로 설명) =====
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

  const _warned = new Set();
  function warnOnce(key, msg){
    if(!_warned.has(key)){
      console.warn(msg);
      _warned.add(key);
    }
  }

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

  // spawn tile (bottom middle)
  const spawnTile = { tx: Math.floor(TILES_X/2), ty: Math.max(0, TILES_Y-1) };
  function tileBottomCenter(tx, ty){
    const ti = Math.max(0, Math.min(TILES_X-1, tx));
    const tj = Math.max(0, Math.min(TILES_Y-1, ty));
    const x = gridLeft + (ti + 0.5) * tileW;
    const y = gridTop + (tj + 1) * tileH;
    return { x, y, w: tileW, h: tileH };
  }

  // player state
  let node = { i: spawnTile.tx, j: spawnTile.ty };
  let dir = { x:0, y:-1 }; // face UP initially
  let queuedDir = null;
  let moving = false;
  let lastTs = null;
  let gameOver = false;
  let MOVE_EPS = 8;

  function placeSoapAtNode(i,j, align){
    if(!soup){ warnOnce('placeSoapNoSoup', 'placeSoapAtNode: #soup_item missing - skipping.'); return; }
    if(align === 'bottom'){
      const t = tileBottomCenter(i,j);
      const offsetUp = Math.max(6, Math.round(Math.min(tileW, tileH) * 0.18));
      soup.style.left = t.x + 'px';
      soup.style.top  = (t.y - offsetUp) + 'px';
    } else {
      const p = nodePos(i,j);
      soup.style.left = p.x + 'px';
      soup.style.top  = p.y + 'px';
    }
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

      v.addEventListener('ended', function onEnded(){
        try{
          v.pause();
          v.classList.remove('shown');
          v.style.transition = 'none';
          v.classList.add('static');
        }catch(_){}
        try{ v.removeEventListener('ended', onEnded); }catch(_){}
      }, { once:true });

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

  // spawnBoardAtTile: creates a static board (no falling). Returns state.board or false if blocked.
  function spawnBoardAtTile(tx,ty, opts){
    if(gameOver) return;
    opts = opts||{};
    computeGrid();

    // Block spawn if within spawnTile's 1-tile radius
    const dxSpawn = Math.abs(tx - spawnTile.tx);
    const dySpawn = Math.abs(ty - spawnTile.ty);
    if(dxSpawn <= 1 && dySpawn <= 1){
      return false;
    }

    // Also block spawn if within 1 tile of current soap node (to avoid immediate collision / blocking)
    const dxNode = Math.abs(tx - node.i);
    const dyNode = Math.abs(ty - node.j);
    if(dxNode <= 1 && dyNode <= 1){
      return false;
    }

    // also block directly in front of soap (the very next tile in facing direction)
    const forwardTx = node.i + dir.x;
    const forwardTy = node.j + dir.y;
    if(forwardTx >= 0 && forwardTx < TILES_X && forwardTy >= 0 && forwardTy < TILES_Y){
      if(tx === forwardTx && ty === forwardTy) return false;
    }

    const tile = tileCenter(tx,ty);
    const size = Math.round(Math.min(tileW,tileH) * (opts.scale || spawnConfig.boardScale || 1));

    if(state.board && state.board.el){
      try{ state.board.el.pause(); state.board.el.remove(); }catch(_){} 
      state.board=null;
    }

    const src = opts.src || spawnConfig.boardSrc;
    if(src && src.endsWith('.webm')){
      const v = document.createElement('video');
      v.className = 'board-video static';
      v.src = src;
      v.muted = true;
      v.playsInline = true;
      v.loop = !!(opts.loop !== undefined ? opts.loop : spawnConfig.boardLoop);
      v.preload = 'auto';
      v.style.width = size + 'px';
      v.style.height = size + 'px';
      v.style.left = tile.x + 'px';
      v.style.top  = tile.y + 'px';
      v.style.setProperty('--tilt-deg', '0deg');
      v.style.setProperty('--pop-duration', '0ms');
      v.classList.remove('shown');
      v.style.transition = 'none';
      v.style.opacity = '1';
      dynRoot.appendChild(v);
      state.board = { el: v, tx, ty, fixed: !!opts.fixed };
      return state.board;
    } else {
      const d = document.createElement('div');
      d.className = 'board-static';
      d.style.position = 'absolute';
      d.style.left = tile.x + 'px';
      d.style.top = tile.y + 'px';
      d.style.width = size + 'px';
      d.style.height = size + 'px';
      d.style.transform = 'translate(-50%,-50%)';
      d.style.borderRadius = '8px';
      d.style.background = 'rgba(0,150,120,0.12)';
      d.style.border = '2px solid rgba(0,150,120,0.18)';
      d.style.pointerEvents = 'none';
      dynRoot.appendChild(d);
      state.board = { el: d, tx, ty, fixed: true };
      return state.board;
    }
  }

  // choose a random tile excluding spawn radius, node radius, and direct forward tile
  function randomTileIndexAvoidSpawn(){
    const candidates = [];
    for(let tx=0; tx<TILES_X; tx++){
      for(let ty=0; ty<TILES_Y; ty++){
        const dxSpawn = Math.abs(tx - spawnTile.tx);
        const dySpawn = Math.abs(ty - spawnTile.ty);
        if(dxSpawn <= 1 && dySpawn <= 1) continue;

        const dxNode = Math.abs(tx - node.i);
        const dyNode = Math.abs(ty - node.j);
        if(dxNode <= 1 && dyNode <= 1) continue;

        const forwardTx = node.i + dir.x;
        const forwardTy = node.j + dir.y;
        if(forwardTx >= 0 && forwardTx < TILES_X && forwardTy >= 0 && forwardTy < TILES_Y){
          if(tx === forwardTx && ty === forwardTy) continue;
        }

        candidates.push({ tx, ty });
      }
    }
    if(candidates.length === 0) return null;
    return candidates[Math.floor(Math.random()*candidates.length)];
  }

  function checkCollisions(){
    if(gameOver) return;
    const soap = getSoapCenter();
    const boardRect = board ? board.getBoundingClientRect() : { left:0, top:0 };
    const soapScreenX = boardRect.left + soap.x;
    const soapScreenY = boardRect.top + soap.y;

    // IMPORTANT: while soap is moving, ignore board collision entirely
    if(!moving && state.board && state.board.el){
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
  function startBucketLoop(){ startBucketLoop_inner(); }
  function stopBucketLoop(){ stopBucketLoop_inner(); }
  function startBucketLoop_actual(){ startBucketLoop_inner(); }

  // timer helpers (unchanged)
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
        // place at node center after arriving
        placeSoapAtNode(node.i,node.j, 'center');
        // Once arrival happens, collisions with board will be checked again in next iteration (moving===true only during travel)
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

  // input wiring (unchanged)
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
    moving = true;
    lastTs = null;
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

    // place soap at spawn tile bottom-center and face UP (but do not start moving until countdown finished)
    placeSoapAtNode(spawnTile.tx, spawnTile.ty, 'bottom');
    applyDirection(0,-1); // face up

    // If configured to show board on start, place a fixed board now (before countdown)
    if(spawnConfig.boardShowOnStart){
      const pick = randomTileIndexAvoidSpawn();
      if(pick){
        spawnBoardAtTile(pick.tx, pick.ty, { src: spawnConfig.boardSrc, scale: spawnConfig.boardScale, fixed: true });
      } else {
        warnOnce('noValidBoardTile', 'initFlow: could not find a valid tile to place board avoiding spawn radius.');
      }
    }

    runCountdown(3, ()=>{ afterCountdownStart(); });
  }

  if(sceneImg && sceneImg.complete) { setTimeout(initFlow, 120); }
  else if(sceneImg){
    sceneImg.addEventListener('load', ()=>{ setTimeout(initFlow, 120); }, { once:true });
    setTimeout(()=>{ if(!sceneImg.complete) initFlow(); }, 800);
  } else {
    setTimeout(()=>{
      warnOnce('noSceneImgInit','No sceneImg element — running initFlow with reduced assumptions.');
      initFlow();
    }, 120);
  }

  window.setSpawnConfig = (opts={})=>{
    Object.assign(spawnConfig, opts||{});
    if(state.bucketTimer){ stopBucketLoop(); startBucketLoop_actual(); }
  };
  window.clearAll = ()=>{
    stopBucketLoop();
    state.buckets.forEach(b=>{ try{ clearTimeout(b._removeTimeout); b.el.pause(); b.el.remove(); }catch(_){} });
    state.buckets=[];
    if(state.board && state.board.el){ try{ state.board.el.pause(); state.board.el.remove(); }catch(_){} }
    state.board=null;
  };

  window.addEventListener('resize', ()=>{ computeGrid(); placeSoapAtNode(spawnTile.tx, spawnTile.ty, 'bottom'); });

  function randomNodeIndex(){ return { i: Math.floor(Math.random()*(TILES_X+1)), j: Math.floor(Math.random()*(TILES_Y+1)) }; }
  function randomTileIndex(){ return { tx: Math.floor(Math.random()*TILES_X), ty: Math.floor(Math.random()*TILES_Y) }; }

}); // DOMContentLoaded
