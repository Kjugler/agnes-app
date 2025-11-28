import { useState } from "react";
import "./App.css";
import { LoadingScreen } from "./components/LoadingScreen";
import { Navbar } from "./components/Navbar";
import { MobileMenu } from "./components/MobileMenu";
import { Home } from "./components/sections/Home";
import { About } from "./components/sections/About";
import { Projects } from "./components/sections/Projects";
import "./index.css";
import { Contact } from "./components/sections/Contact";

function App() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  console.log('[App] Render - isLoaded:', isLoaded);

  // Error boundary - catch any errors during render
  try {
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
        <Home />
        {/* <About />
        <Projects />
        <Contact /> */}
      </div>
      </>
    );
  } catch (error) {
    console.error('[App] Render error:', error);
    return (
      <div className="fixed inset-0 bg-black text-red-500 flex items-center justify-center p-8">
        <div>
          <h1 className="text-4xl mb-4">Error Loading App</h1>
          <p className="text-xl mb-4">Check browser console for details</p>
          <pre className="text-sm overflow-auto max-h-96 bg-gray-900 p-4 rounded">
            {error.toString()}
            {error.stack}
          </pre>
        </div>
      </div>
    );
  }
}

export default App;
