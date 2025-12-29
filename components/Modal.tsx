
import React from 'react';

type ModalSize = 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

interface ModalProps {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    size?: ModalSize;
    zIndex?: number; // Added prop
}

const Modal: React.FC<ModalProps> = ({ title, onClose, children, size = 'lg', zIndex = 50 }) => {
    
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
                <div className="flex justify-between items-center p-4 border-b border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="p-6 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
