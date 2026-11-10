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

 
// Repair missing, self-referential, and cyclic parent links in imported/legacy trees.
// The input is already a detached migrated state, so normalization is safe in place.
function normalizeSkillTreeParents(directions) {
  (Array.isArray(directions) ? directions : []).forEach(direction => {
    const nodes = Array.isArray(direction.nodes) ? direction.nodes : [];
    const byId = new Map();
    nodes.forEach(node => {
      if (node && node.id != null) byId.set(String(node.id), node);
    });
    nodes.forEach(node => {
      if (!node || node.parentId == null) return;
      const parent = byId.get(String(node.parentId));
      if (!parent || String(parent.id) === String(node.id)) node.parentId = null;
    });
    nodes.forEach(start => {
      if (!start || start.id == null) return;
      const visited = new Set();
      let current = start;
      while (current && current.parentId != null) {
        const currentId = String(current.id);
        if (visited.has(currentId)) {
          current.parentId = null;
          break;
        }
        visited.add(currentId);
        const parent = byId.get(String(current.parentId));
        if (!parent) {
          current.parentId = null;
          break;
        }
        if (visited.has(String(parent.id))) {
          current.parentId = null;
          break;
        }
        current = parent;
      }
    });
  });
  return directions;
}
