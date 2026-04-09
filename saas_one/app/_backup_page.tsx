import React from 'react';

export default function Home() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden selection:bg-primary/20">
      {/* Editorial Navigation */}
      <nav className="fixed top-0 left-0 w-full z-[100] px-8 lg:px-16 py-8 flex justify-between items-center mix-blend-difference invert">
        <div className="flex items-center gap-12">
          {/* Minimalist Logo */}
          <div className="text-2xl font-display font-medium tracking-tighter">
            AUTU
          </div>
          <div className="hidden lg:flex gap-8 text-[11px] uppercase tracking-[0.2em] font-medium opacity-80">
            <a href="#gallery" className="hover:opacity-100 transition-opacity">Gallery</a>
            <a href="#about" className="hover:opacity-100 transition-opacity">About Us</a>
            <a href="#apartments" className="hover:opacity-100 transition-opacity">Solutions</a>
            <a href="#contact" className="hover:opacity-100 transition-opacity">Contact Us</a>
            <a href="#location" className="hover:opacity-100 transition-opacity">Location</a>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="hidden md:flex gap-2 text-[11px] font-bold tracking-widest uppercase">
            <span>EN</span>
            <span className="opacity-30">|</span>
            <span className="opacity-50">IN</span>
          </div>
          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/20">
            <span className="text-[11px] font-bold tracking-widest">+91 98765 43210</span>
            <div className="bg-white rounded-full p-1 shadow-sm">
              <span className="material-symbols-outlined text-[14px] text-black">call</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Hero Container */}
      <main className="relative h-screen min-h-[700px] w-full bg-[#e0e9f0]">

        {/* Background Gradients to match sky */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#cbd5e1] via-[#e2e8f0] to-[#f8fafc]"></div>

        {/* The Building - Full Width, Magazine Style */}
        <div className="absolute inset-x-0 bottom-0 top-[15%] pointer-events-none">
          <div
            className="w-full h-full bg-no-repeat bg-center bg-cover transition-transform duration-1000 ease-out building-mask"
            style={{
              backgroundImage: "url('/hero-building.jpg')",
              backgroundPosition: 'center 30%'
            }}
          />
          {/* Bottom highlight overlay */}
          <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-background to-transparent opacity-90"></div>
        </div>

        {/* Large Typography Overlays */}
        <div className="relative h-full flex flex-col justify-center px-8 lg:px-16 pointer-events-none">

          {/* "AUTO" Header - Top Left Overlap */}
          <div className="absolute top-[20%] left-8 lg:left-16 animate-fade-in">
            <h1 className="hero-title-large mix-blend-overlay opacity-90">AUTO</h1>
          </div>

          {/* Center Content / Splitter */}
          <div className="relative z-10 flex flex-col items-center justify-center text-center">
            <p className="text-[10px] lg:text-[12px] uppercase tracking-[0.5em] text-slate-500 font-medium mb-4 animate-slide-up">
              Your Facility Management Awaits
            </p>
          </div>

          {/* "PILOT" Header - Bottom Right Overlap */}
          <div className="absolute bottom-[20%] right-8 lg:right-16 animate-fade-in delay-200">
            <h1 className="hero-title-large mix-blend-soft-light opacity-80">PILOT</h1>
          </div>
        </div>

        {/* Hero Supporting Text Content */}
        <div className="absolute bottom-16 left-8 lg:left-16 z-20 max-w-lg lg:max-w-2xl animate-slide-up delay-400">
          <div className="flex flex-col gap-6">
            <div className="text-slate-400 text-[10px] uppercase tracking-[0.2em] font-bold">FMS-2026</div>
            <h2 className="text-3xl lg:text-5xl font-display font-light text-slate-800 leading-[1.1] tracking-tight">
              Where <span className="font-semibold text-primary">Autonomy</span> Meets <br />
              Modern Operations.
            </h2>

            {/* Action Buttons - Teal & Glass */}
            <div className="flex gap-4 pt-4 pointer-events-auto">
              <button className="btn-teal px-10 py-4 rounded-full text-[12px] uppercase tracking-[0.2em] font-bold">
                See How It Works
              </button>
              <button className="glass-crisp px-10 py-4 rounded-full text-[12px] uppercase tracking-[0.2em] font-bold text-slate-700 hover:bg-white/40 transition-colors flex items-center gap-3">
                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                Watch Demo
              </button>
            </div>
          </div>
        </div>

        {/* Right Side "Status" Badge / Vertical Info */}
        <div className="absolute top-[35%] right-8 lg:right-16 z-20 flex flex-col items-end gap-6 animate-fade-in delay-400">
          <div className="w-[1px] h-12 bg-slate-400/30"></div>
          <div className="flex flex-col items-end">
            <div className="text-slate-700 text-[10px] font-bold uppercase tracking-[0.2em] mb-2">We Automate</div>
            <p className="text-right text-slate-500 text-[11px] uppercase tracking-[0.15em] leading-relaxed">
              Modern Buildings<br />
              On Global Scale
            </p>
          </div>
          <div className="size-10 flex items-center justify-center text-slate-400">
            <span className="material-symbols-outlined text-[20px]">verified</span>
          </div>
        </div>
      </main>

      {/* Social / Social Proof Section - Clean White */}
      <section className="bg-white py-24 relative z-10">
        <div className="max-w-[1400px] mx-auto px-8 lg:px-16">
          <div className="flex flex-col lg:flex-row justify-between items-end gap-12">
            <div className="max-w-xl">
              <h3 className="text-[11px] uppercase tracking-[0.3em] font-bold text-primary mb-6">Efficiency Defined</h3>
              <p className="text-2xl lg:text-3xl font-display font-light text-slate-800 leading-normal">
                Fewer complaints. Faster fixes. Clear accountability. The operating system for modern buildings that puts maintenance on autopilot.
              </p>
            </div>

            {/* Stats Mini Grid */}
            <div className="grid grid-cols-2 gap-12 lg:gap-24">
              <div>
                <div className="text-4xl lg:text-5xl font-display font-medium text-slate-900 mb-2">73%</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">Follow-up Reduction</div>
              </div>
              <div>
                <div className="text-4xl lg:text-5xl font-display font-medium text-slate-900 mb-2">2.4x</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">Fix Speedup</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logo Cloud - Minimalist Grayscale */}
      <section className="bg-[#f8fafc] py-20 border-y border-slate-100">
        <div className="max-w-[1400px] mx-auto px-8 lg:px-16 flex flex-wrap justify-between items-center opacity-40 grayscale gap-12">
          <div className="text-xl font-bold tracking-tight text-slate-800">Cushman&Wakefield</div>
          <div className="text-xl font-bold tracking-tight text-slate-800">JLL</div>
          <div className="text-xl font-bold tracking-tight text-slate-800 italic font-serif">CBRE</div>
          <div className="text-xl font-bold tracking-tight text-slate-800 tracking-tighter uppercase">Brookfield</div>
          <div className="text-xl font-bold tracking-tight text-slate-800">Prologis</div>
        </div>
      </section>

      {/* Footer / Minimal */}
      <footer className="bg-white py-16">
        <div className="max-w-[1400px] mx-auto px-8 lg:px-16 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-[10px] uppercase tracking-[0.4em] font-bold text-slate-400">© 2026 Autopilot FMS</div>
          <div className="flex gap-12 text-[10px] uppercase tracking-[0.2em] font-bold text-slate-600">
            <a href="#" className="hover:text-primary transition-colors">Privacy</a>
            <a href="#" className="hover:text-primary transition-colors">Terms</a>
            <a href="#" className="hover:text-primary transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
