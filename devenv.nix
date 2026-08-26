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

  tasks."broker:dev" = {
    exec = "bun run dev";
    description = "Run the public broker server";
  };

  tasks."broker:check" = {
    exec = "bun run check";
    description = "Type-check both workspaces";
  };

  tasks."ui:build" = {
    exec = "bun run build-ui";
    description = "Build the browser UI";
  };

  tasks."broker:build" = {
    exec = "bun run build";
    description = "Compile the self-contained binary";
  };
}
