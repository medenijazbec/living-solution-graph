export function packGraphColumns(nodes,{gapY=32,top=44,left=52,columnWidth=270}={}){
  const groups=new Map();for(const node of nodes){const depth=Number(node.depth)||0;if(!groups.has(depth))groups.set(depth,[]);groups.get(depth).push(node);}
  const positions=new Map();let maxBottom=top;
  for(const [depth,column] of [...groups.entries()].sort((a,b)=>a[0]-b[0])){
    let y=top;
    for(const node of column){positions.set(node.id,{x:left+depth*columnWidth,y});y+=Math.max(1,Number(node.height)||1)+gapY;maxBottom=Math.max(maxBottom,y);}
  }
  return {positions,width:left+(Math.max(0,...groups.keys())+1)*columnWidth+left,height:maxBottom+top};
}

// Reordering is deliberately an array operation, not collision physics. The
// graph remains packed after every drop, so cards cannot accumulate overlaps.
export function reorderIds(ids,movingId,targetIndex){
  const without=ids.filter(id=>id!==movingId);const index=Math.max(0,Math.min(without.length,Number(targetIndex)||0));
  without.splice(index,0,movingId);return without;
}
