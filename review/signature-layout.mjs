// Coordinates are stored from a fixed 900 × 240 drawing surface.
export function fitSignature(strokes,width,height,size=1){
  const points=strokes.flat();if(!points.length)return [];
  const xs=points.map(p=>p[0]*900),ys=points.map(p=>p[1]*240);
  const left=Math.min(...xs),top=Math.min(...ys),w=Math.max(1,Math.max(...xs)-left),h=Math.max(1,Math.max(...ys)-top);
  const scale=Math.min(Math.max(1,width-4)/w,Math.max(1,height-4)/h)*size;
  const x=(width-w*scale)/2,y=(height-h*scale)/2;
  return strokes.map(stroke=>stroke.map(p=>[x+(p[0]*900-left)*scale,y+(p[1]*240-top)*scale]));
}
export function signatureSize(value=1){if(!Number.isFinite(value)||value<.25||value>2)throw Object.assign(new Error('Signature size must be between 25% and 200%.'),{status:400});return value;}
