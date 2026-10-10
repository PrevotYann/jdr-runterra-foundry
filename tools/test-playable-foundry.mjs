import {chromium} from "playwright";
import fs from "node:fs";
const browser=await chromium.launch({headless:true,args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
const page=await browser.newPage(),errors=[];
page.on("pageerror",e=>errors.push(e.message));
try{
  await page.goto("http://localhost:30014",{waitUntil:"networkidle"});
  await page.locator('[name="username"]').fill("Gamemaster");await page.locator('button[name="join"]').click();
  await page.waitForFunction(()=>game?.ready&&game.runeterra?.tickActor,{timeout:60000});
  const checks=await page.evaluate(async()=>{
    const checks=[],assert=(name,value)=>{if(!value)throw new Error(name);checks.push(name);};
    const {grantBookReward,activateRelic,validateRepresentative}=await import("/systems/jdr-runeterra/scripts/play.mjs");
    const {applyInjury}=await import("/systems/jdr-runeterra/scripts/injuries.mjs");
    const {itemMigration}=await import("/systems/jdr-runeterra/scripts/migrations.mjs");
    const settings=new Map(),created=[];const random=CONFIG.Dice.randomUniform,dialog=foundry.applications.api.DialogV2.input;
    const die=async(n,fn)=>{CONFIG.Dice.randomUniform=()=>1-((n-0.5)/100);try{return await fn();}finally{CONFIG.Dice.randomUniform=random;}};
    try{
      for(const key of ["integrity","professions","progression","survival"]){settings.set(key,game.settings.get("jdr-runeterra",key));await game.settings.set("jdr-runeterra",key,true);}
      const a=await Actor.create({name:"Validation règles 0.8",type:"npc",system:{permanentMalus:"",hp:{base:130,baseMax:130},armor:{base:5},magicResistance:{base:10}}});created.push(a);
      const [gear]=await a.createEmbeddedDocuments("Item",[{name:"Armure",type:"equipment",system:{rarity:"orange",integrity:{max:100,value:100},slot:"torso"}}]);await a.equip(gear);
      const mixed=await a.applyAttack([{amount:10,type:"physical"},{amount:15,type:"magic"}],{zone:"torso"});
      assert("Résistances distinctes DP/DM et intégrité cumulée",mixed.applied===10&&a.system.hp.base===120&&gear.system.integrity.value===90);
      const html=document.createElement("div");html.innerHTML=mixed.message.content;Hooks.callAll("renderChatMessageHTML",mixed.message,html);html.querySelector('[data-rt-action="undo"]').click();
      for(let i=0;i<80&&!mixed.message.getFlag("jdr-runeterra","undone");i++)await new Promise(r=>setTimeout(r,50));
      assert("Annulation réelle de toute l’attaque mixte",mixed.message.getFlag("jdr-runeterra","undone")&&a.system.hp.base===130&&gear.system.integrity.value===100);
      const [ward]=await a.createEmbeddedDocuments("ActiveEffect",[{name:"Invulnérabilité",flags:{"jdr-runeterra":{invulnerable:true}}}]);
      await a.applyAttack([{amount:10,type:"physical"},{amount:15,type:"magic"}],{zone:"torso"});
      assert("Invulnérabilité conserve toutes les composantes différées",a.system.hp.base===130&&ward.getFlag("jdr-runeterra","deferredDamage").components.length===2);
      await ward.delete();for(let i=0;i<80&&a.system.hp.base!==120;i++)await new Promise(r=>setTimeout(r,50));
      assert("Fin d’invulnérabilité applique la blessure mixte entière",a.system.hp.base===120);
      await a.applyAttack([{amount:110,type:"physical",penetrating:true},{amount:5,type:"magic"}],{zone:"torso"});
      assert("Casse, couleur et qualité d’origine",gear.system.broken&&gear.system.rarity==="grey"&&gear.system.originalRarity==="orange");
      await gear.update({"system.enchantmentState":"lost"});await gear.repair(10);
      assert("Réparation restaure la qualité, IPV réduits et enchantement perdu",gear.system.rarity==="orange"&&gear.system.integrity.max===90&&!gear.system.broken&&gear.system.enchantmentState==="lost");
      await a.update({"system.hp.base":130});
      const [attack]=await a.createEmbeddedDocuments("Item",[{name:"Mixte avec variantes",type:"ability",system:{attribute:"concentration",damageFormula:"10",components:[{formula:"10",type:"physical",penetration:0},{formula:"20",type:"magic",penetration:0}],variants:[{id:"area",label:"Zone",zone:"area",components:[{formula:"15",type:"physical",penetration:0},{formula:"25",type:"magic",penetration:0}]}],uses:{limited:true,value:2,max:2},cooldown:2,xp:0}}]);
      await die(40,()=>attack.use({variant:"area",contextConfirmed:true}));const card=game.messages.contents.at(-1).getFlag("jdr-runeterra","components");
      assert("Variante, une dépense et une progression",card.length===2&&card[1].amount===25&&attack.system.uses.value===1&&attack.system.xp===1&&attack.system.remainingCooldown===2);
      const [spell]=await a.createEmbeddedDocuments("Item",[{name:"Sort",type:"weapon",system:{mode:"magic",attribute:"concentration",damageFormula:"20",damageType:"magic"}}]);
      await die(90,()=>spell.use());assert("Échec magique sans touche automatique ni Force",!game.messages.contents.at(-1).getFlag("jdr-runeterra","damage"));
      const [once]=await a.createEmbeddedDocuments("Item",[{name:"Usage unique",type:"relic",system:{singleUse:true,damageFormula:"0"}}]);await die(40,()=>once.use());await once.use();assert("Objet à usage unique épuisé",once.system.quantity===0);
      const [profession]=await a.createEmbeddedDocuments("Item",[{name:"Alchimiste",type:"profession",system:{guild:true,level:3,value:60}}]);
      await die(40,()=>profession.use());assert("Guilde hors mission : progression normale",profession.system.xp===1);
      await die(40,()=>profession.use({guildMission:true}));assert("Mission de guilde : doublement limité au contexte",profession.system.xp===3);
      await profession.update({"system.level":4,"system.guildMissions":11,"system.guildFinal":true});await validateRepresentative(profession);assert("Représentant validé par MJ",profession.system.guildRepresentative);
      const [book,copy]=await a.createEmbeddedDocuments("Item",[1,2].map(i=>({name:"Livre "+i,type:"book",system:{reference:"unique-reward",progress:1,milestones:[{id:"one",hours:1,text:"+5 spécial 1 ou +10 spécial 2",rewards:[{kind:"special",key:"first",amount:5,condition:"+5 spécial 1"},{kind:"special",key:"second",amount:10,condition:"+10 spécial 2"}]}]}})));
      foundry.applications.api.DialogV2.input=async()=>({reward:"one:0"});const before=a.system.specials.first.value;await grantBookReward(book);await grantBookReward(copy);assert("Récompense choisie unique même avec deux exemplaires",a.system.specials.first.value===before+5&&a.system.specials.second.value===70);
      const [amulet]=await a.createEmbeddedDocuments("Item",[{name:"Amulette",type:"relic",system:{automation:"anivia",charged:true}}]);
      foundry.applications.api.DialogV2.input=async()=>({attribute:"force",anticipation:true});await die(20,()=>amulet.use());const r=await die(40,()=>a.rollAttribute("force"));assert("Anivia plafonnée à 90 et consommée à la prochaine action",r.value===90&&!a.effects.some(e=>e.getFlag("jdr-runeterra","aniviaSource")));
      await die(99,()=>amulet.use());assert("Échec critique décharge Anivia",!amulet.system.charged);
      const dex=a.attributeValue("dexterity");await applyInjury(a,{part:"finger"});assert("Amputation permanente chiffrée",a.system.hp.baseMax===125&&a.attributeValue("dexterity")===dex-5);
      await game.runeterra.tickActor(a,86400,{worldTime:game.time.worldTime+86400});assert("Journée RP sans repas et eau remise à zéro",a.system.survival.daysWithoutMeal===1&&a.system.survival.hungry&&!a.system.survival.hydrated);
      const patch=itemMigration({_id:gear.id,system:{schemaVersion:1,rarity:"orange",damageFormula:"47",bonuses:{force:17}}});assert("Migration sans écraser valeurs personnalisées",!patch["system.damageFormula"]&&!patch["system.bonuses"]&&!patch._id);
      const supplies=await a.createEmbeddedDocuments("Item",[{name:"Kit alchimie",type:"resource",system:{kitKind:"alchemy",level:4}},{name:"Ingrédient 1L",type:"resource",system:{quantity:3}}]);
      const kit=supplies.find(i=>i.name==="Kit alchimie"),ingredient=supplies.find(i=>i.name==="Ingrédient 1L");
      const output=new Item({name:"Potion",type:"consumable",system:{recipe:"1 L",crafting:{kitKind:"alchemy"},damageFormula:"0"}});
      const crafted=await die(40,()=>game.runeterra.craft(a,output,{profession,kit,actionLevel:2,quantity:1,ingredients:[{id:ingredient.id,quantity:1}],failureLoss:100,conversionConfirmed:true}));assert("Artisanat : kit, niveau, ingrédient et produit",ingredient.system.quantity===2&&a.items.some(i=>i.name==="Potion"));
      await spell.sheet.render({force:true});await a.sheet.render({force:true});assert("Fiches avec nouveaux contrôles",spell.sheet.element.querySelector('[data-action="attacks"]')&&a.sheet.element.querySelector('[data-action="solicit"]'));
      await spell.sheet.close();await a.sheet.close();
    }finally{CONFIG.Dice.randomUniform=random;foundry.applications.api.DialogV2.input=dialog;for(const a of created)await a.delete();for(const [k,v] of settings)await game.settings.set("jdr-runeterra",k,v);}
    return checks;
  });
  if(errors.length)throw new Error(errors.join("; "));
  fs.writeFileSync("test-results/playable.json",JSON.stringify({foundry:"14.368",checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
