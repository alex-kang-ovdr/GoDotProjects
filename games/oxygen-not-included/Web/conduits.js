// Installed ConduitFlow updates once per second. Its direction bits cycle down,
// left, right, up. The route graph is independent of the element in a packet.
const DELTAS = [[0,1],[-1,0],[1,0],[0,-1]];
const EPS = 1e-9;

function neighbors(index,width,allowed) {
  const x=index%width, y=Math.floor(index/width), result=[];
  for(const [dx,dy] of DELTAS){
    const nx=x+dx, next=(y+dy)*width+nx;
    if(nx>=0 && nx<width && allowed.has(next))result.push(next);
  }
  return result;
}
// Orient corridors from all producers together. Continue beyond a consumer
// only after the direct branches have been assigned. Unconnected ends act as
// secondary sources so an isolated leftover packet can drain to a consumer.
function orient(links,roots,terminals,ends){
  const directions=new Map(),seen=new Set(roots);
  let queue=[...roots],deferred=[];
  while(queue.length){
    for(let i=0;i<queue.length;i++){
      const a=queue[i];
      for(const edge of links.get(a)||[]){
        if(directions.has(edge))continue;
        const b=edge.a===a?edge.b:edge.a;
        if(ends.has(b)&&!roots.has(b)&&!terminals.has(b)){
          directions.set(edge,b);
          continue;
        }
        directions.set(edge,a);
        if(!seen.has(b)){
          seen.add(b);
          (terminals.has(b)?deferred:queue).push(b);
        }
      }
    }
    queue=deferred;deferred=[];
  }
  return directions;
}

export function buildConduitGraph(width,indices,outputs,inputs) {
  const cells=new Set(indices), sources=new Set(outputs.filter(i=>cells.has(i))), sinks=new Set(inputs.filter(i=>cells.has(i)));
  const adjacent=new Map(), vertices=new Set(), links=new Map();
  for(const i of cells){
    const list=neighbors(i,width,cells);adjacent.set(i,list);
    if(list.length!==2||sources.has(i)||sinks.has(i)){vertices.add(i);links.set(i,[]);}
  }
  // A bend or a long corridor is a single connection between two junctions.
  const edges=[],used=new Set();
  const key=(a,b)=>a<b?a+','+b:b+','+a;
  for(const a of vertices)for(const first of adjacent.get(a)){
    if(used.has(key(a,first)))continue;
    const path=[a,first];used.add(key(a,first));
    let prev=a,b=first;
    while(!vertices.has(b)){
      const next=adjacent.get(b).find(i=>i!==prev);
      used.add(key(b,next));path.push(next);prev=b;b=next;
    }

    const edge={a,b,path};edges.push(edge);links.get(a).push(edge);links.get(b).push(edge);
  }
  const upstream=new Map(),downstream=new Map();
  const ends=new Set([...vertices].filter(i=>adjacent.get(i).length===1));
  const forward=orient(links,sources,sinks,ends), reverse=orient(links,sinks,sources,new Set());
  const other=(e,v)=>e.a===v?e.b:e.a;
  for(const [e,v] of reverse)if(!forward.has(e))forward.set(e,other(e,v));
  // A front from two producers may meet before a branch reaches its outlet.
  // Resolve that junction using the reverse traversal from actual inputs.
  for(let pass=0;pass<vertices.size;pass++){
    let changed=false;
    for(const v of vertices){
      if(sinks.has(v)||links.get(v).some(e=>forward.get(e)===v))continue;
      const towards=links.get(v).find(e=>reverse.has(e)&&reverse.get(e)!==v&&forward.get(e)!==v);
      if(towards){forward.set(towards,v);changed=true;}
    }
    if(!changed)break;
  }
  for(const e of edges){
    if(!forward.has(e))continue;
    const path=forward.get(e)===e.a?e.path:[...e.path].reverse();
    for(let j=1;j<path.length;j++){
      const a=path[j-1],b=path[j];
      if(!downstream.has(a))downstream.set(a,[]);
      if(!upstream.has(b))upstream.set(b,[]);
      downstream.get(a).push(b);upstream.get(b).push(a);
    }
  }
  for(const [i,list] of [...upstream,...downstream])list.sort((a,b)=>adjacent.get(i).indexOf(a)-adjacent.get(i).indexOf(b));
  const order=[],seen=new Set();
  for(const i of cells){
    if(seen.has(i))continue;
    const stack=[[i,false]];
    while(stack.length){
      const [j,post]=stack.pop();
      if(post){order.push(j);continue;}
      if(seen.has(j))continue;
      seen.add(j);stack.push([j,true]);
      for(const k of downstream.get(j)||[])if(!seen.has(k))stack.push([k,false]);
    }
  }
  return {upstream,downstream,order};
}

function rotated(list,previous){
  if(list.length<2)return list;
  const start=(list.indexOf(previous)+1)%list.length;
  return start?[...list.slice(start),...list.slice(0,start)]:list;
}

// The adapter reads/writes actual pipe contents. Per-junction source and target
// cursors live on the pipe cell so a save made between packets resumes fairly.
export function advanceConduits(graph,io,bridges=[]) {
  const packets=new Map();
  for(const i of graph.order){
    const parcel=io.read(i);
    if(parcel&&parcel.mass>EPS)packets.set(i,{...parcel});
  }
  // White bridge ports take packets before their overflow line. Green bridge
  // ports yield to packets already in the destination line.
  const exits=new Map(),entries=new Map();
  for(const {from,to} of bridges){
    exits.set(from,to);
    if(!entries.has(to))entries.set(to,[]);
    entries.get(to).push(from);
  }
  const received=new Set();
  const accepts=(src,dst)=>{
    if(received.has(dst))return false;
    const p=packets.get(src),d=io.read(dst);
    return p&&p.mass>EPS&&(!d||d.element===p.element)&&(!d||d.mass<io.capacity-EPS);
  };
  for(;;){
    received.clear();
    let moved=false;
    for(const dst of graph.order){
      if(received.has(dst))continue;
      const normal=graph.upstream.get(dst)||[], low=entries.get(dst)||[];
      const incoming=low.length?[...rotated(normal,io.lastIn(dst)),...rotated(low,io.lastIn(dst))]:rotated(normal,io.lastIn(dst));
      for(const src of incoming){
        if(!accepts(src,dst))continue;
        const ordinary=rotated(graph.downstream.get(src)||[],io.lastOut(src));
        const possible=exits.has(src)?[exits.get(src),...ordinary]:ordinary;
        if(possible.find(i=>accepts(src,i))!==dst)continue;
        const p=packets.get(src),d=io.read(dst);
        const mass=Math.min(p.mass,io.capacity-(d?.mass||0));
        if(mass<=EPS)continue;
        io.transfer(src,dst,p,mass);
        io.remember(src,dst);
        if(exits.get(src)===dst)io.onBridge?.(src,mass);
        p.mass-=mass;received.add(dst);moved=true;break;
      }
    }
    if(!moved)break;
  }
}

export function pipeDue(time,dt,offset){
  return Math.floor(time+offset+1e-7)>Math.floor(time-dt+offset+1e-7);
}

export function cellConduitAdapter(cells,layer) {
  const gas=layer==='gas', prefix=gas?'gas':'liquid', capacity=gas?1:10;
  const read=i=>{
    const c=cells[i];
    if(gas)return c.gasPacket;
    const element=c.dirtyWater>0?'dirtyWater':'cleanWater',mass=c[element];
    return mass>0?{element,mass,temp:c.liquidPacketTemp??c.temp}:null;
  };
  return {capacity,read,lastIn:i=>cells[i][prefix+'LastIn'],lastOut:i=>cells[i][prefix+'LastOut'],
    remember(a,b){cells[a][prefix+'LastOut']=b;cells[b][prefix+'LastIn']=a;},
    transfer(a,b,p,mass){
      const src=cells[a],dest=cells[b],existing=read(b),total=(existing?.mass||0)+mass;
      const temp=existing?(existing.temp*existing.mass+p.temp*mass)/total:p.temp;
      const source=read(a),left=Math.max(0,source.mass-mass);
      const remainingTemp=left>EPS?(source.mass*source.temp-mass*p.temp)/left:source.temp;
      if(gas){
        src.gasPacket.temp=remainingTemp;src.gasPacket.mass=left;
        if(src.gasPacket.mass<=EPS)src.gasPacket=null;
        dest.gasPacket={element:p.element,mass:total,temp};
      }else{
        src[p.element]=left;src.liquidPacketTemp=remainingTemp;
        dest[p.element]=total;dest.liquidPacketTemp=temp;
        src.pipeFlow+=mass;dest.pipeFlow+=mass;
      }
    }
  };
}
