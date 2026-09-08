import test from 'node:test';
import assert from 'node:assert/strict';
import { packGraphColumns, resolveNodeCollision } from '../public/graph-layout.js';

test('variable-height nodes are packed without overlap in each column',()=>{
  const nodes=[{id:'a',depth:0,height:90},{id:'b',depth:0,height:280},{id:'c',depth:0,height:130},{id:'d',depth:1,height:100}];
  const layout=packGraphColumns(nodes,{gapY:24,top:40,left:50,columnWidth:250});
  const a=layout.positions.get('a'),b=layout.positions.get('b'),c=layout.positions.get('c');
  assert.ok(b.y>=a.y+90+24);assert.ok(c.y>=b.y+280+24);assert.equal(layout.positions.get('d').x,300);
});

test('drop collision resolution moves a dragged node to a free position',()=>{
  const placed=[{id:'a',x:50,y:40,width:210,height:120},{id:'b',x:50,y:184,width:210,height:120}];
  const resolved=resolveNodeCollision({id:'drag',x:60,y:60,width:210,height:100},placed,{gap:24});
  assert.ok(resolved.y>=328);assert.equal(resolved.x,60);
});
