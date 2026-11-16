export const isPlayground = () => new URLSearchParams(window.location.search).has('playground');

// Reguliere editor: bewaard in de browser. Playground: alleen voor dit venster (verdwijnt bij sluiten).
export const stateStorage = () => (isPlayground() ? sessionStorage : localStorage);

export const playgroundHref = path => (isPlayground() ? `${path}?playground` : path);

export const openPlayground = () => window.open(`${window.location.pathname}?playground`, '_blank');
