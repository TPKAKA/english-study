"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export default function ContentDialog({ title, busy, onClose, children }) {
  const ref = useRef(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className="content-dialog" aria-labelledby={headingId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="dialog-header"><h2 id={headingId}>{title}</h2>
      <button type="button" className="icon-button" title="Đóng" aria-label="Đóng" disabled={busy} onClick={onClose}><X /></button>
    </header>{children}
  </dialog>;
}
