import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './contexts/AuthContext';
import { RootErrorBoundary } from './components/RootErrorBoundary';
import App from './App';

function showBootstrapError(message: string, detail?: string) {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;
  rootElement.innerHTML = `
    <div class="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-slate-100" dir="rtl" style="font-family: Rubik, sans-serif;">
      <h1 class="text-xl font-bold text-red-800">שגיאה בטעינת האפליקציה</h1>
      <p class="text-slate-700 text-center max-w-lg">${message}</p>
      ${detail ? `<pre class="text-start text-sm bg-white p-4 rounded border border-slate-200 overflow-auto max-h-48 w-full max-w-lg">${detail}</pre>` : ''}
      <p class="text-slate-500 text-sm">ודא שהשרת רץ (פורט 3002) ופתח קונסולה (F12) לפרטים.</p>
    </div>
  `;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  showBootstrapError('לא נמצא אלמנט root להצגת האפליקציה.');
  throw new Error("Could not find root element to mount to");
}

const LoadingFallback = () => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-light-bg" style={{ fontFamily: 'Rubik, sans-serif' }} dir="rtl">
    <p className="text-slate-500">טוען...</p>
    <p className="text-slate-400 text-sm">אם ההודעה לא נעלמת, פתח קונסולה (F12) ובדוק שהשרת רץ (פורט 3002).</p>
  </div>
);

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <RootErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </RootErrorBoundary>
    </React.StrictMode>
  );
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  const detail = err instanceof Error && err.stack ? err.stack : undefined;
  showBootstrapError('האפליקציה נכשלה בטעינה.', detail);
  console.error('Bootstrap error:', err);
}
