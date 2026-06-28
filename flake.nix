{
  description = "Novent — racing telemetry frontend";

  inputs = {
    nixpkgs.url     = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs@{ flake-parts, rust-overlay, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-linux" "aarch64-linux" ];

      perSystem = { system, lib, ... }:
        let
          versions = import ./nix/versions.nix;
          version  = versions.novent;

          pkgs = import inputs.nixpkgs {
            inherit system;
            overlays = [ rust-overlay.overlays.default ];
          };

          rustToolchain = pkgs.rust-bin.stable.latest.default.override {
            extensions = [ "rust-src" "rust-analyzer" ];
          };

          runtimeLibs = with pkgs; [
            webkitgtk_4_1
            gtk3
            glib
            cairo
            pango
            atk
            gdk-pixbuf
            libsoup_3
            openssl
            dbus
            libappindicator-gtk3
            gsettings-desktop-schemas
          ];

          src = lib.cleanSourceWith {
            src = ./.;
            filter = path: type:
              let base = builtins.baseNameOf path; in
              (lib.hasInfix "/src" path)
              || (lib.hasInfix "/src-tauri/src" path)
              || (lib.hasInfix "/src-tauri/icons" path)
              || (lib.hasInfix "/src-tauri/capabilities" path)
              || (lib.hasInfix "/static" path)
              || base == "package.json"
              || base == "tsconfig.json"
              || base == "vite.config.ts"
              || base == "svelte.config.js"
              || base == "Cargo.toml"
              || base == "Cargo.lock"
              || base == "build.rs"
              || base == "tauri.conf.json";
          };

          novent = pkgs.callPackage ./nix/novent.nix {
            inherit lib pkgs rustToolchain runtimeLibs version versions src;
          };

          scripts = import ./nix/scripts.nix { inherit pkgs rustToolchain version versions; };

        in
        {
          packages = {
            inherit novent;
            default = novent;
          };

          apps = {
            default = { type = "app"; program = "${novent}/bin/novent"; };
            novent  = { type = "app"; program = "${novent}/bin/novent"; };
            bump    = { type = "app"; program = "${scripts.bump}/bin/novent-bump"; };
            update  = { type = "app"; program = "${scripts.update}/bin/novent-update"; };
          };

          devShells.default = pkgs.mkShell {
            buildInputs = runtimeLibs;
            nativeBuildInputs = with pkgs; [
              rustToolchain
              pkg-config
              wrapGAppsHook3
              nodejs_22
              pnpm
            ];
            shellHook = ''
              export NO_STRIP=true
              export PKG_CONFIG_PATH="${pkgs.openssl.dev}/lib/pkgconfig''${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
              export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}''${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}"
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath runtimeLibs}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

              echo "Novent dev shell — pnpm install && pnpm tauri dev"
              echo "Note: backend binary is Windows-only (Assetto Corsa)"
              echo ""
              echo "  nix run .#bump -- <ver>   bump version"
              echo "  nix run .#update -- <ver> update hashes"
            '';
          };

          formatter = pkgs.nixfmt-rfc-style;
        };
    };
}
