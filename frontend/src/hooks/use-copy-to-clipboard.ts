import { useState, useCallback } from "react";

/**
 * Hook for copying text to the clipboard with a temporary success state.
 * The `isCopied` flag auto-resets after `timeout` ms (default 2000).
 */
export function useCopyToClipboard(timeout = 2000) {
  const [isCopied, setIsCopied] = useState(false);

  const copy = useCallback(
    (value: string) => {
      if (!navigator?.clipboard) {
        // Fallback for older browsers / insecure contexts
        const textarea = document.createElement("textarea");
        textarea.value = value;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), timeout);
        return;
      }

      navigator.clipboard.writeText(value).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), timeout);
      });
    },
    [timeout]
  );

  return { isCopied, copy };
}
