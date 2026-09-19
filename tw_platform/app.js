const candidates=[
  {s:"2330",n:"台積電",r:"資料接入後進行研究"},
  {s:"2317",n:"鴻海",r:"資料接入後進行研究"},
  {s:"2454",n:"聯發科",r:"資料接入後進行研究"},
  {s:"2308",n:"台達電",r:"資料接入後進行研究"},
  {s:"2881",n:"富邦金",r:"資料接入後進行研究"}
];
const root=document.getElementById("candidates");
function render(items){
  root.innerHTML=items.map(x=>`<div class="candidate"><b>${x.s} ${x.n}</b><span>${x.r}</span></div>`).join("");
}
render(candidates);
document.getElementById("scan").addEventListener("click",()=>{
  render(candidates.map(x=>({...x,r:"等待官方資料與 Data Quality Gate"})));
});