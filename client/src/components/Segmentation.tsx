// Update 6: Segmentation & Details dropdown block, used on the New Opportunity
// dialog and on the full-page Opportunity detail (editable).
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Building2, Hammer, Home, Flag, Wrench, MapPin, Megaphone, FileSignature,
} from "lucide-react";
import {
  SEG_DEPARTMENT, SEG_WORK_TYPE, SEG_CLASSIFICATION, SEG_PRIORITY,
  SEG_SERVICE_TYPE, SEG_LOCATION, SEG_LEAD_SOURCE, SEG_BID_TYPE,
} from "@shared/schema";

export type SegValues = {
  department?: string | null;
  workType?: string | null;
  classification?: string | null;
  priority?: string | null;
  serviceType?: string | null;
  location?: string | null;
  leadSource?: string | null;
  bidType?: string | null;
};

const ALL_FIELDS: { key: keyof SegValues; label: string; icon: any; opts: readonly string[]; required?: boolean }[] = [
  { key: "department", label: "Department", icon: Building2, opts: SEG_DEPARTMENT, required: true },
  { key: "workType", label: "Work Type", icon: Hammer, opts: SEG_WORK_TYPE },
  { key: "classification", label: "Classification", icon: Home, opts: SEG_CLASSIFICATION },
  { key: "priority", label: "Priority", icon: Flag, opts: SEG_PRIORITY },
  { key: "serviceType", label: "Service Type", icon: Wrench, opts: SEG_SERVICE_TYPE },
  { key: "location", label: "Location", icon: MapPin, opts: SEG_LOCATION },
  { key: "leadSource", label: "Lead Source", icon: Megaphone, opts: SEG_LEAD_SOURCE },
  { key: "bidType", label: "Bid Type", icon: FileSignature, opts: SEG_BID_TYPE },
];

export function SegmentationBlock({
  values, onChange, columns = 3,
}: { values: SegValues; onChange: (v: SegValues) => void; columns?: 2 | 3 }) {
  const grid = columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={`grid ${grid} gap-3`} data-testid="segmentation-block">
      {ALL_FIELDS.map((f) => {
        const v = values[f.key] || "";
        const missing = f.required && !v;
        return (
          <div key={f.key} className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs">
              <f.icon className="w-3.5 h-3.5 text-muted-foreground" /> {f.label}
              {f.required && <span className="text-red-500">*</span>}
            </Label>
            <Select value={v} onValueChange={(val) => onChange({ ...values, [f.key]: val })}>
              <SelectTrigger
                className={missing ? "border-red-500/60" : ""}
                data-testid={`select-seg-${f.key}`}
              >
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {f.opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}
