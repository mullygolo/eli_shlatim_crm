import { useState, useCallback, useRef } from 'react';

/**
 * Custom hook to prevent double-clicks and multiple rapid executions of async actions.
 * This is a professional solution used in high-level applications to handle:
 * - Button disabling during async operations
 * - Prevention of duplicate submissions
 * - Loading state management
 * 
 * @param asyncFn - The async function to execute
 * @param options - Configuration options
 * @returns Object with execute function, loading state, and error state
 */
export function useAsyncAction<T extends (...args: any[]) => Promise<any>>(
    asyncFn: T,
    options: {
        /** Whether to disable the action after first execution until it completes */
        preventDoubleClick?: boolean;
        /** Custom error handler */
        onError?: (error: Error) => void;
        /** Custom success handler */
        onSuccess?: (result: Awaited<ReturnType<T>>) => void;
    } = {}
) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const isExecutingRef = useRef(false);

    const execute = useCallback(
        async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>> | undefined> => {
            // Prevent double execution - check ref first (most reliable)
            if (isExecutingRef.current) {
                console.warn('Action already in progress, ignoring duplicate call');
                return;
            }

            isExecutingRef.current = true;
            setIsLoading(true);
            setError(null);

            try {
                const result = await asyncFn(...args);
                
                if (options.onSuccess) {
                    options.onSuccess(result);
                }
                
                return result;
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                setError(error);
                
                if (options.onError) {
                    options.onError(error);
                } else {
                    console.error('Error in async action:', error);
                }
                
                throw error;
            } finally {
                setIsLoading(false);
                // Use a small delay to prevent rapid re-clicks
                setTimeout(() => {
                    isExecutingRef.current = false;
                }, 100);
            }
        },
        [asyncFn, options]
    );

    return {
        execute,
        isLoading,
        error,
        /** Reset the error state */
        resetError: useCallback(() => setError(null), [])
    };
}
