import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Option {
    value: string;
    label: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    title?: string;
    id?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = 'בחר...',
    className = '',
    title,
    id,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const updateDropdownPosition = () => {
        if (wrapperRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect();
            setDropdownRect({
                top: rect.bottom + 4,
                left: rect.left,
                width: Math.max(rect.width, 200),
            });
        }
    };

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                const target = event.target as HTMLElement;
                if (target.closest?.('[data-searchable-select-dropdown]')) return;
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
            updateDropdownPosition();
            const t = setTimeout(() => searchInputRef.current?.focus(), 0);
            const onScrollOrResize = () => updateDropdownPosition();
            window.addEventListener('scroll', onScrollOrResize, true);
            window.addEventListener('resize', onScrollOrResize);
            return () => {
                clearTimeout(t);
                window.removeEventListener('scroll', onScrollOrResize, true);
                window.removeEventListener('resize', onScrollOrResize);
            };
        } else {
            setDropdownRect(null);
        }
    }, [isOpen]);

    useEffect(() => {
        function handleEscape(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [isOpen]);

    const filteredOptions = searchQuery.trim()
        ? options.filter(o => o.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
        : options;

    const selectedLabel = value ? (options.find(o => o.value === value)?.label ?? '') : '';

    const dropdownContent = isOpen && dropdownRect && (
        <div
            data-searchable-select-dropdown
            className="fixed z-[9999] bg-white shadow-lg border border-slate-200 rounded-md overflow-hidden"
            style={{
                top: dropdownRect.top,
                left: dropdownRect.left,
                width: dropdownRect.width,
            }}
        >
            <div className="p-1.5 border-b border-slate-100 bg-slate-50/50">
                <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.stopPropagation()}
                    placeholder="חפש..."
                    dir="rtl"
                    className="w-full text-sm p-1.5 border border-slate-200 rounded focus:ring-2 focus:ring-primary/30 focus:border-primary text-right placeholder:text-slate-400"
                />
            </div>
            <ul className="max-h-48 overflow-y-auto py-1">
                <li>
                    <button
                        type="button"
                        onClick={() => {
                            onChange('');
                            setIsOpen(false);
                        }}
                        className="w-full text-right px-3 py-2 text-sm hover:bg-slate-50 text-slate-500"
                    >
                        {placeholder}
                    </button>
                </li>
                {filteredOptions.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-slate-400 text-center">אין תוצאות</li>
                ) : (
                    filteredOptions.map(option => (
                        <li key={option.value}>
                            <button
                                type="button"
                                onClick={() => {
                                    onChange(option.value);
                                    setIsOpen(false);
                                }}
                                className={`w-full text-right px-3 py-2 text-sm hover:bg-slate-50 ${option.value === value ? 'bg-primary/10 font-medium' : ''}`}
                            >
                                {option.label}
                            </button>
                        </li>
                    ))
                )}
            </ul>
        </div>
    );

    return (
        <>
            <div className="relative w-full min-w-0" ref={wrapperRef} id={id}>
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    title={title ?? (value ? selectedLabel : placeholder)}
                    className={`w-full text-start rounded-md border-2 border-slate-300 bg-white py-1.5 px-2 text-sm focus:border-primary focus:ring-primary truncate ${className}`}
                >
                    <span className="block truncate">{value ? selectedLabel : placeholder}</span>
                    <span className="absolute end-2 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </span>
                </button>
            </div>
            {typeof document !== 'undefined' && dropdownContent && createPortal(dropdownContent, document.body)}
        </>
    );
};

export default SearchableSelect;
