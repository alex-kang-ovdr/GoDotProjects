/* Pointer targets are measured in CSS pixels, independently of map zoom. */
(function (G) {
  'use strict';
  function enemyAnchor(e) {
    const low=/spider|wulf|worg|wolf|hound|magma/.test(e.defId||'');
    const offset=e.sheep||e.transformed?6:e.air?34:e.boss?35:low?8:Math.max(12,(e.radius||9)*1.2);
    return {x:e.x,y:e.y-offset};
  }
  function pickEnemy(enemies,point,camera,viewport,pointerType='mouse') {
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
    const c=G.KRCamera.normalize(camera),sx=(viewport?.width||1000)/1000*c.zoom,sy=(viewport?.height||620)/620*c.zoom;
    const min=pointerType==='touch'?22:12;
    let best=null,bestScore=Infinity;
    for(const e of enemies||[]) {
      if(e.dead||!(e.hp>0))continue;
      const p=enemyAnchor(e),screen=G.KRCamera.worldToScreen(c,p),r=e.boss?39:Math.max(15,(e.radius||9)*1.6);
      if(screen.x<-r*c.zoom||screen.x>1000+r*c.zoom||screen.y<-r*c.zoom||screen.y>620+r*c.zoom)continue;
      const dx=(p.x-point.x)*sx,dy=(p.y-point.y)*sy,rx=Math.max(min,r*sx),ry=Math.max(min,r*sy);
      if((dx/rx)**2+(dy/ry)**2>1)continue;
      // A near visible body wins over another creature's enlarged touch area.
      const score=Math.hypot(dx,dy);
      if(score<bestScore){best=e;bestScore=score;}
    }
    return best;
  }
  G.KRPicking={enemyAnchor,pickEnemy};
})(globalThis);
