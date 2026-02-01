
import React from 'react';

type ModalSize = 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

interface ModalProps {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    size?: ModalSize;
    zIndex?: number; // Added prop
    /** Optional content to show at the start of the header (left side in RTL, next to title) */
    headerEnd?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ title, onClose, children, size = 'lg', zIndex = 50, headerEnd }) => {
    
    const sizeClasses: Record<ModalSize, string> = {
        'lg': 'max-w-lg',
        'xl': 'max-w-xl',
        '2xl': 'max-w-2xl',
        '3xl': 'max-w-3xl',
        '4xl': 'max-w-4xl',
        '5xl': 'max-w-5xl',
    };

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4" 
            style={{ zIndex }} 
            onClick={onClose}
        >
            <div 
                className={`bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} max-h-[90vh] flex flex-col`} 
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center gap-4 p-4 border-b border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-900 flex-shrink-0 order-first">{title}</h3>
                    <div className="flex items-center gap-3 flex-shrink-0 min-w-0">
                        {headerEnd}
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="p-6 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
