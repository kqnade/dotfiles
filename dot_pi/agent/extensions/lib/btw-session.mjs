export function withTelemetry({ createSession, createLoader, telemetry }) {
  return async options => {
    const conversation = options.tools.length === 0 ? 'btw_summary' : 'btw';
    const loader = createLoader({
      cwd: options.cwd ?? process.cwd(),
      agentDir: options.agentDir ?? process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent'),
      noExtensions: true, noSkills: true, noPromptTemplates: true,
      noThemes: true, noContextFiles: true,
      extensionFactories: [{ name: 'btw-new-relic', factory: pi => { telemetry(pi, { conversation }); } }],
    });
    await loader.reload();
    const resourceLoader = Object.create(options.resourceLoader);
    resourceLoader.getExtensions = () => loader.getExtensions();
    const result = await createSession({ ...options, resourceLoader });
    const session = result.session;
    const dispose = session.dispose.bind(session);
    let shutdown;
    session.dispose = () => shutdown ??= (async () => {
      try { await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }); }
      finally { dispose(); }
    })();
    try { await session.bindExtensions({ mode: 'rpc' }); }
    catch (error) { await session.dispose(); throw error; }
    return result;
  };
}
import { homedir } from 'node:os';
import { join } from 'node:path';
