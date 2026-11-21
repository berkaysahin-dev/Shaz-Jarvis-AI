import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import MiniBar from './MiniBar.tsx'
import './index.css'

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: '#1c1c1e', color: 'rgba(255,255,255,0.92)', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', textAlign: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: '8px' }}>JARVIS başlatılamadı</h2>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', maxWidth: '400px', wordBreak: 'break-word', marginBottom: '20px' }}>
            {this.state.error?.message || 'Bilinmeyen bir arayüz hatası oluştu.'}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="btn btn-primary btn-lg"
          >
            Yeniden Başlat
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Electron renders a native Windows 11 material behind the page; flag it so CSS can let it show through.
if (typeof window !== 'undefined' && /Electron/i.test(navigator.userAgent)) {
  document.documentElement.classList.add('is-electron');
}

// The desktop mini menu loads this same page with #mini
const isMini = window.location.hash === '#mini';
if (isMini) document.documentElement.classList.add('is-mini');

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isMini ? <MiniBar /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>,
)
