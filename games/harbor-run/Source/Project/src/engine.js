/* HarborGL — purpose-built WebGL2 renderer, no external dependencies. */
'use strict';
const HM = (() => {
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const lerp=(a,b,t)=>a+(b-a)*t;
 const damp=(a,b,k,dt)=>lerp(a,b,1-Math.exp(-k*dt));
 const angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
 const len=v=>Math.hypot(...v);
 const add=(a,b)=>a.map((x,i)=>x+b[i]);
 const sub=(a,b)=>a.map((x,i)=>x-b[i]);
 const mul=(v,s)=>v.map(x=>x*s);
 const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
 const norm=v=>mul(v,1/(len(v)||1));
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
 function mm(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
 function compose(p=[0,0,0],r=[0,0,0],s=[1,1,1]){
  const [x,y,z]=r, cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
  return new Float32Array([(cy*cz+sy*sx*sz)*s[0],cx*sz*s[0],(-sy*cz+cy*sx*sz)*s[0],0,(-cy*sz+sy*sx*cz)*s[1],cx*cz*s[1],(sy*sz+cy*sx*cz)*s[1],0,sy*cx*s[2],-sx*s[2],cy*cx*s[2],0,p[0],p[1],p[2],1]);
 }
 function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
 function ortho(l,r,b,t,n,f){return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]);}
 function lookAt(eye,target,up=[0,1,0]){const z=norm(sub(eye,target)),x=norm(cross(up,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
 function transform(m,p){const [x,y,z]=p;return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14],m[3]*x+m[7]*y+m[11]*z+m[15]];}
 const color=hex=>typeof hex==='number'?[(hex>>16&255)/255,(hex>>8&255)/255,(hex&255)/255]:hex;
 return {clamp,lerp,damp,angle,len,add,sub,mul,dot,norm,cross,identity,mm,compose,perspective,ortho,lookAt,transform,color};
})();
class HarborGL {
 constructor(canvas){
  const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
  if(!gl)throw new Error('WebGL2를 사용할 수 없습니다. Chrome/Edge의 하드웨어 가속을 켜고 다시 실행하세요.');
  this.gl=gl;this.canvas=canvas;this.quality='medium';this.ratio=1;this.frames=0;this.drawCalls=0;this.time=0;this.night=false;
  const vs=`#version 300 es
  precision highp float;
  layout(location=0)in vec3 aPos;layout(location=1)in vec3 aNormal;
  layout(location=2)in mat4 aModel;layout(location=6)in vec3 aColor;
  uniform mat4 uVP;uniform mat4 uLight;
  out vec3 vPos;out vec3 vNormal;out vec3 vColor;out vec4 vShadow;
  void main(){vec4 p=aModel*vec4(aPos,1.);vPos=p.xyz;vNormal=normalize(mat3(aModel)*aNormal);vColor=aColor;vShadow=uLight*p;gl_Position=uVP*p;}`;
  const fs=`#version 300 es
  precision highp float;
  in vec3 vPos;in vec3 vNormal;in vec3 vColor;in vec4 vShadow;
  uniform vec3 uEye;uniform highp sampler2DShadow uDepth;uniform vec3 uSun;uniform float uTime;uniform float uNight;uniform float uShadows;
  out vec4 frag;
  void main(){vec3 n=normalize(vNormal);float diffuse=max(dot(n,uSun),0.);float sh=1.;vec3 p=vShadow.xyz/vShadow.w*.5+.5;
   if(uShadows>0.5&&p.x>0.&&p.x<1.&&p.y>0.&&p.y<1.&&p.z<1.){sh=0.;float bias=max(.0018*(1.-diffuse),.0011);vec2 texel=1./vec2(textureSize(uDepth,0));for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)sh+=texture(uDepth,vec3(p.xy+vec2(x,y)*texel,p.z-bias));sh/=9.;}
   float hemi=.5+.5*n.y;vec3 ambient=mix(vec3(.27,.31,.35),vec3(.61,.68,.73),hemi);vec3 day=vColor*(ambient+vec3(.61,.52,.39)*diffuse*(.35+.65*sh));
   vec3 night=vColor*(vec3(.17,.23,.34)+vec3(.26,.32,.43)*diffuse*(.4+.6*sh));vec3 lit=mix(day,night,uNight);
   if(vPos.y<-.8&&vColor.b>vColor.r*1.5){float w=sin(vPos.x*.55+uTime)*sin(vPos.z*.32+uTime*.7);lit+=max(w-.7,0.)*.14;}
   float fog=1.-exp(-pow(distance(vPos,uEye)/300.,2.));vec3 haze=mix(vec3(.70,.82,.84),vec3(.09,.14,.22),uNight);lit=mix(lit,haze,clamp(fog,0.,.95));
   frag=vec4(pow(max(lit,vec3(0.)),vec3(.91)),1.);
  }`;
  this.program=this.programFrom(vs,fs);
  this.shadowProgram=this.programFrom(`#version 300 es\nlayout(location=0)in vec3 aPos;layout(location=2)in mat4 aModel;uniform mat4 uVP;void main(){gl_Position=uVP*aModel*vec4(aPos,1.);}`,`#version 300 es\nprecision highp float;void main(){}`);
  this.skyProgram=this.programFrom(`#version 300 es\nout vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,1.,1.);}`,`#version 300 es\nprecision highp float;in vec2 uv;uniform float uNight;out vec4 frag;void main(){vec3 a=mix(vec3(.75,.86,.87),vec3(.12,.18,.28),uNight),b=mix(vec3(.26,.55,.71),vec3(.025,.055,.12),uNight);frag=vec4(mix(a,b,pow(clamp(uv.y,0.,1.),.7)),1.);}`);
  this.meshes={};this.static={};this.dynamic={};
  for(const [name,verts]of Object.entries(this.geometry())){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(verts),gl.STATIC_DRAW);this.meshes[name]={buffer:b,count:verts.length/6};this.static[name]=[];this.dynamic[name]=[];}
  this.staticBatches=[];this.dynamicBatches={};this.shadowSize=1024;this.initShadow();
  gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.clearColor(.5,.7,.8,1);
 }
 programFrom(vs,fs){const g=this.gl;const compile=(t,s)=>{const sh=g.createShader(t);g.shaderSource(sh,s);g.compileShader(sh);if(!g.getShaderParameter(sh,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(sh));return sh;};const p=g.createProgram(),v=compile(g.VERTEX_SHADER,vs),f=compile(g.FRAGMENT_SHADER,fs);g.attachShader(p,v);g.attachShader(p,f);g.linkProgram(p);g.deleteShader(v);g.deleteShader(f);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));return p;}
 geometry(){const box=[],cyl=[],cone=[],sphere=[];
  function tri(arr,a,b,c,n){if(!n)n=HM.norm(HM.cross(HM.sub(b,a),HM.sub(c,a)));for(const p of[a,b,c])arr.push(...p,...n);}
  const faces=[[[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]], [[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]], [[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]], [[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]], [[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]], [[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]]];
  for(const f of faces){tri(box,f[0],f[1],f[2]);tri(box,f[0],f[2],f[3]);}
  for(let i=0;i<12;i++){let a=i*Math.PI/6,b=(i+1)*Math.PI/6;let a0=[Math.cos(a)*.5,-.5,Math.sin(a)*.5],a1=[a0[0],.5,a0[2]],b0=[Math.cos(b)*.5,-.5,Math.sin(b)*.5],b1=[b0[0],.5,b0[2]];tri(cyl,a0,a1,b1);tri(cyl,a0,b1,b0);tri(cyl,[0,.5,0],b1,a1);tri(cyl,[0,-.5,0],a0,b0);tri(cone,a0,[0,.5,0],b0);tri(cone,[0,-.5,0],a0,b0);}
  const verts=[[0,.5,0],[.5,0,0],[0,0,.5],[-.5,0,0],[0,0,-.5],[0,-.5,0]];
  for(let i=1;i<=4;i++){let j=i%4+1;tri(sphere,verts[0],verts[j],verts[i]);tri(sphere,verts[5],verts[i],verts[j]);}
  return{box,cylinder:cyl,cone,sphere};
 }
 initShadow(){const g=this.gl;this.depth=g.createTexture();g.bindTexture(g.TEXTURE_2D,this.depth);g.texImage2D(g.TEXTURE_2D,0,g.DEPTH_COMPONENT24,this.shadowSize,this.shadowSize,0,g.DEPTH_COMPONENT,g.UNSIGNED_INT,null);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_COMPARE_MODE,g.COMPARE_REF_TO_TEXTURE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_COMPARE_FUNC,g.LEQUAL);this.fbo=g.createFramebuffer();g.bindFramebuffer(g.FRAMEBUFFER,this.fbo);g.framebufferTexture2D(g.FRAMEBUFFER,g.DEPTH_ATTACHMENT,g.TEXTURE_2D,this.depth,0);g.drawBuffers([g.NONE]);g.readBuffer(g.NONE);if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('Shadow framebuffer incomplete');g.bindFramebuffer(g.FRAMEBUFFER,null);}
 add(kind,p,s,c,r=[0,0,0],parent=null,stat=false){let m=HM.compose(p,r,s);if(parent)m=HM.mm(parent,m);(stat?this.static:this.dynamic)[kind].push(...m,...HM.color(c));}
 box(p,s,c,r=[0,0,0],parent=null,stat=false){this.add('box',p,s,c,r,parent,stat);}
 cylinder(p,s,c,r=[0,0,0],parent=null,stat=false){this.add('cylinder',p,s,c,r,parent,stat);}
 cone(p,s,c,r=[0,0,0],parent=null,stat=false){this.add('cone',p,s,c,r,parent,stat);}
 sphere(p,s,c,r=[0,0,0],parent=null,stat=false){this.add('sphere',p,s,c,r,parent,stat);}
 batch(name,data,existing=null){const g=this.gl,m=this.meshes[name],b=existing||{vao:g.createVertexArray(),buffer:g.createBuffer(),count:0,verts:m.count};g.bindVertexArray(b.vao);g.bindBuffer(g.ARRAY_BUFFER,m.buffer);g.enableVertexAttribArray(0);g.vertexAttribPointer(0,3,g.FLOAT,false,24,0);g.enableVertexAttribArray(1);g.vertexAttribPointer(1,3,g.FLOAT,false,24,12);g.bindBuffer(g.ARRAY_BUFFER,b.buffer);g.bufferData(g.ARRAY_BUFFER,new Float32Array(data),existing?g.DYNAMIC_DRAW:g.STATIC_DRAW);for(let i=0;i<4;i++){g.enableVertexAttribArray(2+i);g.vertexAttribPointer(2+i,4,g.FLOAT,false,76,i*16);g.vertexAttribDivisor(2+i,1);}g.enableVertexAttribArray(6);g.vertexAttribPointer(6,3,g.FLOAT,false,76,64);g.vertexAttribDivisor(6,1);b.count=data.length/19;g.bindVertexArray(null);return b;}
 seal(){for(const name of Object.keys(this.meshes)){this.staticBatches.push(this.batch(name,this.static[name]));this.dynamicBatches[name]=this.batch(name,[]);}}
 begin(){for(const a of Object.values(this.dynamic))a.length=0;}
 resize(){const dpr=Math.min(devicePixelRatio||1,this.quality==='high'?1.7:this.quality==='low'?1:1.3);const w=Math.round(innerWidth*dpr),h=Math.round(innerHeight*dpr);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.ratio=w/h;}
 render(cam,focus,time){const g=this.gl;this.resize();this.time=time;this.drawCalls=0;for(const[k,a]of Object.entries(this.dynamic))this.batch(k,a,this.dynamicBatches[k]);const batches=[...this.staticBatches,...Object.values(this.dynamicBatches)];
  const sun=HM.norm([-.48,.82,.32]);const center=[Math.round(focus[0]*2)/2,0,Math.round(focus[2]*2)/2];this.light=HM.mm(HM.ortho(-72,72,-72,72,1,220),HM.lookAt(HM.add(center,HM.mul(sun,100)),center));
  const draw=()=>{for(const b of batches)if(b.count){g.bindVertexArray(b.vao);g.drawArraysInstanced(g.TRIANGLES,0,b.verts,b.count);this.drawCalls++;}g.bindVertexArray(null);};
  if(this.quality!=='low'){g.bindFramebuffer(g.FRAMEBUFFER,this.fbo);g.viewport(0,0,this.shadowSize,this.shadowSize);g.clear(g.DEPTH_BUFFER_BIT);g.useProgram(this.shadowProgram);g.uniformMatrix4fv(g.getUniformLocation(this.shadowProgram,'uVP'),false,this.light);g.enable(g.POLYGON_OFFSET_FILL);g.polygonOffset(1,2);draw();g.disable(g.POLYGON_OFFSET_FILL);}
  g.bindFramebuffer(g.FRAMEBUFFER,null);g.viewport(0,0,this.canvas.width,this.canvas.height);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.disable(g.DEPTH_TEST);g.disable(g.CULL_FACE);g.useProgram(this.skyProgram);g.uniform1f(g.getUniformLocation(this.skyProgram,'uNight'),this.night?1:0);g.drawArrays(g.TRIANGLES,0,3);g.enable(g.DEPTH_TEST);g.enable(g.CULL_FACE);
  this.vp=HM.mm(HM.perspective(cam.fov*Math.PI/180,this.ratio,.12,650),HM.lookAt(cam.pos,cam.target));g.useProgram(this.program);const u=n=>g.getUniformLocation(this.program,n);g.uniformMatrix4fv(u('uVP'),false,this.vp);g.uniformMatrix4fv(u('uLight'),false,this.light);g.uniform3fv(u('uEye'),cam.pos);g.uniform3fv(u('uSun'),sun);g.uniform1f(u('uTime'),time);g.uniform1f(u('uNight'),this.night?1:0);g.uniform1f(u('uShadows'),this.quality==='low'?0:1);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.depth);g.uniform1i(u('uDepth'),0);draw();this.frames++;
 }
 project(p){if(!this.vp)return null;const a=HM.transform(this.vp,p);if(a[3]<=.1)return null;const x=a[0]/a[3],y=a[1]/a[3];return{x:(x*.5+.5)*innerWidth,y:(-.5*y+.5)*innerHeight,visible:Math.abs(x)<1.2&&Math.abs(y)<1.2,depth:a[3]};}
}
window.HM=HM;window.HarborGL=HarborGL;
