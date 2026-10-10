export function assetUpdates(source,map,embedded=[]){
  const updates={},prefix="systems/jdr-runeterra/";
  const replacements=Object.entries(map).map(([from,to])=>[prefix+from,prefix+to]);
  const rewrite=value=>{if(typeof value==="string")return replacements.reduce((s,[from,to])=>s.replaceAll(from,to),value);if(Array.isArray(value))return value.map(rewrite);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v)]));return value;};
  function visit(value,path){if(typeof value==="string"){const result=rewrite(value);if(result!==value)updates[path]=result;}else if(Array.isArray(value)){const result=rewrite(value);if(JSON.stringify(result)!==JSON.stringify(value))updates[path]=result;}else if(value&&typeof value==="object")for(const [key,child] of Object.entries(value))visit(child,path?path+"."+key:key);}
  for(const [key,value] of Object.entries(source))if(!["_id","_stats","ownership",...embedded].includes(key))visit(value,key);
  return updates;
}
export async function migrateAssets({force=false}={}){
  if(!game.user.isGM||game.users.activeGM?.id!==game.user.id)return {updated:0};
  if(!force&&game.settings.get("jdr-runeterra","assetMigration")==="webp-1")return {updated:0};
  const response=await fetch("systems/jdr-runeterra/content/asset-map.json");if(!response.ok)throw new Error("Asset migration map unavailable");
  const map=await response.json();let updated=0;
  async function migrate(document){
    const embedded=document.constructor.metadata.embedded||{};
    const changes=assetUpdates(document.toObject(),map,Object.values(embedded));
    if(Object.keys(changes).length){await document.update(changes);updated++;}
    for(const type of Object.keys(embedded))for(const child of document.getEmbeddedCollection(type))await migrate(child);
  }
  for(const collection of [game.actors,game.items,game.journal,game.scenes,game.messages,game.macros,game.tables,game.cards])if(collection)for(const document of collection)await migrate(document);
  await game.settings.set("jdr-runeterra","assetMigration","webp-1");
  if(updated)console.info("JDR Runeterra | WebP migration",updated,"documents");
  return {updated};
}
