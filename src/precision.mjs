/** Presentation precision only. Source model is never rounded for display. */
export function displayNumber(value, digits=2){
 const n=Number(value);
 if(!Number.isFinite(n))return '—';
 const d=Math.max(0,Math.min(4,Math.trunc(Number(digits)||0)));
 const rounded=Number(n.toFixed(d));
 return rounded.toLocaleString('zh-CN',{maximumFractionDigits:d,minimumFractionDigits:d});
}
