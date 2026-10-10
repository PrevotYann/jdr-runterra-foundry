import fs from "node:fs";
const paths={item:"M24 15 39 24 24 41 9 24Z M24 15v26 M9 24l15 6 15-6",magic:"M24 8 28 20 40 24 28 28 24 40 20 28 8 24 20 20Z",creature:"M12 31 9 14 20 20 28 20 39 14 36 31 24 41Z M17 27h3 M28 27h3 M21 33l3 3 3-3",place:"M8 40h32 M11 40V23l13-14 13 14v17 M18 40V28h12v12",condition:"M24 8 40 36H8Z M24 18v10 M24 32v2",damage:"M24 8c0 10-13 15-13 25a13 13 0 0 0 26 0C37 23 24 18 24 8Z"};
fs.mkdirSync("assets/icons",{recursive:true});
for(const [name,p] of Object.entries(paths))fs.writeFileSync("assets/icons/"+name+".svg",`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="#192630"/><path d="${p}" fill="none" stroke="#cbb780" stroke-width="2" stroke-linejoin="round"/></svg>`);
