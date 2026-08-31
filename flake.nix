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
    inputs@{ self, flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [ inputs.devenv.flakeModule ];
      systems = inputs.nixpkgs.lib.systems.flakeExposed;

      flake.nixosModules.default = import ./nix/module.nix { inherit self; };

      perSystem =
        { pkgs, ... }:
        let
          packageLockFile = pkgs.runCommand "omp-auth-broker-package-lock.json" {
            nativeBuildInputs = [ pkgs.bun ];
          } ''
            bun ${./nix/bun-lock-to-package-lock.ts} ${./bun.lock} ${./.} > $out
          '';
          packageLock = builtins.fromJSON (builtins.readFile packageLockFile);
          package = packageLock.packages."";
          nodeModules = pkgs.importNpmLock.buildNodeModules {
            inherit package packageLock;
            nodejs = pkgs.nodejs;
            derivationArgs = {
              pname = "omp-auth-broker-node-modules";
              version = "0.1.0";
            };
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
              mkdir node_modules
              cp -R ${nodeModules}/node_modules/. node_modules/
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
