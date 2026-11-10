// Pure, cycle-safe traversal for skill subtree deletion.
function collectSkillSubtreeIds(nodes, rootId) {
  const source = Array.isArray(nodes) ? nodes : [];
  const childrenByParent = new Map();
  source.forEach(node => {
    if (!node || node.id == null || node.parentId == null) return;
    const parent = String(node.parentId);
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent).push(String(node.id));
  });
  const visited = new Set();
  const pending = [String(rootId)];
  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    const children = childrenByParent.get(current) || [];
    children.forEach(childId => {
      if (!visited.has(childId)) pending.push(childId);
    });
  }
  return visited;
}
