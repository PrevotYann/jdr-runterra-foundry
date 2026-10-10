import fs from "node:fs";
import sharp from "sharp";
fs.mkdirSync("assets/branding",{recursive:true});
const logo=await sharp("sources/logo-jdr-runeterra.png").trim().png().toBuffer();
await sharp(logo).webp({lossless:true}).toFile("assets/branding/logo.webp");
for(const spec of [
  {key:"thumbnail",width:512,height:512,logoWidth:310,top:124},
  {key:"banner",width:1800,height:600,logoWidth:430,top:120},
  {key:"background",width:1920,height:1080,logoWidth:320,top:64}
]){
  const mark=await sharp(logo).resize({width:spec.logoWidth}).png().toBuffer();
  await sharp("sources/branding/"+spec.key+".png").resize(spec.width,spec.height,{fit:"cover"}).composite([{input:mark,left:Math.round((spec.width-spec.logoWidth)/2),top:spec.top}]).webp({quality:92,alphaQuality:100,effort:6}).toFile("assets/branding/"+spec.key+".webp");
}
console.log("Branding written to assets/branding");
