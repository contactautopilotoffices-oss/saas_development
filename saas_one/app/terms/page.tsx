'use client';

import Link from 'next/link';

export default function TermsOfService() {
    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <div className="max-w-3xl mx-auto px-6 py-16">
                <Link href="/" className="text-xs text-white/40 hover:text-white/60 uppercase tracking-widest font-bold mb-8 inline-block">
                    ← Back to Home
                </Link>

                <h1 className="text-4xl font-bold mb-2 font-outfit">Terms of Service</h1>
                <p className="text-white/40 text-sm mb-10">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

                <div className="space-y-8 text-white/70 text-sm leading-relaxed">
                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">1. Acceptance of Terms</h2>
                        <p>
                            By accessing and using Autopilot, you agree to be bound by these Terms of Service. 
                            If you do not agree to these terms, please do not use the platform.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">2. Use of Service</h2>
                        <p>
                            Autopilot is a facility management platform designed for property administrators, 
                            maintenance staff, and organizational teams. You agree to use the platform only for 
                            its intended purposes and in compliance with all applicable laws.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">3. User Accounts</h2>
                        <p>
                            You are responsible for maintaining the confidentiality of your account credentials. 
                            You agree to notify your organization administrator immediately of any unauthorized 
                            use of your account.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">4. Data Ownership</h2>
                        <p>
                            All data you input into Autopilot remains the property of your organization. 
                            We do not claim ownership over any facility data, readings, or operational records 
                            stored on the platform.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">5. Service Availability</h2>
                        <p>
                            We strive to maintain high availability of the Autopilot platform. However, we do 
                            not guarantee uninterrupted service and are not liable for any downtime or data loss 
                            resulting from service interruptions.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">6. Contact</h2>
                        <p>
                            For questions regarding these Terms of Service, please contact us at{' '}
                            <a href="mailto:contact.autopilotoffices@gmail.com" className="text-blue-400 hover:text-blue-300 underline">
                                contact.autopilotoffices@gmail.com
                            </a>
                        </p>
                    </section>
                </div>

                <div className="mt-16 pt-8 border-t border-white/10 text-center text-white/30 text-xs">
                    © {new Date().getFullYear()} Autopilot. All rights reserved.
                </div>
            </div>
        </div>
    );
}
