import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import App from './App';
import './index.css';

/*
 * HashRouter, not BrowserRouter: GitHub Pages serves static files with no
 * rewrite rule, so reloading or bookmarking /study/<id> would 404. Routing in
 * the hash keeps every URL resolvable to index.html.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
