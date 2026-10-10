import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import archiver from "archiver";
const manifest=JSON.parse(fs.readFileSync("system.json","utf8"));
const provenance=JSON.parse(fs.readFileSync("content/provenance.json","utf8"));
const destination="dist/"+manifest.id+"-"+manifest.version+".zip";
fs.mkdirSync("dist",{recursive:true});
const output=fs.createWriteStream(destination),archive=archiver("zip",{zlib:{level:6}});
const completion=new Promise((resolve,reject)=>{output.on("close",resolve);output.on("error",reject);archive.on("error",reject);});
archive.pipe(output);
const files=["system.json","README.md","LICENSE","CREDITS.md"];
function collect(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=dir+"/"+entry.name;if(entry.isDirectory())collect(file);else if(!["LOCK","LOG","LOG.old"].includes(entry.name))files.push(file);}}
for(const dir of ["scripts","styles","templates","lang","docs","packs","assets/icons","assets/branding"])collect(dir);
files.push(...provenance.assets.map(a=>a.path));
for(const pack of manifest.packs)files.push("content/"+pack.name+".json");
files.push("content/provenance.json");
files.push("content/asset-map.json");
for(const file of [...new Set(files)].sort()){
  if(!fs.existsSync(file))throw new Error("Missing release file: "+file);
  archive.file(file,{name:manifest.id+"/"+file});
}
await archive.finalize();await completion;
const hash=crypto.createHash("sha256");for await(const chunk of fs.createReadStream(destination))hash.update(chunk);
fs.writeFileSync(destination+".sha256",hash.digest("hex")+"  "+path.basename(destination)+"\n");
console.log(JSON.stringify({archive:destination,megabytes:Math.round(fs.statSync(destination).size/1048576),files:new Set(files).size,counts:provenance.counts}));
