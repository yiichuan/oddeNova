import { parse, type CallExpression, type Expression, type Node, type Token } from 'acorn';

export const editScopes = ['create', 'rewrite', 'add_layers', 'remove_layers', 'layers', 'section', 'parameter', 'tempo'] as const;
export const scopedParameters = ['gain', 'lpf', 'hpf', 'pan', 'room', 'delay', 'attack', 'release'] as const;

export type EditScope =
  | { kind: 'create' | 'rewrite' | 'add_layers' | 'tempo' }
  | { kind: 'layers' | 'remove_layers' | 'section'; targets: string[] }
  | { kind: 'parameter'; targets: string[]; parameter: typeof scopedParameters[number] };

interface Target {
  id: string;
  label?: string;
  node: Expression;
  duration?: string;
}

const codeSlice = (code: string, node: Node) => code.slice(node.start, node.end);

function namedCall(expression: Expression, name: string): CallExpression | undefined {
  let current = expression;
  while (current.type === 'CallExpression') {
    if (current.callee.type === 'Identifier' && current.callee.name === name) return current;
    if (current.callee.type !== 'MemberExpression' || current.callee.object.type === 'Super') break;
    current = current.callee.object;
  }
}

function describeScore(code: string, tokens?: Token[]) {
  const layers: Target[] = [];
  const sections: Target[] = [];
  const tempos: Expression[] = [];
  let stack: CallExpression | undefined;
  let stackCount = 0;
  let program;
  try {
    program = parse(code, { ecmaVersion: 'latest', sourceType: 'module', onToken: tokens });
  } catch {
    return { valid: false, layers, sections, tempos, stack };
  }

  const scanSections = (node: Expression, label?: string) => {
    const arrangement = namedCall(node, 'arrange');
    if (!arrangement) return;
    for (const [index, arg] of arrangement.arguments.entries()) {
      if (arg.type !== 'ArrayExpression' || arg.elements.length !== 2) continue;
      const [duration, pattern] = arg.elements;
      if (!duration || duration.type !== 'Literal' || typeof duration.value !== 'number'
        || duration.value <= 0 || !pattern || pattern.type === 'SpreadElement') continue;
      sections.push({
        id: 'section-' + (sections.length + 1), node: pattern,
        label: [label, 'arrange ' + (index + 1)].filter(Boolean).join(' / '),
        duration: codeSlice(code, duration),
      });
    }
  };

  for (const statement of program.body) {
    if (statement.type === 'VariableDeclaration') {
      for (const declaration of statement.declarations) {
        if (declaration.init && declaration.id.type === 'Identifier') scanSections(declaration.init, declaration.id.name);
      }
      continue;
    }
    const body = statement.type === 'LabeledStatement' ? statement.body : statement;
    if (body.type !== 'ExpressionStatement') continue;
    const expression = body.expression;
    const tempo = expression.type === 'CallExpression' && expression.callee.type === 'Identifier'
      && ['setcps', 'setcpm'].includes(expression.callee.name) && expression.arguments.length === 1
      ? expression.arguments[0] : undefined;
    if (tempo && tempo.type !== 'SpreadElement') tempos.push(tempo);

    const mix = namedCall(expression, 'stack');
    if (mix && mix.arguments.every(arg => arg.type !== 'SpreadElement')) {
      stack = ++stackCount === 1 ? mix : undefined;
      let cursor = mix.callee.end;
      for (const arg of mix.arguments) {
        const comment = code.slice(cursor, arg.start).match(/\/\*\s*@layer\s+([^*]+?)\s*\*\//);
        const label = comment?.[1] ?? (arg.type === 'Identifier' ? arg.name : undefined);
        layers.push({ id: 'layer-' + (layers.length + 1), label, node: arg });
        scanSections(arg, label);
        cursor = arg.end;
      }
    } else if (statement.type === 'LabeledStatement' && statement.label.name.startsWith('$')) {
      layers.push({ id: 'layer-' + (layers.length + 1), label: statement.label.name, node: expression });
      scanSections(expression, statement.label.name);
    } else {
      scanSections(expression);
    }
  }
  // An unlabelled standalone pattern is a common single-voice score.
  if (!layers.length && !sections.length) {
    const last = program.body.at(-1);
    if (last?.type === 'ExpressionStatement' && !tempos.some(node => node.start >= last.start)) {
      layers.push({ id: 'layer-1', node: last.expression });
    }
  }
  return { valid: true, layers, sections, tempos, stack };
}

export function describeEditTargets(code: string, previewLength = 260) {
  const score = describeScore(code);
  const describe = ({ id, label, duration, node }: Target) => ({
    id, label, duration, preview: codeSlice(code, node).slice(0, previewLength),
  });
  return {
    layers: score.layers.map(describe),
    sections: score.sections.map(describe),
    tempoEditable: score.tempos.length === 1,
    canAddLayers: Boolean(score.stack?.arguments.length && score.stack.arguments.length === score.layers.length),
    canRemoveLayers: Boolean(score.stack && score.stack.arguments.length > 1 && score.stack.arguments.length === score.layers.length),
  };
}

function stackSource(code: string, score: ReturnType<typeof describeScore>, tokens: Token[]) {
  const stack = score.stack;
  if (!stack || !stack.arguments.length || stack.arguments.length !== score.layers.length) return;
  const open = tokens.find(token => token.start >= stack.callee.end && token.type.label === '(');
  const close = tokens.find(token => token.end === stack.end && token.type.label === ')');
  if (!open || !close || open.end > close.start) return;
  const lastToken = tokens.findLast(token => token.start < close.start && token.end <= close.start);
  if (!lastToken) return;

  // Split on separators between AST arguments. Commas in strings, nested
  // expressions and comments cannot split a layer. Keep its full source,
  // including comments and grouping parentheses outside the AST node span.
  let cursor = open.end;
  const args: string[] = [];
  const commas = tokens.filter(token => token.type.label === ',' && token.start >= open.end && token.end <= close.start);
  let commaIndex = 0;
  let trailing = false;
  for (const [index, arg] of stack.arguments.entries()) {
    const next = stack.arguments[index + 1];
    while (commas[commaIndex] && commas[commaIndex].start < arg.end) commaIndex++;
    const comma = commas[commaIndex];
    const separator = comma && comma.end <= (next?.start ?? close.start) ? comma : undefined;
    if (next && !separator) return;
    args.push(code.slice(cursor, separator?.start ?? lastToken.end));
    cursor = separator?.end ?? lastToken.end;
    trailing = !next && Boolean(separator);
    if (separator) commaIndex++;
  }
  return { prefix: code.slice(0, open.end), suffix: code.slice(close.start), args, trailing, tail: code.slice(cursor, close.start) };
}

function removeLayersValidator(original: string, targets: string[]): (candidate: string) => boolean {
  const tokens: Token[] = [];
  const score = describeScore(original, tokens);
  const before = stackSource(original, score, tokens);
  const ids = new Set(targets);
  if (!before || !ids.size || ids.size !== targets.length || ids.size >= before.args.length) return () => false;
  const retained = score.layers.flatMap(({ id }, index) => ids.has(id) ? [] : [index]);
  if (before.args.length - retained.length !== ids.size) return () => false;

  return candidate => {
    const tokens: Token[] = [];
    const after = stackSource(candidate, describeScore(candidate, tokens), tokens);
    if (!after || after.args.length !== retained.length || before.prefix !== after.prefix || before.suffix !== after.suffix) return false;
    const removedLast = retained.at(-1) !== before.args.length - 1;
    if (removedLast ? before.tail.trim() !== after.tail.trim() : before.trailing !== after.trailing || before.tail !== after.tail) return false;

    return retained.every((oldIndex, newIndex) => {
      const trimBefore = (retained[newIndex - 1] ?? -1) !== oldIndex - 1;
      const trimAfter = (retained[newIndex + 1] ?? before.args.length) !== oldIndex + 1;
      const atSeam = (text: string) => {
        if (trimBefore) text = text.trimStart();
        return trimAfter ? text.trimEnd() : text;
      };
      return atSeam(before.args[oldIndex]) === atSeam(after.args[newIndex]);
    });
  };
}

function outsideParts(code: string, ranges: Node[]): string[] {
  let cursor = 0;
  return [...ranges].sort((a, b) => a.start - b.start).map(node => {
    const part = code.slice(cursor, node.start);
    cursor = node.end;
    return part;
  }).concat(code.slice(cursor));
}

function sameParts(before: string[], after: string[]) {
  return before.length === after.length && before.every((part, index) => part === after[index]);
}

function isNumber(node: Expression): boolean {
  if (node.type === 'Literal') return typeof node.value === 'number' && Number.isFinite(node.value);
  return node.type === 'UnaryExpression' && ['+', '-'].includes(node.operator) && isNumber(node.argument);
}

function tempoNumber(node: Expression): boolean {
  if (node.type === 'BinaryExpression' && ['+', '-', '*', '/'].includes(node.operator)
    && node.left.type !== 'PrivateIdentifier') return tempoNumber(node.left) && tempoNumber(node.right);
  return isNumber(node);
}

function withoutParameter(code: string, node: Expression, name: string, candidate: boolean) {
  const matching: Node[] = [];
  let current = node;
  while (current.type === 'CallExpression' && current.callee.type === 'MemberExpression'
    && current.callee.object.type !== 'Super') {
    const { object, computed, property } = current.callee;
    if (!computed && property.type === 'Identifier' && property.name === name) {
      const arg = current.arguments[0];
      if (current.optional || current.callee.optional || current.arguments.length !== 1
        || !arg || arg.type === 'SpreadElement' || (candidate && !isNumber(arg))) return null;
      // Drop just this method suffix, keeping its receiver and the rest of the chain.
      matching.push({ type: 'parameter', start: object.end, end: current.end });
    }
    current = object;
  }
  if (matching.length > 1) return null;
  const edit = matching[0];
  return edit
    ? { source: code.slice(node.start, edit.start) + code.slice(edit.end, node.end), offset: edit.start - node.start }
    : { source: codeSlice(code, node), offset: undefined };
}

export function createScopeValidator(scope: EditScope, original: string): (candidate: string) => boolean {
  if (scope.kind === 'create') return () => !original.trim();
  if (scope.kind === 'rewrite') return () => Boolean(original.trim());
  if (scope.kind === 'remove_layers') return removeLayersValidator(original, scope.targets);
  const before = describeScore(original);
  return candidate => {
    const after = describeScore(candidate);
    if (!before.valid || !after.valid) return false;
    if (scope.kind === 'add_layers') {
      const oldArgs = before.stack?.arguments;
      const newArgs = after.stack?.arguments;
      if (!oldArgs?.length || !newArgs || newArgs.length <= oldArgs.length
        || before.layers.length !== oldArgs.length || after.layers.length !== newArgs.length) return false;
      const oldEnd = oldArgs[oldArgs.length - 1].end;
      return oldArgs.every((arg, index) => newArgs[index].start === arg.start && newArgs[index].end === arg.end)
        && candidate.slice(0, oldEnd) === original.slice(0, oldEnd)
        && candidate.slice(newArgs[newArgs.length - 1].end) === original.slice(oldEnd);
    }
    if (scope.kind === 'tempo') {
      return before.tempos.length === 1 && after.tempos.length === 1 && tempoNumber(after.tempos[0])
        && sameParts(outsideParts(original, before.tempos), outsideParts(candidate, after.tempos));
    }
    if (!('targets' in scope)) return false;
    const previous = scope.kind === 'section' ? before.sections : before.layers;
    const next = scope.kind === 'section' ? after.sections : after.layers;
    if (previous.length !== next.length) return false;
    const ids = new Set(scope.targets);
    const oldTargets = previous.filter(target => ids.has(target.id));
    const newTargets = next.filter(target => ids.has(target.id));
    if (!ids.size || oldTargets.length !== ids.size || newTargets.length !== ids.size) return false;
    if (!sameParts(outsideParts(original, oldTargets.map(t => t.node)), outsideParts(candidate, newTargets.map(t => t.node)))) return false;
    if (scope.kind !== 'parameter') return true;
    return oldTargets.every((target, index) => {
      const previous = withoutParameter(original, target.node, scope.parameter, false);
      const next = withoutParameter(candidate, newTargets[index].node, scope.parameter, true);
      return previous !== null && next !== null && previous.source === next.source
        && (previous.offset === undefined || next.offset === undefined || previous.offset === next.offset);
    });
  };
}
