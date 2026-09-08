#!/usr/bin/env node

import { accessSync, appendFileSync } from 'node:fs';
import { constants } from 'node:fs';

const logPath = process.env.PI_LSP_FIXTURE_LOG;
const releasePath = process.env.PI_LSP_FIXTURE_RELEASE;
let buffer = Buffer.alloc(0);

const log = (event) => {
  if (logPath) appendFileSync(logPath, `${JSON.stringify({ event, pid: process.pid })}\n`);
};

const send = (id, result) => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, result }));
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
};

const waitForRelease = async () => {
  if (!releasePath) return;
  while (true) {
    try {
      accessSync(releasePath, constants.F_OK);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
};

const handle = async (message) => {
  if (message.method === 'initialize') {
    log('initialize');
    send(message.id, {
      capabilities: {
        workspaceSymbolProvider: true,
      },
    });
    return;
  }
  if (message.method === 'workspace/symbol') {
    log('workspace-symbol-start');
    await waitForRelease();
    log('workspace-symbol-end');
    send(message.id, []);
    return;
  }
  if (message.method === 'shutdown') {
    log('shutdown');
    send(message.id, null);
    return;
  }
  if (message.method === 'exit') process.exit(0);
};

process.once('exit', () => log('exit'));
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
  while (true) {
    const separator = buffer.indexOf('\r\n\r\n');
    if (separator < 0) return;
    const headers = buffer.subarray(0, separator).toString('ascii');
    const lengthMatch = headers.match(/^Content-Length:\s*(\d+)$/im);
    if (!lengthMatch) process.exit(2);
    const length = Number(lengthMatch[1]);
    const start = separator + 4;
    if (buffer.length < start + length) return;
    const body = buffer.subarray(start, start + length);
    buffer = buffer.subarray(start + length);
    void handle(JSON.parse(body.toString('utf8')));
  }
});
