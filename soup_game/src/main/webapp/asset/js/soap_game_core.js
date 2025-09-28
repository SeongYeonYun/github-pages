/* ========== soap_game_core.js ========== */
(function(){
  'use strict';
  const { U, G, DIRS, WARN_BEFORE_MS, El } = window;

  // Drawing helpers
  function circle(x,y,r,fill){ El.ctx.beginPath(); El.ctx.arc(x,y,r,0,Math.PI*2); El.ctx.fillStyle=fill; El.ctx.fill(); }
  function drawGrid(){
    const w=El.canvas.width, h=El.canvas.height;
    El.ctx.clearRect(0,0,w,h);
    const usableW=El.canvas.width-G.margin*2, usableH=El.canvas.height-G.margin*2;
    const stepX=usableW/(G.gridNodes-1), stepY=usableH/(G.gridNodes-1);
    for(let ty=0; ty<G.gridTiles; ty++){
      for(let tx=0; tx<G.gridTiles; tx++){
        const x=G.margin+tx*stepX, y=G.margin+ty*stepY;
        El.ctx.fillStyle=((tx+ty)%2===0?'#0f1433':'#0d122d');
        El.ctx.fillRect(x,y,stepX,stepY);
      }
    }
    El.ctx.lineWidth=2; El.ctx.strokeStyle=getCSS('--grid','#2a315c');
    for(let i=0;i<G.gridNodes;i++){
      const x=G.margin+i*stepX, y=G.margin+i*stepY;
      El.ctx.beginPath(); El.ctx.moveTo(x,G.margin); El.ctx.lineTo(x,G.margin+usableH); El.ctx.stroke();
      El.ctx.beginPath(); El.ctx.moveTo(G.margin,y); El.ctx.lineTo(G.margin+usableW,y); El.ctx.stroke();
    }
    El.ctx.lineWidth=4; El.ctx.strokeStyle=getCSS('--grid2','#3f4678');
    El.ctx.strokeRect(G.margin, G.margin, usableW, usableH);
  }
  function getCSS(name, fallback){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }

  function drawWindow(){
    const p=window.nodeToXY({x:G.window.x,y:G.window.y});
    El.ctx.save(); El.ctx.translate(p.x,p.y);
    let ax=0, ay=0;
    if(G.window.side==='TOP') ay=-14; else if(G.window.side==='BOTTOM') ay=14;
    if(G.window.side==='LEFT') ax=-14; else if(G.window.side==='RIGHT') ax=14;
    const c = G.window.opened ? '#4dff88' : '#ffd166';
    circle(0,0,7,c);
    El.ctx.fillStyle=c; El.ctx.beginPath(); El.ctx.moveTo(ax,ay);
    El.ctx.lineTo(ax + (ay===0?0:-5), ay + (ax===0?0:-5));
    El.ctx.lineTo(ax + (ay===0?0: 5), ay + (ax===0?0: 5));
    El.ctx.closePath(); El.ctx.fill();
    El.ctx.restore();
  }

  function drawSoap(){
    const pos=window.soapPos();
    El.ctx.save();
    const angle=[0,Math.PI/2,Math.PI,-Math.PI/2][G.dir];
    El.ctx.translate(pos.x,pos.y); El.ctx.rotate(angle);

    // shadow
    El.ctx.globalAlpha=0.3; circle(10,10,9,'#000'); El.ctx.globalAlpha=1;

    // soap rectangle
    const w=24, h=14;
    El.ctx.fillStyle='#9ee7ff'; El.ctx.strokeStyle='#62c7e8';
    El.ctx.lineWidth=1.6;
    El.ctx.beginPath();
    El.ctx.rect(-w/2, -h/2, w, h);
    El.ctx.fill(); El.ctx.stroke();

    // highlight
    El.ctx.fillStyle='rgba(255,255,255,0.7)';
    El.ctx.fillRect(-w*0.25, -h*0.25, w*0.2, h*0.18);

    // 5s before window opens: speech bubble
    (function(){
      const now = U.now();
      if(G.running && now >= G.window.openAt - WARN_BEFORE_MS && now < G.window.openAt){
        const label = '열린다!';
        El.ctx.save();
        El.ctx.rotate(-angle);
        const n = (G.dir % 2 === 0) ? {x:0, y:-1} : {x:1, y:0};
        const offX = n.x * 18, offY = n.y * 18;
        El.ctx.translate(offX, offY);

        const t = (now % 1000) / 1000;
        const pulse = 0.9 + 0.1*Math.sin(t*2*Math.PI);

        El.ctx.font = 'bold 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto';
        El.ctx.textAlign = 'center';
        El.ctx.textBaseline = 'middle';
        const padX = 8, H = 20;
        const wRect = El.ctx.measureText(label).width + padX*2;

        El.ctx.globalAlpha = 0.92;
        El.ctx.fillStyle = 'rgba(32, 38, 81, 0.92)';
        roundRect(-wRect/2, -H-10, wRect, H, 8);
        El.ctx.fill();

        El.ctx.lineWidth = 2 * pulse;
        El.ctx.strokeStyle = 'rgba(77, 255, 136, 0.95)';
        roundRect(-wRect/2, -H-10, wRect, H, 8, true);

        El.ctx.fillStyle = '#c9ffdf';
        El.ctx.fillText(label, 0, -H/2-10);

        El.ctx.beginPath();
        El.ctx.moveTo(0, -10);
        El.ctx.lineTo(4, -4);
        El.ctx.lineTo(-4, -4);
        El.ctx.closePath();
        El.ctx.fillStyle = 'rgba(32, 38, 81, 0.92)';
        El.ctx.fill();
        El.ctx.strokeStyle = 'rgba(77, 255, 136, 0.95)';
        El.ctx.lineWidth = 1.5;
        El.ctx.stroke();

        El.ctx.restore();
      }
    })();

    El.ctx.restore();
  }

  function roundRect(x,y,w,h,r,strokeOnly){
    const rr = Math.min(r, w/2, h/2);
    El.ctx.beginPath();
    El.ctx.moveTo(x+rr, y);
    El.ctx.lineTo(x+w-rr, y);
    El.ctx.quadraticCurveTo(x+w, y, x+w, y+rr);
    El.ctx.lineTo(x+w, y+h-rr);
    El.ctx.quadraticCurveTo(x+w, y+h, x+w-rr, y+h);
    El.ctx.lineTo(x+rr, y+h);
    El.ctx.quadraticCurveTo(x, y+h, x, y+h-rr);
    El.ctx.lineTo(x, y+rr);
    El.ctx.quadraticCurveTo(x, y, x+rr, y);
    El.ctx.closePath();
    if(strokeOnly){ El.ctx.stroke(); }
  }

  // Movement & turn
  function applyPendingTurnAtJunction(){
    if(G.pendingTurn===null){ logEvent('TURN','직진'); return; }
    if(G.pendingTurn==='L'){ G.dir=(G.dir+3)%4; logEvent('TURN','좌회전 적용'); }
    else { G.dir=(G.dir+1)%4; logEvent('TURN','우회전 적용'); }
    G.pendingTurn=null; window.updatePendingLabel();
  }
  window.applyPendingTurnAtJunction = applyPendingTurnAtJunction;

  function stepToNextEdge(){
    const curr=G.nodeB, dirVec=DIRS[G.dir], next={x:curr.x+dirVec.x, y:curr.y+dirVec.y};
    const max = G.gridNodes - 1;
    const goingOutside = (next.x<0||next.x>max||next.y<0||next.y>max);
    if(goingOutside){
      const atWindow = (curr.x===G.window.x && curr.y===G.window.y);
      if(atWindow && G.window.opened){ logEvent('EXIT',`창문 node=(${curr.x},${curr.y})`); endGame('clear'); }
      else { const side=(curr.y===0?'TOP':(curr.y===max?'BOTTOM':(curr.x===0?'LEFT':'RIGHT'))); logEvent('CRASH',`벽 (${side}) node=(${curr.x},${curr.y})`); endGame('fail','벽에 충돌 (창문 닫힘)'); }
      return false;
    }
    G.nodeA=curr; G.nodeB=next; G.t=0;
    // 즉시 실패 제거: 실제 충돌은 checkBasinCollision에서 처리
    return true;
  }
  window.stepToNextEdge = stepToNextEdge;

  // Bubbles
  const BUBBLE_LIFE = 3.0, POP_TIME = 0.18, EMIT_PER_PX = 0.018;
  const MIN_R=3, MAX_R=10, UP_FLOAT=12, DRIFT=10, FADE=0.25;
  const POOL_SIZE = 700;
  const bubbles = new Array(POOL_SIZE).fill(null).map(()=>({alive:false,x:0,y:0,r:0,vx:0,vy:0,born:0,life:BUBBLE_LIFE,alpha:1,state:0,popT:0}));
  let poolHead = 0;
  function rand(a,b){ return a + Math.random()*(b-a); }
  function spawnBubble(x,y){
    const b = bubbles[poolHead]; poolHead=(poolHead+1)%POOL_SIZE;
    b.alive=true; b.state=0; b.popT=0;
    b.x=x+(Math.random()*6-3); b.y=y+(Math.random()*6-3);
    b.r=rand(MIN_R,MAX_R);
    b.vx=(Math.random()*2-1)*DRIFT;
    b.vy=-UP_FLOAT - Math.random()*UP_FLOAT*0.6;
    b.born=U.now()/1000;
    b.life=BUBBLE_LIFE * rand(0.9,1.1);
    b.alpha=0.9;
  }
  function emitByDistance(dist, x, y){
    let expected = dist * EMIT_PER_PX;
    while(expected > 0){
      if(Math.random() < Math.min(1, expected)) spawnBubble(x,y);
      expected -= 1;
    }
  }
  function updateBubbles(dt){
    const now = U.now()/1000;
    for(let i=0;i<POOL_SIZE;i++){
      const b=bubbles[i]; if(!b.alive) continue;
      if(b.state===0){
        const age=now-b.born;
        if(age>=b.life){ b.state=1; b.popT=0; continue; }
        b.x+=b.vx*dt; b.y+=b.vy*dt; b.r*=(1+0.12*dt);
        b.alpha=Math.max(0, 0.9 - age*FADE);
      }else{
        b.popT+=dt; const t=b.popT/POP_TIME;
        if(t>=1){ b.alive=false; continue; }
        b.r*=(1+5.0*dt);
        b.alpha=Math.max(0, 0.6*(1 - t*1.2));
      }
    }
  }
  function drawBubbles(){
    const prev = El.ctx.globalCompositeOperation;
    El.ctx.globalCompositeOperation='lighter';
    for(let i=0;i<POOL_SIZE;i++){
      const b=bubbles[i]; if(!b.alive||b.alpha<=0.01) continue;
      El.ctx.save(); El.ctx.globalAlpha=b.alpha;
      if(b.state===0){
        const grad = El.ctx.createRadialGradient(b.x - b.r*0.4, b.y - b.r*0.4, b.r*0.1, b.x, b.y, b.r);
        grad.addColorStop(0, 'rgba(255,255,255,0.35)');
        grad.addColorStop(0.7,'rgba(180,220,255,0.18)');
        grad.addColorStop(1, 'rgba(180,220,255,0.0)');
        El.ctx.fillStyle=grad;
        El.ctx.beginPath(); El.ctx.arc(b.x,b.y,b.r,0,Math.PI*2); El.ctx.fill();
        El.ctx.lineWidth=Math.max(1,b.r*0.12);
        El.ctx.strokeStyle='rgba(240,250,255,0.7)';
        El.ctx.stroke();
      }else{
        El.ctx.lineWidth=Math.max(1,b.r*0.08);
        El.ctx.strokeStyle='rgba(255,255,255,0.8)';
        El.ctx.beginPath(); El.ctx.arc(b.x,b.y,b.r,0,Math.PI*2); El.ctx.stroke();
      }
      El.ctx.restore();
    }
    El.ctx.globalCompositeOperation=prev;
  }

  // Main loop
  function draw(){
    drawGrid(); drawWindow(); window.drawObstacles(); drawSoap(); drawBubbles();
  }
  window.draw = draw;

  function loop(now){
    if(!G.running) return;
    const dt=(now-G.lastFrame)/1000; G.lastFrame=now; G.elapsedMs=now-G.startMs;

    const prevPos = window.soapPos();

    if(!G.window.opened && now>=G.window.openAt) G.window.opened = true;
    if(!G.warned && now >= G.window.openAt - WARN_BEFORE_MS && now < G.window.openAt){
      G.warned = true; logEvent('NOTICE','창문이 곧 열립니다 (5초 전)');
    }
    window.trySpawnObstacle();
    window.checkBasinCollision();

    G.t += CONFIG.speedNodesPerSec * dt;
    while(G.t>=1 && G.running){
      G.t -= 1;
      applyPendingTurnAtJunction();
      if(!stepToNextEdge()) break;
    }

    const currPos = window.soapPos();
    const dist = Math.hypot(currPos.x - prevPos.x, currPos.y - prevPos.y);
    emitByDistance(dist, currPos.x, currPos.y);
    updateBubbles(dt);

    draw(); window.updateHUD();
    requestAnimationFrame(loop);
  }
  window.loop = loop;

  // HUD & start/stop
  function startGame(){
    G.running=true; G.result=null;
    G.startMs=U.now(); G.elapsedMs=0; G.lastFrame=G.startMs;
    G.obstacles=[]; G.pendingTurn=null; G.warned=false;
    G.graceUntil = G.startMs + CONFIG.graceMs;
    G.nextSpawnAt = G.graceUntil;
    pickRandomStart(); pickRandomWindow(); window.updatePendingLabel();
    logEvent('START',`스테이지 ${G.stageIndex+1}`);
    El.btnStart.textContent='■ 중지'; El.btnStart.classList.add('success');
    requestAnimationFrame(loop);
  }
  window.startGame = startGame;

  function endGame(result, reason){
    if(!G.running) return; G.running=false; G.result=result;
    El.btnStart.textContent='▶ 게임 시작'; El.btnStart.classList.remove('success');
    logEvent(result==='clear'?'CLEAR':'FAIL', reason || '');
    G.elapsedMs = U.now() - G.startMs;

    const clear = (result==='clear');
    const msg = `${clear?'클리어!':'실패!'}\n스테이지 ${G.stageIndex+1} / 경과 ${U.fmtTime(G.elapsedMs)}${reason?`\n\n사유: ${reason}`:''}`;
    const name = prompt(msg+"\n\n기록 이름 입력(취소시 저장 안 함)", "Player");
    if(name && name.trim()){
      saveToLeaderboard({ name:name.trim(), stage:G.stageIndex+1, result: clear?'CLEAR':'FAIL', timeMs:G.elapsedMs, ts:Date.now() });
      renderLeaderboard();
    }
  }
  window.endGame = endGame;

  // Start positions
  function pickRandomStart(){
    const max=G.gridNodes-1;
    while(true){
      const x=U.randInt(0,max), y=U.randInt(0,max); let dir=U.randInt(0,3);
      if((x===0&&dir===2)||(x===max&&dir===0)||(y===0&&dir===3)||(y===max&&dir===1)) dir=(dir+1)%4;
      const a={x:x,y:y}, d=DIRS[dir], b={x:x+d.x, y:y+d.y};
      if(b.x>=0 && b.x<=max && b.y>=0 && b.y<=max){ G.nodeA=a; G.nodeB=b; G.dir=dir; G.t=0; return; }
    }
  }

  function pickRandomWindow(){
    const choices=[]; const max=G.gridNodes-1;
    for(let i=1;i<=max-1;i++){
      choices.push({x:i,y:0,side:'TOP'},{x:i,y:max,side:'BOTTOM'},{x:0,y:i,side:'LEFT'},{x:max,y:i,side:'RIGHT'});
    }
    const w=choices[U.randInt(0,choices.length-1)];
    G.window = { x:w.x, y:w.y, side:w.side, openAt: G.startMs + CONFIG.windowOpenMs, opened:false };
  }

})();