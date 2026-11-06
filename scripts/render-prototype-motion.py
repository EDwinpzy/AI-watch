"""Rasterize the supplied MIT VoiceOrbs geometry for API 8 image playback.
Avoids hundreds of Canvas bridge calls per frame on WATCH 4.
Source equations: prototypes/particles-nova/{orb,record-motion}.js.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import math, shutil
sin,cos,pi=math.sin,math.cos,math.pi
out=Path(__file__).resolve().parents[1]/'api8-watch/entry/src/main/js/HiWearMainAbility/common/prototype-motion'
out.mkdir(parents=True,exist_ok=True)
points=[]
for i in range(720):
 y=1-i/719*2;r=math.sqrt(1-y*y);a=pi*(3-math.sqrt(5))*i
 points.append((cos(a)*r,y,sin(a)*r,(i*.7548776662%1)*pi*2,i*.5436890126%1,i*.61803398875%1))
def save(frames,name,duration=100):
 for frame in frames:
  background=frame.getpixel((0,0))
  data=bytes(255 if pixel==background else pixel for pixel in frame.tobytes())
  frame.frombytes(data)
  palette=frame.getpalette();palette.extend([0]*(768-len(palette)));palette[765:768]=[3,3,5];frame.putpalette(palette)
 frames[0].save(out/name,save_all=True,append_images=frames[1:],duration=duration,loop=0,disposal=2,optimize=False,transparency=255)
for state in ['idle','connecting','listening','thinking','speaking','disabled','error']:
 frames=[]
 for f in range(72):
  phase=f/72*2*pi;t=phase+1.7;angle=phase
  level=.35+sin(t*3.3)**2*.45 if state in ['listening','speaking'] else .1
  base=149*(1+.04*sin(t*1.1)+(.12*level if state=='listening' else 0)-(.12*(.5+.5*sin(t*2.6))**3 if state=='thinking' else 0))
  im=Image.new('RGB',(540,540),(3,3,5));d=ImageDraw.Draw(im,'RGBA');dots=[]
  for i,(x,y,z,seed,tone,frac) in enumerate(points):
   twist=angle+((.35+level*.9)*sin(y*2.4+t*1.6) if state=='speaking' else 0)
   x1=x*cos(twist)-z*sin(twist);z1=x*sin(twist)+z*cos(twist);y1=y*cos(.32)-z1*sin(.32);z2=y*sin(.32)+z1*cos(.32);depth=(z2+1)/2;pers=.65+depth*.45;r=base
   if state=='listening':r*=1+(.04+level*.22)*(.5+.5*sin(y*4.5-t*6.5))
   if state=='speaking':r*=1-(.18+level*.4)*(.5+.5*sin(seed*3-t*3.4))**2
   xx=240+x1*r*pers;yy=240+y1*r*pers
   if state=='idle':xx+=base*.055*sin(t*.55+seed*3.7);yy+=base*.055*cos(t*.62+seed*2.9)
   if state=='connecting':
    a=i/720*2*pi+t*.7;rr=240*(.58+.13*frac)*(1+.05*sin(t+seed*1.7));xx=240+cos(a)*rr;yy=240+sin(a)*rr
   radius=(.6+depth*1.5)*1.15*1.125;xx*=1.125;yy*=1.125
   alpha=.2 if state=='disabled' else .12+depth*depth*.78
   col=(255,120,150) if state=='error' else (round(240-111*tone),round(171-31*tone),round(252-4*tone))
   dots.append((depth,xx,yy,radius,col+(round(alpha*255),)))
  for _,xx,yy,r,c in sorted(dots):d.ellipse((xx-r,yy-r,xx+r,yy+r),fill=c)
  frames.append(im.resize((270,270),Image.Resampling.LANCZOS).quantize(colors=128))
 save(frames,'orb-'+state+'.gif',140)
for live in [False,True]:
 frames=[]
 for f in range(40 if live else 1):
  t=f/40*2*pi;im=Image.new('RGB',(700,256),(3,3,5));d=ImageDraw.Draw(im,'RGBA')
  level=.3+.38*(.5+.5*sin(t*2.1))+.14*sin(t*5.3)**2 if live else 0
  for k,c in reversed(list(enumerate([(34,211,238),(232,121,249),(133,166,244),(105,226,247)]))):
   amp=(.06+.5*level if live else .006)*[1,.8,.65,.5][k]*(1-.3*(.5+.5*sin(t*[1.3,1.7,2.1,1.1][k]+[.3,2.1,4.2,5.4][k])))*135
   upper=[];lower=[]
   for j in range(120):
    u=j/119;xn=(u*2-1)*2;edge=(1-(u*2-1)**2)**2;z=(xn-[-.35,.4,.05,-.7][k]*(.55 if live else .2))/(1 if live else 1.8);env=2/(2+z**4)
    yy=amp*env**2*edge*sin((2.6+1.6*level if live else 1.6)*[1,1.3,.75,1.55][k]*xn-[.3,2.1,4.2,5.4][k]-t*(2.4 if live else .2)*[1,1.2,.85,1.4][k]);xx=14+u*322
    upper.append((xx*2,128-yy*2));lower.append((xx*2,128+yy*2))
   poly=upper+lower[::-1];d.polygon(poly,fill=c+(76,));d.line(poly+[poly[0]],fill=c+(220,),width=3)
  frames.append(im.resize((350,128),Image.Resampling.LANCZOS).quantize(colors=128))
 save(frames,'wave-'+('running' if live else 'idle')+'.gif')
shutil.copy2(Path(__file__).resolve().parents[1]/'prototypes/particles-nova/vendor/VOICEORBS-LICENSE.txt',out/'VOICEORBS-LICENSE.txt')
print('Generated',len(list(out.glob('*.gif'))),'animations')
