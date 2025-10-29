'use client';
import { useEffect } from 'react';

export default function LightningAlias() {
  useEffect(() => { location.replace('/lightening'); }, []);
  return null;
}
