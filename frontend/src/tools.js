export function isToolEnabled(tool) {
  try {
    return localStorage.getItem(`tool.${tool}`) !== 'off';
  } catch {
    return true;
  }
}

export function setToolEnabled(tool, enabled) {
  localStorage.setItem(`tool.${tool}`, enabled ? 'on' : 'off');
}
