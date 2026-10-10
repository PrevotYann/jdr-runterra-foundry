// Backward compatible action data. Legacy scalar fields remain authoritative when no
// components are configured; migrating never copies values from a compendium.
export function attackProfile(system, variant="") {
  const selected=variant ? system.variants?.find(v=>v.id===variant) : null;
  if(variant&&!selected)throw new Error("Unknown attack variant");
  const profile={...system,...selected};
  profile.components=selected?.components??(system.components?.length?system.components:[{formula:system.damageFormula||"0",type:system.damageType||"physical",penetration:system.penetration||0,penetrating:!!system.penetrating}]);
  return profile;
}
export function validComponents(components) {
  return Array.isArray(components)&&components.length>0&&components.every(c=>typeof c.formula==="string"&&["physical","magic","brut","neutral"].includes(c.type)&&Number.isFinite(Number(c.penetration??0))&&Number(c.penetration??0)>=0);
}
export function guildEligible(s) {return s.guild&&s.level===4&&s.guildMissions>10&&s.guildFinal;}
export function kitConservation(kind,level,die) {
  const threshold=kind==="alchemy"?[0,20,30,50,0][level]:kind==="hunting"?[0,20,40,100,0][level]:0;
  return threshold>0&&die<=threshold;
}
