/* ========== soap_game_core.js ========== */
(function(){
  'use strict';
  const { U, G, DIRS, WARN_BEFORE_MS, El } = window;

  // 헬퍼
  function circle(x,y,r,fill){ El.ctx.beginPath(); El.ctx.arc(x,y,r,0,Math.PI*2); El.ctx.fillStyle=fill; El.ctx.fill(); }
  function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
  function clamp01(v){ return Math.max(0, Math.min(1, v)); }

  function drawFieldBackground(){
    const bg = window.FieldBG;
    if (!bg || !bg.loaded || !bg.img) return;
    const usableW = El.canvas.width - G.margin*2;
    const usableH = El.canvas.height - G.margin*2;
    const dx = G.margin, dy = G.margin, dw = usableW, dh = usableH;
    const iw = bg.img.naturalWidth, ih = bg.img.naturalHeight;
    const sRatio = iw/ih, dRatio = dw/dh;
    let sx=0, sy=0, sw=iw, sh=ih;
    if ((bg.fit||'cover') === 'cover') {
      if (sRatio > dRatio) { sh = ih; sw = ih * dRatio; sx = (iw - sw)/2; }
      else { sw = iw; sh = iw / dRatio; sy = (ih - sh)/2; }
    } else {
      if (sRatio > dRatio) {
        const newH = dw / sRatio;
        const pad = (dh - newH)/2;
        El.ctx.drawImage(bg.img, 0,0, iw,ih, dx, dy+pad, dw, newH);
        return;
      } else {
        const newW = dh * sRatio;
        const pad = (dw - newW)/2;
        El.ctx.drawImage(bg.img, 0,0, iw,ih, dx+pad, dy, newW, dh);
        return;
      }
    }
    El.ctx.drawImage(bg.img, sx,sy, sw,sh, dx,dy, dw,dh);
  }

  function drawGrid(){
    const w=El.canvas.width, h=El.canvas.height;
    El.ctx.clearRect(0,0,w,h);
    drawFieldBackground();

    const usableW=El.canvas.width-G.margin*2, usableH=El.canvas.height-G.margin*2;
    const stepX=usableW/(G.gridNodes-1), stepY=usableH/(G.gridNodes-1);

    El.ctx.lineWidth=2; El.ctx.strokeStyle=getCSS('--grid','#2a315c');
    for(let i=0;i<G.gridNodes;i++){
      const x=G.margin+i*stepX, y=G.margin+i*stepY;
      El.ctx.beginPath(); El.ctx.moveTo(x,G.margin); El.ctx.lineTo(x,G.margin+usableH); El.ctx.stroke();
      El.ctx.beginPath(); El.ctx.moveTo(G.margin,y); El.ctx.lineTo(G.margin+usableW,y); El.ctx.stroke();
    }
    El.ctx.lineWidth=4; El.ctx.strokeStyle=getCSS('--grid2','#3f4678');
    El.ctx.strokeRect(G.margin, G.margin, usableW, usableH);

    // 디버그용 경계 표시
    if (CONFIG.debugSafeRect){
      const { x, y, w, h } = window.playfieldRect();
      const inset = (CONFIG.safeInsetPx || 0);
      El.ctx.save();
      El.ctx.strokeStyle = 'rgba(255, 64, 64, 0.9)';
      El.ctx.lineWidth = 3;
      El.ctx.strokeRect(x+inset, y+inset, w-inset*2, h-inset*2);
      El.ctx.restore();
    }
  }
  function getCSS(name, fallback){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }

  // === 창문 애니메이션 ===
  function drawWindow(){
    const now = U.now();
    if (now < G.window.openAt - WARN_BEFORE_MS) return;
    const tRaw = (now - (G.window.openAt - WARN_BEFORE_MS)) / WARN_BEFORE_MS;
    const t = clamp01(tRaw);
    const te = easeOutCubic(t);

    const p = window.nodeToXY({ x:G.window.x, y:G.window.y });
    const usableW = El.canvas.width - G.margin*2;
    const usableH = El.canvas.height - G.margin*2;
    const step = Math.min(usableW, usableH)/(G.gridNodes - 1);
    const panelW = step * 0.9, panelH = step * 0.55;
    const frame = Math.max(2, step * 0.05);

    let nx=0, ny=0, tangentX=0, tangentY=0, rotDir=1;
    switch(G.window.side){
      case 'TOP': ny =  1; tangentX = 1; tangentY = 0; rotDir = -1; break;
      case 'BOTTOM': ny = -1; tangentX = 1; tangentY = 0; rotDir = 1; break;
      case 'LEFT': nx =  1; tangentX = 0; tangentY = 1; rotDir = 1; break;
      case 'RIGHT': nx = -1; tangentX = 0; tangentY = 1; rotDir = -1; break;
    }

    El.ctx.save();
    El.ctx.translate(p.x, p.y);
    const inset = step * 0.08;
    El.ctx.translate(nx * inset, ny * inset);
    if (tangentX===0) El.ctx.rotate(Math.PI/2);
    El.ctx.translate(-panelW/2, 0);

    const rad = (78 * Math.PI/180) * te * rotDir;
    El.ctx.save();
    El.ctx.translate(0, panelH/2);
    El.ctx.rotate(rad);
    El.ctx.translate(0, -panelH/2);

    El.ctx.fillStyle = 'rgba(200,225,255,' + (0.65 + 0.35*te) + ')';
    roundRect(0, 0, panelW, panelH, Math.max(4, panelH*0.15)); El.ctx.fill();
    El.ctx.lineWidth = frame; El.ctx.strokeStyle = 'rgba(160,190,230,' + (0.8 + 0.2*te) + ')'; El.ctx.stroke();

    const glassInset = frame*1.2;
    const gx = glassInset, gy = glassInset;
    const gw = panelW - glassInset*2, gh = panelH - glassInset*2;
    const grad = El.ctx.createLinearGradient(0, 0, gw, gh);
    grad.addColorStop(0, 'rgba(160, 230, 255,' + (0.28 + 0.4*te) + ')');
    grad.addColorStop(1, 'rgba(120, 200, 255,' + (0.18 + 0.3*te) + ')');
    El.ctx.fillStyle = grad; roundRect(gx, gy, gw, gh, Math.max(3, gh*0.12)); El.ctx.fill();

    if (t < 0.6){
      El.ctx.save();
      El.ctx.globalAlpha = 0.35*(1 - t/0.6);
      El.ctx.setLineDash([6,4]);
      El.ctx.lineWidth = 2;
      El.ctx.strokeStyle = 'rgba(255, 214, 102, 0.9)';
      El.ctx.strokeRect(-panelW/2, -panelH/2, panelW, panelH);
      El.ctx.restore();
    }

    if (now >= G.window.openAt){
      const pulse = Math.sin(((now - G.window.openAt) % 600) / 600 * Math.PI*2)*0.5+0.5;
      El.ctx.save();
      El.ctx.globalAlpha = 0.25 + 0.25*pulse;
      El.ctx.lineWidth = 3 + 2*pulse;
      El.ctx.strokeStyle = 'rgba(77,255,136,0.95)';
      El.ctx.strokeRect(-panelW/2 - 4, -panelH/2 - 4, panelW + 8, panelH + 8);
      El.ctx.restore();
    }

    El.ctx.restore();
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

  // === 경계 이탈 체크 ===
  function checkBoundaryOut(){
    if (!G.running) return;
    const { x, y, w, h } = window.playfieldRect();
    const inset = (CONFIG.safeInsetPx || 0);
    const rx = x + inset, ry = y + inset, rw = w - inset*2, rh = h - inset*2;
    const pos = window.soapPos();
    const out = (pos.x < rx || pos.x > rx+rw || pos.y < ry || pos.y > ry+rh);
    if (out){
      logEvent('CRASH','경계 이탈');
      endGame('fail','빨간 테두리를 벗어남');
    }
  }

  // === 나머지 로직(비누, 버블, 루프, 시작/종료) ===
  // (이하 기존 내용 동일 — 생략 가능하지만 실제 파일엔 그대로 유지됨)
  // ... (비누 이동, 버블 이펙트, stepToNextEdge, loop, startGame, endGame 등 기존과 동일)
})();
