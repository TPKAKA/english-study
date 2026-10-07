"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { getStudyApiClient } from "../../lib/api/api-client.js";
import { requestDefaultPassword } from "../../lib/admin/admin-browser.js";
import ContentDialog from "../ui/content-dialog.js";

export default function DefaultPasswordSetup({ config, busy }) {
  const [enabled, setEnabled] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const locked = busy || working;
  useEffect(() => {
    let active = true;
    void requestDefaultPassword(getStudyApiClient(config)).then(result => {
      if (active) setEnabled(result.ok && result.enabled);
    });
    return () => { active = false; };
  }, [config.url, config.publishableKey]);

  async function apply() {
    if (locked) return;
    setWorking(true);
    setError("");
    try {
      const result = await requestDefaultPassword(getStudyApiClient(config), true);
      if (!result.ok) setError(result.error);
      else { setMessage("Đã áp dụng mật khẩu mặc định."); setEnabled(false); setConfirming(false); }
    } finally { setWorking(false); }
  }
  return <>
    {enabled && <button type="button" className="default-password-button" disabled={locked} onClick={() => setConfirming(true)}><KeyRound />Dùng mật khẩu mặc định</button>}
    {message && <p className="auth-message muted" role="status">{message}</p>}
    {confirming && <ContentDialog title="Đặt mật khẩu mặc định" busy={locked} onClose={() => { setConfirming(false); setError(""); }}>
      <p>Áp dụng mật khẩu từ ADMIN_PASSWORD cho tài khoản đang đăng nhập?</p>
      <p className="editor-error error-text" role="alert">{error}</p>
      <footer className="dialog-actions"><button type="button" disabled={locked} onClick={() => setConfirming(false)}>Hủy</button>
        <button type="button" className="primary-button" disabled={locked} onClick={() => void apply()}><KeyRound />{locked ? "Đang xử lý…" : "Xác nhận"}</button></footer>
    </ContentDialog>}
  </>;
}
