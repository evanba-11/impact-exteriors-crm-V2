import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Link2, Copy, ExternalLink } from "lucide-react";

/* Placeholder payment-link integration (Update 7). Generates a deterministic
   URL; no real send. Copy / open-in-new-tab supported. */
export function paymentUrl(invoiceId: number) {
  return `https://pay.impactexteriors.com/i/${invoiceId}`;
}

export function PaymentLinkDialog({ invoiceId, trigger }: { invoiceId: number; trigger?: React.ReactNode }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const url = paymentUrl(invoiceId);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    toast({ title: "Payment link copied", description: "Placeholder link copied to clipboard." });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`button-payment-link-${invoiceId}`}>
            <Link2 className="h-3.5 w-3.5 mr-1" /> Send Payment Link
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Send Payment Link</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Share this secure payment link with the customer. (Integration pending — placeholder link.)
          </p>
          <div className="flex gap-2">
            <Input readOnly value={url} className="text-xs" data-testid="input-payment-url" />
            <Button size="icon" variant="outline" onClick={copy} data-testid="button-copy-payment"><Copy className="h-4 w-4" /></Button>
            <Button size="icon" variant="outline" onClick={() => window.open(url, "_blank")} data-testid="button-open-payment"><ExternalLink className="h-4 w-4" /></Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button onClick={copy}><Copy className="h-4 w-4 mr-1.5" /> Copy Link</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
