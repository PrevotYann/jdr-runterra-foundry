import {test} from "node:test";
import assert from "node:assert/strict";
import {getField,resistances,splitCreatures,weaponDetails} from "../tools/content-parsing.mjs";
test("empty source fields never consume another heading",()=>{
  const text="LOOT : \n\nDRESSAGE : \n\nENVIRONNEMENT : Mer\nTAILLE/POIDS/ÂGE : 3m";
  assert.equal(getField(text,"LOOT"),"");assert.equal(getField(text,"DRESSAGE"),"");
  assert.equal(getField(text,"ENVIRONNEMENT"),"Mer");assert.equal(getField(text,"TAILLE / POIDS / ÂGE"),"3m");
});
test("armor and magic resistance are distinct source stats",()=>{
  assert.deepEqual(resistances("PV : 100-350 / ARM : 05-10\nACTIONS : 10 RM"),{armor:5,rm:0});
  assert.deepEqual(resistances("PV : 80-170 / ARM : 00-05 / RM : 05-10"),{armor:0,rm:5});
  assert.deepEqual(resistances("ARM-RM : 15-05"),{armor:15,rm:5});
  assert.deepEqual(resistances("ARM-RM : 30-50-30-60"),{armor:30,rm:30});
});
test("weapon metadata is removed whole, preserving name punctuation",()=>{
  assert.deepEqual(weaponDetails("Aqua-Lame en Fiole (Épée - 1 Main) - créé à Ionia [300 Or]",""),{name:"Aqua-Lame en Fiole",subtype:"Épée - 1 Main",family:"Épées"});
  assert.equal(weaponDetails("Ofléore (Grand Arc) à Felicia","").name,"Ofléore");
  assert.equal(weaponDetails("Oczkafürr (Épée Jumelle d’Oczkadrn) (Épée - 1 Main)","").subtype,"Épée Jumelle d’Oczkadrn · Épée - 1 Main");
});
test("group entries split without losing shared introduction or fields",()=>{
  const group={name:"Groupe",category:"RARE",text:"Contexte\n\nLE PREMIER :\nPremier corps\n\n- LE SECOND :\nSecond corps\nPV : 40\nLOOT :\nDRESSAGE : Facile"};
  const parts=splitCreatures(group);assert.equal(parts.length,2);assert.equal(parts[0].name,"PREMIER");
  assert.match(parts[0].text,/Contexte/);assert.match(parts[0].text,/PV : 40/);assert.doesNotMatch(parts[0].text,/Second corps/);
  assert.equal(getField(parts[1].text,"LOOT"),"");assert.equal(getField(parts[1].text,"DRESSAGE"),"Facile");
});
