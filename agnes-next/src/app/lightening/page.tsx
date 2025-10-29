// /app/lightening/page.tsx

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function LighteningPage() {
  const playerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    (window as any).onYouTubeIframeAPIReady = () => {
      new (window as any).YT.Player("player", {
        videoId: "ofr9MTgh2mM",
        playerVars: {
          autoplay: 1,
          controls: 1,
          showinfo: 0,
          modestbranding: 1,
          loop: 0,
          rel: 0,
          mute: 1,
          enablejsapi: 1,
        },
        events: {
          onReady: (event: any) => {
            event.target.playVideo();
          },
          onStateChange: (event: any) => {
            if (event.data === 0) {
              router.push("/contest");
            }
          },
        },
      });
    };
  }, [router]);

  const handleSkip = () => {
    router.push("/contest");
  };

  return (
    <div style={{ height: "100vh", width: "100vw", backgroundColor: "black", overflow: "hidden", position: "relative" }}>
      <div id="player" ref={playerRef} style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "100%", zIndex: 1 }} />
      <button
        onClick={handleSkip}
        style={{
          position: "absolute",
          bottom: 30,
          right: 30,
          zIndex: 2,
          padding: "12px 20px",
          fontSize: "16px",
          background: "red",
          color: "white",
          border: "2px solid white",
          borderRadius: "8px",
          cursor: "pointer"
        }}
      >
        Skip ▶
      </button>
    </div>
  );
}
