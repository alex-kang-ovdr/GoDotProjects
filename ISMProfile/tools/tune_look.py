import subprocess, sys, os, itertools
from PIL import Image
G='D:/Github/GoDotProjects/Godot_v4.7.2-stable_win64_console.exe'
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
pts={'plane1':(150,780),'plane2':(450,800),'sand':(740,650),'grass':(600,520),'snow':(780,560)}
ue=Image.open(os.path.join(root,'results/unreal/ue-run1/Profile/evidence-ISM-size48.png')).convert('RGB')
print('UE',{k:ue.getpixel(v) for k,v in pts.items()})
for tm,sun,plane in [x.split(':') for x in sys.argv[1:]]:
    out=os.path.join(root,'results/godot/tune',f'{tm}_{sun}_{plane}'); os.makedirs(out,exist_ok=True)
    subprocess.run([G,'--path',os.path.join(root,'godot'),'--rendering-method','forward_plus','--','--preview-size=48','--preview-mode=ISM',f'--tonemap={tm}',f'--sun={sun}',f'--plane={plane}',f'--out={out}'],capture_output=True)
    im=Image.open(os.path.join(out,'preview-ISM-size48.png')).convert('RGB')
    print(tm,sun,plane,{k:im.getpixel(v) for k,v in pts.items()})
