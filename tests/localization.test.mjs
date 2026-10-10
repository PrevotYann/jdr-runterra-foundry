import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const dictionary=JSON.parse(fs.readFileSync("lang/fr.json","utf8"));
const lookup=key=>key.split(".").reduce((o,k)=>o?.[k],dictionary);
test("static interface translation keys resolve",()=>{
  const missing=[];
  for(const folder of ["scripts","templates"]){for(const name of fs.readdirSync(folder)){
    const file=folder+"/"+name,text=fs.readFileSync(file,"utf8");
    const matches=[...text.matchAll(/\b(?:L|localize)\("([A-Za-z]+\.[A-Za-z0-9]+)"\)/g)].map(m=>"RUNETERRA."+m[1]);
    matches.push(...[...text.matchAll(/localize ['"](RUNETERRA\.[A-Za-z0-9.]+)['"]/g)].map(m=>m[1]));
    for(const key of matches)if(typeof lookup(key)!=="string")missing.push(file+": "+key);
    assert.ok(!/[ÃÂ][©¨®ª§´»«°]/.test(text),"Broken UTF-8 in "+file);
  }}
  assert.deepEqual(missing,[]);
});
