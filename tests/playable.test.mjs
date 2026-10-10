import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {attackProfile,guildEligible,kitConservation} from "../scripts/attack-data.mjs";
import {itemMigration} from "../scripts/migrations.mjs";
import {damageData} from "../tools/playable-content.mjs";
const pack=name=>JSON.parse(fs.readFileSync(`content/${name}.json`)).documents;
test("mixed damage preserves range without inventing dice; conditional component is optional",()=>{
  const s=damageData("10–15 DP et 10 DM");assert.deepEqual(s.components.map(c=>[c.formula,c.type]),[["10","physical"],["10","magic"]]);assert.equal(s.components[0].max,15);
  const conditional=damageData("10-15 DP + 5-10 DP si empalé");assert.equal(conditional.variants[0].components.length,1);assert.equal(conditional.variants[1].components.length,2);
});
test("weapon variants and initial profiles match the index",()=>{
  const weapons=pack("equipment");const aqua=weapons.find(i=>i.name.startsWith("Aqua-Lame"));assert.equal(aqua.system.variants.length,4);assert.deepEqual(aqua.system.components.map(c=>c.formula),["10","30"]);
  const sylfang=weapons.find(i=>i.name.startsWith("Sylfang"));assert.equal(sylfang.system.damageFormula,"40");assert.equal(sylfang.system.mode,"magic");assert.equal(attackProfile(sylfang.system,"sylfang60L").zone,"area");
  const dagger=weapons.find(i=>i.name.includes("Ynshaarum"));assert.equal(dagger.system.variants[1].components[0].type,"brut");assert.equal(dagger.system.variants.at(-1).mode,"ritual");
});
test("bestiary mixed attacks and ink variants survive generation",()=>{
  const creatures=pack("bestiary"),abra=creatures.find(a=>a.name==="ABRAVIF DES NEIGES");
  for(const i of abra.items.filter(i=>/Morsure|Queue/.test(i.name)))assert.deepEqual(new Set(i.system.components.map(c=>c.type)),new Set(["physical","magic"]));
  const ink=creatures.find(a=>a.name==="GEKODO").items[0].system;assert.equal(ink.variants[1].zone,"area");assert.equal(ink.associatedEffects[0].value,-30);
});
test("migration preserves custom values, IDs and old scalar behavior",()=>{
  const source={_id:"custom",system:{damageFormula:"37",damageType:"brut",rarity:"orange",bonuses:{force:7},schemaVersion:1}};
  const before=structuredClone(source),patch=itemMigration(source);assert.deepEqual(source,before);assert.equal(patch["system.originalRarity"],"orange");assert.deepEqual(patch["system.components"],[]);assert.equal(attackProfile(source.system).components[0].formula,"37");assert.deepEqual(itemMigration({system:{...source.system,schemaVersion:2,originalRarity:"orange"}}),{});
});
test("guild promotion and particular kit boundaries",()=>{
  const s={guild:true,level:4,guildMissions:10,guildFinal:true};assert.equal(guildEligible(s),false);assert.equal(guildEligible({...s,guildMissions:11}),true);
  assert.equal(kitConservation("alchemy",1,20),true);assert.equal(kitConservation("alchemy",2,31),false);assert.equal(kitConservation("alchemy",3,50),true);assert.equal(kitConservation("hunting",2,40),true);assert.equal(kitConservation("hunting",3,100),true);assert.equal(kitConservation("unknown",4,1),false);
  const rune=pack("magic").find(i=>i.type==="rune"&&i.name.startsWith("Rune de Glace /"));assert.equal(rune.system.level,1);assert.equal(rune.system.variants.at(-1).level,3);
});
test("rebuilding retains all existing document and embedded IDs",()=>{
  const baseline=JSON.parse(fs.readFileSync("tests/document-ids.json"));
  for(const [name,expected] of Object.entries(baseline)){const ids=pack(name).flatMap(d=>[d._id,...(d.items||d.pages||[]).map(i=>d._id+":"+i._id)]).sort();assert.equal(crypto.createHash("sha256").update(ids.join("\n")).digest("hex"),expected,name);}
});
