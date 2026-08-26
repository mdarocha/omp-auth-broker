{ pkgs, ... }:
{
  languages.javascript = {
    enable = true;
    bun = {
      enable = true;
      install.enable = true;
    };
  };

  packages = [ pkgs.bun ];

  git-hooks.hooks.nixfmt-rfc-style.enable = true;

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
