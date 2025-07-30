import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  // Temporarily disable StrictMode to fix state reset issue
  // <React.StrictMode>
    <App />
  // </React.StrictMode>
);