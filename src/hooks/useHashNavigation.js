import { useEffect, useRef, useState } from "react";

const pages = new Set(["home", "calendar", "report", "books", "book-edit", "mistakes", "solve", "grading"]);

function readRoute() {
  if (typeof window === "undefined") return { page: "home", sessionId: "", editingBookId: "" };
  const [page = "home", sessionId = "", editingBookId = ""] = window.location.hash
    .replace(/^#\/?/, "")
    .split("/")
    .map((part) => decodeURIComponent(part));
  return { page: pages.has(page) ? page : "home", sessionId: sessionId === "_" ? "" : sessionId, editingBookId };
}

function routeHash(route) {
  const parts = [route.page];
  if (route.sessionId || route.editingBookId) parts.push(route.sessionId || "_");
  if (route.editingBookId) parts.push(route.editingBookId);
  return `#/${parts.map((part) => encodeURIComponent(part)).join("/")}`;
}

export default function useHashNavigation() {
  const [route, setRoute] = useState(readRoute);
  const routeRef = useRef(routeHash(route));
  const readyRef = useRef(false);

  useEffect(() => {
    function onPopState() {
      const next = readRoute();
      routeRef.current = routeHash(next);
      setRoute(next);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const nextHash = routeHash(route);
    if (!readyRef.current) {
      window.history.replaceState(route, "", nextHash);
      routeRef.current = nextHash;
      readyRef.current = true;
      return;
    }
    if (routeRef.current === nextHash) return;
    window.history.pushState(route, "", nextHash);
    routeRef.current = nextHash;
  }, [route]);

  const setPage = (page) => setRoute((current) => ({ ...current, page, sessionId: page === "solve" || page === "grading" ? current.sessionId : "" }));
  const setSessionId = (sessionId) => setRoute((current) => ({ ...current, sessionId }));
  const setEditingBookId = (editingBookId) => setRoute((current) => ({ ...current, editingBookId }));

  return { page: route.page, setPage, sessionId: route.sessionId, setSessionId, editingBookId: route.editingBookId, setEditingBookId };
}
