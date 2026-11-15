# GitHub Actions runner for this repository, on the VPS (deploy/runner/compose.yaml).
# The CI jobs bring their own Python (setup-uv) and Node (setup-node); the image only
# carries what ubuntu-latest has and the jobs assume: node and npx for the contract lint,
# git, curl, jq, gh and shasum for fixtures/dem/fetch.sh.
FROM node:22.23.3-bookworm

ARG RUNNER_VERSION=2.338.2
# sha256 of actions-runner-linux-x64-2.338.2.tar.gz, from the release's own asset digest.
ARG RUNNER_SHA256=baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git jq gh perl sudo \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /runner
RUN curl -fsSL -o runner.tar.gz \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
 && echo "${RUNNER_SHA256}  runner.tar.gz" | sha256sum -c - \
 && tar -xzf runner.tar.gz && rm runner.tar.gz \
 && ./bin/installdependencies.sh \
 && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
# The jobs install Playwright's system packages with apt, so the runner runs as root
# inside its own container.
ENV RUNNER_ALLOW_RUNASROOT=1
# npm keeps its cache under /root/.cache too, so the shared cache volume keeps it.
ENV npm_config_cache=/root/.cache/npm
ENTRYPOINT ["/entrypoint.sh"]
