export const normalize = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Horizontal whitespace only: an empty field must not consume the next heading.
export function getField(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll(" ", "[ \\t]*");
  return text.match(new RegExp("^" + escaped + "[ \\t]*:[ \\t]*([^\\n\\r]*)", "mi"))?.[1]?.trim() || "";
}

export function resistances(text) {
  const combined = getField(text, "ARM-RM").match(/^(\d+)-(\d+)(?:-(\d+)-(\d+))?$/);
  const stats = text.split(/\n/).filter(line => /^(?:PV|ARM|RM)/.test(line)).join("\n");
  return {
    armor: Number(stats.match(/(?:^|\/[ \t]*)ARM[ \t]*:[ \t]*(\d+)/m)?.[1] || combined?.[1] || 0),
    rm: Number(stats.match(/(?:^|\/[ \t]*)RM[ \t]*:[ \t]*(\d+)/m)?.[1] || (combined?.[3] ? combined[3] : combined?.[2]) || 0)
  };
}

export function splitCreatures(block) {
  const headings = [...block.text.matchAll(/^(?:-[ \t]*)?LE[S]?[ \t]+([^\n:]+)[ \t]*:[ \t]*$/gm)];
  if (headings.length < 2) return [block];
  const introduction = block.text.slice(0, headings[0].index).trim();
  const last = block.text.slice(headings.at(-1).index);
  const statsStart = last.search(/^PV[ \t]*:/m);
  const shared = statsStart >= 0 ? last.slice(statsStart) : "";
  return headings.map((match, index) => {
    let body = block.text.slice(match.index + match[0].length, headings[index + 1]?.index ?? block.text.length).trim();
    if (index === headings.length - 1 && shared) body = body.slice(0, body.indexOf(shared)).trim();
    return {...block, name: match[1].trim(), group: block.name, text: [introduction, body, shared].filter(Boolean).join("\n\n")};
  });
}

export function weaponDetails(heading, text) {
  const groups = [...heading.matchAll(/\(([^)]*)\)/g)];
  const kind = groups.find(m => /^(?:Épée|Espadon|Lance|Trident|Bouclier|Hache|Dague|Sceptre|Bâton|Masse|Marteau|Fouet|(?:Grand |Petit )?Arc|Fusil|Pistolet|Harpe|Set|[12] Main)/i.test(m[1]));
  const name = (kind ? heading.slice(0, kind.index) : heading.split(" [")[0].split(" - ")[0]).trim();
  const subtype = (groups.filter(m=>m.index >= (kind?.index ?? Infinity)).map(m=>m[1]).join(" · ") || text.match(/^\(([^)]+)\)/)?.[1] || "").trim();
  const family = /épée|espadon/i.test(subtype) ? "Épées" : /lance|trident/i.test(subtype) ? "Lances" : /bouclier/i.test(subtype) ? "Boucliers" : /hache/i.test(subtype) ? "Haches" : /dague/i.test(subtype+" "+name) ? "Dagues" : /pistolet|fusil|arc|distance/i.test(subtype+" "+name) ? "Armes à distance" : "Autres";
  return {name, subtype, family};
}
