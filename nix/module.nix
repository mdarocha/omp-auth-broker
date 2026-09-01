{ self }:
{ config, lib, pkgs, utils, ... }:
let
  cfg = config.services.omp-auth-broker;
  inherit (lib) mkEnableOption mkIf mkOption types;
  noAuthenticationWarning =
    "The broker provides no application authentication; expose it only through trusted network controls.";
  stateDirName = lib.removePrefix "/var/lib/" cfg.dataDir;
in
{
  options.services.omp-auth-broker = {
    enable = mkEnableOption "the OMP authentication broker. ${noAuthenticationWarning}";

    package = mkOption {
      type = types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      description = "Package providing the omp-auth-broker executable. ${noAuthenticationWarning}";
    };

    port = mkOption {
      type = types.port;
      default = 8765;
      description = "TCP port the broker listens on, bound to loopback only. ${noAuthenticationWarning}";
    };

    dataDir = mkOption {
      type = types.path;
      default = "/var/lib/omp-auth-broker";
      description = "Directory for broker configuration and credentials, must live under /var/lib. ${noAuthenticationWarning}";
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = lib.hasPrefix "/var/lib/" cfg.dataDir && stateDirName != "";
        message = "services.omp-auth-broker.dataDir must be a subdirectory of /var/lib, so systemd's DynamicUser/StateDirectory can own it";
      }
    ];

    systemd.services.omp-auth-broker = {
      description = "OMP authentication broker. ${noAuthenticationWarning}";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];
      environment.PI_CONFIG_DIR = cfg.dataDir;
      serviceConfig = {
        ExecStart = utils.escapeSystemdExecArgs [
          (lib.getExe cfg.package)
          "serve"
          "--bind"
          "127.0.0.1:${toString cfg.port}"
        ];
        DynamicUser = true;
        StateDirectory = stateDirName;
        StateDirectoryMode = "0750";
        Restart = "on-failure";
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        RestrictAddressFamilies = [ "AF_INET" "AF_INET6" "AF_UNIX" ];
      };
    };
  };
}
