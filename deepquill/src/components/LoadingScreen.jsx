import { useEffect, useState } from "react";

export const LoadingScreen = ({ onComplete }) => {
  const [text, setText] = useState("");
  const fullText = "AGNES PROTOCOL"; // Changed to uppercase as user expects

  console.log('[LoadingScreen] Rendering - text:', text);

  useEffect(() => {
    console.log('[LoadingScreen] Starting animation');
    let index = 0;
    const interval = setInterval(() => {
      setText(fullText.substring(0, index));
      index++;

      if (index > fullText.length) {
        console.log('[LoadingScreen] Animation complete, calling onComplete in 1 second');
        clearInterval(interval);

        setTimeout(() => {
          console.log('[LoadingScreen] Calling onComplete');
          onComplete();
        }, 1000);
      }
    }, 100);

    return () => {
      console.log('[LoadingScreen] Cleaning up interval');
      clearInterval(interval);
    };
  }, [onComplete, fullText]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      <div className="mb-4 text-6xl font-mono font-bold tracking-wider">
        <span className="text-red-600">{text}</span>
        <span className="text-red-600 animate-blink ml-1">|</span>
      </div>

      <div className="w-[200px] h-[2px] bg-gray-800 rounded relative overflow-hidden">
        <div className="w-[40%] h-full bg-red-500 shadow-[0_0_15px_#3b82f6] animate-loading-bar"></div>
      </div>
    </div>
  );
};
