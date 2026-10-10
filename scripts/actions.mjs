import {chat,test,localize as L,exclusive,esc} from "./documents.mjs";
import {success} from "./rules.mjs";
export async function purchase(actor,item,quantity=1) {
  if(!actor.isOwner||!item||!Number.isInteger(quantity)||quantity<1)return;
  return exclusive(actor,async()=>{
    const cost=Math.round(item.system.price*quantity*10),available=Math.round(actor.system.currency.gold*10+actor.system.currency.silver);
    if(available<cost){ui.notifications.warn(L("Errors.purchase"));return;}
    const balance=available-cost;
    const data=item.toObject();delete data._id;delete data.folder;
    data.system.quantity=quantity;data.system.equipped=false;data.system.acquired=game.time.worldTime;
    const created=await actor.createEmbeddedDocuments("Item",[data]);
    await actor.update({"system.currency.gold":Math.floor(balance/10),"system.currency.silver":balance%10});
    await chat(actor,L("Actions.purchase"),`<p>${esc(item.name)} ×${quantity} · ${cost/10} ${L("Fields.gold")}</p>`);
    return created[0];
  });
}
export async function care(actor,{method="bandage",tier=1,amount=0,target=actor}={}) {
  if(!actor.isOwner||!target.isOwner)return;
  const profession=actor.items.find(i=>i.type==="profession"&&/soin|médecin|medecin/i.test(i.name));
  if(method!=="bandage"&&(!profession||profession.system.level<2)){ui.notifications.warn(L("Errors.care"));return;}
  const result=profession?await profession.use({practiceLevel:tier}):await actor.rollAttribute("dexterity");
  if(!success(result.result))return;
  for(const effect of target.effects.filter(e=>e.statuses.has("bleeding"))) {
    const level=effect.getFlag("jdr-runeterra","level")||1;
    if(method!=="bandage"||level===1)await effect.delete();else await effect.setFlag("jdr-runeterra","level",level-1);
  }
  if(method==="cauterize"&&amount>0)await target.applyDamage(amount,{type:"brut",zone:"area"});
  if(method==="bandage"&&profession&&amount>0)await target.heal(amount);
  await chat(actor,L("Actions.bandage"),`<p>${esc(target.name)} · ${L("Care."+method)}</p>`);
}
export async function counterfeit(actor,{amount=1,rarity="common"}={}) {
  if(!actor.isOwner||amount<=0||amount>actor.system.currency.counterfeit)return;
  const thief=actor.items.find(i=>i.type==="profession"&&/voleur/i.test(i.name));
  const result=thief?await thief.use():await test(actor,"persuasion",{target:(actor.attributeValue("persuasion")+({common:60,specific:40,rare:20,legendary:5}[rarity]||0))/2,label:L("Actions.counterfeit")});
  await actor.update({"system.currency.counterfeit":actor.system.currency.counterfeit-amount});
  await chat(actor,L("Actions.counterfeit"),`<p>${amount} · ${L("Results."+result.result)}</p>`);return result;
}
export async function craft(actor,item,{profession,ingredients=[],quantity=1}={}) {
  if(!actor.isOwner||!profession||profession.actor!==actor||profession.type!=="profession"||!Number.isInteger(quantity)||quantity<1)return;
  // Explicit ingredient choice: recipes often use mass/volume rather than an inventory unit.
  if(ingredients.some(({id,quantity:n})=>!actor.items.has(id)||!Number.isFinite(n)||n<=0||actor.items.get(id).system.quantity<n)){ui.notifications.warn(L("Errors.ingredients"));return;}
  const result=await profession.use();
  for(const ingredient of ingredients){const i=actor.items.get(ingredient.id);await i.update({"system.quantity":i.system.quantity-ingredient.quantity});}
  if(!success(result.result))return result;
  const data=item.toObject();delete data._id;delete data.folder;data.system.quantity=quantity;data.system.equipped=false;data.system.acquired=game.time.worldTime;
  await actor.createEmbeddedDocuments("Item",[data]);await chat(actor,L("Actions.craft"),`<p>${esc(item.name)} ×${quantity}</p>`);return result;
}
