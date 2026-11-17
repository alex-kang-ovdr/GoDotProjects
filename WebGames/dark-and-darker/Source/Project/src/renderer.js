/* Batched, dependency-free WebGL renderer. Static and dynamic geometry use two draw calls. */
(function(){
'use strict';
const C=CryptCore,{V,localPoint,mul4,viewMatrix,perspective,TILE,N,CEILING}=C,IDENT=[[1,0,0],[0,1,0],[0,0,1]];
class Mesh{
 constructor(){this.data=[]}
 vert(p,n,c,mat){this.data.push(...p,...n,...c,mat)}
 tri(a,b,c,color,mat=0){const n=V.norm(V.cross(V.sub(b,a),V.sub(c,a)));for(const p of [a,b,c])this.vert(p,n,color,mat)}
 quad(a,b,c,d,col,mat=0){this.tri(a,b,c,col,mat);this.tri(a,c,d,col,mat)}
 box(center,size,color,axes=IDENT,mat=0){const p=(x,y,z)=>localPoint(center,axes,[x*size[0]/2,y*size[1]/2,z*size[2]/2]);const a=p(-1,-1,1),b=p(1,-1,1),c=p(1,1,1),d=p(-1,1,1),e=p(-1,-1,-1),f=p(1,-1,-1),g=p(1,1,-1),h=p(-1,1,-1);const q=(a,b,c,d)=>V.dot(V.cross(axes[0],axes[1]),axes[2])<0?this.quad(d,c,b,a,color,mat):this.quad(a,b,c,d,color,mat);q(a,b,c,d);q(f,e,h,g);q(b,f,g,c);q(e,a,d,h);q(d,c,g,h);q(e,f,b,a)}
 rod(a,b,r,color,mat=0,sides=6,r2=r){const y=V.norm(V.sub(b,a)),x=V.norm(V.cross(Math.abs(y[1])>.9?[0,0,1]:[0,1,0],y)),z=V.cross(y,x);const point=(c,r,t)=>V.add(c,V.add(V.mul(x,Math.cos(t)*r),V.mul(z,Math.sin(t)*r)));for(let i=0;i<sides;i++){const t=i/sides*Math.PI*2,u=(i+1)/sides*Math.PI*2,p=point(a,r,t),q=point(a,r,u),s=point(b,r2,t),v=point(b,r2,u);this.quad(p,s,v,q,color,mat);this.tri(a,p,q,color,mat);this.tri(b,v,s,color,mat)}}
 sphere(p,r,col,mat=0){const u=[p[0],p[1]+r,p[2]],d=[p[0],p[1]-r,p[2]],ring=Array.from({length:8},(_,i)=>[p[0]+Math.cos(i*Math.PI/4)*r,p[1],p[2]+Math.sin(i*Math.PI/4)*r]);for(let i=0;i<8;i++){this.tri(u,ring[(i+1)%8],ring[i],col,mat);this.tri(d,ring[i],ring[(i+1)%8],col,mat)}}
 ring(x,y,z,r,color,mat=-.5,start=0,end=Math.PI*2,width=.04){let n=Math.max(3,Math.ceil((end-start)*r*5));for(let i=0;i<n;i++){const a=start+(end-start)*i/n,b=start+(end-start)*(i+1)/n;this.quad([x+Math.sin(a)*r,y,z-Math.cos(a)*r],[x+Math.sin(b)*r,y,z-Math.cos(b)*r],[x+Math.sin(b)*(r-width),y,z-Math.cos(b)*(r-width)],[x+Math.sin(a)*(r-width),y,z-Math.cos(a)*(r-width)],color,mat)}}
}
const VS=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;attribute float aMaterial;uniform mat4 uVP;varying vec3 vWorld;varying vec3 vNormal;varying vec3 vColor;varying float vMaterial;void main(){vWorld=aPosition;vNormal=aNormal;vColor=aColor;vMaterial=aMaterial;gl_Position=uVP*vec4(aPosition,1.);}`;
const FS=`precision mediump float;
varying vec3 vWorld;varying vec3 vNormal;varying vec3 vColor;varying float vMaterial;
uniform vec3 uEye;uniform vec3 uLights[4];uniform float uTime;uniform vec3 uPortal;
float hash(vec2 p){return fract(sin(dot(p,vec2(17.13,83.73)))*4837.721);}
void main(){
 vec3 n=normalize(vNormal),albedo=vColor;vec2 uv=abs(n.y)>.6?vWorld.xz:abs(n.x)>.6?vWorld.zy:vWorld.xy;
 if(vMaterial>.5&&vMaterial<1.5){uv*=vec2(.9,2.2);uv.x+=mod(floor(uv.y),2.)*.5;vec2 f=fract(uv);float mortar=step(.035,f.x)*step(.06,f.y)*step(f.x,.965)*step(f.y,.94);albedo*=mix(.39,.77+hash(floor(uv))*.29,mortar);albedo*=.95+hash(floor(uv*30.))*.10;}
 if(vMaterial>1.5&&vMaterial<2.5){vec2 f=fract(uv);float mortar=step(.018,f.x)*step(.018,f.y)*step(f.x,.982)*step(f.y,.982);albedo*=mix(.41,.76+hash(floor(uv))*.33,mortar);}
 if(vMaterial>2.5&&vMaterial<3.5){float grain=sin(uv.y*30.+sin(uv.x*5.)*2.);albedo*=.86+grain*.10;}
 vec3 l=uEye+vec3(.0,.3,.0)-vWorld;float d=length(l);vec3 light=vec3(.13,.16,.20)+vec3(.77,.62,.40)*(.20+max(0.,dot(n,normalize(l)))*.85)/(1.+d*d*.065);
 for(int i=0;i<4;i++){vec3 q=uLights[i]-vWorld;float dist=length(q);float flick=.94+.06*sin(uTime*5.+float(i)*2.);light+=vec3(1.,.49,.15)*max(0.,dot(n,normalize(q)))*2.4*flick/(1.+dist*dist*.65);}
 vec3 po=uPortal-vWorld;light+=vec3(.08,.42,.77)*max(.1,dot(n,normalize(po)))*1.5/(1.+dot(po,po));
 vec3 color=albedo*light;
 if(vMaterial>3.5)color+=vec3(.15,.17,.18)*pow(max(0.,dot(reflect(-normalize(l),n),normalize(uEye-vWorld))),20.)/(1.+d*.2);
 if(vMaterial<-.01)color=albedo*(1.0-vMaterial);
 float fog=1.-exp(-max(0.,d-3.)*.033);color=mix(color,vec3(.028,.042,.056),clamp(fog,0.,.9));
 color=pow(max(color,vec3(.0)),vec3(.83));gl_FragColor=vec4(color,1.);
}`;
class Renderer{
 constructor(canvas){
  this.canvas=canvas;this.gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance'});if(!this.gl)throw Error('WebGL을 사용할 수 없습니다. 브라우저의 하드웨어 가속을 확인해 주세요.');const g=this.gl;
  const shader=(type,src)=>{const s=g.createShader(type);g.shaderSource(s,src);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));return s};
  this.program=g.createProgram();g.attachShader(this.program,shader(g.VERTEX_SHADER,VS));g.attachShader(this.program,shader(g.FRAGMENT_SHADER,FS));g.linkProgram(this.program);if(!g.getProgramParameter(this.program,g.LINK_STATUS))throw Error(g.getProgramInfoLog(this.program));g.useProgram(this.program);
  this.at=['aPosition','aNormal','aColor','aMaterial'].map(x=>g.getAttribLocation(this.program,x));this.u={};for(const n of ['uVP','uEye','uLights','uTime','uPortal'])this.u[n]=g.getUniformLocation(this.program,n);this.static=g.createBuffer();this.dynamic=g.createBuffer();this.staticCount=0;this.vertexCount=0;g.enable(g.DEPTH_TEST);g.disable(g.CULL_FACE);this.frames=0;this.scale=1;
 }
 upload(mesh){const g=this.gl;g.bindBuffer(g.ARRAY_BUFFER,this.static);g.bufferData(g.ARRAY_BUFFER,new Float32Array(mesh.data),g.STATIC_DRAW);this.staticCount=mesh.data.length/10}
 bind(buffer){const g=this.gl;g.bindBuffer(g.ARRAY_BUFFER,buffer);let off=0;for(let i=0;i<4;i++){g.enableVertexAttribArray(this.at[i]);g.vertexAttribPointer(this.at[i],i===3?1:3,g.FLOAT,false,40,off*4);off+=i===3?1:3}}
 draw(camera,map,dynamic,time,fov=75){
  const g=this.gl,w=Math.max(1,Math.round(this.canvas.clientWidth*this.scale)),h=Math.max(1,Math.round(this.canvas.clientHeight*this.scale));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}g.viewport(0,0,w,h);g.clearColor(.028,.042,.056,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.useProgram(this.program);
  this.vp=mul4(perspective(fov*Math.PI/180,w/h),viewMatrix(camera.eye,camera.yaw,camera.pitch));g.uniformMatrix4fv(this.u.uVP,false,this.vp);g.uniform3fv(this.u.uEye,camera.eye);g.uniform1f(this.u.uTime,time);g.uniform3fv(this.u.uPortal,[map.exit.x,1.2,map.exit.z]);
  const lights=map.torches.slice().sort((a,b)=>Math.hypot(a.x-camera.eye[0],a.z-camera.eye[2])-Math.hypot(b.x-camera.eye[0],b.z-camera.eye[2])).slice(0,4).flatMap(p=>[p.x,p.y,p.z]);while(lights.length<12)lights.push(0,-100,0);g.uniform3fv(this.u.uLights,new Float32Array(lights));this.bind(this.static);g.drawArrays(g.TRIANGLES,0,this.staticCount);this.bind(this.dynamic);g.bufferData(g.ARRAY_BUFFER,new Float32Array(dynamic.data),g.DYNAMIC_DRAW);g.drawArrays(g.TRIANGLES,0,dynamic.data.length/10);this.vertexCount=this.staticCount+dynamic.data.length/10;this.frames++;
 }
 project(p){if(!this.vp)return null;const m=this.vp,v=[...p,1],a=[0,0,0,0];for(let r=0;r<4;r++)for(let k=0;k<4;k++)a[r]+=m[k*4+r]*v[k];if(a[3]<=.05)return null;return{x:(a[0]/a[3]*.5+.5)*this.canvas.clientWidth,y:(.5-a[1]/a[3]*.5)*this.canvas.clientHeight}}
}
function buildDungeonMesh(map){
 const m=new Mesh(),stone=[.43,.47,.48],floor=[.31,.32,.31];
 for(let z=1;z<N-1;z++)for(let x=1;x<N-1;x++){
  if(map.grid[z][x]===0){m.box([(x+.5)*TILE,-.13,(z+.5)*TILE],[TILE,.26,TILE],floor,IDENT,2);m.box([(x+.5)*TILE,CEILING+.1,(z+.5)*TILE],[TILE,.2,TILE],[.22,.25,.27],IDENT,1);
   for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])if(map.grid[z+dz][x+dx]){
    let cx=(x+.5)*TILE+dx*.99,cz=(z+.5)*TILE+dz*.99;
    m.box([cx,.12,cz],[dx?.15:TILE,.24,dz?.15:TILE],[.31,.33,.34]);m.box([cx,3.55,cz],[dx?.18:TILE,.23,dz?.18:TILE],[.37,.38,.38]);
    if((x+z)%3===0){m.box([cx,1.9,cz],[.31,3.4,.31],[.38,.41,.42],IDENT,1);m.box([cx,3.33,cz],[.48,.22,.48],[.41,.43,.42])}
   }
  }else if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>map.grid[z+dz]?.[x+dx]===0))m.box([(x+.5)*TILE,CEILING/2,(z+.5)*TILE],[TILE,CEILING,TILE],stone,IDENT,1);
 }
 for(const r of map.rooms){
  // Recessed corner pillars, kept outside the playable walking lanes.
  for(const[x,z]of [[r.x+.15,r.z+.15],[r.x+r.w-.15,r.z+.15],[r.x+.15,r.z+r.h-.15],[r.x+r.w-.15,r.z+r.h-.15]]){m.box([x*TILE,1.9,z*TILE],[.42,3.8,.42],[.34,.38,.4],IDENT,1);m.box([x*TILE,.15,z*TILE],[.60,.3,.60],[.36,.39,.4]);m.box([x*TILE,3.5,z*TILE],[.66,.26,.66],[.42,.43,.42])}
  m.box([(r.x+r.w/2)*TILE,3.65,(r.z+r.h/2)*TILE],[r.w*TILE,.24,.27],[.27,.22,.18],IDENT,3);
 }
 for(const t of map.torches){m.rod([t.x,t.y-.65,t.z],[t.x,t.y-.1,t.z],.065,[.24,.15,.08],3);m.rod([t.x,t.y-.19,t.z],[t.x,t.y-.03,t.z],.12,[.25,.25,.25],4,8)}
 return m;
}
window.CryptRender={Mesh,Renderer,buildDungeonMesh,IDENT};
})();
