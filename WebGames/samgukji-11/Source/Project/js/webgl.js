/* Small dependency-free WebGL2 renderer, authored for this prototype.
 * Instanced geometry, directional shadow maps, fog, water and flag shaders.
 * No CDN, fetch(), imported fonts, textures, models or external runtime code.
 */
(function(root){
'use strict';
const V={add:(a,b)=>a.map((n,i)=>n+b[i]),sub:(a,b)=>a.map((n,i)=>n-b[i]),dot:(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm:a=>{const l=Math.hypot(...a)||1;return a.map(n=>n/l);}};
const M={
 identity:()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),
 mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[r+4]*b[c*4+1]+a[r+8]*b[c*4+2]+a[r+12]*b[c*4+3];return o;},
 model(x,y,z,sx=1,sy=1,sz=1,yaw=0,pitch=0,roll=0){const cy=Math.cos(yaw),yy=Math.sin(yaw),cx=Math.cos(pitch),xx=Math.sin(pitch),cz=Math.cos(roll),zz=Math.sin(roll);return new Float32Array([(cy*cz+yy*xx*zz)*sx,cx*zz*sx,(-yy*cz+cy*xx*zz)*sx,0,(-cy*zz+yy*xx*cz)*sy,cx*cz*sy,(yy*zz+cy*xx*cz)*sy,0,yy*cx*sz,-xx*sz,cy*cx*sz,0,x,y,z,1]);},
 perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);},
 ortho(l,r,b,t,n,f){return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]);},
 lookAt(eye,target,up=[0,1,0]){const z=V.norm(V.sub(eye,target)),x=V.norm(V.cross(up,z)),y=V.cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-V.dot(x,eye),-V.dot(y,eye),-V.dot(z,eye),1]);},
 transform(m,v){return [0,1,2,3].map(r=>m[r]*v[0]+m[r+4]*v[1]+m[r+8]*v[2]+m[r+12]*(v[3]??1));},
 inverse(a){const b=Array.from({length:4},(_,r)=>[a[r],a[r+4],a[r+8],a[r+12],...Array.from({length:4},(_,c)=>+(c===r))]);for(let i=0;i<4;i++){let p=i;for(let j=i+1;j<4;j++)if(Math.abs(b[j][i])>Math.abs(b[p][i]))p=j;if(Math.abs(b[p][i])<1e-10)return M.identity();[b[p],b[i]]=[b[i],b[p]];const s=b[i][i];for(let k=0;k<8;k++)b[i][k]/=s;for(let j=0;j<4;j++)if(j!==i){const v=b[j][i];for(let k=0;k<8;k++)b[j][k]-=v*b[i][k];}}const out=new Float32Array(16);for(let r=0;r<4;r++)for(let c=0;c<4;c++)out[c*4+r]=b[r][c+4];return out;}
};
function color(c,alpha=1){if(Array.isArray(c))return c.length===4?c:[...c,alpha];if(typeof c==='number')return [(c>>16&255)/255,(c>>8&255)/255,(c&255)/255,alpha];c=String(c).replace('#','');return color(parseInt(c,16),alpha);}
class Geometry{
 constructor(){this.data=[];}
 vertex(p,n,c=[1,1,1]){this.data.push(...p,...n,...c.slice(0,3));}
 tri(a,b,c,tint=[1,1,1],normal=null){const n=normal||V.norm(V.cross(V.sub(b,a),V.sub(c,a)));this.vertex(a,n,tint);this.vertex(b,n,tint);this.vertex(c,n,tint);return this;}
 quad(a,b,c,d,tint=[1,1,1]){return this.tri(a,b,c,tint).tri(a,c,d,tint);}
 static cube(){const g=new Geometry(),p=[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]];for(const f of [[0,3,2,1],[5,6,7,4],[4,7,3,0],[1,2,6,5],[3,7,6,2],[4,0,1,5]])g.quad(...f.map(i=>p[i]));return g;}
 static cylinder(sides=8,topRadius=.5){const g=new Geometry();for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2,A=[Math.cos(a)*.5,-.5,Math.sin(a)*.5],B=[Math.cos(b)*.5,-.5,Math.sin(b)*.5],C=[Math.cos(b)*topRadius,.5,Math.sin(b)*topRadius],D=[Math.cos(a)*topRadius,.5,Math.sin(a)*topRadius];g.quad(A,D,C,B);g.tri([0,.5,0],C,D);g.tri([0,-.5,0],A,B);}return g;}
 static sphere(lat=6,lon=8){const g=new Geometry(),p=(i,j)=>[Math.sin(i/lat*Math.PI)*Math.cos(j/lon*Math.PI)*.5,Math.cos(i/lat*Math.PI)*.5,Math.sin(i/lat*Math.PI)*Math.sin(j/lon*Math.PI)*.5];for(let i=0;i<lat;i++)for(let j=0;j<lon;j++){const pts=[p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1)];for(const ix of [[0,1,2],[0,2,3]])for(const k of ix)g.vertex(pts[k],V.norm(pts[k]));}return g;}
 static roof(){const g=new Geometry(),p=[[-.6,0,-.56],[.6,0,-.56],[.6,0,.56],[-.6,0,.56],[-.32,.6,0],[.32,.6,0]];g.tri(p[0],p[4],p[3]);g.tri(p[1],p[2],p[5]);g.quad(p[0],p[1],p[5],p[4]);g.quad(p[3],p[4],p[5],p[2]);g.quad(p[3],p[2],p[1],p[0]);return g;}
 static ring(inner=.83,outer=1,segments=48){const g=new Geometry();for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;g.quad([Math.cos(a)*inner,0,Math.sin(a)*inner],[Math.cos(b)*inner,0,Math.sin(b)*inner],[Math.cos(b)*outer,0,Math.sin(b)*outer],[Math.cos(a)*outer,0,Math.sin(a)*outer]);}return g;}
 static flag(){const g=new Geometry();for(let i=0;i<8;i++){const x=i/8;g.quad([x,0,0],[x+1/8,0,0],[x+1/8,1,0],[x,1,0]);}return g;}
}
const VS=`#version 300 es
precision highp float;precision highp int;
layout(location=0) in vec3 aPosition;layout(location=1) in vec3 aNormal;layout(location=2) in vec3 aColor;
layout(location=4) in mat4 aModel;layout(location=8) in vec4 aTint;
uniform mat4 uVP;uniform mat4 uLightVP;uniform float uTime;uniform int uKind;
out vec3 vWorld;out vec3 vNormal;out vec4 vColor;out vec4 vShadow;
void main(){vec3 p=aPosition;if(uKind==2)p.z+=sin(p.x*6.0+uTime*3.4+aModel[3].x)*p.x*.11;
vec4 w=aModel*vec4(p,1.);vWorld=w.xyz;vNormal=normalize(mat3(aModel)*(aNormal/vec3(dot(aModel[0].xyz,aModel[0].xyz),dot(aModel[1].xyz,aModel[1].xyz),dot(aModel[2].xyz,aModel[2].xyz))));vColor=vec4(aColor*aTint.rgb,aTint.a);vShadow=uLightVP*w;gl_Position=uVP*w;}`;
const FS=`#version 300 es
precision highp float;precision highp int;
in vec3 vWorld;in vec3 vNormal;in vec4 vColor;in vec4 vShadow;
uniform vec3 uEye;uniform vec3 uFog;uniform vec3 uSun;uniform float uTime;uniform float uFogFar;uniform int uKind;uniform bool uShadows;uniform sampler2D uDepth;
out vec4 outColor;
float grain(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float shadow(vec3 n){if(!uShadows)return 1.;vec3 p=vShadow.xyz/vShadow.w*.5+.5;if(p.x<.0||p.x>1.||p.y<.0||p.y>1.||p.z>1.)return 1.;float b=max(.0004,.0018*(1.-dot(n,uSun))),s=0.;vec2 texel=1./vec2(textureSize(uDepth,0));for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){float d=texture(uDepth,p.xy+vec2(x,y)*texel).r;s+=p.z-b>d?.40:1.;}return s/9.;}
void main(){vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;vec3 base=vColor.rgb;float spec=0.;if(uKind==1){float w=sin(vWorld.x*2.1+uTime*1.1)*cos(vWorld.z*1.6-uTime*.8);n=normalize(vec3(.08*sin(vWorld.x*3.+uTime),1.,.1*cos(vWorld.z*2.6+uTime)));base=mix(vec3(.15,.31,.32),vec3(.30,.44,.43),w*.5+.5);spec=pow(max(0.,dot(normalize(uEye-vWorld),reflect(-uSun,n))),56.)*.5;}
if(uKind==5)base*=.92+grain(floor(vWorld.xz*34.))*.12+.03*sin(vWorld.x*2.7+sin(vWorld.z*3.));
float diffuse=max(dot(n,uSun),0.);vec3 hemi=mix(vec3(.31,.32,.25),vec3(.62,.67,.65),n.y*.5+.5);vec3 light=hemi+vec3(.63,.54,.40)*diffuse*shadow(n);vec3 col=base*light+spec;
if(uKind==3)col=base*1.25;
float f=smoothstep(uFogFar*.25,uFogFar,length(uEye-vWorld));col=mix(col,uFog,min(.94,f));col=pow(max(col,vec3(0.)),vec3(.87));outColor=vec4(col,vColor.a);}`;
const DEPTH_FS=`#version 300 es
precision highp float;precision highp int;void main(){}`;
class GLRenderer{
 constructor(canvas){this.buffers=new Set();this.vaos=new Set();const gl=this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});if(!gl)throw new Error('WebGL2를 사용할 수 없습니다.');this.canvas=canvas;this.program=this.programFrom(VS,FS);this.shadowProgram=this.programFrom(VS,DEPTH_FS);this.draws=0;this.triangles=0;this.size=1024;this.shadows=true;this.contextLost=false;this.createShadow();this.lostHandler=e=>{e.preventDefault();this.contextLost=true;};canvas.addEventListener('webglcontextlost',this.lostHandler);}
 compile(type,source){const g=this.gl,s=g.createShader(type);g.shaderSource(s,source);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw new Error(g.getShaderInfoLog(s));return s;}
 programFrom(v,f){const g=this.gl,p=g.createProgram(),vs=this.compile(g.VERTEX_SHADER,v),fs=this.compile(g.FRAGMENT_SHADER,f);g.attachShader(p,vs);g.attachShader(p,fs);g.linkProgram(p);g.deleteShader(vs);g.deleteShader(fs);if(!g.getProgramParameter(p,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(p));return p;}
 createShadow(){const g=this.gl;this.depth=g.createTexture();g.bindTexture(g.TEXTURE_2D,this.depth);g.texImage2D(g.TEXTURE_2D,0,g.DEPTH_COMPONENT24,this.size,this.size,0,g.DEPTH_COMPONENT,g.UNSIGNED_INT,null);for(const [k,v]of [[g.TEXTURE_MIN_FILTER,g.NEAREST],[g.TEXTURE_MAG_FILTER,g.NEAREST],[g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE],[g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE]])g.texParameteri(g.TEXTURE_2D,k,v);this.fbo=g.createFramebuffer();g.bindFramebuffer(g.FRAMEBUFFER,this.fbo);g.framebufferTexture2D(g.FRAMEBUFFER,g.DEPTH_ATTACHMENT,g.TEXTURE_2D,this.depth,0);g.drawBuffers([g.NONE]);g.readBuffer(g.NONE);this.shadows=g.checkFramebufferStatus(g.FRAMEBUFFER)===g.FRAMEBUFFER_COMPLETE;g.bindFramebuffer(g.FRAMEBUFFER,null);}
 geometry(geo){const g=this.gl,buffer=g.createBuffer();this.buffers.add(buffer);g.bindBuffer(g.ARRAY_BUFFER,buffer);g.bufferData(g.ARRAY_BUFFER,new Float32Array(geo.data),g.STATIC_DRAW);return {buffer,count:geo.data.length/9};}
 batch(mesh,kind=0,casts=true){const g=this.gl,vao=g.createVertexArray(),instances=g.createBuffer();this.buffers.add(instances);this.vaos.add(vao);g.bindVertexArray(vao);g.bindBuffer(g.ARRAY_BUFFER,mesh.buffer);for(let i=0;i<3;i++){g.enableVertexAttribArray(i);g.vertexAttribPointer(i,3,g.FLOAT,false,36,i*12);}g.bindBuffer(g.ARRAY_BUFFER,instances);for(let i=0;i<4;i++){g.enableVertexAttribArray(4+i);g.vertexAttribPointer(4+i,4,g.FLOAT,false,80,i*16);g.vertexAttribDivisor(4+i,1);}g.enableVertexAttribArray(8);g.vertexAttribPointer(8,4,g.FLOAT,false,80,64);g.vertexAttribDivisor(8,1);g.bindVertexArray(null);return {mesh,vao,instances,kind,casts,count:0};}
 upload(batch,values,dynamic=false){const g=this.gl;g.bindBuffer(g.ARRAY_BUFFER,batch.instances);g.bufferData(g.ARRAY_BUFFER,values instanceof Float32Array?values:new Float32Array(values),dynamic?g.DYNAMIC_DRAW:g.STATIC_DRAW);batch.count=values.length/20;}
 uniform(p,n,type,...v){const g=this.gl,loc=g.getUniformLocation(p,n);if(loc!==null)g[type](loc,...v);}
 drawBatch(b,p){if(!b.count)return;const g=this.gl;this.uniform(p,'uKind','uniform1i',b.kind);g.bindVertexArray(b.vao);g.drawArraysInstanced(g.TRIANGLES,0,b.mesh.count,b.count);this.draws++;this.triangles+=b.mesh.count/3*b.count;}
 render(batches,{vp,lightVP,eye,sun,fog,time,fogFar,shadows=true}){const g=this.gl;if(this.contextLost)return;this.draws=0;this.triangles=0;g.enable(g.DEPTH_TEST);g.depthFunc(g.LEQUAL);g.disable(g.CULL_FACE);g.disable(g.BLEND);const hasShadow=this.shadows&&shadows;
 if(hasShadow){g.bindFramebuffer(g.FRAMEBUFFER,this.fbo);g.viewport(0,0,this.size,this.size);g.clear(g.DEPTH_BUFFER_BIT);const p=this.shadowProgram;g.useProgram(p);this.uniform(p,'uVP','uniformMatrix4fv',false,lightVP);this.uniform(p,'uTime','uniform1f',time);g.enable(g.POLYGON_OFFSET_FILL);g.polygonOffset(1.8,3.);for(const b of batches)if(b.casts)this.drawBatch(b,p);g.disable(g.POLYGON_OFFSET_FILL);}
 g.bindFramebuffer(g.FRAMEBUFFER,null);g.viewport(0,0,this.canvas.width,this.canvas.height);g.clearColor(...fog,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);const p=this.program;g.useProgram(p);this.uniform(p,'uVP','uniformMatrix4fv',false,vp);this.uniform(p,'uLightVP','uniformMatrix4fv',false,lightVP);this.uniform(p,'uEye','uniform3fv',eye);this.uniform(p,'uSun','uniform3fv',sun);this.uniform(p,'uFog','uniform3fv',fog);this.uniform(p,'uTime','uniform1f',time);this.uniform(p,'uFogFar','uniform1f',fogFar);this.uniform(p,'uShadows','uniform1i',+hasShadow);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.depth);this.uniform(p,'uDepth','uniform1i',0);
 for(const b of batches){if(b.transparent){g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);g.depthMask(false);}else{g.disable(g.BLEND);g.depthMask(true);}this.drawBatch(b,p);}g.depthMask(true);g.bindVertexArray(null);}
 disposeBatch(b){const g=this.gl;g.deleteBuffer(b.instances);g.deleteVertexArray(b.vao);this.buffers.delete(b.instances);this.vaos.delete(b.vao);}
 dispose(){if(this.disposed)return;this.disposed=true;this.canvas?.removeEventListener('webglcontextlost',this.lostHandler);const g=this.gl;if(!g)return;for(const b of this.buffers)g.deleteBuffer(b);for(const v of this.vaos)g.deleteVertexArray(v);this.buffers.clear();this.vaos.clear();g.deleteTexture(this.depth);g.deleteFramebuffer(this.fbo);g.deleteProgram(this.program);g.deleteProgram(this.shadowProgram);g.getExtension('WEBGL_lose_context')?.loseContext();}
}
root.RTKGL={V,M,color,Geometry,GLRenderer};
})(window);
