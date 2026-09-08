export function packGraphColumns(nodes,{gapY=24,top=40,left=50,columnWidth=250}={}){
  const groups=new Map();for(const node of nodes){const depth=Number(node.depth)||0;if(!groups.has(depth))groups.set(depth,[]);groups.get(depth).push(node);}const positions=new Map();let maxBottom=top;
  for(const [depth,column] of [...groups.entries()].sort((a,b)=>a[0]-b[0])){let y=top;for(const node of column){positions.set(node.id,{x:left+depth*columnWidth,y});y+=Math.max(1,Number(node.height)||1)+gapY;maxBottom=Math.max(maxBottom,y);}}
  return {positions,width:left+(Math.max(0,...groups.keys())+1)*columnWidth+left,height:maxBottom+top};
}

function intersects(a,b,gap){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;}
export function resolveNodeCollision(node,placed,{gap=24}={}){let next={...node};const peers=placed.filter(other=>other.id!==node.id&&Math.abs(other.x-node.x)<Math.max(other.width,node.width));let changed=true;while(changed){changed=false;for(const other of peers){if(intersects(next,other,gap)){next={...next,y:other.y+other.height+gap};changed=true;}}}return next;}
