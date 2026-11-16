// Bestandstabs voor één Monaco-editor. Elk tabblad bewaart zijn eigen inhoud.
export function createFileTabs({ container, editor, saved, label, onChange = () => {} }) {
  let files = Array.isArray(saved?.files)
    ? saved.files.filter(file => file && typeof file.id === 'string' && typeof file.name === 'string' && typeof file.content === 'string')
    : [];
  if (!files.length) files = [{ id: 'default', name: '', content: editor.getValue() }];
  let activeId = files.some(file => file.id === saved?.activeId) ? saved.activeId : files[0].id;
  let switching = false;
  const active = () => files.find(file => file.id === activeId);

  function show(content) {
    switching = true;
    editor.setValue(content);
    switching = false;
  }
  show(active().content);
  editor.onDidChangeModelContent(() => { if (!switching) active().content = editor.getValue(); });

  function activate(id) {
    active().content = editor.getValue();
    activeId = id;
    show(active().content);
    render();
    onChange();
  }

  function add(name, content) {
    active().content = editor.getValue();
    const file = { id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`, name, content };
    files.push(file);
    activeId = file.id;
    show(content);
    render();
    onChange();
  }

  function close(id) {
    if (files.length < 2) return;
    active().content = editor.getValue();
    const index = files.findIndex(file => file.id === id);
    files.splice(index, 1);
    if (id === activeId) {
      activeId = files[Math.min(index, files.length - 1)].id;
      show(active().content);
    }
    render();
    onChange();
  }

  function reset(name, content) {
    files = [{ id: 'default', name, content }];
    activeId = 'default';
    show(content);
    render();
    onChange();
  }

  function render() {
    const tabs = files.map(file => {
      const tab = document.createElement('div');
      tab.className = `tab${file.id === activeId ? ' active' : ''}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(file.id === activeId));
      const name = document.createElement('span');
      name.className = 'tab-name';
      name.textContent = file.name || 'naamloos';
      const closeButton = document.createElement('button');
      closeButton.className = 'tab-close';
      closeButton.type = 'button';
      closeButton.title = 'Bestand sluiten';
      closeButton.setAttribute('aria-label', `${file.name || 'naamloos'} sluiten`);
      closeButton.textContent = '×';
      closeButton.onclick = event => { event.stopPropagation(); close(file.id); };
      tab.onclick = () => { if (file.id !== activeId) activate(file.id); };
      tab.append(name, closeButton);
      return tab;
    });
    const addButton = document.createElement('button');
    addButton.className = 'tab-new';
    addButton.type = 'button';
    addButton.title = `Nieuw ${label}-bestand (alleen in de browser)`;
    addButton.setAttribute('aria-label', addButton.title);
    addButton.textContent = '+';
    addButton.onclick = () => add('', '');
    container.replaceChildren(...tabs, addButton);
  }
  render();

  return {
    add,
    reset,
    activeName: () => active().name,
    getState: () => {
      active().content = editor.getValue();
      return { files: files.map(({ id, name, content }) => ({ id, name, content })), activeId };
    }
  };
}
