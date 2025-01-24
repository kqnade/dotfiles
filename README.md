# nix configuration

## File structure

```
root
├── home                                            --  Home Manager config
│   └── kqnade                                      --  My home configs
│       ├── modules                                 --    Program config
│       │   ├── git                                 --      For git
│       │   │   └── default.nix
│       │   │
│       │   ├── nixvim                              --      For (Nix)Vim
│       │   │   ├── keymaps                         --      - keybind
│       │   │   │   ├── default.nix                 --        - Bind Loader
│       │   │   │   ├── edit.nix                    --        - in Editor keybind
│       │   │   │   ├── plugin.nix                  --        - keybind for plugins
│       │   │   │   └── window.nix                  --        - keybidn for Tab/Window Manage
│       │   │   ├── plugins                         --      - plugin manage
│       │   │   │   ├── default.nix                 --        - Plugin Loader
│       │   │   │   ├── lualine.nix                 --        - lualine config
│       │   │   │   ├── neo-tree.nix                --        - neo-tree config
│       │   │   │   └── themes.nix                  --        - theme config
│       │   │   ├── default.nix                     --      - NixVim config loader
│       │   │   └── options.nix                     --      - some optimize for faster load
│       │   │
│       │   └── zsh                                 -- For Zsh
│       │       └── default.nix
│       │   
│       ├── home.nix                                --  common config for home-manager
│       └── i3home.nix                              --  extended config for i3wm enviroment
│
├── hosts                                           -- My Hosts data
│   ├── hardconf                                    -- hardware configuration set
│   │   └── versapro-hardware-configuration.nix     -- My Old Laptop
│   │
│   ├── atraqutia-configuration.nix                 -- Just terminal, minimal for VersaPro
│   ├── beltox-configuration.nix                    -- i3 enviroment for VersaPro
│   └── zenith-configuration.nix                    -- WSL envieoment
│
├── modules                                         -- common use for nixos build
│   ├── desktop                                     -- - for Desktop
│   │   └── i3wm                                    --   - for i3wm 
│   │       ├── default.nix                         --     - config for i3wm
│   │       └── packages.nix                        --     - package list for i3wm
│   │
│   ├── default.nix                                 -- - module loader
│   ├── packages.nix                                -- - package list for all hosts
│   ├── system.nix                                  -- - system config for all hosts
│   └── users.nix                                   -- - user config for all hosts
│
├── flake.lock                                      -- lockfile
├── flake.nix                                       -- flake file
└── README.md                                       -- this document
```
