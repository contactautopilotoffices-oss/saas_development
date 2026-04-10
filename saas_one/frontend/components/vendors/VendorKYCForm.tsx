/**
 * VendorKYCForm
 * Document upload and verification form for vendor Know Your Customer (KYC).
 * Supports GST, PAN, MSME certificates, and cancelled cheque images.
 * @remarks Client component.
 */

'use client';

import React, { useState } from 'react';
import { Upload, CheckCircle2, Loader2, FileText, X } from 'lucide-react';

interface Props {
    vendorId: string;
    vendor: {
        gst_number?: string;
        pan_number?: string;
        msme_number?: string;
        gst_doc_url?: string;
        pan_doc_url?: string;
        msme_doc_url?: string;
        cancelled_cheque_url?: string;
        bank_name?: string;
        bank_account_number?: string;
        bank_ifsc?: string;
        kyc_status?: string;
        kyc_rejection_reason?: string;
    };
    onSaved: (updatedVendor: any) => void;
}

type DocType = 'gst' | 'pan' | 'msme' | 'cancelled_cheque';

interface DocField {
    key: DocType;
    label: string;
    numberField?: string;
    placeholder?: string;
    urlField: string;
}

const DOC_FIELDS: DocField[] = [
    { key: 'gst', label: 'GST Certificate', numberField: 'gst_number', placeholder: '22AAAAA0000A1Z5', urlField: 'gst_doc_url' },
    { key: 'pan', label: 'PAN Card', numberField: 'pan_number', placeholder: 'ABCDE1234F', urlField: 'pan_doc_url' },
    { key: 'msme', label: 'MSME Certificate', numberField: 'msme_number', placeholder: 'UDYAM-XX-00-0000000', urlField: 'msme_doc_url' },
    { key: 'cancelled_cheque', label: 'Cancelled Cheque', urlField: 'cancelled_cheque_url' },
];

export default function VendorKYCForm({ vendorId, vendor, onSaved }: Props) {
    const [uploading, setUploading] = useState<DocType | null>(null);
    const [docNumbers, setDocNumbers] = useState({
        gst_number: vendor.gst_number || '',
        pan_number: vendor.pan_number || '',
        msme_number: vendor.msme_number || '',
    });
    const [bankDetails, setBankDetails] = useState({
        bank_name: vendor.bank_name || '',
        bank_account_number: vendor.bank_account_number || '',
        bank_ifsc: vendor.bank_ifsc || '',
    });
    const [savingBank, setSavingBank] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const vendorData = vendor as any;

    async function handleFileUpload(docType: DocType, file: File, docNumber?: string) {
        setUploading(docType);
        setError('');
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('doc_type', docType);
            if (docNumber) fd.append('doc_number', docNumber);

            const res = await fetch(`/api/vendors/maintenance/${vendorId}/kyc`, {
                method: 'POST',
                body: fd,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            onSaved(data.vendor);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setUploading(null);
        }
    }

    async function handleBankSave() {
        setSavingBank(true);
        setError('');
        try {
            const res = await fetch(`/api/vendors/maintenance/${vendorId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bankDetails),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Save failed');
            onSaved(data.vendor);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSavingBank(false);
        }
    }

    async function handleSubmitKYC() {
        setSubmitting(true);
        setError('');
        try {
            const res = await fetch(`/api/vendors/maintenance/${vendorId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kyc_status: 'submitted' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Submission failed');
            onSaved(data.vendor);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    }

    const kycStatus = vendor.kyc_status || 'pending';
    const isSubmitted = kycStatus === 'submitted' || kycStatus === 'verified';

    return (
        <div className="space-y-6">
            {/* Status banner */}
            {kycStatus === 'verified' && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4" /> KYC Verified
                </div>
            )}
            {kycStatus === 'submitted' && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-3 text-sm font-medium">
                    <Loader2 className="w-4 h-4 animate-spin" /> KYC Under Review
                </div>
            )}
            {kycStatus === 'rejected' && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                    <div className="font-semibold mb-1">KYC Rejected</div>
                    <div>{vendor.kyc_rejection_reason || 'Please re-upload your documents.'}</div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>
            )}

            {/* Document uploads */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">KYC Documents</h3>
                <div className="space-y-3">
                    {DOC_FIELDS.map(({ key, label, numberField, placeholder, urlField }) => {
                        const uploaded = !!vendorData[urlField];
                        return (
                            <div key={key} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-gray-700">{label}</span>
                                    {uploaded && (
                                        <a href={vendorData[urlField]} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                            <FileText className="w-3 h-3" /> View
                                        </a>
                                    )}
                                </div>

                                {numberField && (
                                    <input
                                        type="text"
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 bg-white disabled:bg-gray-100"
                                        placeholder={placeholder}
                                        value={(docNumbers as any)[numberField]}
                                        disabled={isSubmitted}
                                        onChange={e => setDocNumbers(prev => ({ ...prev, [numberField]: e.target.value }))}
                                    />
                                )}

                                {!isSubmitted && (
                                    <label className={`inline-flex items-center gap-2 cursor-pointer text-xs font-medium px-3 py-2 rounded-lg transition-colors ${uploaded ? 'bg-green-100 text-green-700' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'}`}>
                                        {uploading === key ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : uploaded ? (
                                            <CheckCircle2 className="w-3 h-3" />
                                        ) : (
                                            <Upload className="w-3 h-3" />
                                        )}
                                        {uploaded ? 'Uploaded — Click to Replace' : 'Upload Document'}
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            disabled={!!uploading}
                                            onChange={e => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                const num = numberField ? (docNumbers as any)[numberField] : undefined;
                                                handleFileUpload(key, file, num || undefined);
                                            }}
                                        />
                                    </label>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Bank Details */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Bank Details</h3>
                <div className="space-y-2">
                    <input
                        type="text"
                        placeholder="Bank Name"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
                        value={bankDetails.bank_name}
                        disabled={isSubmitted}
                        onChange={e => setBankDetails(p => ({ ...p, bank_name: e.target.value }))}
                    />
                    <input
                        type="text"
                        placeholder="Account Number"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
                        value={bankDetails.bank_account_number}
                        disabled={isSubmitted}
                        onChange={e => setBankDetails(p => ({ ...p, bank_account_number: e.target.value }))}
                    />
                    <input
                        type="text"
                        placeholder="IFSC Code"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
                        value={bankDetails.bank_ifsc}
                        disabled={isSubmitted}
                        onChange={e => setBankDetails(p => ({ ...p, bank_ifsc: e.target.value }))}
                    />
                    {!isSubmitted && (
                        <button
                            onClick={handleBankSave}
                            disabled={savingBank}
                            className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
                        >
                            {savingBank ? 'Saving...' : 'Save Bank Details'}
                        </button>
                    )}
                </div>
            </div>

            {/* Submit KYC */}
            {!isSubmitted && (
                <button
                    onClick={handleSubmitKYC}
                    disabled={submitting}
                    className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Submit KYC for Verification
                </button>
            )}
        </div>
    );
}
