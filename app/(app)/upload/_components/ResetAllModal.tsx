"use client";
// Deleting all uploaded data, behind a typed confirmation.
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { clearAllData } from "@/lib/repo";
import { createClient } from "@/lib/supabase/client";

/** Second confirmation tier for "Reset All Data" — re-verifies the admin's
 * own email + password against Supabase auth (same signInWithPassword the
 * login page uses) before wiping every table. A single confirm() dialog is
 * too cheap a gate for a whole-database delete with no undo. */
export function ResetAllModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setEmail("");
    setPassword("");
    setError("");
    setBusy(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleConfirm() {
    if (!email || !password) return;
    setBusy(true);
    setError("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email || user.email.toLowerCase() !== email.trim().toLowerCase()) {
      setError("Email tidak sesuai dengan akun yang sedang login.");
      setBusy(false);
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("Password salah.");
      setBusy(false);
      return;
    }
    clearAllData();
    handleClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Konfirmasi Reset All Data">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Ini akan menghapus <b>seluruh data CAMP</b> secara permanen. Masukkan email dan password akun Anda untuk
          melanjutkan.
        </p>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={handleClose}>
            Batal
          </Button>
          <Button variant="danger" disabled={!email || !password || busy} onClick={handleConfirm}>
            {busy ? "Memverifikasi..." : "Hapus Semua Data"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
