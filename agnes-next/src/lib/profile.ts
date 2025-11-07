import type { Associate } from '@/types/contest';

/**
 * Get current Associate profile by email (from localStorage or cookie)
 */
export async function getAssociate(): Promise<Associate | null> {
  if (typeof window === 'undefined') return null;

  // Get email from localStorage or cookie
  let email: string | null = null;
  try {
    email = localStorage.getItem('email') || 
            document.cookie.split('; ').find((r) => r.startsWith('email='))?.split('=')[1] || null;
  } catch {}

  if (!email) return null;

  try {
    const res = await fetch(`/api/contest/profile?email=${encodeURIComponent(email)}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error('Failed to fetch associate');
    }

    const data = await res.json();
    return data.associate || null;
  } catch (error) {
    console.error('[profile] getAssociate error:', error);
    return null;
  }
}

/**
 * Update social handles for current Associate
 */
export async function updateHandles(patch: {
  x?: string;
  instagram?: string;
  tiktok?: string;
  truth?: string;
}): Promise<Associate> {
  if (typeof window === 'undefined') {
    throw new Error('updateHandles must be called from client');
  }

  // Get email
  let email: string | null = null;
  try {
    email = localStorage.getItem('email') || 
            document.cookie.split('; ').find((r) => r.startsWith('email='))?.split('=')[1] || null;
  } catch {}

  if (!email) {
    throw new Error('Email not found. Please sign up first.');
  }

  try {
    const res = await fetch(`/api/contest/profile?email=${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update handles');
    }

    const data = await res.json();
    return data.associate;
  } catch (error: any) {
    console.error('[profile] updateHandles error:', error);
    throw error;
  }
}

