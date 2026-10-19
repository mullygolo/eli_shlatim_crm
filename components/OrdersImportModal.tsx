import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Papa from 'papaparse';
import Modal from './Modal';
import type { OrdersImportPreviewResult } from '../services/mongoService';
import { ordersImportPreview, ordersImportExecute } from '../services/mongoService';

interface OrdersImportModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

export const OrdersImportModal: React.FC<OrdersImportModalProps> = ({ onClose, onSuccess }) => {
    const [file, setFile] = useState<File | null>(null);
    const [rows, setRows] = useState<Record<string, string>[]>([]);
    const [preview, setPreview] = useState<OrdersImportPreviewResult | null>(null);
    const [step, setStep] = useState<'select' | 'preview' | 'done'>('select');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [executeResult, setExecuteResult] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null);
    const [skipExisting, setSkipExisting] = useState(true);

    const parseFile = useCallback((f: File): Promise<Record<string, string>[]> => {
        return new Promise((resolve, reject) => {
            Papa.parse(f, {
                header: true,
                skipEmptyLines: true,
                encoding: 'UTF-8',
                complete: (results) => {
                    if (results.errors.length > 0 && !results.data.length) {
                        reject(new Error(results.errors.map(e => e.message).join('; ')));
                        return;
                    }
                    const data = (results.data || []) as Record<string, string>[];
                    const BOM = '\uFEFF';
                    const normalized = data.map((row: Record<string, string>) => {
                        const out: Record<string, string> = {};
                        for (const [key, value] of Object.entries(row)) {
                            const k = (key || '').replace(BOM, '').trim();
                            if (k !== '') out[k] = value;
                        }
                        return out;
                    });
                    resolve(normalized);
                },
                error: (err) => reject(err)
            });
        });
    }, []);

    const handleFileChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0];
            setError(null);
            setPreview(null);
            setRows([]);
            if (!f) {
                setFile(null);
                return;
            }
            if (!f.name.toLowerCase().endsWith('.csv') && !f.name.toLowerCase().endsWith('.xlsx')) {
                setError('נא לבחור קובץ CSV');
                setFile(null);
                return;
            }
            setFile(f);
            if (f.name.toLowerCase().endsWith('.csv')) {
                setLoading(true);
                parseFile(f)
                    .then((parsed) => {
                        setRows(parsed);
                        setLoading(false);
                    })
                    .catch((err) => {
                        setError(err?.message || 'שגיאה בקריאת הקובץ');
                        setLoading(false);
                    });
            } else {
                setError('נתמך כרגע רק CSV. ייצא את הטבלה כ-CSVpload שוב.');
                setFile(null);
            }
        },
        [parseFile]
    );

    const loadPreview = useCallback(() => {
        if (rows.length === 0) {
            setError('אין שורות לייבוא');
            return;
        }
        setLoading(true);
        setError(null);
        ordersImportPreview(rows)
            .then((result) => {
                setPreview(result);
                setStep('preview');
                setLoading(false);
            })
            .catch((err) => {
                setError(err?.message || 'שגיאה בטעינת תצוגה מקדימה');
                setLoading(false);
            });
    }, [rows]);

    const runImport = useCallback(() => {
        setLoading(true);
        setError(null);
        ordersImportExecute(rows, { skipExistingOrderNumbers: skipExisting })
            .then((result) => {
                setExecuteResult(result);
                setStep('done');
                setLoading(false);
                onSuccess();
            })
            .catch((err) => {
                setError(err?.message || 'שגיאה בייבוא');
                setLoading(false);
            });
    }, [rows, skipExisting, onSuccess]);

    const missingCount = preview?.missingCustomerNames?.length ?? 0;
    const existingCount = preview?.orders.filter((o) => o.existingOrderNumber).length ?? 0;

    const modalContent = (
        <Modal title="ייבוא מטבלת שליטה (CSV)" onClose={onClose} size="2xl" zIndex={60}>
            <div className="flex flex-col gap-4">
                {step === 'select' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">קובץ CSV</label>
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileChange}
                                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
                            />
                        </div>
                        {file && (
                            <p className="text-sm text-slate-600">
                                נבחר: {file.name} ({rows.length} שורות)
                            </p>
                        )}
                        {rows.length > 0 && (
                            <button
                                type="button"
                                onClick={loadPreview}
                                disabled={loading}
                                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
                            >
                                {loading ? 'טוען...' : 'תצוגה מקדימה'}
                            </button>
                        )}
                    </>
                )}

                {step === 'preview' && preview && (
                    <>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="bg-slate-50 p-3 rounded">
                                <strong>הזמנות מתוכננות:</strong> {preview.orders.length}
                            </div>
                            <div className="bg-slate-50 p-3 rounded">
                                <strong>סטטוסים חדשים:</strong> {preview.newStatusLabels.length}
                                {preview.newStatusLabels.length > 0 && (
                                    <span className="text-slate-600"> ({preview.newStatusLabels.slice(0, 3).join(', ')}{preview.newStatusLabels.length > 3 ? '...' : ''})</span>
                                )}
                            </div>
                            <div className="bg-slate-50 p-3 rounded">
                                <strong>ספקים חדשים:</strong> {preview.newSupplierNames.length}
                                {preview.newSupplierNames.length > 0 && (
                                    <span className="text-slate-600"> ({preview.newSupplierNames.slice(0, 3).join(', ')}{preview.newSupplierNames.length > 3 ? '...' : ''})</span>
                                )}
                            </div>
                            <div className="bg-slate-50 p-3 rounded">
                                <strong>אנשי קשר שייווספו:</strong> {preview.contactsToAdd.length}
                            </div>
                        </div>
                        {missingCount > 0 && (
                            <div className="bg-amber-50 border border-amber-200 p-3 rounded text-amber-800 text-sm">
                                <strong>לקוחות שלא נמצאו ({missingCount}):</strong> ההזמנות ייווצרו עם לקוח זמני (לא יועלו לחשבונית ירוקה). עדכן ידנית את הלקוח מהכרטיס הזמנה – ואז סנן בעמוד הזמנות לפי "הזמנות עם לקוח מייבוא (לא תואם)" כדי לגשת אליהן.
                                <div className="max-h-60 overflow-y-auto mt-1">
                                    <ul className="list-disc list-inside">
                                        {preview.missingCustomerNames.map((n) => (
                                            <li key={n}>{n}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}
                        {existingCount > 0 && (
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={skipExisting}
                                    onChange={(e) => setSkipExisting(e.target.checked)}
                                />
                                דלג על הזמנות עם מספר הזמנה קיים ({existingCount})
                            </label>
                        )}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={runImport}
                                disabled={loading}
                                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                            >
                                {loading ? 'מריץ ייבוא...' : 'הרץ ייבוא'}
                            </button>
                            <button type="button" onClick={() => setStep('select')} className="px-4 py-2 border border-slate-300 rounded-md hover:bg-slate-50">
                                חזרה
                            </button>
                        </div>
                    </>
                )}

                {step === 'done' && executeResult && (
                    <>
                        <div className="bg-green-50 border border-green-200 p-3 rounded text-green-800 text-sm">
                            <p><strong>נוצרו:</strong> {executeResult.created} הזמנות</p>
                            <p><strong>עודכנו (סטטוס):</strong> {executeResult.updated ?? 0} הזמנות</p>
                            <p><strong>דולגו:</strong> {executeResult.skipped}</p>
                            {executeResult.errors.length > 0 && (
                                <>
                                    <p className="text-amber-700 mt-2"><strong>שגיאות:</strong></p>
                                    <ul className="list-disc list-inside">
                                        {executeResult.errors.slice(0, 5).map((e, i) => (
                                            <li key={i}>{e}</li>
                                        ))}
                                        {executeResult.errors.length > 5 && (
                                            <li>... ועוד {executeResult.errors.length - 5}</li>
                                        )}
                                    </ul>
                                </>
                            )}
                        </div>
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90">
                            סגור
                        </button>
                    </>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 p-3 rounded text-red-800 text-sm">
                        {error}
                    </div>
                )}
            </div>
        </Modal>
    );

    return typeof document !== 'undefined' && document.body
        ? createPortal(modalContent, document.body)
        : modalContent;
};

export default OrdersImportModal;
