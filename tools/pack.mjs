import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const foundry=process.env.FOUNDRY_PATH||"C:/FoundryVTT-Node-14.360";
const {ClassicLevel}=require(path.join(foundry,"node_modules/classic-level"));
const manifest=JSON.parse(fs.readFileSync("system.json","utf8"));
for(const pack of manifest.packs) {
  const input=JSON.parse(fs.readFileSync("content/"+pack.name+".json","utf8"));
  const db=new ClassicLevel(pack.path,{valueEncoding:"json"});
  await db.open();await db.clear();
  const collection={Item:"items",Actor:"actors",JournalEntry:"journal"}[pack.type];
  const operations=[];
  for(const doc of input.documents) {
    const source=structuredClone(doc);
    const children=pack.type==="Actor"?["items","effects"]:pack.type==="Item"?["effects"]:["pages"];
    for(const child of children) if(Array.isArray(source[child])){
      for(const entry of source[child])operations.push({type:"put",key:"!"+collection+"."+child+"!"+source._id+"."+entry._id,value:entry});
      source[child]=source[child].map(e=>e._id);
    }
    operations.push({type:"put",key:"!"+collection+"!"+doc._id,value:source});
  }
  for(const f of input.folders)operations.push({type:"put",key:"!folders!"+f._id,value:f});
  await db.batch(operations);await db.close();console.log(pack.name,input.documents.length);
}
