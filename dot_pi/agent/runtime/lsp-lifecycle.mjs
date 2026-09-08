let registeredLifecycle;

const lifecycleError = (phase) => {
  const error = new Error(`LSP runtime is ${phase}`);
  error.code = phase === 'draining' ? 'LSP_DRAINING' : 'LSP_STOPPED';
  return error;
};

export function createLspAdmission(manager) {
  if (!manager || typeof manager.shutdown !== 'function') {
    throw new TypeError('LSP runtime manager must provide shutdown()');
  }

  let phase = 'open';
  const pending = new Set();
  let shutdownPromise;

  const track = (operation) => {
    if (phase !== 'open') return Promise.reject(lifecycleError(phase));

    const result = operation();

    if (!result || typeof result.then !== 'function') return result;

    const pendingOperation = Promise.resolve(result);
    pending.add(pendingOperation);
    pendingOperation.then(
      () => pending.delete(pendingOperation),
      () => pending.delete(pendingOperation),
    );
    return pendingOperation;
  };

  const proxy = new Proxy(manager, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      if (property === 'activeClients') return value.bind(target);
      return (...args) => track(() => Reflect.apply(value, target, args));
    },
  });

  const shutdown = () => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      phase = 'draining';
      await Promise.allSettled([...pending]);
      await manager.shutdown();
      phase = 'stopped';
    })();
    return shutdownPromise;
  };

  return Object.freeze({
    manager: proxy,
    shutdown,
    status: () => ({ phase, pending: pending.size }),
  });
}

export function registerLspLifecycle(lifecycle) {
  if (!lifecycle || typeof lifecycle.beforeHandoff !== 'function' || typeof lifecycle.afterHandoff !== 'function') {
    throw new TypeError('LSP lifecycle must provide beforeHandoff() and afterHandoff()');
  }

  const controller = createHandoffController(lifecycle);
  registeredLifecycle = controller;
  return () => {
    if (registeredLifecycle === controller) registeredLifecycle = undefined;
  };
}

export async function withLspHandoff(operation, options = {}) {
  if (typeof operation !== 'function') throw new TypeError('LSP handoff operation must be a function');
  const lifecycle = registeredLifecycle;
  if (!lifecycle) return operation();
  return lifecycle.withHandoff(operation, options);
}

export function assertLspReady() {
  registeredLifecycle?.assertReady();
}

function createHandoffController(lifecycle) {
  let queue = Promise.resolve();

  return {
    withHandoff(operation, options = {}) {
      const previous = queue;
      let release;
      queue = new Promise((resolve) => {
        release = resolve;
      });

      return (async () => {
        await previous;
        let prepared = false;
        let result;
        let operationError;
        let resumeError;
        try {
          await lifecycle.beforeHandoff();
          prepared = true;
          try {
            result = await operation();
          } catch (error) {
            operationError = error;
          }
        } catch (error) {
          operationError = error;
        } finally {
          if (prepared) {
            try {
              await lifecycle.afterHandoff({
                resume: options.resume !== false,
                operationError,
              });
            } catch (error) {
              resumeError = error;
            }
          }
          release();
        }

        if (operationError && resumeError) {
          throw new AggregateError([operationError, resumeError], 'LSP handoff failed');
        }
        if (operationError) throw operationError;
        if (resumeError) throw resumeError;
        return result;
      })();
    },
    assertReady() {
      lifecycle.assertReady?.();
    },
  };
}
