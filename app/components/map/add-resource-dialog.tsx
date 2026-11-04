import { actionErrorMessage, useActionMutation } from "@agent-native/core/client/hooks";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Capability, CapabilityMode, Confidence } from "@shared/recovery";

import { CAPABILITY_LABEL, KIND_LABEL, type MapResource } from "./map-model";

type Kind = MapResource["kind"];
type Criticality = MapResource["criticality"];

interface CapabilityDraft {
  include: boolean;
  mode: CapabilityMode;
  confidence: Confidence;
}

const INITIAL: Record<Capability, CapabilityDraft> = {
  access: { include: true, mode: "dependent", confidence: "assumed" },
  recovery: { include: false, mode: "dependent", confidence: "assumed" },
  administration: { include: false, mode: "dependent", confidence: "assumed" },
};

export function AddResourceDialog({
  open,
  onOpenChange,
  workspaceId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onCreated: (resourceId: string) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("service");
  const [criticality, setCriticality] = useState<Criticality>("critical");
  const [owner, setOwner] = useState("");
  const [caps, setCaps] = useState(INITIAL);
  const [saving, setSaving] = useState(false);
  const createResource = useActionMutation("create-resource");
  const createCapability = useActionMutation("create-capability");

  const reset = () => {
    setName("");
    setKind("service");
    setCriticality("critical");
    setOwner("");
    setCaps(INITIAL);
  };

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    let resourceId: string | null = null;
    const saved: Capability[] = [];
    try {
      const resource = await createResource.mutateAsync({
        workspaceId,
        name: name.trim(),
        kind,
        criticality,
        ...(owner.trim() ? { ownerLabel: owner.trim() } : {}),
      });
      resourceId = resource.id;
      for (const capability of Object.keys(caps) as Capability[]) {
        const draft = caps[capability];
        if (!draft.include) continue;
        await createCapability.mutateAsync({
          workspaceId,
          resourceId: resource.id,
          capability,
          mode: draft.mode,
          confidence: draft.confidence,
        });
        saved.push(capability);
      }
      const needsRoute = (Object.keys(caps) as Capability[]).some(
        (item) => caps[item].include && caps[item].mode === "dependent",
      );
      toast.success(
        needsRoute
          ? `Added ${resource.name}. Add a route for each dependent capability next.`
          : `Added ${resource.name}.`,
      );
      reset();
      onOpenChange(false);
      onCreated(resource.id);
    } catch (error) {
      const message = actionErrorMessage(error) ?? "That was not saved.";
      if (resourceId) {
        toast.error(
          `${message} The resource was added${saved.length ? ` with ${saved.join(", ")}` : " without capabilities"}.`,
        );
        onOpenChange(false);
        onCreated(resourceId);
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a resource</DialogTitle>
          <DialogDescription>
            Describe how it works today. Nothing here signs in to the service or stores a credential.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label="Name" htmlFor="resource-name">
            <Input
              id="resource-name"
              value={name}
              maxLength={120}
              placeholder="Billing platform"
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <Select value={kind} onValueChange={(value) => setKind(value as Kind)}>
                <SelectTrigger aria-label="Kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as Kind[]).map((item) => (
                    <SelectItem key={item} value={item}>
                      {KIND_LABEL[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Criticality">
              <Select value={criticality} onValueChange={(value) => setCriticality(value as Criticality)}>
                <SelectTrigger aria-label="Criticality" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["critical", "high", "medium", "low"] as const).map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Owner" htmlFor="resource-owner">
            <Input
              id="resource-owner"
              value={owner}
              maxLength={80}
              placeholder="Finance lead"
              onChange={(event) => setOwner(event.target.value)}
            />
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">
              What to record
            </legend>
            {(Object.keys(caps) as Capability[]).map((capability) => {
              const draft = caps[capability];
              const update = (patch: Partial<CapabilityDraft>) =>
                setCaps((previous) => ({ ...previous, [capability]: { ...previous[capability], ...patch } }));
              return (
                <div key={capability} className="grid grid-cols-[1fr_10rem_6.5rem] items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={draft.include}
                      onCheckedChange={(value) => update({ include: value === true })}
                    />
                    {CAPABILITY_LABEL[capability]}
                  </label>
                  <Select
                    value={draft.mode}
                    disabled={!draft.include}
                    onValueChange={(value) => update({ mode: value as CapabilityMode })}
                  >
                    <SelectTrigger aria-label={`${capability} mode`} className="h-8 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dependent">needs something</SelectItem>
                      <SelectItem value="independent">independent</SelectItem>
                      <SelectItem value="unknown">not sure</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={draft.confidence}
                    disabled={!draft.include}
                    onValueChange={(value) => update({ confidence: value as Confidence })}
                  >
                    <SelectTrigger aria-label={`${capability} confidence`} className="h-8 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="verified">verified</SelectItem>
                      <SelectItem value="assumed">assumed</SelectItem>
                      <SelectItem value="unknown">unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
            <p className="text-xs leading-5 text-muted-foreground">
              “Needs something” capabilities stay unknown until you add a route for them.
            </p>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-ink text-background hover:bg-ink/85"
              disabled={!name.trim() || saving}
            >
              {saving ? "Adding…" : "Add resource"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
