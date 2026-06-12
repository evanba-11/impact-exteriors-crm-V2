import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DAY } from "@/lib/format";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import type { Vendor } from "@shared/schema";

function insuranceStatus(expiry: number | null) {
  if (!expiry) return { label: "No COI", cls: "bg-red-500/15 text-red-700 dark:text-red-300", Icon: ShieldX };
  const days = (expiry - Date.now()) / DAY;
  if (days < 0) return { label: "Expired", cls: "bg-red-500/15 text-red-700 dark:text-red-300", Icon: ShieldX };
  if (days < 30) return { label: `Expires in ${Math.ceil(days)}d`, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300", Icon: ShieldAlert };
  return { label: "Active", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", Icon: ShieldCheck };
}

export default function Vendors() {
  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({ queryKey: ["/api/vendors"] });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiRequest("PATCH", `/api/vendors/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/flags"] });
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Vendors & Subs" subtitle="Compliance — W-9, 1099, and certificate of insurance status" />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading vendors…</div>
        ) : vendors.length === 0 ? (
          <EmptyState title="No vendors yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Trade</TableHead>
                <TableHead className="text-center">W-9</TableHead>
                <TableHead className="text-center">1099</TableHead>
                <TableHead>Insurance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((v) => {
                const st = insuranceStatus(v.insuranceExpiry);
                return (
                  <TableRow key={v.id} data-testid={`row-vendor-${v.id}`}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell><Badge variant="secondary" className="font-normal">{v.trade}</Badge></TableCell>
                    <TableCell className="text-center">
                      <Switch checked={v.hasW9} onCheckedChange={(c) => patch.mutate({ id: v.id, body: { hasW9: c } })} data-testid={`switch-w9-${v.id}`} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={v.is1099} onCheckedChange={(c) => patch.mutate({ id: v.id, body: { is1099: c } })} data-testid={`switch-1099-${v.id}`} />
                    </TableCell>
                    <TableCell>
                      <Badge className={`font-normal gap-1 ${st.cls}`} data-testid={`status-insurance-${v.id}`}>
                        <st.Icon className="h-3 w-3" /> {st.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
