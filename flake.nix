{
  description = "Network-gated Oh My Pi authentication broker";

  inputs = {
    nixpkgs.url = "github:cachix/devenv-nixpkgs/rolling";
    flake-parts.url = "github:hercules-ci/flake-parts";
    devenv.url = "github:cachix/devenv";
    mk-shell-bin.url = "github:rrbutani/nix-mk-shell-bin";
    nix2container.url = "github:nlewo/nix2container";
    nix2container.inputs.nixpkgs.follows = "nixpkgs";
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
          mkNodeModules =
            {
              pname,
              manifests,
            }:
            let
              packageLockFile =
                pkgs.runCommand "${pname}-package-lock.json"
                  {
                    nativeBuildInputs = [ pkgs.bun ];
                  }
                  ''
                    bun ${./nix/bun-lock-to-package-lock.ts} ${./bun.lock} ${./.} ${pkgs.lib.escapeShellArg (builtins.toJSON manifests)} > $out
                  '';
              packageLock = builtins.fromJSON (builtins.readFile packageLockFile);
              package = packageLock.packages."";
            in
            pkgs.importNpmLock.buildNodeModules {
              inherit package packageLock;
              nodejs = pkgs.nodejs;
              derivationArgs = {
                inherit pname;
                version = "0.1.0";
              };
            };

          runtimeManifests = [
            {
              path = "packages/broker/package.json";
              dev = false;
            }
            {
              path = "packages/ui/package.json";
              dev = false;
            }
          ];

          nodeModules = mkNodeModules {
            pname = "omp-auth-broker-node-modules";
            manifests = runtimeManifests;
          };

          e2eNodeModules = mkNodeModules {
            pname = "omp-auth-broker-e2e-node-modules";
            manifests = runtimeManifests ++ [
              {
                path = "packages/e2e/package.json";
                dev = true;
              }
            ];
          };

          mkE2eDerivation =
            {
              pname,
              testCommand,
              installPhase,
            }:
            pkgs.stdenv.mkDerivation {
              inherit pname installPhase;
              version = "0.1.0";
              src = ./.;
              nativeBuildInputs = [
                pkgs.bun
                pkgs.chromium
              ];
              buildPhase = ''
                export HOME=$TMPDIR
                export CHROME_BIN=${pkgs.chromium}/bin/chromium
                export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
                export PLAYWRIGHT_BROWSERS_PATH=${pkgs.chromium}
                export FONTCONFIG_FILE=${pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; }}
                mkdir node_modules
                cp -R ${e2eNodeModules}/node_modules/. node_modules/
                (cd packages/e2e && ${testCommand})
              '';
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

          checks.e2e = mkE2eDerivation {
            pname = "omp-auth-broker-e2e";
            testCommand = "bun test --max-concurrency=1 --timeout=180000";
            installPhase = ''
              touch $out
            '';
          };

          packages.screenshots = mkE2eDerivation {
            pname = "omp-auth-broker-screenshots";
            testCommand = "bun test --timeout=180000 src/screenshots.e2e.test.ts";
            installPhase = ''
              mkdir -p $out
              cp docs/screenshots/*.png $out/
            '';
          };
        };
    };
}
