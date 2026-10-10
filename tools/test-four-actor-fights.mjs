import {chromium} from "playwright";
import fs from "node:fs";

fs.mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(error.stack));
page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Cannot set language fr'))errors.push(m.text());});
let report;
try {
  await page.goto('http://localhost:30014',{waitUntil:'networkidle'});
  await page.locator('[name="username"]').fill('Gamemaster');
  await page.locator('button[name="join"]').click();
  await page.waitForFunction(()=>game.ready&&game.runeterra?.tickActor);
  await page.evaluate(()=>game.canvas.initializing);
  report=await page.evaluate(async()=>{
    const checks=[],events=[],actors=[],settings={},messageIds=new Set(game.messages.map(m=>m.id));
    const check=(name,actual,expected)=>{checks.push({name,actual,expected,pass:JSON.stringify(actual)===JSON.stringify(expected)});};
    const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const until=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await sleep(100);}throw new Error('Asynchronous combat processing did not finish');};
    const nextRound=async()=>{await combat.nextRound();await until(()=>combat.getFlag('jdr-runeterra','processedRound')===combat.round);};
    const random=CONFIG.Dice.randomUniform;
    let scene,combat;
    const health=a=>({base:a.system.hp.base,equipment:a.system.hp.equipment,bonus:a.system.hp.bonus});
    const event=(label,a)=>events.push({label,actor:a.name,health:health(a),effective:{...a.system.effective},cooldowns:a.items.filter(i=>i.system.cooldown).map(i=>({name:i.name,remaining:i.system.remainingCooldown})),effects:a.effects.map(e=>({name:e.name,statuses:[...e.statuses],flags:e.flags['jdr-runeterra']}))});
    const die=async(n,fn)=>{CONFIG.Dice.randomUniform=()=>1-((n-0.5)/100);try{return await fn();}finally{CONFIG.Dice.randomUniform=random;}};
    const attack=async(a,item,n,options={})=>{
      const before=new Set(game.messages.map(m=>m.id)),result=await die(n,()=>item.use(options));
      const cards=game.messages.filter(m=>!before.has(m.id)&&m.getFlag('jdr-runeterra','source')===a.uuid);
      const card=cards.at(-1)||game.messages.contents.at(-1);
      return {result,card};
    };
    const createItem=async(a,name,type,system)=> (await a.createEmbeddedDocuments('Item',[{name,type,system}]))[0];
    const equip=async(a,item)=>{await a.equip(item);await sleep(150);};
    const damage=async(a,amount,options)=>die(50,()=>a.applyDamage(amount,options));
    const choose=async(value,fn)=>{
      const input=foundry.applications.api.DialogV2.input;foundry.applications.api.DialogV2.input=async()=>value;
      try{return await fn();}finally{foundry.applications.api.DialogV2.input=input;}
    };
    const applyCard=async(card,token,options,done)=>{
      token.object.setTarget(true,{releaseOthers:true});
      await choose(options,async()=>{const html=await card.renderHTML();html.querySelector('[data-rt-action]').click();try{await until(done);}catch(error){throw new Error(JSON.stringify({card:card.content,flags:card.flags,targets:[...game.user.targets].map(t=>({name:t.actor?.name,hp:t.actor?.system.hp})),options}));}});
      token.object.setTarget(false);
    };
    try {
      for(const [key,value] of Object.entries({survival:true,integrity:true,realtime:false,fixedResistance:'flat',progression:true,professions:true})){
        settings[key]=game.settings.get('jdr-runeterra',key);await game.settings.set('jdr-runeterra',key,value);
      }
      const pack=await game.packs.get('jdr-runeterra.equipment').getDocuments();
      const importItem=async(a,name)=>{
        const source=pack.find(i=>i.name===name);if(!source)throw new Error('Missing catalogue item '+name);
        return (await a.createEmbeddedDocuments('Item',[game.items.fromCompendium(source,{clearFolder:true})]))[0];
      };
      for(const [role,key,species,subspecies] of [['Warrior','force','minotaur',''],['Archer','perception','halfTroll','ice'],['Mage','concentration','vastaya',''],['Healer','dexterity','human','']]){
        const a=await Actor.create({name:'Fight simulation — '+role,type:'character'});actors.push(a);
        // Valid creation allocation first; species powers are configured explicitly.
        if(key!=='force')await a.update({'system.attributes.force.base':a.system.attributes[key].base,[`system.attributes.${key}.base`]:80});
        await a.update({'system.validated':true});
        await a.update({'system.species':species,'system.subspecies':subspecies});
        if(species==='vastaya')await a.update({'system.specials.first.name':'Magie vastaya'});
        check(role+' creation allocation',game.runeterra.rules.creationBudget(a.system),600);
        check(role+' source creation constraints',game.runeterra.rules.creationIssues(a.system),[]);
      }
      const [warrior,archer,mage,healer]=actors;
      const sword=await importItem(warrior,'Tranchevif'),bow=await importItem(archer,'Ofléore'),staff=await importItem(mage,'Galidarium');
      for(const [a,item] of [[warrior,sword],[archer,bow],[mage,staff]])await equip(a,item);
      const plate=await createItem(warrior,'Simulation plate','equipment',{slot:'torso',rarity:'red',hp:100,armor:10,magicResistance:0,bonuses:{force:5,mental:20},integrity:{value:200,max:200}});
      const helmet=await createItem(warrior,'Simulation helmet','equipment',{slot:'head',rarity:'blue',hp:30,armor:5,magicResistance:0,integrity:{value:100,max:100}});
      await equip(warrior,plate);await equip(warrior,helmet);
      check('equipment HP above 100',health(warrior).equipment,130);
      // Keep subsequent damage expectations independent of the equip regression.
      await warrior.update({'system.hp.equipment':130});
      const cap=await importItem(archer,'Tenue d’Explorateur Freljordien — Bonnet (R)');await equip(archer,cap);
      const robe=await createItem(mage,'Simulation warded robe','equipment',{slot:'torso',rarity:'blue',hp:20,armor:0,magicResistance:10,integrity:{value:120,max:120}});await equip(mage,robe);
      const coat=await createItem(healer,'Simulation medic coat','equipment',{slot:'torso',rarity:'blue',hp:15,armor:5,magicResistance:5,integrity:{value:100,max:100}});await equip(healer,coat);
      await healer.items.find(i=>i.type==='profession').update({name:'Soin', 'system.value':60});
      check('equipment bonus to Force',warrior.attributeValue('force'),85);
      check('permanent malus ignores equipment bonus',warrior.attributeValue('mental'),10);
      check('racial and equipment perception bonuses',archer.attributeValue('perception'),95);
      const haste=await createItem(mage,'Simulation haste','ability',{attribute:'first',damageFormula:'0',modifications:[{attribute:'force',value:10}],duration:60,cooldown:2});
      const hex=await createItem(mage,'Simulation weakening hex','ability',{attribute:'first',damageFormula:'0',targetMode:'targets',modifications:[{attribute:'force',value:-15}],duration:60,cooldown:2});
      const burst=await createItem(mage,'Simulation magic burst','ability',{attribute:'first',damageFormula:'20',damageType:'magic',cooldown:2,uses:{value:2,max:2,limited:true},dot:{kind:'burn',level:1}});
      const ultimate=await createItem(mage,'Simulation ultimate','ability',{attribute:'first',abilityKind:'ultimate',damageFormula:'25',damageType:'magic'});
      const healSpell=await createItem(healer,'Simulation recovery','ability',{attribute:'first',damageFormula:'0',healFormula:'12',cooldown:1});
      const allyHeal=await createItem(healer,'Simulation allied recovery','ability',{attribute:'first',damageFormula:'0',healFormula:'12',targetMode:'targets'});
      // Actual four-combatant tracker: the first round must not deal end-round damage.
      scene=await Scene.create({name:'Four actor fight regression',width:1600,height:1000,grid:{size:100,type:1}});
      await scene.view();await until(()=>canvas.ready&&canvas.scene?.id===scene.id);await scene.activate();
      const createdTokens=await scene.createEmbeddedDocuments('Token',actors.map((a,i)=>({name:a.name,actorId:a.id,actorLink:true,x:100+i*200,y:100,texture:{src:a.img}})));
      const tokens=actors.map(a=>createdTokens.find(t=>t.actorId===a.id));
      combat=await Combat.create({scene:scene.id});
      await combat.activate();
      await combat.createEmbeddedDocuments('Combatant',tokens.map((t,i)=>({tokenId:t.id,sceneId:scene.id,actorId:actors[i].id,initiative:4-i})));
      await archer.addCondition('bleeding',{level:1});
      const start=archer.system.health.value;await combat.startCombat();await sleep(400);
      check('starting combat does not tick bleeding',archer.system.health.value,start);
      for(const e of archer.effects)await e.delete();
      for(const a of actors)event('Round 1 start',a);
      let action=await attack(warrior,sword,50);
      check('melee success damage',action.card.getFlag('jdr-runeterra','damage'),35);
      await applyCard(action.card,tokens[2],{amount:35,type:'physical',zone:'torso',penetration:0,attenuation:0,penetrating:false},()=>mage.system.hp.base===75);
      check('physical damage button ignores RM',mage.system.hp.base,75);
      let hit;
      check('physical damage consumes equipment then base',health(mage),{base:75,equipment:0,bonus:0});
      action=await attack(healer,allyHeal,50);
      check('targeted heal waits for target application',[mage.system.hp.base,healer.system.hp.base],[75,90]);
      check('targeted heal card retains rolled healing',action.card.getFlag('jdr-runeterra','heal'),12);
      await applyCard(action.card,tokens[2],{},()=>mage.system.hp.base===87);
      check('targeted healing repairs ally, not caster',[mage.system.hp.base,healer.system.hp.base],[87,90]);
      action=await attack(archer,bow,94,{distance:100});
      check('ranged distance penalty threshold',action.result.value,90);
      check('miss does not offer damage',action.card.getFlag('jdr-runeterra','damage'),undefined);
      action=await attack(archer,bow,50,{distance:200,moving:true});
      check('ice half-troll bow uses perception after title cleanup',action.result.value,85);
      action=await attack(mage,burst,50);check('magic skill damage',action.card.getFlag('jdr-runeterra','damage'),20);
      hit=await damage(warrior,20,{type:'magic',zone:'torso'});check('magic ignores physical armor',hit.applied,20);
      await warrior.addCondition('burn',{level:1});
      await die(50,()=>healSpell.use());check('healing ability restores biological HP first',health(healer).base,90);
      check('ability consumes one charge',burst.system.uses.value,1);
      check('ability starts cooldown',burst.system.remainingCooldown,2);
      let count=game.messages.size;await burst.use();check('cooldown blocks repeat cast',game.messages.size,count);
      for(const a of actors)event('Round 1 actions',a);
      await nextRound();
      check('one cooldown tick after complete round',burst.system.remainingCooldown,1);
      check('one burn tick after complete round',health(warrior).equipment,108);
      // Boundary attacks: critical success adds 10; failure still hits; critical failure misses.
      action=await attack(warrior,sword,3);check('melee critical success damage',action.card.getFlag('jdr-runeterra','damage'),40);
      action=await attack(warrior,sword,95);check('melee ordinary failure damage',action.card.getFlag('jdr-runeterra','damage'),30);
      action=await attack(warrior,sword,99);check('melee critical failure has no damage',action.card.getFlag('jdr-runeterra','damage'),undefined);
      await die(50,()=>haste.use());check('temporary self bonus applies',mage.attributeValue('force'),60);
      check('temporary bonus duration recorded',mage.effects.find(e=>e.name===haste.name)?.duration.seconds,60);
      // The same target-modification code that chat uses, followed by source duration expiry.
      action=await attack(mage,hex,50);
      await applyCard(action.card,tokens[0],{},()=>warrior.attributeValue('force')===70);
      check('target penalty combines with equipment bonus',warrior.attributeValue('force'),70);
      await damage(warrior,10,{type:'brut',zone:'torso'});
      check('brut bypasses equipment HP',health(warrior),{base:80,equipment:108,bonus:0});
      await warrior.update({'system.armor.persistent':3,'system.armor.ephemeral':7});
      hit=await damage(warrior,30,{type:'physical',zone:'torso'});
      check('native + red gear + persistent + ephemeral ARM',hit.absorbed,25);
      check('ephemeral ARM consumed',warrior.system.armor.ephemeral,0);
      hit=await damage(warrior,15,{type:'physical',zone:'head'});check('targeted armor only uses head',hit.absorbed,11);
      await warrior.update({'system.armor.persistent':0});
      hit=await damage(warrior,20,{type:'physical',zone:'torso',penetration:8});check('numeric physical penetration',hit.absorbed,7);
      // Bruising and regeneration are independent of equipment HP.
      await warrior.heal(12);check('healing base before equipment',health(warrior),{base:90,equipment:88,bonus:0});
      const bandage=await healer.items.find(i=>i.type==='profession');
      await warrior.addCondition('bleeding',{level:2});
      await die(50,()=>game.runeterra.care(healer,{method:'bandage',target:warrior,amount:5}));
      check('medical bandage reduces bleeding by one',warrior.effects.find(e=>e.statuses.has('bleeding'))?.getFlag('jdr-runeterra','level'),1);
      await die(50,()=>game.runeterra.care(healer,{method:'cauterize',target:warrior,amount:3}));
      check('cauterization stops bleeding',warrior.effects.some(e=>e.statuses.has('bleeding')),false);
      check('cauterization damages biological HP',health(warrior).base,87);
      await nextRound();check('cooldown expires after second round',burst.system.remainingCooldown,0);
      check('timed bonuses remain active before their deadline',[mage.attributeValue('force'),warrior.attributeValue('force')],[60,70]);
      for(const a of actors)event('Round 3 start',a);
      await die(50,()=>burst.use());check('last charge consumed',burst.system.uses.value,0);
      await nextRound();await nextRound();
      count=game.messages.size;await burst.use();check('empty ability cannot cast',game.messages.size,count);
      await mage.update({'system.ultimate':1});await die(50,()=>ultimate.use());check('ultimate spends last charge',mage.system.ultimate,0);
      count=game.messages.size;await ultimate.use();check('empty ultimate cannot cast',game.messages.size,count);
      check('timed bonus and penalty expire after 60 RP seconds',[mage.attributeValue('force'),warrior.attributeValue('force')],[50,85]);
      let roundHealth=warrior.system.health.value;
      await combat.update({round:combat.round+2});await until(()=>combat.getFlag('jdr-runeterra','processedRound')===combat.round);
      check('skipping two rounds processes both damage ticks',warrior.system.health.value,roundHealth-4);
      roundHealth=warrior.system.health.value;
      await combat.previousRound();await sleep(200);check('rewinding does not repeat round damage',warrior.system.health.value,roundHealth);
      await nextRound();check('revisiting processed round does not repeat damage',warrior.system.health.value,roundHealth);
      await combat.update({round:0,turn:null});await until(()=>combat.getFlag('jdr-runeterra','processedRound')===0);
      await combat.startCombat();await sleep(100);check('restarted combat starts without damage',warrior.system.health.value,roundHealth);
      await nextRound();check('restarted combat resumes normal damage ticks',warrior.system.health.value,roundHealth-2);
      await combat.delete();combat=null;
      // Catalogue consumables: instant heal, food, delayed potion and dose cancellation.
      const potionSources=await game.packs.get('jdr-runeterra.consumables').getDocuments();
      const visionSource=potionSources.find(i=>i.system.automation==='rougeVision');
      const [vision]=await healer.createEmbeddedDocuments('Item',[game.items.fromCompendium(visionSource,{clearFolder:true})]);
      await vision.use();check('potion bonus HP',health(healer).bonus,20);check('potion Force bonus',healer.attributeValue('force'),50);
      await damage(healer,5,{type:'neutral',zone:'area'});check('bonus HP is consumed first',health(healer).bonus,15);
      const visionEffect=healer.effects.find(e=>e.getFlag('jdr-runeterra','bonusHP')!==undefined);
      await visionEffect.delete();await sleep(150);check('potion expiration removes only remaining bonus HP',health(healer).bonus,0);
      const food=await createItem(healer,'Simulation meal','consumable',{food:true,healFormula:'5',quantity:1,hydration:1});
      await healer.update({'system.hp.base':70,'system.survival.hungry':true,'system.survival.hydrated':false});await die(50,()=>food.use());
      check('consumable healing and quantity',[health(healer).base,food.system.quantity],[75,0]);
      check('meal restores hunger and hydration',[healer.system.survival.hungry,healer.system.survival.hydrated],[false,true]);
      const curasomSource=potionSources.find(i=>i.system.automation==='curasom');
      const [curasom]=await healer.createEmbeddedDocuments('Item',[game.items.fromCompendium(curasomSource,{clearFolder:true})]);
      await curasom.update({'system.quantity':2});
      await healer.update({'system.hp.base':40});await choose({tier:'2',asleep:true},()=>curasom.use());
      check('delayed potion starts without instant healing',healer.system.hp.base,40);
      check('delayed potion Reflexes malus',healer.attributeValue('reflexes'),35);
      await game.time.advance(3600);await until(()=>healer.system.hp.base===57);
      check('delayed potion half-time healing',healer.system.hp.base,57);
      await game.time.advance(3600);await until(()=>!healer.effects.some(e=>e.getFlag('jdr-runeterra','healRemaining')!==undefined));
      check('delayed potion final healing and malus expiry',[healer.system.hp.base,healer.attributeValue('reflexes')],[75,50]);
      const dose=curasom.system.quantity;await choose(null,()=>curasom.use());check('cancelled dose preserves quantity',curasom.system.quantity,dose);
      // Mechanical restriction must also apply to a generic ability, not only the heal button.
      await healer.update({'system.species':'golem'});await healer.update({'system.hp.base':60});
      const mechanicalBase=healer.system.hp.base;await die(50,()=>healSpell.use());
      check('ordinary healing ability cannot repair a machine',healer.system.hp.base,mechanicalBase);
      await healer.heal(10,{mechanical:true});check('explicit mechanical repair works',healer.system.hp.base,mechanicalBase+10);
      await healer.update({'system.species':'human'});
      // Rest: exact source values and fatigue maluses, including their expiration.
      await healer.update({'system.hp.base':50});await healer.rest(true,8);check('comfortable rest heals 10',health(healer).base,60);
      await healer.rest(false,8);check('outdoor rest heals 5',health(healer).base,65);
      await healer.rest(true,4);check('short rest applies fatigue',[healer.attributeValue('force'),healer.attributeValue('concentration'),healer.attributeValue('reflexes'),healer.attributeValue('endurance')],[35,45,40,40]);
      await healer.rest(true,8);check('full rest removes fatigue',healer.attributeValue('force'),40);
      const [expired]=await healer.createEmbeddedDocuments('ActiveEffect',[{name:'Already expired native effect',duration:{value:60,units:'seconds',expired:true},flags:{'jdr-runeterra':{attributeOverrides:{force:100},healPerRound:100}}}]);
      await expired.update({'start.time':game.time.worldTime-120,'duration.expired':true});
      check('expired effect cannot override an attribute',healer.attributeValue('force'),40);
      const expiredHealth=healer.system.health.value;await game.runeterra.tickActor(healer,0,{combat:true});
      check('expired effect cannot keep healing',healer.system.health.value,expiredHealth);await expired.delete();
      await healer.addCondition('sickness');check('sickness penalizes normal but not permanent attribute',[healer.attributeValue('dexterity'),healer.attributeValue('mental')],[75,10]);
      await die(50,()=>healer.rollAttribute('dexterity',{modifier:-10})).then(result=>check('contextual modifier stacks with sickness',result.value,65));
      for(const e of healer.effects.filter(e=>e.statuses.has('sickness')))await e.delete();
      await healer.rest(true,4);await game.time.advance(43200);await until(()=>!healer.system.survival.fatigued);
      check('short-rest fatigue expires after half a day',healer.attributeValue('force'),40);
      await healer.addCondition('fatigue');check('fatigue condition has half-day duration',healer.effects.find(e=>e.statuses.has('fatigue'))?.duration.seconds,43200);
      await game.time.advance(43200);await until(()=>!healer.effects.some(e=>e.statuses.has('fatigue')));
      check('explicit fatigue condition expires',healer.attributeValue('force'),40);
      // Protection potion grants physical zone ARM, never magic resistance.
      const [ward]=await mage.createEmbeddedDocuments('ActiveEffect',[{name:'Simulation Pommadarmur',flags:{'jdr-runeterra':{zoneArmor:{torso:10}}}}]);
      hit=await damage(mage,20,{type:'magic',zone:'torso'});check('zone ARM does not absorb magic damage',hit.absorbed,10);
      await ward.delete();
      hit=await damage(mage,20,{type:'magic',zone:'torso',penetration:8});check('magic penetration preserves native RM',hit.absorbed,6);
      // Full catalogue outfit activates its capacity bonus only while complete.
      const explorer=[];
      for(const name of ['Bonnet','Veste','Gants','Pantalon','Bottes']){const item=await importItem(archer,'Tenue d’Explorateur Freljordien — '+name+' (O)');explorer.push(item);await equip(archer,item);}
      check('complete catalogue set activates bonus',[archer.system.activeSets.length,archer.system.capacityMax],[1,40]);
      await equip(archer,explorer[3]);check('incomplete set removes bonus',[archer.system.activeSets.length,archer.system.capacityMax],[0,30]);
      // Repair and equipment turnover; swapping gear must preserve a wounded pool.
      await plate.update({'system.integrity.value':0,'system.broken':true});await sleep(200);
      check('broken equipment removes bonus',warrior.attributeValue('force'),80);
      await plate.repair(5);await sleep(200);check('repair reduces max IPV and restores item',[plate.system.integrity.max,plate.system.integrity.value,plate.system.broken],[195,195,false]);
      check('repaired equipment restores bonus',warrior.attributeValue('force'),85);
      const oldEquipment=warrior.system.hp.equipment;await equip(warrior,helmet);check('unequip reduces equipment HP by capacity',warrior.system.hp.equipment,Math.max(0,oldEquipment-30));
      for(const a of actors)event('Post-fight recovery',a);
      return {checks,events,roles:actors.map(a=>({name:a.name,species:a.system.species,equipment:a.items.filter(i=>i.system.equipped).map(i=>i.name)}))};
    }finally {
      CONFIG.Dice.randomUniform=random;
      await game.runeterra.waitForTime();
      if(combat)await combat.delete();if(scene)await scene.delete();
      for(const a of actors)if(game.actors.has(a.id))await a.delete();
      for(const m of game.messages.filter(m=>!messageIds.has(m.id)))await m.delete();
      for(const [key,value] of Object.entries(settings))await game.settings.set('jdr-runeterra',key,value);
    }
  });
  report.errors=errors;report.failed=report.checks.filter(c=>!c.pass);
  fs.writeFileSync('test-results/four-actor-fights.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({checks:report.checks.length,failed:report.failed,errors},null,2));
  if(report.failed.length||errors.length)process.exitCode=1;
} finally {await browser.close();}
