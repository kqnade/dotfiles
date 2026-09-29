import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { askUser } from './lib/ask-user.mjs';

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'ask_user',
    label: 'Ask user',
    description: 'Ask the user only when an unresolved decision blocks progress. Offer 2–5 concise choices or omit options for free text. Cancellation provides no answer or authorization. Do not use for routine progress updates.',
    parameters: Type.Object({
      question: Type.String({ minLength: 1, description: 'The decision the user needs to make, with enough context to answer.' }),
      options: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 2, maxItems: 5, uniqueItems: true })),
    }),
    executionMode: 'sequential',
    execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return askUser(params, signal, ctx);
    },
  });
}
