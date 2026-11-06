"""Create the five explicit-state control icons at 3x native display resolution."""
from pathlib import Path
from PIL import Image,ImageDraw
out=Path(__file__).resolve().parents[1]/'api8-watch/entry/src/main/js/HiWearMainAbility/common/control-icons'
out.mkdir(exist_ok=True)
for name in ['mic','mic-off','volume','volume-off','close']:
 im=Image.new('RGBA',(96,96));d=ImageDraw.Draw(im);color='#ff9aae' if name=='close' else '#e6f1ff';w=7
 def line(points):d.line([(int(x*4),int(y*4)) for x,y in points],fill=color,width=w,joint='curve')
 if name.startswith('mic'):
  d.rounded_rectangle((36,8,60,60),radius=12,outline=color,width=w)
  d.arc((20,20,76,80),0,180,fill=color,width=w)
  line([(5,10),(5,12)]);line([(19,10),(19,12)]);line([(12,19),(12,22)]);line([(8,22),(16,22)])
 elif name.startswith('volume'):
  line([(4,9),(4,15),(8,15),(13,19),(13,5),(8,9),(4,9)])
  if name=='volume':
   d.arc((46,26,74,70),-60,60,fill=color,width=w)
   d.arc((48,13,90,83),-65,65,fill=color,width=w)
  else:line([(17,9),(22,15)]);line([(22,9),(17,15)])
 else:line([(6,6),(18,18)]);line([(18,6),(6,18)])
 if name=='mic-off':line([(3,3),(21,21)])
 im.save(out/(name+'.png'))
print('5 icons generated')
