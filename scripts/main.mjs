import {RuneterraActorModel,RuneterraItemModel} from "./models.mjs";
import {RuneterraActor,RuneterraItem,localize as L,setting,exclusive,damageState} from "./documents.mjs";
import {RuneterraActorSheet,RuneterraItemSheet,damageDialog} from "./sheets.mjs";
import {advanceTime,registerTime} from "./time.mjs";
import * as rules from "./rules.mjs";
import {purchase,care,counterfeit,craft} from "./actions.mjs";
import frenchFallback from "../lang/fallback.mjs";
import {migrateAssets} from "./asset-migration.mjs";
Hooks.once("i18nInit",()=>foundry.utils.mergeObject(game.i18n._fallback,frenchFallback,{overwrite:false}));
Hooks.once("init",()=>{
  CONFIG.Actor.documentClass=RuneterraActor;CONFIG.Item.documentClass=RuneterraItem;
  for(const type of ["character","npc","creature","vehicle"]) {CONFIG.Actor.dataModels[type]=RuneterraActorModel;CONFIG.Actor.typeLabels[type]="RUNETERRA.Types."+type;}
  for(const type of ["weapon","equipment","ability","special","profession","consumable","rune","relic","resource","book","enchantment","affiliation"]) {CONFIG.Item.dataModels[type]=RuneterraItemModel;CONFIG.Item.typeLabels[type]="RUNETERRA.Types."+type;}
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor,"jdr-runeterra",RuneterraActorSheet,{types:["character","npc","creature","vehicle"],makeDefault:true,label:"RUNETERRA.Title"});
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item,"jdr-runeterra",RuneterraItemSheet,{makeDefault:true,label:"RUNETERRA.Title"});
  const choices={fixedResistance:{none:"RUNETERRA.Settings.none",flat:"RUNETERRA.Settings.flat",percent:"RUNETERRA.Settings.percent"},nativeCap:{10:"10",20:"20"},unconsciousDot:{0.25:"25 %",0.5:"50 %"},dotLevel4:{5:"5",10:"10"}};
  const defs={integrity:[Boolean,true],survival:[Boolean,false],professions:[Boolean,true],progression:[Boolean,true],criticalSafety:[Boolean,true],realtime:[Boolean,false],fixedResistance:[String,"flat"],nativeCap:[Number,10],unconsciousDot:[Number,0.25],dotLevel4:[Number,10]};
  game.settings.register("jdr-runeterra","assetMigration",{scope:"world",config:false,type:String,default:""});
  for(const [key,[type,value]] of Object.entries(defs))game.settings.register("jdr-runeterra",key,{name:"RUNETERRA.Settings."+key,hint:"RUNETERRA.Settings."+key+"Hint",scope:"world",config:true,type,default:value,choices:choices[key],requiresReload:["nativeCap","survival"].includes(key)});
  CONFIG.statusEffects=["bleeding","poison","burn","coma","unconscious","fatigue","sickness","fear","charmed","blind","restrained","paralyzed","curse","fracture","amputation","blessing","regeneration","frenzy","trauma"].map(id=>({id,name:"RUNETERRA.Conditions."+id,img:"systems/jdr-runeterra/assets/icons/"+(["bleeding","poison","burn"].includes(id)?"damage":"condition")+".svg"}));
  CONFIG.time.roundTime=30;CONFIG.Combat.initiative={formula:"@combatOrder",decimals:0};
  CONFIG.ActiveEffect.expiryEvents.runeterra="RUNETERRA.Fields.duration";
  Handlebars.registerHelper("rtAbilityGroup",type=>["ability","special","profession","enchantment","affiliation"].includes(type));
  Handlebars.registerHelper("rtEquippable",type=>["weapon","equipment","relic"].includes(type));
  Handlebars.registerHelper("rtFoodKinds",()=>({meat:L("FoodKinds.meat"),vegetable:L("FoodKinds.vegetable"),seed:L("FoodKinds.seed")}));
  Handlebars.registerHelper("rtSocialChoices",()=>({charisma:L("Attributes.charisma"),persuasion:L("Attributes.persuasion")}));
  Handlebars.registerHelper("rtTargetModes",()=>({self:L("Targets.self"),targets:L("Targets.targets")}));
  Handlebars.registerHelper("rtDotKinds",()=>({bleeding:L("Conditions.bleeding"),poison:L("Conditions.poison"),burn:L("Conditions.burn")}));
  game.runeterra={rules,advanceTime,purchase,care,counterfeit,craft,migrateAssets,tickActor:null};
});
Hooks.once("ready",async()=>{
  if(game.user.isGM&&game.users.activeGM?.id===game.user.id)for(const folder of game.folders.filter(f=>f.type==="Compendium"&&["RUNETERRA.Title","RUNETERRA.Title.title","JDR Runeterra.title"].includes(f.name)))await folder.update({name:L("Title")});
  game.runeterra.assetMigration=migrateAssets();
  try{await game.runeterra.assetMigration;}catch(error){console.error("JDR Runeterra | WebP migration",error);}
  registerTime();
  const {tickActor,waitForTime}=await import("./time.mjs");game.runeterra.tickActor=tickActor;game.runeterra.waitForTime=waitForTime;
  if(game.users.activeGM?.id===game.user.id)for(const actor of game.actors){
    const updates=actor.effects.filter(e=>e.flags["jdr-runeterra"]&&e.duration.units==="seconds"&&e.duration.value>0&&e.duration.expiry==="turnStart").map(e=>({_id:e.id,"duration.expiry":"runeterra"}));
    if(updates.length)await actor.updateEmbeddedDocuments("ActiveEffect",updates);
  }
});
Hooks.on("preCreateActor",(actor,data)=>{
  if(actor.type!=="character")return;
  actor.updateSource({prototypeToken:{actorLink:true,bar1:{attribute:"health"},bar2:{attribute:"integrity"}}});
  if(!data.items?.length)actor.updateSource({items:[
    {name:L("Types.profession"),type:"profession",img:"systems/jdr-runeterra/assets/icons/magic.svg",system:{level:3,value:60}},
    ...[1,2,3].map(i=>({name:L("Types.ability")+" "+i,type:"ability",img:"systems/jdr-runeterra/assets/icons/magic.svg",system:{attribute:i===2?"second":"first",alternateAttribute:"second",damageFormula:"0"}})),
    {name:L("AbilityKinds.passive"),type:"ability",system:{abilityKind:"passive",damageFormula:"0"}},
    {name:L("AbilityKinds.ultimate"),type:"ability",system:{abilityKind:"ultimate",damageFormula:"0"}}
  ]});
});
Hooks.on("preUpdateActor",(actor,changed,options,userId)=>{
  if(userId!==game.user.id)return;
  const flat=foundry.utils.flattenObject(changed);
  if(actor.type==="character"&&actor.system.validated&&flat["system.permanentMalus"]!==undefined&&flat["system.permanentMalus"]!==actor.system.permanentMalus){ui.notifications.warn(L("Creation.malusLocked"));return false;}
  if(actor.type==="character"&&!actor.system.validated) {
    const allocationChanged=Object.entries(flat).some(([k,v])=>(/^system\.attributes\.[^.]+\.base$/.test(k)||k==="system.permanentMalus")&&foundry.utils.getProperty(actor,k)!==v);
    if(allocationChanged||flat["system.validated"]===true) {
      const candidate=foundry.utils.mergeObject(actor.toObject(),foundry.utils.expandObject(changed),{inplace:false}).system;
      const issues=rules.creationIssues(candidate).filter(k=>flat["system.validated"]===true||["maximum","malus","range"].includes(k));
      if(issues.length){ui.notifications.warn(issues.map(k=>L("Creation."+k)).join(" · "));return false;}
    }
  }
  if(!game.user.isGM && Object.keys(flat).some(k=>k.startsWith("system.gmNotes")))return false;
  if(flat["system.species"]!==undefined||flat["system.subspecies"]!==undefined) {
    const species=flat["system.species"]??actor.system.species;
    const subspecies=flat["system.subspecies"]??(species!==actor.system.species?"":actor.system.subspecies);
    if(species!==actor.system.species&&flat["system.subspecies"]===undefined)changed["system.subspecies"]="";
    const delta=(["golem","mecha"].includes(species)?20:0)-(subspecies==="oovikat"?20:0)-(["golem","mecha"].includes(actor.system.species)?20:0)+(actor.system.subspecies==="oovikat"?20:0);
    if(delta){changed["system.hp.baseMax"]=Math.max(1,actor.system.hp.baseMax+delta);changed["system.hp.base"]=Math.max(1,actor.system.hp.base+delta);}
  }
});
Hooks.on("preUpdateItem",(item,changed,options,userId)=>{
  if(userId!==game.user.id)return;
  if(!game.user.isGM&&Object.keys(foundry.utils.flattenObject(changed)).some(k=>k.startsWith("system.gmNotes")))return false;
  if(item.actor)options.rtEquipmentMax=item.actor.system.equipmentMax;
});
Hooks.on("preCreateItem",(item,data,options,userId)=>{if(userId===game.user.id&&item.actor){options.rtEquipmentMax=item.actor.system.equipmentMax;if(item.system.acquired<0)item.updateSource({"system.acquired":game.time.worldTime});}});
Hooks.on("preDeleteItem",(item,options,userId)=>{if(userId===game.user.id&&item.actor)options.rtEquipmentMax=item.actor.system.equipmentMax;});
Hooks.on("deleteActiveEffect",async(effect,options,userId)=>{
  if(userId!==game.user.id||!effect.parent?.isOwner)return;
  const remaining=effect.getFlag("jdr-runeterra","bonusHP")||0;
  if(remaining)await effect.parent.update({"system.hp.bonus":Math.max(0,effect.parent.system.hp.bonus-remaining)});
  const deferred=effect.getFlag("jdr-runeterra","deferredDamage");
  if(deferred&&!options.rtUndo&&!effect.getFlag("jdr-runeterra","regenerated"))await effect.parent.applyDamage(deferred.amount,{...deferred,lethal:true});
});
const adjustEquipmentHP=async(item,options,userId)=>{
  if(userId!==game.user.id||!item.actor?.isOwner||options.rtEquipmentMax===undefined)return;
  const difference=item.actor.system.equipmentMax-options.rtEquipmentMax;
  if(difference)await item.actor.update({"system.hp.equipment":rules.clamp(item.actor.system.hp.equipment+difference,0,item.actor.system.equipmentMax)});
};
Hooks.on("updateItem",(item,changed,options,userId)=>adjustEquipmentHP(item,options,userId));
Hooks.on("createItem",adjustEquipmentHP);
Hooks.on("deleteItem",adjustEquipmentHP);
Hooks.on("renderChatMessageHTML",(message,html)=>{
  html.classList.add("runeterra","rt-message");
  const root=html instanceof HTMLElement?html:html[0];
  root?.querySelectorAll("[data-rt-action]").forEach(button=>{
    button.addEventListener("click",async()=>{
      if(button.disabled)return;button.disabled=true;
      try {
        const data=message.flags["jdr-runeterra"];
        if(["damage","effect","heal"].includes(button.dataset.rtAction)) {
          const targets=[...game.user.targets].map(t=>t.actor).filter(Boolean);
          if(!targets.length){ui.notifications.warn(L("Errors.target"));return;}
          for(const actor of new Set(targets)){
            if(!actor.isOwner){ui.notifications.warn(L("Errors.gmTarget"));continue;}
            if(button.dataset.rtAction==="damage"&&!await damageDialog(actor,{amount:data.damage,type:data.type,penetration:data.penetration,penetrating:data.penetrating}))continue;
            if(data.heal>0)await actor.heal(data.heal);
            if(data.dot?.level>0)await actor.addCondition(data.dot.kind,{level:data.dot.level,duration:data.duration});
            if(data.modifications?.length)await actor.createEmbeddedDocuments("ActiveEffect",[{name:message.speaker.alias||L("Types.ability"),changes:data.modifications.filter(m=>rules.ATTRIBUTES.includes(m.attribute)).map(m=>({key:`system.attributes.${m.attribute}.bonus`,mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:String(m.value)})),duration:{value:data.duration||null,units:"seconds",expiry:data.duration?"runeterra":null},start:{time:game.time.worldTime},flags:{"jdr-runeterra":{source:data.source}}}]);
          }
        }else if(button.dataset.rtAction==="undo") {
          const actor=await fromUuid(data.actor);if(!actor?.isOwner||data.undone)return;
          await exclusive(actor,async()=>{
            if(damageState(actor)!==data.after) {ui.notifications.warn(L("Errors.undoChanged"));return;}
            for(const effect of actor.effects.filter(e=>!data.snapshot.effects.includes(e.id)))await effect.delete({rtUndo:true});
            if(data.snapshot.effectFlags)await actor.updateEmbeddedDocuments("ActiveEffect",data.snapshot.effectFlags);
            await actor.update({"system.hp":data.snapshot.hp,"system.armor":data.snapshot.armor,"system.magicResistance":data.snapshot.magicResistance,"system.integrity":data.snapshot.integrity});
            await actor.updateEmbeddedDocuments("Item",data.snapshot.items.filter(i=>actor.items.has(i._id)).map(i=>({_id:i._id,"system.integrity":i.integrity,"system.broken":i.broken})));
            await message.setFlag("jdr-runeterra","undone",true);
          });
        }
      }catch(error){console.error("JDR Runeterra",error);ui.notifications.error(error.message);}finally{button.disabled=false;}
    });
  });
});
