# Build stage: has a compiler and headers, so a dependency without a wheel for
# this platform (a native DEM reader, say) can still build. Only the venv moves on.
FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.11.16 /uv /uvx /bin/
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY app ./app

FROM python:3.12-slim
# Runtime shared libraries the wheels expect from the system. rasterio's wheel
# bundles GDAL but links to the system libexpat, which slim doesn't ship.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libexpat1 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
ENV LUNAR_META_KERNEL=/data/kernels/meta.tm
ENV LUNAR_DEM_DIR=/data/dem
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
# The image has no dev dependencies and no network at start, so run uvicorn straight
# from the venv instead of through `uv run`, which would try to sync them.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
