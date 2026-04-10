'use client';

import Link from 'next/link';

export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <div className="max-w-3xl mx-auto px-6 py-16">
                <Link href="/" className="text-xs text-white/40 hover:text-white/60 uppercase tracking-widest font-bold mb-8 inline-block">
                    ← Back to Home
                </Link>

                <h1 className="text-4xl font-bold mb-2 font-outfit">Privacy Policy</h1>
                <p className="text-white/40 text-sm mb-10">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

                <div className="space-y-8 text-white/70 text-sm leading-relaxed">
                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">1. Information We Collect</h2>
                        <p>
                            When you use Autopilot, we collect information you provide directly to us, such as your name, 
                            email address, phone number, and organizational details. We also collect data related to your 
                            facility management operations, including property information, maintenance records, electricity 
                            meter readings, and communication logs.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">2. How We Use Your Information</h2>
                        <p>We use the information we collect to:</p>
                        <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
                            <li>Provide, maintain, and improve the Autopilot platform</li>
                            <li>Process and manage facility operations, tickets, and maintenance workflows</li>
                            <li>Send notifications via WhatsApp, email, or in-app messaging</li>
                            <li>Generate reports and analytics for property management</li>
                            <li>Ensure security and prevent unauthorized access</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">3. Data Storage & Security</h2>
                        <p>
                            Your data is securely stored using industry-standard encryption and hosted on trusted cloud 
                            infrastructure providers. We implement appropriate technical and organizational measures to 
                            protect your personal data against unauthorized access, alteration, disclosure, or destruction.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">4. Google Authentication</h2>
                        <p>
                            Autopilot uses Google OAuth for authentication. When you sign in with Google, we receive your 
                            name, email address, and profile picture. We do not access your Gmail, Google Drive, or any 
                            other Google services beyond basic authentication.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">5. Data Sharing</h2>
                        <p>
                            We do not sell, trade, or rent your personal information to third parties. We may share data 
                            only with your organization&apos;s administrators as required for facility management operations, 
                            or when required by law.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">6. Your Rights</h2>
                        <p>
                            You have the right to access, update, or delete your personal information at any time. 
                            You may contact your organization administrator or reach out to us directly to exercise 
                            these rights.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">7. Contact Us</h2>
                        <p>
                            If you have any questions about this Privacy Policy, please contact us at{' '}
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
