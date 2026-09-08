import { randomUUID } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";

import { createLspAdmission, registerLspLifecycle } from "../runtime/lsp-lifecycle.mjs";

const MANAGED_SERVER_IDS = Object.freeze(["vtsls", "pyright", "gopls", "rust-analyzer"]);
const MANAGED_SYSTEM_COMMANDS = Object.freeze({
  vtsls: Object.freeze(["vtsls", "--stdio"]),
  pyright: Object.freeze(["pyright-langserver", "--stdio"]),
  gopls: Object.freeze(["gopls"]),
  "rust-analyzer": Object.freeze(["rust-analyzer"]),
});
const READ_ONLY_COMMANDS = new Set(["status", "doctor"]);
const BEFORE_AGENT_START_PROMPT =
  "Use the read-only LSP tools for diagnostics and code navigation. Line and column numbers are 1-based; use the identifier's position for hover, definitions, and references. For paginated results, pass resultId to lsp_more only when another page is needed.";

let pinnedModules;

function packageRoot(): string {
  const configured = process.env.PI_PACKAGE_ROOT;
  if (configured === undefined || configured.length === 0) {
    throw new Error("PI_PACKAGE_ROOT is required for the managed LSP extension");
  }
  if (!isAbsolute(configured)) {
    throw new Error("PI_PACKAGE_ROOT must be an absolute path");
  }
  return resolve(configured);
}

function packageModulePath(relativePath: string): string {
  return join(packageRoot(), "node_modules", "pi-lsp-adapter", "src", relativePath);
}

async function loadPinnedModules() {
  if (!pinnedModules) {
    pinnedModules = Promise.all([
      import(packageModulePath("config/loadConfig.ts")),
      import(packageModulePath("install/manager.ts")),
      import(packageModulePath("install/lockfile.ts")),
      import(packageModulePath("lsp/processRegistry.ts")),
      import(packageModulePath("lsp/runtimeManager.ts")),
      import(packageModulePath("commands/registerCommands.ts")),
      import(packageModulePath("tools/registerLspTools.ts")),
      import(packageModulePath("tools/registerLspWarmup.ts")),
      import(packageModulePath("tools/resultCache.ts")),
      import(packageModulePath("statusLine.ts")),
    ]).then(
      ([configModule, managerModule, lockfileModule, processRegistryModule, runtimeModule, commandModule, toolsModule, warmupModule, resultCacheModule, statusLineModule]) => ({
        loadLspConfig: configModule.loadLspConfig,
        LspInstallManager: managerModule.LspInstallManager,
        ensureManagedLspRoot: lockfileModule.ensureManagedLspRoot,
        LspProcessRegistry: processRegistryModule.LspProcessRegistry,
        LspRuntimeManager: runtimeModule.LspRuntimeManager,
        registerLspCommand: commandModule.registerLspCommand,
        registerLspTools: toolsModule.registerLspTools,
        registerLspWarmup: warmupModule.registerLspWarmup,
        LspResultCache: resultCacheModule.LspResultCache,
        setLspStatusLine: statusLineModule.setLspStatusLine,
      }),
    );
  }
  return pinnedModules;
}

function sameCommand(actual: unknown, expected: readonly string[]): boolean {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((part, index) => part === expected[index]);
}

function validateAndFilterConfig(config) {
  for (const serverId of MANAGED_SERVER_IDS) {
    const server = config.catalog.servers[serverId];
    if (!server) throw new Error(`Missing managed LSP server definition: ${serverId}`);
    if (server.install.type !== "system") {
      throw new Error(`Refusing non-system LSP installer for ${serverId}`);
    }

    const expectedCommand = MANAGED_SYSTEM_COMMANDS[serverId];
    const installCommand = server.install.command ?? (server.install.bin ? [server.install.bin] : server.command);
    if (!sameCommand(server.command, expectedCommand) || !sameCommand(installCommand, expectedCommand)) {
      throw new Error(`Refusing overridden LSP command for ${serverId}`);
    }
    if (server.install.bin !== undefined && server.install.bin !== expectedCommand[0]) {
      throw new Error(`Refusing overridden LSP binary for ${serverId}`);
    }
    if (server.env !== undefined && Object.keys(server.env).length > 0) {
      throw new Error(`Refusing per-server environment override for ${serverId}`);
    }
    if (server.cwd !== undefined) {
      throw new Error(`Refusing per-server cwd override for ${serverId}`);
    }
  }

  if (config.installMode !== "off") {
    throw new Error(`Refusing LSP install mode: ${config.installMode}`);
  }

  const servers = Object.fromEntries(MANAGED_SERVER_IDS.map((serverId) => [serverId, config.catalog.servers[serverId]]));
  return { ...config, catalog: { servers } };
}

async function createState(ctx, ownerId, modules) {
  const loadedConfig = await modules.loadLspConfig({ cwd: ctx.cwd, projectRoot: ctx.cwd });
  const config = validateAndFilterConfig(loadedConfig);

  await modules.ensureManagedLspRoot();
  const processRegistry = new modules.LspProcessRegistry({ ownerId });
  const installManager = new modules.LspInstallManager({ catalog: config.catalog, installMode: "off" });

  for (const serverId of MANAGED_SERVER_IDS) {
    await installManager.installServer(serverId);
  }

  const runtimeManager = new modules.LspRuntimeManager({
    cwd: ctx.cwd,
    ownerId,
    config,
    installManager,
    processRegistry,
  });
  const admission = createLspAdmission(runtimeManager);

  return {
    ownerId,
    cwd: ctx.cwd,
    config,
    installManager,
    processRegistry,
    runtimeManager: admission.manager,
    admission,
    resultCache: new modules.LspResultCache(),
  };
}

async function shutdownState(state, ctx, clearStatus) {
  if (!state) return;

  state.resultCache.clear();
  try {
    await state.admission.shutdown();
    const active = state.runtimeManager.activeClients();
    if (active.length > 0) {
      throw new Error(`LSP shutdown did not stop: ${active.map((client) => client.serverId).join(", ")}`);
    }
    const registered = (await state.processRegistry.list()).filter((entry) => entry.ownerId === state.ownerId);
    if (registered.length > 0) {
      throw new Error(`LSP process registry still contains: ${registered.map((entry) => entry.serverId).join(", ")}`);
    }
  } finally {
    if (clearStatus) ctx.ui.setStatus("lsp", undefined);
  }
}

function readOnlyCommandApi(pi) {
  return new Proxy(pi, {
    get(target, property, receiver) {
      if (property === "registerCommand") {
        return (name, options) => {
          if (name !== "lsp") {
            target.registerCommand(name, options);
            return;
          }
          if (!options || typeof options.handler !== "function") {
            throw new Error("LSP command registration is missing a handler");
          }

          target.registerCommand(name, {
            ...options,
            description: "Show read-only LSP status or diagnostics",
            handler: async (args, context) => {
              const subcommand = args.trim().split(/\s+/u).filter(Boolean)[0] ?? "";
              if (!READ_ONLY_COMMANDS.has(subcommand)) {
                throw new Error("Only /lsp status and /lsp doctor are available.");
              }
              return options.handler(args, context);
            },
          });
        };
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function createOwnerId(): string {
  return `pi-lsp-${process.pid}-${randomUUID()}`;
}

export default async function managedLspExtension(pi): Promise<void> {
  const modules = await loadPinnedModules();
  let state = null;
  let generation = 0;
  let sessionContext;
  let lifecycleFailure;
  let stoppedAfterHandoff = false;
  let unregisterLifecycle;
  let handoffGeneration = 0;

  const lifecycle = {
    assertReady() {
      if (lifecycleFailure) {
        throw new Error("Managed LSP lifecycle failed", { cause: lifecycleFailure });
      }
      if (stoppedAfterHandoff) return;
      if (!state) throw new Error("Managed LSP is not initialized");
    },
    async beforeHandoff() {
      const current = state;
      if (!current) {
        const error = new Error("Managed LSP is not initialized");
        lifecycleFailure = error;
        throw error;
      }
      handoffGeneration = generation;
      stoppedAfterHandoff = false;
      state = null;
      try {
        await shutdownState(current, sessionContext, true);
      } catch (error) {
        lifecycleFailure = error;
        throw error;
      }
    },
    async afterHandoff({ resume = true, operationError } = {}) {
      if (generation !== handoffGeneration || !sessionContext) {
        throw new Error("Managed LSP session changed during handoff");
      }
      if (!resume) {
        if (operationError) {
          lifecycleFailure = operationError;
          return;
        }
        stoppedAfterHandoff = true;
        return;
      }
      try {
        const nextState = await createState(sessionContext, createOwnerId(), modules);
        if (generation !== handoffGeneration) {
          await shutdownState(nextState, sessionContext, false);
          throw new Error("Managed LSP session changed during handoff");
        }
        state = nextState;
        stoppedAfterHandoff = false;
        lifecycleFailure = undefined;
        modules.setLspStatusLine(sessionContext, nextState);
      } catch (error) {
        state = null;
        lifecycleFailure = error;
        throw error;
      }
    },
  };

  const ensureLifecycleRegistration = () => {
    unregisterLifecycle ??= registerLspLifecycle(lifecycle);
  };

  ensureLifecycleRegistration();

  modules.registerLspCommand(readOnlyCommandApi(pi), () => state);
  modules.registerLspTools(pi, () => state);
  modules.registerLspWarmup(pi, () => state);

  pi.on("before_agent_start", (event) => {
    if (!state) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${BEFORE_AGENT_START_PROMPT}` };
  });

  pi.on("session_start", async (_event, ctx) => {
    const currentGeneration = ++generation;
    sessionContext = ctx;
    lifecycleFailure = undefined;
    stoppedAfterHandoff = false;
    ensureLifecycleRegistration();
    const previousState = state;
    state = null;
    try {
      await shutdownState(previousState, ctx, previousState !== null);
      if (currentGeneration !== generation) return;

      const nextState = await createState(ctx, createOwnerId(), modules);
      if (currentGeneration !== generation) {
        await shutdownState(nextState, ctx, false);
        return;
      }

      state = nextState;
      modules.setLspStatusLine(ctx, nextState);
    } catch (error) {
      state = null;
      lifecycleFailure = error;
      throw error;
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    ++generation;
    const currentState = state;
    state = null;
    stoppedAfterHandoff = false;
    try {
      await shutdownState(currentState, ctx, currentState !== null);
    } finally {
      sessionContext = undefined;
      unregisterLifecycle?.();
      unregisterLifecycle = undefined;
    }
  });
}
