import {chromium} from "playwright";
import fs from "node:fs";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on("pageerror",e=>errors.push(e.stack));
try{
  await page.goto("http://localhost:30014",{waitUntil:"networkidle"});
  await page.locator('[name="username"]').fill("Gamemaster");await page.locator('button[name="join"]').click();
  await page.waitForFunction(()=>game.ready&&game.runeterra?.tickActor);
  const checks=await page.evaluate(async()=>{
    const checks=[],assert=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);};
    const a=await Actor.create({name:"Chat and malus verification",type:"character"});globalThis.rtChatActor=a;
    const pack=game.packs.get("jdr-runeterra.equipment");await pack.getDocuments();
    const source=pack.find(i=>i.name==="Tranchevif");
    const [weapon]=await a.createEmbeddedDocuments("Item",[game.items.fromCompendium(source,{clearFolder:true})]);
    const random=CONFIG.Dice.randomUniform;
    try{
      for(const [die,mode,magic,expected] of [[81,"melee",false,30],[50,"melee",false,35],[99,"melee",false,null],[81,"ranged",false,null],[81,"melee",true,null]]){
        await weapon.update({"system.mode":mode});
        CONFIG.Dice.randomUniform=()=>1-((die-0.5)/100);
        const before=new Set(game.messages.map(m=>m.id));await weapon.use({magic});
        const messages=game.messages.filter(m=>!before.has(m.id)),card=messages[0];
        assert(`${die}, ${mode}, magic=${magic}: one card`,messages.length===1);
        assert(`${die}, ${mode}, magic=${magic}: correct damage (actual=${card.getFlag("jdr-runeterra","damage")}, formula=${weapon.system.damageFormula}, roll=${card.rolls[0]?.total}, threshold=${a.attributeValue('force')})`,expected===null?card.getFlag("jdr-runeterra","damage")===undefined:card.getFlag("jdr-runeterra","damage")===expected);
        assert(`${die}, ${mode}, magic=${magic}: apply button matches hit`,card.content.includes('data-rt-action="damage"')===(expected!==null));
        assert(`${die}, ${mode}, magic=${magic}: dice retained`,card.rolls.length===(expected===null?1:2));
        if(die===81&&mode==="melee"&&!magic){assert("failed Force check explained",card.content.includes("aucun bonus"));globalThis.rtChatCard=card;}
      }
    }finally{CONFIG.Dice.randomUniform=random;}
    await a.sheet.render({force:true});return checks;
  });
  const sheet=page.locator('.rt-actor').filter({has:page.locator('[name="system.permanentMalus"]')});
  await sheet.locator('[name="system.permanentMalus"]').selectOption("agility");
  const preview=await page.evaluate(()=>{
    const el=rtChatActor.sheet.element,base=k=>el.querySelector(`[name="system.attributes.${k}.base"]`),card=k=>base(k).closest('.rt-attribute');
    return {agility:base('agility').value,mental:base('mental').value,locked:base('agility').readOnly,unlocked:!base('mental').readOnly,icon:!!card('agility').querySelector('.fa-lock'),oldIcon:!!card('mental').querySelector('.fa-lock'),value:card('agility').querySelector('strong').textContent};
  });
  if(preview.agility!=="10"||preview.mental!=="50"||!preview.locked||!preview.unlocked||!preview.icon||preview.oldIcon||preview.value!=="10%")throw new Error(JSON.stringify(preview));
  checks.push("malus selection moves lock, swaps bases and updates total immediately");
  await sheet.locator('[type="submit"]').click();await page.waitForFunction(()=>rtChatActor.system.permanentMalus==="agility"&&rtChatActor.system.attributes.agility.base===10);
  await sheet.locator('[data-action="validate"]').click();await page.waitForFunction(()=>rtChatActor.system.validated);
  if(await sheet.locator('[name="system.permanentMalus"]').isEnabled())throw new Error("malus editable after creation");
  checks.push("malus persists and freezes after creation");
  await page.waitForSelector(`[data-message-id="${await page.evaluate(()=>rtChatCard.id)}"].rt-message`);
  await page.locator(`#chat [data-message-id="${await page.evaluate(()=>rtChatCard.id)}"]`).scrollIntoViewIfNeeded();
  const color=await page.locator(`#chat [data-message-id="${await page.evaluate(()=>rtChatCard.id)}"]`).evaluate(el=>getComputedStyle(el).color);
  if(color!=="rgb(233, 231, 224)")throw new Error("chat style missing: "+color);
  // Reproduce a renderer without hook classes and a late theme stylesheet.
  await page.addStyleTag({content:'body #chat .chat-message {background: url("/ui/parchment.jpg") repeat; color: black} body #chat .chat-message .dice-total {background: white; color: black}'});
  const appearance=await page.locator(`#chat [data-message-id="${await page.evaluate(()=>rtChatCard.id)}"]`).evaluate(el=>{
    el.classList.remove('runeterra','rt-message');
    const style=getComputedStyle(el),dice=getComputedStyle(el.querySelector('.dice-total'));
    return {background:style.backgroundImage,color:style.color,diceBackground:dice.backgroundColor,diceColor:dice.color,header:getComputedStyle(el.querySelector('.message-header')).color};
  });
  if(!appearance.background.includes('linear-gradient')||appearance.background.includes('parchment')||appearance.color!=='rgb(233, 231, 224)'||appearance.diceBackground!=='rgb(16, 24, 32)'||appearance.diceColor!=='rgb(203, 183, 128)'||appearance.header!=='rgb(162, 169, 177)')throw new Error('theme overrides chat: '+JSON.stringify(appearance));
  checks.push('dark chat and dice survive late theme styles without render-hook classes');
  await page.evaluate(async()=>{globalThis.rtPlainCard=await ChatMessage.create({content:'Plain chat style verification'});});
  const plain=page.locator(`#chat [data-message-id="${await page.evaluate(()=>rtPlainCard.id)}"]`);
  await plain.waitFor();
  const plainBackground=await plain.evaluate(el=>{el.classList.remove('runeterra','rt-message');return getComputedStyle(el).backgroundImage;});
  if(!plainBackground.includes('linear-gradient'))throw new Error('plain chat lacks dark background');
  checks.push('plain chat shares the dark sheet styling');
  await page.evaluate(async()=>{await rtChatActor.sheet.close();});
  await page.locator(`#chat [data-message-id="${await page.evaluate(()=>rtChatCard.id)}"]`).screenshot({path:'test-results/chat-dark-card.png'});
  await page.screenshot({path:"test-results/chat-and-malus.png",fullPage:true});
  await page.evaluate(async()=>{await rtPlainCard.delete();await rtChatActor.delete();});
  if(errors.length)throw new Error(errors.join("\n"));
  fs.writeFileSync("test-results/chat-and-malus.json",JSON.stringify({checks,preview,color,appearance,errors},null,2));console.log(JSON.stringify({checks,preview,color,appearance,errors}));
}finally{await browser.close();}
