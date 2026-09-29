function cancel(ctx) {
  ctx.abort();
  throw new Error('Question cancelled; no answer or authorization was given.');
}

export async function askUser({ question, options = [] }, signal, ctx) {
  signal?.throwIfAborted();
  if (!ctx.hasUI) throw new Error('ask_user requires an interactive UI; ask in the conversation instead.');

  let answer;
  let source = 'input';
  if (options.length) {
    const choices = options.map((option, index) => `${index + 1}. ${option}`);
    const other = 'Other (type your own)';
    const selected = await ctx.ui.select(question, [...choices, other], { signal });
    signal?.throwIfAborted();
    if (selected === undefined) cancel(ctx);
    if (selected !== other) {
      const index = choices.indexOf(selected);
      if (index === -1) throw new Error('Invalid selection; no answer or authorization was given.');
      answer = options[index];
      source = 'option';
    }
  }
  if (source === 'input') {
    answer = await ctx.ui.input(question, 'Your answer', { signal });
    signal?.throwIfAborted();
    if (answer === undefined || !answer.trim()) cancel(ctx);
    answer = answer.trim();
  }
  return {
    content: [{ type: 'text', text: `User answered: ${answer}` }],
    details: { question, answer, source },
  };
}
