/* Viewport math only. World positions remain in the original 1000 × 620 space. */
(function (G) {
  'use strict';
  const W=1000,H=620,MIN=1,MAX=3;
  const finite=(v,f)=>Number.isFinite(v)?v:f;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function normalize(camera){
    const zoom=clamp(finite(camera?.zoom,1),MIN,MAX);
    return {zoom,x:clamp(finite(camera?.x,0),0,W-W/zoom),y:clamp(finite(camera?.y,0),0,H-H/zoom)};
  }
  function screenToWorld(camera,p){const c=normalize(camera);return{x:c.x+p.x/c.zoom,y:c.y+p.y/c.zoom};}
  function worldToScreen(camera,p){const c=normalize(camera);return{x:(p.x-c.x)*c.zoom,y:(p.y-c.y)*c.zoom};}
  function zoomAt(camera,zoom,anchor={x:W/2,y:H/2}){
    const before=screenToWorld(camera,anchor),next=clamp(finite(zoom,1),MIN,MAX);
    return normalize({zoom:next,x:before.x-anchor.x/next,y:before.y-anchor.y/next});
  }
  function panBy(camera,dx,dy){const c=normalize(camera);return normalize({...c,x:c.x-finite(dx,0)/c.zoom,y:c.y-finite(dy,0)/c.zoom});}
  function fromClient(rect,clientX,clientY){
    if(!(rect.width>0&&rect.height>0))return{x:W/2,y:H/2};
    return{x:(clientX-rect.left)*W/rect.width,y:(clientY-rect.top)*H/rect.height};
  }
  G.KRCamera={width:W,height:H,min:MIN,max:MAX,normalize,screenToWorld,worldToScreen,zoomAt,panBy,fromClient};
})(globalThis);
