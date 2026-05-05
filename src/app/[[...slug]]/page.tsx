'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// Dynamically import the App component with SSR disabled
// This is necessary because react-router-dom requires the window object
const App = dynamic(() => import('@/App'), {
  ssr: false,
});

export default function Page() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <App />;
}
