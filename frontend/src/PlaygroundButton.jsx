import React from 'react';
import { isPlayground, openPlayground } from './playground.js';

export default function PlaygroundButton() {
  if (isPlayground()) {
    return <span className="playground-badge" title="Eigen werk, los van de reguliere editor">PLAYGROUND</span>;
  }
  return <button className="small" onClick={openPlayground} title="Playground openen in een nieuw venster (eigen werk, los van de voorbeelden)">Playground ↗</button>;
}
