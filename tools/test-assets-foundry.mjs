import {chromium} from "playwright";
import fs from "node:fs";
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error"||m.text().startsWith("ASSETS"))console.log(m.text());});
  await page.goto("http://localhost:30014",{waitUntil:"networkidle"});
  await page.locator('[name="username"]').fill("Gamemaster");
  await page.locator('button[name="join"]').click();
  await page.waitForFunction(()=>globalThis.game?.ready&&game.runeterra?.tickActor,{timeout:60000});
  await page.evaluate(()=>game.runeterra.assetMigration);
  const results=await page.evaluate(async()=>{
    const checks=[],assert=(name,ok)=>{if(!ok)throw new Error(name);checks.push(name);};
    const map=await (await fetch("systems/jdr-runeterra/content/asset-map.json")).json(),prefix="systems/jdr-runeterra/";
    const [old,newPath]=Object.entries(map)[0];
    const actor=await Actor.create({name:"Validation WebP",type:"character",img:prefix+old,prototypeToken:{texture:{src:prefix+old}},system:{biography:`<img src="${prefix+old}">`}});
    const [item]=await actor.createEmbeddedDocuments("Item",[{name:"Validation image",type:"equipment",img:prefix+old}]);
    const journal=await JournalEntry.create({name:"Validation WebP",pages:[{name:"Image",type:"text",text:{content:`<img src="${prefix+old}">`}}]});
    const health=actor.system.hp.base;
    try{
      console.log("ASSETS migration starting");
      const migrated=await game.runeterra.migrateAssets({force:true});
      console.log("ASSETS migration done",migrated.updated);
      assert("world portrait migrated",actor.img===prefix+newPath);
      assert("prototype token migrated",actor.prototypeToken.texture.src===prefix+newPath);
      assert("embedded item migrated",item.img===prefix+newPath);
      assert("journal HTML migrated",journal.pages.contents[0].text.content.includes(prefix+newPath));
      assert("resources preserved",actor.system.hp.base===health);
      assert("migration updates counted",migrated.updated>=3);
      assert("migration idempotent",(await game.runeterra.migrateAssets({force:true})).updated===0);
      const images=[...new Set(Object.values(map)),"assets/branding/logo.webp","assets/branding/thumbnail.webp","assets/branding/banner.webp","assets/branding/background.webp"];
      for(const [index,path] of images.entries()){const img=new Image();img.src=prefix+path;await Promise.race([img.decode(),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Decode timeout: "+path)),15000))]);assert("decode "+path,img.naturalWidth>0&&img.naturalHeight>0);img.src="";if(index%30===0)console.log("ASSETS decode",index);}
      assert("manifest background",game.system.background===prefix+"assets/branding/background.webp");
      assert("manifest setup banner",game.system.media.some(m=>m.type==="setup"&&m.url===prefix+"assets/branding/banner.webp"));
      for(const pack of game.packs.filter(p=>p.metadata.packageName==="jdr-runeterra"))for(const document of await pack.getDocuments())assert("pack portrait "+document.uuid,!document.img?.match(/assets\/drive\/[^"\s<>]+\.(png|jpe?g)/i));
      return {checks,images:images.length};
    }finally{await actor.delete();await journal.delete();}
  });
  if(errors.length)throw new Error(errors.join("\n"));
  fs.mkdirSync("test-results",{recursive:true});fs.writeFileSync("test-results/assets.json",JSON.stringify(results,null,2));
  console.log(JSON.stringify({passed:results.checks.length,images:results.images,errors}));
}finally{await browser.close();}
