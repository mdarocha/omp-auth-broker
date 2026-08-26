{
  description = "Network-gated Oh My Pi authentication broker";

  inputs = {
    nixpkgs.url = "github:cachix/devenv-nixpkgs/rolling";
    flake-parts.url = "github:hercules-ci/flake-parts";
    devenv.url = "github:cachix/devenv";
  };

  nixConfig = {
    extra-substituters = [
      "https://devenv.cachix.org"
      "https://pre-commit-hooks.cachix.org"
    ];
    extra-trusted-public-keys = [
      "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw="
      "pre-commit-hooks.cachix.org-1:Pkk3Panw5AW24TOv6kz3PvLhlH8puAsJTBbOPmBo7Rc="
    ];
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [ inputs.devenv.flakeModule ];
      systems = inputs.nixpkgs.lib.systems.flakeExposed;

      perSystem =
        { pkgs, ... }:
        let
          nodeModules = pkgs.stdenv.mkDerivation {
            pname = "omp-auth-broker-node-modules";
            version = "0.1.0";
            src = ./.;
            nativeBuildInputs = [ pkgs.bun ];
            dontConfigure = true;
            buildPhase = ''
              export HOME=$TMPDIR
              bun install --frozen-lockfile --no-progress
            '';
            installPhase = ''
              mkdir -p $out
              find . -type d -name node_modules -exec cp --parents -R {} $out/ \;
            '';
            outputHashMode = "recursive";
            outputHashAlgo = "sha256";
            outputHash = "sha256-vFhXuz9WH1OvYkDD5pXOo0L+2UfHgJK9vp3jYB/Hy8s=";
          };
        in
        {
          devenv.shells.default = {
            imports = [ ./devenv.nix ];
          };

          packages.default = pkgs.stdenv.mkDerivation {
            pname = "omp-auth-broker";
            version = "0.1.0";
            src = ./.;
            nativeBuildInputs = [ pkgs.bun ];
            dontStrip = true;
            dontPatchELF = true;
            buildPhase = ''
              export HOME=$TMPDIR
              cp -R ${nodeModules}/. ./
              bun build ./packages/broker/src/main.ts --compile --minify --outfile omp-auth-broker
            '';
            installPhase = ''
              mkdir -p $out/bin
              cp omp-auth-broker $out/bin/
              find node_modules -name 'pi_natives.*.node' -not -path '*/.old_modules-*' -exec cp {} $out/bin/ \;
            '';
            meta.mainProgram = "omp-auth-broker";
          };
        };
    };
}
