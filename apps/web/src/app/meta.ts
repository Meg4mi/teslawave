import { useEffect } from 'react';

/**
 * The title and description follow the language, and the privacy page gets its own. The
 * shell in index.html carries the English ones for anything that does not run scripts;
 * this keeps the tab, the bookmark on the car and a share from a French screen honest.
 */
export function useDocumentMeta(title: string, description?: string): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute('content') ?? null;
    if (meta && description) meta.setAttribute('content', description);
    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== null) meta.setAttribute('content', previousDescription);
    };
  }, [title, description]);
}
