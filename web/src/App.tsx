import React from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import AppRoutes from "./components/AppRoutes";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300">
      <Header />

      <main id="main" className="flex-1">
        <AppRoutes />
      </main>

      <Footer />
    </div>
  );
}
