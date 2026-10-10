import {applyInjury} from "./injuries.mjs";
import {attackProfile,validComponents} from "./attack-data.mjs";
import {grantBookReward,validateRepresentative,applyEnchantment,activatePower} from "./play.mjs";
import {ATTRIBUTES,SLOTS,creationIssues,creationBudget,itemIntegrity,dodgeResult} from "./rules.mjs";
import {localize as L,esc,test,chat} from "./documents.mjs";
const {HandlebarsApplicationMixin,DialogV2}=foundry.applications.api;
export async function input(title,fields) {
  return DialogV2.input({window:{title:L(title)},content:`<div class="rt-dialog">${fields}</div>`,ok:{label:L("Actions.confirm")},rejectClose:false});
}
const number=(name,value,label,min=0)=>`<label>${L(label)}<input type="number" name="${name}" value="${value}" min="${min}" step="any"></label>`;
const select=(name,values,label,selected)=>`<label>${L(({Damage:"Fields.damageType",Slots:"Fields.slot",Types:"Fields.itemType",Conditions:"Fields.conditions",Specials:"Fields.specials",Care:"Actions.bandage",NpcRarity:"Fields.rarity",Modes:"Fields.mode",Injuries:"Actions.injury"})[label]||label)}<select name="${name}">${values.map(v=>`<option value="${v}" ${v===selected?"selected":""}>${L(label+"."+v)}</option>`).join("")}</select></label>`;
export async function damageDialog(actor,defaults={}) {
  if(defaults.components?.length===1){const c=defaults.components[0];defaults={...defaults,amount:c.amount,type:c.type,penetration:c.penetration,penetrating:c.penetrating};}
  if(defaults.components?.length>1){
    const fd=await input("Actions.damage",select("zone",["area",...SLOTS],"Slots",defaults.zone||"torso")+defaults.components.map((c,i)=>number("amount"+i,c.amount,"Damage."+c.type)+number("attenuation"+i,i===0?(defaults.attenuation||0):0,"Fields.attenuation")+number("penetration"+i,c.penetration||0,"Fields.penetration")).join("")+(defaults.precise&&actor.system.armorTotal>5?`<label><input type="checkbox" name="precise">${L("Fields.preciseArmor")}</label>`:"") );
    if(!fd)return;
    return actor.applyAttack(defaults.components.map((c,i)=>({...c,amount:Number(fd["amount"+i]),attenuation:Number(fd["attenuation"+i]),penetration:Number(fd["penetration"+i])+(fd.precise&&c.type==="physical"?5:0)})),{zone:fd.zone});
  }
  const fd=await input("Actions.damage",number("amount",defaults.amount??10,"Fields.amount")+select("type",["physical","magic","brut","neutral"],"Damage",defaults.type||"physical")+select("zone",["area",...SLOTS],"Slots",defaults.zone||"torso")+number("penetration",defaults.penetration||0,"Fields.penetration")+number("attenuation",defaults.attenuation||0,"Fields.attenuation")+`<label><input type="checkbox" name="penetrating" ${defaults.penetrating?"checked":""}>${L("Fields.penetrating")}</label>`+(defaults.precise&&actor.system.armorTotal>5?`<label><input type="checkbox" name="precise">${L("Fields.preciseArmor")}</label>`:""));
  if(fd) return actor.applyDamage(fd.amount,{...fd,penetration:Number(fd.penetration)+(fd.precise&&fd.type==="physical"?5:0)});
}
export class RuneterraActorSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS={
    classes:["runeterra","rt-actor"],position:{width:940,height:850},window:{resizable:true},
    form:{submitOnChange:true,closeOnSubmit:false},actions:{
      injury:this.onInjury,solicit:this.onSolicit,stopSolicit:this.onStopSolicit,rtTab: this.onTab,roll:this.onRoll,use:this.onUse,equip:this.onEquip,editItem:this.onEditItem,
      addItem:this.onAddItem,deleteItem:this.onDeleteItem,damage:this.onDamage,heal:this.onHeal,rest:this.onRest,
      validate:this.onValidate,effect:this.onEffect,editEffect:this.onEditEffect,removeEffect:this.onRemoveEffect,dodge:this.onDodge,
      repair:this.onRepair,openCompanion:this.onCompanion,addCompanion:this.onAddCompanion,advance:this.onAdvance,care:this.onCare,counterfeit:this.onCounterfeit
    }
  };
  static PARTS={main:{template:"systems/jdr-runeterra/templates/actor.hbs",scrollable:[".rt-body"]}};
  _tab="attributes";
  async _onChangeForm(formConfig,event) {
    if(this.actor.type==="character"&&event.target.name==="system.permanentMalus"&&!this.actor.system.validated) {
      const selected=event.target.value,previous=this._draftPermanent||this.actor.system.permanentMalus;
      if(selected!==previous&&ATTRIBUTES.includes(selected)) {
        const oldBase=this.form.elements.namedItem(`system.attributes.${previous}.base`),newBase=this.form.elements.namedItem(`system.attributes.${selected}.base`);
        oldBase.value=newBase.value;newBase.value=10;this._draftPermanent=selected;
        const preview=this.actor.clone(super._processFormData(event,this.form,new FormDataExtended(this.form)),{keepId:true});
        for(const key of ATTRIBUTES) {
          const card=this.element.querySelector(`[data-attribute="${key}"]`).closest(".rt-attribute"),locked=key===selected;
          card.classList.toggle("rt-permanent",locked);
          for(const input of card.querySelectorAll("input"))input.readOnly=locked;
          card.querySelector(".fa-lock")?.remove();
          if(locked){const icon=document.createElement("i");icon.className="fas fa-lock";card.querySelector("button span").append(" ",icon);}
          const strong=card.querySelector("button strong");strong.firstChild.textContent=String(preview.system.effective[key]);
        }
      }
      return;
    }
    // Characters save a complete allocation so the unique 80 and 10 can be moved together.
    if(this.actor.type==="character")return;
    return super._onChangeForm(formConfig,event);
  }
  _processFormData(event,form,formData) {
    const data=super._processFormData(event,form,formData);
    if(this.actor.type==="character") {
      const permanent=data.system?.permanentMalus||this.actor.system.permanentMalus;
      if(ATTRIBUTES.includes(permanent)&&data.system?.attributes?.[permanent])data.system.attributes[permanent].base=10;
    }
    if(this.actor.type==="character"&&!this.actor.system.validated) {
      const candidate=foundry.utils.mergeObject(this.actor.toObject().system,data.system||{},{inplace:false});
      const issues=creationIssues(candidate).filter(k=>["maximum","malus","range"].includes(k));
      if(issues.length)throw new Error(issues.map(k=>L("Creation."+k)).join(" · "));
    }
    return data;
  }
  async _prepareContext(options) {
    if(!this._initialTab){this._tab=this.actor.type==="creature"?"biography":"attributes";this._initialTab=true;}
    const context=await super._prepareContext(options),s=this.actor.system;
    const attributes=ATTRIBUTES.map(k=>({key:k,label:L("Attributes."+k),base:k===s.permanentMalus?10:s.attributes[k].base,bonus:s.attributes[k].bonus,value:s.effective[k],permanent:k===s.permanentMalus}));
    const groups=["ability","special","profession","weapon","equipment","consumable","rune","relic","resource","book","enchantment","affiliation"].map(type=>({type,label:L("Types."+type),items:this.actor.items.filter(i=>i.type===type).map(i=>({id:i.id,name:i.name,img:i.img,type:i.type,isSpecial:i.type==="special",s:i.system,level:i.system.level===4?"L":i.system.level}))})).filter(g=>g.items.length);
    const description=await foundry.applications.ux.TextEditor.enrichHTML(s.biography,{secrets:this.actor.isOwner,relativeTo:this.actor});
    const issues=s.validated?[]:creationIssues(s);
    const companions=await Promise.all(s.companions.map(async uuid=>{const d=await fromUuid(uuid);return d?{uuid,name:d.name,img:d.img}:null;}));
    return {...context,actor:this.actor,s,attributes,groups,description,tab:this._tab,isCharacter:this.actor.type==="character",isCreature:this.actor.type==="creature",isGM:game.user.isGM,
      issues:issues.map(k=>L("Creation."+k)),points:creationBudget(s),
      specials:Object.entries(s.specials).map(([key,v])=>({key,...v})),effects:this.actor.effects.map(e=>({id:e.id,name:e.name,img:e.img,disabled:e.disabled})),
      tabs:["attributes","abilities","inventory","survival","biography"].map(key=>({key,label:L("Tabs."+(key==="biography"&&this.actor.type==="creature"?"profile":key)),active:key===this._tab})),
      species:["human","vastaya","yordle","chirean","marean","minotaur","halfTroll","golem","mecha"].map(key=>({key,label:L("Species."+key),selected:key===s.species})),
      regions:["","freljord","demacia","noxus","piltover","zaun","shurima","ionia","bilgewater","ixtal","targon","shadowIsles","camavor","bandle"].map(key=>({key,label:key?L("Regions."+key):L("Fields.region"),selected:key===s.region})),
      subspecies:( {human:["","halfVastaya","bornMage","altered"],vastaya:["","binkehri","bryni","kiilash","khonlui","lhotlan","marai","mohkura","nirask","ondrashi","oovikat","ophelis","ottrani","shimon","strig","vesani","hybrid","altered"],yordle:["","common","civilized","prehistoric","altered"],halfTroll:["","sand","ice","altered"]}[s.species]||["","altered"]).map(key=>({key,label:key?L("Subspecies."+key):L("Fields.subspecies"),selected:key===s.subspecies})),
      companions:companions.filter(Boolean)};
  }
  async _onRender(context,options) {
    await super._onRender(context,options);
    this._draftPermanent=this.actor.system.permanentMalus;
    for(const el of this.element.querySelectorAll("[data-rt-tab]"))el.hidden=el.dataset.rtTab!==this._tab;
    if(!this.isEditable){for(const el of this.element.querySelectorAll("input,select,textarea,button[data-owner]"))el.disabled=true;for(const el of this.element.querySelectorAll("prose-mirror"))el.setAttribute("readonly","");}
  }
  static async onSolicit(){if(game.user.isGM)await game.settings.set("jdr-runeterra","solicitedActor",this.actor.uuid);}
  static async onStopSolicit(){if(game.user.isGM)await game.settings.set("jdr-runeterra","solicitedActor","");}
  static async onInjury(){const fd=await input("Actions.injury",select("part",["finger","leg"],"Injuries","finger")+`<label><input type="checkbox" name="temporary">${L("Fields.temporary")}</label><label><input type="checkbox" name="prosthesis">${L("Fields.prosthesis")}</label>`+number("seconds",0,"Fields.duration")+number("compensation",0,"Fields.compensation"));if(fd)await applyInjury(this.actor,fd);}
  static onTab(event,target){this._tab=target.dataset.tab;for(const el of this.element.querySelectorAll("[data-rt-tab]"))el.hidden=el.dataset.rtTab!==this._tab;for(const el of this.element.querySelectorAll('[data-action="rtTab"]'))el.classList.toggle("active",el.dataset.tab===this._tab);}
  static async onRoll(event,target){
    const rewards=this.actor.effects.filter(e=>e.active&&e.getFlag("jdr-runeterra","contextReward"));
    const rewardField=rewards.length?`<label>${L("Fields.contextReward")}<select name="contextReward"><option value=""></option>${rewards.map(e=>`<option value="${e.id}">${esc(e.name)} : ${esc(e.getFlag("jdr-runeterra","contextReward").condition)}</option>`).join("")}</select></label>`:"";
    const fd=await input("Actions.roll",rewardField+number("modifier",0,"Fields.modifier",-100)+`<label><input type="checkbox" name="bargaining">${L("Fields.bargaining")}</label><label><input type="checkbox" name="exploration">${L("Fields.exploration")}</label><label><input type="checkbox" name="otherSpecies">${L("Fields.otherSpecies")}</label>`);if(fd)await this.actor.rollAttribute(target.dataset.attribute,fd);
  }
  static async onUse(event,target){
    const item=this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    await useDialog(item);
  }

  static onEditItem(event,target){this.actor.items.get(target.closest("[data-item-id]").dataset.itemId)?.sheet.render({force:true});}
  static async onEquip(event,target){await this.actor.equip(this.actor.items.get(target.closest("[data-item-id]").dataset.itemId));}
  static async onAddItem(){
    const fd=await input("Actions.addItem",select("type",["ability","special","profession","weapon","equipment","consumable","rune","relic","resource","book","enchantment","affiliation"],"Types","ability")+`<label>${L("Fields.name")}<input type="text" name="name" required></label>`);
    if(fd){const [i]=await this.actor.createEmbeddedDocuments("Item",[{name:fd.name||L("Types."+fd.type),type:fd.type,img:"systems/jdr-runeterra/assets/icons/"+(["ability","profession","enchantment"].includes(fd.type)?"magic":"item")+".svg",system:{acquired:game.time.worldTime}}]);i.sheet.render({force:true});}
  }
  static async onDeleteItem(event,target){
    const item=this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    const yes=await DialogV2.confirm({window:{title:L("Actions.delete")},content:`<p>${esc(item.name)}</p>`,rejectClose:false});
    if(yes){if(item.system.equipped)await this.actor.equip(item);await item.delete();}
  }
  static async onDamage(){await damageDialog(this.actor);}
  static async onHeal(){const fd=await input("Actions.heal",number("amount",10,"Fields.amount")+`<label><input type="checkbox" name="mechanical">${L("Fields.mechanical")}</label>`);if(fd)await this.actor.heal(fd.amount,fd);}
  static async onRest(){const fd=await input("Actions.rest",number("hours",8,"Fields.hours")+`<label><input type="checkbox" name="comfortable" checked>${L("Fields.comfortable")}</label>`);if(fd)await this.actor.rest(fd.comfortable,fd.hours);}
  static async onValidate(event){
    if(this.actor.system.validated)return;
    let data;try{data=this._processFormData(event,this.form,new FormDataExtended(this.form));}catch(error){ui.notifications.warn(error.message);return;}
    const candidate=foundry.utils.mergeObject(this.actor.toObject().system,data.system||{},{inplace:false});
    const issues=creationIssues(candidate);
    if(issues.length){ui.notifications.warn(issues.map(k=>L("Creation."+k)).join(" · "));return;}
    data.system.validated=true;await this.actor.update(data);ui.notifications.info(L("Creation.validated"));
  }
  static async onEffect(){
    const fd=await input("Actions.condition",select("id",["bleeding","poison","burn","coma","unconscious","fatigue","sickness","fear","charmed","blind","restrained","paralyzed","curse","fracture","amputation","blessing","regeneration","frenzy","trauma"],"Conditions","bleeding")+number("level",1,"Fields.level")+number("duration",0,"Fields.duration"));
    if(fd)await this.actor.addCondition(fd.id,fd);
  }
  static async onRemoveEffect(event,target){
    const effect=this.actor.effects.get(target.dataset.effectId);
    if(effect.statuses.has("coma")) {
      const fd=await input("Actions.wake",select("special",["first","second"],"Specials","first"));
      if(!fd)return;
      await this.actor.update({[`system.specials.${fd.special}.value`]:Math.max(0,this.actor.system.specials[fd.special].value-10),"system.survival.fatigued":true,"system.survival.fatigueUntil":game.time.worldTime+43200});
    }
    if(effect.statuses.has("unconscious"))await this.actor.update({"system.survival.fatigued":true,"system.survival.fatigueUntil":game.time.worldTime+43200});
    await effect.delete();
  }
  static onEditEffect(event,target){this.actor.effects.get(target.dataset.effectId)?.sheet.render({force:true});}
  static async onDodge(){
    const incoming=game.messages.filter(m=>m.flags["jdr-runeterra"]?.components?.length||m.flags["jdr-runeterra"]?.damage>0).slice(-12);
    const fd=await input("Actions.dodge",`<label>${L("Fields.incoming")}<select name="incoming"><option value=""></option>${incoming.map(m=>`<option value="${m.id}">${esc(m.speaker.alias)} ? ${m.flags["jdr-runeterra"].damage}</option>`).join("")}</select></label><label><input type="checkbox" name="surprise">${L("Fields.surprise")}</label>`+number("modifier",0,"Fields.modifier",-100));
    if(!fd)return;
    const result=await this.actor.rollAttribute(fd.surprise?"reflexes":"agility",fd),d=dodgeResult(result.die,result.value);
    let wear=0,attenuation=0;
    if(d.close||d.attenuated){const decision=await input("Actions.dodge",d.close?number("wear",5,"Fields.dodgeWear",5):number("attenuation",0,"Fields.attenuation"));if(!decision)return;wear=d.close?Math.max(5,Math.min(20,Number(decision.wear))):0;attenuation=Number(decision.attenuation)||0;}
    const message=game.messages.get(fd.incoming);
    if(message){if(!game.user.isGM&&!message.isOwner){ui.notifications.warn(L("Errors.gmDecision"));return;}await message.setFlag("jdr-runeterra","dodges",{...(message.getFlag("jdr-runeterra","dodges")||{}),[this.actor.uuid]:{avoided:d.avoided,wear,attenuation,result:d.result}});}
    await chat(this.actor,L("Actions.dodge"),`<p>${L(d.close?"Messages.closeDodge":d.attenuated?"Messages.partialDodge":d.avoided?"Messages.dodged":"Messages.hit")}</p>`,{incoming:message?.uuid,dodge:d,wear,attenuation});
  }
  static async onRepair(event,target){
    const fd=await input("Actions.repair",number("loss",5,"Fields.repairLoss"));if(fd)await this.actor.items.get(target.closest("[data-item-id]").dataset.itemId).repair(fd.loss);
  }
  static async onCompanion(event,target){const a=await fromUuid(target.dataset.uuid);a?.sheet.render({force:true});}
  static async onAddCompanion(){
    const fd=await input("Actions.companion",`<label>${L("Fields.companion")}<select name="uuid">${game.actors.filter(a=>a.id!==this.actor.id).map(a=>`<option value="${a.uuid}">${esc(a.name)}</option>`).join("")}</select></label>`);
    if(fd&&fd.uuid&&!this.actor.system.companions.includes(fd.uuid))await this.actor.update({"system.companions":[...this.actor.system.companions,fd.uuid]});
  }
  static async onAdvance(){if(!game.user.isGM)return;const fd=await input("Actions.advance",number("minutes",5,"Fields.minutes"));if(fd)await game.runeterra.advanceTime(fd.minutes);}
  static async onCare(){const fd=await input("Actions.bandage",select("method",["bandage","cauterize"],"Care","bandage")+number("tier",1,"Fields.level",1)+number("amount",0,"Fields.careAmount"));if(fd)await game.runeterra.care(this.actor,fd);}
  static async onCounterfeit(){const fd=await input("Actions.counterfeit",number("amount",1,"Fields.amount",1)+select("rarity",["common","specific","rare","legendary"],"NpcRarity","common"));if(fd)await game.runeterra.counterfeit(this.actor,fd);}
}
export class RuneterraItemSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {
  static DEFAULT_OPTIONS={classes:["runeterra","rt-item"],position:{width:760,height:820},window:{resizable:true},form:{submitOnChange:true,closeOnSubmit:false},actions:{power:this.onPower,reward:this.onReward,representative:this.onRepresentative,enchant:this.onEnchant,attacks:this.onAttacks,use:this.onUse,integrity:this.onIntegrity,modifiers:this.onModifiers,recharge:this.onRecharge,purchase:this.onPurchase,craft:this.onCraft}};
  static PARTS={main:{template:"systems/jdr-runeterra/templates/item.hbs",scrollable:[".rt-body"]}};
  async _prepareContext(options){
    const c=await super._prepareContext(options),s=this.item.system;
    return {...c,item:this.item,s,description:await foundry.applications.ux.TextEditor.enrichHTML(s.description,{secrets:this.item.isOwner,relativeTo:this.item}),isGM:game.user.isGM,isAnivia:s.automation==="anivia",isResource:this.item.type==="resource",
      kitKinds:{"":L("KitKinds.none"),care:L("KitKinds.care"),sewing:L("KitKinds.sewing"),hunting:L("KitKinds.hunting"),fishing:L("KitKinds.fishing"),cooking:L("KitKinds.cooking"),lockpicking:L("KitKinds.lockpicking"),alchemy:L("KitKinds.alchemy")},
      attackZones:Object.fromEntries(["area",...SLOTS].map(k=>[k,L("Slots."+k)])),originalRarities:{"":L("Fields.unknownQuality"),...Object.fromEntries(["grey","green","blue","red","orange","violet"].map(k=>[k,L("Rarity."+k)]))},
      enchantmentStates:{active:L("EnchantmentStates.active"),inactive:L("EnchantmentStates.inactive"),lost:L("EnchantmentStates.lost")},
      bonuses:ATTRIBUTES.map(key=>({key,label:L("Attributes."+key),value:s.bonuses[key]||0})),
      attributes:[...ATTRIBUTES,"first","second","metabolism",...(this.item.actor?.items.filter(i=>i.type==="special").map(i=>"special:"+i.id)||[])].map(key=>({key,label:this.item.actor?.attributeLabel(key)||L(key==="first"||key==="second"?"Specials."+key:"Attributes."+key),selected:s.attribute===key})),
      slots:SLOTS.map(key=>({key,label:L("Slots."+key),selected:s.slot===key})),
      rarities:["grey","green","blue","red","orange","violet"].map(key=>({key,label:L("Rarity."+key),selected:s.rarity===key})),
      types:["physical","magic","brut","neutral"].map(key=>({key,label:L("Damage."+key),selected:s.damageType===key})),
      kinds:["skill","passive","ultimate"].map(key=>({key,label:L("AbilityKinds."+key),selected:s.abilityKind===key})),
      modes:["melee","ranged","magic"].map(key=>({key,label:L("Modes."+key),selected:s.mode===key})),
      isEquipment:["equipment","relic","weapon"].includes(this.item.type),isAbility:this.item.type==="ability",isWeapon:this.item.type==="weapon",isProfession:["profession","special"].includes(this.item.type),isConsumable:this.item.type==="consumable",isRune:this.item.type==="rune",isBook:this.item.type==="book"};
  }
  static async onUse(){await useDialog(this.item);}
  static async onPower(){await activatePower(this.item);}
  static async onReward(){await grantBookReward(this.item);}
  static async onRepresentative(){await validateRepresentative(this.item);}
  static async onEnchant(){await applyEnchantment(this.item);}
  static async onAttacks(){
    const s=this.item.system,choice=await input("Actions.attacks",`<label>${L("Fields.variant")}<select name="variant"><option value="">${L("Fields.defaultAttack")}</option>${s.variants.map(v=>`<option value="${esc(v.id)}">${esc(v.label)}</option>`).join("")}<option value="new">${L("Actions.addVariant")}</option></select></label>`+number("count",s.components.length||1,"Fields.componentCount",1));
    if(!choice||choice.count<1||choice.count>12)return;
    const profile=choice.variant&&choice.variant!=="new"?attackProfile(s,choice.variant):attackProfile(s);
    const fields=`<label>${L("Fields.name")}<input name="label" value="${esc(profile.label||this.item.name)}"></label>`+select("mode",["melee","ranged","magic"],"Modes",profile.mode)+select("zone",["area",...SLOTS],"Slots",profile.zone)+`<label>${L("Fields.attribute")}<select name="attribute">${[...ATTRIBUTES,"first","second"].map(k=>`<option value="${k}" ${k===profile.attribute?"selected":""}>${esc(this.item.actor?.attributeLabel(k)||L("Attributes."+k))}</option>`).join("")}</select></label><label>${L("Fields.conditions")}<textarea name="conditions">${esc(profile.conditions||"")}</textarea></label>`+Array.from({length:Math.floor(choice.count)},(_,i)=>{const c=profile.components[i]||{formula:"0",type:"physical"};return `<fieldset><legend>${L("Fields.component")} ${i+1}</legend><label>${L("Fields.damageFormula")}<input name="formula${i}" value="${esc(c.formula)}"></label>`+select("type"+i,["physical","magic","brut","neutral"],"Damage",c.type)+number("penetration"+i,c.penetration||0,"Fields.penetration")+`<label><input type="checkbox" name="penetrating${i}" ${c.penetrating?"checked":""}>${L("Fields.penetrating")}</label><label>${L("Fields.rangeMin")}<input type="number" name="min${i}" min="0" value="${c.min??""}"></label><label>${L("Fields.rangeMax")}<input type="number" name="max${i}" min="0" value="${c.max??""}"></label></fieldset>`;}).join("");
    const fd=await input("Actions.attacks",fields);if(!fd)return;
    const components=Array.from({length:Math.floor(choice.count)},(_,i)=>({formula:fd["formula"+i],type:fd["type"+i],penetration:Number(fd["penetration"+i]),penetrating:!!fd["penetrating"+i],...(fd["max"+i]!==""&&fd["max"+i]!==undefined?{min:Number(fd["min"+i])||0,max:Number(fd["max"+i])}:{})}));
    if(!validComponents(components)||components.some(c=>!Roll.validate(c.formula)||c.min!==undefined&&c.max<c.min)){ui.notifications.error(L("Errors.components"));return;}
    if(choice.variant){const variants=foundry.utils.deepClone(s.variants),id=choice.variant==="new"?foundry.utils.randomID():choice.variant,next={id,label:fd.label,components,attribute:fd.attribute,mode:fd.mode,zone:fd.zone,conditions:fd.conditions};const index=variants.findIndex(v=>v.id===id);if(index<0)variants.push(next);else variants[index]=next;await this.item.update({"system.variants":variants});}
    else await this.item.update({"system.components":components,"system.attribute":fd.attribute,"system.mode":fd.mode,"system.zone":fd.zone,"system.conditions":fd.conditions});
  }

  async _onRender(context,options){await super._onRender(context,options);if(!this.isEditable){for(const el of this.element.querySelectorAll("input,select,textarea,button[data-owner]"))el.disabled=true;for(const el of this.element.querySelectorAll("prose-mirror"))el.setAttribute("readonly","");}}
  static async onRecharge(){if(!game.user.isGM||!this.item.isOwner||this.item.system.broken||this.item.system.singleUse)return;const yes=await DialogV2.confirm({window:{title:L("Actions.recharge")},content:`<p>${L("Messages.runeRecharge")}</p><p>${L("Help.recharge")}</p>`,rejectClose:false});if(yes)await this.item.update(this.item.system.automation==="anivia"?{"system.charged":true}:{"system.uses.value":this.item.system.uses.max,"system.remainingCooldown":0});}
  static async onPurchase(){const actors=game.actors.filter(a=>a.isOwner&&a.type==="character"),fd=await input("Actions.purchase",`<label>${L("Fields.buyer")}<select name="actor">${actors.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></label>`+number("quantity",1,"Fields.quantity",1)+`<label><input type="checkbox" name="guildMerchant">${L("Fields.guildMerchant")}</label>`);if(fd)await game.runeterra.purchase(game.actors.get(fd.actor),this.item,Number(fd.quantity),fd);}
  static async onCraft(){
    const actors=game.actors.filter(a=>a.isOwner),fd=await input("Actions.craft",`<label>${L("Fields.buyer")}<select name="actor">${actors.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></label>`+number("quantity",1,"Fields.quantity",1));if(!fd)return;
    const actor=game.actors.get(fd.actor),professions=actor.items.filter(i=>i.type==="profession"),kits=actor.items.filter(i=>i.system.kitKind);
    const detail=await input("Actions.craft",`<p>${esc(this.item.system.recipe)}</p><label>${L("Types.profession")}<select name="profession">${professions.map(i=>`<option value="${i.id}">${esc(i.name)}</option>`).join("")}</select></label><label>${L("Fields.kit")}<select name="kit">${kits.map(i=>`<option value="${i.id}">${esc(i.name)} (${i.system.level})</option>`).join("")}</select></label>${number("actionLevel",this.item.system.level,"Fields.practiceLevel",1)}${number("failureLoss",100,"Fields.failureLoss")}<label>${L("Fields.conservation")}<select name="conservation"><option value="yield">${L("Conservation.yield")}</option><option value="ingredients">${L("Conservation.ingredients")}</option></select></label><label><input type="checkbox" name="conversionConfirmed">${L("Fields.conversionConfirmed")}</label><p>${L("Help.ingredients")}</p>${actor.items.filter(i=>i.type==="resource"||i.type==="consumable").map(i=>`<label>${esc(i.name)} (×${i.system.quantity})<input type="number" name="ingredient-${i.id}" min="0" max="${i.system.quantity}" step="any" value="0"></label>`).join("")}`);
    if(detail)await game.runeterra.craft(actor,this.item,{profession:actor.items.get(detail.profession),kit:actor.items.get(detail.kit),actionLevel:Number(detail.actionLevel),failureLoss:Number(detail.failureLoss),conservation:detail.conservation,conversionConfirmed:detail.conversionConfirmed,quantity:Number(fd.quantity),ingredients:Object.entries(detail).filter(([k,v])=>k.startsWith("ingredient-")&&Number(v)>0).map(([k,v])=>({id:k.slice(11),quantity:Number(v)}))});
  }
  static async onIntegrity(){
    const fd=await input("Actions.integrity",`<label>${L("Fields.materials")}<input type="text" name="materials" value="${esc(this.item.system.materials.join(","))}"></label><p>${L("Help.materials")}</p>`);
    if(fd){const materials=fd.materials.split(",").map(s=>s.trim()),s=this.item.system,n=itemIntegrity(materials,s.rarity,s.slot,s.fur,s.steelLining);await this.item.update({"system.materials":materials,"system.integrity.max":n.max,"system.integrity.value":n.max,"system.integrity.indestructible":n.indestructible});}
  }
  static async onModifiers(){
    const fd=await input("Actions.modifiers",`<label>${L("Help.modifiers")}<textarea name="json" rows="9">${esc(JSON.stringify(this.item.system.modifications,null,2))}</textarea></label>`);
    if(fd) {try {const values=JSON.parse(fd.json);if(!Array.isArray(values)||values.some(m=>!ATTRIBUTES.includes(m.attribute)||!Number.isFinite(Number(m.value))))throw new Error();await this.item.update({"system.modifications":values});}catch{ui.notifications.error(L("Errors.modifiers"));}}
  }
}

export async function useDialog(item) {
  const s=item.system;
  const selection=s.variants.length?await input("Actions.use",`<p>${esc(s.conditions)}</p><label>${L("Fields.variant")}<select name="variant">${s.variants.map(v=>`<option value="${esc(v.id)}">${esc(v.label)}</option>`).join("")}</select></label>`):{variant:""};
  if(!selection)return;
  const p=attackProfile(s,selection.variant);
  const fields=number("modifier",0,"Fields.modifier",-100)+(item.type==="profession"?number("practiceLevel",s.level,"Fields.practiceLevel",1)+`<label><input type="checkbox" name="guildMission">${L("Fields.guildMission")}</label>`:"")+(item.type==="weapon"?number("distance",0,"Fields.distance")+`<label><input type="checkbox" name="moving">${L("Fields.moving")}</label><label><input type="checkbox" name="magic">${L("Fields.magic")}</label><label><input type="checkbox" name="precise">${L("Fields.precise")}</label>`:"")+(item.type==="ability"?`<label><input type="checkbox" name="alternate">${L("Fields.alternate")}</label>`:"")+p.components.map((c,i)=>c.min===undefined?"":`<p>${esc(c.source)} (${c.min}?${c.max})</p>`+number("component"+i,c.min,"Fields.amount")).join("")+(selection.variant?`<p>${esc(p.conditions||s.conditions)}</p><label><input type="checkbox" name="contextConfirmed">${L("Fields.contextConfirmed")}</label>`:"");
  const fd=await input("Actions.use",fields);if(!fd)return;
  const componentValues=Object.fromEntries(Object.entries(fd).filter(([k])=>/^component\d+$/.test(k)).map(([k,v])=>[k.slice(9),Number(v)]));
  return item.use({...fd,variant:selection.variant,componentValues});
}
