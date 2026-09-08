import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const excluded=new Set(['.git','data','node_modules','logs','coverage']);
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(excluded.has(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.name!=='MANIFEST.sha256')files.push(full);}}
walk(root);
const lines=files.sort().map(file=>{const hash=createHash('sha256').update(fs.readFileSync(file)).digest('hex');const rel=`./${path.relative(root,file).replaceAll(path.sep,'/')}`;return `${hash}  ${rel}`;});
fs.writeFileSync(path.join(root,'MANIFEST.sha256'),`${lines.join('\n')}\n`);
console.log(JSON.stringify({ok:true,files:lines.length},null,2));
