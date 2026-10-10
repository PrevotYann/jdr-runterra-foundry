import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const keys=["equipment","consumables","magic","bestiary","atlas","rules"];
const content=keys.map(k=>[k,JSON.parse(fs.readFileSync("content/"+k+".json","utf8"))]);
test("valid stable IDs, unique documents and referential folders",()=>{for(const [pack,p] of content){const ids=new Set();const folders=new Set(p.folders.map(f=>f._id));for(const d of p.documents){assert.match(d._id,/^[a-z0-9]{16}$/);assert(!ids.has(d._id),pack+" duplicate");ids.add(d._id);if(d.folder)assert(folders.has(d.folder));}for(const f of p.folders)if(f.folder)assert(folders.has(f.folder));}});
test("Magnus-specific text excluded from shipping documents",()=>{for(const [,p] of content)assert(!/magnus/i.test(JSON.stringify(p)));});
test("all referenced local images exist",()=>{for(const [,p] of content){const paths=[...JSON.stringify(p).matchAll(/systems\/jdr-runeterra\/([^"\\<>\s]+\.(?:png|jpe?g|svg|webp))/g)].map(m=>m[1]);for(const file of paths)assert(fs.existsSync(file),file);}});
test("all compendium links resolve to actual IDs",()=>{const ids=new Set(content.flatMap(([pack,p])=>p.documents.map(d=>pack+"."+({bestiary:"Actor",atlas:"JournalEntry",rules:"JournalEntry"}[pack]||"Item")+"."+d._id)));for(const [,p] of content)for(const m of JSON.stringify(p).matchAll(/@UUID\[Compendium\.jdr-runeterra\.([^\]]+)\]/g))assert(ids.has(m[1]),m[1]);});
test("branding and migrated asset paths ship locally",()=>{
  const manifest=JSON.parse(fs.readFileSync("system.json","utf8")),map=JSON.parse(fs.readFileSync("content/asset-map.json","utf8"));
  for(const url of [manifest.background,...manifest.media.flatMap(m=>[m.url,m.thumbnail])])assert(fs.existsSync(url.replace("systems/jdr-runeterra/","")),url);
  assert(Object.keys(map).length>=198);
  for(const [original,file] of Object.entries(map)){assert.match(original,/\.(png|jpe?g)$/i);assert.match(file,/\.webp$/);assert(fs.existsSync(file),file);}
  for(const [,p] of content)assert(!/assets\/drive\/[^"\\<>\s]+\.(png|jpe?g)/i.test(JSON.stringify(p)));
});
