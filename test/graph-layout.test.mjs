import test from 'node:test';
import assert from 'node:assert/strict';
import { packGraphColumns, reorderIds } from '../public/graph-layout.js';

test('variable-height nodes are packed without overlap in each column',()=>{
  const nodes=[{id:'a',depth:0,height:90},{id:'b',depth:0,height:280},{id:'c',depth:0,height:130},{id:'d',depth:1,height:100}];
  const layout=packGraphColumns(nodes,{gapY:24,top:40,left:50,columnWidth:250});
  const a=layout.positions.get('a'),b=layout.positions.get('b'),c=layout.positions.get('c');
  assert.ok(b.y>=a.y+90+24);assert.ok(c.y>=b.y+280+24);assert.equal(layout.positions.get('d').x,300);
});

test('drag drop reorders cards without collision displacement',()=>{
  assert.deepEqual(reorderIds(['a','b','c','d'],'c',0),['c','a','b','d']);
  assert.deepEqual(reorderIds(['a','b','c','d'],'a',3),['b','c','d','a']);
  assert.deepEqual(reorderIds(['a','b','c'],'b',99),['a','c','b']);
});
