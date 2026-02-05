import React, { useState, useRef, useEffect } from 'react';

interface Option {
    value: string;
    label: string;
}

interface MultiSelectFilterProps {
    label: string;
    options: Option[];
    selectedValues: string[];
    onChange: (selected: string[]) => void;
}

const MultiSelectFilter: React.FC<MultiSelectFilterProps> = ({ label, options, selectedValues, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);

    useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
            searchInputRef.current?.focus();
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

    const handleSelect = (value: string) => {
        const newSelected = selectedValues.includes(value)
            ? selectedValues.filter(v => v !== value)
            : [...selectedValues, value];
        onChange(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedValues.length === options.length) {
            onChange([]);
        } else {
            onChange(options.map(o => o.value));
        }
    };
    
    const getButtonText = () => {
        if (selectedValues.length === 0) {
            return `הכל`;
        }
        if (selectedValues.length === 1) {
             const selectedOption = options.find(o => o.value === selectedValues[0]);
             return selectedOption ? selectedOption.label : '1 נבחר';
        }
        return `${selectedValues.length} נבחרו`;
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full text-sm p-2 border border-slate-300 rounded-md focus:ring-primary focus:border-primary bg-white text-start flex justify-between items-center"
            >
                <span className="truncate">{getButtonText()}</span>
                <svg className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full min-w-[180px] bg-white shadow-lg border border-slate-200 rounded-md overflow-hidden">
                    <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.stopPropagation()}
                            placeholder="חפש..."
                            dir="rtl"
                            className="w-full text-sm p-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-primary/30 focus:border-primary text-right placeholder:text-slate-400"
                        />
                    </div>
                    <div className="p-2 border-b border-slate-100">
                        <label className="flex items-center gap-2 px-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={options.length > 0 && selectedValues.length === options.length}
                                onChange={handleSelectAll}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span className="text-sm font-medium">בחר הכל</span>
                        </label>
                    </div>
                    <ul className="max-h-52 overflow-y-auto py-1">
                        {filteredOptions.length === 0 ? (
                            <li className="px-4 py-3 text-sm text-slate-400 text-center">אין תוצאות</li>
                        ) : (
                            filteredOptions.map(option => (
                                <li key={option.value}>
                                    <label className="flex items-center gap-2 p-2 cursor-pointer hover:bg-slate-50">
                                        <input
                                            type="checkbox"
                                            checked={selectedValues.includes(option.value)}
                                            onChange={() => handleSelect(option.value)}
                                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <span className="text-sm text-right flex-1">{option.label}</span>
                                    </label>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default MultiSelectFilter;
