import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Send, Copy, Check } from "lucide-react";
import { useState } from "react";

export function TelegramConnectModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  const code = "AISR-3F92-8KQ1";

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-4 text-[#229ED9]" />
            Connect Telegram
          </DialogTitle>
          <DialogDescription>Three quick steps to link your account to the bot.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="size-6 rounded-full bg-[var(--brand-blue-deep)] text-foreground flex items-center justify-center text-xs font-medium shrink-0">1</span>
            <div>
              Open Telegram and search for{" "}
              <a href="https://t.me/AISignalRadarBot" target="_blank" rel="noreferrer" className="text-[var(--brand-cyan)] underline">
                @AISignalRadarBot
              </a>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="size-6 rounded-full bg-[var(--brand-blue-deep)] text-foreground flex items-center justify-center text-xs font-medium shrink-0">2</span>
            <div>Send the command <code className="px-1.5 py-0.5 rounded bg-secondary text-foreground text-xs">/start</code></div>
          </li>
          <li className="flex gap-3">
            <span className="size-6 rounded-full bg-[var(--brand-blue-deep)] text-foreground flex items-center justify-center text-xs font-medium shrink-0">3</span>
            <div className="flex-1">
              Paste your pairing code in chat:
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-md bg-secondary text-foreground font-mono text-sm">{code}</code>
                <button
                  onClick={copy}
                  className="size-9 rounded-md bg-secondary hover:bg-secondary/70 flex items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                </button>
              </div>
            </div>
          </li>
        </ol>
        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          Code expires in 10 minutes. You'll receive a confirmation message once linked.
        </p>
      </DialogContent>
    </Dialog>
  );
}
