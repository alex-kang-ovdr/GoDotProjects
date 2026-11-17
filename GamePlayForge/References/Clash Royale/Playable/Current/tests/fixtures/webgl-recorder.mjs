// A bounded WebGL command recorder, not a GPU or browser implementation.
// It verifies render submission/resource handling and exposes uploaded geometry.
export function createGLRecorder(canvas, options = {}) {
  const calls=[],buffers=new Map(),shaders=new Map(),programs=new Map(),uniforms=new Map();
  const bindings=new Map(),attributes=new Map();
  let serial=0,currentProgram=null,lost=false;
  const gl={
    VERTEX_SHADER:0x8b31,FRAGMENT_SHADER:0x8b30,COMPILE_STATUS:0x8b81,LINK_STATUS:0x8b82,
    ARRAY_BUFFER:0x8892,ELEMENT_ARRAY_BUFFER:0x8893,STATIC_DRAW:0x88e4,DYNAMIC_DRAW:0x88e8,STREAM_DRAW:0x88e0,
    FLOAT:0x1406,UNSIGNED_SHORT:0x1403,UNSIGNED_INT:0x1405,UNSIGNED_BYTE:0x1401,
    TRIANGLES:4,LINES:1,LINE_STRIP:3,POINTS:0,
    COLOR_BUFFER_BIT:0x4000,DEPTH_BUFFER_BIT:0x0100,DEPTH_TEST:0x0b71,BLEND:0x0be2,CULL_FACE:0x0b44,
    SRC_ALPHA:0x0302,ONE_MINUS_SRC_ALPHA:0x0303,ONE:1,ZERO:0,LEQUAL:0x0203,LESS:0x0201,BACK:0x0405,CCW:0x0901,
    POLYGON_OFFSET_FILL:0x8037,SCISSOR_TEST:0x0c11,NO_ERROR:0,
    MAX_TEXTURE_SIZE:0x0d33,MAX_VERTEX_ATTRIBS:0x8869,VERSION:0x1f02,CURRENT_PROGRAM:0x8b8d,
    canvas,calls,buffers,shaders,programs,uniforms,attributes,
    get drawingBufferWidth(){return canvas.width;},get drawingBufferHeight(){return canvas.height;},
    createShader(type){const shader={kind:'shader',id:++serial,type};shaders.set(shader,{type,source:'',deleted:false});calls.push({name:'createShader',args:[type]});return shader;},
    shaderSource(shader,source){shaders.get(shader).source=source;calls.push({name:'shaderSource',args:[shader,source]});},
    compileShader(shader){calls.push({name:'compileShader',args:[shader]});},
    getShaderParameter(shader,param){return param===gl.COMPILE_STATUS?options.compile!==false:true;},
    getShaderInfoLog(){return options.compile===false?'test shader compilation failed':'';},
    deleteShader(shader){if(shaders.has(shader))shaders.get(shader).deleted=true;calls.push({name:'deleteShader',args:[shader]});},
    createProgram(){const program={kind:'program',id:++serial};programs.set(program,{shaders:[],deleted:false,attributes:new Map()});return program;},
    attachShader(program,shader){programs.get(program).shaders.push(shader);},
    linkProgram(program){calls.push({name:'linkProgram',args:[program]});},
    getProgramParameter(program,param){return param===gl.LINK_STATUS?options.link!==false:true;},
    getProgramInfoLog(){return options.link===false?'test program link failed':'';},
    useProgram(program){currentProgram=program;calls.push({name:'useProgram',args:[program]});},
    deleteProgram(program){if(programs.has(program))programs.get(program).deleted=true;calls.push({name:'deleteProgram',args:[program]});},
    getAttribLocation(program,name){const attrs=programs.get(program).attributes;if(!attrs.has(name))attrs.set(name,attrs.size);return attrs.get(name);},
    getUniformLocation(program,name){return {program,name};},
    createBuffer(){const buffer={kind:'buffer',id:++serial};buffers.set(buffer,{data:null,deleted:false});return buffer;},
    bindBuffer(target,buffer){bindings.set(target,buffer);calls.push({name:'bindBuffer',args:[target,buffer]});},
    bufferData(target,data,usage){const buffer=bindings.get(target);if(!buffer)throw new Error('bufferData without a bound buffer');
      buffers.get(buffer).data=typeof data==='number'?new Uint8Array(data):data.slice();
      calls.push({name:'bufferData',args:[target,typeof data==='number'?data:data.length,usage],buffer});},
    bufferSubData(target,offset,data){const buffer=bindings.get(target);const entry=buffers.get(buffer);if(!entry?.data)throw new Error('bufferSubData without storage');
      new Uint8Array(entry.data.buffer).set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength),offset);
      calls.push({name:'bufferSubData',args:[target,offset,data.length],buffer});},
    deleteBuffer(buffer){if(buffers.has(buffer))buffers.get(buffer).deleted=true;calls.push({name:'deleteBuffer',args:[buffer]});},
    vertexAttribPointer(index,size,type,normalized,stride,offset){attributes.set(index,{index,size,type,normalized,stride,offset,buffer:bindings.get(gl.ARRAY_BUFFER)});calls.push({name:'vertexAttribPointer',args:[index,size,type,normalized,stride,offset]});},
    getParameter(param){if(param===gl.MAX_TEXTURE_SIZE)return 4096;if(param===gl.MAX_VERTEX_ATTRIBS)return 16;if(param===gl.VERSION)return 'WebGL 1.0 test recorder';if(param===gl.CURRENT_PROGRAM)return currentProgram;return null;},
    getContextAttributes(){return {alpha:true,depth:true,antialias:true};},
    getExtension(name){calls.push({name:'getExtension',args:[name]});return null;},
    isContextLost(){return lost;},getError(){return gl.NO_ERROR;},
    setLost(value){lost=Boolean(value);if(lost){
      // Real WebGL invalidates every allocation when its context is lost.
      for(const resource of [...buffers.values(),...shaders.values(),...programs.values()])resource.invalidated=true;
      bindings.clear();attributes.clear();uniforms.clear();currentProgram=null;
    }},
  };
  for(const name of ['uniformMatrix4fv','uniformMatrix3fv','uniform1f','uniform2f','uniform3f','uniform4f','uniform1i','uniform2fv','uniform3fv','uniform4fv']) {
    gl[name]=(location,...args)=>{const values=args.map(value=>ArrayBuffer.isView(value)?Array.from(value):value);uniforms.set(location.name,{name,values,program:location.program});calls.push({name,args:[location.name,...values]});};
  }
  for(const name of ['viewport','clearColor','clearDepth','clear','enable','disable','depthFunc','depthMask','blendFunc','blendFuncSeparate','blendEquation','cullFace','frontFace','polygonOffset','scissor','enableVertexAttribArray','disableVertexAttribArray','lineWidth','colorMask','flush','finish']) {
    gl[name]=(...args)=>calls.push({name,args});
  }
  for(const name of ['drawArrays','drawElements']) {
    gl[name]=(...args)=>{
      if(!currentProgram)throw new Error(`${name} without a program`);
      calls.push({name,args,program:currentProgram,attributes:new Map(attributes),uniforms:new Map(uniforms)});
    };
  }
  return gl;
}

function create2DRecorder() {
  const calls=[],values={globalAlpha:1,font:'10px sans-serif'},stack=[];
  const ctx=new Proxy(values,{
    get(target,key){
      if(key in target)return target[key];
      if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>({addColorStop(){}});
      if(key==='measureText')return text=>({width:String(text).length*7});
      if(key==='save')return ()=>stack.push({...values});
      if(key==='restore')return ()=>{const prior=stack.pop();if(prior){for(const key of Object.keys(values))delete values[key];Object.assign(values,prior);}};
      return (...args)=>calls.push({name:key,args,fill:values.fillStyle,stroke:values.strokeStyle,font:values.font});
    },set(target,key,value){target[key]=value;return true;}
  });
  return {ctx,calls};
}

export function withRendererEnvironment(run, options={}) {
  const prior=new Map(['document','window','ResizeObserver'].map(key=>[key,globalThis[key]]));
  const rect={left:37,top:53,width:640,height:480};
  const observers=[];
  function makeCanvas(webgl=false) {
    const recorder=create2DRecorder(),listeners=new Map();
    let context2DAttributes=null,contextGLAttributes=null;
    recorder.ctx.getContextAttributes=()=>context2DAttributes?{...context2DAttributes}:null;
    const canvas={width:1,height:1,style:{},listeners,contextRequests:[],calls:recorder.calls,
      get clientWidth(){return rect.width;},get clientHeight(){return rect.height;},
      getBoundingClientRect:()=>({...rect,right:rect.left+rect.width,bottom:rect.top+rect.height}),
      getContext(type,settings){canvas.contextRequests.push({type,settings});
        if(type==='2d'){
          if(webgl)return null;
          context2DAttributes??={alpha:settings?.alpha!==false};
          return recorder.ctx;
        }
        if(type==='webgl'||type==='experimental-webgl'){
          if(!webgl||options.supported===false)return null;
          contextGLAttributes??={alpha:settings?.alpha!==false,depth:settings?.depth!==false,antialias:Boolean(settings?.antialias)};
          return canvas.gl;
        }
        return null;},
      addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
      removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
      dispatch(type){let prevented=false;for(const fn of listeners.get(type)||[])fn({type,preventDefault(){prevented=true;}});return prevented;}
    };
    if(webgl){canvas.gl=createGLRecorder(canvas,options);canvas.gl.getContextAttributes=()=>contextGLAttributes?{...contextGLAttributes}:null;}
    return canvas;
  }
  globalThis.document={createElement:()=>makeCanvas()};
  globalThis.window={devicePixelRatio:2,addEventListener(){},removeEventListener(){}};
  globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;this.disconnected=false;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
  const hud=makeCanvas(),surface=makeCanvas(true);
  const cleanup=[];
  try{return run({hud,surface,gl:surface.gl,rect,observers,cleanup,makeCanvas});}
  finally{for(const fn of cleanup.reverse())fn();for(const[key,value]of prior){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
}
