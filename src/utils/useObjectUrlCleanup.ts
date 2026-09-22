import { useEffect } from 'react';

export function useObjectUrlCleanup(url: string) {
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
}
