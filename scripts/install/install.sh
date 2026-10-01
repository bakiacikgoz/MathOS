#!/bin/sh
set -eu
: "${MATHOS_RELEASE_BASE_URL:?Set MATHOS_RELEASE_BASE_URL to the official release asset base URL}"
version="${MATHOS_VERSION:?Set MATHOS_VERSION to an exact release version}"
os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m); [ "$arch" = x86_64 ] && arch=x64; [ "$arch" = aarch64 ] && arch=arm64
target="$os-$arch"; archive="mathos-$version-$target.tar.gz"; tmp=$(mktemp -d)
assets_backed_up=0; assets_installed=0; binary_backed_up=0; binary_installed=0; committed=0
finish_install() {
  status=$?
  trap - EXIT HUP INT TERM
  set +e
  if [ "$status" -ne 0 ]; then
    if [ "$binary_installed" -eq 1 ]; then
      if ! rm -f "$dest/mathos"; then echo "new binary could not be removed: $dest/mathos" >&2; fi
    fi
    if [ "$binary_backed_up" -eq 1 ]; then
      if [ ! -e "$dest/mathos" ]; then
        if ! mv "$dest/mathos.old.$$" "$dest/mathos"; then echo "old binary remains at $dest/mathos.old.$$" >&2; fi
      else echo "old binary remains at $dest/mathos.old.$$" >&2; fi
    fi
    if [ "$assets_installed" -eq 1 ]; then
      if ! rm -rf "$assets"; then echo "new assets could not be removed: $assets" >&2; fi
    fi
    if [ "$assets_backed_up" -eq 1 ]; then
      if [ ! -e "$assets" ]; then
        if ! mv "$assets.old.$$" "$assets"; then echo "old assets remain at $assets.old.$$" >&2; fi
      else echo "old assets remain at $assets.old.$$" >&2; fi
    fi
  fi
  if [ "$committed" -eq 1 ]; then
    if ! rm -f "$dest/mathos.old.$$"; then echo "previous binary remains at $dest/mathos.old.$$" >&2; fi
    if ! rm -rf "$assets.old.$$"; then echo "previous assets remain at $assets.old.$$" >&2; fi
  fi
  if [ "${dest:-}" ]; then rm -f "$dest/mathos.new.$$"; fi
  if [ "${assets:-}" ]; then rm -rf "$assets.new.$$"; fi
  rm -rf "$tmp"
  exit "$status"
}
trap 'finish_install' EXIT
trap 'exit 130' HUP INT TERM
curl -fL "$MATHOS_RELEASE_BASE_URL/$archive" -o "$tmp/release.tar.gz"
curl -fL "$MATHOS_RELEASE_BASE_URL/SHA256SUMS" -o "$tmp/SHA256SUMS"
expected=$(awk -v f="$archive" '$2==f {print $1}' "$tmp/SHA256SUMS"); [ -n "$expected" ] || { echo "checksum missing" >&2; exit 1; }
if [ "$os" = darwin ]; then actual=$(shasum -a 256 "$tmp/release.tar.gz" | awk '{print $1}'); else actual=$(sha256sum "$tmp/release.tar.gz" | awk '{print $1}'); fi
[ "$actual" = "$expected" ] || { echo "checksum mismatch" >&2; exit 1; }
tar -tzf "$tmp/release.tar.gz" > "$tmp/entries"
while IFS= read -r entry; do
  case "$entry" in root|root/|root/*) ;; *) echo "unsafe archive path" >&2; exit 1;; esac
  case "$entry" in */../*|*/..|*/./*|*/.|*\\*) echo "unsafe archive path" >&2; exit 1;; esac
done < "$tmp/entries"
if ! tar -tvzf "$tmp/release.tar.gz" | awk '{type=substr($0,1,1); if(type!="-" && type!="d") exit 1}'; then
  echo "unsafe archive entry type" >&2; exit 1
fi
tar -xzf "$tmp/release.tar.gz" -C "$tmp"
[ -f "$tmp/root/bin/mathos" ] && [ -d "$tmp/root/share/mathos" ] || { echo "release layout incomplete" >&2; exit 1; }
"$tmp/root/bin/mathos" --version --json >/dev/null
dest="${MATHOS_INSTALL_DIR:-$HOME/.local/bin}"; install_root=$(dirname "$dest")
mkdir -p "$dest"
dest=$(cd "$dest" && pwd -P)
install_root=$(dirname "$dest")
[ "$install_root" != / ] || { echo "unsafe installation root" >&2; exit 1; }
assets="$install_root/share/mathos"
mkdir -p "$install_root/share"
cp -R "$tmp/root/share/mathos" "$assets.new.$$"
for name in LICENSE NOTICE SOURCE.json SBOM.json THIRD_PARTY_LICENSES.json THIRD_PARTY_NOTICES.txt; do cp "$tmp/root/$name" "$assets.new.$$/$name"; done
cp "$tmp/root/bin/mathos" "$dest/mathos.new.$$"; chmod 755 "$dest/mathos.new.$$"
if [ -e "$assets" ]; then mv "$assets" "$assets.old.$$"; assets_backed_up=1; fi
mv "$assets.new.$$" "$assets"; assets_installed=1
if [ -e "$dest/mathos" ]; then mv "$dest/mathos" "$dest/mathos.old.$$"; binary_backed_up=1; fi
mv "$dest/mathos.new.$$" "$dest/mathos"; binary_installed=1
if ! "$dest/mathos" --version --json >/dev/null; then
  echo "installed MathOS smoke test failed" >&2
  exit 1
fi
committed=1
echo "Installed MathOS $version to $dest/mathos"
