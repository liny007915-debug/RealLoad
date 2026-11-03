/** Serializable planning inputs, independent of camera, preview and cargo data. */
export function planningSettings(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('装卸计算设置格式错误');
 const doorMode=raw.doorMode??'smart',policy=raw.policy??'balanced',clearance=raw.clearance??0;
 const maxLift=raw.maxLift===undefined||raw.maxLift===null||raw.maxLift===''?null:raw.maxLift;
 if(!['smart','strict','nominal'].includes(doorMode)||!['balanced','low-lift','distance'].includes(policy)||![0,10,25,50,100].includes(clearance)||maxLift!==null&&(!Number.isFinite(maxLift)||maxLift<0))throw new Error('装卸计算设置非法，请核对路径偏好、净空及最多抬升');
 return {doorMode,clearance,policy,maxLift};
}
