import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useApp } from "@/lib/app-context";
import { CheckCircle2, AlertTriangle, MapPin, Loader2 } from "lucide-react";
import { validateAddress, type ValidatedAddress } from "@/lib/google-integration";

/**
 * Address input with Google validation. On "Validate" (or blur) it canonicalizes the
 * address and surfaces a verdict inline. Accepting the result snapshots canonical
 * fields into the parent form via onValidated. Low-confidence results show a warning
 * but never block saving (the parent may still allow "save anyway").
 */
export default function AddressValidationField({
  value, onChange, onValidated,
}: {
  value: string;
  onChange: (v: string) => void;
  onValidated: (fields: Partial<{
    address: string;
    addressLine1: string | null; addressLine2: string | null;
    city: string | null; state: string | null; postalCode: string | null; country: string | null;
    formattedAddress: string; placeId: string | null;
    latitude: number | null; longitude: number | null;
    googleMapsUrl: string; addressVerified: boolean;
    addressValidationResponse: string;
  }>) => void;
}) {
  const { user } = useApp();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ValidatedAddress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const addr = value.trim();
    if (!addr) return;
    setBusy(true); setError(null);
    try {
      const r = await validateAddress(addr, user?.id);
      setResult(r);
    } catch (e: any) {
      setError(e.message || "Validation failed");
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    if (!result) return;
    onChange(result.formattedAddress);
    onValidated({
      address: result.formattedAddress,
      addressLine1: result.addressLine1, addressLine2: result.addressLine2,
      city: result.city, state: result.state, postalCode: result.postalCode, country: result.country,
      formattedAddress: result.formattedAddress, placeId: result.placeId,
      latitude: result.latitude, longitude: result.longitude,
      googleMapsUrl: result.googleMapsUrl, addressVerified: true,
      addressValidationResponse: JSON.stringify(result),
    });
  };

  const conf = result?.confidence;
  const confColor =
    conf === "high" ? "text-emerald-600 dark:text-emerald-400"
    : conf === "medium" ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400";

  return (
    <div className="space-y-1.5">
      <Label>Address</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => { onChange(e.target.value); setResult(null); }}
          onBlur={() => { if (value.trim() && !result) run(); }}
          data-testid="input-address"
          placeholder="123 Main St, Greeley, CO"
        />
        <Button type="button" size="sm" variant="outline" onClick={run} disabled={busy || !value.trim()} data-testid="button-validate-address">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
          <span className="ml-1.5 hidden sm:inline">Validate</span>
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-500" data-testid="address-validation-error">
          <AlertTriangle className="w-3.5 h-3.5" /> {error} — you can still save.
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-border bg-card p-2.5 space-y-1.5 text-sm" data-testid="address-validation-result">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${confColor}`}>
            {conf === "high" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {conf === "high" ? "Verified" : conf === "medium" ? "Likely match — please confirm" : "Low confidence — please confirm"}
            <span className="text-muted-foreground font-normal">({result.source === "geocoding" ? "geocoded" : "validated"})</span>
          </div>
          <div className="text-muted-foreground">{result.formattedAddress}</div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={accept} data-testid="button-accept-address">Use this address</Button>
            <a href={result.googleMapsUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
              Preview on Google Maps
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
