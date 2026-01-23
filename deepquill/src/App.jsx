import { useState, useEffect } from "react";
import { chooseVariant, getCurrentVariant } from "./lib/abSplit.js";
import "./App.css";
import { LoadingScreen } from "./components/LoadingScreen";
import { Navbar } from "./components/Navbar";
import { MobileMenu } from "./components/MobileMenu";
import { Home } from "./components/sections/Home";
import { About } from "./components/sections/About";
import { Projects } from "./components/sections/Projects";
import "./index.css";
import { Contact } from "./components/sections/Contact";

// Dev-only variant display component
function VariantDisplay({ variant }) {
  const [source, setSource] = useState('unknown');
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    import('./lib/abSplit.js').then((abSplit) => {
      const current = abSplit.getCurrentVariant();
      setSource(current.source);
    }).catch(() => {
      setSource('unknown');
    });
  }, []);
  
  return (
    <div style={{
      position: 'fixed',
      bottom: 8,
      left: 8,
      zIndex: 99999,
      background: '#111',
      color: '#0f0',
      padding: '4px 6px',
      fontFamily: 'monospace',
      fontSize: 12,
      border: '1px solid #0f0',
      borderRadius: 6
    }}>
      entry_variant: {variant} (source: {source})
    </div>
  );
}

function App() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [entryVariant, setEntryVariant] = useState(null);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  console.log('[App] Render - isLoaded:', isLoaded);

  // 3.2: Variant decision happens BEFORE any redirect / heavy render
  // Use pure JS ESM module (no CJS require)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const variant = chooseVariant();
      setEntryVariant(variant);
      console.log('[App] Entry variant chosen:', variant);
      
      // If variant is "protocol", redirect to protocol-challenge page (in agnes-next)
      if (variant === 'protocol') {
        handleProtocolRedirect();
      }
      // Variant is "terminal" - continue to show TerminalEmulator
    } catch (error) {
      console.error('[App] Error in A/B split logic:', error);
      // Fallback to terminal variant to ensure we never blank
      setEntryVariant('terminal');
    }
  }, []);
  
  function handleProtocolRedirect() {
    // 3.3: Redirect target must be origin-aware
    let nextBase;
    
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      // Local dev: deepquill is localhost:5173, agnes-next is localhost:3000
      nextBase = 'http://localhost:3000';
    } else {
      // ngrok/production: both are same external origin
      nextBase = window.location.origin;
    }
    
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.delete('ab_reset'); // Remove reset param from redirect
    const protocolUrl = `${nextBase}/the-protocol-challenge${currentParams.toString() ? `?${currentParams.toString()}` : ''}`;
    console.log('[App] Redirecting to protocol challenge:', protocolUrl);
    setShouldRedirect(true);
    // Use setTimeout to ensure state update completes before redirect
    setTimeout(() => {
      window.location.href = protocolUrl;
    }, 0);
  }

  // If redirecting, show nothing (prevent flash)
  if (shouldRedirect) {
    return (
      <div style={{ 
        position: 'fixed', 
        inset: 0, 
        backgroundColor: '#000', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: '#0f0',
        fontFamily: 'monospace'
      }}>
        Redirecting...
      </div>
    );
  }

  // Always render LoadingScreen by default (never blank)
  // On completion, decide variant and either redirect or render terminal
  return (
    <>
      {!isLoaded && (
        <LoadingScreen 
          onComplete={() => {
            console.log('[App] LoadingScreen onComplete called');
            setIsLoaded(true);
          }} 
        />
      )}
      <div
        className={`min-h-screen transition-opacity duration-700 ${
          isLoaded ? "opacity-100" : "opacity-0"
        } bg-black text-gray-100`}
        style={{ display: isLoaded ? 'block' : 'none' }}
      >
      {/* <Navbar menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <MobileMenu menuOpen={menuOpen} setMenuOpen={setMenuOpen} /> */}
      
      {/* Only show TerminalEmulator if variant is "terminal" (or null during load) */}
      {/* Default to terminal if variant resolution failed */}
      {(!entryVariant || entryVariant === 'terminal') && <Home />}
        
        {/* E4: Dev-only variant display */}
        {process.env.NODE_ENV === 'development' && entryVariant && (
          <div style={{
            position: 'fixed',
            bottom: 8,
            left: 8,
            zIndex: 99999,
            background: '#111',
            color: '#0f0',
            padding: '4px 6px',
            fontFamily: 'monospace',
            fontSize: 12,
            border: '1px solid #0f0',
            borderRadius: 6
          }}>
            entry_variant: {entryVariant} (source: {(() => {
              try {
                const current = getCurrentVariant();
                return current.source;
              } catch {
                return 'unknown';
              }
            })()})
          </div>
        )}
        
      {/* <About />
      <Projects />
      <Contact /> */}
    </div>
    </>
  );
}

export default App;
