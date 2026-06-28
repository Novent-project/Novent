{ pkgs, rustToolchain, version, versions }:

{
  bump = pkgs.writeShellApplication {
    name = "novent-bump";
    runtimeInputs = with pkgs; [
      gnused
      coreutils
      git
      rustToolchain
      nodejs_22
      pnpm
    ];
    text = ''
      [[ $# -lt 1 ]] && { echo "Usage: nix run .#bump -- <version>"; exit 1; }
      VERSION="$1"
      REPO="$(git rev-parse --show-toplevel)"

      sed -i "s/novent = \"[^\"]*\"/novent = \"$VERSION\"/" "$REPO/nix/versions.nix"
      sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$REPO/src-tauri/tauri.conf.json"
      sed -i "0,/^version = \"[^\"]*\"/s//version = \"$VERSION\"/" "$REPO/src-tauri/Cargo.toml"

      (cd "$REPO/src-tauri" && cargo generate-lockfile)

      echo "Bumped to v$VERSION — commit, tag, push, then: nix run .#update -- $VERSION"
    '';
  };

  update = pkgs.writeShellApplication {
    name = "novent-update";
    runtimeInputs = with pkgs; [ gnused coreutils git nix ];
    text = ''
      REPO="$(git rev-parse --show-toplevel)"
      VERSIONS="$REPO/nix/versions.nix"

      if [[ $# -ge 1 ]]; then
        VERSION="$1"
      else
        VERSION=$(grep 'novent = "' "$VERSIONS" | head -1 | sed 's/.*"\(.*\)".*/\1/')
      fi

      PNPM_HASH=$(nix hash path "$REPO" --type sha256 2>/dev/null || echo "update manually")
      echo "pnpmHash: run 'nix build' and copy the hash from the error output into nix/versions.nix"
      echo "Done — bump versions.nix for v$VERSION"
    '';
  };
}
