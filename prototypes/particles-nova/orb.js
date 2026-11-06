/* Adapted from VoiceOrbs ParticlesOrb, Copyright (c) 2026 Alexis Munoz.
 * MIT license: vendor/VOICEORBS-LICENSE.txt. Vanilla canvas adapter for this prototype.
 */
window.ParticleOrb = class {
  constructor(canvas,state='idle') {
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.state=state;this.ring=0;this.angle=0;this.level=0;this.swell=0;this.time=0;this.last=0;this.stopped=false;
    this.points=Array.from({length:720},(_,i)=>{const y=1-i/719*2,r=Math.sqrt(1-y*y),a=Math.PI*(3-Math.sqrt(5))*i;return{x:Math.cos(a)*r,y,z:Math.sin(a)*r,seed:(i*.7548776662%1)*Math.PI*2,tone:i*.5436890126%1,frac:i*.61803398875%1};});
    const dpr=Math.min(devicePixelRatio||1,2);canvas.width=480*dpr;canvas.height=480*dpr;this.ctx.scale(dpr,dpr);this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.frame=this.frame.bind(this);this.id=requestAnimationFrame(this.frame);
  }
  setState(state){this.state=state;}
  destroy(){this.stopped=true;cancelAnimationFrame(this.id);}
  frame(now){if(this.stopped)return;const dt=this.last?Math.min((now-this.last)/1000,.05):0;this.last=now;if(!document.hidden)this.time+=this.reduced?0:dt;const t=this.time+1.7,s=this.state,ctx=this.ctx,center=240;
    const ease=this.reduced?1:1-Math.exp(-dt*5);this.ring+=(Number(s==='connecting')-this.ring)*ease;
    const level=s==='listening'||s==='speaking'?.35+Math.sin(t*3.3)**2*.45:.1;
    const spin={idle:.14,connecting:.3,listening:.55,thinking:.32,speaking:.24,disabled:0,error:.08}[s]||.14;
    this.angle+=dt*spin;const angle=this.angle,base=149*(1+.04*Math.sin(t*1.1)+(s==='listening'?.12*level:0)-(s==='thinking'?.12*(.5+.5*Math.sin(t*2.6))**3:0));
    ctx.clearRect(0,0,480,480);const glow=ctx.createRadialGradient(240,240,12,240,240,180);glow.addColorStop(0,'rgba(150,110,250,.07)');glow.addColorStop(1,'rgba(90,90,240,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,480,480);ctx.globalCompositeOperation='lighter';
    const dots=this.points.map((p,i)=>{const twist=angle+(s==='speaking'?(.35+level*.9)*Math.sin(p.y*2.4+t*1.6):0),cx=Math.cos(twist),sx=Math.sin(twist),x1=p.x*cx-p.z*sx,z1=p.x*sx+p.z*cx,y1=p.y*Math.cos(.32)-z1*Math.sin(.32),z2=p.y*Math.sin(.32)+z1*Math.cos(.32),depth=(z2+1)/2,pers=.65+depth*.45;
      let r=base;if(s==='listening')r*=1+(.04+level*.22)*(.5+.5*Math.sin(p.y*4.5-t*6.5));if(s==='speaking')r*=1-(.18+level*.4)*(.5+.5*Math.sin(p.seed*3-t*3.4))**2;
      let x=center+x1*r*pers,y=center+y1*r*pers;
      if(s==='idle'){x+=base*.055*Math.sin(t*.55+p.seed*3.7);y+=base*.055*Math.cos(t*.62+p.seed*2.9);}
      const a=i/720*Math.PI*2+t*.7,rr=center*(.58+.13*p.frac)*(1+.05*Math.sin(t+p.seed*1.7));x+=(center+Math.cos(a)*rr-x)*this.ring;y+=(center+Math.sin(a)*rr-y)*this.ring;
      return{x,y,depth,r:.6+depth*1.5,tone:p.tone};}).sort((a,b)=>a.depth-b.depth);
    for(const p of dots){const a=s==='disabled'?.2:.12+p.depth*p.depth*.78;ctx.fillStyle=s==='error'?`rgba(255,120,150,${a})`:`rgba(${Math.round(240+(129-240)*p.tone)},${Math.round(171+(140-171)*p.tone)},${Math.round(252+(248-252)*p.tone)},${a})`;ctx.beginPath();ctx.arc(p.x,p.y,p.r*1.15,0,Math.PI*2);ctx.fill();}
    ctx.globalCompositeOperation='source-over';this.id=requestAnimationFrame(this.frame);
  }
};
