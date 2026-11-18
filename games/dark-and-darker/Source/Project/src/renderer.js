/* v14: textured WebGL renderer. Lantern shadow map + bloom + FXAA. */
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
Mesh.prototype.ellipsoid=function(center,radii,col,axes=IDENT,mat=5,slices=12,rings=7){
 const pt=(a,b)=>localPoint(center,axes,[Math.sin(a)*Math.cos(b)*radii[0],Math.cos(a)*radii[1],Math.sin(a)*Math.sin(b)*radii[2]]);
 const nm=(a,b)=>V.norm(localPoint([0,0,0],axes,[Math.sin(a)*Math.cos(b)/radii[0],Math.cos(a)/radii[1],Math.sin(a)*Math.sin(b)/radii[2]]));
 const add=(a,b)=>this.vert(pt(a,b),nm(a,b),col,mat);
 for(let j=0;j<rings;j++)for(let i=0;i<slices;i++){const a=j*Math.PI/rings,b=(j+1)*Math.PI/rings,c=i*2*Math.PI/slices,d=(i+1)*2*Math.PI/slices;add(a,c);add(b,c);add(b,d);add(a,c);add(b,d);add(a,d)}
};
Mesh.prototype.bevelBox=function(center,size,col,axes=IDENT,mat=8,bevel=.05){
 const x=size[0]/2,y=size[1]/2,z=size[2]/2,b=Math.min(bevel,x*.4,y*.4,z*.4),ring=[[-x+b,-y],[x-b,-y],[x,-y+b],[x,y-b],[x-b,y],[-x+b,y],[-x,y-b],[-x,-y+b]],p=(xy,zz)=>localPoint(center,axes,[xy[0],xy[1],zz]);
 for(let i=0;i<8;i++){const j=(i+1)%8,a=ring[i],c=ring[j];this.quad(p(a,-z),p(c,-z),p(c,z),p(a,z),col,mat);this.tri(localPoint(center,axes,[0,0,z]),p(a,z),p(c,z),col,mat);this.tri(localPoint(center,axes,[0,0,-z]),p(c,-z),p(a,-z),col,mat)}
};
Mesh.prototype.path=function(points,r,col,mat=0,sides=6){for(let i=0;i<points.length-1;i++)this.rod(points[i],points[i+1],r,col,mat,sides)};
Mesh.prototype.flame=function(center,height,width,t,seed=0){
 const rings=5,sides=7,at=(j,i)=>{const h=j/rings,a=i/sides*Math.PI*2+Math.sin(t*3+seed+h)*.3,r=width*Math.pow(1-h,.75)*(1+.13*Math.sin(t*8+i+j));return[center[0]+Math.sin(a)*r+Math.sin(t*4+seed+h*3)*h*.07,center[1]+h*height,center[2]+Math.cos(a)*r+Math.cos(t*5+seed+h*2)*h*.05]};
 for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){const col=j<2?[1,.67,.16]:j<4?[1,.29,.025]:[.9,.1,.01];this.quad(at(j,i),at(j,i+1),at(j+1,i+1),at(j+1,i),col,-1.25)}
};
const VS=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;attribute float aMaterial;
uniform mat4 uVP,uLightVP;varying vec3 vWorld,vNormal,vColor;varying float vMaterial;varying vec4 vShadow;
void main(){vWorld=aPosition;vNormal=aNormal;vColor=aColor;vMaterial=aMaterial;vShadow=uLightVP*vec4(aPosition,1.);gl_Position=uVP*vec4(aPosition,1.);}`;
const FS=`precision highp float;
varying vec3 vWorld,vNormal,vColor;varying float vMaterial;varying vec4 vShadow;
uniform vec3 uEye,uLights[4],uPortal,uLantern,uForward;uniform float uTime,uShadowOn,uShadowTexel,uBump,uFog,uLanternPower;
uniform sampler2D uAlbedo,uNormal,uShadow,uGrid;
float unpackDepth(vec4 c){return dot(c.rgb,vec3(1.,1./255.,1./65025.));}
float shade(vec3 n,vec3 l){
 if(uShadowOn<.5)return 1.;vec3 q=vShadow.xyz/vShadow.w*.5+.5;
 if(vShadow.w<=0.||q.x<.003||q.y<.003||q.x>.997||q.y>.997||q.z>1.)return 1.;
 float bias=.00028+.0006*(1.-max(0.,dot(n,l))),s=0.;
 for(int x=0;x<2;x++)for(int y=0;y<2;y++){vec2 off=(vec2(float(x),float(y))-.5)*uShadowTexel*1.6;float z=unpackDepth(texture2D(uShadow,q.xy+off));s+=step(q.z-bias,z);}return .18+.82*s*.25;
}
float wall(vec2 cell){return texture2D(uGrid,(cell+.5)/31.).r;}
vec3 brdf(vec3 n,vec3 l,vec3 v,vec3 albedo,float rough,float metal){
 float ndl=max(dot(n,l),0.);vec3 h=normalize(l+v);float fres=pow(1.-max(dot(v,h),0.),5.);
 vec3 f0=mix(vec3(.035),albedo*.55,metal);vec3 f=f0+(1.-f0)*fres;
 float spec=pow(max(dot(n,h),0.),mix(100.,5.,rough))*mix(1.7,.13,rough);
 return albedo*ndl*(1.-metal*.72)+f*spec*ndl;
}
void main(){
 vec3 n=normalize(vNormal),base=n,albedo=vColor,view=normalize(uEye-vWorld);float rough=.83,metal=0.,ao=1.;
 vec3 an=abs(n);vec2 uv;vec3 tx,bx;
 if(an.y>an.x&&an.y>an.z){uv=vWorld.xz;tx=vec3(1,0,0);bx=vec3(0,0,1);}
 else if(an.x>an.z){uv=vWorld.zy;tx=vec3(0,0,1);bx=vec3(0,1,0);}else{uv=vWorld.xy;tx=vec3(1,0,0);bx=vec3(0,1,0);}
 if(vMaterial>.5){
  float id=clamp(floor(vMaterial+.1)-1.,0.,7.),scale=vMaterial<2.5?.5:vMaterial<3.5?.7:2.1;
  vec2 xy=fract(uv*scale),tile=vec2(mod(id,4.),floor(id/4.));vec2 tc=(tile+(.015625+xy*.96875))/vec2(4.,2.);
  vec4 tex=texture2D(uAlbedo,tc),nr=texture2D(uNormal,tc);albedo*=tex.rgb*1.75;rough=nr.a;ao=tex.a;
  n=normalize(n+(nr.x*2.-1.)*tx*uBump+(nr.y*2.-1.)*bx*uBump);
  if(vMaterial>3.5&&vMaterial<4.5)metal=.85;if(vMaterial>6.5&&vMaterial<7.5)metal=.9;
 }
 if(an.y>.7&&vWorld.y<.15){vec2 q=vWorld.xz/2.,cell=floor(q),f=fract(q);float a=1.;
  a*=1.-wall(cell+vec2(-1,0))*(1.-smoothstep(0.,.48,f.x))*.42;
  a*=1.-wall(cell+vec2(1,0))*(1.-smoothstep(0.,.48,1.-f.x))*.42;
  a*=1.-wall(cell+vec2(0,-1))*(1.-smoothstep(0.,.48,f.y))*.42;
  a*=1.-wall(cell+vec2(0,1))*(1.-smoothstep(0.,.48,1.-f.y))*.42;ao*=a;
 }
 if(an.y<.5)ao*=mix(.66,1.,smoothstep(0.,.7,vWorld.y));
 albedo=pow(clamp(albedo,0.,1.),vec3(1.7));
 vec3 color=albedo*vec3(.085,.105,.145)*ao*(.85+.15*base.y);
 vec3 light=uLantern-vWorld;float d=length(light);vec3 l=light/max(d,.01);float cone=smoothstep(.35,.78,dot(-l,uForward));
 color+=brdf(n,l,view,albedo,rough,metal)*vec3(1.1,.90,.65)*uLanternPower*(.25+.75*cone)/(1.+d*d*.085)*shade(base,l);
 for(int i=0;i<4;i++){vec3 q=uLights[i]-vWorld;float dist=length(q),flick=.96+.04*sin(uTime*5.+float(i)*2.);color+=brdf(n,q/max(dist,.01),view,albedo,rough,metal)*vec3(1.,.48,.13)*3.4*flick/(1.+dist*dist*.58);}
 vec3 po=uPortal-vWorld;color+=brdf(n,normalize(po),view,albedo,rough,metal)*vec3(.08,.46,.95)*3.0/(1.+dot(po,po)*.65);
 if(vMaterial<-.01)color=albedo*(1.-vMaterial)*.9;
 float fog=(1.-exp(-max(0.,length(uEye-vWorld)-3.)*.030*uFog));fog+=.035*uFog*(1.-smoothstep(0.,1.1,vWorld.y))*smoothstep(2.,10.,d);
 color=mix(color,vec3(.035,.055,.075),clamp(fog,0.,.82));gl_FragColor=vec4(max(color,vec3(0.))*.67,1.);
}`;
const DEPTHVS=`attribute vec3 aPosition;attribute float aMaterial;uniform mat4 uLightVP;varying float vMat;void main(){vMat=aMaterial;gl_Position=uLightVP*vec4(aPosition,1.);}`;
const DEPTHFS=`precision highp float;varying float vMat;void main(){if(vMat<-.01)discard;float z=min(gl_FragCoord.z,.999999);vec3 e=fract(z*vec3(1.,255.,65025.));e-=e.yzz*vec3(1./255.,1./255.,0.);gl_FragColor=vec4(e,1.);}`;
const FULLVS=`attribute vec2 aPosition;varying vec2 vUV;void main(){vUV=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`;
const BLOOMFS=`precision mediump float;varying vec2 vUV;uniform sampler2D uSource;uniform vec2 uDirection;uniform float uExtract;
vec3 tap(vec2 p){vec3 c=texture2D(uSource,p).rgb;return uExtract>.5?max(c-vec3(.65),vec3(0.)):c;}
void main(){vec3 col=tap(vUV)*.227027;col+=(tap(vUV+uDirection*1.384615)+tap(vUV-uDirection*1.384615))*.316216;col+=(tap(vUV+uDirection*3.230769)+tap(vUV-uDirection*3.230769))*.070270;gl_FragColor=vec4(col,1.);}`;
const POSTFS=`precision highp float;varying vec2 vUV;uniform sampler2D uScene,uBloom;uniform vec2 uTexel;uniform float uExposure,uBloomStrength,uFXAA;
float lumin(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 tone(vec3 c){return clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.);}
void main(){vec3 c=texture2D(uScene,vUV).rgb;
 if(uFXAA>.5){vec3 n=texture2D(uScene,vUV+vec2(0.,uTexel.y)).rgb,s=texture2D(uScene,vUV-vec2(0.,uTexel.y)).rgb,e=texture2D(uScene,vUV+vec2(uTexel.x,0.)).rgb,w=texture2D(uScene,vUV-vec2(uTexel.x,0.)).rgb;
 float lo=min(lumin(c),min(min(lumin(n),lumin(s)),min(lumin(e),lumin(w)))),hi=max(lumin(c),max(max(lumin(n),lumin(s)),max(lumin(e),lumin(w))));
 if(hi-lo>max(.045,hi*.25)){vec3 blend=abs(lumin(n)-lumin(s))>abs(lumin(e)-lumin(w))?(e+w)*.5:(n+s)*.5;c=mix(c,blend,.27);}}
 c+=texture2D(uBloom,vUV).rgb*uBloomStrength;c=pow(tone(c*1.45*uExposure),vec3(1./2.2));vec2 p=vUV-.5;c*=1.-.32*dot(p,p);
 float grain=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5)-.5)/255.;gl_FragColor=vec4(c+grain,1.);}`;
class Renderer{
 constructor(canvas){
  this.canvas=canvas;const g=this.gl=canvas.getContext('webgl',{antialias:false,alpha:false,powerPreference:'high-performance'});
  if(!g)throw Error('WebGL이 필요합니다. 브라우저 하드웨어 가속을 확인하세요.');
  this.frames=0;this.scale=1;this.texturesReady=0;this.drawCalls=0;this.vertexCount=0;this.staticCount=0;this.lastMs=0;this.maxAttribs=g.getParameter(g.MAX_VERTEX_ATTRIBS);
  this.options={shadows:true,bloom:true,bump:1.,exposure:1.,fog:1.,fxaa:true,particles:true,lantern:.95};this.preset='balanced';
  this.program=this.makeProgram(VS,FS);this.shadowProgram=this.makeProgram(DEPTHVS,DEPTHFS);this.bloomProgram=this.makeProgram(FULLVS,BLOOMFS);this.postProgram=this.makeProgram(FULLVS,POSTFS);
  this.static=g.createBuffer();this.dynamic=g.createBuffer();this.quad=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,this.quad);g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),g.STATIC_DRAW);
  this.albedo=this.loadTexture(CryptAssets.albedo,[160,160,160,255]);this.normal=this.loadTexture(CryptAssets.normal,[128,128,255,220]);
  this.grid=this.createTexture(32,32,null,g.NEAREST);this.shadowSize=1024;this.shadowTarget=this.target(this.shadowSize,this.shadowSize,true,g.NEAREST);this.sceneTarget=null;this.blooms=[];this.map=null;g.enable(g.DEPTH_TEST);g.disable(g.CULL_FACE);
 }
 makeProgram(vs,fs){const g=this.gl,p=g.createProgram();for(const [kind,src]of[[g.VERTEX_SHADER,vs],[g.FRAGMENT_SHADER,fs]]){const s=g.createShader(kind);g.shaderSource(s,src);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error('Shader compile: '+g.getShaderInfoLog(s));g.attachShader(p,s);g.deleteShader(s)}g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error('Shader link: '+g.getProgramInfoLog(p));return{p,u:{},a:{}}}
 uniform(p,n){if(!(n in p.u))p.u[n]=this.gl.getUniformLocation(p.p,n);return p.u[n]}
 attr(p,n){if(!(n in p.a))p.a[n]=this.gl.getAttribLocation(p.p,n);return p.a[n]}
 createTexture(w,h,data,filter){const g=this.gl,t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,w,h,0,g.RGBA,g.UNSIGNED_BYTE,data);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,filter||g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,filter||g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);return t}
 loadTexture(url,fallback){const g=this.gl,t=this.createTexture(1,1,new Uint8Array(fallback),g.LINEAR),im=new Image();im.onload=()=>{g.bindTexture(g.TEXTURE_2D,t);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,false);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,im);g.generateMipmap(g.TEXTURE_2D);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR_MIPMAP_LINEAR);const ext=g.getExtension('EXT_texture_filter_anisotropic');if(ext)g.texParameterf(g.TEXTURE_2D,ext.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,g.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));this.texturesReady++};im.onerror=()=>{this.textureError=true;console.warn('Material atlas unavailable; neutral fallback active.')};im.src=url;return t}
 target(w,h,depth=false,filter){const g=this.gl,texture=this.createTexture(w,h,null,filter),fbo=g.createFramebuffer();g.bindFramebuffer(g.FRAMEBUFFER,fbo);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,texture,0);let rb=null;if(depth){rb=g.createRenderbuffer();g.bindRenderbuffer(g.RENDERBUFFER,rb);g.renderbufferStorage(g.RENDERBUFFER,g.DEPTH_COMPONENT16,w,h);g.framebufferRenderbuffer(g.FRAMEBUFFER,g.DEPTH_ATTACHMENT,g.RENDERBUFFER,rb)}if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('Graphics framebuffer incomplete');g.bindFramebuffer(g.FRAMEBUFFER,null);return{fbo,texture,rb,w,h}}
 deleteTarget(t){if(!t)return;const g=this.gl;g.deleteTexture(t.texture);g.deleteFramebuffer(t.fbo);if(t.rb)g.deleteRenderbuffer(t.rb)}
 resize(w,h){if(this.sceneTarget&&this.sceneTarget.w===w&&this.sceneTarget.h===h)return;this.deleteTarget(this.sceneTarget);for(const t of this.blooms)this.deleteTarget(t);this.sceneTarget=this.target(w,h,true);const bw=Math.max(1,Math.ceil(w/4)),bh=Math.max(1,Math.ceil(h/4));this.blooms=[this.target(bw,bh),this.target(bw,bh)]}
 upload(mesh){const g=this.gl;g.bindBuffer(g.ARRAY_BUFFER,this.static);g.bufferData(g.ARRAY_BUFFER,new Float32Array(mesh.data),g.STATIC_DRAW);this.staticCount=mesh.data.length/10;this.staticMeta=mesh.meta||{};this.map=null}
 bind(buffer,program=this.program){const g=this.gl;g.bindBuffer(g.ARRAY_BUFFER,buffer);const names=['aPosition','aNormal','aColor','aMaterial'],offset=[0,12,24,36];for(let i=0;i<4;i++){const a=this.attr(program,names[i]);if(a<0)continue;g.enableVertexAttribArray(a);g.vertexAttribPointer(a,i===3?1:3,g.FLOAT,false,40,offset[i])}}
 tex(p,name,tex,unit){const g=this.gl;g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,tex);g.uniform1i(this.uniform(p,name),unit)}
 fullscreen(p){const g=this.gl;g.bindBuffer(g.ARRAY_BUFFER,this.quad);for(let i=0;i<this.maxAttribs;i++)g.disableVertexAttribArray(i);const a=this.attr(p,'aPosition');g.enableVertexAttribArray(a);g.vertexAttribPointer(a,2,g.FLOAT,false,0,0);g.drawArrays(g.TRIANGLES,0,6);this.drawCalls++}
 setPreset(name){if(!['performance','balanced','cinematic'].includes(name))name='balanced';Object.assign(this.options,name==='performance'?{shadows:false,bloom:false,bump:.6,particles:false}:name==='cinematic'?{shadows:true,bloom:true,bump:1.25,particles:true}:{shadows:true,bloom:true,bump:1.,particles:true});this.preset=name;const size=name==='cinematic'?2048:1024;if(this.shadowSize!==size){this.deleteTarget(this.shadowTarget);this.shadowSize=size;this.shadowTarget=this.target(size,size,true,this.gl.NEAREST)}}
 draw(camera,map,dynamic,time,fov=75){
  const start=performance.now(),g=this.gl,w=Math.max(1,Math.round(this.canvas.clientWidth*this.scale)),h=Math.max(1,Math.round(this.canvas.clientHeight*this.scale));
  if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}this.resize(w,h);this.drawCalls=0;
  if(this.map!==map){const pixels=new Uint8Array(N*N*4);for(let z=0;z<N;z++)for(let x=0;x<N;x++){const k=(z*N+x)*4;pixels[k]=map.grid[z][x]?255:0;pixels[k+3]=255}g.activeTexture(g.TEXTURE4);g.bindTexture(g.TEXTURE_2D,this.grid);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,N,N,0,g.RGBA,g.UNSIGNED_BYTE,pixels);this.map=map}
  const data=new Float32Array(dynamic.data),count=data.length/10;g.bindBuffer(g.ARRAY_BUFFER,this.dynamic);g.bufferData(g.ARRAY_BUFFER,data,g.DYNAMIC_DRAW);
  this.vp=mul4(perspective(fov*Math.PI/180,w/h),viewMatrix(camera.eye,camera.yaw,camera.pitch));
  const axes=C.yawAxes(camera.yaw,camera.pitch),lantern=localPoint(camera.eye,axes,[.36,.48,-.12]);this.lightVP=mul4(perspective(1.95,1,.12,38),viewMatrix(lantern,camera.yaw,camera.pitch-.06));
  g.enable(g.DEPTH_TEST);g.depthMask(true);g.disable(g.BLEND);
  if(this.options.shadows){const p=this.shadowProgram;g.bindFramebuffer(g.FRAMEBUFFER,this.shadowTarget.fbo);g.viewport(0,0,this.shadowSize,this.shadowSize);g.clearColor(1,1,1,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.useProgram(p.p);g.uniformMatrix4fv(this.uniform(p,'uLightVP'),false,this.lightVP);this.bind(this.static,p);g.drawArrays(g.TRIANGLES,0,this.staticCount);this.bind(this.dynamic,p);g.drawArrays(g.TRIANGLES,0,dynamic.worldCount??count);this.drawCalls+=2;}
  const p=this.program;g.bindFramebuffer(g.FRAMEBUFFER,this.sceneTarget.fbo);g.viewport(0,0,w,h);g.clearColor(.025,.035,.05,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.useProgram(p.p);
  g.uniformMatrix4fv(this.uniform(p,'uVP'),false,this.vp);g.uniformMatrix4fv(this.uniform(p,'uLightVP'),false,this.lightVP);
  for(const[n,v]of Object.entries({uEye:camera.eye,uPortal:[map.exit.x,1.35,map.exit.z],uLantern:lantern,uForward:axes[2]}))g.uniform3fv(this.uniform(p,n),v);
  for(const[n,v]of Object.entries({uTime:time,uShadowOn:this.options.shadows?1:0,uShadowTexel:1/this.shadowSize,uBump:this.options.bump,uFog:this.options.fog,uLanternPower:this.options.lantern}))g.uniform1f(this.uniform(p,n),v);
  const visible=map.torches.filter(t=>C.lineClear(map,camera.eye[0],camera.eye[2],t.x,t.z)),lights=(visible.length?visible:map.torches).slice().sort((a,b)=>Math.hypot(a.x-camera.eye[0],a.z-camera.eye[2])-Math.hypot(b.x-camera.eye[0],b.z-camera.eye[2])).slice(0,4).flatMap(t=>[t.x,t.y,t.z]);while(lights.length<12)lights.push(0,-100,0);g.uniform3fv(this.uniform(p,'uLights'),new Float32Array(lights));
  this.tex(p,'uAlbedo',this.albedo,0);this.tex(p,'uNormal',this.normal,1);this.tex(p,'uShadow',this.shadowTarget.texture,2);this.tex(p,'uGrid',this.grid,3);
  this.bind(this.static,p);g.drawArrays(g.TRIANGLES,0,this.staticCount);this.bind(this.dynamic,p);g.drawArrays(g.TRIANGLES,0,count);this.drawCalls+=2;
  g.disable(g.DEPTH_TEST);g.depthMask(false);
  if(this.options.bloom){const b=this.bloomProgram;g.useProgram(b.p);for(let i=0;i<2;i++){const target=this.blooms[i];g.bindFramebuffer(g.FRAMEBUFFER,target.fbo);g.viewport(0,0,target.w,target.h);this.tex(b,'uSource',i?this.blooms[0].texture:this.sceneTarget.texture,0);g.uniform2f(this.uniform(b,'uDirection'),i?0:1.4/target.w,i?1.4/target.h:0);g.uniform1f(this.uniform(b,'uExtract'),i?0:1);this.fullscreen(b)}}
  const post=this.postProgram;g.bindFramebuffer(g.FRAMEBUFFER,null);g.viewport(0,0,w,h);g.useProgram(post.p);this.tex(post,'uScene',this.sceneTarget.texture,0);this.tex(post,'uBloom',this.blooms[1].texture,1);g.uniform2f(this.uniform(post,'uTexel'),1/w,1/h);g.uniform1f(this.uniform(post,'uExposure'),this.options.exposure);g.uniform1f(this.uniform(post,'uBloomStrength'),this.options.bloom?.58:0);g.uniform1f(this.uniform(post,'uFXAA'),this.options.fxaa?1:0);this.fullscreen(post);g.depthMask(true);
  this.vertexCount=this.staticCount+count;this.frames++;this.lastMs=performance.now()-start;
 }
 project(p){if(!this.vp)return null;const m=this.vp,v=[...p,1],a=[0,0,0,0];for(let r=0;r<4;r++)for(let k=0;k<4;k++)a[r]+=m[k*4+r]*v[k];if(a[3]<=.05)return null;return{x:(a[0]/a[3]*.5+.5)*this.canvas.clientWidth,y:(.5-a[1]/a[3]*.5)*this.canvas.clientHeight}}
}
function buildDungeonMesh(map){
 const m=new Mesh(),stone=[.41,.44,.46],floor=[.33,.35,.35];let arches=0,reliefs=0;
 const arch=(x,z,yaw,half=1.01,base=2.65,rise=.89,posts=true)=>{
  const axes=C.yawAxes(yaw),pt=(a,r,h,d)=>localPoint([x,base,z],axes,[Math.cos(a)*r,Math.sin(a)*h,d]);
  if(posts)for(const side of[-1,1]){const p=localPoint([x,0,z],axes,[side*(half+.12),0,0]);m.bevelBox([p[0],base*.5,p[2]],[.29,base,.35],[.45,.45,.42],axes,8,.06);m.bevelBox([p[0],.13,p[2]],[.43,.26,.44],[.42,.43,.41],axes,8);m.bevelBox([p[0],base-.03,p[2]],[.43,.23,.46],[.50,.48,.42],axes,8)}
  for(let i=0;i<13;i++){const a=i/13*Math.PI+.009,b=(i+1)/13*Math.PI-.009,p=pt(a,half,rise,-.17),q=pt(b,half,rise,-.17),r=pt(b,half+.25,rise+.20,-.17),s=pt(a,half+.25,rise+.20,-.17),P=pt(a,half,rise,.17),Q=pt(b,half,rise,.17),R=pt(b,half+.25,rise+.20,.17),S=pt(a,half+.25,rise+.20,.17),col=[.42+i%2*.025,.43+i%2*.025,.42+i%2*.025];m.quad(p,q,r,s,col,8);m.quad(S,R,Q,P,col,8);m.quad(p,P,Q,q,col,8);m.quad(s,r,R,S,col,8);m.quad(p,s,S,P,col,8);m.quad(q,Q,R,r,col,8)}arches++;
 };
 for(let z=1;z<N-1;z++)for(let x=1;x<N-1;x++){
  const wx=(x+.5)*TILE,wz=(z+.5)*TILE;
  if(map.grid[z][x]===0){
   m.quad([x*TILE,0,z*TILE],[x*TILE,0,(z+1)*TILE],[(x+1)*TILE,0,(z+1)*TILE],[(x+1)*TILE,0,z*TILE],floor,2);
   m.quad([x*TILE,CEILING,z*TILE],[(x+1)*TILE,CEILING,z*TILE],[(x+1)*TILE,CEILING,(z+1)*TILE],[x*TILE,CEILING,(z+1)*TILE],[.24,.27,.29],1);
   for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]])if(map.grid[z+dz][x+dx]){
    const cx=wx+dx*.98,cz=wz+dz*.98;
    m.bevelBox([cx,.12,cz],[dx?.14:TILE,.24,dz?.14:TILE],[.36,.38,.38],IDENT,8);
    m.bevelBox([cx,3.55,cz],[dx?.17:TILE,.23,dz?.17:TILE],[.40,.41,.40],IDENT,8);
    if((x+z)%3===0){m.bevelBox([cx,1.77,cz],[.29,3.35,.29],[.43,.44,.42],IDENT,8);m.bevelBox([cx,3.35,cz],[.44,.24,.44],[.49,.48,.43],IDENT,8)}
    // Wall reliefs sit against walls, never across navigation lanes.
    if((x*7+z*13)%11===0){const axes=C.yawAxes(Math.atan2(-dx,dz)),p=[wx+dx*.91,1.77,wz+dz*.91];m.bevelBox(p,[.65,1.08,.09],[.23,.27,.28],axes,8);m.bevelBox(localPoint(p,axes,[0,0,.065]),[.52,.91,.055],[.36,.38,.36],axes,8);m.rod(localPoint(p,axes,[0,-.28,.103]),localPoint(p,axes,[0,.29,.103]),.033,[.62,.49,.26],7);m.rod(localPoint(p,axes,[-.17,.10,.103]),localPoint(p,axes,[.17,.10,.103]),.03,[.62,.49,.26],7);reliefs++}
   }
  }else if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>map.grid[z+dz]?.[x+dx]===0))m.box([wx,CEILING/2,wz],[TILE,CEILING,TILE],stone,IDENT,1);
 }
 const used=new Set();
 for(const r of map.rooms){
  for(const[x,z]of[[r.x+.12,r.z+.12],[r.x+r.w-.12,r.z+.12],[r.x+.12,r.z+r.h-.12],[r.x+r.w-.12,r.z+r.h-.12]]){
   m.rod([x*TILE,.23,z*TILE],[x*TILE,3.48,z*TILE],.23,[.38,.40,.40],8,10);m.bevelBox([x*TILE,.14,z*TILE],[.60,.28,.60],[.45,.44,.41],IDENT,8);m.bevelBox([x*TILE,3.54,z*TILE],[.63,.3,.63],[.47,.46,.43],IDENT,8);
  }
  for(let x=r.x;x<r.x+r.w;x++)for(const z of[r.z-1,r.z+r.h])if(map.grid[z]?.[x]===0){const zz=z<r.z?r.z*TILE:(r.z+r.h)*TILE,key=x+','+zz;if(!used.has(key)){arch((x+.5)*TILE,zz,0);used.add(key)}}
  for(let z=r.z;z<r.z+r.h;z++)for(const x of[r.x-1,r.x+r.w])if(map.grid[z]?.[x]===0){const xx=x<r.x?r.x*TILE:(r.x+r.w)*TILE,key=xx+','+z;if(!used.has(key)){arch(xx,(z+.5)*TILE,Math.PI/2);used.add(key)}}
  // A hanging banner lies against a closed room wall, not in a doorway.
  const wx=(r.cx+.5)*TILE,wz=(r.z+.035)*TILE;
  if(map.grid[r.z-1]?.[r.cx]===1){
   m.rod([wx-.54,2.96,wz+.05],[wx+.54,2.96,wz+.05],.035,[.35,.32,.25],4,8);
   for(let j=0;j<6;j++){const a=wx-.43+j*.143,b=a+.143,aa=wz+.10+Math.sin(j*.9)*.025,bb=wz+.10+Math.sin((j+1)*.9)*.025,bottom=1.30+(j%2)*.08;m.quad([a,2.91,aa],[b,2.91,bb],[b,bottom,bb],[a,1.30+((j+1)%2)*.08,aa],[.29,.07,.055],6)}
   m.rod([wx,1.72,wz+.15],[wx,2.51,wz+.15],.025,[.46,.35,.17],7,5);m.rod([wx-.18,2.30,wz+.15],[wx+.18,2.30,wz+.15],.024,[.46,.35,.17],7,5);
  }
  // Shallow ceiling ribs leave the walkable volume untouched.
  const cx=(r.x+r.w/2)*TILE,cz=(r.z+r.h/2)*TILE;
  for(const zoff of[-r.h*TILE*.24,r.h*TILE*.24])arch(cx,cz+zoff,0,r.w*TILE/2-.20,3.08,.50,false);
  m.ring(cx,.012,cz,Math.min(r.w,r.h)*.54,[.24,.27,.27],2,0,Math.PI*2,.08);
  for(let k=0;k<8;k++){const a=k*Math.PI/4,rr=Math.min(r.w,r.h)*.54;m.rod([cx+Math.sin(a)*(rr-.18),.025,cz-Math.cos(a)*(rr-.18)],[cx+Math.sin(a)*(rr+.18),.025,cz-Math.cos(a)*(rr+.18)],.018,[.42,.35,.22],7,4)}
 }
 for(const t of map.torches){m.rod([t.x,t.y-.65,t.z],[t.x,t.y-.08,t.z],.065,[.23,.15,.08],3,8);m.rod([t.x,t.y-.15,t.z],[t.x,t.y,t.z],.13,[.23,.27,.28],4,10);for(let j=0;j<4;j++){let a=j*Math.PI/2;m.rod([t.x+Math.cos(a)*.1,t.y-.20,t.z+Math.sin(a)*.1],[t.x+Math.cos(a)*.18,t.y+.05,t.z+Math.sin(a)*.18],.023,[.34,.32,.27],4,5)}}
 m.meta={arches,wallReliefs:reliefs,materialTiles:8};return m;
}
window.CryptRender={Mesh,Renderer,buildDungeonMesh,IDENT};
})();
