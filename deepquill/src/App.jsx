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
import GlitchIntro from "./components/GlitchIntro.jsx";

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
  // Check skipLoad param immediately (before LoadingScreen renders)
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const skipLoad = params?.get('skipLoad') === '1';
  
  const [isLoaded, setIsLoaded] = useState(skipLoad); // Start as loaded if skipLoad=1
  const [menuOpen, setMenuOpen] = useState(false);
  const [entryVariant, setEntryVariant] = useState(null);
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [showIntro, setShowIntro] = useState(false); // ✅ Terminal: intro plays once

  console.log('[App] Render - isLoaded:', isLoaded, 'skipLoad:', skipLoad);

  // 3.2: Variant decision happens BEFORE any redirect / heavy render
  // Use pure JS ESM module (no CJS require)
  // SKIP AB SPLIT when in embed mode (iframe or ?embed=1 param)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Check if we're in embed mode (iframe or ?embed=1)
    const params = new URLSearchParams(window.location.search);
    const isEmbedMode = params.get('embed') === '1' || window !== window.top;
    
    if (isEmbedMode) {
      // In embed mode: always show terminal, never redirect
      console.log('[App] Embed mode detected - skipping AB split, showing terminal');
      setEntryVariant('terminal');
      
      // ✅ Terminal: Check if intro should play (plays once)
      const seenIntro = localStorage.getItem('dq_seen_terminal_intro');
      if (seenIntro !== 'true') {
        console.log('[App] Terminal intro not seen - will play intro');
        setShowIntro(true);
      } else {
        console.log('[App] Terminal intro already seen - skipping');
        setShowIntro(false);
      }
      
      // If skipLoad=1, ensure terminal shows immediately (no LoadingScreen)
      if (params.get('skipLoad') === '1') {
        console.log('[App] skipLoad=1 detected - skipping LoadingScreen');
        setIsLoaded(true);
      }
      return;
    }
    
    try {
      const variant = chooseVariant();
      setEntryVariant(variant);
      console.log('[App] Entry variant chosen:', variant);
      
      // If variant is "protocol", redirect to protocol-challenge page (in agnes-next)
      if (variant === 'protocol') {
        handleProtocolRedirect();
        return; // Exit early - don't render terminal
      }
      // Variant is "terminal" - continue to show TerminalEmulator (no redirect)
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
  // skipLoad is handled in useState initialization above
  // On completion, decide variant and either redirect or render terminal
  return (
    <>
      {/* ✅ Terminal: Intro plays once (skipIfSeen=true) */}
      {showIntro && (
        <GlitchIntro
          onComplete={() => {
            console.log('[App] Terminal glitch intro complete');
            setShowIntro(false);
            // Mark as seen
            if (typeof window !== 'undefined') {
              localStorage.setItem('dq_seen_terminal_intro', 'true');
            }
          }}
          skipIfSeen={true}
          localStorageKey="dq_seen_terminal_intro"
        />
      )}
      
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
        style={{ display: isLoaded && !showIntro ? 'block' : 'none' }}
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
