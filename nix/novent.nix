{
  lib,
  pkgs,
  rustToolchain,
  runtimeLibs,
  version,
  versions,
  src,
}:

pkgs.stdenv.mkDerivation {
  pname = "novent";
  inherit version src;

  nativeBuildInputs = with pkgs; [
    rustToolchain
    nodejs_22
    pnpm
    pnpmConfigHook
    pkg-config
    wrapGAppsHook3
    rustPlatform.cargoSetupHook
  ];

  buildInputs = runtimeLibs;

  pnpmDeps = pkgs.fetchPnpmDeps {
    pname = "novent";
    inherit version src;
    fetcherVersion = 3;
    hash = versions.frontend.pnpmHash;
  };

  cargoDeps = pkgs.rustPlatform.importCargoLock {
    lockFile = ../src-tauri/Cargo.lock;
  };

  env = {
    PKG_CONFIG_PATH    = "${pkgs.openssl.dev}/lib/pkgconfig";
    TAURI_SKIP_DEVSERVER_CHECK = "true";
    cargoRoot          = "src-tauri";
  };

  buildPhase = ''
    export HOME=$(mktemp -d)
    pnpm tauri:build
  '';

  installPhase = ''
    install -Dm755 src-tauri/target/release/novent $out/bin/novent

    mkdir -p "$out/share/applications"
    cat > "$out/share/applications/novent.desktop" << EOF2
[Desktop Entry]
Version=1.0
Type=Application
Name=Novent
Comment=Racing telemetry frontend
Exec=$out/bin/novent
Icon=novent
Terminal=false
Categories=Game;Sports;
Keywords=racing;telemetry;assetto;corsa;
StartupWMClass=novent
EOF2

    for size in 32x32 128x128 256x256 512x512; do
      f="src-tauri/icons/$size.png"
      [ -f "$f" ] && install -Dm644 "$f" \
        "$out/share/icons/hicolor/$size/apps/novent.png"
    done

    for size in 128x128 256x256; do
      f="src-tauri/icons/''${size}@2x.png"
      [ -f "$f" ] && install -Dm644 "$f" \
        "$out/share/icons/hicolor/''${size}@2/apps/novent.png"
    done

    wrapProgram $out/bin/novent \
      --prefix XDG_DATA_DIRS : "${lib.makeSearchPath "share/gsettings-schemas" [
        pkgs.gsettings-desktop-schemas
        pkgs.gtk3
      ]}" \
      --prefix LD_LIBRARY_PATH : "${lib.makeLibraryPath runtimeLibs}" \
      --set GDK_BACKEND wayland \
      --set WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS 1
  '';

  meta.mainProgram = "novent";
}
