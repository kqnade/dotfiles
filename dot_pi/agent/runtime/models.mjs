export const ROLE_MODELS = Object.freeze({
  root: Object.freeze({ provider: 'openai-codex', id: 'gpt-5.6-sol', effort: 'medium' }),
  sol: Object.freeze({ provider: 'openai-codex', id: 'gpt-5.6-sol', effort: 'medium' }),
  astra: Object.freeze({ provider: 'openai-codex', id: 'gpt-6-astra', effort: 'medium' }),
  luna: Object.freeze({ provider: 'openai-codex', id: 'gpt-5.6-luna', effort: 'max' }),
  spark: Object.freeze({ provider: 'openai-codex', id: 'gpt-5.3-codex-spark', effort: 'medium' }),
});

export function modelFor(role) {
  const model = ROLE_MODELS[role];
  if (!model) throw new Error(`Unknown agent role: ${role}`);
  return model;
}

export function verifyState(role, state) {
  const expected = modelFor(role);
  if (state?.model?.provider !== expected.provider || state?.model?.id !== expected.id) {
    throw new Error(`model mismatch for ${role}`);
  }
  if (state.thinkingLevel !== expected.effort) throw new Error(`effort mismatch for ${role}`);
}

export function verifyPayload(role, payload) {
  const expected = modelFor(role);
  if (payload?.model !== expected.id) throw new Error(`model mismatch in ${role} payload`);
  if (payload.reasoning?.effort !== expected.effort) throw new Error(`effort mismatch in ${role} payload`);
  return { provider: expected.provider, model: expected.id, effort: expected.effort };
}
