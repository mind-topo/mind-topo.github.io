// Page sections, in scroll order. The side nav, the mobile drawer and the
// scroll-spy all read this list, and each id matches a <section id> on the page.
export const SECTIONS = [
  { id: 'top', label: 'Overview' },
  { id: 'teaser', label: 'Teaser video' },
  { id: 'findings', label: 'Key findings' },
  { id: 'play', label: 'Play the benchmark' },
  { id: 'results', label: 'The action gap' },
  { id: 'release', label: 'Core & Extended' },
  { id: 'humans', label: 'Against humans' },
  { id: 'training', label: 'Training' },
  { id: 'errors', label: 'Failure modes' },
  { id: 'imagination', label: 'Visual imagination' },
  { id: 'citation', label: 'Citation' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

/** Two-digit section number shown in each section's eyebrow, e.g. "04". */
export const sectionNumber = (id: SectionId) =>
  String(SECTIONS.findIndex((s) => s.id === id)).padStart(2, '0');

export const sectionLabel = (id: SectionId) => SECTIONS.find((s) => s.id === id)!.label;
