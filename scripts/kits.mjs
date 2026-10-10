import {test,chat,localize as L,esc} from "./documents.mjs";
import {success,professionProgress,healPools} from "./rules.mjs";
import {kitConservation} from "./attack-data.mjs";
export const KIT_RULES={
  care:["Petit soin, bandage, médecine douce : 10 PV","Cautériser, recoudre ; hémorragie/petite fracture : niveau 2 puis niveau 1 ; 10 PV ou 1d10 (notation à arbitrer)","Soins intensifs, maladies, hémorragie/grosse fracture : 20 PV ou 1d10 (notation à arbitrer)","30 PV ou 1d20 (notation à arbitrer)"],
  sewing:["Créer vert ; réparer gris/vert","Créer et réparer bleu","Créer et réparer rouge/orange","Créer et réparer violet"],
  hunting:["Petits pièges, petites bêtes, dépeçage basique ; ≤20 : sans pertes","Pièges moyens, dépeçage précis, bêtes moyennes ; ≤40 : sans pertes","Grands pièges, dépeçage parfait : aucune perte ; grandes bêtes","Traquer, récolter et dépecer les bêtes légendaires"],
  fishing:["Commun ; 5–10 rare/rare+ ; 3–5 rare++/petit trésor ; 1–2 rare+++/moyen trésor","Rare ; 10–20 rare+/petit trésor ; 5–10 rare++/moyen trésor ; 1–5 rare+++/grand trésor","Rare++/moyen trésor ; 5–20 rare+++/grand trésor ; 1–5 légendaire/unique","Non défini. Filet en bateau : petit 1d6, moyen 1d10, grand 1d20"],
  cooking:["3 ingrédients, recette basique : 4 PV","4 ingrédients, bonne recette : 5 PV","4 ingrédients, recette élaborée : 6 PV et bonus social ; <10 : unique et vente","Non défini"],
  lockpicking:["Petits coffres et serrures","Moyens coffres et serrures","Grands coffres et serrures","Verrouillage par enchantement"],
  alchemy:["Potions basiques (bleu), ≤20 : sans pertes","Potions avancées (rouge), ≤30 : sans pertes","Potions puissantes (orange), ≤50 : sans pertes","Potions légendaires (violet)"]
};
export async function useKit(item) {
  const a=item.actor,s=item.system;
  if(!KIT_RULES[s.kitKind])return;
  const professions=a.items.filter(i=>i.type==="profession");
  const fd=await foundry.applications.api.DialogV2.input({window:{title:item.name},content:`<p>${L("Messages.kitManual")}</p><ol>${KIT_RULES[s.kitKind].map((r,i)=>`<li>${i+1} : ${esc(r)}</li>`).join("")}</ol><label>${L("Fields.practiceLevel")}<input type="number" name="level" min="1" max="${s.level}" value="${s.level}"></label><label>${L("Types.profession")}<select name="profession"><option value=""></option>${professions.map(i=>`<option value="${i.id}">${esc(i.name)}</option>`).join("")}</select></label>${s.kitKind==="care"?`<label>${L("Fields.healFormula")}<select name="healing">${["10","1d10","20","30","1d20"].map(v=>`<option>${v}</option>`).join("")}</select></label>`:""}<label><input type="checkbox" name="confirmed">${L("Fields.contextConfirmed")}</label>`,ok:{label:L("Actions.use")},rejectClose:false});
  if(!fd?.confirmed||fd.level<1||fd.level>s.level)return;
  const profession=a.items.get(fd.profession),level=Number(fd.level);
  if(profession&&profession.system.level<level)return;
  if(s.kitKind==="lockpicking"&&!profession&&a.attributeValue("dexterity")<60){ui.notifications.warn(L("Errors.craftKit"));return;}
  const result=profession?await test(a,profession.system.attribute,{target:Math.min(100,profession.system.value+20*(profession.system.level-level)),profession:true,label:profession.name}):await test(a,"dexterity",{label:item.name});
  if(profession&&game.settings.get("jdr-runeterra","professions")){const next=professionProgress(profession.system.toObject(),result.result,result.die,false);await profession.update(Object.fromEntries(["level","xp","practice","streak","value"].map(k=>["system."+k,next[k]])));}
  if(s.uses.limited)await item.update({"system.uses.value":Math.max(0,s.uses.value-1)});
  if(success(result.result)&&s.kitKind==="care"){
    const allowed=[[],["10"],["10","1d10"],["20","1d10"],["30","1d20"]][level];
    if(!allowed.includes(fd.healing))return;
    const roll=await new Roll(fd.healing).evaluate();await roll.toMessage({speaker:ChatMessage.getSpeaker({actor:a}),flavor:item.name});
    const n=healPools({base:a.system.hp.base,equipment:a.system.hp.equipment,bonus:a.system.hp.bonus},roll.total,a.system.hp.baseMax,a.system.equipmentMax);
    if(!["golem","mecha"].includes(a.system.species))await a.update({"system.hp.base":n.base,"system.hp.equipment":n.equipment});
  }
  await chat(a,item.name,`<p>${esc(KIT_RULES[s.kitKind][level-1])}</p>${kitConservation(s.kitKind,level,result.die)?`<p>${L("Messages.noLoss")}</p>`:""}`);return result;
}
