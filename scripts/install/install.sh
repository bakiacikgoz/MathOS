#!/bin/sh
set -eu
: "${MATHOS_RELEASE_BASE_URL:?Set MATHOS_RELEASE_BASE_URL to the official release asset base URL}"
version="${MATHOS_VERSION:?Set MATHOS_VERSION to an exact release version}"
os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m); [ "$arch" = x86_64 ] && arch=x64; [ "$arch" = aarch64 ] && arch=arm64
target="$os-$arch"; archive="mathos-$version-$target.tar.gz"; tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
curl -fL "$MATHOS_RELEASE_BASE_URL/$archive" -o "$tmp/release.tar.gz"
curl -fL "$MATHOS_RELEASE_BASE_URL/SHA256SUMS" -o "$tmp/SHA256SUMS"
expected=$(awk -v f="$archive" '$2==f {print $1}' "$tmp/SHA256SUMS"); [ -n "$expected" ] || { echo "checksum missing" >&2; exit 1; }
actual=$(sha256sum "$tmp/release.tar.gz" | awk '{print $1}'); [ "$actual" = "$expected" ] || { echo "checksum mismatch" >&2; exit 1; }
tar -xzf "$tmp/release.tar.gz" -C "$tmp"; "$tmp/root/bin/mathos" --version --json >/dev/null
dest="${MATHOS_INSTALL_DIR:-$HOME/.local/bin}"; mkdir -p "$dest"; cp "$tmp/root/bin/mathos" "$dest/mathos.new"; chmod 755 "$dest/mathos.new"; mv "$dest/mathos.new" "$dest/mathos"
echo "Installed MathOS $version to $dest/mathos"
