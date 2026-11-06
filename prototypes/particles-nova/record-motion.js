/* Adapted from VoiceOrbs SiriWaveLine, Copyright (c) 2026 Alexis Munoz.
 * MIT: vendor/VOICEORBS-LICENSE.txt. Original TSX: vendor/siri-wave-line.original.tsx.
 * Vanilla Canvas adapter for the watch recording prototype; amplitude is simulated.
 */
(()=>{
 const host=document.querySelector('#content'),count=120,centers=[-.35,.4,.05,-.7],freqs=[1,1.3,.75,1.55],flows=[1,1.2,.85,1.4],rates=[1.3,1.7,2.1,1.1],seeds=[.3,2.1,4.2,5.4],factors=[1,.8,.65,.5];
 const palette=[[34,211,238],[232,121,249],[133,166,244],[105,226,247]];
 let cancel=()=>{},phase=0,amps=[.035,.024,.017,.012],frequency=1.6;
 function mount(){cancel();const canvas=host.querySelector('#recordWave');if(!canvas)return;canvas.setAttribute('aria-label','Siri Wave Line · 模拟语音声浪');
  const ctx=canvas.getContext('2d'),width=350,height=128,dpr=Math.min(devicePixelRatio||1,2),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;canvas.width=width*dpr;canvas.height=height*dpr;ctx.scale(dpr,dpr);
  let stopped=false,id,last=0,settle=0;const phs=seeds.map((s,i)=>s+phase*2.4*flows[i]);
  const gradient=(color,alpha)=>{const g=ctx.createLinearGradient(14,0,width-14,0);g.addColorStop(0,`rgba(${color},0)`);g.addColorStop(.18,`rgba(${color},${alpha*.55})`);g.addColorStop(.5,`rgba(${color},${alpha})`);g.addColorStop(.82,`rgba(${color},${alpha*.55})`);g.addColorStop(1,`rgba(${color},0)`);return g;};
  const lines=palette.map(c=>gradient(c.map(v=>Math.round(v+(255-v)*.3)).join(','),.9)),glows=palette.map(c=>gradient(c.join(','),.2)),fills=palette.map(c=>gradient(c.join(','),.3));
  function draw(now){if(stopped)return;const dt=last?Math.min((now-last)/1000,.05):1/60;last=now;const live=!!host.querySelector('.is-recording')&&!document.hidden;if(!document.hidden&&!reduced)phase+=dt;
   const level=live?(reduced?.45:.3+.38*(.5+.5*Math.sin(phase*2.1))+.14*Math.sin(phase*5.3)**2):0;
   const targetFreq=live?2.6+1.6*level:1.6;frequency+=(targetFreq-frequency)*(1-Math.exp(-6*dt));
   ctx.clearRect(0,0,width,height);ctx.globalCompositeOperation='source-over';ctx.fillStyle=gradient('133,166,244',live?.2:.09);ctx.fillRect(14,height/2-.5,width-28,1);
   ctx.globalCompositeOperation='lighter';for(let k=3;k>=0;k--){const target=(live?.06+.5*level:.006)*factors[k];amps[k]+=(target-amps[k])*(1-Math.exp(-(target>amps[k]?12:5)*dt));if(!reduced)phs[k]+=dt*(live?2.4:.2)*flows[k];const amp=amps[k]*(1-.3*(.5+.5*Math.sin(phase*rates[k]+seeds[k])))*135;
    const ys=[],xs=[];for(let j=0;j<count;j++){const u=j/(count-1),xn=(u*2-1)*2,edge=(1-(u*2-1)**2)**2,z=(xn-centers[k]*(live?.55:.2))/(live?1:1.8),env=2/(2+z**4);xs[j]=14+u*(width-28);ys[j]=amp*env**2*edge*Math.sin(frequency*freqs[k]*xn-phs[k]);}
    ctx.beginPath();ctx.moveTo(xs[0],height/2-ys[0]);for(let j=1;j<count;j++)ctx.lineTo(xs[j],height/2-ys[j]);for(let j=count-1;j>=0;j--)ctx.lineTo(xs[j],height/2+ys[j]);ctx.closePath();ctx.fillStyle=fills[k];ctx.fill();ctx.strokeStyle=glows[k];ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle=lines[k];ctx.lineWidth=1.4;ctx.stroke();
   }ctx.globalCompositeOperation='source-over';if(live)settle=0;else settle+=dt;if(!reduced&&(live||settle<1.6))id=requestAnimationFrame(draw);
  }
  id=requestAnimationFrame(draw);cancel=()=>{stopped=true;cancelAnimationFrame(id);};
 }
 new MutationObserver(records=>{if(records.some(r=>r.target===host))mount();}).observe(host,{childList:true});mount();document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();else mount();});
})();
