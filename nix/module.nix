{ self }:
{ config, lib, pkgs, utils, ... }:
let
  cfg = config.services.omp-auth-broker;
  inherit (lib) mkEnableOption mkIf mkOption optional types;
  noAuthenticationWarning =
    "The broker provides no application authentication; expose it only through trusted network controls.";
  bindPortMatch = builtins.match ".*:([0-9]+)$" cfg.bind;
  bindPortString =
    if bindPortMatch == null then null else builtins.elemAt bindPortMatch 0;
  normalizedBindPortMatch =
    if bindPortString == null then null else builtins.match "0*([0-9]{1,5})" bindPortString;
  bindPort =
    if normalizedBindPortMatch == null then 0
    else lib.toInt (builtins.elemAt normalizedBindPortMatch 0);
  validBindPort = normalizedBindPortMatch != null && bindPort <= 65535;
in
{
  options.services.omp-auth-broker = {
    enable = mkEnableOption "the OMP authentication broker. ${noAuthenticationWarning}";

    package = mkOption {
      type = types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      description = "Package providing the omp-auth-broker executable. ${noAuthenticationWarning}";
    };

    bind = mkOption {
      type = types.str;
      default = "127.0.0.1:8765";
      description = "Address on which the broker listens, as host:port. ${noAuthenticationWarning}";
    };

    user = mkOption {
      type = types.str;
      default = "omp-auth-broker";
      description = "System user running the broker. ${noAuthenticationWarning}";
    };

    group = mkOption {
      type = types.str;
      default = "omp-auth-broker";
      description = "System group running the broker. ${noAuthenticationWarning}";
    };

    configDir = mkOption {
      type = types.str;
      default = "/var/lib/omp-auth-broker";
      description = "Directory for broker configuration and credentials. ${noAuthenticationWarning}";
    };

    environmentFile = mkOption {
      type = types.nullOr types.str;
      default = null;
      description = "Optional systemd environment file for the broker. ${noAuthenticationWarning}";
    };

    openFirewall = mkOption {
      type = types.bool;
      default = false;
      description = "Whether to open the broker bind port in the firewall. ${noAuthenticationWarning}";
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = validBindPort;
        message = "services.omp-auth-broker.bind must end with a port between 0 and 65535";
      }
      {
        assertion = lib.hasPrefix "/" cfg.configDir;
        message = "services.omp-auth-broker.configDir must be an absolute path";
      }
      {
        assertion = cfg.environmentFile == null || lib.hasPrefix "/" cfg.environmentFile;
        message = "services.omp-auth-broker.environmentFile must be an absolute path";
      }
    ];

    users.groups.${cfg.group} = { };
    users.users.${cfg.user} = {
      isSystemUser = true;
      group = cfg.group;
      home = cfg.configDir;
      createHome = false;
    };

    systemd.tmpfiles.rules = [
      "d ${cfg.configDir} 0750 ${cfg.user} ${cfg.group} -"
    ];

    systemd.services.omp-auth-broker = {
      description = "OMP authentication broker. ${noAuthenticationWarning}";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];
      environment.PI_CONFIG_DIR = cfg.configDir;
      serviceConfig = {
        ExecStart = utils.escapeSystemdExecArgs [
          (lib.getExe cfg.package)
          "serve"
          "--bind"
          cfg.bind
        ];
        User = cfg.user;
        Group = cfg.group;
        EnvironmentFile = optional (cfg.environmentFile != null) cfg.environmentFile;
        Restart = "on-failure";
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ReadWritePaths = [ cfg.configDir ];
        RestrictAddressFamilies = [ "AF_INET" "AF_INET6" "AF_UNIX" ];
      };
    };

    networking.firewall.allowedTCPPorts = optional (cfg.openFirewall && validBindPort) bindPort;
  };
}
