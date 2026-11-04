import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Capability } from "@shared/recovery";
import type { RecoveryTest, TestOutcome } from "@shared/recovery-tests";

import { CAPABILITY_LABEL, type IndexedCapability, type MapResource } from "./map-model";

const ANY_ROUTE = "__capability__";
const OUTCOME_TONE: Record<TestOutcome, string> = {
  planned: "text-muted-foreground",
  passed: "text-status-available",
  failed: "text-status-blocked",
};

function today() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function RecoveryTestsPanel({
  workspaceId,
  resource,
  capabilities,
}: {
  workspaceId: string;
  resource: MapResource;
  capabilities: IndexedCapability[];
}) {
  const tests = useActionQuery("list-recovery-tests", { workspaceId, resourceId: resource.id });
  const [editing, setEditing] = useState<"new" | RecoveryTest | null>(null);
  const list = tests.data?.tests ?? [];

  if (capabilities.length === 0) return null;

  return (
    <section className="border-b border-border px-4 py-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Recovery tests</h3>
        {editing === null ? (
          <Button variant="ghost" size="xs" onClick={() => setEditing("new")}>
            <IconPlus className="size-3" />
            Record a test
          </Button>
        ) : null}
      </div>
      {editing !== null ? (
        <TestForm
          key={editing === "new" ? "new" : editing.id}
          workspaceId={workspaceId}
          resource={resource}
          capabilities={capabilities}
          existing={editing === "new" ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : null}
      {tests.isPending ? (
        <p className="mt-2 text-xs text-muted-foreground">Loading tests…</p>
      ) : list.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No test recorded. Every route here is documented, not tested.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {list.map((test) => (
            <li key={test.id} className="border-t border-border py-2 text-xs first:border-t-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-foreground">
                  {CAPABILITY_LABEL[test.capability]}
                  {test.routeLabel ? <span className="text-muted-foreground"> · {test.routeLabel}</span> : null}
                </span>
                <span className={cn("shrink-0 font-mono text-[11px]", OUTCOME_TONE[test.outcome])}>
                  {test.outcome}
                  {test.testedOn ? ` ${test.testedOn}` : ""}
                </span>
              </div>
              <p className="mt-0.5 text-muted-foreground">
                {test.method}
                {test.testerLabel ? ` · ${test.testerLabel}` : ""}
              </p>
              {test.evidenceNotes ? <p className="mt-0.5 text-foreground/80">{test.evidenceNotes}</p> : null}
              {test.outcome === "planned" && editing === null ? (
                <Button variant="outline" size="xs" className="mt-1.5" onClick={() => setEditing(test)}>
                  Record result
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TestForm({
  workspaceId,
  resource,
  capabilities,
  existing,
  onDone,
}: {
  workspaceId: string;
  resource: MapResource;
  capabilities: IndexedCapability[];
  existing: RecoveryTest | null;
  onDone: () => void;
}) {
  const [capability, setCapability] = useState<Capability>(
    existing?.capability ?? capabilities[0]!.capability,
  );
  const [route, setRoute] = useState<string>(existing?.groupId ?? ANY_ROUTE);
  const [method, setMethod] = useState(existing?.method ?? "");
  const [tester, setTester] = useState(existing?.testerLabel ?? "");
  const [testedOn, setTestedOn] = useState(existing?.testedOn ?? today());
  const [outcome, setOutcome] = useState<TestOutcome>(existing ? "passed" : "planned");
  const [notes, setNotes] = useState(existing?.evidenceNotes ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const routes = capabilities.find((item) => item.capability === capability)?.groups ?? [];
  const isResult = outcome !== "planned";

  const options = {
    onSuccess: () => {
      toast.success(isResult ? "Result recorded." : "Test planned. Nothing is marked tested yet.");
      onDone();
    },
    onError: (error: unknown) =>
      toast.error(actionErrorMessage(error) ?? "The test was not saved."),
  };
  const record = useActionMutation("record-recovery-test", options);
  const update = useActionMutation("update-recovery-test", options);
  const pending = record.isPending || update.isPending;
  const ready = method.trim() && (!isResult || (confirmed && testedOn));

  return (
    <form
      className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-canvas p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || pending) return;
        const shared = {
          method: method.trim(),
          testerLabel: tester.trim(),
          evidenceNotes: notes.trim(),
          outcome,
          humanConfirmed: isResult ? confirmed : false,
          ...(isResult || testedOn ? { testedOn: isResult ? testedOn : "" } : {}),
        };
        if (existing) {
          update.mutate({ testId: existing.id, ...shared });
        } else {
          record.mutate({
            workspaceId,
            resourceId: resource.id,
            capability,
            ...(route !== ANY_ROUTE ? { groupId: route } : {}),
            ...shared,
          });
        }
      }}
    >
      {!existing ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Capability">
            <Select
              value={capability}
              onValueChange={(value) => {
                setCapability(value as Capability);
                setRoute(ANY_ROUTE);
              }}
            >
              <SelectTrigger aria-label="Capability tested" className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {capabilities.map((item) => (
                  <SelectItem key={item.capability} value={item.capability}>
                    {CAPABILITY_LABEL[item.capability]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Route">
            <Select value={route} onValueChange={setRoute} disabled={routes.length === 0}>
              <SelectTrigger aria-label="Route tested" className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_ROUTE}>Whole capability</SelectItem>
                {routes.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {CAPABILITY_LABEL[existing.capability]}
          {existing.routeLabel ? ` · ${existing.routeLabel}` : ""}
        </p>
      )}
      <Field label="Method" htmlFor="test-method">
        <Input
          id="test-method"
          value={method}
          maxLength={240}
          placeholder="Sign in from a clean browser using only the hardware key"
          className="h-8 text-xs"
          onChange={(event) => setMethod(event.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Outcome">
          <Select value={outcome} onValueChange={(value) => setOutcome(value as TestOutcome)}>
            <SelectTrigger aria-label="Outcome" className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {!existing ? <SelectItem value="planned">Planned</SelectItem> : null}
              <SelectItem value="passed">Passed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Tested on" htmlFor="test-date">
          <Input
            id="test-date"
            type="date"
            value={testedOn}
            max={today()}
            disabled={!isResult}
            className="h-8 text-xs"
            onChange={(event) => setTestedOn(event.target.value)}
          />
        </Field>
      </div>
      <Field label="Tester" htmlFor="test-tester">
        <Input
          id="test-tester"
          value={tester}
          maxLength={80}
          placeholder="Backup administrator"
          className="h-8 text-xs"
          onChange={(event) => setTester(event.target.value)}
        />
      </Field>
      <Field label="Evidence" htmlFor="test-notes">
        <Textarea
          id="test-notes"
          value={notes}
          maxLength={1000}
          rows={2}
          placeholder="What you saw. No codes or passwords."
          className="text-xs"
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      {isResult ? (
        <label className="flex items-start gap-2 text-xs leading-5 text-foreground">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(value) => setConfirmed(value === true)}
            className="mt-0.5"
          />
          I performed or watched this test. The agent cannot record a result for me.
        </label>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          className="flex-1 bg-ink text-background hover:bg-ink/85"
          disabled={!ready || pending}
        >
          {pending ? "Saving…" : isResult ? "Record result" : "Plan test"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
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
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={htmlFor} className="text-[11px] font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
