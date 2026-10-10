import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
sharp.concurrency(1);
const provenance=JSON.parse(fs.readFileSync("content/provenance.json","utf8"));
const prior=fs.existsSync("content/asset-map.json")?JSON.parse(fs.readFileSync("content/asset-map.json","utf8")):{};
const mappings={...prior};const report=[];
fs.mkdirSync("sources/original-assets",{recursive:true});
let cursor=0;
async function worker(){while(cursor<provenance.assets.length){const asset=provenance.assets[cursor++];
  const original=asset.originalPath||Object.keys(prior).find(k=>prior[k]===asset.path)||asset.path;
  const backup="sources/original-assets/"+path.basename(original);
  const input=fs.existsSync(backup)?backup:original;
  if(!fs.existsSync(input))throw new Error("Missing original: "+input);
  const output=original.replace(/\.(png|jpe?g)$/i,".webp");
  if(process.argv.includes("--missing")&&prior[original]&&fs.existsSync(output))continue;
  const metadata=await sharp(input).metadata();
  if(Math.max(metadata.width,metadata.height)>16383)throw new Error("WebP dimension limit: "+input);
  await sharp(input).rotate().webp({quality:90,alphaQuality:100,effort:6}).toFile(output);
  const result=await sharp(output).metadata();
  if(result.width!==(metadata.autoOrient?.width||metadata.width)||result.height!==(metadata.autoOrient?.height||metadata.height))throw new Error("Dimensions changed: "+input);
  if(metadata.hasAlpha&&!result.hasAlpha)throw new Error("Transparency lost: "+input);
  if(!fs.existsSync(backup))fs.copyFileSync(input,backup);
  mappings[original]=output;
  report.push({id:asset.id,original,output,originalBytes:fs.statSync(input).size,bytes:fs.statSync(output).size,width:result.width,height:result.height});
  if(report.length%20===0)console.log("Converted",report.length,"/",provenance.assets.length);
}}
await Promise.all([worker(),worker()]);
fs.writeFileSync("content/asset-map.json",JSON.stringify(mappings,null,2));
if(process.argv.includes("--missing")){
  report.length=0;
  for(const [original,output] of Object.entries(mappings)){
    const backup="sources/original-assets/"+path.basename(original),input=fs.existsSync(backup)?backup:original;
    const metadata=await sharp(output).metadata();
    report.push({id:path.basename(original).replace(/\.[^.]+$/, ""),original,output,originalBytes:fs.statSync(input).size,bytes:fs.statSync(output).size,width:metadata.width,height:metadata.height});
  }
}
const originalBytes=report.reduce((s,r)=>s+r.originalBytes,0),bytes=report.reduce((s,r)=>s+r.bytes,0);
const summary={quality:90,alphaQuality:100,resize:false,count:report.length,originalBytes,bytes,reduction:1-bytes/originalBytes};
fs.writeFileSync("docs/asset-optimization.json",JSON.stringify({...summary,files:report},null,2));
// Preserve originals outside the distributable system assets directory.
for(const name of fs.readdirSync("assets/drive"))if(/\.(png|jpe?g)$/i.test(name)){
  const source="assets/drive/"+name,backup="sources/original-assets/"+name;
  if(!fs.existsSync(backup))fs.copyFileSync(source,backup);
  fs.unlinkSync(source);
}
console.log(JSON.stringify(summary));
