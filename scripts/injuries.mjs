import {localize as L} from "./documents.mjs";
export async function applyInjury(actor,{part="finger",temporary=false,seconds=0,prosthesis=false,compensation=0}={}) {
  if(!game.user.isGM||!actor.isOwner||!["finger","leg"].includes(part))return;
  const attribute=part==="finger"?"dexterity":"agility",hp=part==="finger"?5:15,penalty=part==="finger"?5:10;
  // Prosthesis compensation is explicitly chosen; no automatic cure or restoration of base HP.
  const changes=[{key:"system.hp.baseMax",mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:String(-hp)},{key:`system.attributes.${attribute}.bonus`,mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:String(-penalty+(prosthesis?Math.min(penalty,Math.max(0,Number(compensation))):0))}];
  return actor.createEmbeddedDocuments("ActiveEffect",[{name:L("Injuries."+part),statuses:["amputation"],changes,duration:{value:temporary&&seconds?seconds:null,units:"seconds",expiry:temporary&&seconds?"runeterra":null},start:{time:game.time.worldTime},flags:{"jdr-runeterra":{injury:{part,permanent:!temporary,prosthesis,compensation}}}}]);
}
