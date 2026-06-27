import React from "react";
import { Routes, Route } from "react-router-dom";
import Articles from "../pages/Articles";
import Stories from "../pages/Stories";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Articles />} />
      <Route path="/articles" element={<Articles />} />
      <Route path="/stories" element={<Stories />} />
    </Routes>
  );
}
