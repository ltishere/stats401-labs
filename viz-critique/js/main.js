// Visualization Critique and Redesign — new car prices in 40 cities (D3 v7)
// Loads the dataset and the world map from external files in ../data/.
Promise.all([
  d3.csv("data/new_car_prices_2026.csv", d3.autoType),
  d3.json("data/countries-50m.json")
]).then(([raw, topo]) => {
const data=raw.map(d=>({city:d.city,country:d.country,region:d.region,lat:d.lat,lon:d.lon,
  price:d.price_2026_usd,chg:d.change_2016_2026_pct,p16:Math.round(d.price_2026_usd/(1+d.change_2016_2026_pct/100))}));
const EU=[-11,35,40,62.5];
const inEU=d=>d.lon>=EU[0]&&d.lon<=EU[2]&&d.lat>=EU[1]&&d.lat<=EU[3];
const kfmt=v=>"$"+Math.round(v/1000)+"K";
const M={
  price:{key:"price",fmt:kfmt,dom:[32000,58000],max:65000,ticks:[0,20000,40000,60000],
    ramp:d3.interpolateRgbBasis(["#ffe38f","#f7a531","#e0621b","#a8360d"]),
    title:"Ranked by price in 2026",note:"Dashed line: median of the other 39 cities.",
    median:d3.median(data.filter(d=>d.city!=="Singapore"),d=>d.price)},
  chg:{key:"chg",fmt:v=>"+"+v+"%",dom:[0,135],max:140,ticks:[0,50,100],
    ramp:d3.interpolateRgbBasis(["#c6ecf2","#5fc0cf","#1f86a8","#1b4f86"]),
    title:"Ranked by price change, 2016 to 2026",note:"Dashed line: median of all 40 cities. Change measured in US dollars.",
    median:d3.median(data,d=>d.chg)}
};
let mode="price";
const isSG=d=>mode==="price"&&d.price>M.price.max;
const colorOf=d=>{const m=M[mode];if(isSG(d))return getComputedStyle(document.documentElement).getPropertyValue("--sg").trim();
  const t=(d[m.key]-m.dom[0])/(m.dom[1]-m.dom[0]);return m.ramp(Math.max(0,Math.min(1,t)));};

const land=topojson.feature(topo,topo.objects.countries);
const borders=topojson.mesh(topo,topo.objects.countries,(a,b)=>a!==b);
const tip=d3.select("#tip");
let hovered=null;
function setHL(city){hovered=city;
  d3.selectAll(".dot").classed("hl",d=>d.city===city).filter(d=>d.city===city).raise();
  d3.selectAll(".row").classed("hl",d=>d.city===city);}
function showTip(ev,d){const rk=ranked().findIndex(x=>x.city===d.city)+1;
  tip.html(`<b>${d.city}</b>${d.country}<br>2026: ${kfmt(d.price)} · rank ${rk} of 40<br>2016: ${kfmt(d.p16)} (derived)<br>Change: +${d.chg}%`).style("opacity",1);
  const pad=14,w=tip.node().offsetWidth,x=ev.pageX+pad+w>window.scrollX+innerWidth?ev.pageX-w-pad:ev.pageX+pad;
  tip.style("left",x+"px").style("top",(ev.pageY+pad)+"px");}
function hideTip(){tip.style("opacity",0);setHL(null);}
function bind(sel){sel.on("mouseenter mousemove",(ev,d)=>{setHL(d.city);showTip(ev,d);}).on("mouseleave",hideTip);}

function drawMap(id,W,H,proj,cities,labels,isWorld){
  const svg=d3.select(id).attr("viewBox",`0 0 ${W} ${H}`);
  const path=d3.geoPath(proj);
  svg.append("defs").append("clipPath").attr("id",id.slice(1)+"-clip").append("rect").attr("width",W).attr("height",H).attr("rx",6);
  const g=svg.append("g").attr("clip-path",`url(${id}-clip)`);
  g.append("path").datum(land).attr("d",path).attr("fill","var(--land)");
  g.append("path").datum(borders).attr("d",path).attr("fill","none").attr("stroke","var(--border)").attr("stroke-width",isWorld?.6:1);
  if(isWorld){
    svg.append("g").attr("id","spike-key").attr("transform",`translate(18,${H-14})`);
    const ring=[];for(let x=EU[0];x<=EU[2];x+=1)ring.push([x,EU[1]]);for(let x=EU[2];x>=EU[0];x-=1)ring.push([x,EU[3]]);ring.push([EU[0],EU[1]]);
    g.append("path").datum({type:"LineString",coordinates:ring}).attr("d",path).attr("fill","none").attr("stroke","var(--muted)").attr("stroke-dasharray","3 3");
    const p=proj([EU[0],EU[3]]);g.append("text").attr("class","lbl").attr("x",p[0]).attr("y",p[1]-6).style("fill","var(--muted)").text("Europe, enlarged below");
    g.selectAll(".mini").data(data.filter(inEU)).join("circle").attr("class","mini").attr("r",2.2)
      .attr("cx",d=>proj([d.lon,d.lat])[0]).attr("cy",d=>proj([d.lon,d.lat])[1]).attr("fill","var(--muted)");
  }
  const dots=g.selectAll(".dot").data(cities,d=>d.city).join("g").attr("class","dot")
    .attr("transform",d=>{const p=proj([d.lon,d.lat]);return`translate(${p[0]},${p[1]})`;});
  dots.append("circle").attr("r",9).attr("cy",-4).attr("fill","transparent");
  dots.append("path").attr("class","spk");
  dots.append("g").attr("class","sbrk");
  dots.append("circle").attr("class","base").attr("r",1.6);
  bind(dots);
  g.selectAll(".lbl.city").data(cities).join("text").attr("class","lbl city")
    .attr("x",d=>proj([d.lon,d.lat])[0]+(labels[d.city]||[9,4])[0])
    .attr("y",d=>proj([d.lon,d.lat])[1]+(labels[d.city]||[9,4])[1])
    .attr("text-anchor",d=>(labels[d.city]||[9,4,"start"])[2]||"start")
    .style("font-weight",d=>d.city==="Singapore"?600:400)
    .style("font-size",d=>d.city==="Singapore"?"14px":null)
    .text(d=>d.city==="Singapore"?"Singapore $156K":d.city);
}
const WW=720,WH=400,SPH=70;
const wproj=d3.geoEqualEarth().fitExtent([[6,52],[WW-6,WH-6]],{type:"MultiPoint",coordinates:[[-152,-38],[132,-38],[-152,66],[132,66],[-7,-38],[-7,66]]});
drawMap("#world",WW,WH,wproj,data.filter(d=>!inEU(d)),{
  "San Francisco":[-9,-1,"end"],"Los Angeles":[-9,12,"end"],"Chicago":[0,15,"middle"],
  "Boston":[9,-5,"start"],"New York":[9,12,"start"],"Johannesburg":[10,4,"start"],"Cape Town":[-10,5,"end"],
  "Cairo":[-10,6,"end"],"Tel Aviv":[9,-3,"start"],"Riyadh":[10,8,"start"],
  "Hong Kong":[-10,4,"end"],"Taipei":[9,-3,"start"],"Kuala Lumpur":[-10,-2,"end"],"Singapore":[-10,16,"end"]},true);
const EW=720,EH=540;
const eproj=d3.geoConicConformal().parallels([40,60]).rotate([-14,0]);
eproj.fitExtent([[14,84],[EW-14,EH-14]],{type:"MultiPoint",coordinates:[[EU[0],EU[1]],[EU[2],EU[1]],[EU[0],EU[3]],[EU[2],EU[3]],[14.5,EU[1]],[14.5,EU[3]]]});
drawMap("#europe",EW,EH,eproj,data.filter(inEU),{
  "Birmingham":[-10,4,"end"],"London":[-9,5,"end"],"Brussels":[0,15,"middle"],"Paris":[-10,4,"end"],
  "Geneva":[-10,4,"end"],"Zurich":[8,15,"start"],"Oslo":[-10,4,"end"],"Edinburgh":[-10,4,"end"],
  "Dublin":[-10,4,"end"],"Moscow":[-10,4,"end"],"Madrid":[0,19,"middle"],"Amsterdam":[9,-4,"start"],"Frankfurt":[-8,12,"end"]},false);

const RW=470,rowH=19,rTop=26,labX=30,barX=132,BW=265;
const RH=rTop+data.length*rowH+8;
const rsvg=d3.select("#rank").attr("viewBox",`0 0 ${RW} ${RH}`);
const axisG=rsvg.append("g");
const medG=rsvg.append("g");
const ranked=()=>data.slice().sort((a,b)=>b[M[mode].key]-a[M[mode].key]);
const rows=rsvg.append("g").selectAll(".row").data(data,d=>d.city).join("g").attr("class","row").attr("role","listitem").attr("tabindex",0)
  .attr("aria-label",d=>`${d.city}, ${kfmt(d.price)} in 2026, up ${d.chg}% since 2016`);
rows.append("rect").attr("class","bgr").attr("x",0).attr("width",RW).attr("height",rowH).attr("rx",3);
rows.append("text").attr("class","rk num").attr("x",labX-8).attr("y",13.5).attr("text-anchor","end").style("font-size","12px").style("fill","var(--muted)");
rows.append("text").attr("x",labX).attr("y",13.5).style("font-size","13.5px").style("fill","var(--ink)").text(d=>d.city);
rows.append("rect").attr("class","b").attr("x",barX).attr("y",4).attr("height",11).attr("rx",2);
rows.append("g").attr("class","brk");
rows.append("text").attr("class","val num").attr("y",13.5).style("font-size","12.5px").style("fill","var(--ink2)");
bind(rows);
rows.on("focus",(ev,d)=>{setHL(d.city);const b=ev.currentTarget.getBoundingClientRect();showTip({pageX:b.right+scrollX-200,pageY:b.bottom+scrollY},d);}).on("blur",hideTip);

function drawLegend(){
  const m=M[mode],L=d3.select("#legend");L.selectAll("*").remove();
  const gid="lg-"+mode,gr=L.append("defs").append("linearGradient").attr("id",gid);
  d3.range(0,1.01,.1).forEach(t=>gr.append("stop").attr("offset",t).attr("stop-color",m.ramp(t)));
  L.append("rect").attr("x",0).attr("y",6).attr("width",220).attr("height",10).attr("rx",2).attr("fill",`url(#${gid})`);
  L.append("text").attr("x",0).attr("y",32).style("font-size","12px").style("fill","var(--muted)").text(m.fmt(m.dom[0]).replace("+",""));
  L.append("text").attr("x",220).attr("y",32).attr("text-anchor","end").style("font-size","12px").style("fill","var(--muted)").text(m.fmt(m.dom[1])+(mode==="chg"?"+":""));
  if(mode==="price"){L.append("circle").attr("cx",244).attr("cy",11).attr("r",6).attr("fill",colorOf(data[0]));
    L.append("text").attr("x",255).attr("y",15).style("font-size","12px").style("fill","var(--ink2)").text("Off the scale");}
}
function update(anim){
  const m=M[mode],x=d3.scaleLinear([0,m.max],[0,BW]);
  const t=anim?d3.transition().duration(650).ease(d3.easeCubicInOut):d3.transition().duration(0);
  const hOf=d=>isSG(d)?SPH+22:Math.max(1,SPH*d[m.key]/m.max);
  const spike=d=>{const h=hOf(d),w=7;return`M${-w/2},0L0,${-h}L${w/2},0Z`;};
  d3.selectAll(".dot .spk").transition(t).attr("d",spike).attr("fill",colorOf);
  d3.selectAll(".dot .sbrk").each(function(d){const g=d3.select(this);g.selectAll("*").remove();
    if(isSG(d))[0,4].forEach(o=>g.append("line").attr("x1",-6).attr("x2",6).attr("y1",-SPH+2-o).attr("y2",-SPH-2-o).attr("stroke","var(--bg)").attr("stroke-width",2));});
  const key=d3.select("#spike-key");key.selectAll("*").remove();
  const kv=mode==="price"?[20000,40000,60000]:[50,100];
  kv.forEach((v,i)=>{const x=i*52,h=SPH*v/m.max;
    key.append("path").attr("d",`M${x-3.5},0L${x},${-h}L${x+3.5},0Z`).attr("fill","var(--muted)");
    key.append("text").attr("class","lbl").attr("x",x+6).attr("y",0).style("fill","var(--muted)").text(m.fmt(v).replace("+",""));});
  d3.select("#rank-title").text(m.title);d3.select("#rank-note").text(m.note);
  axisG.selectAll("*").remove();
  m.ticks.forEach(v=>{axisG.append("line").attr("x1",barX+x(v)).attr("x2",barX+x(v)).attr("y1",rTop-4).attr("y2",RH-6).attr("stroke","var(--grid)");
    axisG.append("text").attr("class","num").attr("x",barX+x(v)).attr("y",rTop-10).attr("text-anchor","middle").style("font-size","11.5px").style("fill","var(--muted)").text(v===0?(mode==="price"?"$0":"0%"):m.fmt(v).replace("+",""));});
  medG.selectAll("*").remove();
  medG.append("line").attr("x1",barX+x(m.median)).attr("x2",barX+x(m.median)).attr("y1",rTop-4).attr("y2",RH-6).attr("stroke","var(--ink2)").attr("stroke-dasharray","4 3");
  const order=ranked(),idx=new Map(order.map((d,i)=>[d.city,i]));
  rows.transition(t).attr("transform",d=>`translate(0,${rTop+idx.get(d.city)*rowH})`);
  rows.select(".rk").text(d=>idx.get(d.city)+1);
  rows.select(".b").transition(t).attr("width",d=>isSG(d)?BW+22:x(d[m.key])).attr("fill",colorOf);
  rows.select(".val").transition(t).attr("x",d=>barX+(isSG(d)?BW+22:x(d[m.key]))+6).text(d=>m.fmt(d[m.key]));
  rows.select(".brk").selectAll("*").remove();
  rows.filter(isSG).select(".brk").each(function(){const g=d3.select(this),bx=barX+BW-4;
    [0,5].forEach(o=>g.append("line").attr("x1",bx+o).attr("x2",bx+o+5).attr("y1",17).attr("y2",2).attr("stroke","var(--bg)").attr("stroke-width",2.5));});
  d3.selectAll(".lbl.city").filter(d=>d.city==="Singapore").text(mode==="price"?"Singapore $156K":"Singapore");
  drawLegend();
}
function setMode(m){mode=m;d3.select("#m-price").attr("aria-pressed",m==="price");d3.select("#m-chg").attr("aria-pressed",m==="chg");update(true);}
d3.select("#m-price").on("click",()=>setMode("price"));
d3.select("#m-chg").on("click",()=>setMode("chg"));
update(false);
}).catch(err => {
  document.getElementById("chart-error").textContent =
    "The data files could not be loaded. Open this page through a web server (for example GitHub Pages), not by double-clicking the file.";
  console.error(err);
});
