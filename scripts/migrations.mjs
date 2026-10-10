// Structural migration only: world values and custom items are never refreshed from packs.
export function itemMigration(source) {
  const s=source.system||{},updates={};
  if(s.originalRarity===undefined||!s.originalRarity)updates["system.originalRarity"]=s.rarity||"blue";
  if((s.schemaVersion||1)<2){updates["system.schemaVersion"]=2;updates["system.components"]=s.components||[];updates["system.variants"]=s.variants||[];}
  return updates;
}
export async function migrateRules() {
  if(game.users.activeGM?.id!==game.user.id)return;
  const actors=new Map(game.actors.map(a=>[a.uuid,a]));
  for(const scene of game.scenes)for(const token of scene.tokens)if(!token.actorLink&&token.actor)actors.set(token.actor.uuid,token.actor);
  for(const actor of actors.values())for(const item of actor.items){const changes=itemMigration(item.toObject());if(Object.keys(changes).length)await item.update(changes);}
  for(const item of game.items){const changes=itemMigration(item.toObject());if(Object.keys(changes).length)await item.update(changes);}
}
