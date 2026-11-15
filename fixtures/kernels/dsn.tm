KPL/MK

Test fixture meta-kernel for the DSN link (/visibility/dsn). The backend
loads it after meta.tm, only when the DSN link is asked for, and lists
these kernels only in that route's provenance. Paths are relative to this
file's folder, so load it with the working directory set to fixtures/kernels.

\begindata
KERNELS_TO_LOAD = (
  'earth_itrf93_2023_2032.bpc'
  'earthstns_itrf93_260814.bsp'
  'earth_topo_260814.tf'
)
\begintext
