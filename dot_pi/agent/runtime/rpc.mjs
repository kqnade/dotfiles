import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { modelFor, verifyState } from './models.mjs';

export class RpcClient extends EventEmitter {
  #pending = new Map();
  #sequence = 0;
  #buffer = '';
  #verified = false;
  #role;
  #closed;
  #timeout;

  constructor({ command, args = [], cwd, env = process.env, timeoutMs = 15000 }) {
    super();
    this.#timeout = timeoutMs;
    this.process = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.stderr = '';
    this.process.stdout.setEncoding('utf8');
    this.process.stdout.on('data', chunk => this.#receive(chunk));
    this.process.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk).slice(-65536); });
    this.process.on('error', error => this.#fail(error));
    this.process.stdin.on('error', error => this.#fail(error));
    this.#closed = new Promise(resolve => this.process.once('close', (code, signal) => {
      this.#fail(new Error(`RPC process closed (${code ?? signal})`));
      this.emit('closed', { code, signal });
      resolve({ code, signal });
    }));
  }

  #fail(error) {
    this.#verified = false;
    for (const { reject, timer } of this.#pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.#pending.clear();
  }

  #receive(chunk) {
    this.#buffer += chunk;
    if (this.#buffer.length > 16 * 1024 * 1024) {
      this.#fail(new Error('RPC frame exceeds size limit'));
      this.process.kill('SIGTERM');
      return;
    }
    let boundary;
    while ((boundary = this.#buffer.indexOf('\n')) !== -1) {
      const line = this.#buffer.slice(0, boundary).replace(/\r$/, '');
      this.#buffer = this.#buffer.slice(boundary + 1);
      let event;
      try { event = JSON.parse(line); } catch {
        this.#fail(new Error('Invalid RPC JSONL frame'));
        this.process.kill('SIGTERM');
        return;
      }
      if (event.type === 'response') {
        const pending = this.#pending.get(event.id);
        if (!pending) continue;
        this.#pending.delete(event.id);
        clearTimeout(pending.timer);
        if (event.success === true) pending.resolve(event.data);
        else pending.reject(new Error(`RPC ${event.command} failed: ${event.error ?? 'unspecified error'}`));
      } else this.emit('event', event);
    }
  }

  request(type, fields = {}) {
    if (this.process.exitCode !== null || this.process.signalCode !== null) {
      return Promise.reject(new Error('RPC process is closed'));
    }
    const id = `request-${++this.#sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        this.#verified = false;
        reject(new Error(`RPC ${type} timed out`));
      }, this.#timeout);
      this.#pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(`${JSON.stringify({ ...fields, id, type })}\n`);
    });
  }

  async initialize(role) {
    this.#verified = false;
    const model = modelFor(role);
    const available = await this.request('get_available_models');
    if (!available.models.some(item => item.provider === model.provider && item.id === model.id)) {
      throw new Error(`Model unavailable: ${model.provider}/${model.id}`);
    }
    await this.request('set_model', { provider: model.provider, modelId: model.id });
    const thinking = await this.request('get_available_thinking_levels');
    if (!thinking.levels.includes(model.effort)) throw new Error(`Effort unavailable: ${model.effort}`);
    await this.request('set_thinking_level', { level: model.effort });
    verifyState(role, await this.request('get_state'));
    this.#role = role;
    this.#verified = true;
  }

  async run(message) {
    if (!this.#verified) throw new Error('RPC model is not verified');
    verifyState(this.#role, await this.request('get_state'));
    return this.request('prompt', { message });
  }

  async close() {
    this.process.stdin.end();
    const timer = setTimeout(() => this.process.kill('SIGKILL'), 1000);
    try { return await this.#closed; } finally { clearTimeout(timer); }
  }
}
