import {enrichPacks} from "./playable-content.mjs";
import fs from "node:fs";
import crypto from "node:crypto";
import {ATTRIBUTES,itemIntegrity,SLOTS} from "../scripts/rules.mjs";
import {getField,resistances,splitCreatures,weaponDetails} from "./content-parsing.mjs";
const read=id=>fs.readFileSync("sources/"+id+".txt","utf8").replaceAll("\r","").replace(/^\uFEFF/,"");
const inv=JSON.parse(fs.readFileSync("sources/inventory-complete.json","utf8"));
const id=s=>crypto.createHash("sha256").update(s).digest("hex").slice(0,16);
const normalize=s=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const escape=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const taboo=s=>/magnus|héritage de magnus|heritage de magnus/i.test(s);
const packs=Object.fromEntries(["equipment","consumables","magic","bestiary","atlas","rules"].map(p=>[p,{documents:[],folders:[]}]));
const assets=new Map(),excluded=[];
const optimized=fs.existsSync("content/asset-map.json")?JSON.parse(fs.readFileSync("content/asset-map.json","utf8")):{};
const sourceIds={bestiary:"1jJI80s6ccFtrp74eKSaWgaRUgo7WTzQ2NMZ5uDGaOWw",potions:"1JIFugE5BWq0zhOhmZWeD7DIu6Qms7mnEWFz0JRXl4qY",flora:"1enIpGs5QiK58Tv2GBkiRE9boyBYBdei2mKfb2XkP2Q0",books:"1c8y3VA7p2oerNe676EYvD1kHgJBtGbvSYH-7j7GCDoQ",places:"19ErpAhhfXcxUXS3oGJ9wtsyI-OD7e8YLhwYZdnAJ3C0",index:"19VoqV6N9Kmo2m3ypyGciReNnoqtA-w8OmdjozhtU7Gg"};
const categoryNames=["COURANT","RARE","RARE +","RARE ++","RARE +++","LÉGENDAIRE","EXOTIQUE","NORMALE","FORTE","PUISSANTE","COMMUNS","RARES","UNIQUE","UNIQUES","LÉGENDAIRES","VILLES"];
function folder(pack,name,parent=null) {
  const key=id(pack+":"+parent+":"+name);
  if(!packs[pack].folders.some(f=>f._id===key))packs[pack].folders.push({_id:key,name,type:pack==="bestiary"?"Actor":["atlas","rules"].includes(pack)?"JournalEntry":"Item",folder:parent,sorting:"a",color:"#bba36c"});
  return key;
}
const ancestor=f=>{const names=[];let current=f;for(let i=0;i<12&&current;i++){names.push(current.title);current=inv.find(x=>x.id===current.parent);}return names.join(" / ");};
function illustration(name,domain) {
  const aliases={"Vière Rouge":"Vipère Rouge","Hulg'Alvirr":"Hulg'Alvir","Dague Éthérée “Ynshaarum”":"Ynchaarun","DORDÜMND":"DORMDÜMND"};
  name=aliases[name]||name;
  const needle=normalize(name.replace(/^\d+\.\s*/,"").replace(/\(.*?\)/g,""));
  let best,score=0;
  for(const f of inv.filter(f=>f.mime_type.startsWith("image/")&&!taboo(ancestor(f)))) {
    const hay=normalize(f.title.replace(/\.(png|jpg|jpeg)$/i,""));
    const words=needle.split(" ").filter(w=>w.length>3);
    const n=words.filter(w=>hay.includes(w)).length;
    const primary=normalize(f.title.split(" - ")[0].replace(/\.(png|jpg|jpeg)$/i,"").replace(/\(.*$/, ""));
    const distinctive=primary.length>3&&needle.split(" ").includes(primary)&&(domain==="bestiaire"||domain==="items"&&/ARMES/.test(ancestor(f)));
    const value=hay===needle?100:hay.startsWith(needle)&&needle.length>4?90:distinctive?85:n/Math.max(1,words.length)*50+(normalize(ancestor(f)).includes(domain)?10:0);
    if(value>score&&value>=45){score=value;best=f;}
  }
  if(!best)return "systems/jdr-runeterra/assets/icons/"+(domain==="bestiaire"?"creature":domain==="lieux"?"place":"item")+".svg";
  const ext=best.title.match(/\.(png|jpe?g)$/i)?.[1]?.toLowerCase()||"png",originalPath="assets/drive/"+best.id+"."+ext,path=optimized[originalPath]||originalPath;
  assets.set(best.id,{id:best.id,url:best.url,title:best.title,path,originalPath});
  return "systems/jdr-runeterra/"+path;
}
function html(text) {
  const fields=/^(PV|ARM|RM|TAILLE \/ POIDS \/ ÂGE|ACTIONS|RÉGIME|LOOT|DRESSAGE|ENVIRONNEMENT|PRIX|TYPE|RECETTE|DOSES|EFFETS|DANGERS|LÉGALE|POIDS|RESSOURCES|CHANCE D’APPARITION|DURÉE)\s*:\s*(.*)$/;
  return text.split(/\n\s*\n/).map(p=>{
    const match=p.trim().match(fields);
    return match?`<dl><dt>${escape(match[1])}</dt><dd>${escape(match[2])}</dd></dl>`:`<p>${escape(p.trim()).replaceAll("\n","<br>")}</p>`;
  }).join("");
}
function description(name,text,img) {return `<div class="rt-entry"><div class="rt-entry-hero"><img src="${img}" alt="${escape(name)}"><h1>${escape(name)}</h1></div>${html(text)}</div>`;}
function blocks(text) {
  let category="";
  return text.split(/_{8,}/).flatMap(block=>{
    const lines=block.trim().split("\n").map(s=>s.trim()).filter(Boolean);
    while(lines.length&&(!lines[0].includes(":")||categoryNames.includes(lines[0]))) {if(categoryNames.includes(lines[0]))category=lines[0];lines.shift();}
    if(!lines.length)return [];
    let heading=lines.shift();const name=heading.replace(/:\s*.*$/,"").replace(/^\d+\.\s*/,"").trim();
    if(!name)return [];
    return [{name,text:lines.join("\n\n"),category,heading}];
  });
}
function add(pack,doc) {
  if(taboo(doc.name+" "+JSON.stringify(doc.system||doc.pages))) {excluded.push({pack,name:doc.name,reason:"Référence à Magnus"});return;}
  if(packs[pack].documents.some(d=>d._id===doc._id))return;
  packs[pack].documents.push(doc);
}
function baseItem(name,type,text,source,category,pack="magic",key=name) {
  const img=illustration(name,category.includes("Lieu")?"lieux":"items");
  return {_id:id(pack+":"+type+":"+key),name,type,img,folder:folder(pack,category),system:{description:description(name,text,img),source:"https://docs.google.com/document/d/"+source+"/edit",reference:source+":"+key,category,damageFormula:"0",price:Number(text.match(/(?:\[|PRIX\s*:\s*)(\d+)\s*Or/i)?.[1]||0),recipe:getField(text,"RECETTE"),dangers:getField(text,"DANGERS"),legal:getField(text,"LÉGALE")}};
}
// Preserve all descriptive/taming/loot data; numeric ranges remain visible in the source.
for(const b of blocks(read(sourceIds.bestiary)).flatMap(splitCreatures)) {
  if(taboo(b.text)){excluded.push({pack:"bestiary",name:b.name,reason:"Référence à Magnus"});continue;}
  const img=illustration(b.name,"bestiaire"),hp=Number(getField(b.text,"PV").match(/\d+/)?.[0]||40);
  const {armor,rm}=resistances(b.text);
  const actionText=getField(b.text,"ACTIONS");
  const actions=actionText.split(/\s+\/\s+/).flatMap((text,index)=>{
    const dm=text.match(/(\d+)(?:[-–](\d+))?\s*(DP|DM|DB)/);
    if(!dm)return [];
    return [{_id:id(b.name+":action:"+index),name:text.split(":")[0].slice(0,80),type:"weapon",img,system:{description:html(text),attribute:"force",damageFormula:dm[1],damageType:{DP:"physical",DM:"magic",DB:"brut"}[dm[3]],mode:"melee",slots:0}}];
  });
  add("bestiary",{_id:id("creature:"+b.name),name:b.name,type:"creature",img,folder:b.group?folder("bestiary",b.group,folder("bestiary",b.category||"Créatures")):folder("bestiary",b.category||"Créatures"),prototypeToken:{name:b.name,texture:{src:img},actorLink:false,bar1:{attribute:"health"}},system:{
    biography:description(b.name,b.text,img),hp:{base:hp,baseMax:hp},armor:{rating:armor},magicResistance:{rating:rm},permanentMalus:"",
    loot:getField(b.text,"LOOT"),taming:getField(b.text,"DRESSAGE"),environment:getField(b.text,"ENVIRONNEMENT"),diet:getField(b.text,"RÉGIME"),morphology:getField(b.text,"TAILLE / POIDS / ÂGE"),
    notes:"Valeurs de combat à adapter dans les intervalles de la source. Les attributs non chiffrés restent personnalisables."
  },items:actions});
}
for(const [sourceKey,type,category] of [["potions","consumable","Potions"],["flora","resource","Flore"],["books","book","Livres"]])for(const b of blocks(read(sourceIds[sourceKey]))) {
  const pack="consumables",item=baseItem(b.name,type,b.text,sourceIds[sourceKey],category+" / "+(b.category||"Catalogue"),pack);
  if(type==="consumable") {
    const kinds={"ANTIDOTE":"antidote","CURASOM":"curasom","HUDVARM ELIXIR":"hudvarm","POMMADARMUR":"pommadarmur","RAMS CRAFFLE":"rams","RENOVIS  LIQUOR":"renovis","ROUGE VISION":"rougeVision","TOURNE-CHANCE":"tourneChance","ÉLIXIR DE FER":"iron","VIVACIUM":"vivacium","APPADRAGON":"appadragon","DIVINA RESTRUM":"divina","ELIXIR GLACE PURE":"trueIce","EXUTOIRE PERPÉTUEL":"exutoire","SANG DE L’IMMORTEL":"immortal"};
    item.system.automation=kinds[b.name]||"";
    const healing=b.text.match(/(?:\+|rend |redonne |restaure |régénère )(\d+)(?:\s*\+\s*(1D\d+))?\s*PV/i);
    if(healing)item.system.healFormula=healing[1]+(healing[2]?"+"+healing[2].toLowerCase():"");
    const strengths={NORMALE:1,FORTE:2,PUISSANTE:3,"LÉGENDAIRE":4};item.system.level=strengths[b.category]||1;
  }
  if(type==="book") item.system.milestones=[...b.text.matchAll(/^(\d+)H[^:]*:\s*(.*)$/gmi)].map(m=>({hours:Number(m[1]),text:m[2]}));
  add(pack,item);
}
// Prices and mundane supplies in the economic workbook complement the narrative catalogs.
const economy=JSON.parse(fs.readFileSync("sources/economy.json","utf8")).slice(1);
const row=n=>economy.find(r=>Number(r[0])===n)||[];
const economicSource="https://docs.google.com/spreadsheets/d/1X8UD2tZY59-HziaxJUiqc6QLIrPMGOo0Cat5wx-s6ac/edit";
const money=s=>Number(String(s).replace(",",".").match(/\d+(?:\.\d+)?/)?.[0]||0);
for(const [namesRow,pricesRow,category] of [[0,1,"Ressources végétales"],[2,3,"Ressources végétales"],[4,5,"Ressources animales"],[6,7,"Ressources animales"],[8,9,"Ressources spéciales"],[10,11,"Ressources uniques"],[12,13,"Alimentation"],[14,15,"Viandes au kilogramme"],[16,17,"Viandes à l’unité"],[22,23,"Outils & voyage"],[24,25,"Outils & voyage"],[28,29,"Matériaux au poids"],[30,31,"Matériaux au poids"]]){
  const names=row(namesRow),prices=row(pricesRow);
  for(let c=3;c<names.length;c++){
    const name=names[c]?.replaceAll("\n"," ").trim();if(!name)continue;
    if(packs.consumables.documents.some(d=>normalize(d.name)===normalize(name)))continue;
    const food=[12,14,16].includes(namesRow),text=`Conditionnement : ${name}\n\nPrix et variantes : ${prices[c]||"à définir avec le MJ"} Or. Le prix affiché utilise la première variante.\n\n${food?"Le MJ adapte les portions et les PV du repas. Les viandes sont vendues dans le conditionnement indiqué.":"Ressource ou outil du tableau économique fourni."}`;
    const existingAssets=new Set(assets.keys());
    const item=baseItem(name,food?"consumable":"resource",text,"economy",category,"consumables","economy:"+namesRow+":"+c);
    for(const key of assets.keys())if(!existingAssets.has(key))assets.delete(key);
    item.img="systems/jdr-runeterra/assets/icons/item.svg";item.system.description=description(name,text,item.img);item.system.source=economicSource;item.system.price=money(prices[c]);
    if(food){item.system.food=true;item.system.foodKind=namesRow===12?"vegetable":"meat";item.system.healFormula=/Repas/.test(name)?"5":"0";if(/Lait 1L/.test(name))item.system.hydration=1;}
    add("consumables",item);
  }
}
for(const [namesRow,pricesRow] of [[33,49],[52,68]]){
  const names=row(namesRow),prices=row(pricesRow);
  for(let c=3;c<names.length;c++){
    const needle=normalize(names[c]||"").replace(/^potion de /,"");if(!needle)continue;
    const item=packs.consumables.documents.find(d=>d.type==="consumable"&&normalize(d.name)===needle);
    if(item&&!item.system.price)item.system.price=money(prices[c]);
  }
}
add("rules",{_id:id("economy"),name:"Économie — prix, recettes et fournitures",folder:folder("rules","Aides de jeu"),pages:[{_id:id("economypage"),name:"Tableau économique",type:"text",text:{format:1,content:`<div class="rt-entry"><h1>Tableau économique</h1><p>Source : <a href="${economicSource}">tableau fourni</a>. Les variantes de prix et les dosages restent ceux du tableau. Les règles générales de création à 600 points priment sur les exemples anciens.</p><table>${economy.map(r=>`<tr>${r.slice(2).map(v=>`<td>${escape(v).replaceAll("\n","<br>")}</td>`).join("")}</tr>`).join("")}</table></div>`}}]});
const placeDocuments=[];
for(const b of blocks(read(sourceIds.places))) {
  if(taboo(b.text)){excluded.push({pack:"atlas",name:b.name,reason:"Référence à Magnus"});continue;}
  const img=illustration(b.name,"lieux"),cold=b.text.match(/Froid Niveau (\d)/)?.[1],tribe=b.text.match(/Froid Niveau \d\s*\/\s*([^/]+)/)?.[1]?.trim();
  let content=description(b.name,b.text,img);
  content=content.replace("</div>",`</div><div class="rt-entry-meta">${cold?`<span>Froid ${cold}</span>`:""}${tribe?`<span>${escape(tribe)}</span>`:""}</div>`);
  const doc={_id:id("place:"+b.name),name:b.name,img,folder:folder("atlas",cold?"Villes & régions":"Lieux & établissements"),pages:[{_id:id("placepage:"+b.name),name:b.name,type:"text",text:{format:1,content},sort:0}],flags:{"jdr-runeterra":{cold:Number(cold||0),source:sourceIds.places}}};
  placeDocuments.push(doc);add("atlas",doc);
}
// Numbered entries in the effects index are the authoritative equipment/weapon source.
const indexLines=read(sourceIds.index).split("\n");let section="",entry=null,entries=[];
for(const line of indexLines) {
  const candidate=line.match(/^(\d+)\.\s+([^:]+):\s*$/);
  const sectionMatch=candidate&&candidate[2].trim()===candidate[2].trim().toUpperCase()?candidate:null;
  if(sectionMatch){if(entry)entries.push(entry);entry=null;section=sectionMatch[1];continue;}
  const m=line.match(/^((?:L-|S-|S\.)?\d+(?:-\d+)?)\.\s+(.+)$/);
  if(m&&section) {if(entry)entries.push(entry);entry={section,code:m[1],heading:m[2],text:[]};}
  else if(entry&& !/^_{8,}/.test(line))entry.text.push(line);
}
if(entry)entries.push(entry);
const attributeFR={Force:"force","Agilité":"agility",Endurance:"endurance",Concentration:"concentration",Perception:"perception","Réflexes":"reflexes","Dextérité":"dexterity","Discrétion":"stealth",Charisme:"charisma",Persuasion:"persuasion",Intimidation:"intimidation",Mental:"mental"};
attributeFR.Concentratn="concentration";
function stats(text) {
  const data={bonuses:{}};for(const [fr,key] of Object.entries({PV:"hp",ARM:"armor",RM:"magicResistance",...attributeFR})) {
    const m=text.match(new RegExp("(?:^|[ +,]|et )([+-]?\\d+)\\s*"+fr+"(?=$|[^\\p{L}])","iu"));
    if(m){if(ATTRIBUTES.includes(key))data.bonuses[key]=Number(m[1]);else data[key]=Number(m[1]);}
  }return data;
}
for(const e of entries) {
  const text=e.text.join("\n").trim(),legacyName=e.heading.split(" [")[0].split(" - ")[0].replace(/\s*\((?:Relique|Item|Consommable|Set d’Équipement|Set d'Equipement|Tenue complète).*$/i,"").trim();
  const weapon=e.section==="3"?weaponDetails(e.heading,text):null,name=weapon?.name||legacyName;
  if(!text||["6","7","11"].includes(e.section))continue; // Potion lore is imported once; campaign grimoire and handouts stay out.
  if(taboo(name+" "+text)){excluded.push({pack:"index",name,reason:"Référence à Magnus"});continue;}
  const type={1:"relic",2:"equipment",3:"weapon",4:"enchantment",5:"consumable",8:"rune",9:"resource",10:"resource",12:"relic",13:"enchantment",14:"enchantment",15:"enchantment"}[e.section]||"resource";
  const pack=["weapon","equipment"].includes(type)?"equipment":["consumable","resource"].includes(type)?"consumables":"magic";
  const category={1:"Reliques",2:"Armures",3:"Armes",4:"Magies & enchantements",5:"Consommables",8:"Pierres runiques",9:"Ingrédients",10:"Matériaux",12:"Curiosités",13:"Cairn des esprits",14:"Enchantements",15:"Maladies"}[e.section]||"Autres";
  const key=e.section+":"+e.code+":"+legacyName,item=baseItem(name,type,e.heading+"\n\n"+text,sourceIds.index,category,pack,key);
  const legendary=e.code.startsWith("L-");item.system.rarity=legendary?"violet":"blue";if(legendary)item.system.integrity={indestructible:true};
  if(type==="equipment") {
    const pieces=[...text.matchAll(/^-\s*([^:]+)\((Tête|Torse|Mains|Main|Jambes|Pieds)\)\s*:\s*(.+)$/gm)];
    if(pieces.length) {
      const setName=name.replace(/\s*\(.*$/,""),setSize=pieces.length;
      const setFolder=folder(pack,setName,folder(pack,category));
      for(const [pieceIndex,m] of pieces.entries()) {
        const variants=m[3].split(/\s*\/\s*/);
        for(let v=0;v<variants.length;v++) {
          const rarity=legendary?"violet":["blue","red","orange"][v]||"orange";
          const slot={"Tête":"head","Torse":"torso","Mains":"hands","Main":"hands","Jambes":"legs","Pieds":"feet"}[m[2]];
          const sub=baseItem(setName+" — "+m[1].trim()+" ("+{blue:"B",red:"R",orange:"O",violet:"L"}[rarity]+")",type,m[3]+"\n\n"+text,sourceIds.index,category,pack,key+":"+pieceIndex+":"+v);
          sub.img=item.img;sub.folder=setFolder;
          const materialNames={Tissu:"cloth",Cuir:"leather",Corne:"horn",Fer:"iron",Acier:"steel",Pétricite:"petricite",Carbone:"carbon",Obsidienne:"obsidian"};
          const materials=Object.entries(materialNames).filter(([n])=>new RegExp("\\b"+n+"\\b","i").test(e.heading)).map(([,key])=>key);
          if(!materials.length)materials.push("leather","cloth");
          const fur=/Fourrure/i.test(e.heading);
          sub.system={...sub.system,...stats(variants[v]),slot,rarity,setId:setName,setSize,setDescription:text.match(/Bonus Set[^:]*:\s*(.*)/)?.[1]||"",cold:/Freljordien|Avarosan|Fourrure/.test(e.heading)?v+1:0,materials,fur,integrity:itemIntegrity(materials,rarity,slot,fur,false)};
          sub.system.integrity.value=sub.system.integrity.max;
          if(/Explorateur/.test(setName))sub.system.setBonuses={capacity:v===0?5:10};
          if(/Soldat Demacien/.test(setName))sub.system.setBonuses={hp:15};
          add(pack,sub);
        }
      }continue;
    }
    // Only unconditional numerical bonuses; situational clauses stay explicit on the item.
    if(!/(?:si |dans |avec |contre |pour |%)/i.test(text.split("\n")[0]))Object.assign(item.system,stats(text.split("\n")[0]));
    item.system.slot=/Tête/.test(e.heading)?"head":/Main/.test(e.heading)?"hands":/Jambe/.test(e.heading)?"legs":/Pied/.test(e.heading)?"feet":"torso";
    if(/Toundra/.test(name)){item.system.hp=30;item.system.bonuses={charisma:10};item.system.cold=4;}
  }
  if(type==="weapon") {
    item.system.weaponType=weapon.subtype;
    item.folder=folder(pack,weapon.family,folder(pack,category));
    const damage=text.match(/(\d+)(?:\s*\+\s*(1D\d+))?\s*(DP|DM|DB)/i);
    if(damage){item.system.damageFormula=damage[1]+(damage[2]?"+"+damage[2].toLowerCase():"");item.system.damageType={DP:"physical",DM:"magic",DB:"brut"}[damage[3].toUpperCase()];}
    item.system.mode=/Distance|Fusil|Pistolet|Arc|Harpe/.test(e.heading)?"ranged":"melee";item.system.attribute=item.system.mode==="ranged"?"perception":"force";
  }
  if(type==="rune"){item.system.level=legendary?4:/Complexe/.test(name)?3:/Avancée/.test(name)?2:1;item.system.uses={limited:true,value:1,max:1};}
  if(type==="consumable") {const h=text.match(/(?:\+|redonne |rend )(\d+)(?:\s*\+\s*(1D\d+))?\s*PV/i);if(h)item.system.healFormula=h[1]+(h[2]?"+"+h[2].toLowerCase():"");}
  add(pack,item);
}
// Piece prices and two additional mundane outfits only present in the workbook.
const priceGroups=[[/Explorateur/,73,3],[/Guerrier Avarosan/,73,12],[/Soldat Demacien/,89,3],[/Berserker/,89,6],[/Éclaireur/,89,9],[/Archer Avarosan/,89,12]];
for(const item of packs.equipment.documents.filter(d=>d.system.setId)) {
  const group=priceGroups.find(([pattern])=>pattern.test(item.system.setId));if(!group)continue;
  const tier=["blue","red","orange"].indexOf(item.system.rarity),slot=SLOTS.indexOf(item.system.slot);
  if(tier>=0&&slot>=0)item.system.price=money(row(group[1]+slot*2+1)[group[2]+tier]);
}
for(const [setName,column,materials,fur] of [["Tenue de Voleur",6,["cloth","leather"],false],["Tenue d’Ingénieur Freljordien",9,["cloth","leather"],true]]) {
  for(let tier=0;tier<3;tier++)for(const [piece,slot] of SLOTS.entries()){
    const rarity=["blue","red","orange"][tier],detail=row(73+piece*2)[column+tier],price=money(row(74+piece*2)[column+tier]);
    const name=setName+" — "+{head:"Tête",torso:"Torse",hands:"Mains",legs:"Jambes",feet:"Pieds"}[slot]+" ("+["B","R","O"][tier]+")";
    const text=`${detail}\n\nMatériaux : ${materials.join(", ")}${fur?", fourrure":""}. Prix : ${price} Or.\n\nSource : tableau économique.`;
    const img="systems/jdr-runeterra/assets/icons/item.svg",integrity=itemIntegrity(materials,rarity,slot,fur);integrity.value=integrity.max;
    add("equipment",{_id:id("economyarmor:"+name),name,type:"equipment",img,folder:folder("equipment",setName,folder("equipment","Armures")),system:{description:description(name,text,img),source:economicSource,reference:"economyarmor:"+name,category:"Armures",damageFormula:"0",...stats(detail.replaceAll("\n"," ")),price,rarity,slot,setId:setName,setSize:5,materials,fur,cold:fur?tier+1:0,integrity}});
  }
}
// Rules are split by topology into navigable pages. Remove entire Magnus-specific paragraphs.
const rulesText=fs.readFileSync("sources/rules.txt","utf8").replaceAll("\r","").replace(/^\uFEFF/,"");
const headings=["LES ATTRIBUTS","CRÉATION PERSONNAGE","MAGIE ET TECHNOLOGIE","LE SYSTÈME","ÉVOLUTION DU PERSONNAGE","LES DÉGÂTS","LES SOINS","LES EFFETS","LA SURVIE","LE COMBAT","LES RÉSISTANCES","CONSOMMABLES","ÉQUIPEMENT","MÉTIERS","GRADES ET ORDRE DE GRADE","MONTURES, FAMILIERS ET VÉHICULES"];
const lines=rulesText.split("\n"),starts=headings.map(h=>({h,index:lines.indexOf(h)})).filter(x=>x.index>=0).sort((a,b)=>a.index-b.index);
for(let i=0;i<starts.length;i++){
  const {h,index}=starts[i],text=lines.slice(index+1,starts[i+1]?.index||lines.length).join("\n").split(/\n\s*\n/).filter(p=>!taboo(p)).join("\n\n");
  add("rules",{_id:id("rule:"+h),name:h,img:"systems/jdr-runeterra/assets/icons/magic.svg",folder:folder("rules","Livre des règles"),pages:[{_id:id("rulepage:"+h),name:h,type:"text",text:{format:1,content:`<div class="rt-entry"><h1>${h}</h1>${html(text.replaceAll("________________",""))}</div>`},sort:0}]});
}
// Human-facing guides for mechanisms left to GM interpretation.
const guide=fs.existsSync("docs/guide.html")?fs.readFileSync("docs/guide.html","utf8"):"";
if(guide)add("rules",{_id:id("guide"),name:"Prise en main & arbitrages",folder:folder("rules","Aides de jeu"),pages:[{_id:id("guidepage"),name:"Prise en main",type:"text",text:{format:1,content:guide}}]});
// Deterministic UUID links across packs; do not create duplicate placeholder entries.
const targets=Object.entries(packs).flatMap(([pack,p])=>p.documents.map(d=>({pack,id:d._id,name:d.name,type:pack==="bestiary"?"Actor":["atlas","rules"].includes(pack)?"JournalEntry":"Item"})));
for(const [pack,p] of Object.entries(packs))for(const doc of p.documents) {
  const text=doc.system?.description||doc.system?.biography||doc.pages?.[0]?.text?.content||"";
  const normalizedText=normalize(text);
  const references=targets.filter(t=>t.id!==doc._id&&normalize(t.name).length>4&&normalizedText.includes(normalize(t.name))).slice(0,20);
  const linkHTML=references.length?`<div class="rt-links">${references.map(t=>`@UUID[Compendium.jdr-runeterra.${t.pack}.${t.type}.${t.id}]{${escape(t.name)}}`).join(" ")}</div>`:"";
  if(doc.system?.description)doc.system.description+=linkHTML;
  else if(doc.system?.biography)doc.system.biography+=linkHTML;
  else if(doc.pages?.[0])doc.pages[0].text.content+=linkHTML;
}
enrichPacks(packs);
fs.mkdirSync("content",{recursive:true});for(const [key,value] of Object.entries(packs))fs.writeFileSync("content/"+key+".json",JSON.stringify(value,null,2));
fs.writeFileSync("sources/asset-requests.json",JSON.stringify([...assets.values()],null,2));
fs.writeFileSync("content/exclusions.json",JSON.stringify(excluded,null,2));
fs.writeFileSync("content/provenance.json",JSON.stringify({date:"2026-10-10",sourceFolder:"121natkSnxOB76-UAPni6EVpkDrt4u588",documents:sourceIds,assets:[...assets.values()].map(({id,title,path,originalPath})=>({id,title,path,originalPath})),counts:Object.fromEntries(Object.entries(packs).map(([k,p])=>[k,p.documents.length]))},null,2));
console.log(JSON.stringify({counts:Object.fromEntries(Object.entries(packs).map(([k,p])=>[k,p.documents.length])),assets:assets.size,excluded:excluded.length}));
