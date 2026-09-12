import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import { AuthProvider } from './context/AuthContext.js';
import { CartProvider } from './context/CartContext.js';
import { LocaleProvider } from './i18n/LocaleContext.js';
import { detectInitialLocale } from './i18n/locale.js';
import { setApiLocale } from './lib/api.js';
import './index.css';

// BEFORE the first render, deliberately: HomePage fires api.categories() on
// mount, so the fetch layer must already know the locale or the first paint
// would be English content under a Spanish UI. main.tsx is the one place that
// imports both — api.ts never imports from i18n/, keeping that edge one-way.
const initialLocale = detectInitialLocale();
setApiLocale(initialLocale);
document.documentElement.lang = initialLocale;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LocaleProvider>
        <AuthProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </AuthProvider>
      </LocaleProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
