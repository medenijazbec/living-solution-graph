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
