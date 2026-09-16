"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Client, Website } from "../../lib/api";

function shortName(name: string) {
  return name.split(/\s+[—–-]\s+/)[0]?.trim() || name;
}

export default function ClientWebsiteSwitcher({
  clients,
  selectedClient,
  websites,
  selectedWebsite,
  selectClient,
  selectWebsite,
}: {
  clients: Client[];
  selectedClient: Client | null;
  websites: Website[];
  selectedWebsite: Website | null;
  selectClient: (id: number) => void | Promise<unknown>;
  selectWebsite: (id: number) => void | Promise<unknown>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((c) => {
      const hay = `${c.name} ${c.website_url || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [clients, q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  return (
    <div className="workspace-switcher topbar-context-switcher" ref={wrapRef}>
      <span className="workspace-avatar">
        {(selectedClient?.name || "C").slice(0, 1).toUpperCase()}
      </span>
      <div className="topbar-context-fields">
        <label className="client-search-label">
          <span className="topbar-context-label">Client</span>
          <button
            type="button"
            className="client-search-trigger"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="client-search-value">
              {selectedClient
                ? shortName(selectedClient.name)
                : "Search clients…"}
            </span>
            <span className="client-search-caret" aria-hidden>
              ▾
            </span>
          </button>
          {open && (
            <div className="client-search-panel" role="listbox">
              <input
                ref={inputRef}
                className="client-search-input"
                type="search"
                placeholder="Search clients…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "Enter" && filtered[0]) {
                    selectClient(filtered[0].id);
                    setOpen(false);
                  }
                }}
              />
              <button
                type="button"
                className="client-search-option muted"
                onClick={() => {
                  setOpen(false);
                  router.push("/clients");
                }}
              >
                All clients…
              </button>
              <div className="client-search-list">
                {filtered.length === 0 ? (
                  <div className="client-search-empty">No matches</div>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={c.id === selectedClient?.id}
                      className={`client-search-option${
                        c.id === selectedClient?.id ? " selected" : ""
                      }`}
                      onClick={() => {
                        selectClient(c.id);
                        setOpen(false);
                      }}
                    >
                      <strong>{shortName(c.name)}</strong>
                      <small>{c.website_url}</small>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </label>
        {selectedClient && websites.length > 0 && (
          <label>
            <span className="topbar-context-label">Website</span>
            {websites.length === 1 ? (
              <span
                className="topbar-context-static"
                title={selectedWebsite?.url || ""}
              >
                {selectedWebsite?.url || selectedWebsite?.name || "—"}
              </span>
            ) : (
              <select
                aria-label="Switch website"
                value={selectedWebsite?.id || ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id) selectWebsite(id);
                }}
              >
                {websites.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
          </label>
        )}
      </div>
    </div>
  );
}
