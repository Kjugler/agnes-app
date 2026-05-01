/**
 * Temporary diagnostics for Signal Room data loading.
 * Set SIGNAL_ROOM_LOADER_DEBUG=1 (server) and optional NEXT_PUBLIC_SIGNAL_ROOM_LOADER_DEBUG=1 (browser).
 */

export function shouldLogSignalRoomLoaderServer(): boolean {
  return process.env.SIGNAL_ROOM_LOADER_DEBUG === '1' || process.env.NODE_ENV === 'development';
}

export function shouldLogSignalRoomLoaderClient(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    process.env.NEXT_PUBLIC_SIGNAL_ROOM_LOADER_DEBUG === '1' || process.env.NODE_ENV === 'development'
  );
}
