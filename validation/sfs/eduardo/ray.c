// Horizon ray-marcher, bilinear, two-layer (fine raster with fallback to coarse), spherical curvature.
#include <math.h>
#include <stdlib.h>
#include <omp.h>
typedef struct { const float *a; int nx, ny; double px, xc0, yc0; } Ras;   // x(col)=xc0+col*px ; y(row)=yc0-row*px
static int samp(const Ras *r, double x, double y, double *out){
    if(!r->a) return 0;
    double c=(x-r->xc0)/r->px, rw=(r->yc0-y)/r->px;
    int c0=(int)floor(c), r0=(int)floor(rw);
    if(c0<0||r0<0||c0>=r->nx-1||r0>=r->ny-1) return 0;
    double fc=c-c0, fr=rw-r0;
    const float *p=r->a+(size_t)r0*r->nx+c0;
    float a=p[0],b=p[1],cc=p[r->nx],d=p[r->nx+1];
    if(a!=a||b!=b||cc!=cc||d!=d) return 0;
    *out=(a*(1-fc)+b*fc)*(1-fr)+(cc*(1-fc)+d*fc)*fr;
    return 1;
}
static int samp2(const Ras *f,const Ras *c,double x,double y,double *o){ return samp(f,x,y,o)||samp(c,x,y,o); }

// sites: n x 2 (x,y in m). out: n x naz (degrees). curv: 1=spherical, 0=flat (engine legacy)
void horizons(const float*fa,int fnx,int fny,double fpx,double fxc0,double fyc0,
              const float*ca,int cnx,int cny,double cpx,double cxc0,double cyc0,
              const double*sites,int n,int naz,double obs,double dmax,double R,int curv,double*out,double*h0out){
    Ras F={fa,fnx,fny,fpx,fxc0,fyc0}, C={ca,cnx,cny,cpx,cxc0,cyc0};
    #pragma omp parallel for schedule(dynamic,4)
    for(int s=0;s<n;s++){
        double sx=sites[2*s], sy=sites[2*s+1], h0=0;
        if(!samp2(&F,&C,sx,sy,&h0)){ for(int k=0;k<naz;k++) out[(size_t)s*naz+k]=-90; h0out[s]=NAN; continue; }
        h0out[s]=h0;
        double lam=atan2(sx,sy);                 // site longitude (plane)
        for(int k=0;k<naz;k++){
            double az=2*M_PI*k/naz, ux=sin(lam+az), uy=cos(lam+az);
            double best=-1e30; double d=5.0; int miss=0;
            while(d<=dmax){
                double h;
                if(samp2(&F,&C,sx+ux*d,sy+uy*d,&h)){
                    miss=0; double t;
                    if(curv){ double th=d/R; double num=(R+h)*cos(th)-(R+h0+obs), den=(R+h)*sin(th); t=num/den; }
                    else t=(h-h0-obs)/d;
                    if(t>best) best=t;
                } else if(++miss>50) break;
                d += (d<3000)?5.0:(d<8000)?10.0:20.0;
            }
            out[(size_t)s*naz+k]= best<-1e29 ? -90.0 : atan(best)*180.0/M_PI;
        }
    }
}

// horizonte numa direcao por sitio: ang[s] = angulo (rad) do vetor unitario (sin ang, cos ang) no plano estereografico
void horizon_dir(const float*fa,int fnx,int fny,double fpx,double fxc0,double fyc0,
              const float*ca,int cnx,int cny,double cpx,double cxc0,double cyc0,
              const double*sites,const double*ang,int n,double obs,double dmax,double R,double*out){
    Ras F={fa,fnx,fny,fpx,fxc0,fyc0}, C={ca,cnx,cny,cpx,cxc0,cyc0};
    #pragma omp parallel for schedule(dynamic,16)
    for(int s=0;s<n;s++){
        double sx=sites[2*s], sy=sites[2*s+1], h0=0;
        if(!samp2(&F,&C,sx,sy,&h0)){ out[s]=NAN; continue; }
        double ux=sin(ang[s]), uy=cos(ang[s]), best=-1e30, d=5.0; int miss=0;
        while(d<=dmax){
            double h;
            if(samp2(&F,&C,sx+ux*d,sy+uy*d,&h)){
                miss=0; double th=d/R; double t=((R+h)*cos(th)-(R+h0+obs))/((R+h)*sin(th));
                if(t>best) best=t;
            } else if(++miss>50) break;
            d += (d<3000)?5.0:(d<8000)?10.0:20.0;
        }
        out[s]= best<-1e29 ? -90.0 : atan(best)*180.0/M_PI;
    }
}
