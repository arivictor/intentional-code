# This site deploys as static output rendered by the gomark CLI. The content/
# directory holds the markdown source; gomark.yaml configures the build. There
# is no long-running Go process in production. The in-browser Go runner is
# disabled in gomark.yaml: every example on the site is GDScript.

# Stage 1: install the gomark CLI and render the static site.
FROM golang:1.25-alpine AS builder

ENV CGO_ENABLED=0
WORKDIR /src

# Install the gomark CLI as a standalone binary in its own layer so it's cached
# across source changes.
RUN go install github.com/arivictor/gomark/cmd/gomark@v0.1.27

COPY . .

# Render the static site. gomark.yaml (auto-discovered) supplies title, URL and
# SEO; the positional output dir below overrides its output_dir for the image.
RUN gomark build 

# Stage 2: serve the static output. The Caddyfile binds to Cloud Run's $PORT
# (falling back to 80 locally).
FROM caddy:2-alpine AS site

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /out/site /usr/share/caddy

EXPOSE 8080
