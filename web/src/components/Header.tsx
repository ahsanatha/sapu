import React from "react";
import { NavLink } from "react-router-dom";

export default function Header() {
  return (
    <header
      className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm"
      role="banner"
    >
      <div className="max-w-6xl mx-auto px-6">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-white text-black px-3 py-2 rounded-md"
        >
          Skip to content
        </a>
        <div className="flex items-center justify-between py-4">
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-extrabold bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">
              Sapu
            </h1>
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-widest">
              Alpha
            </span>
          </div>
          <nav
            className="flex gap-4 items-center"
            role="navigation"
            aria-label="Navigasi utama"
          >
            <NavLink
              to="/articles"
              className={({ isActive }: { isActive: boolean }) =>
                `px-3 py-2 rounded-md text-sm ${isActive ? "text-blue-600 bg-blue-50" : "text-slate-700 hover:text-blue-700 hover:bg-blue-50"}`
              }
            >
              Articles
            </NavLink>
            <NavLink
              to="/stories"
              className={({ isActive }: { isActive: boolean }) =>
                `px-3 py-2 rounded-md text-sm ${isActive ? "text-blue-600 bg-blue-50" : "text-slate-700 hover:text-blue-700 hover:bg-blue-50"}`
              }
            >
              Stories
            </NavLink>
          </nav>
        </div>
      </div>
    </header>
  );
}
