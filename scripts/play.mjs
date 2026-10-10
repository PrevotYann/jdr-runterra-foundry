import {ATTRIBUTES,clamp,success} from "./rules.mjs";
import {guildEligible} from "./attack-data.mjs";
import {test,chat,localize as L,esc,exclusive} from "./documents.mjs";
const dialog=(item,content)=>foundry.applications.api.DialogV2.input({window:{title:item.name},content:`<div class="rt-dialog">${content}</div>`,ok:{label:L("Actions.confirm")},rejectClose:false});
export async function activateRelic(item,{ritual=false}={}) {
  const a=item.actor,s=item.system;
  if(ritual){
    if(!game.user.isGM){ui.notifications.warn(L("Errors.gmDecision"));return;}
    const combat=game.combat;if(!combat?.started||item.getFlag("jdr-runeterra","ritualCombat")===combat.id){ui.notifications.warn(L("Errors.unavailable"));return;}
    const fd=await dialog(item,`<p>${esc(s.variants.find(v=>v.id==="ritual")?.conditions)}</p><label>${L("Fields.target")}<select name="target">${[...game.user.targets].filter(t=>t.actor?.isOwner).map(t=>`<option value="${esc(t.actor.uuid)}">${esc(t.name)}</option>`).join("")}</select></label><label>${L("Fields.ritualThreshold")}<select name="threshold"><option>20</option><option>50</option></select></label><label>${L("Fields.percent")}<input type="number" name="percent" min="50" max="80" value="50"></label><label>${L("Fields.damageType")}<select name="type">${["physical","magic","brut","neutral"].map(t=>`<option value="${t}">${L("Damage."+t)}</option>`).join("")}</select></label><label><input type="checkbox" name="confirmed">${L("Fields.contextConfirmed")}</label>`);
    if(!fd?.confirmed||!fd.target||![20,50].includes(Number(fd.threshold))||fd.percent<50||fd.percent>80)return;
    const result=await test(a,"concentration",{target:Number(fd.threshold),label:item.name});
    await item.setFlag("jdr-runeterra","ritualCombat",combat.id);
    const target=await fromUuid(fd.target),type=["physical","magic","brut","neutral"].includes(fd.type)?fd.type:"neutral";
    if(success(result.result)&&target){const amount=target.system.health.value*Number(fd.percent)/100;await chat(a,item.name,`<p>${fd.percent}% · ${esc(target.name)} : ${amount}</p><button type="button" data-rt-action="damage">${L("Actions.applyTarget")}</button>`,{ritualTarget:fd.target,percent:fd.percent,damage:amount,components:[{amount,type,penetration:0}],zone:"torso"});}
    return result;
  }
  const fd=await dialog(item,`<p>${esc(s.conditions)}</p><label>${L("Fields.attribute")}<select name="attribute">${ATTRIBUTES.map(k=>`<option value="${k}">${L("Attributes."+k)}</option>`).join("")}</select></label><label><input type="checkbox" name="anticipation">${L("Fields.anticipation")}</label>`);
  if(!fd||!ATTRIBUTES.includes(fd.attribute))return;
  let prayer=a.items.find(i=>i.type==="special"&&i.getFlag("jdr-runeterra","aniviaPrayer"));
  if(!prayer){[prayer]=await a.createEmbeddedDocuments("Item",[{name:L("Fields.aniviaPrayer"),type:"special",system:{value:s.charged?30:20,damageFormula:"0"},flags:{"jdr-runeterra":{aniviaPrayer:true}}}]);}
  const r=await test(a,"special:"+prayer.id,{target:s.charged?30:20,label:prayer.name});
  if(r.result==="criticalFailure")await item.update(s.charged?{"system.charged":false}:{"system.broken":true});
  if(success(r.result)){
    const amount=Math.min(s.charged?15:5,Math.max(0,90-a.attributeValue(fd.attribute)));
    const previous=a.effects.filter(e=>e.getFlag("jdr-runeterra","aniviaSource")===item.uuid);for(const e of previous)await e.delete();
    await a.createEmbeddedDocuments("ActiveEffect",[{name:item.name,img:item.img,changes:[],duration:{value:fd.anticipation?null:30,units:"seconds",expiry:fd.anticipation?null:"runeterra"},start:{time:game.time.worldTime},flags:{"jdr-runeterra":{aniviaSource:item.uuid,nextTest:fd.anticipation,attribute:fd.attribute,bonus:amount,cap:90,...(!fd.anticipation?{remainingRounds:1}:{})}}}]);
  }
  if(r.result==="criticalSuccess")await item.setFlag("jdr-runeterra","aniviaGrace",true);
  await prayer.update({"system.value":item.system.charged?30:20});return r;
}
export async function grantBookReward(item) {
  const a=item.actor;if(!a?.isOwner)return;
  return exclusive(a,async()=>{
    const ledger=foundry.utils.deepClone(a.getFlag("jdr-runeterra","bookRewards")||{}),book=item.system.reference||item.uuid;
    const pending=item.system.milestones.filter(m=>m.hours<=item.system.progress&&m.rewards?.length&&!ledger[book+":"+(m.id||m.hours)]);
    if(!pending.length){ui.notifications.info(L("Messages.noReward"));return;}
    const fd=await dialog(item,`<label>${L("Fields.milestone")}<select name="reward">${pending.flatMap(m=>m.rewards.map((r,i)=>`<option value="${esc(m.id||String(m.hours))}:${i}">${m.hours} h · ${esc(r.condition)}</option>`)).join("")}</select></label><p>${L("Help.bookReward")}</p><label><input type="checkbox" name="alreadyGranted">${L("Fields.alreadyGranted")}</label>`);
    if(!fd)return;
    const [id,index]=fd.reward.split(":"),m=pending.find(m=>String(m.id||m.hours)===id),r=m?.rewards[Number(index)];if(!r)return;
    if(fd.alreadyGranted){ledger[book+":"+id]={choice:Number(index),text:m.text,previouslyGranted:true};await a.setFlag("jdr-runeterra","bookRewards",ledger);return;}
    if(r.kind==="level"){
      // Source refers to a skill level attached to the selected special, not an actor special value.
      const abilities=a.items.filter(i=>i.type==="ability"&&i.system.attribute===r.key&&i.system.level<4);
      const choice=await dialog(item,`<label>${L("Types.ability")}<select name="ability">${abilities.map(i=>`<option value="${i.id}">${esc(i.name)}</option>`).join("")}</select></label>`);if(!choice?.ability)return;
      const ability=a.items.get(choice.ability);await ability.update({"system.level":Math.min(4,ability.system.level+r.amount)});
    }else if(r.kind==="special")await a.update({[`system.specials.${r.key}.value`]:clamp(a.system.specials[r.key].value+r.amount)});
    else if(r.kind==="attributes")await a.update(Object.fromEntries(r.keys.map(k=>[`system.attributes.${k}.bonus`,a.system._source.attributes[k].bonus+r.amount])));
    else await a.createEmbeddedDocuments("ActiveEffect",[{name:item.name+" — "+m.hours+" h",changes:[],flags:{"jdr-runeterra":{contextReward:r,bookReward:book+":"+id}}}]);
    ledger[book+":"+id]={choice:Number(index),text:m.text,worldTime:game.time.worldTime};await a.setFlag("jdr-runeterra","bookRewards",ledger);
    await chat(a,item.name,`<p>${m.hours} h · ${esc(r.condition)}</p>`);
  });
}
export async function validateRepresentative(item) {
  if(!game.user.isGM||!guildEligible(item.system)){ui.notifications.warn(L("Errors.guildRepresentative"));return;}
  await item.update({"system.guildRepresentative":true});await chat(item.actor,item.name,`<p>${L("Messages.guildRepresentative")}</p>`);
}
export async function applyEnchantment(item) {
  if(!game.user.isGM||!item.actor||item.system.quantity<1||item.system.broken)return;
  return exclusive(item.actor,async()=>{
    const targets=item.actor.items.filter(i=>["equipment","weapon","relic"].includes(i.type)&&!i.system.broken);
    const fd=await dialog(item,`<p>${esc(item.system.conditions)}</p><label>${L("Fields.target")}<select name="target">${targets.map(i=>`<option value="${i.id}">${esc(i.name)}</option>`).join("")}</select></label><label><input type="checkbox" name="confirmed">${L("Fields.contextConfirmed")}</label>`);
    if(!fd?.confirmed||!targets.some(i=>i.id===fd.target))return;
    const gear=item.actor.items.get(fd.target),enchantments=foundry.utils.deepClone(gear.getFlag("jdr-runeterra","enchantments")||[]);
    if(enchantments.some(e=>e.source===item.uuid))return;
    if(enchantments.length>=({red:1,orange:2,violet:2}[gear.system.rarity]||0)){ui.notifications.warn(L("Errors.enchantmentCapacity"));return;}
    enchantments.push({source:item.uuid,name:item.name,modifications:item.system.modifications,duration:item.system.duration,until:item.system.duration?game.time.worldTime+item.system.duration:0,conditions:item.system.conditions});
    await gear.setFlag("jdr-runeterra","enchantments",enchantments);
    if(item.system.singleUse)await item.update({"system.quantity":item.system.quantity-1});
  });
}

export async function activatePower(item) {
  if(!item.actor?.isOwner||item.system.broken||item.system.quantity<1||item.system.remainingCooldown>0||item.system.uses.limited&&item.system.uses.value<1)return;
  return exclusive(item.actor,async()=>{
    const s=item.system,fd=await dialog(item,`<p>${esc(s.conditions)}</p><label>${L("Actions.power")}<select name="power">${s.powers.map((p,i)=>`<option value="${i}">${p.value} ${L("Attributes."+p.attribute)}</option>`).join("")}</select></label><label>${L("Fields.powerDuration")}<input name="seconds" type="number" min="0" value="30"></label><label><input type="checkbox" name="confirmed">${L("Fields.contextConfirmed")}</label>`);
    if(!fd?.confirmed)return;const p=s.powers[Number(fd.power)];if(!p||!ATTRIBUTES.includes(p.attribute))return;
    await item.actor.createEmbeddedDocuments("ActiveEffect",[{name:item.name,changes:[{key:`system.attributes.${p.attribute}.bonus`,mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:String(p.value)}],duration:{value:Number(fd.seconds)||null,units:"seconds",expiry:fd.seconds?"runeterra":null},start:{time:game.time.worldTime},flags:{"jdr-runeterra":{source:item.uuid,conditions:p.condition}}}]);
    if(s.uses.limited)await item.update({"system.uses.value":Math.max(0,s.uses.value-1)});
    if(s.cooldown)await item.update({"system.remainingCooldown":s.cooldown});
    if(s.singleUse)await item.update({"system.quantity":s.quantity-1});
  });
}
