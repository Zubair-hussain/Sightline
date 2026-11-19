'use client';
import { useEffect, useState } from 'react';
import { detectOS, type OS } from './os';

/** The visitor's OS, detected after hydration so server and client HTML match. */
export function useOS(): OS {
  const [os, setOs] = useState<OS>('other');
  useEffect(() => setOs(detectOS()), []);
  return os;
}
