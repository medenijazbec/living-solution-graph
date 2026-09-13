export const intersects=(a,b,gap=20)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;

export function settle(box,placed){
  if(!placed.some(p=>intersects(box,p)))return box;
  const candidates=[];for(const p of placed){candidates.push({...box,x:p.x+p.width+24},{...box,x:p.x-box.width-24},{...box,y:p.y+p.height+24},{...box,y:p.y-box.height-24});}
  candidates.sort((a,b)=>(a.x-box.x)**2+(a.y-box.y)**2-((b.x-box.x)**2+(b.y-box.y)**2));
  const free=candidates.find(c=>!placed.some(p=>intersects(c,p)));return free||{...box,y:Math.max(...placed.map(p=>p.y+p.height))+24};
}
export function placeCards(boxes,saved={}){
  const result=[];const ordered=[...boxes].sort((a,b)=>Number(!!saved[b.id])-Number(!!saved[a.id]));
  for(const box of ordered){const previous=saved[box.id];const desired=previous&&Number.isFinite(previous.x)&&Number.isFinite(previous.y)?{...box,x:previous.x,y:previous.y}:box;result.push(settle(desired,result));}
  return result;
}

const stableUnit=value=>{let hash=2166136261;for(const char of String(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0)/4294967295;};
export function ringRadius(radius,angle,band){const wave=Math.min(110,radius*.11);return radius+wave*(Math.sin(angle*3+band*.83)+.48*Math.sin(angle*7-band*.37))/1.48;}

// Priority concentric rings. Features occupy each tier's inner orbit; their
// edge cases and tests share the adjacent outer orbit. The radius grows with
// measured card width, so dense rings remain collision-free before settling.
export function placeRadialCards(boxes,saved={}){
  const groups=new Map();for(const box of boxes){const band=Math.max(0,box.tier)*2+(box.detail?1:0);if(!groups.has(band))groups.set(band,[]);groups.get(band).push(box);}
  const desired=[],rings=[];let previous=0;
  for(const band of [...groups.keys()].sort((a,b)=>a-b)){
    const group=groups.get(band).sort((a,b)=>String(a.number||a.id).localeCompare(String(b.number||b.id),'en',{numeric:true}));
    const maxWidth=Math.max(...group.map(b=>b.width)),maxHeight=Math.max(...group.map(b=>b.height));
    const tracks=Math.ceil(group.length/10);
    for(let track=0;track<tracks;track++){
      const members=group.slice(track*10,(track+1)*10),density=members.length<=1?0:members.length*(maxWidth+65)/(2*Math.PI),radius=band===0&&group.length===1?0:Math.max(previous+maxHeight+145,density,300);
      rings.push({band,radius,tier:Math.floor(band/2),detail:band%2===1,track});previous=radius;
      for(let index=0;index<members.length;index++){const box=members[index],step=2*Math.PI/members.length,angle=-Math.PI/2+step*(index+.5+track*.29+(stableUnit(box.id+'angle')-.5)*.45),jitter=(stableUnit(box.id+'radius')-.5)*Math.min(165,maxWidth*.55),distance=ringRadius(radius,angle,band+track*.4)+jitter;desired.push({...box,x:Math.cos(angle)*distance-box.width/2,y:Math.sin(angle)*distance-box.height/2});}
    }
  }
  return {boxes:placeCards(desired,saved),rings};
}

// Orthogonal visibility graph: candidate lanes follow inflated rectangle edges.
// Every emitted segment is checked against card interiors.
export function routeConnection(source,target,boxes){
  const start={x:source.x+source.width,y:source.y+source.height/2},end={x:target.x,y:target.y+target.height/2};
  const obstacles=boxes.map(b=>({...b,x:b.x-7,y:b.y-7,width:b.width+14,height:b.height+14}));
  const a={x:start.x+12,y:start.y},z={x:end.x-12,y:end.y};
  const xs=[...new Set([a.x,z.x,...obstacles.flatMap(b=>[b.x-2,b.x+b.width+2])])].sort((a,b)=>a-b),ys=[...new Set([a.y,z.y,...obstacles.flatMap(b=>[b.y-2,b.y+b.height+2])])].sort((a,b)=>a-b);
  const clear=(p,q)=>!obstacles.some(b=>p.x===q.x?p.x>b.x&&p.x<b.x+b.width&&Math.max(p.y,q.y)>b.y&&Math.min(p.y,q.y)<b.y+b.height:p.y>b.y&&p.y<b.y+b.height&&Math.max(p.x,q.x)>b.x&&Math.min(p.x,q.x)<b.x+b.width);
  const valid=points=>points.every((p,i)=>i===0||clear(points[i-1],p));
  for(const x of [a.x,z.x,(a.x+z.x)/2,...xs]){const route=[a,{x,y:a.y},{x,y:z.y},z];if(valid(route))return [start,...route,end];}
  for(const y of ys){const route=[a,{x:a.x,y},{x:z.x,y},z];if(valid(route))return [start,...route,end];}
  const startKey=`${xs.indexOf(a.x)},${ys.indexOf(a.y)}`,goal=`${xs.indexOf(z.x)},${ys.indexOf(z.y)}`,dist=new Map([[startKey,0]]),prev=new Map(),queue=[{key:startKey,score:0}];let steps=0;
  while(queue.length&&steps++<20000){queue.sort((a,b)=>b.score-a.score);const {key}=queue.pop();if(key===goal){const points=[z];let k=goal;while(prev.has(k)){k=prev.get(k);const [i,j]=k.split(',').map(Number);points.push({x:xs[i],y:ys[j]});}return [start,...points.reverse(),end];}const [i,j]=key.split(',').map(Number),p={x:xs[i],y:ys[j]};for(const [ni,nj] of [[i-1,j],[i+1,j],[i,j-1],[i,j+1]]){if(ni<0||nj<0||ni>=xs.length||nj>=ys.length)continue;const q={x:xs[ni],y:ys[nj]};if(!clear(p,q))continue;const next=`${ni},${nj}`,cost=dist.get(key)+Math.abs(p.x-q.x)+Math.abs(p.y-q.y);if(cost>=(dist.get(next)??Infinity))continue;dist.set(next,cost);prev.set(next,key);queue.push({key:next,score:cost+Math.abs(q.x-z.x)+Math.abs(q.y-z.y)});}}
  // Crowded ports can become temporarily inaccessible while dragging. Omit the
  // connection until a valid route exists instead of drawing through a card.
  return [];
}
