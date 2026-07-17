export interface Section {
  heading: string;
  body: string;
}

export function splitSections(prompt: string): Section[] {
  const lines = prompt.split('\n');
  const sections: Section[] = [];
  let current: { heading: string; body: string[] } | null = null;
  for (const line of lines) {
    const match = /^## (.*)$/.exec(line);
    if (match) {
      if (current) sections.push({ heading: current.heading, body: current.body.join('\n') });
      current = { heading: match[1], body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.body.join('\n') });
  return sections.map((s) => ({ heading: s.heading, body: s.body.replace(/\n+$/, '') }));
}
