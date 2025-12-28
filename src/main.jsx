import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Polyfill for global if needed by pdf-lib in some envs
window.global = window;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

