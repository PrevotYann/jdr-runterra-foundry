import {normalize} from "./content-parsing.mjs";
const types={DP:"physical",DM:"magic",DB:"brut",PP:"physical",PM:"magic"};
export const plain=s=>s.replace(/<br\s*\/?>/gi,"\n").replace(/<[^>]*>/g," ").replaceAll("&amp;","&").replaceAll("&#39;","'").replaceAll("&quot;",'"');
export function damageData(text) {
  const matches=[...text.matchAll(/(?<![\d+])\b(\d+(?:[.,]\d+)?)(?:\s*([-–/])\s*(\d+))?(?:\s*\+\s*(1D\d+))?\s*(DP|DM|DB|PP|PM)\b/gi)];
  const components=matches.map(m=>({formula:String(Number(m[1].replace(",",".")))+(m[4]?"+"+m[4].toLowerCase():""),type:types[m[5].toUpperCase()],penetration:0,penetrating:["PP","PM"].includes(m[5].toUpperCase()),source:m[0],...(m[2]&&m[2]!=="/"?{min:Number(m[1]),max:Number(m[3])}:{})}));
  // Slash values are choices, never dice. Conditional damage must be selected explicitly.
  const conditional=matches.map((m,i)=>i>0&&/\bsi\b|\bpour retirer\b/i.test(text.slice(m.index+m[0].length,matches[i+1]?.index??text.length)));
  const alternatives=matches.some((m,i)=>m[2]==="/"||conditional[i]||i>0&&/\bou\b|\bsi\b|\//i.test(text.slice(matches[i-1].index+matches[i-1][0].length,m.index)));
  let variants=[];
  if(alternatives){
    if(matches.length===1&&matches[0][2]==="/")variants=[components,[{...components[0],formula:matches[0][3]}]];
    else if(matches.some(m=>m[2]==="/")){
      variants=[components];
      matches.forEach((m,i)=>{if(m[2]==="/")variants=variants.flatMap(v=>[v,v.map((c,j)=>j===i?{...c,formula:m[3]}:c)]);});
    }else if(conditional.some(Boolean))variants=[components.filter((c,i)=>!conditional[i]),components];
    else variants=components.map(c=>[c]);
  }
  return {components:variants.length?variants[0]:components,variants:variants.map((c,i)=>({id:"choice"+i,label:c.map(d=>d.source+" → "+d.formula).join(" + "),components:c,conditions:text})),zone:/\bzone\b/i.test(text)?"area":"torso"};
}
export function enrichItem(item) {
  const s=item.system,n=normalize(item.name),text=plain(s.description||"").trim(),body=text.slice(text.indexOf(item.name)+item.name.length).trim();
  s.schemaVersion=2;
  if(item.type==="weapon"){
    const raw=body.split(/\n/).filter(l=>/\b(?:DP|DM|DB|PP|PM)\b/.test(l)).join(" ");
    // Bestiary descriptions contain only the action; equipment's first sentence is the damage rule.
    const damageText=s.source?raw.split(/\.\s/)[0]:raw;
    const data=damageData(damageText||text);
    if(data.components.length){Object.assign(s,data);s.damageFormula=data.components[0].formula;s.damageType=data.components[0].type;}
    if(s.components?.length&&s.components.every(c=>c.type==="magic")){s.mode="magic";s.attribute="concentration";}
    if(/jet d.encre/.test(n)){
      const c=amount=>[{formula:String(amount),type:"magic",penetration:0,penetrating:false}];
      s.components=c(15);s.mode="magic";s.attribute="concentration";s.zone="torso";
      s.variants=[{id:"air",label:"Dans l’air — 15 DM ciblés",components:c(15),zone:"torso"},{id:"water",label:"Dans l’eau — 25 DM de zone",components:c(25),zone:"area"},...[5,10].map(value=>({id:"absorption"+value,label:`Zone d’Absorption — ${value} RM (${value===5?"cibler le Gekodo":"dans l’eau, cibler les bénéficiaires"})`,components:[{formula:"0",type:"magic",penetration:0}],zone:value===5?"torso":"area",associatedEffects:[{resistance:"magicResistance",value,condition:value===5?"Sur lui-même ; durée validée par le MJ":"Protection de zone dans l’eau ; durée validée par le MJ"}],conditions:value===5?"Le Gekodo doit être la cible":"Dans l’eau uniquement"}))];
      s.associatedEffects=[{attribute:"perception",value:-30,optional:true,condition:"Jet d’encre : aveuglement temporaire, durée choisie par le MJ"},{status:"blind",optional:true,condition:"Aveuglement temporaire décidé par le MJ"}];
    }
    if(/coup de queue/.test(n)&&/50% entrave/i.test(text))s.associatedEffects=[{status:"restrained",chance:50,condition:"La queue attrape la cible"}];
    const dot=text.match(/(?:Poison|Saignement|Brûlure)\s*(?:Lvl|Niveau)\s*(\d)/i);
    if(dot&&!/\d+\s*%[^)]*(?:Poison|Saignement)/i.test(text))s.dot={kind:/poison/i.test(dot[0])?"poison":/saignement/i.test(dot[0])?"bleeding":"burn",level:Number(dot[1])};
    s.conditions=damageText;
    if(/sylfang/.test(n)){
      s.mode="magic";s.attribute="concentration";s.zone="torso";
      s.variants=[40,60].flatMap(amount=>[false,true].map(legendary=>({id:`sylfang${amount}${legendary?"L":""}`,label:`${amount} DM — ${legendary?"légendaire, zone":"ciblé"}`,components:[{formula:String(amount),type:"magic",penetration:0}],zone:legendary?"area":"torso",conditions:legendary?"Version légendaire requise, validation MJ":"Choix de puissance validé par le MJ"})));
    }
    if(/ynshaarum/.test(n))s.variants.push({id:"ritual",label:"Rituel Lame Éthérée",components:[{formula:"0",type:"brut",penetration:0}],mode:"ritual",conditions:"Nom : seuil 20 ; nom + essence : seuil 50 (notation -20/-50 à confirmer par le MJ). 50–80 % des PV restants, une fois par combat. Pourcentage et type arbitrés par le MJ."});
  }
  if(/collier de marchandage/.test(n)){s.automation="bargaining";s.conditions="Porter le collier : +10 Persuasion uniquement pour marchander ; -20 % uniquement chez les marchands de la Guilde des Marchands.";s.bonuses={};}
  if(/amulette d anivia/.test(n)){s.automation="anivia";s.conditions="Prière Anivia 20 (normale) / 30 (chargée). Bonus +5 / +15, plafond 90, avant combat (1 tour) ou prochaine action. Critique raté : perle brisée / chargée déchargée. Recharge : bonne grâce sur réussite critique ou Maître des Secrets, validation MJ.";}
  if(item.type==="relic"||item.type==="enchantment")s.conditions ||= body;
  if(item.type==="rune"){
    s.level=s.rarity==="violet"?4:1;
    const primary=normalize(item.name.split("/")[0]);
    if(s.level!==4)s.level=/complexe/.test(primary)?3:/avancee/.test(primary)?2:1;
    s.rechargeKind="compatibleMagic";s.conditions=body;s.uses={limited:s.level!==4,value:1,max:1};
    const damage=body.match(/\((\d+) (DP|DM) \+ Puissance ([12]D20) (DP|DM)/i);
    if(damage&&damage[2]===damage[4])s.components=[{formula:damage[1]+"+"+damage[3].toLowerCase(),type:types[damage[2]],penetration:0,penetrating:false}];
    if(/rune de feu$/.test(n))s.dot={level:1,kind:"burn"};
    if(/rune de foudre$|rune de roche/.test(n))s.associatedEffects=[{status:"unconscious",duration:60,condition:"Assommée pendant 2 tours"}];
    if(/rune de glace/.test(n))s.associatedEffects=[{status:"restrained",optional:true,condition:"Immobilisation temporaire : durée validée par le MJ"}];
    if(item.name.includes("/")){
      const tiers=[s.level,...(n.includes("avancee")?[2]:[]),...(n.includes("complexe")?[3]:[])];
      s.variants=[...new Set(tiers)].map(level=>({id:"tier"+level,label:["","Commune","Avancée","Complexe","Légendaire"][level],level,components:s.components||[{formula:"0",type:"magic",penetration:0}],conditions:"Choisir la qualité réelle de la pierre ; aucune puissance supplémentaire non chiffrée n’est inventée."}));
    }
  }
  if(["relic","enchantment"].includes(item.type)&&!s.automation){
    const attrs={Force:"force",Agilité:"agility",Endurance:"endurance",Concentration:"concentration",Perception:"perception",Réflexes:"reflexes",Dextérité:"dexterity",Discrétion:"stealth",Charisme:"charisma",Persuasion:"persuasion",Intimidation:"intimidation",Mental:"mental"};
    s.powers=[];
    for(const [fr,attribute] of Object.entries(attrs))for(const m of body.matchAll(new RegExp("([+−-]\\d+)(?:\\s+(?:en|de))?\\s+"+fr,"gi")))s.powers.push({attribute,value:Number(m[1].replace("−","-")),condition:body});
  }
  if(item.type==="consumable"&&!s.food&&s.recipe)s.crafting={kitKind:"alchemy",level:s.level};
  if(item.type==="book")for(const m of s.milestones||[]) {
    m.id="hours"+m.hours;
    const choices=m.text.split(/\s+ou\s+/i);
    m.rewards=choices.map(choice=>{
      const amount=Number(choice.match(/\+(\d+)/)?.[1]||0);if(!amount)return null;
      const special=choice.match(/Spécial\s*([12])/i);
      if(special)return {kind:/LVL/i.test(choice)?"level":"special",key:special[1]==="1"?"first":"second",amount,condition:m.text};
      const attributes={Force:"force",Agilité:"agility",Endurance:"endurance",Concentration:"concentration",Perception:"perception",Réflexes:"reflexes",Dextérité:"dexterity",Discrétion:"stealth",Charisme:"charisma",Persuasion:"persuasion",Intimidation:"intimidation",Mental:"mental"};
      const keys=Object.entries(attributes).filter(([fr])=>new RegExp("\\b"+fr,"i").test(choice)).map(([,key])=>key);
      if(!keys.length)return {kind:"context",amount,condition:m.text};
      return {kind:/\bsur\b|situationnel|interaction/i.test(choice)?"context":"attributes",keys,amount,condition:m.text};
    }).filter(Boolean);
  }
  const kit=n.match(/^kit .*?(soin|couture|chasse|peche|cuisine|crochetage|alchimie|alchimiste|amchimiste)/);
  if(kit)s.kitKind={soin:"care",couture:"sewing",chasse:"hunting",peche:"fishing",cuisine:"cooking",crochetage:"lockpicking",alchimie:"alchemy",alchimiste:"alchemy",amchimiste:"alchemy"}[kit[1]];
}
export function enrichPacks(packs) {for(const p of Object.values(packs))for(const d of p.documents){if(d.system&&d.type!=="creature")enrichItem(d);for(const i of d.items||[]){enrichItem(i);if(i.name.includes(". "))i.name=i.name.split(". ").at(-1).trim();}if(d.name==="GEKODO")for(const i of d.items||[])if(i.name.startsWith("dans l’")){i.name="Jet d’encre — dans l’eau";i.system.associatedEffects=d.items[0].system.associatedEffects;}}}
