// ===================== STATE STORE =====================
// Classic-script compatibility layer. The shared lexical "state" binding
// is declared by 01-core.js; these functions are called only after bootstrap.
function getState() {
  return state;
}

function replaceState(nextState) {
  if (!nextState || typeof nextState !== 'object' || Array.isArray(nextState)) {
    throw new TypeError('replaceState expects a state object');
  }
  state = nextState;
  return state;
}
