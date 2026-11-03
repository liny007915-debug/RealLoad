/** Illustrative quote arithmetic from USER-SUPPLIED rates only. Not a carrier rate. */
export function quoteEstimate({base=0,origin=0,destination=0,perCbm=0,perKg=0,currency='USD'},volumeM3,weightKg){
 const nums=[base,origin,destination,perCbm,perKg,volumeM3,weightKg].map(Number);
 if(!nums.every(Number.isFinite)||nums.some(v=>v<0))throw Error('报价输入必须是非负、有限的数值');
 const [b,o,d,c,k,v,w]=nums;
 return {currency,total:b+o+d+c*v+k*w,breakdown:{base:b,origin:o,destination:d,volumeFee:c*v,weightFee:k*w},volumeM3:v,weightKg:w};
}
