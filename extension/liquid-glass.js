/* Liquid glass: SVG displacement filter used through backdrop-filter:url(#id).
   Chromium bends the live page behind the element (lens-like edges, light RGB split); other engines fall back to
   the frosted blur declared next to it in CSS. No WebGL, no dependencies, safe under the MV3 CSP. */
globalThis.LiquidGlass=(()=>{
 const NS='http://www.w3.org/2000/svg';
 // Displacement map: neutral grey (128) in the middle, red ramps across the left/right edges and green across the
 // top/bottom edges, so pixels near the rim are pulled inward like a thick lens. Stretched to each element's box.
 const map='data:image/svg+xml,'+encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">'+
  '<defs><linearGradient id="x" x1="0" x2="1"><stop offset="0" stop-color="#ff0000"/><stop offset=".14" stop-color="#800000"/><stop offset=".86" stop-color="#800000"/><stop offset="1" stop-color="#000000"/></linearGradient>'+
  '<linearGradient id="y" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#00ff00"/><stop offset=".14" stop-color="#008000"/><stop offset=".86" stop-color="#008000"/><stop offset="1" stop-color="#000000"/></linearGradient></defs>'+
  '<rect width="200" height="200" fill="url(#x)"/><rect width="200" height="200" fill="url(#y)" style="mix-blend-mode:screen"/><rect width="200" height="200" fill="#000080" style="mix-blend-mode:screen"/></svg>');
 function filter(id,scale){
  // Units are fractions of the element box, so a small button bends proportionally less than a big panel.
  // Three displacement passes with slightly different strength give the chromatic fringe at the rim.
  const pass=(channel,s,matrix)=>`<feDisplacementMap in="SourceGraphic" in2="map" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="d${channel}"/><feColorMatrix in="d${channel}" type="matrix" values="${matrix}" result="c${channel}"/>`;
  return `<filter id="${id}" x="0" y="0" width="1" height="1" filterUnits="objectBoundingBox" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB">`+
   `<feImage href="${map}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map"/>`+
   pass('r',scale,'1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0')+pass('g',scale*.94,'0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0')+pass('b',scale*.88,'0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0')+
   '<feBlend in="cr" in2="cg" mode="screen" result="rg"/><feBlend in="rg" in2="cb" mode="screen"/></filter>';
 }
 function install(root=document.body){
  if(!root||root.querySelector?.('#ip-liquid-defs'))return;
  const svg=document.createElementNS(NS,'svg');svg.id='ip-liquid-defs';svg.setAttribute('aria-hidden','true');
  svg.setAttribute('style','position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  svg.innerHTML='<defs>'+filter('ip-liquid',.09)+filter('ip-liquid-soft',.05)+'</defs>';
  root.append(svg);
 }
 return {install};
})();
