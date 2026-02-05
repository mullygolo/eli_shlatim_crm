import React, { useRef, useEffect, useCallback } from 'react';

const DEFAULT_MIN_HEIGHT_PX = 40;
const DEFAULT_MAX_HEIGHT_PX = 200;

export interface AutoResizeTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'style'> {
    /** Minimum height in pixels */
    minHeight?: number;
    /** Maximum height in pixels; beyond this the textarea scrolls */
    maxHeight?: number;
    /** Optional style merge */
    style?: React.CSSProperties;
}

/**
 * Textarea that grows with content (min height to max height, then scroll).
 * Resizes on value change (including when loaded from server) and on input.
 */
export default function AutoResizeTextarea({
    value,
    onChange,
    minHeight = DEFAULT_MIN_HEIGHT_PX,
    maxHeight = DEFAULT_MAX_HEIGHT_PX,
    style,
    ...rest
}: AutoResizeTextareaProps) {
    const ref = useRef<HTMLTextAreaElement>(null);

    const resize = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
        el.style.height = `${next}px`;
    }, [minHeight, maxHeight]);

    useEffect(() => {
        resize();
    }, [value, resize]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange?.(e);
        resize();
    };

    return (
        <textarea
            ref={ref}
            value={value}
            onChange={handleChange}
            style={{
                minHeight: `${minHeight}px`,
                maxHeight: `${maxHeight}px`,
                resize: 'none',
                overflowY: 'auto',
                ...style,
            }}
            {...rest}
        />
    );
}
