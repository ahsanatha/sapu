import React from "react";
import { NavLink } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="mt-auto bg-slate-50 border-t border-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="text-blue-600 font-semibold mb-3">Sapu</h3>
            <p className="text-slate-700">
              AI-powered news aggregation dengan deteksi bias dan perspektif
              yang seimbang.
            </p>
          </div>
          <div>
            <h4 className="text-slate-900 font-medium mb-3">Tautan Cepat</h4>
            <div className="flex flex-col gap-2">
              <NavLink
                to="/articles"
                className="text-slate-700 hover:text-blue-700"
              >
                Articles
              </NavLink>
              <NavLink
                to="/stories"
                className="text-slate-700 hover:text-blue-700"
              >
                Stories
              </NavLink>
            </div>
          </div>
          <div>
            <h4 className="text-slate-900 font-medium mb-3">Connect</h4>
            <div className="flex gap-3">
              <a
                href="https://twitter.com"
                className="w-10 h-10 flex items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:text-blue-700 hover:border-blue-600"
                aria-label="Twitter"
                target="_blank"
                rel="noopener noreferrer"
              >
                🐦
              </a>
              <a
                href="https://linkedin.com"
                className="w-10 h-10 flex items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:text-blue-700 hover:border-blue-600"
                aria-label="LinkedIn"
                target="_blank"
                rel="noopener noreferrer"
              >
                💼
              </a>
              <a
                href="https://github.com"
                className="w-10 h-10 flex items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:text-blue-700 hover:border-blue-600"
                aria-label="GitHub"
                target="_blank"
                rel="noopener noreferrer"
              >
                🐙
              </a>
            </div>
          </div>
        </div>
        <div className="text-center text-sm text-slate-600 border-t border-slate-200 pt-6">
          &copy; 2024 Sapu Alpha. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
