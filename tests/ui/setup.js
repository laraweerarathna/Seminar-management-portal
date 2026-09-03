import React from 'react';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

globalThis.React = React;

if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = callback => window.setTimeout(callback, 0);
}

afterEach(() => cleanup());
