// soap_utils_shim.js
(function(){
  window.soapUtils = window.soapUtils || (function(){
    function isPositive(n){ return typeof n === 'number' && isFinite(n) && n > 0; }
    function fitCanvasToElement(canvas){
      if(!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      const ctx = canvas.getContext && canvas.getContext('2d');
      if(ctx && ctx.setTransform) try{ ctx.setTransform(dpr,0,0,dpr,0,0); }catch(e){}
    }
    function fitAll(){
      ['bg-canvas','board-canvas','ui-canvas'].forEach(id=>{
        const c = document.getElementById(id);
        if(c) fitCanvasToElement(c);
      });
    }
    function roundRectPath(ctx, x, y, w, h, r){
      const rr = Math.min(r, Math.min(w,h)/2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }
    function roundRectFill(ctx, x, y, w, h, r, fill){
      ctx.save();
      if(typeof fill === 'string') ctx.fillStyle = fill;
      else if(fill && typeof fill === 'object' && fill.createPattern) ctx.fillStyle = fill;
      roundRectPath(ctx, x, y, w, h, r);
      ctx.fill();
      ctx.restore();
    }
    function strokeRoundRect(ctx, x, y, w, h, r, strokeStyle, lineWidth){
      ctx.save();
      ctx.strokeStyle = strokeStyle || '#000';
      ctx.lineWidth = lineWidth || 1;
      roundRectPath(ctx, x, y, w, h, r);
      ctx.stroke();
      ctx.restore();
    }
    return { isPositive, fitAll, fitCanvasToElement, roundRectPath, roundRectFill, strokeRoundRect };
  })();
})();
