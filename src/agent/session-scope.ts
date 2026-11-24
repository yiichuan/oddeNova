import { parse, type CallExpression, type Expression, type Node } from 'acorn';

export const editScopes = ['create', 'rewrite', 'add_layers', 'layers', 'section', 'parameter', 'tempo'] as const;
export const scopedParameters = ['gain', 'lpf', 'hpf', 'pan', 'room', 'delay', 'attack', 'release'] as const;

export type EditScope =
  | { kind: 'create' | 'rewrite' | 'add_layers' | 'tempo' }
  | { kind: 'layers' | 'section'; targets: string[] }
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

function describeScore(code: string) {
  const layers: Target[] = [];
  const sections: Target[] = [];
  const tempos: Expression[] = [];
  let stack: CallExpression | undefined;
  let program;
  try {
    program = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
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
      stack = stack ? undefined : mix;
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
