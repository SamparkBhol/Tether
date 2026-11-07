type Node = Record<string, unknown>;

export const text = (t: string, marks?: Node[]): Node => (marks ? { type: 'text', text: t, marks } : { type: 'text', text: t });
export const strong = (t: string) => text(t, [{ type: 'strong' }]);
export const link = (t: string, href: string) => text(t, [{ type: 'link', attrs: { href } }]);
export const mention = (accountId: string): Node => ({ type: 'mention', attrs: { id: accountId } });
export const paragraph = (...content: Node[]): Node => ({ type: 'paragraph', content });
export const bullets = (items: Node[][]): Node => ({
  type: 'bulletList',
  content: items.map((c) => ({ type: 'listItem', content: [paragraph(...c)] })),
});
export const panel = (kind: 'info' | 'note' | 'success' | 'warning', ...content: Node[]): Node => ({
  type: 'panel',
  attrs: { panelType: kind },
  content,
});
export const doc = (...content: Node[]) => ({ type: 'doc', version: 1, content });

export const plain = (adf: unknown, limit = 2000): string => {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const node = n as { type?: string; text?: string; content?: unknown[] };
    if (node.type === 'text' && node.text) out.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(walk);
    if (node.type === 'paragraph' || node.type === 'listItem') out.push('\n');
  };
  walk(adf);
  return out.join('').replace(/\n{3,}/g, '\n\n').trim().slice(0, limit);
};
