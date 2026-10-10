import {test} from "node:test";
import assert from "node:assert/strict";
import {assetUpdates} from "../scripts/asset-migration.mjs";
test("migration rewrites existing portraits, HTML and arrays without changing unrelated fields",()=>{
  const old="systems/jdr-runeterra/assets/drive/animal.png",replacement="systems/jdr-runeterra/assets/drive/animal.webp";
  const source={_id:"id",img:old,system:{hp:{base:90},biography:`<img src="${old}">`,links:[old,"Actor.id"]},items:[{img:old}],flags:{other:{image:"modules/other/animal.png"}}};
  assert.deepEqual(assetUpdates(source,{"assets/drive/animal.png":"assets/drive/animal.webp"},["items"]),{img:replacement,"system.biography":`<img src="${replacement}">`,"system.links":[replacement,"Actor.id"]});
  assert.equal(source.img,old);
  assert.deepEqual(assetUpdates({...source,img:replacement,system:{hp:{base:90}}},{"assets/drive/animal.png":"assets/drive/animal.webp"},["items"]),{});
});
