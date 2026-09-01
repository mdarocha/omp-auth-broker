{ pkgs, config, ... }:
{
  languages.javascript = {
    enable = true;
    bun = {
      enable = true;
      install.enable = true;
    };
  };

  packages = [ pkgs.bun ];

  enterTest = ''
    bun x prettier --check .
    bun run check
    bun run lint
  '';

  git-hooks.hooks = {
    nixfmt.enable = true;
    prettier = {
      enable = true;
      settings = {
        cache = true;
        cache-strategy = "content";
        config-precedence = "prefer-file";
        binPath = "${config.devenv.root}/.devenv/profile/bin/bun run ${config.devenv.root}/node_modules/.bin/prettier --";
        configPath = "${config.devenv.root}/.prettierrc.yaml";
      };
    };
    lint = {
      enable = true;
      name = "omp-auth-broker lint";
      entry = "${config.devenv.root}/.devenv/profile/bin/bun run lint";
      files = "\\.tsx?$";
      pass_filenames = false;
    };
  };

}
