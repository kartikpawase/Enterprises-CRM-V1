import React from 'react';
import { UsersRound, ShoppingCart, FileText, Wrench } from 'lucide-react';
import { CRM_OFFICIAL_LOGO_B64 } from '../../assets/invoiceAssets';

export const LoginBrandPanel: React.FC = () => {
  return (
    <div className="relative w-full lg:w-[54%] bg-slate-950 text-white flex flex-col justify-between p-4 sm:p-7 lg:p-8 overflow-hidden select-none">
      {/* High-Fidelity Modern Enterprise Mesh Visual Scene */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary-600/20 blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-96 h-96 rounded-full bg-indigo-600/15 blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 w-96 h-96 rounded-full bg-sky-500/15 blur-3xl" />
        {/* Subtle Geometric Enterprise Grid */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)`,
            backgroundSize: '24px 24px'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-slate-900/60" />
      </div>

      {/* Top Left Branding Header */}
      <div className="relative z-10 flex items-center gap-3">
        {/* Hydro Brand Badge */}
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/10 backdrop-blur-xs border border-white/20 shadow-md flex items-center justify-center shrink-0 p-1">
          <img
            src={CRM_OFFICIAL_LOGO_B64}
            alt="Enterprises CRM Logo"
            className="w-full h-full object-contain select-none drop-shadow"
          />
        </div>

        {/* Brand Text Hierarchy */}
        <div>
          <span className="block text-xs sm:text-sm lg:text-base font-display font-extrabold tracking-wider text-white uppercase leading-tight">
            ENTERPRISES
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="w-4 sm:w-5 h-px bg-sky-400/60" />
            <span className="text-[9px] sm:text-[10px] font-bold text-sky-400 tracking-widest uppercase font-mono">CRM</span>
            <div className="w-4 sm:w-5 h-px bg-sky-400/60" />
          </div>
        </div>
      </div>

      {/* Center Left Marketing Message */}
      <div className="relative z-10 max-w-sm my-auto py-3 sm:py-6">
        <span className="block text-xs sm:text-sm font-semibold text-sky-300">Welcome to</span>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-display font-extrabold text-white tracking-tight mt-1 leading-tight drop-shadow-sm">
          Enterprises CRM
        </h1>
        <p className="text-xs sm:text-sm text-slate-200 font-normal mt-2.5 leading-relaxed drop-shadow-xs">
          A smart CRM to manage your business customers, sales, invoices, services, payments and
          more — all in one place.
        </p>
      </div>

      {/* Bottom Feature Bar (4 Horizontally Arranged Items with Vertical Separators) */}
      <div className="relative z-10 pt-3 border-t border-white/15 grid grid-cols-2 sm:grid-cols-4 gap-3 items-start backdrop-blur-xs">
        {/* Feature 1: Manage Customers */}
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
          <div className="mb-1 p-1 rounded-lg bg-white/10 border border-white/15 text-white w-fit shadow-2xs">
            <UsersRound className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-300" />
          </div>
          <h2 className="text-[11px] sm:text-xs font-bold text-white leading-tight">Manage Customers</h2>
          <p className="text-[9px] sm:text-[10px] text-slate-300 mt-0.5 leading-snug">
            All customer information in one place
          </p>
        </div>

        {/* Feature 2: Track Sales */}
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left sm:border-l sm:border-white/15 sm:pl-2.5">
          <div className="mb-1 p-1 rounded-lg bg-white/10 border border-white/15 text-white w-fit shadow-2xs">
            <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-300" />
          </div>
          <h2 className="text-[11px] sm:text-xs font-bold text-white leading-tight">Track Sales</h2>
          <p className="text-[9px] sm:text-[10px] text-slate-300 mt-0.5 leading-snug">
            Create &amp; manage sales easily
          </p>
        </div>

        {/* Feature 3: Invoices */}
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left sm:border-l sm:border-white/15 sm:pl-2.5">
          <div className="mb-1 p-1 rounded-lg bg-white/10 border border-white/15 text-white w-fit shadow-2xs">
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-300" />
          </div>
          <h2 className="text-[11px] sm:text-xs font-bold text-white leading-tight">Invoices</h2>
          <p className="text-[9px] sm:text-[10px] text-slate-300 mt-0.5 leading-snug">
            Professional invoices in seconds
          </p>
        </div>

        {/* Feature 4: Services */}
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left sm:border-l sm:border-white/15 sm:pl-2.5">
          <div className="mb-1 p-1 rounded-lg bg-white/10 border border-white/15 text-white w-fit shadow-2xs">
            <Wrench className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-300" />
          </div>
          <h2 className="text-[11px] sm:text-xs font-bold text-white leading-tight">Services</h2>
          <p className="text-[9px] sm:text-[10px] text-slate-300 mt-0.5 leading-snug">
            Track services &amp; history
          </p>
        </div>
      </div>
    </div>
  );
};
