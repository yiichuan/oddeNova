# Agent Instruction Design Principles

This document defines platform-neutral principles for designing agent
instructions. They apply to system prompts, `AGENTS.md`, Claude Skills, Cursor
Rules, OpenAI Responses API instructions, and any other mechanism that shapes an
agent's behavior.

## Philosophy

System instructions should not replace the model's reasoning. They should:

- define goals
- define boundaries
- define evaluation criteria
- provide necessary domain knowledge

Leave tactical decisions to the model whenever possible. Every new instruction
should increase reasoning quality rather than reduce reasoning freedom.

The shorthand:

```text
Goal -> Principles -> Knowledge -> Guidance -> Constraints -> Review
```

Chinese shorthand:

```text
目标 -> 原则 -> 知识 -> 引导 -> 约束 -> 自检
```

## 1. Prefer Goals over Rules

Describe what success looks like, not exactly how to achieve it.

Good:

```text
Help the listener gradually understand the musical identity.
```

Bad:

```text
Bass enters at cycle 4.
Lead enters at cycle 8.
```

If a rule exists only because it usually leads to a desired outcome, replace it
with the desired outcome.

## 2. Prefer Principles over Workflows

Avoid long procedural flows. Define decision-making principles instead.

Good:

```text
Prefer reducing user effort.
Ask for clarification only when necessary.
Avoid unnecessary assumptions.
```

Bad:

```text
Step 1
Step 2
Step 3
...
```

The model should infer actions from principles.

## 3. Describe Roles before Parameters

Describe the purpose of an object before its implementation.

Instead of:

```text
Bass:
gain 0.7
c2
```

Prefer:

```text
Bass provides low-frequency foundation.
Choose pitch, rhythm, and dynamics accordingly.
```

Implementation details support the role, not the opposite.

## 4. Describe Outcomes before Techniques

Focus instructions on the desired user, listener, or operator experience rather
than specific APIs.

Good:

```text
Create a gradual sense of buildup.
```

Overly narrow:

```text
Use mask().
```

Multiple implementations may satisfy the same creative or operational goal.

## 5. Teach Capabilities, not Templates

Avoid embedding one preferred solution. Teach transferable reasoning instead.

Instead of teaching only:

```text
Intro
Verse
Drop
Outro
```

Teach reusable functions:

```text
establish
develop
contrast
resolve
```

The model should adapt these ideas to different genres, tasks, and contexts.

## 6. Separate Creative Guidance from Hard Constraints

Different kinds of instructions should live in different sections.

Recommended order:

```text
Goals
Principles
Domain Knowledge
Implementation Guidance
Hard Constraints
Output Format
```

Do not mix engineering constraints with creative guidance.

## 7. Use Examples instead of Excessive Explanation

LLMs learn patterns effectively from examples. When possible:

- provide 1-3 representative examples
- avoid explaining every possible case
- let examples demonstrate the target shape, tone, and level of detail

## 8. Prefer Self-Review over More Rules

Instead of adding another exception, add a self-check.

Example:

```text
Before finishing, verify:
- Is the musical identity clear?
- Does every layer have a purpose?
- Does every variation contribute to the composition?

If not, revise before responding.
```

Self-review scales better than accumulating rules.

## 9. Keep One Level of Abstraction per Section

Avoid mixing high-level philosophy, implementation details, and API syntax in
the same section.

Recommended hierarchy:

```text
Why
What
How
Syntax
```

Each section should stay at one abstraction level.

## 10. Minimize Unnecessary Constraints

Every instruction has a cost. Before adding one, ask:

- Does this prevent a common failure?
- Can this be expressed as a principle instead?
- Can the model infer this by itself?

If the answer is yes, avoid adding another rule. The best prompts are usually
shorter than expected.

## 11. Trust the Model

Assume the model is capable of reasoning. Do not encode every possible
situation.

Only specify:

- goals
- constraints
- evaluation criteria

Avoid replacing reasoning with instructions. Whenever possible, let the model
decide how to achieve the objective.

## Prompt Review Checklist

Whenever editing system instructions, review:

- Does this describe a goal instead of a fixed behavior?
- Does this teach reasoning instead of a template?
- Is this a principle or merely an implementation detail?
- Could this become a self-check instead of a hard rule?
- Does this unnecessarily reduce the model's flexibility?
- Is this section internally consistent in abstraction level?

If an instruction fails these questions, reconsider whether it belongs in the
prompt.
