import {setting,chat,test,localize as L} from "./documents.mjs";
const primaryGM=()=>game.users.activeGM?.id===game.user.id;
let busy=false;
const tickQueues=new Map();
let worldTicks=Promise.resolve();
const combatTicks=new Map();
export async function waitForTime() {await Promise.all([worldTicks,...combatTicks.values(),...tickQueues.values()]);}
export async function tickActor(actor,seconds,options={}) {
  // World-time and round hooks can arrive together. Keep each actor's ticks ordered.
  const previous=tickQueues.get(actor.uuid)||Promise.resolve();
  const pending=previous.catch(()=>{}).then(()=>processTick(actor,seconds,options));
  tickQueues.set(actor.uuid,pending);
  try{return await pending;}finally{if(tickQueues.get(actor.uuid)===pending)tickQueues.delete(actor.uuid);}
}
async function processTick(actor,seconds,{combat=false,realtime=false,worldTime=game.time.worldTime}={}) {
  const s=actor.system;
  const updates={};
  if(!realtime&&s.survival.fatigued&&s.survival.fatigueUntil>0&&worldTime>=s.survival.fatigueUntil){updates["system.survival.fatigued"]=false;updates["system.survival.fatigueUntil"]=0;}
  let damage=0;
  for(const effect of actor.effects.filter(e=>e.active)) {
    if(!actor.effects.has(effect.id))continue;
    const data=effect.flags["jdr-runeterra"]||{};
    if(combat) {
      if(data.healPerRound)await actor.heal(data.healPerRound);
      if(data.invulnerable&&actor.system.hp.base===actor.system.hp.baseMax&&actor.system.hp.equipment>=actor.system.equipmentMax) {
        await effect.setFlag("jdr-runeterra","regenerated",true);
        for(const injury of actor.effects.filter(e=>["fracture","amputation","coma","unconscious"].some(id=>e.statuses.has(id))))await injury.delete();
      }
      if(data.reduceBleedingEachRound)for(const bleeding of actor.effects.filter(e=>e.statuses.has("bleeding"))){const level=bleeding.getFlag("jdr-runeterra","level")||1;if(level<=1)await bleeding.delete();else await bleeding.setFlag("jdr-runeterra","level",level-1);}
      if(data.damagePerRound&&(data.damageRounds===undefined||data.damageRounds>0)) {
        let amount=data.damagePerRound;
        if(data.enduranceCheck){const r=await test(actor,"endurance",{label:effect.name});if(r.result==="criticalFailure"){await actor.addCondition("coma");await effect.delete();continue;}if(r.result==="failure")amount+=5;}
        await actor.applyDamage(amount,{type:data.damageType||"neutral",zone:"area"});
        if(data.damageRounds!==undefined)await effect.update({"flags.jdr-runeterra.damageRounds":Math.max(0,data.damageRounds-1)});
      }
      if(data.remainingRounds!==undefined){if(data.remainingRounds<=1){await effect.delete();continue;}await effect.update({"flags.jdr-runeterra.remainingRounds":data.remainingRounds-1});}
    }
    if(!realtime&&seconds>0) {
      if(data.healRemaining>0) {
        const elapsed=Math.min(data.healSeconds,(data.healElapsed||0)+seconds);
        const target=Math.floor(data.healTotal*elapsed/data.healSeconds);
        const amount=Math.min(data.healRemaining,target-(data.healTotal-data.healRemaining));
        if(amount>0)await actor.heal(amount);
        await effect.update({"flags.jdr-runeterra.healElapsed":elapsed,"flags.jdr-runeterra.healRemaining":data.healRemaining-amount});
      }
      if(data.damagePerHour){const elapsed=(data.potionElapsed||0)+seconds;damage+=Math.floor(elapsed/3600)*data.damagePerHour;await effect.update({"flags.jdr-runeterra.potionElapsed":elapsed%3600});}
    }
    const flag=effect.getFlag("jdr-runeterra","level")||1;
    const dot=["bleeding","poison","burn"].find(id=>effect.statuses.has(id));
    if(dot) {
      const reduction=dot==="bleeding"?Math.max(0,...actor.effects.filter(e=>e.active).map(e=>e.getFlag("jdr-runeterra","bleedReduction")||0)):0;
      const effective=Math.max(0,flag-reduction);
      const rates=[0,2,5,10,10],intervals=[Infinity,120,60,120,60];
      let amount=0,elapsed=effect.getFlag("jdr-runeterra","elapsed")||0;
      let pending=effect.getFlag("jdr-runeterra","pending")||0;
      if(combat) {amount=setting("realtime")?pending:effective===4?(setting("dotLevel4")||10):rates[effective];pending=0;}
      else if(realtime) {elapsed+=seconds;const times=Math.floor(elapsed/intervals[effective]);pending+=times*[0,1,2,5,10][effective];elapsed%=intervals[effective];}
      if(actor.effects.some(e=>e.statuses.has("coma")||e.statuses.has("unconscious"))) amount*=setting("unconsciousDot");
      damage+=amount;
      const lost=(effect.getFlag("jdr-runeterra","lost")||0)+amount;
      await effect.update({"flags.jdr-runeterra.lost":lost,"flags.jdr-runeterra.elapsed":elapsed,"flags.jdr-runeterra.pending":pending});
      if(dot==="bleeding"&&lost>s.hp.baseMax*0.75&&!actor.effects.some(e=>e.statuses.has("coma")))await actor.addCondition("unconscious");
    }
    const inCombat=game.combats.some(c=>c.started&&c.combatants.some(combatant=>combatant.actor?.uuid===actor.uuid));
    const started=effect.start?.time??effect.duration.startTime??worldTime;
    if(!realtime&&effect.duration.expiry==="runeterra"&&!(inCombat&&data.remainingRounds!==undefined)&&effect.duration.seconds && worldTime>=started+effect.duration.seconds) await effect.delete();
  }
  if(!realtime) {
    const level=s.effectiveCold;
    if(level===3||level===4) {const interval=level===3?300:120,elapsed=s.survival.coldSeconds+seconds;damage+=Math.floor(elapsed/interval)*(level===3?1:5)*(s.species==="marean"?2:1);updates["system.survival.coldSeconds"]=elapsed%interval;}
    else updates["system.survival.coldSeconds"]=0;
    if(level===5) {updates["system.cold.lethalMinutes"]=s.cold.lethalMinutes+seconds/60;if(s.cold.lethalMinutes<10&&updates["system.cold.lethalMinutes"]>=10){await actor.addCondition("coma");await chat(actor,L("Fields.cold"),`<p>${L("Messages.lethalCold")}</p>`);}}
    else updates["system.cold.lethalMinutes"]=0;
  }
  if(realtime&&setting("survival")&&s.survival.hungry) {
    const elapsed=s.survival.activeSeconds+seconds,count=Math.floor(elapsed/3600);
    updates["system.survival.activeSeconds"]=elapsed%3600;
    updates["system.survival.hungerHours"]=s.survival.hungerHours+count;
    damage+=count*(s.effective.force<=0?20:10)*(s.survival.hydrated?0.5:1);
  }
  if(damage)await actor.applyDamage(damage,{type:"neutral",zone:"area"});
  if(Object.keys(updates).length)await actor.update(updates);
  if(combat)for(const i of actor.items.filter(i=>i.system.remainingCooldown>0))await i.update({"system.remainingCooldown":Math.max(0,i.system.remainingCooldown-1)});
}
export async function advanceTime(minutes) {
  if(!game.user.isGM||!Number.isFinite(Number(minutes))||minutes<=0)return;
  await game.time.advance(minutes*60);
  await waitForTime();
}
export function registerTime() {
  Hooks.on("updateWorldTime",async(worldTime,delta)=>{
    if(!primaryGM()||delta<=0)return;
    worldTicks=worldTicks.catch(console.error).then(async()=>{
      busy=true;try{for(const a of game.actors)await tickActor(a,delta,{worldTime});}finally{busy=false;}
    });
    return worldTicks;
  });
  Hooks.on("updateCombat",async(combat,changed)=>{
    if(!primaryGM()||!("round" in changed))return;
    if(combat.round===0){
      await (combatTicks.get(combat.id)||Promise.resolve()).catch(console.error);
      await combat.update({"flags.jdr-runeterra.processedRound":0},{render:false});
      return;
    }
    if(!combat.started||combat.round<=1)return;
    const round=combat.round,worldTime=game.time.worldTime,previous=combatTicks.get(combat.id)||Promise.resolve();
    const pending=previous.catch(console.error).then(async()=>{
      const processed=Math.max(1,combat.getFlag("jdr-runeterra","processedRound")||1);
      if(round<=processed)return;
      const actors=new Map(combat.combatants.filter(c=>c.actor).map(c=>[c.actor.uuid,c.actor]));
      for(let completed=processed;completed<round;completed++)for(const actor of actors.values())await tickActor(actor,0,{combat:true,worldTime});
      await combat.update({"flags.jdr-runeterra.processedRound":round},{render:false});
    });
    combatTicks.set(combat.id,pending);
    try{await pending;}finally{if(combatTicks.get(combat.id)===pending)combatTicks.delete(combat.id);}
  });
  // Explicitly enabled by the GM, and only the currently solicited actor accumulates IRL time.
  setInterval(async()=>{
    if(!primaryGM()||!setting("realtime")||!game.combat?.started||busy||game.paused)return;
    const actor=game.combat.combatant?.actor;if(!actor)return;
    busy=true;try{await tickActor(actor,10,{realtime:true});}finally{busy=false;}
  },10000);
}
