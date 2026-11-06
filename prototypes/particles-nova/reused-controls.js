import './vendor/liquidglass/components.js';

const root=document.querySelector('#content');
function upgradeButtons(){
  for(const button of root.querySelectorAll('.record-main,.record-done,.primary,.round')){
    if(button.classList.contains('glass'))continue;
    button.classList.add('glass','glass-button');
    button.setAttribute('data-glass-interactive','');
    button.setAttribute('data-glass-tone','dark');
    button.setAttribute('data-glass-bezel','14');
    if(button.matches('.record-done,.primary')){
      button.classList.add('glass-prominent');
      button.setAttribute('data-glass-tint','#3579b5');
    }
    window.LiquidGlass?.register(button);
  }
}
new MutationObserver(records=>{if(records.some(r=>r.target===root))upgradeButtons();}).observe(root,{childList:true});
upgradeButtons();
