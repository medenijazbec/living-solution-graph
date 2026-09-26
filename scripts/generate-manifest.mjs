import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const excludedDirectories=new Set(['.git','data','node_modules','logs','coverage']);

export function collectManifestFiles(directory){
  const files=[];
  function walk(current){
    for(const entry of fs.readdirSync(current,{withFileTypes:true})){
      if(entry.isDirectory()&&excludedDirectories.has(entry.name))continue;
      const full=path.join(current,entry.name);
      if(entry.isDirectory())walk(full);
      else if(entry.name!=='MANIFEST.sha256'&&!(path.resolve(current)===path.resolve(directory)&&/^living-solution-graph-mcp-\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?\.tgz$/i.test(entry.name)))files.push(full);
    }
  }
  walk(directory);
  return files.sort();
}

export function generateManifest(directory=root){
  const files=collectManifestFiles(directory);
  const lines=files.map(file=>{
    const hash=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const rel=`./${path.relative(directory,file).replaceAll(path.sep,'/')}`;
    return `${hash}  ${rel}`;
  });
  fs.writeFileSync(path.join(directory,'MANIFEST.sha256'),`${lines.join('\n')}\n`);
  const result={ok:true,files:lines.length};
  console.log(JSON.stringify(result,null,2));
  return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))generateManifest();
