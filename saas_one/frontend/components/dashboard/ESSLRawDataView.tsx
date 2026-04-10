/**
 * ESSLRawDataView
 * ESSL biometric device raw attendance data viewer.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Database, RefreshCcw, Search, Table, AlertCircle } from 'lucide-react';

export default function ESSLRawDataView() {
    const [data, setData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [endpoint, setEndpoint] = useState('attendance_logs');
    const [prefix, setPrefix] = useState('iclock/api/');
    const [isDiscoveryMode, setIsDiscoveryMode] = useState(false);

    const commonPrefixes = [
        { id: 'iclock/api/', label: 'Self-Hosted (/iclock/api/)' },
        { id: 'api/v1/', label: 'Standard Cloud (/api/v1/)' },
        { id: 'iclock/api/v1/', label: 'Cloud Desktop (/iclock/api/v1/)' },
        { id: 'api/', label: 'Simple API (/api/)' },
        { id: '', label: 'Root (No Prefix)' },
    ];

    const commonEndpoints = [
        { id: 'attendance_logs', label: 'Attendance Logs' },
        { id: 'attendance', label: 'Attendance (Alternate)' },
        { id: 'logs', label: 'Logs' },
        { id: 'employees', label: 'Employees' },
        { id: 'devices', label: 'Devices' },
        { id: 'departments', label: 'Departments' },
        { id: 'device_logs', label: 'Device Logs' },
    ];

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const finalPath = `${prefix}${endpoint.replace(/^\//, '')}`;
            const response = await fetch(`/api/attendance/essl/raw?path=${encodeURIComponent(finalPath)}`);
            const result = await response.json();

            if (!response.ok) {
                setError({
                    message: result.error || 'Failed to fetch eSSL data',
                    details: result.details,
                    path: result.path
                });
                setData([]);
                return;
            }

            // Standardizing data format if it's an object with a list
            const rawData = Array.isArray(result) ? result : (result.data || result.logs || result.results || []);
            setData(rawData);
        } catch (err: any) {
            setError({ message: err.message });
            setData([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [endpoint, prefix]);

    const filteredData = data.filter(item => 
        JSON.stringify(item).toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Dynamic headers based on data keys
    const headers = data.length > 0 ? Object.keys(data[0]) : [];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                        <Database className="w-6 h-6 text-blue-500" />
                        eSSL Table Discovery
                    </h2>
                    <p className="text-zinc-500 font-medium mt-1">
                        Try different prefixes and endpoints to find your data.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setIsDiscoveryMode(!isDiscoveryMode)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${isDiscoveryMode ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                    >
                        <Search className="w-4 h-4" />
                        Discovery Mode
                    </button>
                    <button 
                        onClick={fetchData}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50"
                    >
                        <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800/50 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">API Prefix</label>
                        <select 
                            value={prefix}
                            onChange={(e) => setPrefix(e.target.value)}
                            className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        >
                            {commonPrefixes.map(opt => (
                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Select Table</label>
                        <select 
                            value={endpoint}
                            onChange={(e) => setEndpoint(e.target.value)}
                            className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        >
                            {commonEndpoints.map(opt => (
                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                            <option value="custom">-- Custom Path --</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Search</label>
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <input
                                type="text"
                                placeholder="Filter results..."
                                className="w-full pl-12 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm font-medium text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {isDiscoveryMode && (
                    <div className="pt-4 border-t border-zinc-800/50 space-y-2">
                        <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Manual Path Discovery</label>
                        <div className="flex gap-2">
                            <div className="flex-1 flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5">
                                <span className="text-zinc-600 mr-2 font-mono text-xs">/</span>
                                <input
                                    type="text"
                                    value={prefix + endpoint}
                                    onChange={(e) => {
                                        const full = e.target.value;
                                        setPrefix('');
                                        setEndpoint(full);
                                    }}
                                    className="flex-1 bg-transparent border-none focus:outline-none text-sm font-mono text-blue-400"
                                    placeholder="Enter full relative path..."
                                />
                            </div>
                            <button 
                                onClick={fetchData}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl active:scale-95 transition-all"
                            >
                                Try Path
                            </button>
                        </div>
                        <p className="text-[10px] text-zinc-500 italic">Example: iclock/api/attendance or attendance_logs</p>
                    </div>
                )}
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3 text-red-400">
                    <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-bold">Error Accessing eSSL Server</p>
                        <p className="text-sm opacity-80">{error.message || 'Unknown error'}</p>
                        {error.path && (
                            <p className="text-[10px] mt-1 font-mono text-zinc-500">
                                Path: {error.path}
                            </p>
                        )}
                        {error.details && (
                            <pre className="text-[10px] mt-2 p-2 bg-black/20 rounded-lg overflow-auto max-h-32 text-zinc-500">
                                {JSON.stringify(error.details, null, 2)}
                            </pre>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-[24px] overflow-hidden backdrop-blur-sm overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-zinc-800/50 bg-zinc-900/50">
                            {headers.map(header => (
                                <th key={header} className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest whitespace-nowrap">
                                    {header.replace(/_/g, ' ')}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/30">
                        {isLoading ? (
                            <tr>
                                <td colSpan={headers.length || 1} className="px-8 py-20 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <RefreshCcw className="w-8 h-8 text-blue-500 animate-spin" />
                                        <p className="text-zinc-500 font-medium italic text-sm">Fetching data from eSSL server...</p>
                                    </div>
                                </td>
                            </tr>
                        ) : filteredData.length === 0 ? (
                            <tr>
                                <td colSpan={headers.length || 1} className="px-8 py-20 text-center">
                                    <div className="flex flex-col items-center gap-3 text-zinc-500">
                                        <Table className="w-8 h-8 opacity-20" />
                                        <p className="font-medium italic text-sm">No data found or search returned no results.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredData.map((item, idx) => (
                                <tr key={idx} className="group hover:bg-white/[0.02] transition-colors">
                                    {headers.map(header => (
                                        <td key={header} className="px-6 py-4 text-sm font-medium text-zinc-300">
                                            {typeof item[header] === 'object' 
                                                ? JSON.stringify(item[header]) 
                                                : String(item[header] ?? '-')}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
