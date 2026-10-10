import {ATTRIBUTES} from "./rules.mjs";
const F=foundry.data.fields;
const num=(initial=0,max)=>new F.NumberField({required:true,nullable:false,initial,min:0,...(max===undefined?{}:{max})});
const str=(initial="")=>new F.StringField({required:true,initial});
const bool=(initial=false)=>new F.BooleanField({initial});
const schema=o=>new F.SchemaField(o);
export class RuneterraActorModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const defaults=[80,50,50,50,50,50,40,40,40,30,20,10];
    return {
      biography:new F.HTMLField({initial:""}),notes:new F.HTMLField({initial:""}),gmNotes:new F.HTMLField({initial:""}),
      species:str("human"),subspecies:str(),region:str(),age:str(),appearance:str(),permanentMalus:str("mental"),validated:bool(),socialChoice:str("charisma"),
      attributes:schema(Object.fromEntries(ATTRIBUTES.map((k,i)=>[k,schema({base:num(defaults[i],100),bonus:new F.NumberField({initial:0})})]))),
      specials:schema({first:schema({name:str("Spécial 1"),value:num(80,100)}),second:schema({name:str("Spécial 2"),value:num(70,100)})}),
      hp:schema({base:num(90),baseMax:num(90),equipment:num(),bonus:num()}),
      armor:schema({base:num(),rating:num(),persistent:num(),ephemeral:num()}),magicResistance:schema({base:num(),rating:num(),persistent:num(),ephemeral:num()}),
      integrity:schema({damage:num(),collapsed:bool()}),
      cold:schema({ambient:num(0,5),native:num(0,4),clothing:num(0,4),elapsed:num(),lethalMinutes:num()}),
      survival:schema({hungry:bool(),hydrated:bool(true),fatigued:bool(),fatigueUntil:num(),airborne:bool(),hungerHours:num(),activeSeconds:num(),coldSeconds:num(),daysWithoutMeal:num(),mealElapsed:num(),waterLitres:num(),waterElapsed:num(),waterReduced:bool(),depletionHours:num()}),
      currency:schema({gold:num(),silver:num(),counterfeit:num()}),capacity:num(30,40),
      ultimate:num(3),companions:new F.ArrayField(str()),affinities:new F.ObjectField({initial:{}}),
      immunities:new F.ArrayField(str()),loot:str(),taming:str(),environment:str(),diet:str(),morphology:str(),
      health:new F.ObjectField({initial:{value:90,max:90}}), // Token resource persisted for core tracking.
      combatOrder:num(),schemaVersion:num(1)
    };
  }
}
export class RuneterraItemModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {return {
    description:new F.HTMLField({initial:""}),gmNotes:new F.HTMLField({initial:""}),source:str(),reference:str(),category:str(),weaponType:str(),
    quantity:num(1),slots:num(1),price:num(),rarity:str("blue"),originalRarity:str(),equipped:bool(),broken:bool(),worn:bool(),enchantmentState:str("active"),slot:str("torso"),
    bonuses:new F.ObjectField({initial:{}}),hp:num(),armor:num(),magicResistance:num(),cold:num(0,4),
    integrity:schema({value:num(),max:num(),indestructible:bool(),globalDamaged:bool(),loss:num()}),materials:new F.ArrayField(str()),fur:bool(),steelLining:bool(),
    setId:str(),setSize:num(5),setBonuses:new F.ObjectField({initial:{}}),setDescription:str(),
    attribute:str("first"),alternateAttribute:str("second"),alternateDescription:new F.HTMLField({initial:""}),
    level:num(1,4),xp:num(),practice:num(),streak:num(),value:num(60,100),guild:bool(),guildMissions:num(),guildFinal:bool(),guildRepresentative:bool(),
    abilityKind:str("skill"),damageFormula:str("10"),damageType:str("physical"),penetration:num(),penetrating:bool(),
    mode:str("melee"),range:num(),area:num(),zone:str("torso"),components:new F.ArrayField(new F.ObjectField()),variants:new F.ArrayField(new F.ObjectField()),associatedEffects:new F.ArrayField(new F.ObjectField()),powers:new F.ArrayField(new F.ObjectField()),conditions:str(),charged:bool(),singleUse:bool(),rechargeKind:str(),kitKind:str(),crafting:new F.ObjectField({initial:{}}),duration:num(),cooldown:num(),remainingCooldown:num(),
    uses:schema({value:num(1),max:num(1),limited:bool()}),healFormula:str("0"),
    modifications:new F.ArrayField(new F.ObjectField()),targetMode:str("self"),dot:schema({level:num(0,4),kind:str("bleeding"),elapsed:num(),lost:num()}),
    automation:str(),food:bool(),foodKind:str("vegetable"),preserved:bool(),acquired:new F.NumberField({required:true,nullable:false,initial:-1,min:-1}),hydration:num(),recipe:str(),dangers:str(),legal:str(),
    progress:num(),milestones:new F.ArrayField(new F.ObjectField()),links:new F.ArrayField(str()),schemaVersion:num(2)
  };}
}
