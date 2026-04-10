/**
 * PropertyDashboard
 * Property-level dashboard with tabs for overview, requests, reports, and more.
 * @remarks Client component.
 */

'use client';

import React from 'react';
import { LayoutGrid, Users, Ticket, Activity, TrendingUp, Building2 } from 'lucide-react';
import TicketSLATile from './TicketSLATile';
import EmployeeHeatmapTile from './EmployeeHeatmapTile';
import { motion } from 'framer-motion';

interface PropertyDashboardProps {
    propertyId: string;
}

const PropertyDashboard: React.FC<PropertyDashboardProps> = ({ propertyId }) => {
    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-black text-foreground tracking-tight">Property Overview</h1>
                    <p className="text-muted-foreground font-medium">Managing SS Plaza • Property ID: {propertyId}</p>
                </div>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-muted border border-border rounded-xl text-muted-foreground font-semibold hover:text-foreground transition-colors">
                        Generate Signup Link
                    </button>
                    <button className="px-6 py-2 bg-brand-orange text-white font-bold rounded-xl shadow-lg shadow-orange-900/20 hover:scale-105 transition-transform">
                        New Ticket
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                    { label: 'Active Tickets', value: '0', icon: Ticket, color: 'text-orange-500' },
                    { label: 'SLA Status', value: '0%', icon: Activity, color: 'text-emerald-500' },
                    { label: 'Staff Online', value: '0', icon: Users, color: 'text-blue-500' },
                    { label: 'Occupancy', value: '0%', icon: Building2, color: 'text-purple-500' },
                ].map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-card border border-border p-6 rounded-[24px] group hover:border-brand-orange/30 transition-all shadow-sm"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-2xl bg-muted ${stat.color}`}>
                                <stat.icon className="w-6 h-6" />
                            </div>
                            <TrendingUp className="w-5 h-5 text-muted-foreground/30" />
                        </div>
                        <p className="text-muted-foreground font-bold text-sm uppercase tracking-wider">{stat.label}</p>
                        <h3 className="text-4xl font-black text-foreground mt-1">{stat.value}</h3>
                    </motion.div>
                ))}
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-card border border-border rounded-[32px] overflow-hidden min-h-[400px] shadow-sm">
                        <TicketSLATile openTickets={0} slaPercentage={0} highPriorityCount={0} />
                    </div>
                    <div className="bg-card border border-border rounded-[32px] overflow-hidden min-h-[400px] shadow-sm">
                        <EmployeeHeatmapTile occupancyPercentage={0} />
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="bg-card border border-border rounded-[32px] p-8 shadow-sm">
                        <h3 className="text-2xl font-bold text-foreground mb-6">Recent Activity</h3>
                        <div className="space-y-6">
                            {[1, 2, 3, 4, 5].map((_, i) => (
                                <div key={i} className="flex gap-4 items-start pb-6 border-b border-border last:border-0">
                                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
                                        <Activity className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-foreground font-bold">New ticket raised</p>
                                        <p className="text-muted-foreground text-sm">Elevator failure in Block B</p>
                                        <p className="text-muted-foreground/60 text-xs mt-1">2 mins ago</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PropertyDashboard;
