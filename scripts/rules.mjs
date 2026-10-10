// Pure rules. No Foundry globals: independently testable, usable by future modules.
export const ATTRIBUTES = ["force","agility","endurance","concentration","perception","reflexes","dexterity","stealth","charisma","persuasion","intimidation","mental"];
export const SLOTS = ["head","torso","hands","legs","feet"];
export const clamp = (n, a=0, b=100) => Math.min(b, Math.max(a, Number(n)||0));
export const round5 = n => Math.round(n / 5) * 5;
export function outcome(die, target, {infallible=false}={}) {
  if (infallible && target >= 100) return die <= 5 ? "criticalSuccess" : "success";
  if (die <= 5) return "criticalSuccess";
  if (die >= 96) return "criticalFailure";
  return die <= target ? "success" : "failure";
}
export const success = result => ["success","criticalSuccess"].includes(result);
export const skillXP = result => ({criticalFailure:0,failure:0.5,success:1,criticalSuccess:2})[result];
export function skillProgress(level, xp, result, siblings=[]) {
  xp += skillXP(result);
  const threshold = level === 1 ? 15 : 30;
  const eligible = level < 3 && (level === 1 || siblings.some(l=>l >= 2));
  return eligible && xp >= threshold ? {level: level+1, xp: xp-threshold, advanced:true} : {level,xp,advanced:false};
}
export function professionProgress(s, result, die, guild=false) {
  const level = s.level, next = {...s};
  const table = level===1 ? [5,2,1,0] : level===4 ? [2,1,0,0] : [3,1,0.5,0];
  const gained = table[["criticalSuccess","success","failure","criticalFailure"].indexOf(result)] * (guild && success(result) ? 2 : 1);
  next.xp += gained; next.practice += gained;
  next.streak = success(result) ? (s.streak||0) + (level===4 && result==="criticalSuccess" ? 3 : 1) : 0;
  const needed = [0,2,2,3,5][level];
  if (next.streak >= needed) {next.value= Math.min(level===4 ? 95 : level===3 ? 90 : 80, next.value+5); next.streak=0;}
  const step = v => level===1 ? (v<70 ? 3 : 5) : level===2 ? (v<70 ? 5 : 10) : level===3 ? (v<70 ? 10 : 15) : v<70 ? 5 : v<80 ? 10 : 15;
  const cap = level===4 ? 90 : level===3 ? 90 : 80;
  while(next.value < cap && next.practice >= step(next.value)) {next.practice -= step(next.value); next.value=Math.min(cap,next.value+5);}
  if(level===4 && s.value>=95 && result==="criticalSuccess") next.value=100;
  if(level<4 && (next.xp >= [0,5,10,20][level] || (success(result) && die <= [0,30,20,10][level]))) {
    next.level++; next.xp=0; next.practice=0; next.streak=0; next.value=Math.max(0,next.value-20);
  }
  return next;
}
export function resistanceFormula(value) {
  value=Math.max(0,Math.floor(value)); const dice=[];
  while(value>=20) {dice.push("1d20");value-=20;}
  if(value>=10) {dice.push("1d10");value-=10;}
  if(value>=5) {dice.push("1d6");value-=5;}
  if(value) dice.push("1d"+value);
  return dice.join(" + ") || "0";
}
export function fixedResistance(value, rarity, mode) {
  const index=["grey","green","blue","red","orange","violet"].indexOf(rarity);
  if(mode==="flat") return Math.min(value, Math.max(0,index-2)*5);
  if(mode==="percent") return Math.floor(value*([0,0,0,0.2,0.5,0.8][index]||0));
  return 0;
}
export function absorb(value, dieTotal, fixed=0) {return clamp(dieTotal+fixed,0,value);}
export function coldLevel(ambient, native, clothing, {freljord=false,shurima=false}={}) {
  if(ambient>=5) return 5;
  if(freljord && ambient===4) native=Math.min(1,native);
  return clamp(ambient - Math.max(0,native) - Math.max(0,clothing) + (shurima ? 1 : 0),0,5);
}
export function coldPenalties(level,multiplier=1) {
  const p = [{},{reflexes:-5,endurance:-5},{reflexes:-10,endurance:-10},
    {reflexes:-20,endurance:-20,agility:-20,mental:-10},
    {reflexes:-50,endurance:-50,agility:-50,mental:-30},
    {reflexes:-100,endurance:-100,agility:-100,mental:-100}][level]||{};
  return Object.fromEntries(Object.entries(p).map(([k,v])=>[k,v*multiplier]));
}
export function effectiveAttribute(base,bonus=0,penalty=0,permanent=false) {return permanent ? 10 : clamp(base+bonus+penalty);}
export function damagePools(pools, amount, {brut=false,criticalSafety=true}={}) {
  const next={...pools}; amount=Math.max(0,amount);const initial=amount;
  if(brut) {next.base=Math.max(0,next.base-amount);amount=0;}
  else for(const key of ["bonus","equipment","base"]) {const spent=Math.min(next[key],amount);next[key]-=spent;amount-=spent;}
  let coma=false;
  if(next.base===0 && criticalSafety) {next.base=1;coma=true;}
  return {...next,coma,applied:initial-amount};
}
export function healPools(pools,amount,maxBase,maxEquipment) {
  const next={...pools};for(const [key,max] of [["base",maxBase],["equipment",maxEquipment]]){const add=Math.min(Math.max(0,max-next[key]),amount);next[key]+=add;amount-=add;}
  return next;
}
export function dodgeResult(die,target) {
  const result=outcome(die,target), margin=target-die;
  return {result,margin,avoided:success(result),close:success(result)&&margin<=5,attenuated:result==="failure"&&margin>=-10};
}
export function runeResult(die,tier) {
  return {broken: tier===4 ? false : tier===3 ? die<20 : die <= (tier===2 ? 60 : 80),rechargeable: tier===4 || (tier===3 ? die>=20 : die>(tier===2?60:80))};
}
export function foodResult(die) {
  if(die<=5) return {affinity:"loved",hp:5};
  if(die<=20) return {affinity:"excellent",hp:5};
  if(die<=50) return {affinity:"good",hp:0};
  if(die<=70) return {affinity:"bad",hp:0};
  if(die<=80) return {affinity:"vomit",hp:-5};
  return {affinity:"allergy",hp:-10,sick:die>=96};
}
export const foodExpired=(s,now)=>s.food&&s.foodKind!=="seed"&&!s.preserved&&s.acquired>=0&&now-s.acquired>(s.foodKind==="meat"?5:10)*86400;
export const MATERIALS={
  cloth:[30,60,120,200,400,Infinity],leather:[50,100,150,220,440,Infinity],horn:[60,110,160,230,450,Infinity],
  iron:[70,140,200,280,480,Infinity],steel:[90,180,250,350,560,Infinity],
  petricite:[0,0,0,390,650,Infinity],carbon:[0,0,0,420,730,Infinity],obsidian:[0,0,0,0,800,Infinity],
  relic:[Infinity],trueIce:[Infinity],darkIce:[Infinity],oavir:[Infinity]
};
export function itemIntegrity(materials,rarity,slot,fur=false,steel=false) {
  const i=["grey","green","blue","red","orange","violet"].indexOf(rarity);
  const values=materials.map(m=>MATERIALS[m]?.[MATERIALS[m]?.length===1 ? 0 : i]??0);
  if(values.some(v=>!Number.isFinite(v))) return {max:0,indestructible:true};
  const base=values.reduce((a,b)=>a+b,0)/(values.length>1 ? 1.5 : 1)+(fur?10:0)+(steel?30:0);
  return {max:round5(base*({head:0.8,torso:1,hands:0.7,legs:0.95,feet:0.8}[slot]||1)),indestructible:false};
}
export const creationHPAdjustment=s=>(["golem","mecha"].includes(s.species)?20:0)-(s.subspecies==="oovikat"?20:0);
export const creationBudget=s=>ATTRIBUTES.reduce((sum,k)=>sum+s.attributes[k].base,0)+s.hp.baseMax-creationHPAdjustment(s);
export function creationIssues(s) {
  const values=ATTRIBUTES.map(k=>s.attributes[k].base); const issues=[];
  const hp=s.hp.baseMax-creationHPAdjustment(s);
  if(values.reduce((a,b)=>a+b,0)+hp!==600) issues.push("budget");
  if(values.filter(v=>v===80).length!==1) issues.push("maximum");
  if(values.filter(v=>v===10).length!==1 || s.attributes[s.permanentMalus]?.base!==10) issues.push("malus");
  if(values.some(v=>![10,80].includes(v)&&(v<20||v>70))) issues.push("range");
  const yordle=s.species==="yordle", max=yordle||s.subspecies==="oovikat" ? 110 : 130;
  if(s.hp.baseMax<(yordle?50:60)+creationHPAdjustment(s)||s.hp.baseMax>max+(["golem","mecha"].includes(s.species)?20:0)) issues.push("hp");
  if(s.armor.base>5||s.magicResistance.base>5) issues.push("resistance");
  if(["vastaya","yordle"].includes(s.species)&&!Object.values(s.specials).some(x=>x.name.toLowerCase().includes(s.species==="yordle"?"yordle":"vastaya")||s.subspecies==="oovikat"&&x.name.toLowerCase().includes("métamorph")||s.subspecies==="vesani"&&x.name.toLowerCase().includes("vesani"))) issues.push("magic");
  if(s.species==="halfTroll"&&s.subspecies==="ice"&&s.attributes.perception.base<50)issues.push("halfTroll");
  const constrained=s.subspecies==="khonlui"?["stealth","dexterity"]:s.subspecies==="mohkura"?["stealth","endurance"]:[];
  if(constrained.length&&(!constrained.includes(s.permanentMalus)||constrained.filter(k=>k!==s.permanentMalus).some(k=>s.attributes[k].base>50)))issues.push("racialMalus");
  return [...new Set(issues)];
}
