import {ATTRIBUTES,clamp} from "./rules.mjs";
import {localize as L,chat,esc,test} from "./documents.mjs";
const roll=async(formula,actor,label)=>{const r=await new Roll(formula).evaluate();await r.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:label});return r.total;};
const effect=async(item,changes=[],seconds=0,flags={})=>item.actor.createEmbeddedDocuments("ActiveEffect",[{name:item.name,img:item.img,changes,duration:{value:seconds||null,units:"seconds",expiry:seconds?"runeterra":null},start:{time:game.time.worldTime},flags:{"jdr-runeterra":{...flags,source:item.uuid}}}]);
const add=(key,value)=>({key,mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:String(value)});
async function choose(item,{attribute=false,tier=false,duration=false,asleep=false,fur=false}={}) {
  let fields="";
  if(attribute)fields+=`<label>${L("Fields.attribute")}<select name="attribute">${ATTRIBUTES.map(k=>`<option value="${k}">${L("Attributes."+k)}</option>`).join("")}</select></label>`;
  if(tier)fields+=`<label>${L("Fields.potency")}<select name="tier">${[1,2,3,4].map(n=>`<option value="${n}" ${item.system.level===n?"selected":""}>${n===4?"L":n}</option>`).join("")}</select></label>`;
  if(duration)fields+=`<label>${L("Fields.duration")}<input type="number" name="duration" min="0" value="${item.system.duration||3600}"></label>`;
  if(asleep)fields+=`<label><input type="checkbox" name="asleep">${L("Fields.asleep")}</label>`;
  if(fur)fields+=`<label><input type="checkbox" name="flexible">${L("Fields.flexible")}</label>`;
  return foundry.applications.api.DialogV2.input({window:{title:item.name},content:`<div class="rt-dialog">${fields}</div>`,ok:{label:L("Actions.use")},rejectClose:false});
}
export async function applyPotion(item) {
  const s=item.system,a=item.actor,kind=s.automation;
  if(!kind)return {handled:false,hp:0};
  const logs=foundry.utils.deepClone(a.getFlag("jdr-runeterra","consumptions")||{});
  const times=(logs[kind]||[]).filter(t=>game.time.worldTime-t<86400);
  let hp=0,cancel=false;
  if(kind==="antidote") {
    const n=await choose(item,{tier:true});if(!n)return {cancel:true};
    const poison=a.effects.filter(e=>["poison","sickness","infection"].some(id=>e.statuses.has(id))&&(e.getFlag("jdr-runeterra","level")||1)<=n.tier);
    for(const e of poison)await e.delete();
    await chat(a,item.name,`<p>${poison.length} · ${L("Fields.conditions")}</p><p>${esc(s.dangers)}</p>`);
  }else if(kind==="curasom") {
    const n=await choose(item,{tier:true,asleep:true});if(!n)return {cancel:true};
    const tier=clamp(n.tier,1,3),healing=[0,15,25,40][tier]+(n.asleep?[0,5,10,15][tier]:0);
    const penalty=[0,-20,-15,-10][tier];
    await effect(item,[add("system.attributes.reflexes.bonus",penalty)],7200,{healTotal:healing,healRemaining:healing,healSeconds:7200,elapsed:0});
    if(times.length>=3)await a.addCondition("coma");
  }else if(kind==="hudvarm") {
    const n=await choose(item,{tier:true});if(!n)return {cancel:true};
    const days=[0,0.5,2,4,4][clamp(n.tier,1,4)];
    const active=a.effects.some(e=>e.getFlag("jdr-runeterra","potion")==="hudvarm");
    await effect(item,[add("system.cold.native",1)],days*86400,{potion:"hudvarm",damagePerHour:active?2:0,elapsed:0});
  }else if(kind==="rougeVision") {
    await a.update({"system.hp.bonus":a.system.hp.bonus+20});
    await effect(item,[add("system.attributes.force.bonus",10)],300,{attributeOverrides:{mental:0},bonusHP:20,remainingRounds:10});
  }else if(kind==="tourneChance") {
    await effect(item,[],1800,{reverseDice:true});
  }else if(kind==="vivacium") {
    await effect(item,["endurance","reflexes","concentration","perception"].map(k=>add("system.attributes."+k+".bonus",5)),3600,{damagePerRound:2,remainingRounds:10});
    const r=await test(a,"mental",{modifier:-5*times.length,label:item.name});
    if(r.result==="failure"||r.result==="criticalFailure") {
      const addiction=foundry.utils.deepClone(a.getFlag("jdr-runeterra","addiction")||[]);
      addiction.push(r.die);await a.setFlag("jdr-runeterra","addiction",addiction);
    }
  }else if(kind==="iron"||kind==="pommadarmur") {
    const n=await choose(item,{tier:true,fur:kind==="pommadarmur"});if(!n)return {cancel:true};
    const tier=clamp(n.tier,1,4),armor=[0,2,5,10,15][tier],rounds=[0,5,10,20,50][tier];
    const flags={wardBrut:kind==="iron"?armor:0,bleedReduction:kind==="iron"?1:0,remainingRounds:rounds,zoneArmor:kind==="pommadarmur"?{[s.slot]:armor}:{}};
    await effect(item,kind==="iron"?[add("system.armor.persistent",armor)]:n.flexible?[]:[add("system.attributes.agility.bonus",-10)],kind==="iron"?10800:7200,flags);
    if(kind==="iron"&&times.length>=3)hp-=10*2**(times.length-3);
  }else if(kind==="divina") {
    hp=a.system.hp.baseMax;
    await effect(item,[],150,{healPerRound:5,reduceBleedingEachRound:true,remainingRounds:5});
    await a.unsetFlag("jdr-runeterra","addiction");
    const age=await roll("1d100",a,item.name);
    if(age>=90)await chat(a,item.name,`<p>${L("Fields.aging")} : ${age-90}</p>`);
  }else if(kind==="immortal") {
    const n=await choose(item,{tier:true});if(!n)return {cancel:true};
    await effect(item,["endurance","reflexes","concentration","perception"].map(k=>add("system.attributes."+k+".bonus",5)),Number(n.tier)*60,{invulnerable:true,healPerRound:a.system.hp.baseMax+a.system.equipmentMax,remainingRounds:Number(n.tier)*2});
  }else if(kind==="trueIce") {
    const rounds=1+await roll("1d4",a,item.name);
    await effect(item,[],rounds*30,{remainingRounds:rounds,damagePerRound:10,damageType:"brut",enduranceCheck:true});
  }else if(kind==="exutoire") {
    if(a.effects.some(e=>e.statuses.has("sickness")))await chat(a,item.name,`<p>${esc(s.dangers)}</p>`);
    else await a.update({"system.immunities":[...new Set([...a.system.immunities,"sickness"])]});
  }else if(kind==="renovis") {
    const n=await choose(item,{attribute:true,duration:true});if(!n)return {cancel:true};
    const value=await roll("1d100",a,item.name);
    await effect(item,[],n.duration,{attributeOverrides:{[n.attribute]:value}});
    const previous=a.getFlag("jdr-runeterra","renovis")||{};
    if(previous[n.attribute]!==undefined&&game.time.worldTime-previous[n.attribute]<604800)await a.update({["system.attributes."+n.attribute+".base"]:Math.max(0,a.system.attributes[n.attribute].base-5)});
    await a.setFlag("jdr-runeterra","renovis",{...previous,[n.attribute]:game.time.worldTime});
  }else if(kind==="rams") {
    const duration=await roll("1d6",a,item.name)*3600;
    const first=ATTRIBUTES[await roll("1d12",a,item.name)-1];let second=first;
    while(second===first)second=ATTRIBUTES[await roll("1d12",a,item.name)-1];
    const fate=await roll("1d100",a,item.name),values={[first]:a.system.effective[second],[second]:a.system.effective[first]};
    if(fate===100)await a.update({["system.attributes."+first+".base"]:values[first],["system.attributes."+second+".base"]:values[second]});
    else await effect(item,[],duration,{attributeOverrides:values});
  }else if(kind==="appadragon") {
    const n=await choose(item,{tier:true});if(!n)return {cancel:true};
    const die=await roll("1d100",a,item.name),rarity=await roll("1d20",a,item.name);
    await chat(a,item.name,`<p>${L("Fields.dragonRoll")} : ${die} / ${rarity}</p><p>${esc(s.description.replace(/<[^>]+>/g,""))}</p>`);
  }
  logs[kind]=[...times,game.time.worldTime];await a.setFlag("jdr-runeterra","consumptions",logs);
  return {handled:true,hp,cancel};
}
