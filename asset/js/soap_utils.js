/* ========== soap_utils.js ========== */
(function(){
  'use strict';
  // Helpers
  const U = {
    randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; },
    now(){ return performance.now(); },
    fmtTime(ms){ return (ms/1000).toFixed(1)+'s'; },
    fmtDate(ts){ return new Date(ts).toLocaleString(); },
    saveJSON(k,o){ localStorage.setItem(k, JSON.stringify(o)); },
    loadJSON(k,f){ try{ return JSON.parse(localStorage.getItem(k)) ?? f; }catch{ return f; } }
  };
  window.U = U;

  // Elements
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const stageLabel = document.getElementById('stageLabel');
  const timeLabel = document.getElementById('timeLabel');
  const windowLabel = document.getElementById('windowLabel');
  const pendingDirEl = document.getElementById('pendingDir');
  const btnLeft = document.getElementById('btnLeft');
  const btnRight = document.getElementById('btnRight');
  const btnStart = document.getElementById('btnStart');
  const leaderboardBody = document.getElementById('leaderboardBody');
  const logBox = document.getElementById('logBox');
  const btnClearLog = document.getElementById('btnClearLog');

  window.El = { canvas, ctx, stageLabel, timeLabel, windowLabel, pendingDirEl, btnLeft, btnRight, btnStart, leaderboardBody, logBox, btnClearLog };

  // Log
  const LOG=[];
  function logEvent(type, detail=''){
    const running = G.running && G.startMs>0;
    const sec = running ? ((U.now()-G.startMs)/1000).toFixed(1)+'s' : '—';
    LOG.unshift(`[${sec}] ${type}${detail?` - ${detail}`:''}`);
    if(LOG.length>200) LOG.pop();
    logBox.textContent = LOG.join('\n');
  }
  window.logEvent = logEvent;

  // Config
  const CONFIG = JSON.parse(document.getElementById('stage-config').textContent);
  window.CONFIG = CONFIG;
  const WARN_BEFORE_MS = 5000; window.WARN_BEFORE_MS = WARN_BEFORE_MS;

  // Game State
  const DIRS=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
  window.DIRS = DIRS;
  const BASIN_FALL_MS = 600; window.BASIN_FALL_MS = BASIN_FALL_MS;

  const G={
    gridTiles:4, gridNodes:5,
    margin:40,
    pendingTurn:null, running:false, stageIndex:0,
    startMs:0, elapsedMs:0, lastFrame:0,
    nodeA:{x:0,y:0}, nodeB:{x:1,y:0}, t:0, dir:0,
    window:{x:0,y:0,side:'TOP',openAt:0,opened:false},
    obstacles:[], nextSpawnAt:Infinity, graceUntil:0, result:null,
    warned:false
  };
  window.G = G;

  // Resize
  const ASPECT_W = 9, ASPECT_H = 7;
  function resizeCanvas(){
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    const cssWidth = Math.floor(canvas.clientWidth || canvas.getBoundingClientRect().width);
    const cssHeight = Math.floor(cssWidth * ASPECT_H / ASPECT_W);
    const needW = Math.round(cssWidth * dpr);
    const needH = Math.round(cssHeight * dpr);
    if (canvas.width !== needW || canvas.height !== needH){
      canvas.width = needW; canvas.height = needH;
    }
    const scale = cssWidth / 900;
    G.margin = Math.max(24, Math.round(40 * scale));
    El.ctx.setTransform(1,0,0,1,0,0);
  }
  new ResizeObserver(resizeCanvas).observe(canvas);
  window.addEventListener('orientationchange', ()=>setTimeout(resizeCanvas, 50));
  window.resizeCanvas = resizeCanvas;

  // Coordinates
  function nodeToXY(n){
    const usableW = canvas.width - G.margin*2;
    const usableH = canvas.height - G.margin*2;
    return {
      x: G.margin + n.x * (usableW/(G.gridNodes-1)),
      y: G.margin + n.y * (usableH/(G.gridNodes-1))
    };
  }
  window.nodeToXY = nodeToXY;
  function soapPos(){
    const a=nodeToXY(G.nodeA), b=nodeToXY(G.nodeB);
    return { x:a.x + (b.x-a.x)*G.t, y:a.y + (b.y-a.y)*G.t };
  }
  window.soapPos = soapPos;
  function edgeId(a,b){
    const k1=`${a.x},${a.y}`, k2=`${b.x},${b.y}`;
    return (k1<k2)?`${k1}-${k2}`:`${k2}-${k1}`;
  }
  window.edgeId = edgeId;

  // Input
  function reserveTurn(dir){ G.pendingTurn=dir; updatePendingLabel(); logEvent('INPUT', dir==='L'?'LEFT':'RIGHT'); }
  window.reserveTurn = reserveTurn;
  function updatePendingLabel(){ El.pendingDirEl.textContent = ({L:'왼쪽', R:'오른쪽'})[G.pendingTurn] ?? '직진'; }
  window.updatePendingLabel = updatePendingLabel;

  // Leaderboard
  const LEADER_KEY='soap_escape_leaderboard_v1';
  function saveToLeaderboard(rec){
    const list=U.loadJSON(LEADER_KEY,[]);
    list.push(rec);
    list.sort((a,b)=>{
      const ca=a.result==='CLEAR', cb=b.result==='CLEAR';
      if(ca!==cb) return cb-ca;
      if(ca) return a.timeMs - b.timeMs;
      return b.timeMs - a.timeMs;
    });
    U.saveJSON(LEADER_KEY, list.slice(0,100));
  }
  window.saveToLeaderboard = saveToLeaderboard;
  function renderLeaderboard(){
    const list=U.loadJSON(LEADER_KEY,[]);
    El.leaderboardBody.innerHTML='';
    list.forEach((r,i)=>{
      const tr=document.createElement('tr');
      tr.innerHTML = `
        <td>${i+1}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${r.stage}</td>
        <td><span class="tag ${r.result==='CLEAR'?'':'fail'}">${r.result}</span></td>
        <td>${U.fmtTime(r.timeMs)}</td>
        <td>${U.fmtDate(r.ts)}</td>`;
      El.leaderboardBody.appendChild(tr);
    });
  }
  window.renderLeaderboard = renderLeaderboard;
  function escapeHtml(s){ return s.replace(/[&<>\"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }
  window.escapeHtml = escapeHtml;

  // Expose UI labels
  window.updateHUD = function updateHUD(){
    El.stageLabel.textContent = `${G.stageIndex+1} / 5`;
    El.timeLabel.textContent = U.fmtTime(G.elapsedMs);
    const remain = Math.max(0, G.window.openAt - (G.startMs + G.elapsedMs));
    El.windowLabel.textContent = G.window.opened ? '열림!' : `닫힘 (${U.fmtTime(remain)} 후 오픈)`;
  };

  // Buttons & key bindings
  El.btnLeft.addEventListener('click', ()=>reserveTurn('L'));
  El.btnRight.addEventListener('click', ()=>reserveTurn('R'));
  El.btnStart.addEventListener('click', ()=>{ if(G.running) window.endGame('fail','중지 버튼으로 게임을 종료했습니다.'); else window.startGame(); });
  window.addEventListener('keydown', (e)=>{
    if(e.key==='a'||e.key==='A'||e.key==='ArrowLeft') { e.preventDefault(); reserveTurn('L'); }
    else if(e.key==='d'||e.key==='D'||e.key==='ArrowRight') { e.preventDefault(); reserveTurn('R'); }
    else if(e.key===' '){ e.preventDefault(); if(!G.running) window.startGame(); }
  });

  // Init hook
  window.addEventListener('DOMContentLoaded', ()=>{
    resizeCanvas();
    renderLeaderboard();
    window.draw(); window.updateHUD();
    El.btnStart.addEventListener('contextmenu', e=>{
      e.preventDefault();
      G.stageIndex = (G.stageIndex+1) % CONFIG.stages.length;
      El.stageLabel.textContent = `${G.stageIndex+1} / ${CONFIG.stages.length}`;
    });
  });
})();