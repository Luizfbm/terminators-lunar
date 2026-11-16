import numpy as np, glob, os
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
B="/mnt/user-data/uploads/NASA PROJETO 2026/"
SFS=B+"Enhanced Topography Models for selected Lunar South Pole regions with Shape-from-Shading/"
REG={"Leibnitz Beta":("A3CLR22_10_Leibnitz_Beta_Plateau","A310"),
     "de Gerlache Rim":("A3CLR22_9_deGerlache_Rim","A309"),
     "Peak Near Shackleton":("A3CLR22_8_Peak_Near_Shackleton","A308")}
def path(reg,prod):
    d,c=REG[reg]; return f"{SFS}{d}/{d}/{c}_GLD{prod}_005.tif"
def read(reg,prod):
    im=Image.open(path(reg,prod)); t=im.tag_v2
    a=np.array(im,dtype=np.float32)
    x0,y0=t[33922][3],t[33922][4]; px=t[33550][0]
    return a,x0,y0,px
