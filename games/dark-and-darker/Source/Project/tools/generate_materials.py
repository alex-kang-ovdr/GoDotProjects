"""Generate original deterministic material atlases. No external artwork.
Rebuild dependency: numpy and Pillow. Runtime is dependency free.
"""
from pathlib import Path
import numpy as np
from PIL import Image
import base64,json
ROOT=Path(__file__).resolve().parents[1]
S=256;P=4;I=S-2*P;rng=np.random.default_rng(14013)
y,x=np.mgrid[:I,:I].astype(float);u=x/I;v=y/I

def noise(n):
 a=rng.random((n,n));X=u*n;Y=v*n;ix=X.astype(int);iy=Y.astype(int);fx=X-ix;fy=Y-iy
 fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
 return(a[iy%n,ix%n]*(1-fx)+a[iy%n,(ix+1)%n]*fx)*(1-fy)+(a[(iy+1)%n,ix%n]*(1-fx)+a[(iy+1)%n,(ix+1)%n]*fx)*fy
n4=noise(4);n12=noise(12);n40=noise(40);n100=noise(100);fine=rng.random(u.shape)
fbm=n4*.4+n12*.3+n40*.2+n100*.1
atl=np.zeros((S*2,S*4,4),dtype=np.uint8);normal=np.zeros_like(atl)
for k in range(8):
 rough=np.ones_like(u)*.85;ao=np.ones_like(u)
 if k==0:
  xx=u*3+(np.floor(v*4)%2)*.5;yy=v*4;fx=xx%1;fy=yy%1;edge=np.minimum.reduce([fx,1-fx,fy,1-fy])
  face=np.clip((edge-.014+(n100-.5)*.022+(n40-.5)*.025)/.067,0,1);b=np.sin(face*np.pi*.5)
  block=(np.sin(np.floor(xx)*42.1+np.floor(yy)*83.73)*43758.5)%1
  crack=np.exp(-abs(np.sin((u*5+v*3)*np.pi*2)+(n12-.5)*1.8)*110)*(n4>.53)*(edge>.08)
  h=b*.50+fbm*.15+fine*.009-crack*.06;gray=(.46+fbm*.32+block*.10)*(.4+.6*b)-crack*.15
  moss=np.clip((.46-n4)*3,0,.4)*(1-b*.8)
  color=np.stack([gray*(1-moss*.5),gray*(.99+moss*.1),gray*(.91-moss*.5)],-1);ao=.65+.35*face;rough=.78+n40*.18
 elif k==1:
  fx=u*2%1;fy=v*2%1;edge=np.minimum.reduce([fx,1-fx,fy,1-fy]);face=np.clip((edge-.012+(n100-.5)*.015)/.045,0,1)
  crack=np.exp(-abs(np.sin((u*3+v*2)*np.pi*2)+(n12-.5)*2)*100)*(n4>.55)
  h=.36*face+fbm*.10-crack*.06;gray=(.46+fbm*.30)*(.4+.6*face)-crack*.16;wet=np.clip((n4-.52)*4,0,1)
  color=np.stack([gray*.91,gray*.98,gray*1.02],-1)*(1-wet[...,None]*.17);rough=.9-wet*.66;ao=.62+.38*face
 elif k==2:
  grain=np.sin((u*60+np.sin(v*6.283*2)*.7+n12*.9)*6.283);fx=u*4%1;seam=np.clip(np.minimum(fx,1-fx)/.025,0,1)
  gray=(.43+fbm*.4+grain*.06)*(.35+.65*seam);color=np.stack([gray,gray*.68,gray*.36],-1);h=.18*seam+grain*.012+fbm*.07;rough=.78+n12*.2;ao=.7+.3*seam
 elif k==3:
  gray=.55+fbm*.33; color=np.stack([gray*.9,gray*.97,gray*1.04],-1);h=fbm*.08+n100*.015;rough=.28+n12*.35
 elif k==4:
  pore=np.clip((n100-.72)*6,0,1);gray=.76+fbm*.20-pore*.14
  color=np.stack([gray,gray*.91,gray*.73],-1);h=fbm*.04-pore*.01;rough=np.ones_like(u)*.8
 elif k==5:
  weave=np.sin(u*6.283*64)*np.sin(v*6.283*64)*.045;gray=.58+fbm*.24+weave
  color=np.stack([gray,gray*.79,gray*.7],-1);h=fbm*.07+weave*.15;rough=np.ones_like(u)*.98
 elif k==6:
  patina=np.clip((.5-n4)*3,0,.55);gray=.68+fbm*.25
  color=np.stack([gray*(1-patina),gray*(.79-patina*.2),gray*(.40+patina*.25)],-1);h=fbm*.04+n100*.01;rough=.25+n12*.3
 else:
  gray=.54+fbm*.29;color=np.stack([gray*.95,gray,gray*.98],-1);h=fbm*.14+n100*.01;rough=np.ones_like(u)*.87
 dx=(np.roll(h,-1,1)-np.roll(h,1,1))*4;dy=(np.roll(h,-1,0)-np.roll(h,1,0))*4
 nn=np.stack([-dx,-dy,np.ones_like(h)],-1);nn/=np.linalg.norm(nn,axis=2)[...,None]
 rgba=np.concatenate([np.clip(color*255,0,255),np.clip(ao[...,None]*255,0,255)],-1).astype('uint8')
 nr=np.concatenate([np.clip((nn*.5+.5)*255,0,255),np.clip(rough[...,None]*255,0,255)],-1).astype('uint8')
 ax=k%4*S;ay=k//4*S;atl[ay:ay+S,ax:ax+S]=np.pad(rgba,((P,P),(P,P),(0,0)),mode='wrap');normal[ay:ay+S,ax:ax+S]=np.pad(nr,((P,P),(P,P),(0,0)),mode='wrap')
Image.fromarray(atl).save(ROOT/'assets/materials_albedo.png',optimize=True)
Image.fromarray(normal).save(ROOT/'assets/materials_normal_roughness.png',optimize=True)
Image.fromarray(atl[:,:,:3]).save(ROOT/'docs/materials.png')
assets={n:'data:image/png;base64,'+base64.b64encode((ROOT/'assets'/f).read_bytes()).decode() for n,f in [('albedo','materials_albedo.png'),('normal','materials_normal_roughness.png')]}
(ROOT/'src/assets.js').write_text('/* Original procedural textures. Seed 14013; no external runtime resources. */\nwindow.CryptAssets='+json.dumps(assets)+';\n')
print('Material atlas + normal/roughness atlas generated.')
