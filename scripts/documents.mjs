import {useKit} from "./kits.mjs";
import * as R from "./rules.mjs";
import {attackProfile,validComponents} from "./attack-data.mjs";
import {activateRelic,grantBookReward} from "./play.mjs";
import {applyPotion} from "./potions.mjs";
export const localize = key => game.i18n.localize("RUNETERRA."+key);
export const esc = value => foundry.utils.escapeHTML(String(value??""));
export const setting = key => game.settings.get("jdr-runeterra",key);
export const damageState=actor=>JSON.stringify({hp:actor.system.hp,armor:actor.system.armor,magicResistance:actor.system.magicResistance,integrity:actor.system._source.integrity,items:actor.items.map(i=>[i.id,i.system.integrity,i.system.broken,i.system.rarity,i.system.originalRarity,i.system.enchantmentState]),effects:actor.effects.map(e=>[e.id,e.flags,e.disabled])});
async function spendTemporaryHP(actor,spent){for(const effect of actor.effects.filter(e=>e.active)){const remaining=effect.getFlag("jdr-runeterra","bonusHP")||0;if(remaining&&spent>0){const used=Math.min(remaining,spent);spent-=used;await effect.update({"flags.jdr-runeterra.bonusHP":remaining-used});}}}
const queues=new Map();
export async function exclusive(document, fn) {
  const key=document.uuid, previous=queues.get(key)||Promise.resolve();
  const pending=previous.catch(()=>{}).then(fn);queues.set(key,pending);
  try{return await pending;}finally{if(queues.get(key)===pending)queues.delete(key);}
}
function editable(document) {if(!document.isOwner) throw new Error(localize("Errors.permission"));}
export async function chat(actor,title,content,flags={},rolls=[]) {
  return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<article class="runeterra rt-chat"><h3>${esc(title)}</h3>${content}</article>`,rolls,flags:{"jdr-runeterra":flags}},rolls.length?{messageMode:game.settings.get("core","messageMode")}:{});
}
export async function test(actor,attribute,{modifier=0,label,profession=false,target,quiet=false,contextReward}={}) {
  editable(actor);
  const reward=actor.effects.get(contextReward)?.getFlag("jdr-runeterra","contextReward");
  if(reward&&(!reward.keys?.length||reward.keys.includes(attribute)))modifier=Number(modifier)+Number(reward.amount);
  const threshold=target??actor.attributeValue(attribute);
    const blessings=actor.effects.filter(e=>e.active&&e.getFlag("jdr-runeterra","attribute")===attribute&&e.getFlag("jdr-runeterra","aniviaSource"));
    const blessing=blessings.at(-1);
    const value=R.clamp(threshold+Number(modifier)+(blessing?Math.min(blessing.getFlag("jdr-runeterra","bonus")||0,Math.max(0,90-threshold-Number(modifier))):0));
    if(blessing?.getFlag("jdr-runeterra","nextTest"))await blessing.delete();
  const roll=await new Roll("1d100").evaluate();
  const reverse=actor.effects.some(e=>e.active&&e.getFlag("jdr-runeterra","reverseDice"));
  const die=reverse&&roll.total<100?Number(String(roll.total).padStart(2,"0").split("").reverse().join(""))||100:roll.total;
  const result=R.outcome(die,value,{infallible:profession&&value>=100});
  const addiction=actor.getFlag("jdr-runeterra","addiction")||[];
  const recent=(actor.getFlag("jdr-runeterra","consumptions")?.vivacium||[]).some(t=>game.time.worldTime-t<86400);
  if(addiction.includes(die)&&!recent){const s=actor.system,n=R.damagePools({base:s.hp.base,equipment:s.hp.equipment,bonus:s.hp.bonus},5,{criticalSafety:actor.type==="character"&&setting("criticalSafety")&&!["golem","mecha"].includes(s.species)});await spendTemporaryHP(actor,s.hp.bonus-n.bonus);await actor.update({"system.hp.base":n.base,"system.hp.equipment":n.equipment,"system.hp.bonus":n.bonus});if(n.coma)await actor.addCondition("coma");await chat(actor,localize("Conditions.addiction"),`<p>−5 ${localize("Fields.hp")} · ${die}</p>`);}
  if(!quiet) await roll.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:`${esc(label||actor.attributeLabel(attribute))} · ${value}% — ${localize("Results."+result)}`});
  if(reverse&&!quiet)await chat(actor,label||actor.attributeLabel(attribute),`<p>${roll.total} → ${die}</p>`);
  return {roll,die,result,value,margin:value-die};
}
export class RuneterraActor extends Actor {
  prepareDerivedData() {
    super.prepareDerivedData();
    const s=this.system; if(!s.hp) return;
    s.hp.base=Math.min(s.hp.base,s.hp.baseMax);
    const equipped=this.items.filter(i=>i.system.equipped && !i.system.broken && ["equipment","relic","weapon"].includes(i.type));
    const viable=equipped.filter(i=>!["grey","green"].includes(i.system.rarity));
    const bonuses={};let hp=0,armor=0,rm=0,clothing=s.cold.clothing,capacity=s.capacity;
    for(const i of viable) {hp+=i.system.hp;armor+=i.system.armor;rm+=i.system.magicResistance;for(const [k,v] of Object.entries(i.system.bonuses)) bonuses[k]=(bonuses[k]||0)+Number(v);}
    for(const item of this.items.filter(i=>i.system.equipped&&i.system.enchantmentState==="active"))for(const enchantment of item.getFlag("jdr-runeterra","enchantments")||[]){
      if(enchantment.until&&game.time.worldTime>=enchantment.until)continue;
      for(const m of enchantment.modifications||[])if(R.ATTRIBUTES.includes(m.attribute))bonuses[m.attribute]=(bonuses[m.attribute]||0)+Number(m.value);
    }
    const sets=new Map();
    for(const i of viable.filter(i=>i.system.setId)) {const list=sets.get(i.system.setId)||[];list.push(i);sets.set(i.system.setId,list);}
    s.activeSets=[];
    for(const [id,list] of sets) if(new Set(list.map(i=>i.system.slot)).size>=list[0].system.setSize) {
      s.activeSets.push({id,description:list[0].system.setDescription});
      for(const [k,v] of Object.entries(list[0].system.setBonuses)) {if(k==="hp")hp+=Number(v);else if(k==="armor")armor+=Number(v);else if(k==="magicResistance")rm+=Number(v);else if(k==="capacity")capacity+=Number(v);else bonuses[k]=(bonuses[k]||0)+Number(v);}
    }
    // Cold insulation requires at least torso + legs. The least protected mandatory piece limits the outfit.
    const insulated=equipped.filter(i=>i.system.cold>0);
    const torso=insulated.find(i=>i.system.slot==="torso"),legs=insulated.find(i=>i.system.slot==="legs");
    if(torso&&legs) clothing=Math.max(clothing,Math.min(torso.system.cold,legs.system.cold));
    if(torso&&legs&&insulated.some(i=>i.system.cold===4)) clothing=4;
    const cold=R.coldLevel(s.cold.ambient,Math.max(s.cold.native,s.region==="freljord"?2:0),clothing,{freljord:s.region==="freljord",shurima:s.region==="shurima"});
    const penalties=R.coldPenalties(cold,s.species==="marean"?2:1);
    if(s.survival.fatigued) for(const [k,v] of Object.entries({force:-5,concentration:-5,reflexes:-10,endurance:-10})) penalties[k]=(penalties[k]||0)+v;
    if(setting("survival")&&s.survival.hungry) {
      penalties.force=(penalties.force||0)-s.survival.hungerHours*5*(s.survival.hydrated?0.5:1);
      if(s.survival.depletionHours>0) for(const k of ["endurance","agility","reflexes"]) penalties[k]=(penalties[k]||0)-s.survival.depletionHours*10*(s.survival.hydrated?0.5:1);
    }
    if(s.species==="chirean")bonuses[s.socialChoice]=(bonuses[s.socialChoice]||0)+10;
    if(s.species==="halfTroll"&&s.subspecies==="ice")bonuses.perception=(bonuses.perception||0)+10;
    const racialCaps=s.subspecies==="khonlui"?["stealth","dexterity"]:s.subspecies==="mohkura"?["stealth","endurance"]:[];
    for(const key of racialCaps)if(key!==s.permanentMalus)penalties[key]=(penalties[key]||0)-10;
    if(s.subspecies==="strig"&&!s.survival.airborne){penalties.reflexes=(penalties.reflexes||0)-10;penalties.endurance=(penalties.endurance||0)-30;}
    s.effective={};for(const k of R.ATTRIBUTES) {
      const base=racialCaps.includes(k)||s.subspecies==="strig"&&k==="agility"&&!s.survival.airborne?Math.min(50,s.attributes[k].base):s.attributes[k].base;
      s.effective[k]=R.effectiveAttribute(base,s.attributes[k].bonus+(bonuses[k]||0),penalties[k]||0,k===s.permanentMalus);
    }
    for(const effect of this.effects.filter(e=>e.active))for(const [key,value] of Object.entries(effect.getFlag("jdr-runeterra","attributeOverrides")||{}))if(key in s.effective)s.effective[key]=R.clamp(value);
    s.effectiveCold=cold;s.equipmentMax=hp;s.equipmentArmor=armor;s.equipmentRM=rm;s.capacityMax=Math.min(40,capacity);
    s.health={value:Math.min(s.hp.base,s.hp.baseMax)+Math.min(s.hp.equipment,hp)+s.hp.bonus,max:s.hp.baseMax+hp};
    s.metabolism=s.hp.baseMax-50;
    s.armorTotal=Math.min(Math.max(s.armor.base,s.species==="minotaur"||s.subspecies==="khonlui"?5:0),setting("nativeCap"))+armor+s.armor.rating+s.armor.persistent+s.armor.ephemeral;
    s.rmTotal=Math.min(Math.max(s.magicResistance.base,["vastaya","yordle"].includes(s.species)?5:0),setting("nativeCap"))+rm+s.magicResistance.rating+s.magicResistance.persistent+s.magicResistance.ephemeral;
    const integrityMax=equipped.filter(i=>i.type==="equipment"&&!i.system.integrity.indestructible).reduce((sum,i)=>sum+(i.system.integrity.globalDamaged?i.system.integrity.max/2:i.system.integrity.max),0);
    s.integrity.max=integrityMax;s.integrity.value=Math.max(0,integrityMax-s.integrity.damage);
    s.usedSlots=this.items.filter(i=>!i.system.equipped).reduce((sum,i)=>sum+i.system.slots*i.system.quantity,0);
  }
  attributeValue(key) {if(key?.startsWith("special:"))return this.items.get(key.slice(8))?.system.value||0;if(key==="metabolism")return this.system.metabolism;if(key in this.system.specials)return this.system.specials[key].value;return this.system.effective[key]??0;}
  getRollData(){return {...super.getRollData(),...this.system.effective,first:this.system.specials.first.value,second:this.system.specials.second.value,metabolism:this.system.metabolism};}
  attributeLabel(key) {return (key?.startsWith("special:")?this.items.get(key.slice(8))?.name:null)||this.system.specials[key]?.name||localize("Attributes."+key);}
  async rollAttribute(key,options={}) {return exclusive(this,async()=>{
    options={...options,modifier:Number(options.modifier)||0};
    if(options.bargaining&&key==="persuasion"&&this.items.some(i=>i.system.automation==="bargaining"&&i.system.equipped&&!i.system.broken))options.modifier+=10;
    if(options.exploration&&this.system.region==="shurima")options.modifier+=10;
    if(options.otherSpecies&&this.system.species==="minotaur"&&["charisma","persuasion"].includes(key))options.modifier-=20;
    const result=await test(this,key,options);
    if(options.otherSpecies&&this.system.species==="minotaur"&&["charisma","persuasion"].includes(key)&&!R.success(result.result))await chat(this,localize("Species.minotaur"),`<p>${localize("Messages.intimidationBonus")}</p>`);
    return result;
  });}
  async modifyTokenAttribute(attribute,value,isDelta=false,isBar=true) {
    if(attribute==="health") {const delta=isDelta?value:value-this.system.health.value;return delta<0?this.applyDamage(-delta,{type:"neutral",zone:"area"}):this.heal(delta);}
    return super.modifyTokenAttribute(attribute,value,isDelta,isBar);
  }
  async equip(item) {
    editable(this);return exclusive(this,async()=>{
      const equip=!item.system.equipped;
      if(equip&&item.type==="equipment") for(const other of this.items.filter(i=>i.id!==item.id&&i.type==="equipment"&&i.system.equipped&&i.system.slot===item.system.slot)) await other.update({"system.equipped":false});
      await item.update({"system.equipped":equip});
    });
  }
  async applyDamage(amount,options={}) {
    return this.applyAttack([{amount,...options}],options);
  }
  async applyAttack(components,options={}) {
    if(!Array.isArray(components)||components.some(c=>!Number.isFinite(Number(c.amount))||!Number.isFinite(Number(c.penetration||0))||!Number.isFinite(Number(c.attenuation||0))))throw new Error(localize("Errors.components"));
    editable(this);return exclusive(this,async()=>{
      const snapshot={hp:foundry.utils.deepClone(this.system._source.hp),armor:foundry.utils.deepClone(this.system._source.armor),magicResistance:foundry.utils.deepClone(this.system._source.magicResistance),integrity:foundry.utils.deepClone(this.system._source.integrity),items:this.items.map(i=>({_id:i.id,integrity:foundry.utils.deepClone(i.system.integrity),broken:i.system.broken,rarity:i.system.rarity,originalRarity:i.system.originalRarity,enchantmentState:i.system.enchantmentState})),effects:this.effects.map(e=>e.id),effectFlags:this.effects.map(e=>({_id:e.id,flags:foundry.utils.deepClone(e.flags)}))};
      const results=[],deferredComponents=[];
      for(const component of components){
      const s=this.system;
      let {amount,type="physical",penetrating=false,penetration=0}=component;
      const {zone="torso",lethal=false}=options;
      const attenuation=Number(component.attenuation??options.attenuation??0);
      amount=Math.max(0,Number(amount)-Number(attenuation)); const brut=type==="brut",neutral=type==="neutral";
      const wards=this.effects.filter(e=>e.active);
      const invulnerable=wards.find(e=>e.getFlag("jdr-runeterra","invulnerable"));
      if(invulnerable){if(amount>0&&!invulnerable.getFlag("jdr-runeterra","regenerated"))deferredComponents.push({amount,type,penetrating,penetration});amount=0;}
      const key=type==="magic"?"magicResistance":"armor"; let absorbed=0, equipmentAbsorbed=0;
      const protectionItems=this.items.filter(i=>i.type==="equipment"&&i.system.equipped&&!i.system.broken&&!["grey","green"].includes(i.system.rarity)&&(zone==="area"||i.system.slot===zone));
      if(!brut&&!neutral&&!penetrating) {
        const racial=key==="armor"?(s.species==="minotaur"||s.subspecies==="khonlui"?5:0):(["vastaya","yordle"].includes(s.species)?5:0);
        const native=Math.min(Math.max(s[key].base,racial),setting("nativeCap"));
        let remainingPen=Math.max(0,Number(penetration));
        // PM bypasses equipment RM; native RM stays effective. PP also bypasses native ARM.
        absorbed=type==="magic"?native:Math.max(0,native-remainingPen);
        if(type!=="magic")remainingPen=Math.max(0,remainingPen-native);
        for(const item of protectionItems) {
          const value=Math.max(0,item.system[key]-remainingPen);remainingPen=Math.max(0,remainingPen-item.system[key]);
          const roll=await new Roll(R.resistanceFormula(value)).evaluate();
          const fixed=R.fixedResistance(value,item.system.rarity,setting("fixedResistance"));
          const resistance=R.absorb(value,roll.total,fixed);equipmentAbsorbed+=resistance;absorbed+=resistance;
          if(value) await roll.toMessage({speaker:ChatMessage.getSpeaker({actor:this}),flavor:`${esc(item.name)} · ${localize("Fields."+key)} (${fixed} ${localize("Fields.fixed")})`});
        }
        if(s[key].rating) {const roll=await new Roll(R.resistanceFormula(s[key].rating)).evaluate();absorbed+=R.absorb(s[key].rating,roll.total);await roll.toMessage({speaker:ChatMessage.getSpeaker({actor:this}),flavor:localize("Fields."+key)});}
        absorbed+=s[key].persistent; const ephemeral=Math.min(s[key].ephemeral,Math.max(0,amount-absorbed));absorbed+=ephemeral;
        if(ephemeral) await this.update({[`system.${key}.ephemeral`]:s[key].ephemeral-ephemeral});
      }
      if(brut)absorbed+=wards.reduce((n,e)=>n+(e.getFlag("jdr-runeterra","wardBrut")||0),0);
      if(type==="physical"&&!penetrating)absorbed+=wards.reduce((n,e)=>n+(e.getFlag("jdr-runeterra","zoneArmor")?.[zone]||0),0);
      absorbed=Math.min(amount,absorbed);
      const pools=R.damagePools({base:s.hp.base,equipment:Math.min(s.hp.equipment,s.equipmentMax),bonus:s.hp.bonus},amount-absorbed,{brut,criticalSafety:!lethal&&this.type==="character"&&setting("criticalSafety")&&!["golem","mecha"].includes(s.species)});
      const update={"system.hp.base":pools.base,"system.hp.equipment":pools.equipment,"system.hp.bonus":pools.bonus};
      await spendTemporaryHP(this,s.hp.bonus-pools.bonus);
      if(setting("integrity")&&!neutral) {
        const wear=(penetrating||brut)?amount-absorbed:protectionItems.some(i=>i.system[key]>0)?Math.min(amount,equipmentAbsorbed):amount-absorbed;
        if(zone==="area") {
          const damage=s.integrity.damage+wear;update["system.integrity.damage"]=damage;
          if(damage>=s.integrity.max&&s.integrity.max>0&&!s.integrity.collapsed){update["system.integrity.collapsed"]=true;await this.updateEmbeddedDocuments("Item",this.items.filter(i=>i.type==="equipment"&&i.system.equipped&&!i.system.broken&&!i.system.integrity.indestructible).map(i=>({_id:i.id,"system.integrity.globalDamaged":true})));}
        } else for(const item of protectionItems) if(!item.system.integrity.indestructible) {
          const remaining=Math.max(0,item.system.integrity.value-wear);
          await item.update({"system.integrity.value":remaining,"system.broken":remaining===0,...(remaining===0?{"system.originalRarity":item.system.originalRarity||item.system.rarity,"system.rarity":"grey","system.enchantmentState":"inactive"}:{})});
        }
      }
      await this.update(update);
      if(pools.coma) await this.addCondition("coma");
      if(!pools.coma&&this.type==="character"&&!["golem","mecha"].includes(s.species)&&this.system.health.value<=15&&this.system.health.value>0) await this.addCondition("coma");
      results.push({amount,absorbed,applied:amount-absorbed,pools,type});
      }
      if(deferredComponents.length){const ward=this.effects.find(e=>e.active&&e.getFlag("jdr-runeterra","invulnerable"));if(ward)await ward.setFlag("jdr-runeterra","deferredDamage",{components:deferredComponents,zone:options.zone||"torso"});}
      if(options.dodgeWear>0&&setting("integrity")){
        const wear=Number(options.dodgeWear),zone=options.zone||"torso";
        if(zone==="area")await this.update({"system.integrity.damage":this.system.integrity.damage+wear});
        else {const gear=this.items.find(i=>i.type==="equipment"&&i.system.equipped&&!i.system.broken&&i.system.slot===zone&&!i.system.integrity.indestructible);if(gear){const value=Math.max(0,gear.system.integrity.value-wear);await gear.update({"system.integrity.value":value,...(value===0?{"system.broken":true,"system.originalRarity":gear.system.originalRarity||gear.system.rarity,"system.rarity":"grey","system.enchantmentState":"inactive"}:{})});}}
      }
      const m=await chat(this,localize("Actions.damage"),results.map(r=>`<p>${r.amount} − ${r.absorbed} = <strong>${r.applied}</strong> · ${localize("Damage."+r.type)}</p>`).join("")+`<button type="button" data-rt-action="undo">${localize("Actions.undo")}</button>`,{actor:this.uuid,snapshot,after:damageState(this)});
      return {amount:results.reduce((n,r)=>n+r.amount,0),absorbed:results.reduce((n,r)=>n+r.absorbed,0),applied:results.reduce((n,r)=>n+r.applied,0),message:m,pools:results.at(-1)?.pools,components:results};
    });
  }
  async heal(amount,{mechanical=false}={}) {
    editable(this);return exclusive(this,async()=>{
      if(["golem","mecha"].includes(this.system.species)&&!mechanical) {ui.notifications.warn(localize("Errors.mechanical"));return;}
      const s=this.system, pools=R.healPools({base:s.hp.base,equipment:s.hp.equipment,bonus:s.hp.bonus},Math.max(0,Number(amount)),s.hp.baseMax,s.equipmentMax);
      await this.update({"system.hp.base":pools.base,"system.hp.equipment":pools.equipment});
      await chat(this,localize("Actions.heal"),`<p>+${amount} · ${localize("Fields.hp")}</p>`);
    });
  }
  async addCondition(id,{level=1,duration=0,modifications=[]}={}) {
    editable(this);if(this.system.immunities.includes(id))return;
    const existing=this.effects.find(e=>e.statuses.has(id));
    if(existing){if(level>(existing.getFlag("jdr-runeterra","level")||1))await existing.setFlag("jdr-runeterra","level",Math.min(4,Number(level)));return existing;}
    if(id==="fatigue"&&!duration)duration=43200;
    const modifiers=id==="fatigue"?{force:-5,concentration:-5,reflexes:-10,endurance:-10}:id==="sickness"?Object.fromEntries(R.ATTRIBUTES.map(k=>[k,-5])):{};
    const changes=Object.entries(modifiers).map(([key,value])=>({key:`system.attributes.${key}.bonus`,mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:String(value)}));
    await this.createEmbeddedDocuments("ActiveEffect",[{name:localize("Conditions."+id),img:`systems/jdr-runeterra/assets/icons/${["bleeding","poison","burn"].includes(id)?"damage":"condition"}.svg`,statuses:[id],changes:[...changes,...modifications],duration:{value:duration||null,units:"seconds",expiry:duration?"runeterra":null},start:{time:game.time.worldTime},flags:{"jdr-runeterra":{level:Math.min(4,Math.max(1,Number(level))),lost:0,elapsed:0}}}]);
  }
  async rest(comfortable=true,hours=8) {
    if(hours<6) {await this.update({"system.survival.fatigued":true,"system.survival.fatigueUntil":game.time.worldTime+43200});return;}
    await this.heal(comfortable?10:5);
    await this.update({"system.survival.fatigued":false,"system.survival.fatigueUntil":0});
  }
}
export class RuneterraItem extends Item {
  async use(options={}) {
    if(!this.actor){ui.notifications.info(localize("Errors.ownedItem"));return;}
    editable(this.actor);return exclusive(this.actor,()=>this._use(options));
  }
  async _use({alternate=false,modifier=0,distance=0,moving=false,magic=false,practiceLevel,guildMission=false,variant="",componentValues={},precise=false,contextConfirmed=false}={}) {
      const a=this.actor,s=attackProfile(this.system,variant);
      if(["weapon","ability"].includes(this.type)){
        if(!validComponents(s.components))throw new Error(localize("Errors.components"));
        for(const [i,c] of s.components.entries())if(c.min!==undefined&&(componentValues[i]===undefined||Number(componentValues[i])<c.min||Number(componentValues[i])>c.max))throw new Error(localize("Errors.rangeChoice"));
        for(const [i,c] of s.components.entries())if(!Roll.validate(String(componentValues[i]??c.formula)))throw new Error(localize("Errors.components"));
      }
      if(s.broken||s.quantity===0||s.remainingCooldown>0) {ui.notifications.warn(localize("Errors.unavailable"));return;}
      if(s.uses.limited&&s.uses.value<=0) {ui.notifications.warn(localize("Errors.empty"));return;}
      if(s.abilityKind==="ultimate"&&a.system.ultimate<=0) {ui.notifications.warn(localize("Errors.ultimate"));return;}
      if(s.conditions&&variant&&!contextConfirmed){ui.notifications.warn(localize("Errors.conditions"));return;}
      if(s.mode==="ritual")return activateRelic(this,{ritual:true});
      if(s.automation==="anivia")return activateRelic(this);
      if(s.automation==="bargaining")return test(a,"persuasion",{modifier:Number(modifier)+(s.equipped?10:0),label:this.name});
      if(this.type==="rune") return this.useRune(s);
      if(s.kitKind)return useKit(this);
      if(this.type==="consumable") return this.consume();
      if(this.type==="book") {
        const result=await test(a,"concentration",{modifier,label:this.name});
        if(R.success(result.result)) {
          const previous=s.progress;await this.update({"system.progress":previous+1});
          for(const milestone of s.milestones.filter(m=>m.hours>previous&&m.hours<=this.system.progress))await chat(a,this.name,`<p><strong>${milestone.hours} h</strong> · ${esc(milestone.text)}</p>`);
        }
        await chat(a,this.name,`<p>${localize("Fields.progress")}: ${this.system.progress} h</p>${s.description}`);return result;
      }
      let attribute=alternate?s.alternateAttribute:s.attribute;
      if(this.type==="weapon") attribute=precise&&s.mode==="melee"?"dexterity":magic||s.mode==="magic"?"concentration":s.mode==="ranged"?(moving?"concentration":"perception"):s.attribute;
      if(this.type==="weapon"&&!magic&&a.system.species==="halfTroll"&&a.system.subspecies==="ice"&&/arc/i.test(s.weaponType||this.name))attribute="perception";
      const threshold=this.type==="special"?s.value:this.type==="profession"?Math.min(100,s.value+20*Math.max(0,s.level-(Number(practiceLevel)||s.level))):undefined;
      const penalty=this.type==="weapon"&&s.mode==="ranged" ? Math.floor(distance/100)*5 : 0;
      const result=await test(a,attribute,{target:threshold,modifier:modifier-penalty,label:this.name,profession:this.type==="profession",quiet:true});
      const update={};
      if(this.type==="profession"&&setting("professions")) {
        const n=R.professionProgress(this.system.toObject(),result.result,result.die,s.guild&&guildMission);
        for(const k of ["level","xp","practice","streak","value"]) update["system."+k]=n[k];
      }
      if(this.type==="ability"&&s.abilityKind==="skill"&&setting("progression")) {
        const n=R.skillProgress(s.level,s.xp,result.result,a.items.filter(i=>i.type==="ability"&&i.id!==this.id&&i.system.abilityKind==="skill").map(i=>i.system.level));
        update["system.level"]=n.level;update["system.xp"]=n.xp;
        if(n.advanced) ui.notifications.info(localize("Messages.levelUp"));
      }
      if(s.uses.limited) update["system.uses.value"]=s.uses.value-1;
      if(s.cooldown) update["system.remainingCooldown"]=s.cooldown;
      if(s.abilityKind==="ultimate")await a.update({"system.ultimate":a.system.ultimate-1});
      if(Object.keys(update).length) await this.update(update);
      const melee=this.type==="weapon"&&s.mode==="melee"&&!magic;
      const hit=melee?result.result!=="criticalFailure":R.success(result.result);
      if(s.singleUse)await this.update({"system.quantity":Math.max(0,s.quantity-1)});
      const description=alternate&&s.alternateDescription?s.alternateDescription:s.description;
      const rolls=[result.roll];
      const healing=hit&&s.healFormula!=="0"?await new Roll(s.healFormula,a.getRollData()).evaluate():null;
      const targetHealing=s.targetMode==="targets"?(healing?.total||0):0;
      if(healing)rolls.push(healing);
      let content=`<p class="rt-test-result rt-result-${result.result}">${esc(a.attributeLabel(attribute))} · ${result.value}% — <strong>${localize("Results."+result.result)}</strong></p>${await result.roll.render()}`;
      if(result.die!==result.roll.total)content+=`<p>${result.roll.total} → ${result.die}</p>`;
      if(this.type==="weapon"||this.type==="ability"&&(s.damageFormula!=="0"||s.dot.level>0))content+=`<p class="rt-attack-status">${localize(melee&&result.result==="failure"?"Messages.meleeFailure":hit?"Messages.attackHit":"Messages.attackMiss")}</p>`;
      content+=`<details class="rt-chat-description"><summary>${localize("Fields.description")}</summary>${description}</details>`;
      if(healing)content+=`<p>${localize("Actions.heal")} : <strong>+${healing.total}</strong> ${localize("Fields.hp")}</p>`;
      if(hit&&s.components.some(c=>c.formula!=="0")&&["weapon","ability"].includes(this.type)) {
        const forceBonus=melee&&attribute==="force"&&R.success(result.result)?result.result==="criticalSuccess"?10:5:0;
        if(!validComponents(s.components))throw new Error(localize("Errors.components"));
        const damages=[];let forceApplied=false;
        for(const [index,c] of s.components.entries()){
          const chosen=componentValues[index];
          if(c.min!==undefined&&(chosen===undefined||Number(chosen)<c.min||Number(chosen)>c.max))throw new Error(localize("Errors.rangeChoice"));
          const bonus=!forceApplied&&c.type==="physical"?forceBonus:0;
          if(c.type==="physical")forceApplied=true;
          const damage=await new Roll("("+(chosen===undefined?c.formula:String(Number(chosen)))+")+"+bonus,{...a.getRollData(),level:s.level}).evaluate();
          rolls.push(damage);damages.push({...c,amount:damage.total});
          content+=`<p class="rt-damage-total"><strong>${damage.total}</strong> ${localize("Damage."+c.type)}</p><details><summary>${localize("Fields.damageFormula")}</summary>${await damage.render()}</details>`;
        }
        content+=`<button type="button" data-rt-action="damage">${localize("Actions.applyTarget")}</button>`;
        await chat(a,this.name,content,{damage:damages.reduce((n,c)=>n+c.amount,0),type:s.damageType,components:damages,zone:s.zone,precise:precise&&R.success(result.result)&&attribute==="dexterity",penetrating:s.penetrating,penetration:s.penetration,associatedEffects:s.associatedEffects,source:a.uuid,dot:foundry.utils.deepClone(s.dot),duration:s.duration,modifications:s.targetMode==="targets"?s.modifications:[],heal:targetHealing},rolls);
      }else if(hit&&(targetHealing>0||s.dot.level>0||s.associatedEffects?.length||s.targetMode==="targets"&&(s.modifications?.length||0)))await chat(a,this.name,content+`<button type="button" data-rt-action="${targetHealing>0?"heal":"effect"}">${localize("Actions.applyTarget")}</button>`,{associatedEffects:s.associatedEffects,dot:foundry.utils.deepClone(s.dot),duration:s.duration,modifications:s.targetMode==="targets"?s.modifications:[],source:a.uuid,heal:targetHealing},rolls);
      else await chat(a,this.name,content,{},rolls);
      if(healing&&s.targetMode!=="targets") {
        if(["golem","mecha"].includes(a.system.species))ui.notifications.warn(localize("Errors.mechanical"));
        else {const n=R.healPools({base:a.system.hp.base,equipment:a.system.hp.equipment,bonus:a.system.hp.bonus},Math.max(0,healing.total),a.system.hp.baseMax,a.system.equipmentMax);await a.update({"system.hp.base":n.base,"system.hp.equipment":n.equipment});}
      }
      if(hit&&(s.modifications?.length||0)&&s.targetMode!=="targets") await this.applyModifications();
      return result;
  }
  async useRune(s=this.system) {
    const roll=await new Roll("1d100").evaluate();
    const n=R.runeResult(roll.total,s.level);
    await roll.toMessage({speaker:ChatMessage.getSpeaker({actor:this.actor}),flavor:esc(this.name)});
    if(s.level!==4)await this.update({"system.broken":n.broken,"system.uses.value":0,"system.uses.limited":true});
    let content=`${s.description}<p>${localize(n.broken?"Messages.runeBroken":"Messages.runeRecharge")}</p>`;
    // Power/efficiency of the reverse D100 is not quantified in the rules. The
    // printed, defined formula is offered to the GM even when the stone breaks.
    if(s.components.length&&s.components.some(c=>c.formula!=="0")){
      const components=[];
      for(const c of s.components){const damage=await new Roll(c.formula).evaluate();components.push({...c,amount:damage.total});await damage.toMessage({speaker:ChatMessage.getSpeaker({actor:this.actor}),flavor:this.name});}
      content+=`<button type="button" data-rt-action="damage">${localize("Actions.applyTarget")}</button>`;
      await chat(this.actor,this.name,content,{components,damage:components.reduce((n,c)=>n+c.amount,0),zone:s.zone,associatedEffects:s.associatedEffects,dot:foundry.utils.deepClone(s.dot),source:this.actor.uuid,duration:s.duration});
    }else await chat(this.actor,this.name,content);
    return n;
  }
  async consume() {
    const a=this.actor,s=this.system;
    if(R.foodExpired(s,game.time.worldTime)) {ui.notifications.warn(localize("Errors.spoiled"));return;}
    const potion=await applyPotion(this);if(potion.cancel)return;
    let hp=potion.hp||0;
    if(s.food) {
      const affinities=foundry.utils.deepClone(a.system.affinities),key=s.reference||this.name;
      let affinity=affinities[key];
      if(!affinity) {const roll=await new Roll("1d100").evaluate();affinity=R.foodResult(roll.total);affinities[key]=affinity;hp+=affinity.hp;await roll.toMessage({speaker:ChatMessage.getSpeaker({actor:a}),flavor:localize("Actions.taste")});await a.update({"system.affinities":affinities});}
      else hp+=affinity.affinity==="loved"?5:affinity.affinity==="allergy"?-10:0;
      if(affinity.sick)await a.addCondition("sickness",{duration:86400});
      await a.update({"system.survival.hungry":false,"system.survival.hungerHours":0,"system.survival.daysWithoutMeal":0,"system.survival.mealElapsed":0,"system.survival.depletionHours":0,"system.survival.activeSeconds":0});
    }
    if(s.hydration>0)await a.update({"system.survival.waterLitres":a.system.survival.waterLitres+s.hydration,"system.survival.hydrated":a.system.survival.waterLitres+s.hydration>=(a.system.survival.waterReduced?0.5:1)});
    if(!potion.handled&&s.healFormula!=="0") hp+=(await new Roll(s.healFormula).evaluate()).total;
    // Do not nest the actor queue: use direct pool updates inside this item's transaction.
    if(hp>0&&!["golem","mecha"].includes(a.system.species)) {
      const n=R.healPools({base:a.system.hp.base,equipment:a.system.hp.equipment,bonus:a.system.hp.bonus},hp,a.system.hp.baseMax,a.system.equipmentMax);
      await a.update({"system.hp.base":n.base,"system.hp.equipment":n.equipment});
    }else if(hp<0) {
      const n=R.damagePools({base:a.system.hp.base,equipment:a.system.hp.equipment,bonus:a.system.hp.bonus},-hp,{criticalSafety:a.type==="character"&&setting("criticalSafety")&&!["golem","mecha"].includes(a.system.species)});
      await spendTemporaryHP(a,a.system.hp.bonus-n.bonus);
      await a.update({"system.hp.base":n.base,"system.hp.equipment":n.equipment,"system.hp.bonus":n.bonus});if(n.coma)await a.addCondition("coma");
    }
    await this.applyModifications();
    await this.update({"system.quantity":Math.max(0,s.quantity-1)});
    await chat(a,this.name,`${s.description}<p>${hp>=0?"+":""}${hp} ${localize("Fields.hp")}</p>`);
  }
  async applyModifications() {
    const s=this.system,changes=s.modifications.filter(m=>R.ATTRIBUTES.includes(m.attribute)&&Number.isFinite(Number(m.value))).map(m=>({key:`system.attributes.${m.attribute}.bonus`,mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:String(m.value)}));
    if(changes.length)await this.actor.createEmbeddedDocuments("ActiveEffect",[{name:this.name,img:this.img,changes,duration:{value:s.duration||null,units:"seconds",expiry:s.duration?"runeterra":null},start:{time:game.time.worldTime},flags:{"jdr-runeterra":{source:this.uuid}}}]);
  }
  async repair(loss=0) {
    editable(this);const s=this.system,max=Math.max(0,s.integrity.max-Math.max(0,Number(loss)));
    if(!game.user.isGM&&loss>0)throw new Error(localize("Errors.permission"));
    await this.update({"system.integrity.globalDamaged":false,"system.broken":false,"system.worn":false,"system.rarity":(s.originalRarity&&s.originalRarity!=="grey"?s.originalRarity:s.rarity==="grey"?"green":s.rarity),"system.enchantmentState":s.enchantmentState==="lost"?"lost":"active","system.integrity.loss":s.integrity.loss+Math.max(0,Number(loss)),"system.integrity.max":max,"system.integrity.value":max});
    if(this.actor)await this.actor.update({"system.integrity.damage":Math.max(0,this.actor.system.integrity.damage-max),"system.integrity.collapsed":this.actor.system.integrity.damage>max});
  }
}
