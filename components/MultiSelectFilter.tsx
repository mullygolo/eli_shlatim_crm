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
    const wrapperRef = useRef<HTMLDivElement>(null);

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
                <div className="absolute z-10 mt-1 w-full bg-white shadow-lg border rounded-md max-h-60 overflow-y-auto">
                    <div className="p-2 border-b">
                        <label className="flex items-center space-x-2 space-x-reverse px-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={options.length > 0 && selectedValues.length === options.length}
                                onChange={handleSelectAll}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span className="text-sm font-medium">בחר הכל</span>
                        </label>
                    </div>
                    <ul>
                        {options.map(option => (
                            <li key={option.value}>
                                <label className="flex items-center space-x-2 space-x-reverse p-2 cursor-pointer hover:bg-slate-50">
                                    <input
                                        type="checkbox"
                                        checked={selectedValues.includes(option.value)}
                                        onChange={() => handleSelect(option.value)}
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                    />
                                    <span className="text-sm">{option.label}</span>
                                </label>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default MultiSelectFilter;
