import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectManifestFiles } from '../scripts/generate-manifest.mjs';

test('manifest omits root npm pack output but retains versioned distribution archives',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lsg-manifest-'));
  try{
    fs.mkdirSync(path.join(root,'src'),{recursive:true});
    fs.mkdirSync(path.join(root,'dist'),{recursive:true});
    fs.writeFileSync(path.join(root,'src','service.mjs'),'export const ready=true;');
    fs.writeFileSync(path.join(root,'living-solution-graph-mcp-6.3.0.tgz'),'generated release archive');
    fs.writeFileSync(path.join(root,'dist','living-solution-graph-mcp-6.0.0.tgz'),'tracked historical release archive');
    fs.writeFileSync(path.join(root,'MANIFEST.sha256'),'generated manifest');
    const files=collectManifestFiles(root).map(file=>path.relative(root,file).replaceAll(path.sep,'/'));
    assert.deepEqual(files,['dist/living-solution-graph-mcp-6.0.0.tgz','src/service.mjs']);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
